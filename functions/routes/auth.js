const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'stockscanner_secret_2026_ashish';

// ── Middleware: verify JWT ──────────────────────────────────
function authMiddleware(req, res, next) {
    const header = req.headers['authorization'];
    if (!header) return res.status(401).json({ error: 'No token provided' });
    const token = header.split(' ')[1];
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password)
            return res.status(400).json({ error: 'All fields required' });

        const cleanUsername = username.trim();
        const cleanEmail = email.trim();
        const lowerUsername = cleanUsername.toLowerCase();
        const lowerEmail = cleanEmail.toLowerCase();

        // Check if user already exists (by case-insensitive email or username)
        const usernameSnap = await db.collection('users').where('UsernameLower', '==', lowerUsername).limit(1).get();
        const emailSnap = await db.collection('users').where('EmailLower', '==', lowerEmail).limit(1).get();

        // Fallback check on original fields if UsernameLower/EmailLower is not set on older docs
        const legacyUserSnap = await db.collection('users').where('Username', '==', cleanUsername).limit(1).get();
        const legacyEmailSnap = await db.collection('users').where('Email', '==', cleanEmail).limit(1).get();

        if (!usernameSnap.empty || !emailSnap.empty || !legacyUserSnap.empty || !legacyEmailSnap.empty) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        // Use transaction to prevent race conditions on simultaneous registrations
        const docId = lowerUsername;
        const userDocRef = db.collection('users').doc(docId);

        const usersSnap = await db.collection('users').limit(1).get();
        const role = usersSnap.empty ? 'Admin' : 'Client';
        const hash = await bcrypt.hash(password, 12);

        const DEFAULT_PERMISSIONS = {
            dashboard: true,
            scanner: true,
            fundamentals: true,
            results: true,
            portfolio: true,
            import: role.toLowerCase() === 'admin'
        };

        await db.runTransaction(async (transaction) => {
            const existingDoc = await transaction.get(userDocRef);
            if (existingDoc.exists) {
                throw new Error('Username or email already exists');
            }
            transaction.set(userDocRef, {
                Id: docId,
                Username: cleanUsername,
                UsernameLower: lowerUsername,
                Email: cleanEmail,
                EmailLower: lowerEmail,
                PasswordHash: hash,
                Role: role,
                Permissions: DEFAULT_PERMISSIONS,
                CreatedAt: new Date().toISOString()
            });
        });

        res.json({ success: true, message: 'Account created! Please login.' });
    } catch (e) {
        if (e.message.includes('already exists')) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        res.status(500).json({ error: e.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ error: 'Username and password required' });

        const cleanUsername = username.trim();
        const lowerUsername = cleanUsername.toLowerCase();

        let userSnap = await db.collection('users').where('UsernameLower', '==', lowerUsername).limit(1).get();
        if (userSnap.empty) {
            userSnap = await db.collection('users').where('Username', '==', cleanUsername).limit(1).get();
        }

        if (userSnap.empty)
            return res.status(401).json({ error: 'Invalid username or password' });

        const userDoc = userSnap.docs[0];
        const user = userDoc.data();
        
        const match = await bcrypt.compare(password, user.PasswordHash);
        if (!match)
            return res.status(401).json({ error: 'Invalid username or password' });

        // Record Login Audit Log
        const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1').split(',')[0].trim();
        const userAgent = req.headers['user-agent'] || 'Unknown Device';
        const nowIso = new Date().toISOString();

        try {
            await db.collection('login_logs').add({
                UserId: userDoc.id,
                Username: user.Username,
                Email: user.Email || '',
                Role: user.Role || 'Client',
                IpAddress: ip,
                UserAgent: userAgent,
                LoginTime: nowIso
            });
            await userDoc.ref.update({
                LastLoginAt: nowIso,
                LastLoginIp: ip
            });
        } catch (logErr) {
            console.warn('Warning: Could not save login log:', logErr.message);
        }

        const permissions = (user.Role && user.Role.toLowerCase() === 'admin')
            ? { dashboard: true, scanner: true, fundamentals: true, results: true, portfolio: true, import: true }
            : (user.Permissions || { dashboard: true, scanner: true, fundamentals: true, results: true, portfolio: true, import: false });

        const token = jwt.sign(
            { id: user.Id || userDoc.id, username: user.Username, role: user.Role, permissions },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({ success: true, token, username: user.Username, role: user.Role, permissions });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const userDoc = await db.collection('users').doc(req.user.id).get();
        const user = userDoc.exists ? userDoc.data() : {};
        const permissions = (req.user.role && req.user.role.toLowerCase() === 'admin')
            ? { dashboard: true, scanner: true, fundamentals: true, results: true, portfolio: true, import: true }
            : (user.Permissions || req.user.permissions || { dashboard: true, scanner: true, fundamentals: true, results: true, portfolio: true, import: false });

        res.json({ username: req.user.username, role: req.user.role, permissions });
    } catch (e) {
        res.json({ username: req.user.username, role: req.user.role, permissions: req.user.permissions });
    }
});

