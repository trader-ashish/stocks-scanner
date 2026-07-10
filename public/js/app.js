// ============================================================
// app.js - Nifty 500 Stock Scanner Frontend Logic
// ============================================================

const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '/api'
    : 'https://stocks-scanner.onrender.com/api';

// ===== STATE =====
let state = {
    currentPage: 'dashboard',
    currentDate: '',
    allStocksData: [],
    allStocksFiltered: [],
    charts: {},
    sortCol: 'Value',
    sortAsc: false,
    theme: 'dark'
};

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        document.getElementById('btnThemeToggle').textContent = '🌙';
        state.theme = 'light';
    }
}

function toggleTheme() {
    if (state.theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
        document.getElementById('btnThemeToggle').textContent = '🌙';
        state.theme = 'light';
    } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'dark');
        document.getElementById('btnThemeToggle').textContent = '☀️';
        state.theme = 'dark';
    }
    // Re-render current page to update charts
    navigate(state.currentPage);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initClock();
    initNavigation();
    initDragDrop();
    await checkDBConnection();
    await loadDates();
    await loadDashboard();
});

// ===== CLOCK =====
function initClock() {
    function updateClock() {
        const now = new Date();
        const t = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const d = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        document.getElementById('marketTime').textContent = `${d}  ${t}`;
    }
    updateClock();
    setInterval(updateClock, 1000);
}

// ===== DB CONNECTION CHECK =====
async function checkDBConnection() {
    const dot = document.querySelector('.status-dot');
    const label = document.querySelector('.db-status span');
    try {
        const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
            dot.className = 'status-dot connected';
            label.textContent = 'DB Connected';
        } else throw new Error();
    } catch {
        dot.className = 'status-dot error';
        label.textContent = 'DB Error';
    }
}

// ===== NAVIGATION =====
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateTo(page);
        });
    });
}

async function navigateTo(page) {
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`nav-${page}`)?.classList.add('active');

    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`)?.classList.add('active');

    state.currentPage = page;

    // Update topbar title
    const titles = {
        dashboard:  ['Dashboard', 'NSE Nifty 500 Market Overview'],
        intraday:   ['Intraday Picks', 'Today\'s High Momentum Stocks'],
        weekly:     ['Weekly Picks', 'Swing Trading Opportunities This Week'],
        swing:      ['Swing Picks', 'Top Momentum Stocks for Swing'],
        breakout:   ['Breakout Stocks', 'Near 52-Week High Breakout Candidates'],
        supertrend: ['SuperTrend Scans', 'Live Fresh Bullish Breakouts'],
        'vol-breakout': ['Volume Breakout Scans', 'Live Volume Spikes with Positive Price Action'],
        'range-breakout': ['Consolidation Breakout Scans', 'Live Tight Range Breakouts'],
        fundamentals: ['Fundamental Gems', 'Top 20 Strongest Fundamental Stocks'],
        sectors:    ['Sector Analysis', 'Sector-wise Performance & Insights'],
        watchlist:  ['My Watchlist', 'Your Starred Stocks'],
        portfolio:  ['Portfolio & P&L', 'Your Holdings with Live Profit & Loss'],
        allstocks:  ['All Stocks', 'Complete Nifty 500 Stock List'],
        import:     ['Import Data', 'Upload NSE CSV Market Data'],
        results:    ['Results Calendar', 'Upcoming & Past Quarterly Earnings'],
        indices:    ['Global & GIFT Nifty', 'Live International Markets & GIFT Nifty Ticker'],
        'manage-users': ['User Access Management', 'Control user access permissions and role elevations'],
    };
    const [title, sub] = titles[page] || ['', ''];
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = sub;
 
    // Load page data
    switch(page) {
        case 'dashboard':  await loadDashboard(); break;
        case 'indices':    await loadIndicesPage(); break;
        case 'intraday':   await loadIntradayData(); break;
        case 'weekly':     await loadWeeklyData(); break;
        case 'swing':      await loadSwingData(); break;
        case 'breakout':   await loadBreakoutData(); break;
        case 'supertrend': await loadSuperTrendHistory(); break;
        case 'vol-breakout': await loadVolumeBreakoutHistory(); break;
        case 'range-breakout': await loadRangeBreakoutHistory(); break;
        case 'fundamentals': await loadFundamentalsTable(); break;
        case 'sectors':    await loadSectorPage(); break;
        case 'watchlist':  await loadWatchlistData(); break;
        case 'portfolio':  await loadPortfolioPage(); break;
        case 'allstocks':  await loadAllStocks(); break;
        case 'import':     await loadImportHistory(); break;
        case 'results':    await loadResultsPage(); break;
        case 'manage-users': await loadManageUsersPage(); break;
    }
}

// ===== LOAD DATES =====
async function loadDates() {
    try {
        const dates = await fetchJSON(`${API}/import/dates`);
        const sel = document.getElementById('dateSelect');
        sel.innerHTML = '<option value="">Latest</option><option value="All">All History</option>';
        dates.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.ImportDate;
            opt.textContent = `${formatDate(d.ImportDate)} (${d.StockCount} stocks)`;
            sel.appendChild(opt);
        });
        sel.onchange = async () => {
            state.currentDate = sel.value;
            await navigateTo(state.currentPage);
        };
    } catch(e) { console.warn('Dates not loaded:', e); }
}

// ==========================================
// GLOBAL & GIFT NIFTY DASHBOARD
// ==========================================
async function loadIndicesPage() {
    try {
        // Fetch indices data from backend
        const data = await fetchJSON(`${API}/stocks/indices`);
        
        // Update Focus Cards
        // 1. GIFT Nifty
        if (data.giftnifty) {
            const gift = data.giftnifty;
            document.getElementById('idxGiftPrice').textContent = fmtNum(gift.price);
            
            const pct = gift.changePercent || 0;
            const changeVal = gift.change || 0;
            const sign = changeVal >= 0 ? '+' : '';
            document.getElementById('idxGiftChange').textContent = `${sign}${fmtNum(changeVal)} (${sign}${pct.toFixed(2)}%)`;
            document.getElementById('idxGiftChange').className = `index-focus-change ${pctClass(pct)}`;
            
            document.getElementById('idxGiftOpen').textContent = fmtNum(gift.open);
            document.getElementById('idxGiftHigh').textContent = fmtNum(gift.high);
            document.getElementById('idxGiftLow').textContent = fmtNum(gift.low);
            
            // Draw sparkline for GIFT Nifty
            renderSparkline('idxGiftChart', gift.quotes || []);
        }
        
        // 2. Nifty 50
        if (data.niftyMeta) {
            const ltp = data.niftyMeta.regularMarketPrice;
            const prev = data.niftyMeta.previousClose;
            const change = ltp - prev;
            const pct = prev > 0 ? (change / prev * 100) : 0;
            const sign = change >= 0 ? '+' : '';
            
            document.getElementById('idxNiftyPrice').textContent = fmtNum(ltp);
            document.getElementById('idxNiftyChange').textContent = `${sign}${fmtNum(change)} (${sign}${pct.toFixed(2)}%)`;
            document.getElementById('idxNiftyChange').className = `index-focus-change ${pctClass(pct)}`;
            
            const lastQuote = data.nifty && data.nifty.length > 0 ? data.nifty[data.nifty.length - 1] : null;
            document.getElementById('idxNiftyOpen').textContent = lastQuote ? fmtNum(lastQuote.open || prev) : '--';
            document.getElementById('idxNiftyHigh').textContent = lastQuote ? fmtNum(lastQuote.high || ltp) : '--';
            document.getElementById('idxNiftyLow').textContent = lastQuote ? fmtNum(lastQuote.low || ltp) : '--';
            
            renderSparkline('idxNiftyChart2', data.nifty || []);
        }

        // 3. Bank Nifty
        if (data.bankniftyMeta) {
            const ltp = data.bankniftyMeta.regularMarketPrice;
            const prev = data.bankniftyMeta.previousClose;
            const change = ltp - prev;
            const pct = prev > 0 ? (change / prev * 100) : 0;
            const sign = change >= 0 ? '+' : '';
            
            document.getElementById('idxBankPrice').textContent = fmtNum(ltp);
            document.getElementById('idxBankChange').textContent = `${sign}${fmtNum(change)} (${sign}${pct.toFixed(2)}%)`;
            document.getElementById('idxBankChange').className = `index-focus-change ${pctClass(pct)}`;
            
            const lastQuote = data.banknifty && data.banknifty.length > 0 ? data.banknifty[data.banknifty.length - 1] : null;
            document.getElementById('idxBankOpen').textContent = lastQuote ? fmtNum(lastQuote.open || prev) : '--';
            document.getElementById('idxBankHigh').textContent = lastQuote ? fmtNum(lastQuote.high || ltp) : '--';
            document.getElementById('idxBankLow').textContent = lastQuote ? fmtNum(lastQuote.low || ltp) : '--';
            
            renderSparkline('idxBankChart2', data.banknifty || []);
        }

        // 4. USD/INR
        const usdinr = data.global ? data.global.find(g => g.symbol === 'USDINR=X') : null;
        const usdPrice = usdinr ? usdinr.price : (data.global?.find(g => g.symbol === 'INR=X')?.price || 83.50);
        document.getElementById('idxUsdPrice').textContent = `₹${usdPrice.toFixed(3)}`;
        document.getElementById('idxUsdChange').textContent = usdinr ? `${usdinr.changePercent >= 0 ? '+' : ''}${usdinr.changePercent.toFixed(2)}%` : '--';
        document.getElementById('idxUsdChange').className = `index-focus-change ${usdinr ? pctClass(usdinr.changePercent) : 'neutral'}`;
        document.getElementById('idxUsdUpdated').textContent = `Last synced: ${new Date().toLocaleTimeString('en-IN')}`;

        // 5. Implied Gap Calculator
        if (data.niftyMeta && data.giftnifty && data.giftnifty.price > 0) {
            const niftySpot = data.niftyMeta.regularMarketPrice;
            const giftPrice = data.giftnifty.price;
            const gap = giftPrice - niftySpot;
            const gapPct = (gap / niftySpot) * 100;
            const gapSign = gap >= 0 ? '+' : '';
            
            document.getElementById('gapNiftySpot').textContent = `₹${fmtNum(niftySpot)}`;
            document.getElementById('gapGiftFutures').textContent = `₹${fmtNum(giftPrice)}`;
            document.getElementById('gapSpreadVal').textContent = `${gapSign}${fmtNum(gap)} (${gapSign}${gapPct.toFixed(2)}%)`;
            document.getElementById('gapSpreadVal').className = `gap-detail-val ${pctClass(gap)}`;
            
            const gapBadge = document.getElementById('gapBadge');
            const gapVal = document.getElementById('gapVal');
            const gapDesc = document.getElementById('gapDesc');
            const gapPointer = document.getElementById('gapPointer');
            
            if (Math.abs(gap) < 5) {
                gapBadge.textContent = 'Implied Opening: Neutral';
                gapBadge.className = 'gap-viz-badge';
                gapBadge.style.background = 'rgba(148,163,184,0.1)';
                gapBadge.style.color = '#94a3b8';
                gapBadge.style.borderColor = 'rgba(148,163,184,0.2)';
                
                gapVal.textContent = 'Flat Opening Expected';
                gapVal.style.color = 'var(--text-primary)';
                gapDesc.textContent = 'GIFT Nifty futures are trading in parity with Nifty 50 Spot. Expect a neutral market open.';
                gapPointer.style.left = '50%';
            } else if (gap >= 5) {
                const intensity = gap > 150 ? 'Strong' : (gap > 70 ? 'Moderate' : 'Mild');
                gapBadge.textContent = `Implied Opening: Gap-Up (${intensity})`;
                gapBadge.className = 'gap-viz-badge bullish';
                gapBadge.style.background = 'rgba(34,197,94,0.1)';
                gapBadge.style.color = '#22c55e';
                gapBadge.style.borderColor = 'rgba(34,197,94,0.2)';
                
                gapVal.textContent = `+${fmtNum(gap)} Points Gap-Up`;
                gapVal.style.color = 'var(--green)';
                gapDesc.textContent = `GIFT Nifty is trading at a premium of ${gap.toFixed(1)} pts. Indicates a positive pre-market opening sentiment.`;
                
                const ptrPos = 50 + Math.min(45, (gap / 200) * 45); // Max out at +200 points
                gapPointer.style.left = `${ptrPos}%`;
            } else {
                const intensity = gap < -150 ? 'Strong' : (gap < -70 ? 'Moderate' : 'Mild');
                gapBadge.textContent = `Implied Opening: Gap-Down (${intensity})`;
                gapBadge.className = 'gap-viz-badge bearish';
                gapBadge.style.background = 'rgba(239,68,68,0.1)';
                gapBadge.style.color = '#ef4444';
                gapBadge.style.borderColor = 'rgba(239,68,68,0.2)';
                
                gapVal.textContent = `${fmtNum(gap)} Points Gap-Down`;
                gapVal.style.color = 'var(--red)';
                gapDesc.textContent = `GIFT Nifty is trading at a discount of ${Math.abs(gap).toFixed(1)} pts. Indicates a weak or defensive market opening sentiment.`;
                
                const ptrPos = 50 - Math.min(45, (Math.abs(gap) / 200) * 45); // Max out at -200 points
                gapPointer.style.left = `${ptrPos}%`;
            }
        } else {
            document.getElementById('gapVal').textContent = 'Live Market Session Active';
            document.getElementById('gapDesc').textContent = 'Pre-market gap estimate is active outside market hours or when pre-market session starts (9:00 AM).';
        }

        // 6. Render Global Index Cards
        if (data.global && data.global.length > 0) {
            data.global.forEach(g => {
                if (g.symbol.includes('INR=X')) return;
                
                const pEl = document.getElementById(`gIdxPrice-${g.symbol}`);
                const cEl = document.getElementById(`gIdxChange-${g.symbol}`);
                if (pEl && cEl) {
                    pEl.textContent = fmtNum(g.price);
                    
                    const pct = g.changePercent || 0;
                    const val = g.change || 0;
                    const sign = val >= 0 ? '+' : '';
                    cEl.textContent = `${sign}${fmtNum(val)} (${sign}${pct.toFixed(2)}%)`;
                    cEl.className = `global-idx-change ${pctClass(pct)}`;
                    
                    renderSparkline(`gIdxChart-${g.symbol}`, g.quotes || []);
                }
            });
        }

        // 7. Update Comparison Table
        const tbody = document.getElementById('tbodyIndicesCompare');
        if (tbody) {
            const tableRows = [];
            
            const addIndexRow = (name, symbol, price, change, changePercent, open, high, low) => {
                const sign = change >= 0 ? '+' : '';
                const isRs = symbol === '^NSEI' || symbol === '^NSEBANK' || symbol === 'GIFT Nifty';
                const isUsd = symbol.endsWith('=F');
                const prefix = isRs ? '₹' : (isUsd ? '$' : '');
                return `
                <tr>
                    <td><strong>${name}</strong></td>
                    <td class="neutral-val" style="font-family:'JetBrains Mono',monospace;">${symbol}</td>
                    <td style="font-weight:600;">${prefix}${fmtNum(price)}</td>
                    <td class="${pctClass(change)}">${sign}${fmtNum(change)}</td>
                    <td><span class="pct-badge ${pctClass(changePercent)}">${sign}${changePercent.toFixed(2)}%</span></td>
                    <td>${prefix}${fmtNum(open)}</td>
                    <td>${prefix}${fmtNum(high)}</td>
                    <td>${prefix}${fmtNum(low)}</td>
                </tr>`;
            };

            if (data.niftyMeta) {
                const m = data.niftyMeta;
                const prev = m.previousClose || 0;
                const last = m.regularMarketPrice || 0;
                const change = last - prev;
                const pct = prev > 0 ? (change / prev * 100) : 0;
                const lastQ = data.nifty && data.nifty.length > 0 ? data.nifty[data.nifty.length - 1] : null;
                tableRows.push(addIndexRow('Nifty 50 (Spot)', '^NSEI', last, change, pct, lastQ?.open || prev, lastQ?.high || last, lastQ?.low || last));
            }
            if (data.bankniftyMeta) {
                const m = data.bankniftyMeta;
                const prev = m.previousClose || 0;
                const last = m.regularMarketPrice || 0;
                const change = last - prev;
                const pct = prev > 0 ? (change / prev * 100) : 0;
                const lastQ = data.banknifty && data.banknifty.length > 0 ? data.banknifty[data.banknifty.length - 1] : null;
                tableRows.push(addIndexRow('Nifty Bank', '^NSEBANK', last, change, pct, lastQ?.open || prev, lastQ?.high || last, lastQ?.low || last));
            }
            if (data.giftnifty && data.giftnifty.price > 0) {
                const g = data.giftnifty;
                tableRows.push(addIndexRow('GIFT Nifty', 'GIFT Nifty', g.price, g.change, g.changePercent, g.open, g.high, g.low));
            }
            if (data.global && data.global.length > 0) {
                data.global.forEach(g => {
                    if (g.symbol.includes('INR=X')) return;
                    const lastQ = g.quotes && g.quotes.length > 0 ? g.quotes[g.quotes.length - 1] : null;
                    tableRows.push(addIndexRow(g.name, g.symbol, g.price, g.change, g.changePercent, lastQ?.open || g.previousClose, lastQ?.high || g.price, lastQ?.low || g.price));
                });
            }

            tbody.innerHTML = tableRows.join('');
        }

        document.getElementById('idxLastSynced').textContent = new Date().toLocaleTimeString('en-IN');
        
        // Populate clocks immediately on load
        updateMarketClocks();

    } catch(e) {
        console.error("Error loading indices page:", e);
        showToast("Error loading indices dashboard: " + e.message, "error");
    }
}

// Timezone status clocks calculator
function updateMarketClocks() {
    if (state.currentPage !== 'indices') return;

    const markets = [
        {
            name: 'Mumbai',
            tz: 'Asia/Kolkata',
            openHr: 9, openMin: 15, closeHr: 15, closeMin: 30
        },
        {
            name: 'NewYork',
            tz: 'America/New_York',
            openHr: 9, openMin: 30, closeHr: 16, closeMin: 0
        },
        {
            name: 'London',
            tz: 'Europe/London',
            openHr: 8, openMin: 0, closeHr: 16, closeMin: 30
        },
        {
            name: 'Tokyo',
            tz: 'Asia/Tokyo',
            openHr: 9, openMin: 0, closeHr: 15, closeMin: 0
        }
    ];

    markets.forEach(m => {
        try {
            const nowStr = new Date().toLocaleString("en-US", { timeZone: m.tz });
            const localDate = new Date(nowStr);
            
            const hours = localDate.getHours();
            const minutes = localDate.getMinutes();
            const seconds = localDate.getSeconds();
            const day = localDate.getDay();

            const timeFormatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            
            const timeEl = document.getElementById(`clkTime-${m.name}`);
            const dotEl = document.getElementById(`clkDot-${m.name}`);
            const cardEl = document.getElementById(`clkCard-${m.name}`);

            if (timeEl) timeEl.textContent = timeFormatted;

            const isWeekday = day >= 1 && day <= 5;
            const currentTotalMin = hours * 60 + minutes;
            const openTotalMin = m.openHr * 60 + m.openMin;
            const closeTotalMin = m.closeHr * 60 + m.closeMin;
            
            const isOpen = isWeekday && (currentTotalMin >= openTotalMin && currentTotalMin < closeTotalMin);

            if (dotEl) {
                if (isOpen) {
                    dotEl.className = 'clock-status-dot open';
                    if (cardEl) cardEl.style.borderColor = 'rgba(34, 197, 94, 0.2)';
                } else {
                    dotEl.className = 'clock-status-dot';
                    if (cardEl) cardEl.style.borderColor = 'rgba(239, 68, 68, 0.1)';
                }
            }
        } catch (err) {
            console.warn(`Clock update failed for ${m.name}:`, err);
        }
    });
}

// ===== DASHBOARD =====
async function loadDashboard() {
    const date = state.currentDate;
    await Promise.all([
        loadSummary(date),
        loadTopMovers(date),
        loadSectorHeatmap(date),
        loadSectorOverviewList(date),
        loadMiniWidgets(date)
    ]);
}

async function loadSummary(date) {
    try {
        const data = await fetchJSON(`${API}/stocks/summary${date ? `?date=${date}` : ''}`);
        document.getElementById('totalStocks').textContent   = fmt(data.TotalStocks);
        document.getElementById('totalGainers').textContent  = fmt(data.Gainers);
        document.getElementById('totalLosers').textContent   = fmt(data.Losers);
        document.getElementById('totalUnchanged').textContent = fmt(data.Unchanged);
        document.getElementById('totalValue').textContent    = formatCr(data.TotalValue);
        const avg = data.AvgPctChange;
        document.getElementById('avgChange').textContent = (avg > 0 ? '+' : '') + (avg?.toFixed(2) ?? '--') + '%';
        document.getElementById('avgChange').className = avg >= 0 ? 'card-value gain' : 'card-value loss';

        // Breadth chart
        renderBreadthChart(data.Gainers, data.Losers, data.Unchanged);
    } catch(e) { console.error('Summary error:', e); }
}

async function loadTopMovers(date) {
    try {
        const [gainers, losers] = await Promise.all([
            fetchJSON(`${API}/stocks/top-gainers${date ? `?date=${date}&limit=10` : '?limit=10'}`),
            fetchJSON(`${API}/stocks/top-losers${date ? `?date=${date}&limit=10` : '?limit=10'}`)
        ]);

        document.getElementById('topGainersList').innerHTML = gainers.map((s, i) => `
            <div class="mover-item">
                <span class="mover-rank">${i+1}</span>
                <span class="mover-symbol">${s.Symbol}</span>
                <span class="mover-sector">${s.Sector || ''}</span>
                <span class="mover-ltp">₹${fmtNum(s.LTP)}</span>
                <span class="mover-change gain">+${s.PctChange?.toFixed(2)}%</span>
            </div>`).join('');

        document.getElementById('topLosersList').innerHTML = losers.map((s, i) => `
            <div class="mover-item">
                <span class="mover-rank">${i+1}</span>
                <span class="mover-symbol">${s.Symbol}</span>
                <span class="mover-sector">${s.Sector || ''}</span>
                <span class="mover-ltp">₹${fmtNum(s.LTP)}</span>
                <span class="mover-change loss">${s.PctChange?.toFixed(2)}%</span>
            </div>`).join('');
    } catch(e) { console.error('Movers error:', e); }
}

async function loadSectorHeatmap(date) {
    try {
        const sectors = await fetchJSON(`${API}/analysis/sector-heatmap${date ? `?date=${date}` : ''}`);
        const grid = document.getElementById('sectorHeatmap');

        if (!sectors.length) {
            grid.innerHTML = noDataHtml('No sector data available. Please import CSV first.');
            return;
        }

        const maxAbs = Math.max(...sectors.map(s => Math.abs(s.AvgPctChange || 0)), 1);

        grid.innerHTML = sectors.map(s => {
            const pct = s.AvgPctChange || 0;
            const intensity = Math.min(Math.abs(pct) / maxAbs, 1);
            const isGain = pct >= 0;
            const bg = isGain
                ? `rgba(34,197,94,${0.1 + intensity * 0.45})`
                : `rgba(239,68,68,${0.1 + intensity * 0.45})`;
            const color = isGain ? '#86efac' : '#fca5a5';

            return `
            <div class="heatmap-cell" style="background:${bg}; border: 1px solid ${color}22; cursor: pointer;"
                 title="${s.Sector}: Gainers ${s.Gainers}, Losers ${s.Losers}"
                 onclick="openSectorModal('${s.Sector.replace(/'/g, "\\'")}')">
                <div class="heatmap-sector" style="color:${color}">${s.Sector}</div>
                <div class="heatmap-pct" style="color:${color}">${pct >= 0 ? '+' : ''}${pct?.toFixed(2)}%</div>
                <div class="heatmap-sub" style="color:${color}">${s.StockCount} stocks · ₹${formatCr(s.TotalValue)}Cr</div>
            </div>`;
        }).join('');
    } catch(e) { console.error('Heatmap error:', e); }
}

async function loadSectorAvgChart(date) {
    try {
        const sectors = await fetchJSON(`${API}/analysis/sector-heatmap${date ? `?date=${date}` : ''}`);
        if (!sectors.length) return;

        const labels = sectors.map(s => s.Sector);
        const values = sectors.map(s => parseFloat(s.AvgPctChange) || 0);
        const colors = values.map(v => v >= 0 ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)');
        const borders = values.map(v => v >= 0 ? '#22c55e' : '#ef4444');

        if (state.charts.sectorAvg) state.charts.sectorAvg.destroy();
        const ctx = document.getElementById('sectorAvgChart').getContext('2d');
        state.charts.sectorAvg = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Avg % Change',
                    data: values,
                    backgroundColor: colors,
                    borderColor: borders,
                    borderWidth: 1,
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: { label: ctx => ` ${ctx.raw >= 0 ? '+' : ''}${ctx.raw.toFixed(2)}%` }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim(), font: { size: 10 }, maxRotation: 45 },
                        grid: { color: 'rgba(148,163,184,0.06)' }
                    },
                    y: {
                        ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim(), callback: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` },
                        grid: { color: 'rgba(148,163,184,0.06)' }
                    }
                }
            }
        });
    } catch(e) { console.error('Sector chart error:', e); }
}

