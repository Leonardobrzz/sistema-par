/**
 * Script único para importar todas as pastas do ClickUp como projetos.
 * Execute via: node scripts/importFolders.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('../src/services/googleSheetsService');

const BASE_URL = 'https://api.clickup.com/api/v2';
const headers = { Authorization: process.env.CLICKUP_API_TOKEN };

async function getFolders(spaceId) {
  const res = await axios.get(`${BASE_URL}/space/${spaceId}/folder?archived=false`, { headers });
  return res.data.folders || [];
}

async function run() {
  const spaceIdsEnv = (process.env.CLICKUP_SPACE_IDS || '').trim();
  const spaceIds = spaceIdsEnv.split(',').map(s => s.trim()).filter(Boolean);
  console.log(`Importando pastas dos spaces: ${spaceIds.join(', ')}`);

  const existing = await db.readSheet('Projetos_Contratos');
  const existingIds = new Set(existing.map(p => p.ID_ClickUp).filter(Boolean));
  console.log(`Projetos já existentes: ${existingIds.size}`);

  let importados = 0;

  for (const spaceId of spaceIds) {
    console.log(`\nProcessando space ${spaceId}...`);
    const folders = await getFolders(spaceId);
    console.log(`  → ${folders.length} pastas encontradas`);

    for (const folder of folders) {
      if (existingIds.has(folder.id)) {
        console.log(`  [SKIP] ${folder.name} (já existe)`);
        continue;
      }

      const projeto = {
        ID_Projeto: uuidv4(),
        Nome: folder.name,
        Cliente: folder.name,
        Valor_Global: '0',
        Teto_Terc_Perc: '30',
        Teto_Terc_Valor: '0',
        ID_ClickUp: folder.id,
        Centro_Custo_OPP: '',
        Status: 'Em Andamento',
        Progresso_Perc: '0',
        Data_Inicio: '',
        Data_Entrega_Contrato: folder.due_date ? new Date(parseInt(folder.due_date)).toISOString().split('T')[0] : '',
        Data_Entrega_Planejada: folder.due_date ? new Date(parseInt(folder.due_date)).toISOString().split('T')[0] : '',
        Empresa: 'Jota Barros Projetos',
        Setor: folder.name,
        Tipologia: '',
        Link_ClickUp: `https://app.clickup.com/${process.env.CLICKUP_TEAM_ID}/li/${folder.id}`,
        Criado_Em: new Date().toISOString(),
        Atualizado_Em: new Date().toISOString(),
      };

      await db.insertRow('Projetos_Contratos', projeto);
      existingIds.add(folder.id);
      importados++;
      console.log(`  [OK] ${folder.name}`);

      // Pequeno delay para não sobrecarregar Sheets API
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\n✅ Importação concluída: ${importados} novos projetos adicionados.`);
  process.exit(0);
}

run().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
