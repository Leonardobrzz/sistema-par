// node backend/checar-fornecedor-bruto.js
//
// Só lê (banco + ClickUp). Não grava nada.
//
// O chefe reportou que o campo Fornecedor às vezes aparece como um texto
// estranho tipo JSON (ex: {\"id\":\"86ajfm9pp\"...). Esse script: (1) conta
// quantos registros de Terceirizados têm isso salvo no banco, e (2) busca o
// campo "Fornecedor" cru de uma tarefa afetada direto no ClickUp, mostrando o
// tipo exato de cada camada, pra eu entender exatamente onde o parse falha.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
});

const BASE_URL = 'https://api.clickup.com/api/v2';
function getHeaders() { return { Authorization: process.env.CLICKUP_API_TOKEN }; }
async function getTaskDetail(taskId) {
  const res = await axios.get(`${BASE_URL}/task/${taskId}`, { headers: getHeaders(), params: { custom_fields: true } });
  return res.data;
}

async function main() {
  const { rows: terc } = await pool.query(`SELECT "ID", "Servico", "Fornecedor", "ID_Tarefa_ClickUp" FROM "Terceirizados" WHERE "Status" != 'Cancelado'`);

  const suspeitos = terc.filter(t => t.Fornecedor && /^[\[{]/.test(t.Fornecedor.trim()));
  console.log(`Total ativos: ${terc.length}`);
  console.log(`Com Fornecedor parecendo JSON cru (começa com [ ou {): ${suspeitos.length}\n`);

  for (const s of suspeitos.slice(0, 5)) {
    console.log(`  Servico="${s.Servico}"`);
    console.log(`  Fornecedor cru (primeiros 200 caracteres): ${s.Fornecedor.slice(0, 200)}`);
    console.log('');
  }

  if (suspeitos.length === 0) { pool.end(); return; }

  const taskId = suspeitos[0].ID_Tarefa_ClickUp;
  console.log(`\n=== Buscando a tarefa ${taskId} direto no ClickUp, campo por campo ===\n`);
  const task = await getTaskDetail(taskId);
  const fornecedorField = (task.custom_fields || []).find(f => f.name?.toLowerCase() === 'fornecedor');
  if (!fornecedorField) {
    console.log('Campo "Fornecedor" não encontrado nessa tarefa (pode ter sido removido/renomeado).');
  } else {
    console.log(`Tipo do campo (field.type): ${fornecedorField.type}`);
    console.log(`Tipo do JS de field.value: ${typeof fornecedorField.value} | é array? ${Array.isArray(fornecedorField.value)}`);
    console.log(`\nfield.value (JSON.stringify completo):`);
    console.log(JSON.stringify(fornecedorField.value, null, 2));
    if (Array.isArray(fornecedorField.value) && fornecedorField.value.length > 0) {
      const primeiro = fornecedorField.value[0];
      console.log(`\nTipo do primeiro item do array: ${typeof primeiro}`);
      if (typeof primeiro === 'object') {
        console.log(`Campo "name" desse item: ${JSON.stringify(primeiro.name)}`);
      }
    }
  }

  pool.end();
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); pool.end(); });
