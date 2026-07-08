const express = require('express');
const router = express.Router();
const { db, getStocksForDate } = require('../db');

async function resolveDate(dateQuery) {
    if (dateQuery && dateQuery !== 'Latest') return dateQuery;
    const snap = await db.collection('imports').get();
    if (snap.empty) return new Date().toISOString().split('T')[0];
    const ids = snap.docs.map(doc => doc.id);
    ids.sort((a, b) => b.localeCompare(a.id));
    return ids[0];
}

// GET /api/analysis/intraday
router.get('/intraday', async (req, res) => {
    try {
        const date = await resolveDate(req.query.date);
        const stocks = await getStocksForDate(date);

        const filtered = stocks.filter(s => {
            return (s.Value || 0) > 25 &&
                   Math.abs(s.PctChange || 0) >= 1.0 &&
                   (s.Volume || 0) > 100000;
        });

        const results = filtered.map(s => {
            const ltp = s.LTP || 0;
            const open = s.Open || 0;
            const high52 = s.High52W || 0;
            const low52 = s.Low52W || 0;
            const value = s.Value || 0;
            const pctChg = s.PctChange || 0;

            const PricePosition52W = high52 > 0 ? parseFloat((((ltp - low52) / (high52 - low52)) * 100).toFixed(2)) : 0;
            const PctFromHigh52W = high52 > 0 ? parseFloat((((high52 - ltp) / high52) * 100).toFixed(2)) : 0;
            const Bias = ltp > open ? 'BULLISH' : 'BEARISH';

            // Score calculation
            let IntradayScore = Math.abs(pctChg) * 10;
            if (value > 200) IntradayScore += 30;
            else if (value > 100) IntradayScore += 20;
            else if (value > 50) IntradayScore += 10;

            if (Math.abs(pctChg) > 3) IntradayScore += 20;
            else if (Math.abs(pctChg) > 2) IntradayScore += 10;

            if (high52 > 0 && (((high52 - ltp) / high52) * 100) < 5) IntradayScore += 15;

            return {
                ...s,
                PricePosition52W,
                PctFromHigh52W,
                Bias,
                IntradayScore: parseFloat(IntradayScore.toFixed(2))
            };
        });

        results.sort((a, b) => {
            const scoreCmp = b.IntradayScore - a.IntradayScore;
            if (scoreCmp !== 0) return scoreCmp;
            return (b.Value || 0) - (a.Value || 0);
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analysis/weekly
router.get('/weekly', async (req, res) => {
    try {
        const date = await resolveDate(req.query.date);
        const stocks = await getStocksForDate(date);

        const filtered = stocks.filter(s => {
            return (s.Value || 0) > 15 &&
                   (s.Chng30D || 0) > 2 &&
                   s.LTP !== null &&
                   s.Volume !== null;
        });

        const results = filtered.map(s => {
            const ltp = s.LTP || 0;
            const high52 = s.High52W || 0;
            const low52 = s.Low52W || 0;
            const value = s.Value || 0;
            const chng30D = s.Chng30D || 0;
            const chng365D = s.Chng365D || 0;

            const PricePosition52W = high52 > 0 ? parseFloat((((ltp - low52) / (high52 - low52)) * 100).toFixed(2)) : 0;
            const PctFromHigh52W = high52 > 0 ? parseFloat((((high52 - ltp) / high52) * 100).toFixed(2)) : 0;
            const PctFromLow52W = low52 > 0 ? parseFloat((((ltp - low52) / low52) * 100).toFixed(2)) : 0;

            // Score calculation
            let WeeklyScore = chng30D * 3 + chng365D * 0.5;
            
            const pctDiffHigh = high52 > 0 ? ((high52 - ltp) / high52) * 100 : 999;
            if (pctDiffHigh < 10) WeeklyScore += 25;
            else if (pctDiffHigh < 20) WeeklyScore += 15;

            if (value > 100) WeeklyScore += 20;
            else if (value > 50) WeeklyScore += 10;

            if (chng30D > 15) WeeklyScore += 20;
            else if (chng30D > 10) WeeklyScore += 12;
            else if (chng30D > 5) WeeklyScore += 6;

            return {
                ...s,
                PricePosition52W,
                PctFromHigh52W,
                PctFromLow52W,
                WeeklyScore: parseFloat(WeeklyScore.toFixed(2))
            };
        });

        results.sort((a, b) => {
            const scoreCmp = b.WeeklyScore - a.WeeklyScore;
            if (scoreCmp !== 0) return scoreCmp;
            return (b.Chng30D || 0) - (a.Chng30D || 0);
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analysis/breakout
router.get('/breakout', async (req, res) => {
    try {
        const date = await resolveDate(req.query.date);
        const stocks = await getStocksForDate(date);

        const filtered = stocks.filter(s => {
            const ltp = s.LTP || 0;
            const high52 = s.High52W || 0;
            return high52 > 0 && ltp > 0 &&
                   ((high52 - ltp) / high52) * 100 <= 8 &&
                   (s.Value || 0) > 10 &&
                   (s.PctChange || 0) > 0;
        });

        const results = filtered.map(s => {
            const ltp = s.LTP || 0;
            const high52 = s.High52W || 0;
            const low52 = s.Low52W || 0;

            const PctFromHigh52W = parseFloat((((high52 - ltp) / high52) * 100).toFixed(2));
            const PctFromLow52W = low52 > 0 ? parseFloat((((ltp - low52) / low52) * 100).toFixed(2)) : 0;

            return {
                ...s,
                PctFromHigh52W,
                PctFromLow52W
            };
        });

        results.sort((a, b) => {
            const diffCmp = a.PctFromHigh52W - b.PctFromHigh52W;
            if (diffCmp !== 0) return diffCmp;
            return (b.Value || 0) - (a.Value || 0);
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analysis/oversold
router.get('/oversold', async (req, res) => {
    try {
        const date = await resolveDate(req.query.date);
        const stocks = await getStocksForDate(date);

        const filtered = stocks.filter(s => {
            return (s.Chng365D || 0) < -20 &&
                   (s.Value || 0) > 5 &&
                   (s.LTP || 0) > 0 &&
                   (s.PctChange || 0) > -5;
        });

        const results = filtered.map(s => {
            const ltp = s.LTP || 0;
            const high52 = s.High52W || 0;
            const low52 = s.Low52W || 0;

            const PctFromLow52W = low52 > 0 ? parseFloat((((ltp - low52) / low52) * 100).toFixed(2)) : 0;
            const PctFromHigh52W = high52 > 0 ? parseFloat((((high52 - ltp) / high52) * 100).toFixed(2)) : 0;

            return {
                ...s,
                PctFromLow52W,
                PctFromHigh52W
            };
        });

        results.sort((a, b) => {
            const diffCmp = a.Chng365D - b.Chng365D;
            if (diffCmp !== 0) return diffCmp;
            return (b.Value || 0) - (a.Value || 0);
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analysis/sector-heatmap
router.get('/sector-heatmap', async (req, res) => {
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analysis/sector-rotation
router.get('/sector-rotation', async (req, res) => {
    try {
        const date = await resolveDate(req.query.date);
        const stocks = await getStocksForDate(date);

        const sectorsMap = {};
        stocks.forEach(s => {
            const sec = s.Sector || 'Others';
            if (!sectorsMap[sec]) {
                sectorsMap[sec] = { Sector: sec, StockCount: 0, sumPct: 0, sum30: 0, sum365: 0, TotalValue: 0 };
            }
            const item = sectorsMap[sec];
            item.StockCount++;
            item.sumPct += (s.PctChange || 0);
            item.sum30 += (s.Chng30D || 0);
            item.sum365 += (s.Chng365D || 0);
            item.TotalValue += (s.Value || 0);
        });

        const result = Object.values(sectorsMap).map(sec => ({
            Sector: sec.Sector,
            StockCount: sec.StockCount,
            Change1D: parseFloat((sec.sumPct / sec.StockCount).toFixed(2)),
            Change30D: parseFloat((sec.sum30 / sec.StockCount).toFixed(2)),
            Change365D: parseFloat((sec.sum365 / sec.StockCount).toFixed(2)),
            TotalValue: parseFloat(sec.TotalValue.toFixed(2))
        }));

        result.sort((a, b) => b.Change30D - a.Change30D);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/analysis/swing
router.get('/swing', async (req, res) => {
    try {
        const date = await resolveDate(req.query.date);
        const stocks = await getStocksForDate(date);

        // 1. Calculate sector averages in memory
        const sectorsMap = {};
        stocks.forEach(s => {
            if (s.Sector) {
                if (!sectorsMap[s.Sector]) {
                    sectorsMap[s.Sector] = { sum30: 0, count: 0 };
                }
                sectorsMap[s.Sector].sum30 += (s.Chng30D || 0);
                sectorsMap[s.Sector].count++;
            }
        });

        const sectorAverages = {};
        Object.entries(sectorsMap).forEach(([sec, data]) => {
            const avg = data.count > 0 ? (data.sum30 / data.count) : 0;
            if (avg > 0) {
                sectorAverages[sec] = avg;
            }
        });

        // 2. Filter & join stocks
        const filtered = stocks.filter(s => {
            return s.Sector && sectorAverages[s.Sector] !== undefined &&
                   (s.Value || 0) > 25 &&
                   (s.Chng30D || 0) > 0 &&
                   (s.LTP || 0) > (s.Open || 0);
        });

        const results = filtered.map(s => {
            const ltp = s.LTP || 0;
            const high52 = s.High52W || 0;
            const chng30D = s.Chng30D || 0;
            const value = s.Value || 0;
            const secAvg30 = sectorAverages[s.Sector];

            const PctFromHigh52W = high52 > 0 ? ((high52 - ltp) / high52) * 100 : 100;

            // Score calculation
            let SwingScore = chng30D * 5 + secAvg30 * 10;
            if (value > 50) SwingScore += 10;
            if (high52 > 0 && (((high52 - ltp) / high52) * 100) < 10) SwingScore += 20;

            return {
                ...s,
                SectorAvg30D: parseFloat(secAvg30.toFixed(2)),
                PctFromHigh52W: parseFloat(PctFromHigh52W.toFixed(2)),
                SwingScore: parseFloat(SwingScore.toFixed(2))
            };
        });

        results.sort((a, b) => {
            const scoreCmp = b.SwingScore - a.SwingScore;
            if (scoreCmp !== 0) return scoreCmp;
            return (b.Value || 0) - (a.Value || 0);
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
