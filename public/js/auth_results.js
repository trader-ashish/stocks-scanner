// ============================================================
// ===== AUTH FUNCTIONS =====
// ============================================================
function getAuthToken() { return localStorage.getItem('ss_token'); }
function getAuthUser() {
    try { return JSON.parse(localStorage.getItem('ss_user') || 'null'); } catch { return null; }
}

function updateAuthUI() {
    const user = getAuthUser();
    const token = getAuthToken();
    const loggedIn  = document.getElementById('authLoggedIn');
    const loggedOut = document.getElementById('authLoggedOut');
    if (!loggedIn || !loggedOut) return;

    const mainContent = document.querySelector('.main-content');
    const sidebarNav = document.querySelector('.sidebar-nav');

    if (user && token) {
        // ── LOGGED IN ──
        loggedOut.style.display = 'none';
        loggedIn.style.display  = 'block';
        document.getElementById('sidebarUsername').textContent = user.username;
        document.getElementById('sidebarRole').textContent     = user.role;

        // Show all protected buttons
        document.querySelectorAll('.auth-required').forEach(el => {
            el.style.display = el.dataset.display || 'inline-flex';
        });
        
        // Restore main content access
        if (mainContent) {
            mainContent.style.filter = 'none';
            mainContent.style.pointerEvents = 'auto';
        }
        if (sidebarNav) {
            sidebarNav.style.pointerEvents = 'auto';
            sidebarNav.style.opacity = '1';
        }

        closeAuthModal();
    } else {
        // ── LOGGED OUT ──
        loggedOut.style.display = 'block';
        loggedIn.style.display  = 'none';

        // Hide all protected buttons
        document.querySelectorAll('.auth-required').forEach(el => {
            el.style.display = 'none';
        });

        // Lock main content access and blur it
        if (mainContent) {
            mainContent.style.filter = 'blur(5px)';
            mainContent.style.pointerEvents = 'none';
        }
        if (sidebarNav) {
            sidebarNav.style.pointerEvents = 'none';
            sidebarNav.style.opacity = '0.3';
        }

        // Show unclosable login modal
        openAuthModal('login');
    }
}

function openAuthModal(tab = 'login') {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    
    // Hide close button if logged out to force login
    const closeBtn = modal.querySelector('.auth-close-btn');
    const user = getAuthUser();
    const token = getAuthToken();
    
    if (closeBtn) {
        closeBtn.style.display = (user && token) ? 'block' : 'none';
    }
    
    switchAuthTab(tab);
}

function closeAuthModal() {
    const user = getAuthUser();
    const token = getAuthToken();
    // Only allow closing if logged in
    if (user && token) {
        document.getElementById('authModal').style.display = 'none';
    }
}
function switchAuthTab(tab) {
    document.getElementById('formLogin').style.display    = tab === 'login'    ? 'block' : 'none';
    document.getElementById('formRegister').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('tabLogin').classList.toggle('active',    tab === 'login');
    document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
}

async function doLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    if (!username || !password) { errEl.textContent = 'Please fill all fields'; return; }
    try {
        const res = await fetch(`${API}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error || 'Login failed'; return; }
        localStorage.setItem('ss_token', data.token);
        localStorage.setItem('ss_user', JSON.stringify({ username: data.username, role: data.role }));
        updateAuthUI();
        closeAuthModal();
        showToast(`Welcome back, ${data.username}! 👋`);
    } catch (e) { errEl.textContent = 'Server error: ' + e.message; }
}

async function doRegister() {
    const username = document.getElementById('regUsername').value.trim();
    const email    = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const errEl  = document.getElementById('regError');
    const succEl = document.getElementById('regSuccess');
    errEl.textContent = ''; succEl.textContent = '';
    if (!username || !email || !password) { errEl.textContent = 'Please fill all fields'; return; }
    if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters'; return; }
    try {
        const res = await fetch(`${API}/auth/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error || 'Registration failed'; return; }
        succEl.textContent = '✅ Account created! Please login.';
        setTimeout(() => switchAuthTab('login'), 1500);
    } catch (e) { errEl.textContent = 'Server error: ' + e.message; }
}

function doLogout() {
    localStorage.removeItem('ss_token');
    localStorage.removeItem('ss_user');
    updateAuthUI();
    showToast('Logged out successfully');
}

function authHeaders() {
    const token = getAuthToken();
    return token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
                 : { 'Content-Type': 'application/json' };
}

