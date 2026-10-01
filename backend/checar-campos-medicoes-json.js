// node backend/checar-campos-medicoes-json.js
//
// Só lê o banco. Não altera nada.
//
// Verifica, pra cada planejamento aprovado, quais chaves o cronograma de
// medições planejadas (dentro do Dados_JSON) usa pro campo de valor e de
// data — pra confirmar se o nome do campo é consistente entre projetos
// (isso afeta a soma "A Receber" da tela de Dashboard, que procura por
// m.valor / m.valorPlanejado).

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

function pBR(v) {
  if (!v) return 0
  const s = String(v).replace(/\./g, '').replace(',', '.')
  return parseFloat(s) || 0
}

async function main() {
  const { rows } = await pool.query(`SELECT "ID_Projeto", "Nome_Projeto", "Valor_Contrato", "Dados_JSON" FROM "Planejamentos" WHERE "Status" = 'Aprovado' ORDER BY "Nome_Projeto"`)

  const contagemChavesValor = {}
  const contagemChavesData = {}
  const contagemFonte = { 'dados.medicoes': 0, '_baseline.medicoesCronograma': 0, nenhuma: 0 }

  let somaComCampoValor = 0
  let somaComCampoValorPlan = 0
  let totalContrato = 0

  for (const plan of rows) {
    totalContrato += pBR(plan.Valor_Contrato)
    let dados = {}
    try { dados = JSON.parse(plan.Dados_JSON || '{}') } catch { continue }
    const d = dados._baseline || dados

    let meds = null
    let fonte = 'nenhuma'
    if (Array.isArray(dados.medicoes) && dados.medicoes.length) { meds = dados.medicoes; fonte = 'dados.medicoes' }
    else if (Array.isArray(d.medicoesCronograma) && d.medicoesCronograma.length) { meds = d.medicoesCronograma; fonte = '_baseline.medicoesCronograma' }
    contagemFonte[fonte]++

    if (!meds) continue

    for (const m of meds) {
      for (const k of Object.keys(m)) {
        if (/valor/i.test(k)) contagemChavesValor[k] = (contagemChavesValor[k] || 0) + 1
        if (/data/i.test(k)) contagemChavesData[k] = (contagemChavesData[k] || 0) + 1
      }
    }

    // Simula exatamente o que o Dashboard.jsx faz hoje:
    const somaAtual = meds.reduce((s, m) => s + pBR(m.valor || m.valorPlanejado || 0), 0)
    somaComCampoValor += somaAtual
    // Testa se valorPlan (campo real usado no Relatório de Medições) daria outro resultado:
    const somaComValorPlan = meds.reduce((s, m) => s + pBR(m.valorPlan || m.valor || m.valorPlanejado || 0), 0)
    somaComCampoValorPlan += somaComValorPlan

    if (somaAtual === 0 && somaComValorPlan > 0) {
      console.log(`  [DIVERGE] "${plan.Nome_Projeto}": soma atual (m.valor/m.valorPlanejado) = 0, mas com m.valorPlan = ${somaComValorPlan.toFixed(2)}`)
    }
  }

  console.log('\n=== Chaves contendo "valor" encontradas nos itens do cronograma (com contagem) ===')
  console.log(contagemChavesValor)
  console.log('\n=== Chaves contendo "data" encontradas ===')
  console.log(contagemChavesData)
  console.log('\n=== Fonte usada por projeto (dados.medicoes vs _baseline.medicoesCronograma vs nenhuma) ===')
  console.log(contagemFonte)

  console.log(`\nTotal contrato (todos aprovados): ${totalContrato.toFixed(2)}`)
  console.log(`Soma usando campo atual do Dashboard (m.valor || m.valorPlanejado): ${somaComCampoValor.toFixed(2)}`)
  console.log(`Soma se usasse m.valorPlan (campo real do Relatório de Medições) como prioridade: ${somaComCampoValorPlan.toFixed(2)}`)

  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
