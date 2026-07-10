const express = require('express');
const router = express.Router();
const { db, getStocksForDate } = require('../db');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// Helper: Calculate SuperTrend
function calculateSuperTrend(quotes, period = 10, multiplier = 3) {
    if (!quotes || quotes.length === 0) return [];
    let atr = [], tr = [];
    for (let i = 0; i < quotes.length; i++) {
        if (i === 0) {
            tr.push(quotes[i].high - quotes[i].low);
            atr.push(tr[i]);
            continue;
        }
        let hl = quotes[i].high - quotes[i].low;
        let hcp = Math.abs(quotes[i].high - quotes[i - 1].close);
        let lcp = Math.abs(quotes[i].low - quotes[i - 1].close);
        let current_tr = Math.max(hl, hcp, lcp);
        tr.push(current_tr);
        atr.push((atr[i - 1] * (period - 1) + current_tr) / period);
    }

    let basicUpper = [], basicLower = [], finalUpper = [], finalLower = [], st = [], trend = [];
    for (let i = 0; i < quotes.length; i++) {
        let hl2 = (quotes[i].high + quotes[i].low) / 2;
        basicUpper[i] = hl2 + multiplier * atr[i];
        basicLower[i] = hl2 - multiplier * atr[i];

        if (i === 0) {
            finalUpper[i] = basicUpper[i];
            finalLower[i] = basicLower[i];
            st[i] = basicUpper[i];
            trend[i] = 1;
            continue;
        }

        finalUpper[i] = (basicUpper[i] < finalUpper[i - 1] || quotes[i - 1].close > finalUpper[i - 1]) ? basicUpper[i] : finalUpper[i - 1];
        finalLower[i] = (basicLower[i] > finalLower[i - 1] || quotes[i - 1].close < finalLower[i - 1]) ? basicLower[i] : finalLower[i - 1];

        if (st[i - 1] === finalUpper[i - 1] && quotes[i].close < finalUpper[i]) {
            st[i] = finalUpper[i];
            trend[i] = -1;
        } else if (st[i - 1] === finalUpper[i - 1] && quotes[i].close > finalUpper[i]) {
            st[i] = finalLower[i];
            trend[i] = 1;
        } else if (st[i - 1] === finalLower[i - 1] && quotes[i].close > finalLower[i]) {
            st[i] = finalLower[i];
            trend[i] = 1;
        } else if (st[i - 1] === finalLower[i - 1] && quotes[i].close < finalLower[i]) {
            st[i] = finalUpper[i];
            trend[i] = -1;
        } else {
            st[i] = st[i - 1];
            trend[i] = trend[i - 1];
        }
    }
    return { trend, st };
}

// Helper: Save breakouts to Firestore
async function saveBreakoutsToFirestore(breakouts, scanType, targetDate) {
    if (!breakouts || breakouts.length === 0) return;
    try {
        let dateToUse = targetDate;
        if (!dateToUse) {
            const snapImports = await db.collection('imports').get();
            if (snapImports.empty) return;
            const ids = snapImports.docs.map(doc => doc.id);
            ids.sort((a, b) => b.localeCompare(a));
            dateToUse = ids[0];
        }
        
        const batch = db.batch();
        for (const b of breakouts) {
            let metrics = '';
            if (scanType === 'VolumeBreakout') {
                metrics = `${b.VolRatio}x Volume, 20D Avg: ${Math.round(b.AvgVolume20D)}`;
            } else if (scanType === 'RangeBreakout') {
                metrics = `Range: ${b.ConsolidationRangePct}%, VolRatio: ${b.VolRatio}x`;
            } else if (scanType === 'SuperTrend') {
                metrics = 'SuperTrend Bullish Breakout';
            } else if (scanType === 'SuperTrendPullback') {
                metrics = `ST Support: ₹${b.SupportPrice || 0} (Dist: ${b.DistPct || 0}%)`;
            }

            const docId = `${b.Symbol}_${dateToUse}_${scanType}`;
            const docRef = db.collection('breakout_history').doc(docId);
            batch.set(docRef, {
                Symbol: b.Symbol,
                BreakoutDate: dateToUse,
                ScanType: scanType,
                LTP: b.LTP,
                PctChange: b.PctChange,
                Volume: b.Volume || b.TodayVolume || 0,
                Metrics: metrics,
                CreatedAt: new Date().toISOString()
            }, { merge: true });
        }
        await batch.commit();
        console.log(`Saved ${breakouts.length} breakouts of type ${scanType} for date ${dateToUse} to Firestore`);
    } catch(err) {
        console.error('Error saving breakouts to Firestore:', err.message);
    }
}

