// node backend/corrigir-orfaos.js            → dry-run
// node backend/corrigir-orfaos.js --apply     → aplica
//
// Confirmado pelo centro de custo real do OPP (não por texto de observação):
//
//  - OS 98 cadastrada na ESCOLA MUNICIPAL EDUARDO VALVERDE é, na verdade, do
//    "Centro Especializado de Reabilitação (CER)" de Nova Mamoré — projeto
//    que ainda não existe no Par. Remove a OS 98 da Valverde.
//
//  - OS 105 cadastrada na Passagem Molhada (Croatá) é, na verdade, do
//    "Terminal Rodoviário de Croatá" — projeto que ainda não existe no Par.
//    Remove a OS 105 da Passagem Molhada.
//
//  - OS 173 (achada depois) é confirmada como 100% da Passagem Molhada, pelo
//    centro de custo do OPP (mesmo o texto citando as duas obras juntas).
//    Adiciona a OS 173 na Passagem Molhada.
//
//  - OS 153, onde estiver cadastrada hoje entre os projetos do Mulungu, é na
//    verdade do "Levantamento de Prédios Públicos" — projeto que ainda não
//    existe no Par. Remove a OS 153 de qualquer projeto do Mulungu que a
//    tenha cadastrada.
//
// Os 3 projetos "órfãos" (CER Nova Mamoré, Terminal Rodoviário Croatá,
// Levantamento de Prédios Públicos Mulungu) precisam ser cadastrados no Par
// pra esse dinheiro aparecer em algum lugar — isso fica de aviso pro chef.

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const APPLY = process.argv.includes('--apply')

async function removerDe(nome, osRemover) {
  const { rows } = await pool.query('SELECT "ID", "Nr_OS_OPP" FROM "Planejamentos" WHERE "Nome_Projeto" = $1', [nome])
  if (rows.length !== 1) { console.log(`[PULEI] "${nome}" — encontrei ${rows.length} registro(s).`); return }
  const plan = rows[0]
  const atuais = String(plan.Nr_OS_OPP || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!atuais.includes(osRemover)) { console.log(`[JÁ OK] "${nome}" — não tem a OS ${osRemover} (Nr_OS_OPP: "${plan.Nr_OS_OPP}").`); return }
  const novaLista = atuais.filter(os => os !== osRemover).join(',')
  console.log(`"${nome}"\n  Nr_OS_OPP: "${plan.Nr_OS_OPP}" → "${novaLista}"`)
  if (APPLY) { await pool.query('UPDATE "Planejamentos" SET "Nr_OS_OPP" = $1 WHERE "ID" = $2', [novaLista, plan.ID]); console.log('  -> aplicado.') }
}

async function adicionarEm(nome, osAdicionar) {
  const { rows } = await pool.query('SELECT "ID", "Nr_OS_OPP" FROM "Planejamentos" WHERE "Nome_Projeto" = $1', [nome])
  if (rows.length !== 1) { console.log(`[PULEI] "${nome}" — encontrei ${rows.length} registro(s).`); return }
  const plan = rows[0]
  const atuais = String(plan.Nr_OS_OPP || '').split(',').map(s => s.trim()).filter(Boolean)
  if (atuais.includes(osAdicionar)) { console.log(`[JÁ OK] "${nome}" — já tem a OS ${osAdicionar}.`); return }
  const novaLista = [...atuais, osAdicionar].join(',')
  console.log(`"${nome}"\n  Nr_OS_OPP: "${plan.Nr_OS_OPP}" → "${novaLista}"`)
  if (APPLY) { await pool.query('UPDATE "Planejamentos" SET "Nr_OS_OPP" = $1 WHERE "ID" = $2', [novaLista, plan.ID]); console.log('  -> aplicado.') }
}

async function removerDeQualquerMulungu(osRemover) {
  const { rows } = await pool.query(`SELECT "ID", "Nome_Projeto", "Nr_OS_OPP" FROM "Planejamentos" WHERE "Nome_Projeto" ILIKE '%MULUNGU%'`)
  for (const plan of rows) {
    const atuais = String(plan.Nr_OS_OPP || '').split(',').map(s => s.trim()).filter(Boolean)
    if (!atuais.includes(osRemover)) continue
    const novaLista = atuais.filter(os => os !== osRemover).join(',')
    console.log(`"${plan.Nome_Projeto}"\n  Nr_OS_OPP: "${plan.Nr_OS_OPP}" → "${novaLista}"`)
    if (APPLY) { await pool.query('UPDATE "Planejamentos" SET "Nr_OS_OPP" = $1 WHERE "ID" = $2', [novaLista, plan.ID]); console.log('  -> aplicado.') }
  }
}

async function main() {
  await removerDe('ARQ-2026-4- ESCOLA MUNICIPAL EDUARDO VALVERDE', '98')
  await removerDe('INF-2026-03 - CONSTRUÇÃO DE PASSAGEM MOLHADA CV 993599-2026', '105')
  await adicionarEm('INF-2026-03 - CONSTRUÇÃO DE PASSAGEM MOLHADA CV 993599-2026', '173')
  await removerDeQualquerMulungu('153')

  if (!APPLY) console.log('\nModo dry-run — nada foi alterado. Rode com --apply pra gravar.')
  else console.log('\nConcluído. Falta cadastrar no Par (avisar o chef): Centro de Reabilitação (Nova Mamoré), Terminal Rodoviário (Croatá) e Levantamento de Prédios Públicos (Mulungu) — cada um já tem dinheiro real no OPP mas nenhum projeto no Par pra receber esse valor ainda.')
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
