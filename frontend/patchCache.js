const fs = require('fs');
const path = require('path');

const filesToPatch = [
  'src/pages/AdminDashboard.jsx',
  'src/pages/admin/AdminDeposits.jsx',
  'src/pages/admin/AdminMoolre.jsx',
  'src/hooks/useAdminActivityLogs.js',
  'src/hooks/useAdminDeposits.js',
  'src/hooks/useAdminOrders.js',
  'src/hooks/useAdminPromotionPackages.js',
  'src/hooks/useAdminReferrals.js',
  'src/hooks/useAdminRewards.js',
  'src/hooks/useAdminServices.js',
  'src/hooks/useAdminStats.js',
  'src/hooks/useAdminTransactions.js',
  'src/hooks/useAdminUsers.js',
];

filesToPatch.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${file}`);
    return;
  }
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Replace staleTime: X * Y * Z, // comment -> staleTime: 0, // comment
  let newContent = content.replace(/(staleTime:\s*)(\d+\s*(?:\*\s*\d+\s*)*)(.*?)(?=\n|\r)/g, 'staleTime: 0$3');
  // Replace gcTime: X * Y * Z, // comment -> gcTime: 0, // comment
  newContent = newContent.replace(/(gcTime:\s*)(\d+\s*(?:\*\s*\d+\s*)*)(.*?)(?=\n|\r)/g, 'gcTime: 0$3');
  
  if (content !== newContent) {
    fs.writeFileSync(fullPath, newContent, 'utf8');
    console.log(`Patched ${file}`);
  } else {
    console.log(`No changes needed for ${file}`);
  }
});
