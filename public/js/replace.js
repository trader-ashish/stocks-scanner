const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');
content = content.replace(/'rgba\(255,255,255,0\.2\)'/g, "getComputedStyle(document.documentElement).getPropertyValue('--chart-zero').trim()");
fs.writeFileSync('app.js', content);
console.log('Zero grid Replaced successfully.');
