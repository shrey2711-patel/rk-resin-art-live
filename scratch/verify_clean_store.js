const https = require('https');

function fetchJson(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'rk-resin-art-live.onrender.com',
      port: 443,
      path: path,
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(body)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            raw: body
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        error: err.message
      });
    });

    req.end();
  });
}

async function verify() {
  console.log("🔍 Fetching live data from https://rk-resin-art-live.onrender.com to verify empty state...");

  const bannersRes = await fetchJson('/api/banners');
  if (bannersRes.error) {
    console.error("❌ Network error fetching banners: " + bannersRes.error);
  } else {
    console.log(`Banners status: ${bannersRes.status}`);
    console.log("Banners data:", bannersRes.data);
  }

  const productsRes = await fetchJson('/api/products');
  if (productsRes.error) {
    console.error("❌ Network error fetching products: " + productsRes.error);
  } else {
    console.log(`Products status: ${productsRes.status}`);
    if (productsRes.data && productsRes.data.products) {
      console.log(`Products count: ${productsRes.data.products.length}`);
    } else {
      console.log("Products raw:", productsRes.raw);
    }
  }
}

verify();
