const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

async function clearProducts() {
  if (!fs.existsSync(DB_PATH)) {
    console.error("❌ Database file not found at " + DB_PATH);
    return;
  }

  try {
    const dbContent = fs.readFileSync(DB_PATH, 'utf8');
    const db = JSON.parse(dbContent);

    const oldProductCount = db.products ? db.products.length : 0;
    db.products = [];

    // Save locally
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    console.log(`✅ Cleared all ${oldProductCount} products from local db.json!`);

    // Save to Firebase
    // Load .env variables if present or read from settings/process env
    try {
      require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    } catch (e) {}
    
    // We can also extract FIREBASE_DB_URL from the env directly.
    const firebasePrefix = process.env.FIREBASE_DB_URL;
    if (firebasePrefix) {
      const url = firebasePrefix.endsWith('/') ? `${firebasePrefix}.json` : `${firebasePrefix}/.json`;
      console.log(`🔄 Syncing cleared database to Firebase: ${url}...`);

      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(db)
      });

      if (res.ok) {
        console.log("☁️ Successfully cleared all products from Firebase cloud database!");
      } else {
        console.error(`❌ Firebase sync failed with status ${res.status}: ${res.statusText}`);
      }
    } else {
      console.log("⚠️ FIREBASE_DB_URL env variable not found, skipped cloud sync.");
    }
  } catch (e) {
    console.error("❌ Error clearing products:", e.message);
  }
}

clearProducts();
