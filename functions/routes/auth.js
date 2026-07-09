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

        // Check if user already exists (by email or username)
        const usernameSnap = await db.collection('users').where('Username', '==', username).limit(1).get();
        const emailSnap = await db.collection('users').where('Email', '==', email).limit(1).get();

        if (!usernameSnap.empty || !emailSnap.empty) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        // Determine if this is the first user (make Admin, otherwise Client)
        const usersSnap = await db.collection('users').limit(1).get();
        const role = usersSnap.empty ? 'Admin' : 'Client';

        const hash = await bcrypt.hash(password, 12);
        
        // Add to Firestore
        const newUserRef = db.collection('users').doc();
        await newUserRef.set({
            Id: newUserRef.id,
            Username: username,
            Email: email,
            PasswordHash: hash,
            Role: role,
            CreatedAt: new Date().toISOString()
        });

        res.json({ success: true, message: 'Account created! Please login.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ error: 'Username and password required' });

        const userSnap = await db.collection('users').where('Username', '==', username).limit(1).get();

        if (userSnap.empty)
            return res.status(401).json({ error: 'Invalid username or password' });

        const userDoc = userSnap.docs[0];
        const user = userDoc.data();
        
        const match = await bcrypt.compare(password, user.PasswordHash);
        if (!match)
            return res.status(401).json({ error: 'Invalid username or password' });

        const token = jwt.sign(
            { id: user.Id, username: user.Username, role: user.Role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({ success: true, token, username: user.Username, role: user.Role });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
    res.json({ username: req.user.username, role: req.user.role });
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
            return {
                Id: doc.id,
                Username: u.Username,
                Email: u.Email,
                Role: u.Role ? u.Role.toLowerCase() : 'client',
                CreatedAt: u.CreatedAt
            };
        });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: e.message });
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

module.exports = router;
module.exports.authMiddleware = authMiddleware;
