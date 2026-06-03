const https = require('https');

const data = JSON.stringify({ password: 'rk2024' });

function triggerReset(hostname) {
  return new Promise((resolve) => {
    console.log(`🚀 Sending database reset request to https://${hostname}/api/admin/dangerously-reset-db ...`);
    
    const options = {
      hostname: hostname,
      port: 443,
      path: '/api/admin/dangerously-reset-db',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          hostname,
          status: res.statusCode,
          body: body
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        hostname,
        error: err.message
      });
    });

    req.write(data);
    req.end();
  });
}

async function run() {
  const hosts = [
    'rkresinart.com',
    'www.rkresinart.com',
    'rk-resin-art.onrender.com',
    'rk-resin-art-live.onrender.com'
  ];
  
  for (const host of hosts) {
    const result = await triggerReset(host);
    if (result.error) {
      console.error(`❌ Network error for ${result.hostname}: ${result.error}`);
    } else {
      console.log(`Status for ${result.hostname}: ${result.status}`);
      console.log(`Response: ${result.body.substring(0, 200)}`);
      if (result.status === 200) {
        console.log(`🎉 SUCCESS! Verified database reset on ${result.hostname}!`);
      }
    }
    console.log("-----------------------------------------");
  }
}

run();