function renderBreadthChart(gainers, losers, unchanged) {
    if (state.charts.breadth) state.charts.breadth.destroy();
    const ctx = document.getElementById('breadthChart').getContext('2d');
    state.charts.breadth = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Gainers', 'Losers', 'Unchanged'],
            datasets: [{
                data: [gainers || 0, losers || 0, unchanged || 0],
                backgroundColor: ['rgba(34,197,94,0.8)', 'rgba(239,68,68,0.8)', 'rgba(71,85,105,0.6)'],
                borderColor: ['#22c55e', '#ef4444', '#475569'],
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            cutout: '68%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim(), padding: 16, font: { size: 11 } }
                }
            }
        }
    });
}

// ===== INTRADAY =====
async function loadIntradayData() {
    const date = state.currentDate;
    const biasFilter = document.getElementById('intradayBiasFilter')?.value || 'all';
    const sectorFilter = document.getElementById('intradaySectorFilter')?.value || '';

    document.getElementById('intradayTableBody').innerHTML =
        `<tr><td colspan="12" class="loading-row"><div class="loading-pulse">Analyzing intraday picks...</div></td></tr>`;

    try {
        let data = await fetchJSON(`${API}/analysis/intraday${date ? `?date=${date}` : ''}`);

        // Populate sector filter
        await populateSectorFilter('intradaySectorFilter', data);

        if (biasFilter !== 'all') data = data.filter(s => s.Bias === biasFilter);
        if (sectorFilter) data = data.filter(s => s.Sector === sectorFilter);

        document.getElementById('badge-intraday').textContent = data.length;

        if (!data.length) {
            document.getElementById('intradayTableBody').innerHTML =
                `<tr><td colspan="12">${noDataHtml('No intraday picks found. Import CSV data first.')}</td></tr>`;
            return;
        }

        const maxScore = Math.max(...data.map(s => s.IntradayScore || 0), 1);

        document.getElementById('intradayTableBody').innerHTML = data.map((s, i) => `
        <tr>
            <td class="neutral-val">${i+1}</td>
            <td class="symbol-cell">
        <span class="star-icon" onclick="toggleWatchlist('${s.Symbol}')" id="star-${s.Symbol}">${isWatchlisted(s.Symbol)?'⭐':'☆'}</span> 
        <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${s.Symbol}')">${s.Symbol}</a>
    </td>
            <td><span class="sector-pill">${s.Sector || 'Others'}</span></td>
            <td>₹${fmtNum(s.LTP)}</td>
            <td>₹${fmtNum(s.Open)}</td>
            <td><span class="pct-badge ${pctClass(s.PctChange)}">${signedPct(s.PctChange)}</span></td>
            <td class="neutral-val">${fmtVol(s.Volume)}</td>
            <td class="${s.Value >= 100 ? 'gain' : ''}">${fmtNum(s.Value)}</td>
            <td class="neutral-val">₹${fmtNum(s.High52W)}</td>
            <td class="${(s.PctFromHigh52W < 5) ? 'gain' : 'neutral-val'}">${fmtNum(s.PctFromHigh52W)}%</td>
            <td><span class="bias-badge ${s.Bias === 'BULLISH' ? 'bullish' : 'bearish'}">${s.Bias === 'BULLISH' ? '🟢 Bull' : '🔴 Bear'}</span></td>
            <td>
                <div class="score-bar-wrap">
                    <span class="score-val">${Math.round(s.IntradayScore)}</span>
                    <div class="score-bar"><div class="score-fill" style="width:${(s.IntradayScore/maxScore*100).toFixed(0)}%"></div></div>
                </div>
            </td>
        </tr>`).join('');
    } catch(e) {
        console.error(e);
        document.getElementById('intradayTableBody').innerHTML =
            `<tr><td colspan="12" class="loading-row" style="color:#ef4444">Error: ${e.message}</td></tr>`;
    }
}
async function filterTop10BullishSectors() {
    const date = state.currentDate;
    document.getElementById('intradayTableBody').innerHTML =
        `<tr><td colspan="12" class="loading-row"><div class="loading-pulse">Analyzing bullish sectors...</div></td></tr>`;

    try {
        // 1. Get Sector Heatmap to find Bullish Sectors
        const sectorData = await fetchJSON(`${API}/analysis/sector-heatmap${date ? `?date=${date}` : ''}`);
        const bullishSectors = sectorData.filter(s => s.AvgPctChange > 0).map(s => s.Sector);

        // 2. Get Intraday Data
        let data = await fetchJSON(`${API}/analysis/intraday${date ? `?date=${date}` : ''}`);

        // 3. Filter Intraday Data to ONLY include stocks from Bullish Sectors
        data = data.filter(s => bullishSectors.includes(s.Sector || 'Others'));

        // 4. Enforce Bullish Bias
        data = data.filter(s => s.Bias === 'BULLISH');

        // 5. Slice Top 10
        data = data.slice(0, 10);

        document.getElementById('badge-intraday').textContent = data.length + " (Bullish Top 10)";

        if (!data.length) {
            document.getElementById('intradayTableBody').innerHTML =
                `<tr><td colspan="12">${noDataHtml('No bullish sector stocks found for intraday.')}</td></tr>`;
            return;
        }

        const maxScore = Math.max(...data.map(s => s.IntradayScore || 0), 1);

        document.getElementById('intradayTableBody').innerHTML = data.map((s, i) => `
        <tr>
            <td class="neutral-val">${i+1}</td>
            <td class="symbol-cell">
        <span class="star-icon" onclick="toggleWatchlist('${s.Symbol}')" id="star-${s.Symbol}">${isWatchlisted(s.Symbol)?'⭐':'☆'}</span> 
        <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${s.Symbol}')">${s.Symbol}</a>
    </td>
            <td><span class="sector-pill">${s.Sector || 'Others'}</span></td>
            <td>₹${fmtNum(s.LTP)}</td>
            <td>₹${fmtNum(s.Open)}</td>
            <td><span class="pct-badge ${pctClass(s.PctChange)}">${signedPct(s.PctChange)}</span></td>
            <td class="neutral-val">${fmtVol(s.Volume)}</td>
            <td>₹${formatCr(s.Value)}</td>
            <td><span class="pct-badge ${s.PctFromHigh52W < 5 ? 'gain' : 'neutral'}">${s.PctFromHigh52W}%</span></td>
            <td><span class="pct-badge ${s.PricePosition52W > 80 ? 'gain' : 'neutral'}">${s.PricePosition52W}%</span></td>
            <td><span class="badge ${s.Bias === 'BULLISH' ? 'bullish' : 'bearish'}">${s.Bias}</span></td>
            <td>
                <div class="score-bar-bg">
                    <div class="score-bar-fill" style="width: ${(s.IntradayScore/maxScore)*100}%"></div>
                </div>
                <span style="font-size: 0.75rem; margin-top:4px; display:block;">Score: ${s.IntradayScore}</span>
            </td>
        </tr>`).join('');
    } catch (e) {
        console.error(e);
        document.getElementById('intradayTableBody').innerHTML = `<p style="color:#ef4444">Error: ${e.message}</p>`;
    }
}

