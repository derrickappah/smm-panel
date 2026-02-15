
const fs = require('fs');
const path = require('path');

function readEnv() {
    const rootEnvPath = path.join(process.cwd(), '.env');
    const frontendEnvPath = path.join(process.cwd(), 'frontend', '.env');
    let content = '';
    try {
        if (fs.existsSync(rootEnvPath)) content += fs.readFileSync(rootEnvPath, 'utf8') + '\n';
        if (fs.existsSync(frontendEnvPath)) content += fs.readFileSync(frontendEnvPath, 'utf8') + '\n';
    } catch (e) {
        console.error('Error reading .env files:', e);
    }
    const env = {};
    content.split(/\r?\n/).forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            let value = match[2] || '';
            if (value.startsWith('"') && value.endsWith('"')) value = value.substring(1, value.length - 1);
            else if (value.startsWith("'") && value.endsWith("'")) value = value.substring(1, value.length - 1);
            env[match[1]] = value;
        }
    });
    return env;
}

const env = readEnv();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.REACT_APP_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.REACT_APP_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableColumns() {
    const checkTable = async (tableName) => {
        console.log(`\n--- ${tableName} ---`);
        const { data, error } = await supabase.from(tableName).select('*').limit(1);
        if (error) {
            console.error(`Error selecting from ${tableName}:`, error.message);
            return;
        }
        if (data.length === 0) {
            console.log(`Table ${tableName} is empty, cannot inspect columns via select * fallback.`);
            return;
        }
        const columns = Object.keys(data[0]);
        console.log(`Number of columns: ${columns.length}`);
        columns.forEach(col => console.log(`- ${col}`));
    };

    await checkTable('promotion_packages');
    await checkTable('services');
}

checkTableColumns();
