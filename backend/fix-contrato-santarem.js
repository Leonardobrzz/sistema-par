// node backend/fix-contrato-santarem.js
// Corrige Valor_Contrato e Valor_Global de SANTARÉM (corrompido: 47 → 47370.88)
const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
})

async function main() {
  // Busca o planejamento do projeto ARQ-2026-4 SANTARÉM
  const { rows } = await pool.query(
    `SELECT p."ID", p."ID_Projeto", p."Nome_Projeto", p."Valor_Contrato", p."Dados_JSON"
     FROM "Planejamentos" p
     WHERE p."Nome_Projeto" ILIKE '%SANT%' OR p."Nome_Projeto" ILIKE '%CORREIOS%SANT%'`
  )

  console.log('Planejamentos encontrados:', rows.map(r => ({ ID: r.ID, Nome: r.Nome_Projeto, VC: r.Valor_Contrato })))

  for (const row of rows) {
    const vc = parseFloat(row.Valor_Contrato || 0)
    if (vc < 1000) {
      // Provavelmente corrompido — o valor correto é 47370.88
      const correto = 47370.88
      console.log(`Corrigindo Valor_Contrato: ${vc} → ${correto}`)

      // Atualiza Valor_Contrato na tabela Planejamentos
      await pool.query(
        'UPDATE "Planejamentos" SET "Valor_Contrato" = $1 WHERE "ID" = $2',
        [String(correto), row.ID]
      )

      // Atualiza Dados_JSON: valorContrato e _baseline.valorContrato
      if (row.Dados_JSON) {
        try {
          const d = JSON.parse(row.Dados_JSON)
          if (d.valorContrato) d.valorContrato = String(correto)
          if (d._baseline) d._baseline.valorContrato = correto
          await pool.query(
            'UPDATE "Planejamentos" SET "Dados_JSON" = $1 WHERE "ID" = $2',
            [JSON.stringify(d), row.ID]
          )
        } catch {}
      }

      // Atualiza Valor_Global em Projetos_Contratos
      if (row.ID_Projeto) {
        const r2 = await pool.query(
          'SELECT "ID_Projeto", "Valor_Global" FROM "Projetos_Contratos" WHERE "ID_Projeto" = $1',
          [row.ID_Projeto]
        )
        if (r2.rows.length > 0) {
          console.log(`  Projetos_Contratos Valor_Global: ${r2.rows[0].Valor_Global} → ${correto}`)
          await pool.query(
            'UPDATE "Projetos_Contratos" SET "Valor_Global" = $1 WHERE "ID_Projeto" = $2',
            [String(correto), row.ID_Projeto]
          )
        }
      }
    }
  }

  console.log('Concluído.')
  pool.end()
}

main().catch(e => { console.error(e.message); pool.end() })
