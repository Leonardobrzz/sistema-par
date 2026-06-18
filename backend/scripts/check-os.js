require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  // Mostra uma linha de amostra
  const sample = await pool.query(`SELECT * FROM "Financeiro_OPP" LIMIT 3`);
  console.log('Amostra Financeiro_OPP:');
  sample.rows.forEach(r => console.log(JSON.stringify(r, null, 2)));

  // Conta campos preenchidos
  const counts = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(NULLIF("Nr_OS_OPP",'')) as com_nr_os,
      COUNT(NULLIF("Profissional",'')) as com_profissional,
      COUNT(NULLIF("Descricao",'')) as com_descricao,
      COUNT(NULLIF("Nome_Cliente",'')) as com_cliente
    FROM "Financeiro_OPP"
  `);
  console.log('\nContagens:', counts.rows[0]);
  await pool.end();
}
check().catch(e => { console.error(e.message); pool.end(); });
