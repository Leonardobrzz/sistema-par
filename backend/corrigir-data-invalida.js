// node backend/corrigir-data-invalida.js            → dry-run
// node backend/corrigir-data-invalida.js --apply     → aplica
//
// Corrige a data da 1ª medição (PRODUTO 01) do projeto SAN-01 SAA UMARI:
// estava "82026-09-20" (um "8" sobrando na frente) e devia ser "2026-09-20"
// — bate certinho com o padrão das outras 3 medições (uma por mês: 09-20,
// 10-30, 11-30, 12-30). Isso é o que causava o "Invalid Date" na tela.

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const APPLY = process.argv.includes('--apply')

async function main() {
  const { rows } = await pool.query(`SELECT "ID", "Nome_Projeto", "Dados_JSON" FROM "Planejamentos" WHERE "Nome_Projeto" = 'SAN-01 SAA UMARI'`)
  if (rows.length !== 1) {
    console.log(`Encontrei ${rows.length} registro(s), esperava 1. Abortando.`)
    pool.end()
    return
  }

  const plan = rows[0]
  const dados = JSON.parse(plan.Dados_JSON || '{}')
  const d = dados._baseline || dados
  const meds = d.medicoesCronograma || d.medicoes || []

  const m0 = meds[0]
  if (!m0) { console.log('Não achei a medição [0]. Abortando.'); pool.end(); return }

  const campo = m0.dataPrevisao !== undefined ? 'dataPrevisao' : 'dataPrevista'
  const valorAtual = m0[campo]
  console.log(`Medição [0] "${m0.etapa || m0.descricao}" — campo "${campo}": "${valorAtual}" → "2026-09-20"`)

  if (valorAtual !== '82026-09-20') {
    console.log('[AVISO] o valor atual não é mais "82026-09-20" (pode já ter sido corrigido, ou mudou). Não vou mexer por segurança.')
    pool.end()
    return
  }

  m0[campo] = '2026-09-20'

  if (APPLY) {
    await pool.query('UPDATE "Planejamentos" SET "Dados_JSON" = $1 WHERE "ID" = $2', [JSON.stringify(dados), plan.ID])
    console.log('-> aplicado.')
  } else {
    console.log('\nModo dry-run — nada foi alterado. Rode com --apply pra gravar.')
  }
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