// GET /api/scanner/supertrend
router.get('/supertrend', async (req, res) => {
    try {
        // Get latest import date
        const snapImports = await db.collection('imports').get();
        if (snapImports.empty) return res.json([]);
        const ids = snapImports.docs.map(doc => doc.id);
        ids.sort((a, b) => b.localeCompare(a));
        const latestDate = ids[0];
        const allStocks = await getStocksForDate(latestDate);

        const stocks = allStocks.filter(s => (s.LTP || 0) > 20 && (s.Value || 0) > 10);
        stocks.sort((a, b) => (b.Value || 0) - (a.Value || 0));

        const breakouts = [];
        const date2 = new Date();
        const date1 = new Date();
        date1.setDate(date1.getDate() - 40);
        
        const queryOptions = {
            period1: date1.toISOString().split('T')[0],
            period2: date2.toISOString().split('T')[0],
            interval: '1d'
        };

        const chunkSize = 20;
        for (let i = 0; i < stocks.length; i += chunkSize) {
            const chunk = stocks.slice(i, i + chunkSize);
            const promises = chunk.map(async (stock) => {
                const symbol = stock.Symbol + '.NS';
                try {
                    const quotes = await yf.chart(symbol, queryOptions);
                    if (quotes && quotes.quotes && quotes.quotes.length > 15) {
                        const validQuotes = quotes.quotes.filter(q => q.high !== null && q.low !== null && q.close !== null);
                        if (validQuotes.length > 10) {
                            const { trend } = calculateSuperTrend(validQuotes, 10, 3);
                            if (trend.length >= 2) {
                                const currentTrend = trend[trend.length - 1];
                                const prevTrend = trend[trend.length - 2];
                                if (prevTrend === -1 && currentTrend === 1) {
                                    return { ...stock, BreakoutDate: validQuotes[validQuotes.length - 1].date };
                                }
                            }
                        }
                    }
                } catch (err) {
                    // Ignore fetch errors
                }
                return null;
            });
            
            const results = await Promise.all(promises);
            for (const r of results) {
                if (r) breakouts.push(r);
            }
        }
        
        breakouts.sort((a, b) => (b.PctChange || 0) - (a.PctChange || 0));
        await saveBreakoutsToFirestore(breakouts, 'SuperTrend', latestDate);
        res.json(breakouts);
        
    } catch (err) {
        console.error('SuperTrend Scanner error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/scanner/fundamentals
router.get('/fundamentals', async (req, res) => {
    try {
        const snapImports = await db.collection('imports').get();
        if (snapImports.empty) return res.json([]);
        const ids = snapImports.docs.map(doc => doc.id);
        ids.sort((a, b) => b.localeCompare(a));
        const latestDate = ids[0];
        const allStocks = await getStocksForDate(latestDate);

        const stocks = allStocks.filter(s => (s.LTP || 0) > 50 && (s.Value || 0) > 10);
        stocks.sort((a, b) => (b.Value || 0) - (a.Value || 0));

        const topStocks = [];
        const chunkSize = 15;
        for (let i = 0; i < stocks.length; i += chunkSize) {
            const chunk = stocks.slice(i, i + chunkSize);
            const promises = chunk.map(async (stock) => {
                const symbol = stock.Symbol + '.NS';
                try {
                    const data = await yf.quoteSummary(symbol, { modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail'] });
                    
                    if (data && data.financialData) {
                        const fd = data.financialData;
                        const ks = data.defaultKeyStatistics || {};
                        const sd = data.summaryDetail || {};

                        const roe = fd.returnOnEquity || 0;
                        const de = fd.debtToEquity || 0;
                        const pe = sd.trailingPE || ks.forwardPE || 0;
                        const profitMargin = fd.profitMargins || 0;
                        const divYield = sd.dividendYield || 0;
                        const mktCap = sd.marketCap || 0;
                        
                        let score = 0;
                        
                        if (roe > 0.15) score += 15 + Math.min((roe - 0.15) * 100, 15);
                        else if (roe > 0.10) score += 10;
                        
                        const deRatio = de / 100;
                        if (deRatio < 0.5) score += 25;
                        else if (deRatio < 1.0) score += 15;
                        else if (deRatio < 2.0) score += 5;
                        
                        if (pe > 0 && pe < 20) score += 25;
                        else if (pe >= 20 && pe < 30) score += 15;
                        else if (pe >= 30 && pe < 50) score += 5;
                        
                        if (profitMargin > 0.15) score += 20;
                        else if (profitMargin > 0.10) score += 10;
                        else if (profitMargin > 0.05) score += 5;
                        
                        if (divYield > 0.01) score += 5;

                        if (score >= 40) {
                            return {
                                ...stock,
                                PE: pe,
                                ROE: roe * 100,
                                DE: deRatio,
                                Margin: profitMargin * 100,
                                MktCap: mktCap,
                                Score: Math.round(score)
                            };
                        }
                    }
                } catch (err) {
                    // Ignore
                }
                return null;
            });
            
            const results = await Promise.all(promises);
            for (const r of results) {
                if (r) topStocks.push(r);
            }
        }
        
        topStocks.sort((a, b) => b.Score - a.Score);
        res.json(topStocks.slice(0, 20));
        
    } catch (err) {
        console.error('Fundamentals Scanner error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/scanner/volume-breakout
router.get('/volume-breakout', async (req, res) => {
    try {
        const snapImports = await db.collection('imports').get();
        if (snapImports.empty) return res.json([]);
        const ids = snapImports.docs.map(doc => doc.id);
        ids.sort((a, b) => b.localeCompare(a));
        const latestDate = ids[0];
        const allStocks = await getStocksForDate(latestDate);

        const stocks = allStocks.filter(s => (s.LTP || 0) > 20 && (s.Value || 0) > 5);
        stocks.sort((a, b) => (b.Value || 0) - (a.Value || 0));

        const breakouts = [];
        const date2 = new Date();
        const date1 = new Date();
        date1.setDate(date1.getDate() - 35); // Need ~25-30 days for 20 trading sessions

        const queryOptions = {
            period1: date1.toISOString().split('T')[0],
            period2: date2.toISOString().split('T')[0],
            interval: '1d'
        };

        const chunkSize = 20;
        for (let i = 0; i < stocks.length; i += chunkSize) {
            const chunk = stocks.slice(i, i + chunkSize);
            const promises = chunk.map(async (stock) => {
                const symbol = stock.Symbol + '.NS';
                try {
                    const quotes = await yf.chart(symbol, queryOptions);
                    if (quotes && quotes.quotes && quotes.quotes.length > 15) {
                        const validQuotes = quotes.quotes.filter(q => q.high !== null && q.low !== null && q.close !== null && q.volume !== null);
                        if (validQuotes.length > 10) {
                            const lastIdx = validQuotes.length - 1;
                            const todayVol = validQuotes[lastIdx].volume;
                            const todayClose = validQuotes[lastIdx].close;
                            const prevClose = validQuotes[lastIdx - 1].close;
                            const pctChg = ((todayClose - prevClose) / prevClose) * 100;

                            let totalVol = 0;
                            let count = 0;
                            for (let j = lastIdx - 1; j >= Math.max(0, lastIdx - 20); j--) {
                                totalVol += validQuotes[j].volume;
                                count++;
                            }
                            const avgVol = totalVol / count;
                            const volRatio = avgVol > 0 ? (todayVol / avgVol) : 0;

                            if (volRatio >= 3.0 && pctChg >= 2.0) {
                                return {
                                    ...stock,
                                    AvgVolume20D: Math.round(avgVol),
                                    TodayVolume: todayVol,
                                    VolRatio: parseFloat(volRatio.toFixed(2)),
                                    PctChange: parseFloat(pctChg.toFixed(2)),
                                    LTP: parseFloat(todayClose.toFixed(2))
                                };
                            }
                        }
                    }
                } catch (err) {
                    // Ignore error for single stock
                }
                return null;
            });

            const results = await Promise.all(promises);
            for (const r of results) {
                if (r) breakouts.push(r);
            }
        }

        breakouts.sort((a, b) => b.VolRatio - a.VolRatio);
        await saveBreakoutsToFirestore(breakouts, 'VolumeBreakout', latestDate);
        res.json(breakouts);

    } catch (err) {
        console.error('Volume Breakout Scanner error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/scanner/range-breakout
router.get('/range-breakout', async (req, res) => {
    try {
        const snapImports = await db.collection('imports').get();
        if (snapImports.empty) return res.json([]);
        const ids = snapImports.docs.map(doc => doc.id);
        ids.sort((a, b) => b.localeCompare(a));
        const latestDate = ids[0];
        const allStocks = await getStocksForDate(latestDate);

        const stocks = allStocks.filter(s => (s.LTP || 0) > 20 && (s.Value || 0) > 5);
        stocks.sort((a, b) => (b.Value || 0) - (a.Value || 0));

        const breakouts = [];
        const date2 = new Date();
        const date1 = new Date();
        date1.setDate(date1.getDate() - 35); // Need enough days for 10 sessions + today

        const queryOptions = {
            period1: date1.toISOString().split('T')[0],
            period2: date2.toISOString().split('T')[0],
            interval: '1d'
        };

        const chunkSize = 20;
        for (let i = 0; i < stocks.length; i += chunkSize) {
            const chunk = stocks.slice(i, i + chunkSize);
            const promises = chunk.map(async (stock) => {
                const symbol = stock.Symbol + '.NS';
                try {
                    const quotes = await yf.chart(symbol, queryOptions);
                    if (quotes && quotes.quotes && quotes.quotes.length > 12) {
                        const validQuotes = quotes.quotes.filter(q => q.high !== null && q.low !== null && q.close !== null && q.volume !== null);
                        if (validQuotes.length >= 11) {
                            const lastIdx = validQuotes.length - 1;
                            const todayClose = validQuotes[lastIdx].close;
                            const todayVol = validQuotes[lastIdx].volume;
                            const prevClose = validQuotes[lastIdx - 1].close;
                            const pctChg = ((todayClose - prevClose) / prevClose) * 100;

                            const lookback = 10;
                            const rangeStartIdx = lastIdx - lookback;
                            let maxHigh = -Infinity;
                            let minLow = Infinity;
                            let totalVol = 0;

                            for (let j = rangeStartIdx; j < lastIdx; j++) {
                                if (validQuotes[j].high > maxHigh) maxHigh = validQuotes[j].high;
                                if (validQuotes[j].low < minLow) minLow = validQuotes[j].low;
                                totalVol += validQuotes[j].volume;
                            }

                            const avgVol = totalVol / lookback;
                            const rangePct = ((maxHigh - minLow) / minLow) * 100;

                            if (rangePct <= 6.0 && todayClose > maxHigh && todayVol > 1.3 * avgVol && pctChg > 0) {
                                return {
                                    ...stock,
                                    ConsolidationRangePct: parseFloat(rangePct.toFixed(2)),
                                    RangeHigh: parseFloat(maxHigh.toFixed(2)),
                                    RangeLow: parseFloat(minLow.toFixed(2)),
                                    VolRatio: parseFloat((todayVol / avgVol).toFixed(2)),
                                    PctChange: parseFloat(pctChg.toFixed(2)),
                                    LTP: parseFloat(todayClose.toFixed(2))
                                };
                            }
                        }
                    }
                } catch (err) {
                    // Ignore error
                }
                return null;
            });

            const results = await Promise.all(promises);
            for (const r of results) {
                if (r) breakouts.push(r);
            }
        }

        breakouts.sort((a, b) => b.PctChange - a.PctChange);
        await saveBreakoutsToFirestore(breakouts, 'RangeBreakout', latestDate);
        res.json(breakouts);

    } catch (err) {
        console.error('Range Breakout Scanner error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/scanner/history?date=...&type=...
router.get('/history', async (req, res) => {
    try {
        const { date, type } = req.query;
        if (!type) {
            return res.status(400).json({ error: 'Type parameter required' });
        }

        // Fetch latest stocks for joining current price
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

        // Query Firestore collection 'breakout_history'
        const snapHistory = await db.collection('breakout_history').where('ScanType', '==', type).get();

        let formattedDate = date;
        if (date !== 'All') {
            if (!formattedDate || formattedDate === 'Latest' || formattedDate === 'undefined' || formattedDate === '') {
                const snapImports = await db.collection('imports').get();
                if (!snapImports.empty) {
                    const ids = snapImports.docs.map(doc => doc.id);
                    ids.sort((a, b) => b.localeCompare(a));
                    formattedDate = ids[0];
                } else {
                    formattedDate = new Date().toISOString().split('T')[0];
                }
            }
        }

        let historyList = snapHistory.docs.map(doc => {
            const h = doc.data();
            const curr = stocksMap[h.Symbol] || {};
            return {
                Symbol: h.Symbol,
                BreakoutDate: h.BreakoutDate,
                ScanType: h.ScanType,
                BreakoutPrice: h.LTP,
                BreakoutPctChange: h.PctChange,
                BreakoutVolume: h.Volume,
                Metrics: h.Metrics,
                CurrentPrice: curr.LTP || h.LTP,
                CurrentPctChange: curr.PctChange || 0,
                Sector: curr.Sector || 'Others'
            };
        });

        if (date !== 'All') {
            historyList = historyList.filter(h => h.BreakoutDate === formattedDate);
        }

        // Sort in memory: BreakoutDate desc, BreakoutPctChange desc
        historyList.sort((a, b) => {
            const dateCmp = b.BreakoutDate.localeCompare(a.BreakoutDate);
            if (dateCmp !== 0) return dateCmp;
            return (b.BreakoutPctChange || 0) - (a.BreakoutPctChange || 0);
        });

        res.json(historyList);
    } catch (err) {
        console.error('History fetch error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/scanner/supertrend-pullback
router.get('/supertrend-pullback', async (req, res) => {
    try {
        let targetDate = req.query.date;
        if (!targetDate || targetDate === 'Latest' || targetDate === 'undefined') {
            const snapImports = await db.collection('imports').get();
            if (snapImports.empty) return res.json([]);
            const ids = snapImports.docs.map(doc => doc.id);
            ids.sort((a, b) => b.localeCompare(a));
            targetDate = ids[0];
        }
        const allStocks = await getStocksForDate(targetDate);

        const stocks = allStocks.filter(s => (s.LTP || 0) > 20 && (s.Value || 0) > 5);
        stocks.sort((a, b) => (b.Value || 0) - (a.Value || 0));

        const pullbacks = [];
        const date2 = new Date();
        const date1 = new Date();
        date1.setDate(date1.getDate() - 40); // 40 days of history to compute ST(10,3)
        
        const queryOptions = {
            period1: date1.toISOString().split('T')[0],
            period2: date2.toISOString().split('T')[0],
            interval: '1d'
        };

        const chunkSize = 20;
        for (let i = 0; i < stocks.length; i += chunkSize) {
            const chunk = stocks.slice(i, i + chunkSize);
            const promises = chunk.map(async (stock) => {
                const symbol = stock.Symbol + '.NS';
                try {
                    const quotes = await yf.chart(symbol, queryOptions);
                    if (quotes && quotes.quotes && quotes.quotes.length > 15) {
                        const validQuotes = quotes.quotes.filter(q => q.high !== null && q.low !== null && q.close !== null);
                        if (validQuotes.length > 12) {
                            const { trend, st } = calculateSuperTrend(validQuotes, 10, 3);
                            if (trend.length >= 3) {
                                const lastIdx = trend.length - 1;
                                // Must be in a Bullish Trend currently
                                if (trend[lastIdx] === 1 && trend[lastIdx - 1] === 1) {
                                    const todayLow = validQuotes[lastIdx].low;
                                    const todayClose = validQuotes[lastIdx].close;
                                    const todayOpen = validQuotes[lastIdx].open;
                                    const todaySt = st[lastIdx];
                                    
                                    const prevLow = validQuotes[lastIdx - 1].low;
                                    const prevSt = st[lastIdx - 1];
                                    
                                    const prevDist = (prevLow - prevSt) / prevSt;
                                    const todayDist = (todayLow - todaySt) / todaySt;
                                    
                                    const isPrevCloseToST = prevDist >= 0 && prevDist <= 0.015;
                                    const isTodayCloseToST = todayDist >= 0 && todayDist <= 0.015;
                                    
                                    if (isPrevCloseToST || isTodayCloseToST) {
                                        // Confirm today is a green/bullish day (Close > Open or positive change)
                                        const isBullishToday = todayClose > todayOpen || (stock.PctChange || 0) > 0;
                                        if (isBullishToday) {
                                            const distPct = isTodayCloseToST ? (todayDist * 100).toFixed(2) : (prevDist * 100).toFixed(2);
                                            return {
                                                ...stock,
                                                BreakoutDate: targetDate,
                                                DistPct: parseFloat(distPct),
                                                SupportPrice: parseFloat((isTodayCloseToST ? todaySt : prevSt).toFixed(2))
                                            };
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (err) {
                    // Ignore individual fetch errors
                }
                return null;
            });
            
            const results = await Promise.all(promises);
            for (const r of results) {
                if (r) pullbacks.push(r);
            }
        }
        
        pullbacks.sort((a, b) => a.DistPct - b.DistPct); // Sort by proximity (closest first)
        await saveBreakoutsToFirestore(pullbacks, 'SuperTrendPullback', targetDate);
        res.json(pullbacks);
        
    } catch (err) {
        console.error('SuperTrend Pullback Scanner error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