// ============================================================
// ===== FUNDAMENTALS FUNCTIONS =====
// ============================================================
function openFundModal(data = null) {
    document.getElementById('fundModal').style.display = 'flex';
    document.getElementById('fundModalTitle').textContent = data ? '💎 Edit Fundamentals' : '💎 Add Fundamentals';
    document.getElementById('fundError').textContent = '';
    document.getElementById('fundSymbol').value    = data?.Symbol || '';
    document.getElementById('fundSymbol').disabled = !!data;
    document.getElementById('fundCompany').value   = data?.CompanyName || '';
    document.getElementById('fundPE').value        = data?.PE_Ratio || '';
    document.getElementById('fundEPS').value       = data?.EPS || '';
    document.getElementById('fundRevenue').value   = data?.Revenue_Cr || '';
    document.getElementById('fundProfit').value    = data?.NetProfit_Cr || '';
    document.getElementById('fundROE').value       = data?.ROE || '';
    document.getElementById('fundROCE').value      = data?.ROCE || '';
    document.getElementById('fundDE').value        = data?.DebtToEquity || '';
    document.getElementById('fundMCap').value      = data?.MarketCap_Cr || '';
    document.getElementById('fundBV').value        = data?.BookValue || '';
    document.getElementById('fundDY').value        = data?.DividendYield || '';
    document.getElementById('fundNotes').value     = data?.Notes || '';
    document.getElementById('fundSymbolHidden').value = data?.Symbol || '';
}
function closeFundModal() { document.getElementById('fundModal').style.display = 'none'; }

async function saveFundamentals() {
    const sym = (document.getElementById('fundSymbolHidden').value || document.getElementById('fundSymbol').value).toUpperCase().trim();
    if (!sym) { document.getElementById('fundError').textContent = 'Symbol is required'; return; }
    if (!getAuthToken()) { showToast('Please login first!'); openAuthModal(); return; }
    const payload = {
        Symbol:        sym,
        CompanyName:   document.getElementById('fundCompany').value || null,
        PE_Ratio:      parseFloat(document.getElementById('fundPE').value) || null,
        EPS:           parseFloat(document.getElementById('fundEPS').value) || null,
        Revenue_Cr:    parseFloat(document.getElementById('fundRevenue').value) || null,
        NetProfit_Cr:  parseFloat(document.getElementById('fundProfit').value) || null,
        ROE:           parseFloat(document.getElementById('fundROE').value) || null,
        ROCE:          parseFloat(document.getElementById('fundROCE').value) || null,
        DebtToEquity:  parseFloat(document.getElementById('fundDE').value) || null,
        MarketCap_Cr:  parseFloat(document.getElementById('fundMCap').value) || null,
        BookValue:     parseFloat(document.getElementById('fundBV').value) || null,
        DividendYield: parseFloat(document.getElementById('fundDY').value) || null,
        Notes:         document.getElementById('fundNotes').value || null,
    };
    try {
        const res = await fetch(`${API}/fundamentals`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) { document.getElementById('fundError').textContent = data.error; return; }
        showToast('✅ Fundamentals saved for ' + sym);
        closeFundModal();
        await loadFundamentalsTable();
    } catch (e) { document.getElementById('fundError').textContent = e.message; }
}

async function deleteFundamental(sym) {
    if (!confirm(`Delete fundamentals for ${sym}?`)) return;
    if (!getAuthToken()) { showToast('Please login first!'); openAuthModal(); return; }
    try {
        await fetch(`${API}/fundamentals/${sym}`, { method: 'DELETE', headers: authHeaders() });
        showToast('Deleted ' + sym);
        await loadFundamentalsTable();
    } catch(e) { showToast('Error: ' + e.message); }
}

async function loadFundamentalsTable() {
    const tbody = document.getElementById('fundTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10" class="loading-row"><div class="loading-pulse">Loading Custom Fundamentals...</div></td></tr>';
    try {
        const data = await fetchJSON(`${API}/fundamentals`);
        if (!data || !data.length) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:20px;">No custom fundamentals added yet. Click "Add Fundamental Data" above to add one.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(f => {
            const actionBtns = getAuthToken() ? `
                <button class="btn-sm" onclick='openFundModal(${JSON.stringify(f)})'>✏️</button>
                <button class="btn-sm" style="background:rgba(239,68,68,0.15);color:#ef4444;" onclick="deleteFundamental('${f.Symbol}')">🗑️</button>` : '';
            return `
            <tr>
                <td><strong>${f.Symbol}</strong></td>
                <td style="font-size:0.75rem">${f.CompanyName || '-'}</td>
                <td>${f.PE_Ratio ?? '-'}</td>
                <td>${f.EPS ?? '-'}</td>
                <td>${f.Revenue_Cr ? '₹'+fmtNum(f.Revenue_Cr)+'Cr' : '-'}</td>
                <td>${f.NetProfit_Cr ? '₹'+fmtNum(f.NetProfit_Cr)+'Cr' : '-'}</td>
                <td>${f.ROE ? f.ROE+'%' : '-'}</td>
                <td>${f.ROCE ? f.ROCE+'%' : '-'}</td>
                <td>${f.DebtToEquity ?? '-'}</td>
                <td style="display:flex;gap:6px;">${actionBtns}</td>
            </tr>`;
        }).join('');
    } catch(e) { tbody.innerHTML = `<tr><td colspan="10" style="color:red;text-align:center;">Failed to load fundamentals: ${e.message}</td></tr>`; }
}