// ===== WEEKLY =====
async function loadWeeklyData() {
    const date = state.currentDate;
    const sectorFilter = document.getElementById('weeklySectorFilter')?.value || '';

    document.getElementById('weeklyTableBody').innerHTML =
        `<tr><td colspan="12" class="loading-row"><div class="loading-pulse">Analyzing weekly picks...</div></td></tr>`;

    try {
        let data = await fetchJSON(`${API}/analysis/weekly${date ? `?date=${date}` : ''}`);

        await populateSectorFilter('weeklySectorFilter', data);
        if (sectorFilter) data = data.filter(s => s.Sector === sectorFilter);

        document.getElementById('badge-weekly').textContent = data.length;

        if (!data.length) {
            document.getElementById('weeklyTableBody').innerHTML =
                `<tr><td colspan="12">${noDataHtml('No weekly picks found.')}</td></tr>`;
            return;
        }

        const maxScore = Math.max(...data.map(s => s.WeeklyScore || 0), 1);

        document.getElementById('weeklyTableBody').innerHTML = data.map((s, i) => `
        <tr>
            <td class="neutral-val">${i+1}</td>
            <td class="symbol-cell">
        <span class="star-icon" onclick="toggleWatchlist('${s.Symbol}')" id="star-${s.Symbol}">${isWatchlisted(s.Symbol)?'⭐':'☆'}</span> 
        <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${s.Symbol}')">${s.Symbol}</a>
    </td>
            <td><span class="sector-pill">${s.Sector || 'Others'}</span></td>
            <td>₹${fmtNum(s.LTP)}</td>
            <td><span class="pct-badge ${pctClass(s.PctChange)}">${signedPct(s.PctChange)}</span></td>
            <td><span class="pct-badge ${pctClass(s.Chng30D)}">${signedPct(s.Chng30D)}</span></td>
            <td><span class="pct-badge ${pctClass(s.Chng365D)}">${signedPct(s.Chng365D)}</span></td>
            <td class="${s.Value >= 50 ? 'gain' : ''}">${fmtNum(s.Value)}</td>
            <td class="neutral-val">₹${fmtNum(s.High52W)}</td>
            <td class="${(s.PctFromHigh52W < 10) ? 'gain' : 'neutral-val'}">${fmtNum(s.PctFromHigh52W)}%</td>
            <td class="gain">${fmtNum(s.PctFromLow52W)}%</td>
            <td>
                <div class="score-bar-wrap">
                    <span class="score-val">${Math.round(s.WeeklyScore)}</span>
                    <div class="score-bar"><div class="score-fill" style="width:${(s.WeeklyScore/maxScore*100).toFixed(0)}%;background:#8b5cf6"></div></div>
                </div>
            </td>
        </tr>`).join('');
    } catch(e) {
        console.error(e);
        document.getElementById('weeklyTableBody').innerHTML =
            `<tr><td colspan="12" class="loading-row" style="color:#ef4444">Error: ${e.message}</td></tr>`;
    }
}

