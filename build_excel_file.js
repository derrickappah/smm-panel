const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

async function main() {
  const inputFile = 'C:\\Users\\DELL\\.gemini\\antigravity\\brain\\29e3ec4c-c451-4f28-b6ce-1972f50de2a6\\.system_generated\\steps\\73\\output.txt';
  
  if (!fs.existsSync(inputFile)) {
    console.error('Input file not found:', inputFile);
    process.exit(1);
  }

  console.log('Reading database query results...');
  const rawData = fs.readFileSync(inputFile, 'utf8');
  const fileJson = JSON.parse(rawData);
  const resultText = fileJson.result;

  const startIdx = resultText.indexOf('[');
  const endIdx = resultText.lastIndexOf(']');

  if (startIdx === -1 || endIdx === -1) {
    console.error('Could not locate JSON array bounds in result.');
    process.exit(1);
  }

  const jsonText = resultText.substring(startIdx, endIdx + 1);
  console.log('Parsing user records JSON...');
  const rowsData = JSON.parse(jsonText);
  const usersList = rowsData[0]?.json_agg || [];

  console.log(`Successfully parsed ${usersList.length} total user records! Building Excel spreadsheet...`);

  // Create Excel workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BoostUp GH';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Users', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  // Define columns
  worksheet.columns = [
    { header: '#', key: 'index', width: 8, style: { alignment: { horizontal: 'center' } } },
    { header: 'Full Name', key: 'name', width: 32 },
    { header: 'Phone Number', key: 'phone_number', width: 22, style: { numFmt: '@' } },
    { header: 'Email Address', key: 'email', width: 35 },
    { header: 'Role', key: 'role', width: 14, style: { alignment: { horizontal: 'center' } } },
    { header: 'Registration Date', key: 'created_at', width: 25 },
    { header: 'User ID (UUID)', key: 'id', width: 38 }
  ];

  // Format Header Row
  const headerRow = worksheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '1F4E79' } // Professional Navy
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Batch insert rows for maximum speed
  console.log('Inserting rows into Excel worksheet...');
  
  const sanitizeCell = (val) => {
    const str = String(val ?? '');
    if (/^[=\+\-@\t\r]/.test(str)) {
      return `'${str}`;
    }
    return str;
  };

  for (let i = 0; i < usersList.length; i++) {
    const u = usersList[i];
    let formattedPhone = u.phone_number || 'N/A';
    if (formattedPhone !== 'N/A') {
      formattedPhone = String(formattedPhone).trim();
    }

    let formattedDate = '';
    if (u.created_at) {
      const d = new Date(u.created_at);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toISOString().replace('T', ' ').substring(0, 19);
      }
    }

    worksheet.addRow({
      index: i + 1,
      name: sanitizeCell(u.name || 'N/A'),
      phone_number: sanitizeCell(formattedPhone),
      email: sanitizeCell(u.email || 'N/A'),
      role: sanitizeCell(u.role || 'user'),
      created_at: formattedDate,
      id: u.id || ''
    });
  }

  console.log('Writing Excel file to disk...');
  const workspaceOutput = path.join(__dirname, 'users_list.xlsx');
  const desktopOutput = 'C:\\Users\\DELL\\Desktop\\users_list.xlsx';

  await workbook.xlsx.writeFile(workspaceOutput);
  console.log(`✅ Saved Excel file in project workspace: ${workspaceOutput}`);

  try {
    await workbook.xlsx.writeFile(desktopOutput);
    console.log(`✅ Saved copy directly to Desktop: ${desktopOutput}`);
  } catch (e) {
    console.log('Note: Saved in workspace.');
  }

  console.log(`ALL DONE! Exported ${usersList.length} users.`);
}

main().catch(err => {
  console.error('Error generating Excel file:', err);
  process.exit(1);
});
