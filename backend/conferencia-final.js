// node backend/conferencia-final.js
//
// Só lê o banco. Não altera nada.
//
// Depois de todas as correções desta rodada, confere se ainda sobrou alguma
// OS cadastrada em mais de um projeto ao mesmo tempo no Par (o que causaria
// duplicação de receita de novo).

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const { rows: planejamentos } = await pool.query('SELECT "ID_Projeto", "Nome_Projeto", "Nr_OS_OPP" FROM "Planejamentos"')
  const porOS = {}
  for (const plan of planejamentos) {
    const osNums = String(plan.Nr_OS_OPP || '').split(',').map(s => s.trim()).filter(Boolean)
    for (const os of osNums) {
      if (!porOS[os]) porOS[os] = []
      porOS[os].push(plan.Nome_Projeto)
    }
  }
  const duplicadas = Object.entries(porOS).filter(([, lista]) => lista.length > 1)

  if (duplicadas.length === 0) {
    console.log('Nenhuma OS duplicada entre projetos. Tudo limpo!')
  } else {
    console.log(`Ainda tem ${duplicadas.length} OS cadastrada(s) em mais de um projeto:`)
    for (const [os, projetos] of duplicadas) {
      console.log(`\nOS ${os}:`)
      for (const p of projetos) console.log(`  - ${p}`)
    }
  }
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
