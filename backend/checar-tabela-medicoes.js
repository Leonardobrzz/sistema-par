// node backend/checar-tabela-medicoes.js
//
// Só lê o banco. Não altera nada.
//
// Confere se a tabela "Medicoes" (que alimenta o quadro "Real (Executado)" e
// o cronograma linha-por-linha na tela Baseline x Real) tem registros pra
// cada projeto, ou se está vazia/quase vazia — pra confirmar por que aparece
// "sem registro" mesmo em projetos que já receberam dinheiro de verdade.

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const { rows: total } = await pool.query(`SELECT COUNT(*) FROM "Medicoes"`)
  console.log(`Total de registros na tabela "Medicoes": ${total[0].count}\n`)

  const { rows: porProjeto } = await pool.query(`
    SELECT p."Nome_Projeto", COUNT(m."ID_Medicao") AS qtd_medicoes
    FROM "Planejamentos" p
    LEFT JOIN "Medicoes" m ON m."ID_Projeto" = p."ID_Projeto"
    WHERE p."Status" = 'Aprovado'
    GROUP BY p."Nome_Projeto"
    ORDER BY qtd_medicoes DESC, p."Nome_Projeto"
  `)

  const comMedicoes = porProjeto.filter(p => Number(p.qtd_medicoes) > 0)
  const semMedicoes = porProjeto.filter(p => Number(p.qtd_medicoes) === 0)

  console.log(`${comMedicoes.length} de ${porProjeto.length} projetos aprovados têm alguma medição cadastrada na tabela "Medicoes".`)
  if (comMedicoes.length > 0) {
    console.log('\nProjetos COM medições cadastradas:')
    for (const p of comMedicoes) console.log(`  "${p.Nome_Projeto}": ${p.qtd_medicoes}`)
  }
  console.log(`\n${semMedicoes.length} projetos SEM nenhuma medição cadastrada (exemplos):`)
  for (const p of semMedicoes.slice(0, 10)) console.log(`  "${p.Nome_Projeto}"`)

  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
