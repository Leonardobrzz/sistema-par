// node backend/corrigir-os91-final.js            → dry-run
// node backend/corrigir-os91-final.js --apply     → aplica
//
// Confirmado: as 3 unidades da CODEVASF (Pescados, Leite, Abelhas) tinham a
// OS 91 cadastrada nas 3 ao mesmo tempo — triplicando a receita de R$ 39.900
// (contava R$ 119.700 no total). Pelo centro de custo real do OPP, esse
// pagamento é 100% da Unidade de Pescados. Remove a OS 91 de Leite e Abelhas,
// mantém só na Pescados.

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
  await removerDe('ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-1-GRUPO 2-2-UNID. DE LEITE', '91')
  await removerDe('ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-1-GRUPO 2-3-PRODUÇÃO DE ABELHAS', '91')
  console.log('\n[MANTIDO] "ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-1-GRUPO 2-1-UNID. PESCADOS" continua com a OS 91 (é a dona certa).')

  if (!APPLY) console.log('\nModo dry-run — nada foi alterado. Rode com --apply pra gravar.')
  else console.log('\nConcluído.')
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