// ===== SWING =====
async function loadSwingData() {
    const date = state.currentDate;
    document.getElementById('swingTableBody').innerHTML = '<tr><td colspan="11" class="loading-row"><div class="loading-pulse">Analyzing sector rotation...</div></td></tr>';

    try {
        const data = await fetchJSON(`${API}/analysis/swing${date ? '?date=' + date : ''}`);
        const maxScore = Math.max(...data.map(d => d.SwingScore || 0));

        if (!data || data.length === 0) {
            document.getElementById('swingTableBody').innerHTML = '<tr><td colspan="11" class="loading-row" style="color:var(--text-muted)">No swing stocks found matching criteria.</td></tr>';
            document.getElementById('badge-swing').textContent = '0';
            return;
        }

        document.getElementById('badge-swing').textContent = data.length;

        document.getElementById('swingTableBody').innerHTML = data.map((d, i) => `
            <tr>
                <td style="color:var(--text-muted)">${i + 1}</td>
                <td class="symbol-cell">
                    <span class="star-icon" onclick="toggleWatchlist('${d.Symbol}')" id="star-${d.Symbol}">${isWatchlisted(d.Symbol)?'⭐':'☆'}</span> 
                    <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${d.Symbol}')">${d.Symbol}</a>
                </td>
                <td><span class="sector-pill">${d.Sector}</span></td>
                <td>₹${fmt(d.LTP)}</td>
                <td class="${d.PctChange >= 0 ? 'gain' : 'loss'}">
                    ${d.PctChange >= 0 ? '▲' : '▼'} ${fmt(d.PctChange)}%
                </td>
                <td class="${d.Chng30D >= 0 ? 'gain' : 'loss'}">${fmt(d.Chng30D)}%</td>
                <td class="${d.SectorAvg30D >= 0 ? 'gain' : 'loss'}">${fmt(d.SectorAvg30D)}%</td>
                <td class="neutral-val">${fmt(d.Value)}</td>
                <td class="neutral-val">₹${fmt(d.High52W)}</td>
                <td>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${Math.min(100, d.PctFromHigh52W * 2)}%; background: ${d.PctFromHigh52W < 10 ? 'var(--green)' : 'var(--accent)'};"></div>
                    </div>
                    <span style="font-size:0.75rem; margin-top:0.25rem; display:block">${fmt(d.PctFromHigh52W)}%</span>
                </td>
                <td>
                    <div class="score-bar">
                        <div class="score-fill" style="width: ${(d.SwingScore / maxScore) * 100}%"></div>
                    </div>
                    <span style="font-size:0.75rem; margin-top:0.25rem; display:block">${fmt(d.SwingScore)} pts</span>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        document.getElementById('swingTableBody').innerHTML = `<tr><td colspan="11" class="loading-row error">Error loading swing data: ${e.message}</td></tr>`;
    }
}

// ===== BREAKOUT =====
async function loadBreakoutData() {
    const date = state.currentDate;
    document.getElementById('breakoutTableBody').innerHTML =
        `<tr><td colspan="12" class="loading-row"><div class="loading-pulse">Finding breakout stocks...</div></td></tr>`;

    try {
        const data = await fetchJSON(`${API}/analysis/breakout${date ? `?date=${date}` : ''}`);

        if (!data.length) {
            document.getElementById('breakoutTableBody').innerHTML =
                `<tr><td colspan="12">${noDataHtml('No breakout stocks found.')}</td></tr>`;
            return;
        }

        document.getElementById('breakoutTableBody').innerHTML = data.map((s, i) => `
        <tr>
            <td class="neutral-val">${i+1}</td>
            <td class="symbol-cell">
        <span class="star-icon" onclick="toggleWatchlist('${s.Symbol}')" id="star-${s.Symbol}">${isWatchlisted(s.Symbol)?'⭐':'☆'}</span> 
        <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${s.Symbol}')">${s.Symbol}</a>
    </td>
            <td><span class="sector-pill">${s.Sector || 'Others'}</span></td>
            <td>₹${fmtNum(s.LTP)}</td>
            <td class="gain">₹${fmtNum(s.High52W)}</td>
            <td class="${s.PctFromHigh52W < 3 ? 'gain' : 'neutral-val'}">${fmtNum(s.PctFromHigh52W)}%</td>
            <td class="neutral-val">₹${fmtNum(s.Low52W)}</td>
            <td class="gain">${fmtNum(s.PctFromLow52W)}%</td>
            <td><span class="pct-badge ${pctClass(s.PctChange)}">${signedPct(s.PctChange)}</span></td>
            <td><span class="pct-badge ${pctClass(s.Chng30D)}">${signedPct(s.Chng30D)}</span></td>
            <td><span class="pct-badge ${pctClass(s.Chng365D)}">${signedPct(s.Chng365D)}</span></td>
            <td>${fmtNum(s.Value)}</td>
        </tr>`).join('');
    } catch(e) {
        console.error(e);
        document.getElementById('breakoutTableBody').innerHTML =
            `<tr><td colspan="12" class="loading-row" style="color:#ef4444">Error: ${e.message}</td></tr>`;
    }
}

// ===== SUPERTREND SCANNER =====
async function runSuperTrendScan() {
    const btn = document.getElementById('btnRunSuperTrend');
    const loading = document.getElementById('stScanLoading');
    const tbody = document.getElementById('supertrendTableBody');
    
    btn.disabled = true;
    btn.innerHTML = 'Scanning...';
    loading.style.display = 'block';
    tbody.innerHTML = '';

    try {
        const data = await fetchJSON(`${API}/scanner/supertrend`);
        
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '▶️ Run Live Scan';

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8">${noDataHtml('No fresh SuperTrend breakouts found today.')}</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map((s, i) => {
            const bDate = s.BreakoutDate ? new Date(s.BreakoutDate).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');
            return `
            <tr>
                <td class="symbol-cell">
                    <span class="star-icon" onclick="toggleWatchlist('${s.Symbol}')" id="star-${s.Symbol}">${isWatchlisted(s.Symbol)?'⭐':'☆'}</span> 
                    <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${s.Symbol}')">${s.Symbol}</a>
                </td>
                <td><span class="sector-pill">${s.Sector || 'Others'}</span></td>
                <td style="font-weight: 500;">📅 ${bDate}</td>
                <td class="gain">₹${fmtNum(s.LTP)}</td>
                <td style="font-weight: 600; color: var(--text-primary);">₹${fmtNum(s.LTP)}</td>
                <td><span class="pct-badge pct-zero">0.00%</span></td>
                <td style="color: var(--text-muted); font-size: 0.8rem;">SuperTrend</td>
                <td><button class="btn-premium" onclick="openStockModal('${s.Symbol}')" style="padding: 5px 10px; font-size: 0.8rem;">View Chart</button></td>
            </tr>`;
        }).join('');
    } catch(e) {
        console.error(e);
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '▶️ Run Live Scan';
        tbody.innerHTML = `<tr><td colspan="8" class="loading-row" style="color:#ef4444">Error running scan: ${e.message}</td></tr>`;
    }
}

// ===== VOLUME BREAKOUT SCANNER =====
async function runVolumeBreakoutScan() {
    const btn = document.getElementById('btnRunVolBreakout');
    const loading = document.getElementById('volScanLoading');
    const tbody = document.getElementById('volBreakoutTableBody');
    
    btn.disabled = true;
    btn.innerHTML = 'Scanning...';
    loading.style.display = 'block';
    tbody.innerHTML = '';

    try {
        const data = await fetchJSON(`${API}/scanner/volume-breakout`);
        
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '▶️ Run Live Scan';

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8">${noDataHtml('No volume breakouts found today.')}</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map((s, i) => {
            const bDate = new Date().toLocaleDateString('en-IN');
            return `
            <tr>
                <td class="symbol-cell">
                    <span class="star-icon" onclick="toggleWatchlist('${s.Symbol}')" id="star-${s.Symbol}">${isWatchlisted(s.Symbol)?'⭐':'☆'}</span> 
                    <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${s.Symbol}')">${s.Symbol}</a>
                </td>
                <td><span class="sector-pill">${s.Sector || 'Others'}</span></td>
                <td style="font-weight: 500;">📅 ${bDate}</td>
                <td class="gain">₹${fmtNum(s.LTP)}</td>
                <td style="font-weight: 600; color: var(--text-primary);">₹${fmtNum(s.LTP)}</td>
                <td><span class="pct-badge pct-zero">0.00%</span></td>
                <td style="color: var(--text-muted); font-size: 0.8rem; font-weight:600;">${s.VolRatio}x Vol (Avg: ${fmtNum(s.AvgVolume20D)})</td>
                <td><button class="btn-premium" onclick="openStockModal('${s.Symbol}')" style="padding: 5px 10px; font-size: 0.8rem;">View Chart</button></td>
            </tr>`;
        }).join('');
    } catch(e) {
        console.error(e);
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '▶️ Run Live Scan';
        tbody.innerHTML = `<tr><td colspan="8" class="loading-row" style="color:#ef4444">Error running scan: ${e.message}</td></tr>`;
    }
}

// ===== CONSOLIDATION / RANGE BREAKOUT SCANNER =====
async function runRangeBreakoutScan() {
    const btn = document.getElementById('btnRunRangeBreakout');
    const loading = document.getElementById('rangeScanLoading');
    const tbody = document.getElementById('rangeBreakoutTableBody');
    
    btn.disabled = true;
    btn.innerHTML = 'Scanning...';
    loading.style.display = 'block';
    tbody.innerHTML = '';

    try {
        const data = await fetchJSON(`${API}/scanner/range-breakout`);
        
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '▶️ Run Live Scan';

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8">${noDataHtml('No consolidation range breakouts found today.')}</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map((s, i) => {
            const bDate = new Date().toLocaleDateString('en-IN');
            return `
            <tr>
                <td class="symbol-cell">
                    <span class="star-icon" onclick="toggleWatchlist('${s.Symbol}')" id="star-${s.Symbol}">${isWatchlisted(s.Symbol)?'⭐':'☆'}</span> 
                    <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${s.Symbol}')">${s.Symbol}</a>
                </td>
                <td><span class="sector-pill">${s.Sector || 'Others'}</span></td>
                <td style="font-weight: 500;">📅 ${bDate}</td>
                <td class="gain">₹${fmtNum(s.LTP)}</td>
                <td style="font-weight: 600; color: var(--text-primary);">₹${fmtNum(s.LTP)}</td>
                <td><span class="pct-badge pct-zero">0.00%</span></td>
                <td style="color: var(--text-muted); font-size: 0.8rem;">Range: ${s.ConsolidationRangePct}%, VolRatio: ${s.VolRatio}x</td>
                <td><button class="btn-premium" onclick="openStockModal('${s.Symbol}')" style="padding: 5px 10px; font-size: 0.8rem;">View Chart</button></td>
            </tr>`;
        }).join('');
    } catch(e) {
        console.error(e);
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '▶️ Run Live Scan';
        tbody.innerHTML = `<tr><td colspan="8" class="loading-row" style="color:#ef4444">Error running scan: ${e.message}</td></tr>`;
    }
}

// ===== FUNDAMENTALS SCANNER =====
async function runFundamentalScan() {
    const btn = document.getElementById('btnRunFundamentals');
    const loading = document.getElementById('fundScanLoading');
    const tbody = document.getElementById('fundamentalTableBody');
    
    btn.disabled = true;
    btn.innerHTML = 'Scanning...';
    loading.style.display = 'block';
    tbody.innerHTML = '';

    try {
        const data = await fetchJSON(`${API}/scanner/fundamentals`);
        
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '▶️ Run Fundamental Scan';

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10">${noDataHtml('No fundamental data found.')}</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map((s, i) => {
            // formatting helpers
            const fmtPE = s.PE ? s.PE.toFixed(2) : '-';
            const fmtROE = s.ROE ? s.ROE.toFixed(2) : '-';
            const fmtDE = s.DE ? s.DE.toFixed(2) : '-';
            const fmtMargin = s.Margin ? s.Margin.toFixed(2) : '-';
            
            // color classes based on goodness
            const peClass = (s.PE > 0 && s.PE < 25) ? 'gain' : (s.PE > 40 ? 'loss' : 'neutral-val');
            const roeClass = s.ROE > 15 ? 'gain' : (s.ROE < 10 ? 'loss' : 'neutral-val');
            const deClass = s.DE < 1.0 ? 'gain' : (s.DE > 2.0 ? 'loss' : 'neutral-val');
            const marginClass = s.Margin > 15 ? 'gain' : (s.Margin < 5 ? 'loss' : 'neutral-val');

            return `
            <tr>
                <td class="neutral-val">${i + 1}</td>
                <td class="symbol-cell">
                    <span class="star-icon" onclick="toggleWatchlist('${s.Symbol}')" id="star-${s.Symbol}">${isWatchlisted(s.Symbol)?'⭐':'☆'}</span> 
                    <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${s.Symbol}')">${s.Symbol}</a>
                </td>
                <td><span class="sector-pill">${s.Sector || 'Others'}</span></td>
                <td>₹${fmtNum(s.LTP)}</td>
                <td class="${peClass}" style="font-weight: 500;">${fmtPE}</td>
                <td class="${roeClass}" style="font-weight: 500;">${fmtROE}%</td>
                <td class="${deClass}">${fmtDE}</td>
                <td>${fmtNum(Math.round(s.MktCap / 10000000))}</td> <!-- MktCap from Yahoo is usually raw or in thousands, we format as Cr roughly -->
                <td class="${marginClass}">${fmtMargin}%</td>
                <td>
                    <div style="background: rgba(59,130,246,0.15); color: #60a5fa; padding: 4px 8px; border-radius: 6px; font-weight: 600; border: 1px solid rgba(59,130,246,0.3); display: inline-block;">
                        ${s.Score}
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch(e) {
        console.error(e);
        loading.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '▶️ Run Fundamental Scan';
        tbody.innerHTML = `<tr><td colspan="10" class="loading-row" style="color:#ef4444">Error running scan: ${e.message}</td></tr>`;
    }
}

// ===== SECTOR PAGE =====
async function loadSectorPage() {
    const date = state.currentDate;
    document.getElementById('sectorGrid').innerHTML = '<div class="loading-pulse">Loading sectors...</div>';

    try {
        const sectors = await fetchJSON(`${API}/stocks/sectors${date ? `?date=${date}` : ''}`);

        if (!sectors.length) {
            document.getElementById('sectorGrid').innerHTML = noDataHtml('No sector data. Import CSV first.');
            return;
        }

        // Sector bar chart
        if (state.charts.sectorBar) state.charts.sectorBar.destroy();
        const ctx = document.getElementById('sectorBarChart').getContext('2d');
        const labels = sectors.map(s => s.Sector);
        const values = sectors.map(s => parseFloat(s.AvgPctChange) || 0);
        const colors = values.map(v => v >= 0 ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)');

        state.charts.sectorBar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Avg % Change',
                    data: values,
                    backgroundColor: colors,
                    borderColor: colors.map(c => c.replace('0.75','1')),
                    borderWidth: 1,
                    borderRadius: 5,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: { label: ctx => ` ${ctx.raw >= 0 ? '+' : ''}${ctx.raw.toFixed(2)}%` }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim(), callback: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` },
                        grid: { color: 'rgba(148,163,184,0.06)' }
                    },
                    y: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim(), font: { size: 11 } }, grid: { display: false } }
                }
            }
        });

        // Sector cards
        document.getElementById('sectorGrid').innerHTML = sectors.map(s => {
            const pct = parseFloat(s.AvgPctChange) || 0;
            const gainersPct = s.StockCount > 0 ? (s.Gainers / s.StockCount * 100) : 0;
            return `
            <div class="sector-card ${pct >= 0 ? 'gaining' : 'losing'}" style="cursor:pointer;" onclick="openSectorModal('${s.Sector.replace(/'/g, "\\'")}')">
                <div class="sector-card-header">
                    <div>
                        <div class="sector-name">${s.Sector}</div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px">${s.StockCount} stocks · ₹${formatCr(s.TotalValue)}Cr</div>
                    </div>
                    <div class="sector-avg-pct ${pct >= 0 ? 'gain' : 'loss'}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</div>
                </div>
                <div class="sector-stats">
                    <div class="sector-stat">
                        <span class="sector-stat-val gain">${s.Gainers}</span>
                        <span class="sector-stat-label">Gainers</span>
                    </div>
                    <div class="sector-stat">
                        <span class="sector-stat-val loss">${s.Losers}</span>
                        <span class="sector-stat-label">Losers</span>
                    </div>
                    <div class="sector-stat">
                        <span class="sector-stat-val gain">${fmtNum(s.MaxGain)}%</span>
                        <span class="sector-stat-label">Best</span>
                    </div>
                </div>
                <div class="breadth-bar">
                    <div class="breadth-fill" style="width:${gainersPct.toFixed(0)}%"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.58rem;color:var(--text-muted);margin-top:3px">
                    <span>🟢 ${gainersPct.toFixed(0)}%</span>
                    <span>+${fmtNum(s.MaxGain)}% / ${fmtNum(s.MaxLoss)}%</span>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        console.error(e);
        document.getElementById('sectorGrid').innerHTML = `<p style="color:#ef4444">Error: ${e.message}</p>`;
    }
    
    await loadSectorRotation(date);
}

// ===== ALL STOCKS =====
async function loadAllStocks() {
    const date = state.currentDate;
    document.getElementById('allStocksBody').innerHTML =
        `<tr><td colspan="12" class="loading-row"><div class="loading-pulse">Loading all 500 stocks...</div></td></tr>`;

    try {
        const data = await fetchJSON(`${API}/stocks${date ? `?date=${date}` : ''}`);
        state.allStocksData = data.stocks || [];
        state.allStocksFiltered = [...state.allStocksData];

        // Populate sector filter
        const sectors = [...new Set(state.allStocksData.map(s => s.Sector).filter(Boolean))].sort();
        const sel = document.getElementById('allStockSectorFilter');
        sel.innerHTML = '<option value="">All Sectors</option>' +
            sectors.map(s => `<option value="${s}">${s}</option>`).join('');

        renderAllStocksTable();
    } catch(e) {
        console.error(e);
        document.getElementById('allStocksBody').innerHTML =
            `<tr><td colspan="12" class="loading-row" style="color:#ef4444">Error: ${e.message}</td></tr>`;
    }
}

function filterAllStocks() {
    const search = document.getElementById('stockSearch').value.toUpperCase();
    const sector = document.getElementById('allStockSectorFilter').value;
    state.allStocksFiltered = state.allStocksData.filter(s =>
        (!search || s.Symbol?.includes(search)) &&
        (!sector || s.Sector === sector)
    );
    renderAllStocksTable();
}

let _sortCol = 'Value', _sortDir = -1;
function sortAllStocks() {
    const val = document.getElementById('allStockSort').value;
    const [col, dir] = val.split('_');
    _sortCol = col;
    _sortDir = dir === 'asc' ? 1 : -1;
    renderAllStocksTable();
}

function sortAllStocksBy(col) {
    if (_sortCol === col) _sortDir *= -1;
    else { _sortCol = col; _sortDir = -1; }
    renderAllStocksTable();
}

function renderAllStocksTable() {
    const sorted = [...state.allStocksFiltered].sort((a, b) => {
        const av = a[_sortCol] ?? '';
        const bv = b[_sortCol] ?? '';
        if (typeof av === 'number') return (av - bv) * _sortDir;
        return String(av).localeCompare(String(bv)) * _sortDir;
    });

    document.getElementById('stockCount').textContent = `${sorted.length} stocks`;
    document.getElementById('allStocksBody').innerHTML = sorted.map((s, i) => `
    <tr>
        <td class="neutral-val">${i+1}</td>
        <td class="symbol-cell">
        <span class="star-icon" onclick="toggleWatchlist('${s.Symbol}')" id="star-${s.Symbol}">${isWatchlisted(s.Symbol)?'⭐':'☆'}</span> 
        <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${s.Symbol}')">${s.Symbol}</a>
    </td>
        <td><span class="sector-pill">${s.Sector || 'Others'}</span></td>
        <td>₹${fmtNum(s.LTP)}</td>
        <td class="${s.Change >= 0 ? 'gain' : 'loss'}">${s.Change >= 0 ? '+' : ''}${fmtNum(s.Change)}</td>
        <td><span class="pct-badge ${pctClass(s.PctChange)}">${signedPct(s.PctChange)}</span></td>
        <td class="neutral-val">${fmtVol(s.Volume)}</td>
        <td>${fmtNum(s.Value)}</td>
        <td class="neutral-val">₹${fmtNum(s.High52W)}</td>
        <td class="neutral-val">₹${fmtNum(s.Low52W)}</td>
        <td><span class="pct-badge ${pctClass(s.Chng30D)}">${signedPct(s.Chng30D)}</span></td>
        <td><span class="pct-badge ${pctClass(s.Chng365D)}">${signedPct(s.Chng365D)}</span></td>
    </tr>`).join('');
}

// ===== IMPORT =====
function initDragDrop() {
    const zone = document.getElementById('dropZone');
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) importCSVFile(file);
    });
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) importCSVFile(file);
}

async function importCSVFile(file) {
    const progress = document.getElementById('importProgress');
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    const result = document.getElementById('importResult');

    result.style.display = 'none';
    progress.style.display = 'block';
    fill.style.width = '30%';
    text.textContent = `Uploading ${file.name}...`;

    const formData = new FormData();
    formData.append('csvFile', file);

    const headers = {};
    if (typeof authHeaders === 'function') {
        const authH = authHeaders();
        if (authH.Authorization) headers.Authorization = authH.Authorization;
    }

    try {
        fill.style.width = '60%';
        text.textContent = 'Importing to SQL Server...';

        const res = await fetch(`${API}/import/csv`, {
            method: 'POST',
            headers,
            body: formData
        });
        const data = await res.json();

        fill.style.width = '100%';

        if (data.success) {
            text.textContent = 'Import complete!';
            result.className = 'import-result success';
            result.textContent = `✅ ${data.message}`;
            result.style.display = 'block';
            showToast(`${data.count} stocks imported successfully!`, 'success');
            await loadDates();
            await loadImportHistory();
        } else {
            throw new Error(data.error || 'Import failed');
        }
    } catch(e) {
        fill.style.width = '100%';
        fill.style.background = 'var(--red)';
        text.textContent = 'Import failed!';
        result.className = 'import-result error';
        result.textContent = `❌ Error: ${e.message}`;
        result.style.display = 'block';
        showToast('Import failed: ' + e.message, 'error');
    }

    setTimeout(() => { progress.style.display = 'none'; fill.style.width = '0%'; fill.style.background = ''; }, 2000);
    document.getElementById('csvFileInput').value = '';
}

