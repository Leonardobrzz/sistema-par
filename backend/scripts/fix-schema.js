require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fix() {
  await pool.query('ALTER TABLE "USER" ADD COLUMN IF NOT EXISTS "Senha" TEXT');
  console.log('Coluna Senha adicionada em USER.');

  await pool.query('ALTER TABLE "OrdensCompra_OPP" ALTER COLUMN "ID_OC" DROP NOT NULL');
  console.log('NOT NULL removido de OrdensCompra_OPP.ID_OC.');

  await pool.end();
}

fix().catch(e => { console.error('ERRO:', e.message); pool.end(); });
