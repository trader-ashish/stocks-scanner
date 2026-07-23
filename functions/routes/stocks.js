const express = require('express');
const router = express.Router();
const { db, getStocksForDate } = require('../db');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function resolveDate(dateQuery) {
    if (dateQuery && dateQuery !== 'Latest') return dateQuery;
    const snap = await db.collection('imports').get();
    if (snap.empty) return new Date().toISOString().split('T')[0];
    const ids = snap.docs.map(doc => doc.id);
    ids.sort((a, b) => b.localeCompare(a));
    return ids[0];
}

// GET /api/stocks/summary
router.get('/summary', async (req, res) => {
    try {
        const date = await resolveDate(req.query.date);
        const stocks = await getStocksForDate(date);
        
        let TotalStocks = stocks.length;
        let Gainers = 0;
        let Losers = 0;
        let Unchanged = 0;
        let TotalValue = 0;
        let sumPct = 0;

        stocks.forEach(s => {
            const pct = s.PctChange || 0;
            if (pct > 0) Gainers++;
            else if (pct < 0) Losers++;
            else Unchanged++;
            TotalValue += (s.Value || 0);
            sumPct += pct;
        });

        res.json({
            TotalStocks,
            Gainers,
            Losers,
            Unchanged,
            TotalValue,
            AvgPctChange: TotalStocks > 0 ? (sumPct / TotalStocks) : 0
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/stocks/top-gainers
router.get('/top-gainers', async (req, res) => {
    try {
        const date = await resolveDate(req.query.date);
        const limit = parseInt(req.query.limit) || 10;
        const stocks = await getStocksForDate(date);
        
        const sorted = [...stocks].sort((a, b) => (b.PctChange || 0) - (a.PctChange || 0));
        res.json(sorted.slice(0, limit));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/stocks/top-losers
router.get('/top-losers', async (req, res) => {
    try {
        const date = await resolveDate(req.query.date);
        const limit = parseInt(req.query.limit) || 10;
        const stocks = await getStocksForDate(date);
        
        const sorted = [...stocks].sort((a, b) => (a.PctChange || 0) - (b.PctChange || 0));
        res.json(sorted.slice(0, limit));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/stocks/sectors
router.get('/sectors', async (req, res) => {
    try {
        const date = await resolveDate(req.query.date);
        const stocks = await getStocksForDate(date);
        
        const sectorsMap = {};
        stocks.forEach(s => {
            const sec = s.Sector || 'Others';
            if (!sectorsMap[sec]) {
                sectorsMap[sec] = { Sector: sec, StockCount: 0, sumPct: 0, TotalValue: 0, Gainers: 0, Losers: 0, MaxGain: -999, MaxLoss: 999 };
            }
            const item = sectorsMap[sec];
            const pct = s.PctChange || 0;
            item.StockCount++;
            item.sumPct += pct;
            item.TotalValue += (s.Value || 0);
            if (pct > 0) item.Gainers++;
            if (pct < 0) item.Losers++;
            if (pct > item.MaxGain) item.MaxGain = pct;
            if (pct < item.MaxLoss) item.MaxLoss = pct;
        });

        const result = Object.values(sectorsMap).map(sec => ({
            Sector: sec.Sector,
            StockCount: sec.StockCount,
            AvgPctChange: parseFloat((sec.sumPct / sec.StockCount).toFixed(2)),
            TotalValue: parseFloat(sec.TotalValue.toFixed(2)),
            Gainers: sec.Gainers,
            Losers: sec.Losers,
            MaxGain: sec.MaxGain === -999 ? 0 : sec.MaxGain,
            MaxLoss: sec.MaxLoss === 999 ? 0 : sec.MaxLoss
        }));

        result.sort((a, b) => b.AvgPctChange - a.AvgPctChange);
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

let indicesCache = null;
let indicesCacheTime = 0;
const CACHE_DURATION = 120 * 1000; // 2 minutes

const globalSymbols = {
    'S&P 500': '^GSPC',
    'Nasdaq': '^IXIC',
    'Dow Jones': '^DJI',
    'FTSE 100': '^FTSE',
    'DAX': '^GDAXI',
    'Nikkei 225': '^N225',
    'Hang Seng': '^HSI',
    'Gold': 'GC=F',
    'Silver': 'SI=F',
    'Crude Oil': 'CL=F'
};

let lastSuccessfulGiftNifty = { 
    success: true, 
    symbol: 'GIFT NIFTY', 
    name: 'GIFT Nifty', 
    price: 24239, 
    change: -12.5, 
    changePercent: -0.05, 
    open: 24274.5, 
    high: 24275.5, 
    low: 24202.5, 
    quotes: [] 
};

async function getGiftNifty() {
    try {
        const response = await fetch('https://www.niftytrader.in/gift-nifty-live', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const nextDataIndex = html.indexOf('__NEXT_DATA__');
        if (nextDataIndex !== -1) {
            const startStr = '>';
            const endStr = '</script>';
            const jsonStart = html.indexOf(startStr, nextDataIndex) + 1;
            const jsonEnd = html.indexOf(endStr, jsonStart);
            const jsonText = html.substring(jsonStart, jsonEnd);
            const data = JSON.parse(jsonText);
            const giftData = data.props.pageProps.initialGiftData;
            
            let chartQuotes = [];
            if (giftData.chart_data && giftData.chart_time) {
                const prices = giftData.chart_data.split(',').map(Number);
                const times = giftData.chart_time.split(',');
                chartQuotes = prices.map((price, idx) => ({
                    time: times[idx] || '',
                    close: price
                }));
            }

            const result = {
                success: true,
                symbol: 'GIFT NIFTY',
                name: 'GIFT Nifty',
                price: giftData.last_trade_price || giftData.close,
                change: giftData.change_value,
                changePercent: giftData.change_per,
                open: giftData.open,
                high: giftData.high,
                low: giftData.low,
                quotes: chartQuotes.slice(-30),
                lastUpdated: giftData.created_at
            };
            
            lastSuccessfulGiftNifty = result;
            return result;
        }
    } catch (e) {
        console.error("Error fetching Gift Nifty:", e.message);
    }
    return lastSuccessfulGiftNifty;
}

// GET /api/stocks/indices
router.get('/indices', async (req, res) => {
    try {
        const now = Date.now();
        if (indicesCache && (now - indicesCacheTime < CACHE_DURATION)) {
            return res.json(indicesCache);
        }

        const date2 = new Date();
        const date1 = new Date();
        date1.setDate(date1.getDate() - 5);
        
        const opts = {
            period1: date1.toISOString().split('T')[0],
            period2: date2.toISOString().split('T')[0],
            interval: '15m'
        };

        const globalOpts = {
            period1: date1.toISOString().split('T')[0],
            period2: date2.toISOString().split('T')[0],
            interval: '30m'
        };

        const [nifty, banknifty, giftnifty, ...globalResults] = await Promise.all([
            yf.chart('^NSEI', opts).catch(() => null),
            yf.chart('^NSEBANK', opts).catch(() => null),
            getGiftNifty(),
            ...Object.entries(globalSymbols).map(async ([name, sym]) => {
                try {
                    const res = await yf.chart(sym, globalOpts).catch(() => null);
                    if (res && res.meta) {
                        const ltp = res.meta.regularMarketPrice;
                        const prev = res.meta.previousClose;
                        const change = ltp - prev;
                        const pct = prev > 0 ? (change / prev * 100) : 0;
                        return {
                            name,
                            symbol: sym,
                            success: true,
                            price: ltp,
                            change,
                            changePercent: pct,
                            previousClose: prev,
                            quotes: res.quotes ? res.quotes.map(q => ({ close: q.close })).slice(-30) : []
                        };
                    }
                } catch(e) {
                    console.error(`Error fetching global index ${sym}:`, e.message);
                }
                return { name, symbol: sym, success: false, price: 0, change: 0, changePercent: 0, quotes: [] };
            })
        ]);

        const responseData = {
            nifty: nifty && nifty.quotes ? nifty.quotes.slice(-30) : [],
            niftyMeta: nifty ? nifty.meta : null,
            banknifty: banknifty && banknifty.quotes ? banknifty.quotes.slice(-30) : [],
            bankniftyMeta: banknifty ? banknifty.meta : null,
            giftnifty,
            global: globalResults
        };

        indicesCache = responseData;
        indicesCacheTime = now;

        res.json(responseData);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/stocks
router.get('/', async (req, res) => {
    try {
        const date = await resolveDate(req.query.date);
        let stocks = await getStocksForDate(date);

        if (req.query.sector && req.query.sector !== 'All Sectors') {
            stocks = stocks.filter(s => s.Sector === req.query.sector);
        }

        let sortCol = req.query.sort || 'Value';
        let sortOrder = req.query.order === 'ASC' ? 'ASC' : 'DESC';
        const allowedSorts = ['Value', 'Volume', 'PctChange', 'Change', 'LTP', 'Symbol'];
        if (!allowedSorts.includes(sortCol)) sortCol = 'Value';

        stocks.sort((a, b) => {
            let valA = a[sortCol];
            let valB = b[sortCol];
            
            if (typeof valA === 'string') {
                return sortOrder === 'ASC' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            
            valA = valA || 0;
            valB = valB || 0;
            return sortOrder === 'ASC' ? valA - valB : valB - valA;
        });

        res.json({ stocks, total: stocks.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/stocks/:symbol/history
router.get('/:symbol/history', async (req, res) => {
    try {
        let symbol = req.params.symbol.trim();
        const rawSymbol = symbol;
        if (!symbol.includes('.')) {
            symbol = symbol + '.NS';
        }

        const tf = (req.query.tf || req.query.timeframe || '1D').toUpperCase();
        let interval = '1d';
        let period1 = new Date();
        const isIntraday = (tf === '5M' || tf === '15M');

        if (tf === '5M') {
            interval = '5m';
            period1.setDate(period1.getDate() - 5);
        } else if (tf === '15M') {
            interval = '15m';
            period1.setDate(period1.getDate() - 14);
        } else if (tf === '1W') {
            interval = '1wk';
            period1.setFullYear(period1.getFullYear() - 1);
        } else {
            interval = '1d';
            period1.setMonth(period1.getMonth() - 6);
        }

        const queryOptions = {
            period1: period1.toISOString().split('T')[0],
            period2: new Date().toISOString().split('T')[0],
            interval: interval
        };

        const result = await yf.chart(symbol, queryOptions);
        
        const labels = [];
        const prices = [];
        const candles = [];
        
        if (result && result.quotes) {
            result.quotes.forEach(row => {
                if (row.close == null || isNaN(row.close)) return;
                const d = new Date(row.date);
                const dtStr = d.toISOString().split('T')[0];
                
                // For intraday (5m, 15m), use Unix timestamp in seconds; for daily/weekly use YYYY-MM-DD string
                const timeVal = isIntraday ? Math.floor(d.getTime() / 1000) : dtStr;

                labels.push(isIntraday ? `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}` : `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`);
                prices.push(row.close);
                candles.push({
                    time: timeVal,
                    open: row.open ?? row.close,
                    high: row.high ?? row.close,
                    low: row.low ?? row.close,
                    close: row.close,
                    volume: row.volume || 0
                });
            });
        }

        res.json({
            success: true,
            symbol: rawSymbol,
            labels,
            prices,
            candles,
            tf
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
