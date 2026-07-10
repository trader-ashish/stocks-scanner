const express = require('express');
const router = express.Router();
const { db, getStocksForDate } = require('../db');
const { authMiddleware } = require('./auth');

// GET /api/fundamentals - list all
router.get('/', async (req, res) => {
    try {
        // Find latest import date
        const snapImports = await db.collection('imports').get();
        let latestStocks = [];
        if (!snapImports.empty) {
            const ids = snapImports.docs.map(doc => doc.id);
            ids.sort((a, b) => b.localeCompare(a));
            const latestDate = ids[0];
            latestStocks = await getStocksForDate(latestDate);
        }
        
        const stocksMap = {};
        latestStocks.forEach(s => {
            stocksMap[s.Symbol] = s;
        });

        // Load all fundamentals
        const snapFunds = await db.collection('fundamentals').get();
        const results = snapFunds.docs.map(doc => {
            const f = doc.data();
            const n = stocksMap[f.Symbol] || {};
            return {
                ...f,
                LTP: n.LTP || null,
                PctChange: n.PctChange || null,
                Sector: n.Sector || null
            };
        });

        res.json(results);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fundamentals/:symbol
router.get('/:symbol', async (req, res) => {
    try {
        const sym = req.params.symbol.toUpperCase();
        const doc = await db.collection('fundamentals').doc(sym).get();
        if (!doc.exists) return res.json(null);
        res.json(doc.data());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/fundamentals - add or update (upsert)
router.post('/', authMiddleware, async (req, res) => {
    try {
        const {
            Symbol, CompanyName, PE_Ratio, EPS, Revenue_Cr, NetProfit_Cr,
            DebtToEquity, ROE, ROCE, MarketCap_Cr, BookValue,
            DividendYield, FaceValue, Notes
        } = req.body;
        if (!Symbol) return res.status(400).json({ error: 'Symbol required' });

        const sym = Symbol.toUpperCase();
        const user = req.user.username;

        const docData = {
            Symbol: sym,
            CompanyName: CompanyName || null,
            PE_Ratio: PE_Ratio !== undefined ? parseFloat(PE_Ratio) : null,
            EPS: EPS !== undefined ? parseFloat(EPS) : null,
            Revenue_Cr: Revenue_Cr !== undefined ? parseFloat(Revenue_Cr) : null,
            NetProfit_Cr: NetProfit_Cr !== undefined ? parseFloat(NetProfit_Cr) : null,
            DebtToEquity: DebtToEquity !== undefined ? parseFloat(DebtToEquity) : null,
            ROE: ROE !== undefined ? parseFloat(ROE) : null,
            ROCE: ROCE !== undefined ? parseFloat(ROCE) : null,
            MarketCap_Cr: MarketCap_Cr !== undefined ? parseFloat(MarketCap_Cr) : null,
            BookValue: BookValue !== undefined ? parseFloat(BookValue) : null,
            DividendYield: DividendYield !== undefined ? parseFloat(DividendYield) : null,
            FaceValue: FaceValue !== undefined ? parseFloat(FaceValue) : null,
            Notes: Notes || null,
            UpdatedAt: new Date().toISOString(),
            UpdatedBy: user
        };

        await db.collection('fundamentals').doc(sym).set(docData, { merge: true });

        res.json({ success: true, message: 'Fundamentals saved!' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/fundamentals/:symbol
router.delete('/:symbol', authMiddleware, async (req, res) => {
    try {
        const sym = req.params.symbol.toUpperCase();
        await db.collection('fundamentals').doc(sym).delete();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
