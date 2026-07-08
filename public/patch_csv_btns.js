const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const pages = [
    { id: 'page-intraday', tbody: 'intradayTableBody', name: 'IntradayPicks' },
    { id: 'page-weekly', tbody: 'weeklyTableBody', name: 'WeeklyPicks' },
    { id: 'page-swing', tbody: 'swingTableBody', name: 'SwingPicks' },
    { id: 'page-breakout', tbody: 'breakoutTableBody', name: 'BreakoutStocks' },
    { id: 'page-sectors', tbody: 'sectorRotationBody', name: 'SectorRotation' },
    { id: 'page-allstocks', tbody: 'allStocksBody', name: 'AllStocks' }
];

pages.forEach(p => {
    // Find <div class="filter-row"> inside this page
    const pageIndex = html.indexOf(`id="${p.id}"`);
    if (pageIndex !== -1) {
        const filterRowStart = html.indexOf('<div class="filter-row">', pageIndex);
        if (filterRowStart !== -1 && filterRowStart < html.indexOf('<table', pageIndex)) {
            const insertIdx = filterRowStart + '<div class="filter-row">'.length;
            const btnHtml = `\n                    <button class="btn-premium" onclick="exportTableToCSV('${p.tbody}', '${p.name}.csv')">⬇️ Export CSV</button>`;
            
            // Check if it already has export button
            const nextTag = html.substring(insertIdx, insertIdx + 150);
            if (!nextTag.includes('Export CSV')) {
                html = html.substring(0, insertIdx) + btnHtml + html.substring(insertIdx);
            }
        }
    }
});

fs.writeFileSync('index.html', html);
console.log("HTML patched with CSV buttons.");
