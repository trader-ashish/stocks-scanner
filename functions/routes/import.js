const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const stream = require('stream');
const { db, clearCache } = require('../db');
const sectorMappings = require('../sector_mappings.json');

const upload = multer({ storage: multer.memoryStorage() });

// Helper: parse Indian number format "1,23,456.78" → 123456.78
function parseIndianNum(str) {
    if (!str || str === '-' || str === '') return null;
    const cleaned = str.replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

// Helper: parse volume
function parseVolume(str) {
    if (!str || str === '-' || str === '') return null;
    const cleaned = str.replace(/,/g, '').trim();
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
}

// POST /api/import/csv
router.post('/csv', upload.single('csvFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const fileName = req.file.originalname;
    const records = [];

    try {
        // Extract import date from filename (e.g. MW-NIFTY-500-06-Jul-2026.csv)
        let importDate = new Date().toISOString().split('T')[0];
        const dateMatch = fileName.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/);
        if (dateMatch) {
            const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                             Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
            importDate = `${dateMatch[3]}-${months[dateMatch[2]]}-${dateMatch[1]}`;
        }

        // Parse CSV from buffer
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        await new Promise((resolve, reject) => {
            bufferStream
                .pipe(csv({
                    mapHeaders: ({ header }) => header.trim(),
                    skipLines: 0
                }))
                .on('data', (row) => {
                    const symbol = (row['SYMBOL'] || '').replace(/"/g, '').trim();
                    if (!symbol || symbol === 'NIFTY 500' || symbol.startsWith('NIFTY')) return;

                    const sector = sectorMappings[symbol] || 'Others';

                    records.push({
                        Symbol:    symbol,
                        Open:      parseIndianNum(row['OPEN']),
                        High:      parseIndianNum(row['HIGH']),
                        Low:       parseIndianNum(row['LOW']),
                        PrevClose: parseIndianNum(row['PREV. CLOSE']),
                        LTP:       parseIndianNum(row['LTP']),
                        Change:    parseIndianNum(row['CHANGE']),
                        PctChange: parseIndianNum(row['% CHANGE']),
                        Volume:    parseVolume(row['VOLUME (shares)']),
                        Value:     parseIndianNum(row['VALUE (Crores)']),
                        High52W:   parseIndianNum(row['52W H']),
                        Low52W:    parseIndianNum(row['52W L']),
                        Chng30D:   parseIndianNum(row['30 D %CHNG']),
                        Chng365D:  parseIndianNum(row['365 D %CHNG']),
                        Sector:    sector,
                        ImportDate: importDate
                    });
                })
                .on('end', resolve)
                .on('error', reject);
        });

        if (records.length === 0) {
            return res.status(400).json({ error: 'No valid stock records found in CSV' });
        }

        // Write NiftyStocks to Firestore 'imports' document [importDate]
        await db.collection('imports').doc(importDate).set({
            date: importDate,
            stocks: records
        });

        // Log import
        await db.collection('import_logs').add({
            FileName: fileName,
            ImportDate: importDate,
            RecordCount: records.length,
            ImportedAt: new Date().toISOString(),
            Status: 'Success'
        });

        clearCache(importDate);

        res.json({
            success: true,
            message: `✅ ${records.length} stocks imported successfully for ${importDate}`,
            importDate,
            count: records.length
        });

    } catch (err) {
        console.error('Import error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/import/dates - all available import dates
router.get('/dates', async (req, res) => {
    try {
        const snap = await db.collection('imports').get();
        const dates = snap.docs.map(doc => {
            const data = doc.data();
            return {
                ImportDate: doc.id,
                StockCount: (data.stocks || []).length
            };
        });
        
        // Sort dates descending
        dates.sort((a, b) => b.ImportDate.localeCompare(a.ImportDate));
        res.json(dates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/import/logs
router.get('/logs', async (req, res) => {
    try {
        const snap = await db.collection('import_logs').orderBy('ImportedAt', 'desc').limit(20).get();
        const logs = snap.docs.map(doc => {
            const data = doc.data();
            return {
                Id: doc.id,
                FileName: data.FileName,
                ImportDate: data.ImportDate,
                RecordCount: data.RecordCount,
                ImportedAt: data.ImportedAt,
                Status: data.Status
            };
        });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/import/auto-fetch
router.post('/auto-fetch', async (req, res) => {
    try {
        const YahooFinance = require('yahoo-finance2').default;
        const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

        // Get latest import to extract symbols
        const snap = await db.collection('imports').get();
        if (snap.empty) {
            return res.status(400).json({ error: 'No existing stock records found to update.' });
        }

        // Sort documents by date descending to get the latest
        const docs = snap.docs;
        docs.sort((a, b) => b.id.localeCompare(a.id));
        const latestDoc = docs[0];
        const latestData = latestDoc.data();
        const latestStocks = latestData.stocks || [];

        if (latestStocks.length === 0) {
            return res.status(400).json({ error: 'No existing symbols found in latest import.' });
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const updatedRecords = [];
        let updated = 0;
        let errors = 0;

        // Use batches of 10 to fetch gracefully
        const BATCH_SIZE = 10;
        for (let i = 0; i < latestStocks.length; i += BATCH_SIZE) {
            const batch = latestStocks.slice(i, i + BATCH_SIZE);
            const promises = batch.map(async (stock) => {
                try {
                    const sym = stock.Symbol;
                    const yfSymbol = sym + '.NS';
                    const quote = await yf.quote(yfSymbol).catch((err) => {
                        console.log(`Failed for ${yfSymbol}:`, err.message);
                        return null;
                    });
                    if (!quote) {
                        // Keep old stock record as fallback
                        updatedRecords.push({ ...stock, ImportDate: todayStr });
                        return;
                    }

                    const ltp = quote.regularMarketPrice || 0;
                    const vol = quote.regularMarketVolume || 0;
                    const valueCr = (ltp * vol) / 10000000;
                    const prevClose = quote.regularMarketPreviousClose || ltp;
                    const change = ltp - prevClose;
                    const pctChange = quote.regularMarketChangePercent || 0;
                    const open = quote.regularMarketOpen || ltp;
                    const high = quote.regularMarketDayHigh || ltp;
                    const low = quote.regularMarketDayLow || ltp;
                    const high52 = quote.fiftyTwoWeekHigh || ltp;
                    const low52 = quote.fiftyTwoWeekLow || ltp;
                    const sma50 = quote.fiftyDayAverage || null;
                    const sma200 = quote.twoHundredDayAverage || null;

                    updatedRecords.push({
                        Symbol: sym,
                        Open: open,
                        High: high,
                        Low: low,
                        PrevClose: prevClose,
                        LTP: ltp,
                        Change: change,
                        PctChange: pctChange,
                        Volume: vol,
                        Value: valueCr,
                        High52W: high52,
                        Low52W: low52,
                        Chng30D: stock.Chng30D || 0,
                        Chng365D: stock.Chng365D || 0,
                        Sector: stock.Sector || 'Others',
                        ImportDate: todayStr,
                        SMA50: sma50,
                        SMA200: sma200
                    });
                    updated++;
                } catch (e) {
                    errors++;
                }
            });
            await Promise.all(promises);
            await new Promise(r => setTimeout(r, 200));
        }

        // Save updated records in Firestore 'imports' document [todayStr]
        await db.collection('imports').doc(todayStr).set({
            date: todayStr,
            stocks: updatedRecords
        });

        // Log import
        await db.collection('import_logs').add({
            FileName: 'Yahoo Finance Auto-Fetch',
            ImportDate: todayStr,
            RecordCount: updated,
            ImportedAt: new Date().toISOString(),
            Status: 'Success'
        });

        clearCache(todayStr);

        res.json({ message: 'Auto-fetch complete', updated, errors, date: todayStr });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
