/**
 * Script de migração — preserva a aba Usuarios existente renomeando-a
 * para Usuarios_Legado e cria a nova aba Usuarios com os cabeçalhos do PAR.
 *
 * Execute: node migrate-usuarios.js
 */

require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const KEY_FILE = path.resolve(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);

const USUARIOS_HEADERS = [
  'ID', 'Nome', 'Email', 'Senha_Hash', 'Perfil', 'Empresa', 'Ativo', 'Criado_Em', 'Ultimo_Login'
];

async function getAuth() {
  const credentials = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth.getClient();
}

async function main() {
  console.log('🔧 Iniciando migração da aba Usuarios...\n');

  const authClient = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  // Busca todas as abas
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const allSheets = spreadsheet.data.sheets;

  const usuariosSheet = allSheets.find(s => s.properties.title === 'Usuarios');
  const legadoSheet = allSheets.find(s => s.properties.title === 'Usuarios_Legado');

  const requests = [];

  // 1. Renomeia Usuarios → Usuarios_Legado (se ainda não foi renomeada)
  if (usuariosSheet && !legadoSheet) {
    console.log('📋 Renomeando aba "Usuarios" → "Usuarios_Legado"...');
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: usuariosSheet.properties.sheetId,
          title: 'Usuarios_Legado',
        },
        fields: 'title',
      },
    });
  }

  // 2. Cria nova aba Usuarios (se não existe já nova)
  const novaUsuariosExiste = allSheets.find(s => s.properties.title === 'Usuarios') && !usuariosSheet;
  if (!novaUsuariosExiste || (usuariosSheet && !legadoSheet)) {
    console.log('➕ Criando nova aba "Usuarios" com cabeçalhos do PAR...');
    requests.push({
      addSheet: {
        properties: { title: 'Usuarios' },
      },
    });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    });
    console.log('✅ Abas renomeadas/criadas.\n');
  }

  // 3. Adiciona cabeçalhos na nova aba Usuarios
  console.log('📝 Adicionando cabeçalhos na nova aba Usuarios...');
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Usuarios!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [USUARIOS_HEADERS] },
  });

  // 4. Cria o usuário admin
  console.log('👤 Criando usuário Admin...');
  const senhaHash = await bcrypt.hash('teste123', 12);
  const adminUser = [
    uuidv4(),
    'Jota Barros',
    'leonardobrzz45@gmail.com',
    senhaHash,
    'Admin',
    'Jota Barros Projetos',
    'true',
    new Date().toISOString(),
    '',
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Usuarios!A2',
    valueInputOption: 'RAW',
    requestBody: { values: [adminUser] },
  });

  console.log('\n✅ Migração concluída com sucesso!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 Email:  leonardobrzz45@gmail.com');
  console.log('🔑 Senha:  teste123');
  console.log('👤 Perfil: Admin');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nAgora acesse: http://localhost:5173');
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
