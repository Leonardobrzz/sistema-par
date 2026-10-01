// node backend/checar-projetos-orfaos.js
//
// Só lê o banco. Não altera nada.
//
// Confere se já existe, cadastrado no Par, um projeto pra:
//  - "Centro Especializado de Reabilitação (CER)" em Nova Mamoré (dono real da OS 98)
//  - "Levantamento de Prédios Públicos" em Mulungu (dono real da OS 153)
//  - "Terminal Rodoviário" em Croatá (dono real da OS 105)
//
// Se existir, dá pra mover a OS pro lugar certo. Se não existir, só dá pra
// remover a OS do lugar errado (o projeto dono ainda não está no Par).

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function buscar(label, termos) {
  console.log(`\n${label}:`)
  const { rows } = await pool.query(
    `SELECT "ID", "Nome_Projeto", "Nr_OS_OPP" FROM "Planejamentos" WHERE ${termos.map((_, i) => `"Nome_Projeto" ILIKE $${i + 1}`).join(' OR ')}`,
    termos
  )
  if (rows.length === 0) console.log('  (nenhum projeto encontrado com esses termos)')
  for (const r of rows) console.log(`  "${r.Nome_Projeto}" -> Nr_OS_OPP: "${r.Nr_OS_OPP}"`)
}

async function main() {
  await buscar('Reabilitação / CER (Nova Mamoré)', ['%REABILITA%', '%CER%NOVA MAMOR%'])
  await buscar('Levantamento de Prédios Públicos (Mulungu)', ['%LEVANTAMENTO%PR%DIO%', '%PREDIOS PUBLICOS%'])
  await buscar('Terminal Rodoviário (Croatá)', ['%TERMINAL%RODOVI%'])
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
