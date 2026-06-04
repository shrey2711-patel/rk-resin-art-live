const fs = require('fs');
const path = require('path');

async function main() {
  const rootDir = path.join(__dirname, '..');
  const photosDir = path.join(rootDir, 'mica colors photos');
  const dbDir = path.join(rootDir, 'data');
  const uploadsDir = path.join(dbDir, 'uploads');
  const dbPath = path.join(dbDir, 'db.json');

  console.log('🚀 Starting Mica Colors database seeding...');
  
  if (!fs.existsSync(photosDir)) {
    console.error(`❌ Folder "mica colors photos" not found at ${photosDir}`);
    process.exit(1);
  }

  // Ensure uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Created uploads folder:', uploadsDir);
  }

  // Load database
  let db = { products: [] };
  if (fs.existsSync(dbPath)) {
    try {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      console.log('✅ Loaded existing database. Current products:', db.products ? db.products.length : 0);
    } catch (e) {
      console.error('⚠️ Could not parse existing db.json, starting with fresh template:', e.message);
    }
  }

  if (!db.products) db.products = [];

  // Determine starting product ID
  let nextId = 1;
  if (db.products.length > 0) {
    nextId = Math.max(...db.products.map(p => p.id || 0)) + 1;
  }

  const files = fs.readdirSync(photosDir).filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg'));
  console.log(`📁 Found ${files.length} JPG files in the source folder.`);

  let count = 0;
  for (const file of files) {
    const ext = path.extname(file);
    const baseName = path.basename(file, ext);
    
    // Capitalize name (e.g. "apple green" -> "Apple Green")
    const colorName = baseName
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const destFile = `mica-color-${slug}${ext.toLowerCase()}`;
    const srcPath = path.join(photosDir, file);
    const destPath = path.join(uploadsDir, destFile);

    // Copy photo
    fs.copyFileSync(srcPath, destPath);

    // Create product details
    const product = {
      id: nextId++,
      name: `${colorName} Mica Color (20g)`,
      price: 50,
      originalPrice: 75,
      category: "Pigments",
      stock: 100,
      imageUrl: `/uploads/${destFile}`,
      description: `Premium cosmetic-grade ${colorName.toLowerCase()} mica color powder. Highly pigmented, non-toxic, and heat-resistant. Packaged in a convenient 20g container, perfect for resin art, candle making, soap crafting, and DIY projects.`,
      variantLabel: null,
      variants: null,
      badge: "New",
      createdAt: new Date().toISOString()
    };

    // Add to database
    db.products.push(product);
    count++;
  }

  // Write local database
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log(`✅ Saved ${count} new products locally in db.json. Total products: ${db.products.length}`);

  // Sync to Firebase if configured
  const firebaseURL = process.env.FIREBASE_DB_URL || (db.settings && db.settings.firebaseURL);
  if (firebaseURL) {
    try {
      const url = firebaseURL.endsWith('/') ? `${firebaseURL}.json` : `${firebaseURL}/.json`;
      console.log(`📡 Syncing database to Firebase at: ${url}...`);
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(db)
      });
      
      if (response.ok) {
        console.log("✅ Successfully synced database to Firebase!");
      } else {
        console.error("❌ Failed to sync to Firebase:", response.status, response.statusText);
      }
    } catch (e) {
      console.error("❌ Firebase sync request failed:", e.message);
    }
  } else {
    console.log("ℹ️ No FIREBASE_DB_URL environment variable detected. Running in local-only mode.");
  }
  
  console.log('🎉 Seeding completed successfully!');
}

main().catch(err => {
  console.error('❌ Script failed:', err);
});
