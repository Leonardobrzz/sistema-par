const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService')

const router = express.Router()
router.use(authMiddleware)

const pBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0

router.get('/', async (req, res, next) => {
  try {
    const [planejamentos, medicoes] = await Promise.all([
      db.readSheet('Planejamentos'),
      db.readSheet('Medicoes'),
    ])

    const aprovados = planejamentos.filter(p => p.Status === 'Aprovado')

    const medPorProjeto = {}
    medicoes.forEach(m => {
      if (!medPorProjeto[m.ID_Projeto]) medPorProjeto[m.ID_Projeto] = []
      medPorProjeto[m.ID_Projeto].push(m)
    })

    const projetos = aprovados.map(plan => {
      let dados = {}
      try { dados = JSON.parse(plan.Dados_JSON || '{}') } catch {}
      const d = dados._baseline || dados

      const V  = pBR(d.valorContrato  || plan.Valor_Contrato)
      const ip = Math.max(pBR(d.impostosPerc) || 20, 16.33)
      const ta = Math.max(pBR(d.taxaAdmPerc)  || 12, 5)
      const co = pBR(d.comissaoPerc) || 7.5
      const recLiq       = V * (1 - (ip + ta + co) / 100)
      const totalTercs   = (d.terceirizados    || []).reduce((s, t) => s + pBR(t.custo), 0)
      const totalEq      = (d.equipe           || []).reduce((s, e) => s + pBR(e.horas) * (pBR(e.mediaHora) || 36.4), 0)
      const totalDesp    = (d.despesas         || []).reduce((s, x) => s + pBR(x.valor), 0)
      const totalDespInt = (d.despesasInternas || []).reduce((s, x) => s + pBR(x.custo), 0)
      const totalCustos  = totalTercs + totalEq + totalDesp + totalDespInt
      const lucroPlan    = recLiq - totalCustos
      const margemPlan   = V > 0 ? lucroPlan / V * 100 : 0

      const medsPlan  = d.medicoesCronograma || d.medicoes || []
      const medsReais = medPorProjeto[plan.ID_Projeto] || []

      const totalRecebido  = medsReais.filter(m => m.Status_Financeiro === 'Recebido').reduce((s, m) => s + pBR(m.Valor), 0)
      const totalPendente  = medsReais.filter(m => m.Status_Financeiro !== 'Recebido').reduce((s, m) => s + pBR(m.Valor), 0)
      const percRecebido   = V > 0 ? totalRecebido / V * 100 : 0

      // Cronograma: cruza planejado x real por índice (melhor disponível)
      const maxLen = Math.max(medsPlan.length, medsReais.length)
      const cronograma = Array.from({ length: maxLen }, (_, i) => {
        const mp = medsPlan[i]  || null
        const mr = medsReais[i] || null
        return {
          etapa:          mp ? (mp.etapa || mp.descricao || `Medição ${i + 1}`) : `Medição ${i + 1}`,
          percentualPlan: mp ? pBR(mp.percentual) : null,
          valorPlan:      mp ? pBR(mp.valor || mp.valorPlanejado) : null,
          dataPrevista:   mp ? (mp.dataPrevisao || mp.dataPrevista || '') : '',
          valorReal:      mr ? pBR(mr.Valor) : null,
          dataRecebimento:mr ? (mr.Data_Recebimento || '') : null,
          statusReal:     mr ? mr.Status_Financeiro : null,
        }
      })

      return {
        id:          plan.ID,
        idProjeto:   plan.ID_Projeto,
        nome:        plan.Nome_Projeto,
        setor:       plan.Setor,
        valorContrato:  Math.round(V),
        receitaLiquida: Math.round(recLiq),
        totalCustos:    Math.round(totalCustos),
        lucroPlan:      Math.round(lucroPlan),
        margemPlan:     parseFloat(margemPlan.toFixed(1)),
        totalRecebido:  Math.round(totalRecebido),
        totalPendente:  Math.round(totalPendente),
        percRecebido:   parseFloat(percRecebido.toFixed(1)),
        qtdMedPlan:     medsPlan.length,
        qtdMedReais:    medsReais.length,
        qtdMedRecebidas:medsReais.filter(m => m.Status_Financeiro === 'Recebido').length,
        cronograma,
      }
    }).sort((a, b) => b.valorContrato - a.valorContrato)

    res.json({ projetos })
  } catch (err) {
    next(err)
  }
})

module.exports = router
