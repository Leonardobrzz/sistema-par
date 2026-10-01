// node backend/corrigir-os-170.js            → dry-run
// node backend/corrigir-os-170.js --apply     → aplica
//
// Achado no buscar-os-por-projeto.js: a OS 170 bate palavra por palavra com o
// projeto "PAV DE EST VIC DESTINADAS AO ESCOAMENTO PRODUTIVO CV 993598-2026"
// (Croatá-CE, PP N° 993598/2026). Adiciona a OS 170 na lista desse projeto,
// sem remover nada que já esteja lá (só adiciona se ainda não tiver).

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const APPLY = process.argv.includes('--apply')

async function adicionarNaLista(nome, osAdicionar) {
  const { rows } = await pool.query(
    'SELECT "ID", "Nr_OS_OPP" FROM "Planejamentos" WHERE "Nome_Projeto" = $1',
    [nome]
  )
  if (rows.length !== 1) {
    console.log(`[PULEI] "${nome}" — encontrei ${rows.length} registro(s), esperava 1.`)
    return
  }
  const plan = rows[0]
  const atuais = String(plan.Nr_OS_OPP || '').split(',').map(s => s.trim()).filter(Boolean)
  if (atuais.includes(osAdicionar)) {
    console.log(`[JÁ OK] "${nome}" — já tem a OS ${osAdicionar} (Nr_OS_OPP: "${plan.Nr_OS_OPP}").`)
    return
  }
  const novaLista = [...atuais, osAdicionar].join(',')
  console.log(`"${nome}"`)
  console.log(`  Nr_OS_OPP: "${plan.Nr_OS_OPP}" → "${novaLista}"`)
  if (APPLY) {
    await pool.query('UPDATE "Planejamentos" SET "Nr_OS_OPP" = $1 WHERE "ID" = $2', [novaLista, plan.ID])
    console.log('  -> aplicado.')
  }
}

async function main() {
  await adicionarNaLista('INF-2026-02 - PAV DE EST VIC DESTINADAS AO ESCOAMENTO PRODUTIVO CV 993598-2026', '170')

  if (!APPLY) console.log('\nModo dry-run — nada foi alterado. Rode com --apply pra gravar.')
  else console.log('\nConcluído.')
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
