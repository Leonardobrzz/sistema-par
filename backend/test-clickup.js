/**
 * Script de diagnóstico do ClickUp
 * Executa: node test-clickup.js
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'https://api.clickup.com/api/v2';
const TOKEN = process.env.CLICKUP_API_TOKEN;
const TEAM_ID = process.env.CLICKUP_TEAM_ID;
const SPACE_IDS = process.env.CLICKUP_SPACE_IDS;

const headers = { Authorization: TOKEN };

async function run() {
  console.log('=== Diagnóstico ClickUp ===\n');
  console.log(`Token: ${TOKEN ? TOKEN.substring(0, 15) + '...' : 'NÃO CONFIGURADO'}`);
  console.log(`Team ID: ${TEAM_ID || 'NÃO CONFIGURADO'}`);
  console.log(`Space IDs: ${SPACE_IDS || 'NÃO CONFIGURADO'}`);
  console.log('');

  // 1. Testar autenticação
  console.log('1. Testando autenticação...');
  try {
    const res = await axios.get(`${BASE_URL}/user`, { headers });
    console.log(`   ✅ Autenticado como: ${res.data.user?.username} (${res.data.user?.email})`);
  } catch (e) {
    console.log(`   ❌ Falha na autenticação: ${e.response?.status} - ${JSON.stringify(e.response?.data)}`);
    return;
  }

  // 2. Listar teams
  console.log('\n2. Listando teams...');
  try {
    const res = await axios.get(`${BASE_URL}/team`, { headers });
    const teams = res.data.teams || [];
    console.log(`   Encontrados ${teams.length} team(s):`);
    teams.forEach((t) => console.log(`   - ID: ${t.id}  Nome: ${t.name}`));
  } catch (e) {
    console.log(`   ❌ Erro: ${e.response?.status} - ${JSON.stringify(e.response?.data)}`);
  }

  // 3. Listar spaces do team
  if (TEAM_ID) {
    console.log(`\n3. Listando spaces do team ${TEAM_ID}...`);
    try {
      const res = await axios.get(`${BASE_URL}/team/${TEAM_ID}/space?archived=false`, { headers });
      const spaces = res.data.spaces || [];
      console.log(`   Encontrados ${spaces.length} space(s):`);
      spaces.forEach((s) => console.log(`   - ID: ${s.id}  Nome: ${s.name}`));
    } catch (e) {
      console.log(`   ❌ Erro: ${e.response?.status} - ${JSON.stringify(e.response?.data)}`);
    }
  }

  // 4. Testar space ID configurado
  if (SPACE_IDS) {
    const ids = SPACE_IDS.split(',').map((s) => s.trim());
    for (const spaceId of ids) {
      console.log(`\n4. Testando space ${spaceId}...`);
      try {
        const res = await axios.get(`${BASE_URL}/space/${spaceId}/folder?archived=false`, { headers });
        const folders = res.data.folders || [];
        console.log(`   ✅ Encontradas ${folders.length} pasta(s):`);
        folders.forEach((f) => console.log(`   - ID: ${f.id}  Nome: ${f.name}`));
      } catch (e) {
        console.log(`   ❌ Erro ao buscar pastas: ${e.response?.status} - ${JSON.stringify(e.response?.data)}`);
      }

      try {
        const res = await axios.get(`${BASE_URL}/space/${spaceId}/list?archived=false`, { headers });
        const lists = res.data.lists || [];
        console.log(`   ✅ Listas sem pasta: ${lists.length}`);
        lists.forEach((l) => console.log(`   - ID: ${l.id}  Nome: ${l.name}`));
      } catch (e) {
        console.log(`   ❌ Erro ao buscar listas: ${e.response?.status} - ${JSON.stringify(e.response?.data)}`);
      }
    }
  }

  console.log('\n=== Fim do diagnóstico ===');
}

run().catch(console.error);
