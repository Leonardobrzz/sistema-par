// node backend/fix-baselines.js
const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
})

const parseBR = v => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0

async function main() {
  const { rows } = await pool.query('SELECT "ID", "Nome_Projeto", "Valor_Contrato", "Dados_JSON" FROM "Planejamentos" WHERE "Dados_JSON" IS NOT NULL AND "Dados_JSON" != \'\'')

  let corrigidos = 0
  for (const row of rows) {
    let d
    try { d = JSON.parse(row.Dados_JSON) } catch { continue }
    if (!d._baseline) continue

    const correto = parseBR(d.valorContrato || row.Valor_Contrato || 0)
    const atual = d._baseline.valorContrato

    if (Math.abs(atual - correto) > 0.01) {
      console.log('Corrigindo:', row.Nome_Projeto)
      console.log('  ', atual, '->', correto)
      d._baseline.valorContrato = correto
      await pool.query('UPDATE "Planejamentos" SET "Dados_JSON" = $1 WHERE "ID" = $2', [JSON.stringify(d), row.ID])
      corrigidos++
    }
  }
  console.log('\nTotal corrigidos:', corrigidos)
  pool.end()
}
main().catch(e => { console.error(e.message); pool.end() })
