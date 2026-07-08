const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach Route Routers
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/import',       require('./routes/import'));
app.use('/api/stocks',       require('./routes/stocks'));
app.use('/api/analysis',     require('./routes/analysis'));
app.use('/api/scanner',      require('./routes/scanner'));
app.use('/api/portfolio',    require('./routes/portfolio'));
app.use('/api/fundamentals', require('./routes/fundamentals'));
app.use('/api/results',      require('./routes/results'));

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', environment: process.env.FIREBASE_CONFIG ? 'firebase-serverless' : 'standalone-render' });
});

// Standalone Server Support (For Render/Local Node deployment)
const path = require('path');
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start listening if not running in Firebase environment
if (!process.env.FIREBASE_CONFIG) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Standalone server running on port ${PORT}`);
    });
}

// Export Cloud Function for Firebase
exports.api = functions.https.onRequest(app);