// GET /api/auth/has-users (check if any user exists)
router.get('/has-users', async (req, res) => {
    try {
        const r = await db.collection('users').limit(1).get();
        res.json({ hasUsers: !r.empty });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/auth/users (Admin-only list of all users)
router.get('/users', authMiddleware, async (req, res) => {
    try {
        if (!req.user.role || req.user.role.toLowerCase() !== 'admin') {
            return res.status(403).json({ error: 'Access denied: Admin only' });
        }
        const snap = await db.collection('users').get();
        const users = snap.docs.map(doc => {
            const u = doc.data();
            const isAdmin = u.Role && u.Role.toLowerCase() === 'admin';
            const defaultPerms = isAdmin
                ? { dashboard: true, scanner: true, fundamentals: true, results: true, portfolio: true, import: true }
                : { dashboard: true, scanner: true, fundamentals: true, results: true, portfolio: true, import: false };

            return {
                Id: doc.id,
                Username: u.Username,
                Email: u.Email,
                Role: u.Role ? u.Role.toLowerCase() : 'client',
                CreatedAt: u.CreatedAt,
                LastLoginAt: u.LastLoginAt || null,
                LastLoginIp: u.LastLoginIp || null,
                Permissions: u.Permissions || defaultPerms
            };
        });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/auth/login-logs (Admin-only view of login history logs)
router.get('/login-logs', authMiddleware, async (req, res) => {
    try {
        if (!req.user.role || req.user.role.toLowerCase() !== 'admin') {
            return res.status(403).json({ error: 'Access denied: Admin only' });
        }
        const snap = await db.collection('login_logs').orderBy('LoginTime', 'desc').limit(100).get();
        const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(logs);
    } catch (e) {
        // Fallback without orderBy index if index isn't built yet
        try {
            const snap = await db.collection('login_logs').limit(100).get();
            const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            logs.sort((a, b) => new Date(b.LoginTime || 0) - new Date(a.LoginTime || 0));
            res.json(logs);
        } catch (err2) {
            res.status(500).json({ error: err2.message });
        }
    }
});

// POST /api/auth/users/update-role (Admin-only update user role)
router.post('/users/update-role', authMiddleware, async (req, res) => {
    try {
        if (!req.user.role || req.user.role.toLowerCase() !== 'admin') {
            return res.status(403).json({ error: 'Access denied: Admin only' });
        }
        const { userId, role } = req.body;
        if (!userId || !role) {
            return res.status(400).json({ error: 'userId and role required' });
        }
        
        let targetRole = 'Client';
        if (role.toLowerCase() === 'admin') {
            targetRole = 'Admin';
        }
        
        // Prevent admin from demoting self
        if (userId === req.user.id) {
            return res.status(400).json({ error: 'You cannot change your own role' });
        }

        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        await userRef.update({ Role: targetRole });
        res.json({ success: true, message: 'User role updated successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/auth/users/update-permissions (Admin-only update user section permissions)
router.post('/users/update-permissions', authMiddleware, async (req, res) => {
    try {
        if (!req.user.role || req.user.role.toLowerCase() !== 'admin') {
            return res.status(403).json({ error: 'Access denied: Admin only' });
        }
        const { userId, permissions } = req.body;
        if (!userId || !permissions) {
            return res.status(400).json({ error: 'userId and permissions required' });
        }

        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        await userRef.update({ Permissions: permissions });
        res.json({ success: true, message: 'Permissions updated successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
