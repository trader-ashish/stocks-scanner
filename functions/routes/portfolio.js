const express = require('express');
const router  = express.Router();
const { db, getStocksForDate } = require('../db');
const sectorMappings = require('../sector_mappings.json');
const { authMiddleware } = require('./auth');

// GET /api/portfolio — all current holdings
router.get('/', authMiddleware, async (req, res) => {
    try {
        // Fetch latest stocks for joining LTP
        const snapImports = await db.collection('imports').get();
        let latestStocks = [];
        if (!snapImports.empty) {
            const ids = snapImports.docs.map(doc => doc.id);
            ids.sort((a, b) => b.localeCompare(a.id));
            const latestDate = ids[0];
            latestStocks = await getStocksForDate(latestDate);
        }
        
        const stocksMap = {};
        latestStocks.forEach(s => {
            stocksMap[s.Symbol] = s;
        });

        // Get holdings filtered by current user
        const snapPortfolio = await db.collection('portfolio')
            .where('UserId', '==', req.user.id)
            .where('Quantity', '>', 0)
            .get();
            
        const holdings = snapPortfolio.docs.map(doc => {
            const p = doc.data();
            const s = stocksMap[p.Symbol] || {};
            return {
                Id: doc.id,
                ...p,
                LTP: s.LTP || 0,
                DayPct: s.PctChange || 0,
                SectorName: s.Sector || p.Sector || 'Others'
            };
        });

        res.json(holdings);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/portfolio/trades — trade history
router.get('/trades', authMiddleware, async (req, res) => {
    try {
        const snapTrades = await db.collection('trades')
            .where('UserId', '==', req.user.id)
            .get();
            
        const trades = snapTrades.docs.map(doc => ({
            Id: doc.id,
            ...doc.data()
        }));
        
        // Sort by TradeDate desc, CreatedAt desc
        trades.sort((a, b) => {
            const dateCmp = b.TradeDate.localeCompare(a.TradeDate);
            if (dateCmp !== 0) return dateCmp;
            return b.CreatedAt.localeCompare(a.CreatedAt);
        });

        res.json(trades);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/portfolio/summary — aggregate P&L
router.get('/summary', authMiddleware, async (req, res) => {
    try {
        // Fetch latest stocks for joining
        const snapImports = await db.collection('imports').get();
        let latestStocks = [];
        if (!snapImports.empty) {
            const ids = snapImports.docs.map(doc => doc.id);
            ids.sort((a, b) => b.localeCompare(a.id));
            const latestDate = ids[0];
            latestStocks = await getStocksForDate(latestDate);
        }
        
        const stocksMap = {};
        latestStocks.forEach(s => {
            stocksMap[s.Symbol] = s;
        });

        // Sum holdings in memory for this user
        const snapPortfolio = await db.collection('portfolio')
            .where('UserId', '==', req.user.id)
            .where('Quantity', '>', 0)
            .get();
        
        let TotalInvested = 0;
        let CurrentValue = 0;
        let UnrealizedPnL = 0;
        let TotalHoldings = 0;

        snapPortfolio.docs.forEach(doc => {
            const p = doc.data();
            const s = stocksMap[p.Symbol] || {};
            const ltp = s.LTP || 0;
            const invested = p.Quantity * p.AvgBuyPrice;
            const current = p.Quantity * ltp;
            
            TotalInvested += invested;
            CurrentValue += current;
            UnrealizedPnL += (current - invested);
            TotalHoldings++;
        });

        // Sum realized P&L from sell trades for this user
        const snapTrades = await db.collection('trades')
            .where('UserId', '==', req.user.id)
            .where('TradeType', '==', 'SELL')
            .get();
            
        let RealizedPnL = 0;
        let TotalTrades = 0;

        snapTrades.docs.forEach(doc => {
            const t = doc.data();
            RealizedPnL += (t.RealizedPnL || 0);
            TotalTrades++;
        });

        res.json({
            TotalInvested,
            CurrentValue,
            UnrealizedPnL,
            RealizedPnL,
            TotalHoldings,
            TotalTrades
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/portfolio/buy — add / average down
router.post('/buy', authMiddleware, async (req, res) => {
    try {
        const { symbol, quantity, buyPrice, buyDate, notes } = req.body;
        if (!symbol || !quantity || !buyPrice || !buyDate)
            return res.status(400).json({ error: 'symbol, quantity, buyPrice, buyDate required' });

        const sym = symbol.toUpperCase();
        const qtyVal = parseFloat(quantity);
        const priceVal = parseFloat(buyPrice);

        // Document ID is user-specific to prevent conflict/overwriting
        const holdingDocId = `${req.user.id}_${sym}`;
        const holdingRef = db.collection('portfolio').doc(holdingDocId);
        const holdingDoc = await holdingRef.get();

        if (holdingDoc.exists && holdingDoc.data().Quantity > 0) {
            const old = holdingDoc.data();
            const newQty = old.Quantity + qtyVal;
            const newAvg = ((old.Quantity * old.AvgBuyPrice) + (qtyVal * priceVal)) / newQty;
            
            await holdingRef.set({
                Quantity: newQty,
                AvgBuyPrice: newAvg,
                Notes: notes || old.Notes || '',
                UpdatedAt: new Date().toISOString()
            }, { merge: true });
        } else {
            const sector = sectorMappings[sym] || 'Others';
            await holdingRef.set({
                Symbol: sym,
                Sector: sector,
                Quantity: qtyVal,
                AvgBuyPrice: priceVal,
                BuyDate: buyDate,
                Notes: notes || '',
                UserId: req.user.id,
                CreatedAt: new Date().toISOString()
            });
        }

        // Log trade
        await db.collection('trades').add({
            Symbol: sym,
            TradeType: 'BUY',
            Quantity: qtyVal,
            Price: priceVal,
            TradeDate: buyDate,
            RealizedPnL: 0,
            Notes: notes || '',
            UserId: req.user.id,
            CreatedAt: new Date().toISOString()
        });

        res.json({ success: true, message: `${sym} added to portfolio` });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/portfolio/sell — sell shares
router.post('/sell', authMiddleware, async (req, res) => {
    try {
        const { symbol, quantity, sellPrice, sellDate, notes } = req.body;
        if (!symbol || !quantity || !sellPrice || !sellDate)
            return res.status(400).json({ error: 'symbol, quantity, sellPrice, sellDate required' });

        const sym = symbol.toUpperCase();
        const sellQty = parseFloat(quantity);
        const priceVal = parseFloat(sellPrice);

        const holdingDocId = `${req.user.id}_${sym}`;
        const holdingRef = db.collection('portfolio').doc(holdingDocId);
        const holdingDoc = await holdingRef.get();

        if (!holdingDoc.exists || holdingDoc.data().Quantity <= 0) {
            return res.status(400).json({ error: 'Holding not found' });
        }

        const hold = holdingDoc.data();
        if (sellQty > hold.Quantity) {
            return res.status(400).json({ error: 'Sell quantity > holding quantity' });
        }

        const pnl = (priceVal - hold.AvgBuyPrice) * sellQty;
        const newQty = hold.Quantity - sellQty;

        await holdingRef.set({
            Quantity: newQty,
            UpdatedAt: new Date().toISOString()
        }, { merge: true });

        // Log trade
        await db.collection('trades').add({
            Symbol: sym,
            TradeType: 'SELL',
            Quantity: sellQty,
            Price: priceVal,
            TradeDate: sellDate,
            RealizedPnL: pnl,
            Notes: notes || '',
            UserId: req.user.id,
            CreatedAt: new Date().toISOString()
        });

        res.json({ success: true, realizedPnL: pnl, message: `Sold ${sellQty} shares of ${sym}` });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/portfolio/:id — remove holding (hard delete)
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const docRef = db.collection('portfolio').doc(req.params.id);
        const doc = await docRef.get();
        if (doc.exists && doc.data().UserId === req.user.id) {
            await docRef.delete();
            res.json({ success: true });
        } else {
            res.status(403).json({ error: 'Access denied' });
        }
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
