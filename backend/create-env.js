// Script to create .env file for backend
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('Backend .env Setup');
console.log('==================\n');

// Try to read from frontend .env if it exists
let smmgenApiKey = '';
const frontendEnvPath = path.join(__dirname, '..', 'frontend', '.env');

if (fs.existsSync(frontendEnvPath)) {
  try {
    const frontendEnv = fs.readFileSync(frontendEnvPath, 'utf8');
    const match = frontendEnv.match(/REACT_APP_SMMGEN_API_KEY=(.+)/);
    if (match) {
      smmgenApiKey = match[1].trim();
      console.log(`Found SMMGen API key in frontend/.env`);
    }
  } catch (error) {
    console.log('Could not read frontend/.env');
  }
}

if (!smmgenApiKey) {
  rl.question('Enter your SMMGen API key: ', (key) => {
    smmgenApiKey = key.trim();
    createEnvFile(smmgenApiKey);
    rl.close();
  });
} else {
  console.log(`Using API key: ${smmgenApiKey.substring(0, 15)}...`);
  createEnvFile(smmgenApiKey);
  rl.close();
}

function createEnvFile(apiKey) {
  const envContent = `SMMGEN_API_URL=https://smmgen.com/api/v2
SMMGEN_API_KEY=${apiKey}
PORT=5000
`;

  const envPath = path.join(__dirname, '.env');
  fs.writeFileSync(envPath, envContent);
  console.log('\n✅ Backend .env file created successfully!');
  console.log(`📁 Location: ${envPath}`);
  console.log('\nYou can now start the backend server with: npm start');
}

