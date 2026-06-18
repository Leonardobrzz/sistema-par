/**
 * Migração única: Google Sheets → PostgreSQL
 * Executa: node backend/scripts/migrate-sheets-to-pg.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Pool } = require('pg');
const db = require('../src/services/googleSheetsService');

const TABLES = [
  'USER',
  'Projetos_Contratos',
  'Planejamentos',
  'Medicoes',
  'Terceirizados',
  'Equipe_Planejamento',
  'Despesas_Planejamento',
  'Log_Horas',
  'Custos_OPP',
  'Alertas',
  'Log_Importacoes',
  'Configuracoes',
  'Financeiro_OPP',
  'OrdensCompra_OPP',
];

// Converte string vazia para null ao inserir no PG
function toDb(val) {
  if (val === '' || val === undefined) return null;
  return val;
}

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL não configurada no .env');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false,
  });

  console.log('Conectando ao PostgreSQL...');
  await pool.query('SELECT 1');
  console.log('Conectado.\n');

  await db.initialize();

  let totalMigrado = 0;

  for (const tableName of TABLES) {
    try {
      const rows = await db.readSheet(tableName);
      if (rows.length === 0) {
        console.log(`  ${tableName}: vazia, pulando.`);
        continue;
      }

      const keys = Object.keys(rows[0]);
      const cols = keys.map(k => `"${k}"`).join(', ');

      const BATCH = 100;
      let inseridos = 0;

      for (let start = 0; start < rows.length; start += BATCH) {
        const batch = rows.slice(start, start + BATCH);
        const valueSets = [];
        const allValues = [];
        let idx = 1;

        for (const row of batch) {
          const placeholders = keys.map(() => `$${idx++}`).join(', ');
          valueSets.push(`(${placeholders})`);
          keys.forEach(k => allValues.push(toDb(row[k])));
        }

        await pool.query(
          `INSERT INTO "${tableName}" (${cols}) VALUES ${valueSets.join(', ')} ON CONFLICT DO NOTHING`,
          allValues
        );
        inseridos += batch.length;
      }

      console.log(`  ${tableName}: ${inseridos} registros migrados`);
      totalMigrado += inseridos;
    } catch (err) {
      console.error(`  ERRO em ${tableName}: ${err.message}`);
    }
  }

  console.log(`\nMigração concluída. Total: ${totalMigrado} registros.`);
  await pool.end();
}

migrate().catch(err => {
  console.error('Falha na migração:', err.message);
  process.exit(1);
});