async function loadImportHistory() {
    try {
        const logs = await fetchJSON(`${API}/import/logs`);
        document.getElementById('importHistoryBody').innerHTML = logs.length
            ? logs.map(l => `
            <tr>
                <td class="symbol-cell" style="font-family:'Inter',sans-serif">${l.FileName}</td>
                <td>${formatDate(l.ImportDate)}</td>
                <td class="gain">${fmt(l.RecordCount)}</td>
                <td class="neutral-val" style="font-size:0.75rem">${new Date(l.ImportedAt).toLocaleString('en-IN')}</td>
                <td><span class="pct-badge gain">${l.Status || 'SUCCESS'}</span></td>
            </tr>`).join('')
            : `<tr><td colspan="5" class="loading-row" style="color:var(--text-muted)">No imports yet. Upload a CSV file above.</td></tr>`;
        if (logs.length > 0) {
            const dtEl = document.getElementById('lastUpdateDateTime');
            if (dtEl) dtEl.textContent = new Date(logs[0].ImportedAt).toLocaleString('en-IN');
        } else {
            const dtEl = document.getElementById('lastUpdateDateTime');
            if (dtEl) dtEl.textContent = "Never";
        }
    } catch(e) {
        document.getElementById('importHistoryBody').innerHTML =
            `<tr><td colspan="5" class="loading-row" style="color:#ef4444">Error loading history</td></tr>`;
    }
}

// ===== AUTO FETCH DATA =====
async function autoFetchData() {
    const btn = document.querySelector('button[onclick="autoFetchData()"]');
    if(btn) btn.innerHTML = '<div class="loading-pulse" style="display:inline-block;">⚡ Fetching Live Data... (Takes ~1 min)</div>';
    
    try {
        const res = await fetch(`${API}/import/auto-fetch`, {
            method: 'POST',
            headers: typeof authHeaders === 'function' ? authHeaders() : {}
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Failed to auto-fetch');
        
        showToast(`✅ Auto-Fetch Complete! Updated: ${data.updated} stocks. Errors: ${data.errors}`);
        await loadDates();
        await loadImportHistory();
    } catch (e) {
        showToast(`❌ Error: ${e.message}`, true);
    } finally {
        if(btn) btn.innerHTML = '⚡ Auto Fetch Live Data';
    }
}

// ===== REFRESH =====
async function refreshData() {
    const btn = document.getElementById('btnRefresh');
    btn.textContent = '↻ Refreshing...';
    btn.disabled = true;
    await checkDBConnection();
    await navigateTo(state.currentPage);
    btn.innerHTML = '<span>↻</span> Refresh';
    btn.disabled = false;
    showToast('Data refreshed!', 'success');
}

// ===== HELPERS =====
async function fetchJSON(url) {
    const headers = typeof authHeaders === 'function' ? authHeaders() : { 'Content-Type': 'application/json' };
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function fmt(n) { return n != null ? Number(n).toLocaleString('en-IN') : '--'; }
function fmtNum(n) { if (n == null) return '--'; return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
function fmtVol(n) {
    if (n == null) return '--';
    if (n >= 1e7) return (n/1e7).toFixed(2) + 'Cr';
    if (n >= 1e5) return (n/1e5).toFixed(2) + 'L';
    return n.toLocaleString('en-IN');
}
function formatCr(n) {
    if (!n) return '0';
    if (n >= 100000) return (n/100000).toFixed(1) + 'L';
    if (n >= 1000) return (n/1000).toFixed(1) + 'K';
    return parseFloat(n).toFixed(0);
}
function formatDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function pctClass(v) { if (!v) return 'neutral'; return v > 0 ? 'gain' : v < 0 ? 'loss' : 'neutral'; }
function signedPct(v) {
    if (v == null) return '--';
    return (v > 0 ? '+' : '') + parseFloat(v).toFixed(2) + '%';
}
function noDataHtml(msg) {
    return `<div class="no-data"><div class="no-data-icon">📭</div><div class="no-data-title">No Data Available</div><div class="no-data-text">${msg}</div></div>`;
}

async function populateSectorFilter(selectId, data) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const current = sel.value;
    const sectors = [...new Set(data.map(s => s.Sector).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">All Sectors</option>' +
        sectors.map(s => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`).join('');
}

// ===== TOAST =====
function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.className = 'toast', 3000);
}

// ==========================================
// SECTOR ROTATION
// ==========================================
async function loadSectorRotation(date) {
    try {
        const rotationData = await fetchJSON(`${API}/analysis/sector-rotation${date ? `?date=${date}` : ''}`);
        const tbody = document.getElementById('sectorRotationBody');

        if (!rotationData.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No data available.</td></tr>';
            return;
        }

        // Build Scatter Chart for Quadrants
        if (state.charts.sectorRotationScatter) {
            state.charts.sectorRotationScatter.destroy();
        }
        
        const scatterCtx = document.getElementById('sectorRotationScatterChart').getContext('2d');
        
        // Prepare datasets
        const scatterData = rotationData.map(s => {
            const x = parseFloat(s.Change30D) || 0;
            const y = parseFloat(s.Change1D) || 0;
            // Bubble size based on log of TotalValue to prevent massive bubbles
            const r = Math.max(5, Math.min(30, Math.log10(s.TotalValue || 1) * 3));
            
            // Color based on Quadrant
            let bgColor = 'rgba(148, 163, 184, 0.7)'; // Default grey
            if (x >= 0 && y >= 0) bgColor = 'rgba(34, 197, 94, 0.7)'; // Leading: Green
            else if (x < 0 && y >= 0) bgColor = 'rgba(59, 130, 246, 0.7)'; // Improving: Blue
            else if (x < 0 && y < 0) bgColor = 'rgba(239, 68, 68, 0.7)'; // Lagging: Red
            else if (x >= 0 && y < 0) bgColor = 'rgba(245, 158, 11, 0.7)'; // Weakening: Orange

            return {
                x: x,
                y: y,
                r: r,
                sectorName: s.Sector,
                backgroundColor: bgColor,
                borderColor: bgColor.replace('0.7', '1')
            };
        });

        state.charts.sectorRotationScatter = new Chart(scatterCtx, {
            type: 'bubble',
            data: {
                datasets: [{
                    label: 'Sector Rotation',
                    data: scatterData,
                    backgroundColor: scatterData.map(d => d.backgroundColor),
                    borderColor: scatterData.map(d => d.borderColor),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const data = context.raw;
                                return `${data.sectorName}: 30D: ${data.x.toFixed(2)}%, 1D: ${data.y.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: '30-Day % Change (Trend) →', color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() },
                        grid: { color: context => context.tick.value === 0 ? getComputedStyle(document.documentElement).getPropertyValue('--chart-zero').trim() : 'rgba(148,163,184,0.06)' },
                        ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() }
                    },
                    y: {
                        title: { display: true, text: '1-Day % Change (Momentum) →', color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() },
                        grid: { color: context => context.tick.value === 0 ? getComputedStyle(document.documentElement).getPropertyValue('--chart-zero').trim() : 'rgba(148,163,184,0.06)' },
                        ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() }
                    }
                }
            }
        });

        tbody.innerHTML = rotationData.map(s => {
            const class1D = s.Change1D >= 0 ? 'gain' : 'loss';
            const class30D = s.Change30D >= 0 ? 'gain' : 'loss';
            const class365D = s.Change365D >= 0 ? 'gain' : 'loss';
            
            return `
            <tr>
                <td style="font-weight:bold; cursor:pointer;" onclick="openSectorModal('${s.Sector.replace(/'/g, "\\'")}')">${s.Sector}</td>
                <td>₹${formatCr(s.TotalValue)}</td>
                <td class="${class1D}">${s.Change1D >= 0 ? '+' : ''}${s.Change1D?.toFixed(2)}%</td>
                <td class="${class30D}">${s.Change30D >= 0 ? '+' : ''}${s.Change30D?.toFixed(2)}%</td>
                <td class="${class365D}">${s.Change365D >= 0 ? '+' : ''}${s.Change365D?.toFixed(2)}%</td>
            </tr>`;
        }).join('');
    } catch(e) { 
        console.error('Rotation error:', e); 
        document.getElementById('sectorRotationBody').innerHTML = '<tr><td colspan="5" style="text-align:center;color:red;">Error loading rotation data</td></tr>';
    }
}

// ==========================================
// SECTOR MODAL LOGIC
// ==========================================
async function openSectorModal(sector) {
    const modal = document.getElementById('sectorModal');
    const title = document.getElementById('modalSectorTitle');
    const body = document.getElementById('modalStocksBody');
    
    title.textContent = `Loading ${sector}...`;
    body.innerHTML = `<tr><td colspan="5" style="text-align:center;">Fetching data...</td></tr>`;
    modal.style.display = 'block';
    
    try {
        const dateSelect = document.getElementById('dateSelect');
        const dateStr = dateSelect ? dateSelect.value : '';
        const res = await fetchJSON(`${API}/stocks?sector=${encodeURIComponent(sector)}${dateStr && dateStr !== 'Latest' ? `&date=${dateStr}` : ''}&sort=PctChange&order=DESC`);
        
        title.textContent = `${sector} (${res.total} Stocks)`;
        
        if (res.stocks && res.stocks.length > 0) {
            body.innerHTML = res.stocks.map(s => {
                const colorClass = (s.PctChange >= 0) ? 'gain' : 'loss';
                const sign = (s.PctChange >= 0) ? '+' : '';
                return `
                <tr>
                    <td style="font-weight:bold;">${s.Symbol}</td>
                    <td>₹${fmtNum(s.LTP)}</td>
                    <td class="${colorClass}">${sign}${fmtNum(s.Change)}</td>
                    <td class="${colorClass}">${sign}${s.PctChange?.toFixed(2)}%</td>
                    <td>${fmtVol(s.Value)}</td>
                </tr>
                `;
            }).join('');
        } else {
            body.innerHTML = `<tr><td colspan="5" style="text-align:center;">No stocks found.</td></tr>`;
        }
    } catch (e) {
        console.error('Modal fetch error:', e);
        body.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Failed to load data.</td></tr>`;
    }
}

function closeSectorModal() {
    document.getElementById('sectorModal').style.display = 'none';
}

// Close modal when clicking outside of it
window.addEventListener('click', function(event) {
    const modal = document.getElementById('sectorModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
});

// ==========================================
// WATCHLIST LOGIC
// ==========================================
function getWatchlist() {
    return JSON.parse(localStorage.getItem('watchlist') || '[]');
}
function saveWatchlist(list) {
    localStorage.setItem('watchlist', JSON.stringify(list));
}
function isWatchlisted(symbol) {
    return getWatchlist().includes(symbol);
}
function toggleWatchlist(symbol) {
    let list = getWatchlist();
    if (list.includes(symbol)) {
        list = list.filter(s => s !== symbol);
    } else {
        list.push(symbol);
    }
    saveWatchlist(list);
    
    // Update all stars for this symbol in current view
    document.querySelectorAll(`#star-${symbol}`).forEach(el => {
        el.textContent = list.includes(symbol) ? '⭐' : '☆';
    });
    
    if (document.getElementById('page-watchlist').classList.contains('active')) {
        loadWatchlistData();
    }
}

