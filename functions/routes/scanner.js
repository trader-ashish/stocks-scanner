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
    return trend;
}

// GET /api/scanner/supertrend
router.get('/supertrend', async (req, res) => {
    try {
        // Get latest import date
        const snapImports = await db.collection('imports').get();
        if (snapImports.empty) return res.json([]);
        const ids = snapImports.docs.map(doc => doc.id);
        ids.sort((a, b) => b.localeCompare(a.id));
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
                            const trend = calculateSuperTrend(validQuotes, 10, 3);
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
        ids.sort((a, b) => b.localeCompare(a.id));
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

module.exports = router;
