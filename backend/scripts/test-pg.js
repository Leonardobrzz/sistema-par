require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query('SELECT COUNT(*) as total FROM "Projetos_Contratos"')
  .then(r => {
    console.log('Conexão OK! Projetos_Contratos:', r.rows[0].total, 'linhas');
    pool.end();
  })
  .catch(e => {
    console.error('ERRO:', e.message);
    pool.end();
  });