// ============================================================
// ===== RESULTS CALENDAR FUNCTIONS =====
// ============================================================
async function loadResultsPage() {
    await Promise.all([
        loadResultsTab('upcoming'),
        loadResultsTab('recent'),
        loadResultsTab('past'),
    ]);
    updateAuthUI();
}

async function loadResultsTab(filter) {
    const tbody = document.getElementById(`tbody-${filter}`);
    const cntEl = document.getElementById(`cnt-${filter}`);
    if (!tbody) return;
    try {
        const data = await fetchJSON(`${API}/results?filter=${filter}`);
        if (cntEl) cntEl.textContent = data.length || '';
        if (filter === 'upcoming') {
            const badge = document.getElementById('badge-results');
            if (badge && data.length) badge.textContent = data.length;
        }
        if (!data.length) {
            const cols = filter === 'upcoming' ? 9 : 10;
            tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;color:var(--text-muted);padding:20px;">No ${filter} results found.</td></tr>`;
            return;
        }
        if (filter === 'upcoming') {
            tbody.innerHTML = data.map(r => {
                const days = r.DaysLeft;
                const dClass = days === 0 ? 'days-left-soon' : days <= 3 ? 'days-left-near' : 'days-left-ok';
                const dLabel = days === 0 ? 'TODAY!' : days < 0 ? 'Past' : `${days}d`;
                const actionBtns = getAuthToken() ? `
                    <button class="btn-sm" onclick="openUpdateResultModal(${r.Id},'${r.Symbol}')">📝</button>
                    <button class="btn-sm" style="background:rgba(239,68,68,0.1);color:#ef4444;" onclick="deleteResult(${r.Id})">🗑️</button>` : '';
                return `<tr>
                    <td><strong>${r.Symbol}</strong></td>
                    <td>${r.Quarter || '-'}</td>
                    <td>${formatDate(r.ResultDate)}</td>
                    <td class="${dClass}">${dLabel}</td>
                    <td>${r.Est_Revenue_Cr ? '₹'+fmtNum(r.Est_Revenue_Cr)+'Cr' : '-'}</td>
                    <td>${r.Est_Profit_Cr  ? '₹'+fmtNum(r.Est_Profit_Cr) +'Cr' : '-'}</td>
                    <td>${r.Est_EPS ?? '-'}</td>
                    <td>${r.LTP ? '₹'+fmtNum(r.LTP) : '-'}</td>
                    <td style="display:flex;gap:4px;">${actionBtns}</td>
                </tr>`;
            }).join('');
        } else {
            tbody.innerHTML = data.map(r => {
                const bm = r.Beat_Miss;
                const bmBadge = bm === 'Beat'    ? `<span class="badge-beat">✅ Beat</span>` :
                                bm === 'Miss'    ? `<span class="badge-miss">❌ Miss</span>` :
                                bm === 'In-Line' ? `<span class="badge-inline">➡️ In-Line</span>` : '-';
                const yoyR = r.YoY_Revenue_Pct != null ? `<span class="${r.YoY_Revenue_Pct>=0?'gain':'loss'}">${r.YoY_Revenue_Pct>=0?'+':''}${r.YoY_Revenue_Pct}%</span>` : '-';
                const yoyP = r.YoY_Profit_Pct  != null ? `<span class="${r.YoY_Profit_Pct >=0?'gain':'loss'}">${r.YoY_Profit_Pct >=0?'+':''}${r.YoY_Profit_Pct}%</span>`  : '-';
                const actionBtns = getAuthToken() ? `
                    <button class="btn-sm" onclick="openUpdateResultModal(${r.Id},'${r.Symbol}')">📝</button>
                    <button class="btn-sm" style="background:rgba(239,68,68,0.1);color:#ef4444;" onclick="deleteResult(${r.Id})">🗑️</button>` : '';
                return `<tr>
                    <td><strong>${r.Symbol}</strong></td>
                    <td>${r.Quarter || '-'}</td>
                    <td>${formatDate(r.ResultDate)}</td>
                    <td>${bmBadge}</td>
                    <td>${r.Act_Revenue_Cr ? '₹'+fmtNum(r.Act_Revenue_Cr)+'Cr' : '-'}</td>
                    <td>${r.Act_Profit_Cr  ? '₹'+fmtNum(r.Act_Profit_Cr) +'Cr' : '-'}</td>
                    <td>${yoyR}</td>
                    <td>${yoyP}</td>
                    <td>${r.LTP ? '₹'+fmtNum(r.LTP) : '-'}</td>
                    <td style="display:flex;gap:4px;">${actionBtns}</td>
                </tr>`;
            }).join('');
        }
    } catch(e) { if(tbody) tbody.innerHTML = `<tr><td colspan="10">Error: ${e.message}</td></tr>`; }
}

