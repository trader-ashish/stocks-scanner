const admin = require('firebase-admin');

if (admin.apps.length === 0) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("✅ Firebase Admin initialized using Environment Variable");
        } catch (e) {
            console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT env var:", e.message);
            admin.initializeApp();
        }
    } else {
        try {
            const serviceAccount = require('./serviceAccountKey.json');
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("✅ Firebase Admin initialized using Service Account Private Key JSON file");
        } catch (e) {
            admin.initializeApp();
            console.log("ℹ️ Firebase Admin initialized using Default Application Credentials");
        }
    }
}

const db = admin.firestore();

// In-memory cache to prevent excessive Firestore reads
const cache = {
    stocksByDate: {}, // dateString -> array of stocks
    datesList: null,
    cacheTime: {}    // dateString -> timestamp
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

/**
 * Retrieves the list of all stocks imported on a specific date.
 * Fetches from Firestore collection 'imports' document [dateString] and caches it.
 */
async function getStocksForDate(dateString) {
    const now = Date.now();
    
    // Check cache
    if (cache.stocksByDate[dateString] && (now - cache.cacheTime[dateString] < CACHE_TTL)) {
        return cache.stocksByDate[dateString];
    }
    
    try {
        const docRef = db.collection('imports').doc(dateString);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return [];
        }
        
        const data = doc.data();
        const stocks = data.stocks || [];
        
        // Cache it
        cache.stocksByDate[dateString] = stocks;
        cache.cacheTime[dateString] = now;
        
        return stocks;
    } catch (e) {
        console.error(`Error loading stocks for date ${dateString}:`, e);
        // Fallback to stale cache if available
        if (cache.stocksByDate[dateString]) {
            return cache.stocksByDate[dateString];
        }
        throw e;
    }
}

/**
 * Clear in-memory cache for a date (called after import)
 */
function clearCache(dateString) {
    if (dateString) {
        delete cache.stocksByDate[dateString];
        delete cache.cacheTime[dateString];
    } else {
        cache.stocksByDate = {};
        cache.cacheTime = {};
    }
    cache.datesList = null;
}

module.exports = {
    db,
    getStocksForDate,
    clearCache
};
