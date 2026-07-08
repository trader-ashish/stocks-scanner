const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

// 1. Replace <td class="symbol-cell">${s.Symbol}</td> with new format in all occurrences
content = content.replace(/<td class="symbol-cell">\$\{s\.Symbol\}<\/td>/g, 
    `<td class="symbol-cell">
        <span class="star-icon" onclick="toggleWatchlist('\${s.Symbol}')" id="star-\${s.Symbol}">\${isWatchlisted(s.Symbol)?'⭐':'☆'}</span> 
        <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('\${s.Symbol}')">\${s.Symbol}</a>
    </td>`
);

// We need a helper to format SMA in tables if they have them, but we won't add SMA to ALL tables right now.
// For watchlist we can show SMA. We need to add the Watchlist JS logic at the end of the file.

const appendLogic = `
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
    document.querySelectorAll(\`#star-\${symbol}\`).forEach(el => {
        el.textContent = list.includes(symbol) ? '⭐' : '☆';
    });
    
    if (document.getElementById('page-watchlist').classList.contains('active')) {
        loadWatchlistData();
    }
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
        const res = await fetchJSON(\`\${API}/stocks\${date ? '?date='+date : ''}\`);
        const stocks = res.stocks || [];
        const filtered = stocks.filter(s => list.includes(s.Symbol));
        
        tbody.innerHTML = filtered.map((s, i) => \`
            <tr>
                <td class="neutral-val">\${i+1}</td>
                <td class="symbol-cell">
                    <span class="star-icon" onclick="toggleWatchlist('\${s.Symbol}')" id="star-\${s.Symbol}">⭐</span> 
                    <a href="#" style="color:var(--text-primary); text-decoration:none;" onclick="openStockModal('\${s.Symbol}')">\${s.Symbol}</a>
                </td>
                <td style="font-size:0.75rem; color:var(--text-muted);">\${s.Sector}</td>
                <td style="font-weight:600;">₹\${fmtNum(s.LTP)}</td>
                <td>₹\${fmtNum(s.Open)}</td>
                <td class="\${s.PctChange >= 0 ? 'bullish-val' : 'bearish-val'}">\${s.PctChange >= 0 ? '+' : ''}\${s.PctChange}%</td>
                <td>\${fmtVol(s.Volume)}</td>
                <td>\${fmtCr(s.Value)}</td>
                <td>₹\${fmtNum(s.High52W)}</td>
                <td>\${(((s.LTP - s.High52W) / s.High52W) * 100).toFixed(2)}%</td>
                <td>\${s.SMA50 ? '₹'+fmtNum(s.SMA50) : '-'}</td>
                <td>\${s.SMA200 ? '₹'+fmtNum(s.SMA200) : '-'}</td>
            </tr>
        \`).join('');
    } catch(e) {
        tbody.innerHTML = \`<tr><td colspan="12" style="color:red; text-align:center;">Failed to load watchlist: \${e.message}</td></tr>\`;
    }
}

// ==========================================
// DETAILED STOCK MODAL & CHART
// ==========================================
let stockChartInstance = null;

async function openStockModal(symbol) {
    document.getElementById('modalStockTitle').textContent = \`\${symbol} Details\`;
    const modal = document.getElementById('stockModal');
    modal.style.display = 'block';
    
    document.getElementById('modalStockStats').innerHTML = '<div class="loading-pulse">Loading Historical Data...</div>';
    
    if (stockChartInstance) {
        stockChartInstance.destroy();
        stockChartInstance = null;
    }
    
    try {
        const res = await fetchJSON(\`\${API}/stocks/\${encodeURIComponent(symbol)}/history\`);
        
        document.getElementById('modalStockStats').innerHTML = \`
            <div><strong>Symbol:</strong> \${res.symbol}</div>
            <div><strong>Data:</strong> 6 Months Daily</div>
        \`;
        
        const ctx = document.getElementById('stockHistoryChart').getContext('2d');
        const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim();
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim();
        
        // Find min/max for better scaling
        const minPrice = Math.min(...res.prices) * 0.95;
        const maxPrice = Math.max(...res.prices) * 1.05;

        stockChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: res.labels,
                datasets: [{
                    label: 'Closing Price (₹)',
                    data: res.prices,
                    borderColor: '#3b82f6', // blue
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: textColor } },
                    y: { 
                        min: minPrice,
                        max: maxPrice,
                        grid: { color: gridColor }, 
                        ticks: { color: textColor } 
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
        
    } catch(e) {
        document.getElementById('modalStockStats').innerHTML = \`<div style="color:red;">Error: \${e.message}</div>\`;
    }
}

function closeStockModal() {
    document.getElementById('stockModal').style.display = 'none';
    if (stockChartInstance) {
        stockChartInstance.destroy();
        stockChartInstance = null;
    }
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
            text = text.replace(/\\n/g, ' '); // remove newlines
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
    
    const csvFile = new Blob([csv.join('\\n')], {type: 'text/csv'});
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
extraCss.innerHTML = \`
.star-icon { cursor:pointer; font-size:1.1rem; color:#eab308; margin-right:5px; transition: transform 0.2s; }
.star-icon:hover { transform: scale(1.2); }
\`;
document.head.appendChild(extraCss);

`;

content += appendLogic;
fs.writeFileSync('app.js', content);
console.log("App.js patched successfully.");
