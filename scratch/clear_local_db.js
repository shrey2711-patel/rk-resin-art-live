const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

try {
  if (fs.existsSync(DB_PATH)) {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    
    db.products = [];
    db.orders = [];
    db.users = [];
    db.cart = [];
    db.reviews = [];
    db.wishlistSubscriptions = [];
    db.coupons = [];
    
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    console.log("✅ Local data/db.json file successfully cleared (products, orders, users, reviews, coupons, cart, wishlistSubscriptions)!");
  } else {
    console.error("❌ db.json file not found at " + DB_PATH);
  }
} catch (err) {
  console.error("❌ Error cleaning local database file:", err.message);
}
