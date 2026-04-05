/**
 * Secret Auditing Script
 * 
 * Scans the project (especially build artifacts) for potential sensitive data leaks.
 * Looks for JWTs, API keys, and Service Role keys.
 */

const fs = require('fs');
const path = require('path');

const SCAN_DIRECTORIES = [
  path.join(__dirname, '../frontend/build'),
  path.join(__dirname, '../frontend/src'),
  path.join(__dirname, '../api')
];

// Patterns to look for
const PATTERNS = [
  { name: 'JWT/Token (eyJ...)', regex: /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g },
  { name: 'Supabase Service Role Key', regex: /service[_-]role[_-]key/gi },
  { name: 'Moolre API Key', regex: /moolre[_-]api[_-]key/gi },
  { name: 'Private Key/Secret', regex: /secret|privkey|private_key/gi }
];

// Files to ignore
const IGNORE_FILES = ['.DS_Store', 'package-lock.json', 'yarn.lock', 'audit-secrets.js'];

/**
 * Scan a directory recursively
 */
function scanDir(dir) {
  if (!fs.existsSync(dir)) {
    console.warn(`⚠️  Directory not found, skipping: ${dir}`);
    return;
  }

  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else if (!IGNORE_FILES.includes(file)) {
      scanFile(fullPath);
    }
  });
}

/**
 * Scan a single file for patterns
 */
function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    PATTERNS.forEach(pattern => {
      const matches = content.match(pattern.regex);
      if (matches) {
        // Filter out false positives (like variable names vs actual tokens)
        const realMatches = matches.filter(m => m.length > 20); // Most tokens are long
        
        if (realMatches.length > 0 || (pattern.name !== 'JWT/Token (eyJ...)' && matches.length > 0)) {
          console.error(`🔴  POTENTIAL LEAK FOUND in ${filePath}`);
          console.error(`    Type: ${pattern.name}`);
          console.error(`    Count: ${matches.length}`);
          console.error('-------------------------------------------');
        }
      }
    });
  } catch (err) {
    // Likely a binary file
  }
}

console.log('🚀 Starting Security Audit...');
SCAN_DIRECTORIES.forEach(dir => scanDir(dir));
console.log('🏁 Audit Complete.');
