const fs = require('fs');
const path = require('path');

const filesToPatch = [
  'src/hooks/useCannedResponses.js',
  'src/hooks/useFAQ.js',
  'src/hooks/useKnowledgeBase.js',
  'src/hooks/useTerms.js',
  'src/hooks/useUpdates.js',
  'src/hooks/useVideoTutorials.js',
];

filesToPatch.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${file}`);
    return;
  }
  let content = fs.readFileSync(fullPath, 'utf8');
  
  let newContent = content.replace(/(staleTime:\s*)(\d+\s*(?:\*\s*\d+\s*)*)(.*?)(?=\n|\r)/g, 'staleTime: 0$3');
  newContent = newContent.replace(/(gcTime:\s*)(\d+\s*(?:\*\s*\d+\s*)*)(.*?)(?=\n|\r)/g, 'gcTime: 0$3');
  
  if (content !== newContent) {
    fs.writeFileSync(fullPath, newContent, 'utf8');
    console.log(`Patched ${file}`);
  } else {
    console.log(`No changes needed for ${file}`);
  }
});