// ===== WATCHLIST EXPORT: TXT (Notepad) =====
function exportWatchlistTxt() {
    const list = getWatchlist();
    if (!list.length) {
        alert('Aapki watchlist khali hai! Pehle kuch stocks add karein.');
        return;
    }
    // One symbol per line — clean text file
    const content = list.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'MyWatchlist.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ===== WATCHLIST EXPORT: TradingView Import Format =====
// TradingView accepts: NSE:RELIANCE,NSE:TCS,...  (comma-separated, with exchange prefix)
function copyWatchlistForTradingView() {
    const list = getWatchlist();
    if (!list.length) {
        alert('Aapki watchlist khali hai! Pehle kuch stocks add karein.');
        return;
    }

    // Format: NSE:SYMBOL (TradingView standard import format)
    const tvFormat = list.map(sym => `NSE:${sym}`).join(',');

    navigator.clipboard.writeText(tvFormat).then(() => {
        const msg = document.getElementById('tvCopyMsg');
        if (msg) {
            msg.style.display = 'inline';
            setTimeout(() => { msg.style.display = 'none'; }, 4000);
        }
    }).catch(() => {
        // Fallback for older browsers
        const ta = document.createElement('textarea');
        ta.value = tvFormat;
        ta.style.position = 'fixed';
        ta.style.opacity  = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        const msg = document.getElementById('tvCopyMsg');
        if (msg) {
            msg.style.display = 'inline';
            setTimeout(() => { msg.style.display = 'none'; }, 4000);
        }
    });
}

async function loadWatchlistData() {
    const list = getWatchlist();
    const tbody = document.getElementById('watchlistTableBody');
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">Your watchlist is empty. Click the ☆ icon next to any stock to add it.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '<tr><td colspan="12" class="loading-row"><div class="loading-pulse">Loading Watchlist...</div></td></tr>';
    try {
        const date = document.getElementById('dateSelect').value;
        // Fetch all stocks to filter locally for simplicity, or we could send a list. Fetching all is fine.
        const res = await fetchJSON(`${API}/stocks${date ? '?date='+date : ''}`);
        const stocks = res.stocks || [];
        const filtered = stocks.filter(s => list.includes(s.Symbol));
        
        tbody.innerHTML = filtered.map((s, i) => `
            <tr>
                <td class="neutral-val">${i+1}</td>
                <td class="symbol-cell">
                    <span class="star-icon" onclick="toggleWatchlist('${s.Symbol}')" id="star-${s.Symbol}">⭐</span> 
                    <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${s.Symbol}')">${s.Symbol}</a>
                </td>
                <td style="font-size:0.75rem; color:var(--text-muted);">${s.Sector}</td>
                <td style="font-weight:600;">₹${fmtNum(s.LTP)}</td>
                <td>₹${fmtNum(s.Open)}</td>
                <td class="${s.PctChange >= 0 ? 'bullish-val' : 'bearish-val'}">${s.PctChange >= 0 ? '+' : ''}${s.PctChange}%</td>
                <td>${fmtVol(s.Volume)}</td>
                <td>${formatCr(s.Value)}</td>
                <td>₹${fmtNum(s.High52W)}</td>
                <td>${(((s.LTP - s.High52W) / s.High52W) * 100).toFixed(2)}%</td>
                <td>${s.SMA50 ? '₹'+fmtNum(s.SMA50) : '-'}</td>
                <td>${s.SMA200 ? '₹'+fmtNum(s.SMA200) : '-'}</td>
            </tr>
        `).join('');
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="12" style="color:red; text-align:center;">Failed to load watchlist: ${e.message}</td></tr>`;
    }
}

// ==========================================
// DETAILED STOCK MODAL & CHART
// ==========================================
let stockChartInstance = null;
let lwChartInstance = null;
let currentStockData = null;

async function openStockModal(symbol) {
    document.getElementById('modalStockTitle').textContent = `${symbol} Details`;
    const modal = document.getElementById('stockModal');
    modal.style.display = 'block';
    
    document.getElementById('modalStockStats').innerHTML = '<div class="loading-pulse">Loading Historical Data...</div>';
    
    if (stockChartInstance) { stockChartInstance.destroy(); stockChartInstance = null; }
    if (lwChartInstance) { lwChartInstance.remove(); lwChartInstance = null; }
    
    try {
        const res = await fetchJSON(`${API}/stocks/${encodeURIComponent(symbol)}/history`);
        currentStockData = res;
        
        document.getElementById('modalStockStats').innerHTML = `
            <div><strong>Symbol:</strong> ${res.symbol}</div>
            <div><strong>Data:</strong> 6 Months Daily</div>
        `;
        
        const preferredChart = localStorage.getItem('chartType') || 'line';
        setChartType(preferredChart, true);
        
    } catch(e) {
        document.getElementById('modalStockStats').innerHTML = `<div style="color:red;">Error: ${e.message}</div>`;
    }
}

function setChartType(type, forceRender = false) {
    if (!forceRender && localStorage.getItem('chartType') === type) return;
    localStorage.setItem('chartType', type);
    
    document.getElementById('btn-chart-line').classList.toggle('active', type === 'line');
    document.getElementById('btn-chart-candle').classList.toggle('active', type === 'candle');
    
    if (!currentStockData) return;
    
    const canvas = document.getElementById('stockHistoryChart');
    const lwContainer = document.getElementById('lightweightChartContainer');
    
    if (stockChartInstance) { stockChartInstance.destroy(); stockChartInstance = null; }
    if (lwChartInstance) { lwChartInstance.remove(); lwChartInstance = null; }
    
    const showST = document.getElementById('superTrendToggle') ? document.getElementById('superTrendToggle').checked : false;
    
    if (type === 'line') {
        canvas.style.display = 'block';
        lwContainer.style.display = 'none';
        
        const ctx = canvas.getContext('2d');
        const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim();
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim();
        
        const minPrice = Math.min(...currentStockData.prices) * 0.95;
        const maxPrice = Math.max(...currentStockData.prices) * 1.05;

        const datasets = [{
            label: 'Closing Price (₹)',
            data: currentStockData.prices,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            fill: true,
            tension: 0.1
        }];
        
        if (showST && currentStockData.candles) {
            const stData = calculateSuperTrend(currentStockData.candles, 10, 3);
            datasets.push({
                label: 'SuperTrend',
                data: stData.values,
                borderColor: stData.colors,
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                tension: 0,
                segment: {
                    borderColor: ctx => stData.colors[ctx.p0DataIndex]
                }
            });
        }

        stockChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: currentStockData.labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                scales: {
                    x: { grid: { display: false }, ticks: { color: textColor } },
                    y: { min: minPrice, max: maxPrice, grid: { color: gridColor }, ticks: { color: textColor } }
                },
                plugins: { legend: { display: false } }
            }
        });
    } else {
        canvas.style.display = 'none';
        lwContainer.style.display = 'block';
        
        const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim();
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
        
        lwChartInstance = LightweightCharts.createChart(lwContainer, {
            layout: { background: { type: 'solid', color: 'transparent' }, textColor: textColor },
            grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
            timeScale: { borderColor: gridColor },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal }
        });
        
        const candlestickSeries = lwChartInstance.addCandlestickSeries({
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#22c55e',
            wickDownColor: '#ef4444'
        });
        
        candlestickSeries.setData(currentStockData.candles);
        
        if (showST) {
            const stData = calculateSuperTrend(currentStockData.candles, 10, 3);
            const stSeries = lwChartInstance.addLineSeries({
                lineWidth: 2,
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false
            });
            stSeries.setData(stData.data);
        }
        
        lwChartInstance.timeScale().fitContent();
    }
}

function toggleSuperTrend() {
    const type = localStorage.getItem('chartType') || 'line';
    setChartType(type, true); // force re-render
}

function closeStockModal() {
    document.getElementById('stockModal').style.display = 'none';
    if (stockChartInstance) { stockChartInstance.destroy(); stockChartInstance = null; }
    if (lwChartInstance) { lwChartInstance.remove(); lwChartInstance = null; }
    currentStockData = null;
}

// ==========================================
// EXPORT TO CSV
// ==========================================
function exportTableToCSV(tbodyId, filename) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    
    let csv = [];
    // Get headers from previous sibling <thead>
    const thead = tbody.previousElementSibling;
    if (thead) {
        const headers = Array.from(thead.querySelectorAll('th')).map(th => th.innerText.replace(/,/g, ''));
        csv.push(headers.join(','));
    }
    
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        const rowData = Array.from(row.querySelectorAll('td')).map(td => {
            let text = td.innerText.replace(/,/g, ''); // remove commas in numbers
            text = text.replace(/\n/g, ' '); // remove newlines
            text = text.replace(/₹/g, ''); // remove currency symbol
            text = text.replace(/%/g, ''); // remove % symbol
            text = text.replace(/⭐/g, ''); // remove star
            text = text.replace(/☆/g, ''); // remove star
            return text.trim();
        });
        if(rowData.length > 1) { // Skip empty/loading rows
            csv.push(rowData.join(','));
        }
    });
    
    const csvFile = new Blob([csv.join('\n')], {type: 'text/csv'});
    const downloadLink = document.createElement("a");
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

// ==========================================
// LIVE SYNC (AUTO REFRESH)
// ==========================================
let liveSyncInterval = null;

function toggleLiveSync() {
    const isChecked = document.getElementById('liveSyncToggle').checked;
    if (isChecked) {
        showToast("Live Sync Started. Data will refresh every 5 minutes.");
        // Fetch immediately then set interval
        autoFetchData();
        liveSyncInterval = setInterval(() => {
            autoFetchData();
        }, 5 * 60 * 1000); // 5 minutes
    } else {
        showToast("Live Sync Stopped.");
        clearInterval(liveSyncInterval);
        liveSyncInterval = null;
    }
}

// Ensure Star style
const extraCss = document.createElement('style');
extraCss.innerHTML = `
.star-icon { cursor:pointer; font-size:1.1rem; color:#eab308; margin-right:5px; transition: transform 0.2s; }
.star-icon:hover { transform: scale(1.2); }
`;
document.head.appendChild(extraCss);

// ==========================================
// SUPERTREND CALCULATION
// ==========================================
function calculateSuperTrend(quotes, period = 10, multiplier = 3) {
    if(!quotes || quotes.length === 0) return [];
    let atr = [], tr = [];
    for(let i=0; i<quotes.length; i++) {
        if(i===0) {
            tr.push(quotes[i].high - quotes[i].low);
            atr.push(tr[i]);
            continue;
        }
        let hl = quotes[i].high - quotes[i].low;
        let hcp = Math.abs(quotes[i].high - quotes[i-1].close);
        let lcp = Math.abs(quotes[i].low - quotes[i-1].close);
        let current_tr = Math.max(hl, hcp, lcp);
        tr.push(current_tr);
        // RMA for ATR
        atr.push((atr[i-1] * (period - 1) + current_tr) / period);
    }
    
    let basicUpper = [], basicLower = [], finalUpper = [], finalLower = [], st = [], trend = [];
    for(let i=0; i<quotes.length; i++) {
        let hl2 = (quotes[i].high + quotes[i].low) / 2;
        basicUpper[i] = hl2 + multiplier * atr[i];
        basicLower[i] = hl2 - multiplier * atr[i];
        
        if (i===0) {
            finalUpper[i] = basicUpper[i];
            finalLower[i] = basicLower[i];
            st[i] = basicUpper[i];
            trend[i] = 1;
            continue;
        }
        
        finalUpper[i] = (basicUpper[i] < finalUpper[i-1] || quotes[i-1].close > finalUpper[i-1]) ? basicUpper[i] : finalUpper[i-1];
        finalLower[i] = (basicLower[i] > finalLower[i-1] || quotes[i-1].close < finalLower[i-1]) ? basicLower[i] : finalLower[i-1];
        
        if(st[i-1] === finalUpper[i-1] && quotes[i].close < finalUpper[i]) {
            st[i] = finalUpper[i];
            trend[i] = -1;
        } else if(st[i-1] === finalUpper[i-1] && quotes[i].close > finalUpper[i]) {
            st[i] = finalLower[i];
            trend[i] = 1;
        } else if(st[i-1] === finalLower[i-1] && quotes[i].close > finalLower[i]) {
            st[i] = finalLower[i];
            trend[i] = 1;
        } else if(st[i-1] === finalLower[i-1] && quotes[i].close < finalLower[i]) {
            st[i] = finalUpper[i];
            trend[i] = -1;
        } else {
            st[i] = st[i-1];
            trend[i] = trend[i-1];
        }
    }
    
    let stLineData = [];
    for(let i=0; i<quotes.length; i++) {
        stLineData.push({
            time: quotes[i].time,
            value: st[i],
            color: trend[i] === 1 ? '#22c55e' : '#ef4444' // Green for Up, Red for Down
        });
    }
    return { data: stLineData, values: st, colors: trend.map(t => t === 1 ? '#22c55e' : '#ef4444') };
}

// ===== MINI WIDGETS =====
async function loadMiniWidgets(date) {
    try {
        // 1. Fetch Indices
        const indices = await fetchJSON(`${API}/stocks/indices`);
        renderSparkline('wdgNiftyChart', indices.nifty || []);
        renderSparkline('wdgBankNiftyChart', indices.banknifty || []);

        if (indices.niftyMeta) {
            const ltp = indices.niftyMeta.regularMarketPrice;
            const prev = indices.niftyMeta.previousClose;
            const pct = ((ltp - prev) / prev * 100);
            document.getElementById('wdgNiftyVal').innerHTML = `${fmtNum(ltp)} <span class="pct-badge ${pctClass(pct)}" style="font-size:0.7rem; padding:2px 4px;">${signedPct(pct)}</span>`;
        }
        if (indices.bankniftyMeta) {
            const ltp = indices.bankniftyMeta.regularMarketPrice;
            const prev = indices.bankniftyMeta.previousClose;
            const pct = ((ltp - prev) / prev * 100);
            document.getElementById('wdgBankNiftyVal').innerHTML = `${fmtNum(ltp)} <span class="pct-badge ${pctClass(pct)}" style="font-size:0.7rem; padding:2px 4px;">${signedPct(pct)}</span>`;
        }

        // 2. Adv/Dec (From summary data which is already fetched by loadSummary)
        const summary = await fetchJSON(`${API}/stocks/summary${date ? `?date=${date}` : ''}`);
        const gainers = summary.Gainers || 0;
        const losers = summary.Losers || 0;
        document.getElementById('wdgAdv').textContent = gainers;
        document.getElementById('wdgDec').textContent = losers;
        
        const totalAd = gainers + losers || 1;
        document.getElementById('wdgAdBar').style.width = `${(gainers/totalAd)*100}%`;

        // 3. Market Mood (Fear & Greed)
        // Simplified Logic: Adv/Dec ratio drives mood
        const adRatio = gainers / (losers || 1);
        let moodScore = 50; // Neutral
        if (adRatio > 2.0) moodScore = 90; // Ext Greed
        else if (adRatio > 1.2) moodScore = 70; // Greed
        else if (adRatio < 0.5) moodScore = 10; // Ext Fear
        else if (adRatio < 0.8) moodScore = 30; // Fear
        
        drawMoodGauge('wdgMoodGauge', moodScore);

    } catch(e) { console.error('Mini widgets error:', e); }
}

function renderSparkline(canvasId, quotes) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !quotes.length) return;
    
    // Check if chart instance exists, destroy if so
    if (Chart.getChart(canvasId)) Chart.getChart(canvasId).destroy();

    const data = quotes.map(q => q.close).filter(Boolean);
    const labels = data.map((_, i) => i);
    const isGain = data[data.length-1] >= data[0];
    const color = isGain ? '#22c55e' : '#ef4444';

    // Create a smooth canvas gradient for fill
    const ctx = canvas.getContext('2d');
    const chartHeight = canvas.clientHeight || 45;
    const gradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    gradient.addColorStop(0, color + '30'); // translucency top
    gradient.addColorStop(1, color + '00'); // fully transparent bottom

    new Chart(canvas, {
        type: 'line',
        data: { 
            labels, 
            datasets: [{ 
                data, 
                borderColor: color, 
                borderWidth: 1.5, 
                tension: 0.2, 
                pointRadius: 0,
                pointHoverRadius: 0,
                fill: true, 
                backgroundColor: gradient 
            }] 
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { 
                x: { display: false }, 
                y: { display: false, min: Math.min(...data) * 0.999, max: Math.max(...data) * 1.001 } 
            },
            layout: { padding: { top: 2, bottom: 2 } }
        }
    });
}

function drawMoodGauge(canvasId, score) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height - 5;
    const radius = width / 2 - 10;

    ctx.clearRect(0, 0, width, height);

    // Draw background arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, 0);
    ctx.lineWidth = 15;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.stroke();

    // Segments: Red, Orange, Grey, LightGreen, DarkGreen
    const segments = [
        { pct: 0.2, color: '#ef4444' }, // 0-20
        { pct: 0.2, color: '#f97316' }, // 20-40
        { pct: 0.2, color: '#9ca3af' }, // 40-60
        { pct: 0.2, color: '#86efac' }, // 60-80
        { pct: 0.2, color: '#22c55e' }  // 80-100
    ];

    let startAngle = Math.PI;
    for (let s of segments) {
        let endAngle = startAngle + (s.pct * Math.PI);
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.lineWidth = 15;
        ctx.strokeStyle = s.color;
        ctx.stroke();
        startAngle = endAngle;
    }

    // Draw Needle
    const needleAngle = Math.PI + (score / 100) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(needleAngle) * (radius - 5), centerY + Math.sin(needleAngle) * (radius - 5));
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'var(--text-primary)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, 2*Math.PI);
    ctx.fillStyle = 'var(--text-primary)';
    ctx.fill();

    // Update Label
    let label = 'Neutral'; let lColor = '#9ca3af';
    if(score<=20) { label='Extreme Fear'; lColor='#ef4444'; }
    else if(score<=40) { label='Fear'; lColor='#f97316'; }
    else if(score<=60) { label='Neutral'; lColor='#9ca3af'; }
    else if(score<=80) { label='Greed'; lColor='#86efac'; }
    else { label='Extreme Greed'; lColor='#22c55e'; }
    
    const lblDiv = document.getElementById('wdgMoodLabel');
    if (lblDiv) {
        lblDiv.textContent = label;
        lblDiv.style.color = lColor;
    }
}

// ===== SECTOR OVERVIEW LIST (DASHBOARD) =====
async function loadSectorOverviewList(date) {
    try {
        const sectors = await fetchJSON(`${API}/analysis/sector-heatmap${date ? `?date=${date}` : ''}`);
        const container = document.getElementById('sectorOverviewList');
        if (!container) return;

        if (!sectors || !sectors.length) {
            container.innerHTML = noDataHtml('No sector data available.');
            return;
        }

        sectors.sort((a,b) => (b.AvgPctChange || 0) - (a.AvgPctChange || 0));
        const maxAbs = Math.max(...sectors.map(s => Math.abs(s.AvgPctChange || 0)), 0.01);

        container.innerHTML = sectors.map(s => {
            const val = s.AvgPctChange || 0;
            const w = Math.min((Math.abs(val) / maxAbs) * 100, 100);
            const isGain = val >= 0;
            const color = isGain ? '#22c55e' : '#ef4444';
            const sign  = isGain ? '+' : '';
            return `<div class="db-sector-row">
                <div class="db-sector-name" title="${s.Sector}">${s.Sector}</div>
                <div class="db-sector-bar-bg">
                    <div class="db-sector-bar-fill" style="width:${w}%; background:${color};"></div>
                </div>
                <div class="db-sector-pct" style="color:${color};">${sign}${val.toFixed(2)}%</div>
            </div>`;
        }).join('');

    } catch(e) { console.error('Sector Overview List error:', e); }
}


// ============================================================
// PORTFOLIO & P&L TRACKER
// ============================================================

// ── Load portfolio page ──────────────────────────────────────
async function loadPortfolioPage() {
    try {
        // Load summary
        const [summary, holdings] = await Promise.all([
            fetchJSON(`${API}/portfolio/summary`),
            fetchJSON(`${API}/portfolio`)
        ]);

        // Update summary cards
        const fmt2 = v => '₹' + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });
        const pct  = summary.TotalInvested > 0
            ? ((summary.UnrealizedPnL / summary.TotalInvested) * 100).toFixed(2)
            : 0;

        document.getElementById('pfInvested').textContent   = fmt2(summary.TotalInvested);
        document.getElementById('pfCurrent').textContent    = fmt2(summary.CurrentValue);
        document.getElementById('pfHoldings').textContent   = summary.TotalHoldings;
        document.getElementById('pfTrades').textContent     = summary.TotalTrades;

        // Unrealized P&L
        const unEl  = document.getElementById('pfUnrealized');
        const unCard= document.getElementById('pfUnrealizedCard');
        const sign  = summary.UnrealizedPnL >= 0 ? '+' : '-';
        unEl.textContent = sign + fmt2(summary.UnrealizedPnL);
        document.getElementById('pfUnrealizedPct').textContent = sign + Math.abs(pct) + '%';
        unEl.style.color  = summary.UnrealizedPnL >= 0 ? '#22c55e' : '#ef4444';
        unCard.style.borderLeft = `3px solid ${summary.UnrealizedPnL >= 0 ? '#22c55e' : '#ef4444'}`;

        // Realized P&L
        const reEl  = document.getElementById('pfRealized');
        const reCard= document.getElementById('pfRealizedCard');
        reEl.textContent = (summary.RealizedPnL >= 0 ? '+' : '-') + fmt2(summary.RealizedPnL);
        reEl.style.color  = summary.RealizedPnL >= 0 ? '#22c55e' : '#ef4444';
        reCard.style.borderLeft = `3px solid ${summary.RealizedPnL >= 0 ? '#22c55e' : '#ef4444'}`;

        // Render table
        const tbody = document.getElementById('portfolioTableBody');
        if (!holdings.length) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:40px;">
                <div style="font-size:2rem; margin-bottom:10px;">📭</div>
                <div style="color:var(--text-muted);">Portfolio khali hai.<br>
                <strong style="color:var(--accent);">➕ Add Buy Trade</strong> se pehla stock add karein.</div>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = holdings.map((h, i) => {
            const ltp      = parseFloat(h.LTP) || 0;
            const avg      = parseFloat(h.AvgBuyPrice);
            const qty      = parseFloat(h.Quantity);
            const invested = avg * qty;
            const current  = ltp * qty;
            const pnl      = current - invested;
            const pnlPct   = invested > 0 ? (pnl / invested * 100) : 0;
            const isGain   = pnl >= 0;
            const dayPct   = parseFloat(h.DayPct) || 0;

            const pc   = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
            const pfmt = v => (v >= 0 ? '+₹' : '-₹') + Math.abs(v).toLocaleString('en-IN', {maximumFractionDigits: 0});
            const mfmt = v => '₹' + v.toLocaleString('en-IN', {maximumFractionDigits: 0});

            return `<tr class="${isGain ? 'pf-row-gain' : 'pf-row-loss'}">
                <td class="neutral-val">${i + 1}</td>
                <td class="symbol-cell"><strong>${h.Symbol}</strong></td>
                <td><span style="font-size:0.75rem;color:var(--text-muted);">${h.SectorName || h.Sector || '--'}</span></td>
                <td>${qty % 1 === 0 ? qty.toFixed(0) : qty}</td>
                <td>₹${avg.toLocaleString('en-IN', {maximumFractionDigits: 2})}</td>
                <td><strong>₹${ltp.toLocaleString('en-IN', {maximumFractionDigits: 2})}</strong></td>
                <td>${mfmt(invested)}</td>
                <td>${mfmt(current)}</td>
                <td class="${isGain ? 'gain' : 'loss'}" style="font-weight:700;">${pfmt(pnl)}</td>
                <td class="${isGain ? 'gain' : 'loss'}" style="font-weight:700;">${pc(pnlPct)}</td>
                <td class="${dayPct >= 0 ? 'gain' : 'loss'}">${pc(dayPct)}</td>
                <td>
                    <button onclick="openSellModal('${h.Symbol}', ${qty}, ${ltp})"
                        style="background:linear-gradient(135deg,#7f1d1d,#ef4444);border:none;color:#fff;
                        padding:4px 10px;border-radius:5px;cursor:pointer;font-size:0.75rem;font-weight:600;">
                        💸 Sell
                    </button>
                    <button onclick="deleteHolding(${h.Id}, '${h.Symbol}')"
                        style="background:rgba(255,255,255,0.06);border:1px solid var(--border);color:var(--text-muted);
                        padding:4px 8px;border-radius:5px;cursor:pointer;font-size:0.75rem;margin-left:4px;">
                        🗑
                    </button>
                </td>
            </tr>`;
        }).join('');

    } catch(e) {
        console.error('Portfolio load error:', e);
        document.getElementById('portfolioTableBody').innerHTML =
            `<tr><td colspan="12" style="text-align:center;color:#ef4444;">Error loading portfolio: ${e.message}</td></tr>`;
    }
}

// ── Symbol Autocomplete ───────────────────────────────────────
let _pfAllSymbols = []; // cached from DB
let _pfDropIndex  = -1;

async function pfLoadSymbols() {
    if (_pfAllSymbols.length) return; // already loaded
    try {
        const res = await fetchJSON(`${API}/stocks?limit=2000`);
        const stocks = res.stocks || [];
        // Store symbol + name for richer display
        _pfAllSymbols = stocks.map(s => ({
            symbol: s.Symbol,
            sector: s.Sector || '',
            ltp:    s.LTP    || 0
        }));
    } catch(e) { console.warn('Symbol list load failed:', e); }
}

function pfSymbolSearch(query) {
    const dd = document.getElementById('pfSymbolDropdown');
    if (!query || query.length < 1) { dd.style.display = 'none'; return; }

    const matches = _pfAllSymbols
        .filter(s => s.symbol.startsWith(query))
        .slice(0, 10);

    if (!matches.length) { dd.style.display = 'none'; return; }

    _pfDropIndex = -1;
    dd.innerHTML = matches.map((s, i) => `
        <div class="pf-ac-item" data-symbol="${s.symbol}" data-idx="${i}"
            onclick="pfSelectSymbol('${s.symbol}')"
            onmouseenter="pfDropHover(${i})"
            style="padding:9px 14px; cursor:pointer; display:flex; justify-content:space-between;
                   align-items:center; border-bottom:1px solid rgba(255,255,255,0.04);
                   font-size:0.85rem; transition:background 0.1s;">
            <span style="font-weight:700; color:var(--text-primary);">${s.symbol}</span>
            <span style="font-size:0.72rem; color:var(--text-muted);">${s.sector}</span>
            <span style="font-size:0.78rem; font-weight:600; color:#14b8a6;">₹${parseFloat(s.ltp).toLocaleString('en-IN', {maximumFractionDigits:2})}</span>
        </div>`).join('');
    dd.style.display = 'block';
}

function pfDropHover(idx) {
    _pfDropIndex = idx;
    document.querySelectorAll('.pf-ac-item').forEach((el, i) => {
        el.style.background = i === idx ? 'rgba(20,184,166,0.12)' : '';
    });
}

function pfSymbolKeyNav(e) {
    const items = document.querySelectorAll('.pf-ac-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _pfDropIndex = Math.min(_pfDropIndex + 1, items.length - 1);
        pfDropHover(_pfDropIndex);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _pfDropIndex = Math.max(_pfDropIndex - 1, 0);
        pfDropHover(_pfDropIndex);
    } else if (e.key === 'Enter' && _pfDropIndex >= 0) {
        e.preventDefault();
        pfSelectSymbol(items[_pfDropIndex].dataset.symbol);
    } else if (e.key === 'Escape') {
        document.getElementById('pfSymbolDropdown').style.display = 'none';
    }
}

function pfSelectSymbol(symbol) {
    document.getElementById('pfSymbol').value = symbol;
    document.getElementById('pfSymbolDropdown').style.display = 'none';
    // Auto-fill LTP as buy price suggestion
    const stock = _pfAllSymbols.find(s => s.symbol === symbol);
    if (stock && stock.ltp && !document.getElementById('pfBuyPrice').value) {
        document.getElementById('pfBuyPrice').value = parseFloat(stock.ltp).toFixed(2);
    }
    document.getElementById('pfQty').focus();
}

// ── Buy Modal ─────────────────────────────────────────────────
function openBuyModal() {
    // Set today's date as default
    document.getElementById('pfBuyDate').value  = new Date().toISOString().split('T')[0];
    document.getElementById('pfSymbol').value   = '';
    document.getElementById('pfQty').value      = '';
    document.getElementById('pfBuyPrice').value = '';
    document.getElementById('pfNotes').value    = '';
    document.getElementById('buyMsg').style.display = 'none';
    document.getElementById('pfSymbolDropdown').style.display = 'none';
    document.getElementById('buyModal').style.display = 'flex';
    // Pre-load symbol list in background
    pfLoadSymbols();
    // Close dropdown when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function pfOutside(e) {
            if (!e.target.closest('#pfSymbol') && !e.target.closest('#pfSymbolDropdown')) {
                document.getElementById('pfSymbolDropdown').style.display = 'none';
            }
        }, { once: false, capture: false });
    }, 100);
}
function closeBuyModal() {
    document.getElementById('buyModal').style.display = 'none';
}

async function submitBuyTrade() {
    const symbol   = document.getElementById('pfSymbol').value.trim().toUpperCase();
    const qty      = parseFloat(document.getElementById('pfQty').value);
    const buyPrice = parseFloat(document.getElementById('pfBuyPrice').value);
    const buyDate  = document.getElementById('pfBuyDate').value;
    const notes    = document.getElementById('pfNotes').value.trim();
    const msg      = document.getElementById('buyMsg');

    if (!symbol || !qty || !buyPrice || !buyDate) {
        msg.textContent = '⚠️ Sab required fields bharo!';
        msg.style.background = 'rgba(239,68,68,0.15)';
        msg.style.color = '#ef4444';
        msg.style.display = 'block';
        return;
    }

    try {
        msg.textContent = '⏳ Adding...';
        msg.style.background = 'rgba(255,255,255,0.05)';
        msg.style.color = 'var(--text-muted)';
        msg.style.display = 'block';

        const res = await fetch(`${API}/portfolio/buy`, {
            method: 'POST',
            headers: typeof authHeaders === 'function' ? authHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, quantity: qty, buyPrice, buyDate, notes })
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        msg.textContent = `✅ ${data.message}`;
        msg.style.background = 'rgba(34,197,94,0.15)';
        msg.style.color = '#22c55e';

        setTimeout(() => {
            closeBuyModal();
            loadPortfolioPage();
        }, 1200);

    } catch(e) {
        msg.textContent = '❌ Error: ' + e.message;
        msg.style.background = 'rgba(239,68,68,0.15)';
        msg.style.color = '#ef4444';
    }
}

// ── Sell Modal ────────────────────────────────────────────────
function openSellModal(symbol, maxQty, ltp) {
    document.getElementById('sellSymbolLabel').textContent  = `📌 Selling: ${symbol} (Available: ${maxQty} shares)`;
    document.getElementById('sellSymbolHidden').value       = symbol;
    document.getElementById('pfSellQty').value              = maxQty;
    document.getElementById('pfSellQty').max               = maxQty;
    document.getElementById('pfSellPrice').value            = ltp;
    document.getElementById('pfSellDate').value             = new Date().toISOString().split('T')[0];
    document.getElementById('sellPnlPreview').style.display = 'none';
    document.getElementById('sellMsg').style.display        = 'none';
    document.getElementById('sellModal').style.display      = 'flex';

    // Live P&L preview
    const update = () => {
        const sp = parseFloat(document.getElementById('pfSellPrice').value) || 0;
        const sq = parseFloat(document.getElementById('pfSellQty').value)   || 0;
        if (sp && sq) {
            // We need avg — store it in a data attr isn't perfect but works for preview
            const preview = document.getElementById('sellPnlPreview');
            preview.style.display = 'block';
            preview.textContent   = `LTP ₹${ltp} × ${sq} shares → ₹${(sp * sq).toLocaleString('en-IN', {maximumFractionDigits:0})}`;
            preview.style.background = 'rgba(255,255,255,0.05)';
            preview.style.color = 'var(--text-secondary)';
        }
    };
    document.getElementById('pfSellPrice').oninput = update;
    document.getElementById('pfSellQty').oninput   = update;
}

async function submitSellTrade() {
    const symbol    = document.getElementById('sellSymbolHidden').value;
    const qty       = parseFloat(document.getElementById('pfSellQty').value);
    const sellPrice = parseFloat(document.getElementById('pfSellPrice').value);
    const sellDate  = document.getElementById('pfSellDate').value;
    const msg       = document.getElementById('sellMsg');

    if (!qty || !sellPrice || !sellDate) {
        msg.textContent = '⚠️ Sab required fields bharo!';
        msg.style.background = 'rgba(239,68,68,0.15)';
        msg.style.color = '#ef4444';
        msg.style.display = 'block';
        return;
    }

    try {
        msg.textContent = '⏳ Processing sell...';
        msg.style.background = 'rgba(255,255,255,0.05)';
        msg.style.color = 'var(--text-muted)';
        msg.style.display = 'block';

        const res = await fetch(`${API}/portfolio/sell`, {
            method: 'POST',
            headers: typeof authHeaders === 'function' ? authHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, quantity: qty, sellPrice, sellDate })
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        const pnl   = data.realizedPnL;
        const isGain= pnl >= 0;
        msg.textContent = `${isGain ? '🟢 Profit' : '🔴 Loss'}: ${isGain ? '+' : ''}₹${Math.abs(pnl).toLocaleString('en-IN', {maximumFractionDigits:0})} — ${data.message}`;
        msg.style.background = isGain ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
        msg.style.color = isGain ? '#22c55e' : '#ef4444';

        setTimeout(() => {
            document.getElementById('sellModal').style.display = 'none';
            loadPortfolioPage();
        }, 1500);

    } catch(e) {
        msg.textContent = '❌ Error: ' + e.message;
        msg.style.background = 'rgba(239,68,68,0.15)';
        msg.style.color = '#ef4444';
    }
}

// ── Delete holding ────────────────────────────────────────────
async function deleteHolding(id, symbol) {
    if (!confirm(`⚠️ "${symbol}" ko portfolio se delete karein?\n(Trade history remove nahi hogi)`)) return;
    try {
        await fetch(`${API}/portfolio/${id}`, {
            method: 'DELETE',
            headers: typeof authHeaders === 'function' ? authHeaders() : {}
        });
        loadPortfolioPage();
    } catch(e) { alert('Delete error: ' + e.message); }
}

// ── Trade History ─────────────────────────────────────────────
async function showTradeHistory() {
    try {
        const trades = await fetchJSON(`${API}/portfolio/trades`);
        const rows = trades.map((t, i) => {
            const isSell = t.TradeType === 'SELL';
            const pnl = isSell ? parseFloat(t.RealizedPnL) : null;
            return `<tr>
                <td>${i+1}</td>
                <td>${t.TradeDate ? t.TradeDate.split('T')[0] : '--'}</td>
                <td><strong>${t.Symbol}</strong></td>
                <td><span style="color:${isSell ? '#ef4444' : '#22c55e'};font-weight:700;">${t.TradeType}</span></td>
                <td>${parseFloat(t.Quantity).toFixed(0)}</td>
                <td>₹${parseFloat(t.Price).toLocaleString('en-IN', {maximumFractionDigits:2})}</td>
                <td style="color:${pnl === null ? 'var(--text-muted)' : pnl >= 0 ? '#22c55e' : '#ef4444'};font-weight:${pnl !== null ? '700' : '400'};">
                    ${pnl !== null ? (pnl >= 0 ? '+₹' : '-₹') + Math.abs(pnl).toLocaleString('en-IN', {maximumFractionDigits:0}) : '--'}
                </td>
                <td style="font-size:0.75rem;color:var(--text-muted);">${t.Notes || ''}</td>
            </tr>`;
        }).join('');

        // Reuse the existing modal pattern
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
        <div class="modal-content" style="max-width:820px;max-height:80vh;overflow-y:auto;">
            <div class="modal-header">
                <h2>📜 Trade History</h2>
                <span class="close-modal" onclick="this.closest('.modal').remove()">×</span>
            </div>
            <table class="data-table modal-table" style="margin-top:12px;">
                <thead><tr><th>#</th><th>Date</th><th>Symbol</th><th>Type</th><th>Qty</th><th>Price</th><th>P&L</th><th>Notes</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="8" style="text-align:center">No trades yet</td></tr>'}</tbody>
            </table>
        </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    } catch(e) { alert('Error loading trades: ' + e.message); }
}

// ===== HISTORICAL BREAKOUT LOADERS =====
async function loadSuperTrendHistory() {
    const date = document.getElementById('dateSelect').value;
    const tbody = document.getElementById('supertrendTableBody');
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Checking history...</td></tr>`;
    try {
        const data = await fetchJSON(`${API}/scanner/history?date=${date}&type=SuperTrend`);
        if (data && data.length > 0) {
            tbody.innerHTML = data.map((s, i) => {
                const bDate = new Date(s.BreakoutDate).toLocaleDateString('en-IN');
                const bPrice = parseFloat(s.BreakoutPrice) || 0;
                const cPrice = parseFloat(s.CurrentPrice) || bPrice || 0;
                const movPct = bPrice > 0 ? ((cPrice - bPrice) / bPrice) * 100 : 0;
                
                return `
                <tr>
                    <td class="symbol-cell">
                        <span class="star-icon" onclick="toggleWatchlist('${s.Symbol}')" id="star-${s.Symbol}">${isWatchlisted(s.Symbol)?'⭐':'☆'}</span> 
                        <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${s.Symbol}')">${s.Symbol}</a>
                    </td>
                    <td><span class="sector-pill">${s.Sector || 'Others'}</span></td>
                    <td style="font-weight: 500;">📅 ${bDate}</td>
                    <td class="gain">₹${fmtNum(bPrice)}</td>
                    <td style="font-weight: 600; color: var(--text-primary);">₹${fmtNum(cPrice)}</td>
                    <td><span class="pct-badge ${pctClass(movPct)}">${signedPct(movPct)}</span></td>
                    <td style="color: var(--text-muted); font-size: 0.8rem;">SuperTrend</td>
                    <td><button class="btn-premium" onclick="openStockModal('${s.Symbol}')" style="padding: 5px 10px; font-size: 0.8rem;">View Chart</button></td>
                </tr>`;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
                No saved breakouts for this date. Click 'Run Live Scan' to scan and save results.
            </td></tr>`;
        }
    } catch(e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="8" class="loading-row" style="color:#ef4444">Error loading history: ${e.message}</td></tr>`;
    }
}

async function loadVolumeBreakoutHistory() {
    const date = document.getElementById('dateSelect').value;
    const tbody = document.getElementById('volBreakoutTableBody');
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Checking history...</td></tr>`;
    try {
        const data = await fetchJSON(`${API}/scanner/history?date=${date}&type=VolumeBreakout`);
        if (data && data.length > 0) {
            tbody.innerHTML = data.map((s, i) => {
                const bDate = new Date(s.BreakoutDate).toLocaleDateString('en-IN');
                const bPrice = parseFloat(s.BreakoutPrice) || 0;
                const cPrice = parseFloat(s.CurrentPrice) || bPrice || 0;
                const movPct = bPrice > 0 ? ((cPrice - bPrice) / bPrice) * 100 : 0;
                const metrics = s.Metrics || '';
                
                return `
                <tr>
                    <td class="symbol-cell">
                        <span class="star-icon" onclick="toggleWatchlist('${s.Symbol}')" id="star-${s.Symbol}">${isWatchlisted(s.Symbol)?'⭐':'☆'}</span> 
                        <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${s.Symbol}')">${s.Symbol}</a>
                    </td>
                    <td><span class="sector-pill">${s.Sector || 'Others'}</span></td>
                    <td style="font-weight: 500;">📅 ${bDate}</td>
                    <td class="gain">₹${fmtNum(bPrice)}</td>
                    <td style="font-weight: 600; color: var(--text-primary);">₹${fmtNum(cPrice)}</td>
                    <td><span class="pct-badge ${pctClass(movPct)}">${signedPct(movPct)}</span></td>
                    <td style="color: var(--text-muted); font-size: 0.8rem; font-weight:600;">${metrics}</td>
                    <td><button class="btn-premium" onclick="openStockModal('${s.Symbol}')" style="padding: 5px 10px; font-size: 0.8rem;">View Chart</button></td>
                </tr>`;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
                No saved breakouts for this date. Click 'Run Live Scan' to scan and save results.
            </td></tr>`;
        }
    } catch(e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="8" class="loading-row" style="color:#ef4444">Error loading history: ${e.message}</td></tr>`;
    }
}

async function loadRangeBreakoutHistory() {
    const date = document.getElementById('dateSelect').value;
    const tbody = document.getElementById('rangeBreakoutTableBody');
    tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Checking history...</td></tr>`;
    try {
        const data = await fetchJSON(`${API}/scanner/history?date=${date}&type=RangeBreakout`);
        if (data && data.length > 0) {
            tbody.innerHTML = data.map((s, i) => {
                const bDate = new Date(s.BreakoutDate).toLocaleDateString('en-IN');
                const bPrice = parseFloat(s.BreakoutPrice) || 0;
                const cPrice = parseFloat(s.CurrentPrice) || bPrice || 0;
                const movPct = bPrice > 0 ? ((cPrice - bPrice) / bPrice) * 100 : 0;
                const metrics = s.Metrics || '';
                const parts = metrics.split(',');
                const rangePct = parts[0] ? parts[0].replace('Range:', '').trim() : '--';
                const volRatio = parts[1] ? parts[1].replace('VolRatio:', '').trim() : '--';
                
                return `
                <tr>
                    <td class="symbol-cell">
                        <span class="star-icon" onclick="toggleWatchlist('${s.Symbol}')" id="star-${s.Symbol}">${isWatchlisted(s.Symbol)?'⭐':'☆'}</span> 
                        <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('${s.Symbol}')">${s.Symbol}</a>
                    </td>
                    <td><span class="sector-pill">${s.Sector || 'Others'}</span></td>
                    <td style="font-weight: 500;">📅 ${bDate}</td>
                    <td class="gain">₹${fmtNum(bPrice)}</td>
                    <td style="font-weight: 600; color: var(--text-primary);">₹${fmtNum(cPrice)}</td>
                    <td><span class="pct-badge ${pctClass(movPct)}">${signedPct(movPct)}</span></td>
                    <td style="color: var(--text-muted); font-size: 0.8rem;">Range: ${rangePct}, VolRatio: ${volRatio}</td>
                    <td><button class="btn-premium" onclick="openStockModal('${s.Symbol}')" style="padding: 5px 10px; font-size: 0.8rem;">View Chart</button></td>
                </tr>`;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
                No saved breakouts for this date. Click 'Run Live Scan' to scan and save results.
            </td></tr>`;
        }
    } catch(e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="8" class="loading-row" style="color:#ef4444">Error loading history: ${e.message}</td></tr>`;
    }
}

// ── Manage Users Page Logic ────────────────────────────────────
async function loadManageUsersPage() {
    const tbody = document.getElementById('tbody-users');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" class="loading-row">Loading registered users...</td></tr>`;
    try {
        const users = await fetchJSON(`${API}/auth/users`);
        if (users && users.length > 0) {
            const currentUser = getAuthUser();
            tbody.innerHTML = users.map(u => {
                const regDate = u.CreatedAt ? new Date(u.CreatedAt).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                }) : 'N/A';
                
                const isSelf = currentUser && (currentUser.username === u.Username);
                const dropdownHtml = isSelf 
                    ? `<span style="color:var(--text-muted); font-size:0.8rem; font-style:italic;">You (Cannot change self)</span>`
                    : `<select class="date-select" style="padding: 4px 8px; font-size: 0.8rem;" onchange="updateUserRole(${u.Id}, '${u.Username}', this.value)">
                           <option value="user" ${u.Role === 'user' ? 'selected' : ''}>User (Normal Access)</option>
                           <option value="admin" ${u.Role === 'admin' ? 'selected' : ''}>Admin (All Access)</option>
                       </select>`;

                return `<tr>
                    <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(u.Username)}</td>
                    <td style="color:var(--text-secondary);">${escapeHtml(u.Email)}</td>
                    <td>
                        <span class="pct-badge ${u.Role === 'admin' ? 'gain' : 'neutral'}" style="text-transform:uppercase; font-size:0.75rem;">
                            ${u.Role}
                        </span>
                    </td>
                    <td style="color:var(--text-muted); font-size:0.8rem;">${regDate}</td>
                    <td>${dropdownHtml}</td>
                </tr>`;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">No users found.</td></tr>`;
        }
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="5" class="loading-row" style="color:#ef4444">Error loading users: ${e.message}</td></tr>`;
    }
}

async function updateUserRole(userId, username, newRole) {
    if (!confirm(`⚠️ User "${username}" ka role change karke "${newRole.toUpperCase()}" karein?`)) {
        loadManageUsersPage(); // Reset dropdown state to original
        return;
    }
    
    try {
        const res = await fetch(`${API}/auth/users/update-role`, {
            method: 'POST',
            headers: typeof authHeaders === 'function' ? authHeaders() : { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, role: newRole })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed');
        
        alert(`✅ Success: User "${username}" is now ${newRole.toUpperCase()}!`);
        loadManageUsersPage();
    } catch(e) {
        alert('Role update error: ' + e.message);
        loadManageUsersPage();
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Start live ticking clocks every second
setInterval(updateMarketClocks, 1000);
