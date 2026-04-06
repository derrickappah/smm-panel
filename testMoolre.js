const fs = require('fs');
const https = require('https');

// Load environment variables without external dependencies if possible, or using dotenv if installed
const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
});

const MOOLRE_API_USER = env.MOOLRE_API_USER;
const MOOLRE_API_PUBKEY = env.MOOLRE_API_PUBKEY;
const MOOLRE_ACCOUNT_NUMBER = env.MOOLRE_ACCOUNT_NUMBER;

if (!MOOLRE_API_USER) {
  console.error("No MOOLRE configuration found in .env");
  process.exit(1);
}

const transactionRef = 'moolre_web_64e4644b-e00b-4690-b45c-52df11054021_1775474584868_ddyyegh9e';

async function checkStatus(idtype) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      type: 1,
      idtype: idtype,
      id: transactionRef,
      accountnumber: MOOLRE_ACCOUNT_NUMBER
    });

    const options = {
      hostname: 'api.moolre.com',
      port: 443,
      path: '/open/transact/status',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-USER': MOOLRE_API_USER,
        'X-API-PUBKEY': MOOLRE_API_PUBKEY,
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        console.log(`\n\n--- Moolre Response for idtype: ${idtype} ---`);
        try {
            console.log(JSON.parse(body));
        } catch {
            console.log(body);
        }
        resolve();
      });
    });

    req.on('error', e => reject(e));
    req.write(data);
    req.end();
  });
}

async function main() {
  await checkStatus(1);
  await checkStatus(2);
}

main().catch(console.error);
