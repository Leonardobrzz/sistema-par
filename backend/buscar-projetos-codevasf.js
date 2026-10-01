// node backend/buscar-projetos-codevasf.js
//
// Só lê o banco. Não altera nada.
//
// A busca por "CODEVASF" não achou nada — os projetos no Par devem estar
// cadastrados sem essa palavra no nome. Busca por palavras-chave das 3
// unidades (Pescados, Leite, Abelhas) pra achar o nome exato deles.

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const { rows } = await pool.query(
    `SELECT "ID", "Nome_Projeto", "Nr_OS_OPP" FROM "Planejamentos" WHERE "Nome_Projeto" ILIKE '%PESCADO%' OR "Nome_Projeto" ILIKE '%LEITE%' OR "Nome_Projeto" ILIKE '%ABELHA%'`
  )
  console.log('Projetos encontrados:')
  if (rows.length === 0) console.log('  (nenhum — talvez esses 3 projetos nem estejam cadastrados no Par ainda)')
  for (const r of rows) console.log(`  "${r.Nome_Projeto}" -> Nr_OS_OPP: "${r.Nr_OS_OPP}"`)
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
