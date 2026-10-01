// node backend/corrigir-os91-codevasf.js            → dry-run
// node backend/corrigir-os91-codevasf.js --apply     → aplica
//
// Confirmado pelo centro de custo real do OPP: a OS 91 (R$ 39.900) pertence
// 100% a "ARQ CODEVASF UNIDADE DE PESCADOS". Se ela também estiver cadastrada
// nos projetos de Leite ou Abelhas da CODEVASF, isso duplica a receita (soma
// o mesmo dinheiro 2x ou 3x). Este script remove a OS 91 de qualquer projeto
// CODEVASF que NÃO seja o de Pescados, e garante que o de Pescados tenha ela.

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const APPLY = process.argv.includes('--apply')

async function main() {
  const { rows } = await pool.query(`SELECT "ID", "Nome_Projeto", "Nr_OS_OPP" FROM "Planejamentos" WHERE "Nome_Projeto" ILIKE '%CODEVASF%'`)
  console.log('Projetos CODEVASF cadastrados no Par:')
  for (const r of rows) console.log(`  "${r.Nome_Projeto}" -> Nr_OS_OPP: "${r.Nr_OS_OPP}"`)

  for (const plan of rows) {
    const ehPescados = /PESCADO/i.test(plan.Nome_Projeto)
    const atuais = String(plan.Nr_OS_OPP || '').split(',').map(s => s.trim()).filter(Boolean)
    const tem91 = atuais.includes('91')

    if (ehPescados && !tem91) {
      const novaLista = [...atuais, '91'].join(',')
      console.log(`\n"${plan.Nome_Projeto}" (é a Pescados, precisa ter a OS 91)`)
      console.log(`  Nr_OS_OPP: "${plan.Nr_OS_OPP}" → "${novaLista}"`)
      if (APPLY) { await pool.query('UPDATE "Planejamentos" SET "Nr_OS_OPP" = $1 WHERE "ID" = $2', [novaLista, plan.ID]); console.log('  -> aplicado.') }
    } else if (!ehPescados && tem91) {
      const novaLista = atuais.filter(os => os !== '91').join(',')
      console.log(`\n"${plan.Nome_Projeto}" (NÃO é a Pescados, mas tem a OS 91 — remove)`)
      console.log(`  Nr_OS_OPP: "${plan.Nr_OS_OPP}" → "${novaLista}"`)
      if (APPLY) { await pool.query('UPDATE "Planejamentos" SET "Nr_OS_OPP" = $1 WHERE "ID" = $2', [novaLista, plan.ID]); console.log('  -> aplicado.') }
    }
  }

  if (!APPLY) console.log('\nModo dry-run — nada foi alterado. Rode com --apply pra gravar.')
  else console.log('\nConcluído.')
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
