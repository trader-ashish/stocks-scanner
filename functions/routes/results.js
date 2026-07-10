const express = require('express');
const router = express.Router();
const { db, getStocksForDate } = require('../db');
const { authMiddleware } = require('./auth');

// GET /api/results?filter=upcoming|recent|past
router.get('/', async (req, res) => {
    try {
        const { filter } = req.query;

        // Fetch latest stocks for joining
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

        // Fetch all earnings documents
        const snapEarnings = await db.collection('earnings').get();
        
        const today = new Date();
        today.setHours(0,0,0,0);
        const todayTime = today.getTime();

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0,0,0,0);
        const sevenDaysAgoTime = sevenDaysAgo.getTime();

        let results = snapEarnings.docs.map(doc => {
            const data = doc.data();
            const resDate = new Date(data.ResultDate);
            resDate.setHours(0,0,0,0);
            const resTime = resDate.getTime();

            const n = stocksMap[data.Symbol] || {};
            const daysLeft = Math.ceil((resTime - todayTime) / (1000 * 60 * 60 * 24));

            return {
                Id: doc.id,
                ...data,
                LTP: n.LTP || null,
                PctChange: n.PctChange || null,
                Sector: n.Sector || null,
                DaysLeft: daysLeft
            };
        });

        // Filter results in memory
        if (filter === 'upcoming') {
            results = results.filter(r => new Date(r.ResultDate).getTime() >= todayTime);
        } else if (filter === 'recent') {
            results = results.filter(r => {
                const t = new Date(r.ResultDate).getTime();
                return t >= sevenDaysAgoTime && t < todayTime;
            });
        } else if (filter === 'past') {
            results = results.filter(r => new Date(r.ResultDate).getTime() < sevenDaysAgoTime);
        }

        // Sort results
        if (filter === 'past') {
            results.sort((a, b) => b.ResultDate.localeCompare(a.ResultDate));
        } else {
            results.sort((a, b) => a.ResultDate.localeCompare(b.ResultDate));
        }

        res.json(results);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/results - add new result entry
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { Symbol, Quarter, ResultDate, Est_Revenue_Cr, Est_Profit_Cr, Est_EPS, Notes } = req.body;
        if (!Symbol || !ResultDate) return res.status(400).json({ error: 'Symbol and ResultDate required' });

        const newDocRef = db.collection('earnings').doc();
        await newDocRef.set({
            Symbol: Symbol.toUpperCase(),
            Quarter: Quarter || null,
            ResultDate: ResultDate,
            Est_Revenue_Cr: Est_Revenue_Cr ? parseFloat(Est_Revenue_Cr) : null,
            Est_Profit_Cr: Est_Profit_Cr ? parseFloat(Est_Profit_Cr) : null,
            Est_EPS: Est_EPS ? parseFloat(Est_EPS) : null,
            Notes: Notes || null,
            Status: 'Declared',
            CreatedAt: new Date().toISOString()
        });

        res.json({ success: true, message: 'Result added!' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/results/:id - update actual results
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { Act_Revenue_Cr, Act_Profit_Cr, Act_EPS, YoY_Revenue_Pct, YoY_Profit_Pct, Beat_Miss, Notes, Status } = req.body;
        
        const docRef = db.collection('earnings').doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Record not found' });

        await docRef.set({
            Act_Revenue_Cr: Act_Revenue_Cr !== undefined ? parseFloat(Act_Revenue_Cr) : null,
            Act_Profit_Cr: Act_Profit_Cr !== undefined ? parseFloat(Act_Profit_Cr) : null,
            Act_EPS: Act_EPS !== undefined ? parseFloat(Act_EPS) : null,
            YoY_Revenue_Pct: YoY_Revenue_Pct !== undefined ? parseFloat(YoY_Revenue_Pct) : null,
            YoY_Profit_Pct: YoY_Profit_Pct !== undefined ? parseFloat(YoY_Profit_Pct) : null,
            Beat_Miss: Beat_Miss || null,
            Notes: Notes || null,
            Status: Status || 'Declared',
            UpdatedAt: new Date().toISOString()
        }, { merge: true });

        res.json({ success: true, message: 'Result updated!' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/results/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await db.collection('earnings').doc(req.params.id).delete();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
