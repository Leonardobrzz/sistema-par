// node backend/corrigir-os153.js            → dry-run
// node backend/corrigir-os153.js --apply     → aplica
//
// Confirmado pelo centro de custo real do OPP: a OS 153 (R$ 15.000,
// "LEVANTAMENTO DE PRÉDIOS PUBLICOS") não é nem do Pórtico de Entrada nem do
// Mirante do Camará — é de um projeto que ainda não existe no Par. Remove a
// OS 153 dos dois projetos onde ela está cadastrada errada hoje.

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
  if (!atuais.includes(osRemover)) { console.log(`[JÁ OK] "${nome}" — não tem a OS ${osRemover}.`); return }
  const novaLista = atuais.filter(os => os !== osRemover).join(',')
  console.log(`"${nome}"\n  Nr_OS_OPP: "${plan.Nr_OS_OPP}" → "${novaLista}"`)
  if (APPLY) { await pool.query('UPDATE "Planejamentos" SET "Nr_OS_OPP" = $1 WHERE "ID" = $2', [novaLista, plan.ID]); console.log('  -> aplicado.') }
}

async function main() {
  await removerDe('ARQ-2025-6-PORTICO DE ENTRADA', '153')
  await removerDe('ARQ-2025-1-URB MIRANTE DO CAMARÁ', '153')

  if (!APPLY) console.log('\nModo dry-run — nada foi alterado. Rode com --apply pra gravar.')
  else console.log('\nConcluído.')
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
