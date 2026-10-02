// node backend/criar-coluna-id-opp-cliente.js
//
// A coluna "ID_OPP_Cliente" nunca existiu de verdade na tabela
// Projetos_Contratos do Postgres — só era lida no código (oppService.js,
// criarOSDoPlano), por isso sempre voltava vazia/undefined e nunca dava erro
// de leitura. Na hora de GRAVAR (vincular-id-opp-cliente.js), o Postgres
// acusou que a coluna não existe. Este script só adiciona a coluna (texto,
// igual às outras colunas de ID vindas do OPP) — não mexe em nenhum dado.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await pool.query('ALTER TABLE "Projetos_Contratos" ADD COLUMN IF NOT EXISTS "ID_OPP_Cliente" TEXT');
  console.log('✅ Coluna "ID_OPP_Cliente" garantida em Projetos_Contratos.');
  await pool.end();
}

main().catch((e) => { console.error('Erro:', e.message); pool.end(); });
