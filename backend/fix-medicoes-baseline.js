// node backend/fix-medicoes-baseline.js
// Corrige _baseline.medicoes[].valor corrompidos por parseFloat (pt-BR)
const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
})

// parseBR correto (lida com "47.370,88" → 47370.88)
const parseBR = v => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0

// Detecta se valor parece corrompido: tem casas decimais mas é pequeno demais
// comparado ao valor do contrato. Heurística: se valor < 1000 e percentual > 0
// e valor esperado (perc * vc / 100) > valor * 10 → provavelmente corrompido.
// Mas a forma mais confiável é: se o valor armazenado tem <= 2 casas decimais
// e é muito menor que o esperado pelo percentual.
function valorPareceCorrompido(valor, percentual, valorContrato) {
  if (!percentual || !valorContrato || valorContrato <= 0) return false
  const esperado = parseBR(percentual) * valorContrato / 100
  if (esperado <= 0) return false
  // Se o valor armazenado é <= 1% do esperado, provavelmente corrompido
  return valor > 0 && valor < esperado * 0.01
}

async function main() {
  const { rows } = await pool.query(
    'SELECT "ID", "Nome_Projeto", "Valor_Contrato", "Dados_JSON" FROM "Planejamentos" WHERE "Dados_JSON" IS NOT NULL AND "Dados_JSON" != \'\''
  )

  let corrigidos = 0
  for (const row of rows) {
    let d
    try { d = JSON.parse(row.Dados_JSON) } catch { continue }

    const baseline = d._baseline
    if (!baseline || !Array.isArray(baseline.medicoes) || baseline.medicoes.length === 0) continue

    const vc = baseline.valorContrato || parseBR(row.Valor_Contrato || 0)
    if (vc <= 0) continue

    let alterado = false
    const novasMedicoes = baseline.medicoes.map(m => {
      const valorAtual = typeof m.valor === 'number' ? m.valor : parseBR(m.valor)
      const esperado = parseBR(m.percentual) * vc / 100

      if (valorPareceCorrompido(valorAtual, m.percentual, vc)) {
        console.log(`  Medição "${m.etapa}": ${valorAtual} → ${esperado.toFixed(2)} (${m.percentual}% de ${vc})`)
        alterado = true
        return { ...m, valor: parseFloat(esperado.toFixed(2)) }
      }
      return m
    })

    if (alterado) {
      console.log(`Corrigindo: ${row.Nome_Projeto}`)
      d._baseline.medicoes = novasMedicoes
      // Também recalcula totalMedicoes do baseline
      d._baseline.totalMedicoes = novasMedicoes.reduce((s, m) => s + (m.valor || 0), 0)
      await pool.query(
        'UPDATE "Planejamentos" SET "Dados_JSON" = $1 WHERE "ID" = $2',
        [JSON.stringify(d), row.ID]
      )
      corrigidos++
    }
  }

  console.log(`\nTotal projetos corrigidos: ${corrigidos}`)
  pool.end()
}

main().catch(e => { console.error(e.message); pool.end() })