function switchResultsTab(tab) {
    ['upcoming','recent','past'].forEach(t => {
        document.getElementById(`results-${t}`).style.display = t === tab ? 'block' : 'none';
        document.getElementById(`rtab-${t}`).classList.toggle('active', t === tab);
    });
}

function openAddResultModal() {
    if (!getAuthToken()) { showToast('Please login first!'); openAuthModal(); return; }
    document.getElementById('resultModal').style.display = 'flex';
    document.getElementById('resultModalTitle').textContent = '📊 Add Result Date';
    document.getElementById('resultEditId').value = '';
    document.getElementById('resultSymbol').value = '';
    document.getElementById('resultSymbol').disabled = false;
    document.getElementById('resultQuarter').value = '';
    document.getElementById('resultDate').value = '';
    document.getElementById('resultStatus').value = 'Upcoming';
    document.getElementById('resultEstRev').value = '';
    document.getElementById('resultEstPro').value = '';
    document.getElementById('resultNotes').value = '';
    document.getElementById('resultError').textContent = '';
    ['actualFields','actualFieldsP','actualFieldsE','actualFieldsF','beatMissField'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
}

function openUpdateResultModal(id, symbol) {
    if (!getAuthToken()) { showToast('Please login first!'); openAuthModal(); return; }
    document.getElementById('resultModal').style.display = 'flex';
    document.getElementById('resultModalTitle').textContent = `📝 Update Result — ${symbol}`;
    document.getElementById('resultEditId').value = id;
    document.getElementById('resultSymbol').value = symbol;
    document.getElementById('resultSymbol').disabled = true;
    document.getElementById('resultStatus').value = 'Declared';
    document.getElementById('resultError').textContent = '';
    ['actualFields','actualFieldsP','actualFieldsE','actualFieldsF','beatMissField'].forEach(id => {
        document.getElementById(id).style.display = 'block';
    });
}

function closeResultModal() { document.getElementById('resultModal').style.display = 'none'; }

async function saveResult() {
    if (!getAuthToken()) { showToast('Please login first!'); openAuthModal(); return; }
    const editId = document.getElementById('resultEditId').value;
    const errEl  = document.getElementById('resultError');
    errEl.textContent = '';

    if (editId) {
        const payload = {
            Act_Revenue_Cr:  parseFloat(document.getElementById('resultActRev').value) || null,
            Act_Profit_Cr:   parseFloat(document.getElementById('resultActPro').value) || null,
            YoY_Revenue_Pct: parseFloat(document.getElementById('resultYoYRev').value) || null,
            YoY_Profit_Pct:  parseFloat(document.getElementById('resultYoYPro').value) || null,
            Beat_Miss:       document.getElementById('resultBeatMiss').value || null,
            Notes:           document.getElementById('resultNotes').value || null,
            Status:          document.getElementById('resultStatus').value || 'Declared',
        };
        try {
            const res = await fetch(`${API}/results/${editId}`, {
                method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) { errEl.textContent = data.error; return; }
            showToast('✅ Result updated!');
            closeResultModal();
            await loadResultsPage();
        } catch(e) { errEl.textContent = e.message; }
    } else {
        const sym = document.getElementById('resultSymbol').value.toUpperCase().trim();
        const dt  = document.getElementById('resultDate').value;
        if (!sym || !dt) { errEl.textContent = 'Symbol and Date are required'; return; }
        const payload = {
            Symbol:         sym,
            Quarter:        document.getElementById('resultQuarter').value || null,
            ResultDate:     dt,
            Est_Revenue_Cr: parseFloat(document.getElementById('resultEstRev').value) || null,
            Est_Profit_Cr:  parseFloat(document.getElementById('resultEstPro').value) || null,
            Notes:          document.getElementById('resultNotes').value || null,
        };
        try {
            const res = await fetch(`${API}/results`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) { errEl.textContent = data.error; return; }
            showToast('✅ Result added for ' + sym);
            closeResultModal();
            await loadResultsPage();
        } catch(e) { errEl.textContent = e.message; }
    }
}

async function deleteResult(id) {
    if (!getAuthToken()) { showToast('Please login first!'); openAuthModal(); return; }
    if (!confirm('Delete this result entry?')) return;
    try {
        await fetch(`${API}/results/${id}`, { method: 'DELETE', headers: authHeaders() });
        showToast('Deleted!');
        await loadResultsPage();
    } catch(e) { showToast('Error: ' + e.message); }
}

// Init auth on page load
document.addEventListener('DOMContentLoaded', () => { updateAuthUI(); });
