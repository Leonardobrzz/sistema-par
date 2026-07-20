const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService')

const router = express.Router()
router.use(authMiddleware)

const pBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0

async function fetchOppBatch() {
  try {
    const { oppRequest } = require('../services/oppService')
    const todosCC = await oppRequest('GET', '/centros-custo?limit=500')
    const listaCC = Array.isArray(todosCC) ? todosCC : (todosCC?.data || [])

    let offset = 0, todos = []
    while (true) {
      const r = await oppRequest('GET', `/contas-pagar?limit=250&offset=${offset}&lixeira=Nao`)
      const lista = Array.isArray(r) ? r : (r?.data || [])
      if (lista.length === 0) break
      todos.push(...lista)
      if (lista.length < 250) break
      offset += 250
    }

    // Mapa ccId → { total, totalPago }
    const porCC = {}
    for (const d of todos) {
      if (d.lixeira === 'Sim') continue
      if ((d.situacao || '').toLowerCase().includes('estornada')) continue
      const ccId = String(d.id_centro_custos || '')
      if (!ccId) continue
      if (!porCC[ccId]) porCC[ccId] = { total: 0, totalPago: 0 }
      porCC[ccId].total    += parseFloat(d.valor_pag  || 0)
      porCC[ccId].totalPago += parseFloat(d.valor_pago || 0)
    }

    return { listaCC, porCC }
  } catch {
    return { listaCC: [], porCC: {} }
  }
}

router.get('/', async (req, res, next) => {
  try {
    const [planejamentos, medicoes, logHoras, oppData] = await Promise.all([
      db.readSheet('Planejamentos'),
      db.readSheet('Medicoes'),
      db.readSheet('Log_Horas'),
      fetchOppBatch(),
    ])

    const aprovados = planejamentos.filter(p => p.Status === 'Aprovado')

    const medPorProjeto = {}
    medicoes.forEach(m => {
      if (!medPorProjeto[m.ID_Projeto]) medPorProjeto[m.ID_Projeto] = []
      medPorProjeto[m.ID_Projeto].push(m)
    })

    const horasPorProjeto = {}
    logHoras.forEach(h => {
      const id = h.ID_Projeto
      if (!id) return
      if (!horasPorProjeto[id]) horasPorProjeto[id] = 0
      horasPorProjeto[id] += parseFloat(h.Horas_Logadas || h.Horas || h.horas || 0)
    })

    const { listaCC, porCC } = oppData

    function findCC(nome) {
      if (!nome) return null
      const norm = nome.toLowerCase().trim()
      return listaCC.find(c => {
        const desc = (c.desc_centro_custos || '').toLowerCase().trim()
        return desc === norm || desc.includes(norm) || norm.includes(desc)
      }) || null
    }

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

      // Custo real — OPP (despesas pagas)
      const cc = findCC(plan.Nr_Contrato_OS || '')
      const ccId = cc ? String(cc.id_centro_custos) : null
      const oppCC = ccId ? (porCC[ccId] || { total: 0, totalPago: 0 }) : { total: 0, totalPago: 0 }
      const custoRealOPP = oppCC.totalPago

      // Custo real — equipe (horas rastreadas * média/hora)
      const mediaHora = (d.equipe || []).length > 0
        ? (d.equipe || []).reduce((s, e) => s + (pBR(e.mediaHora) || 36.4), 0) / (d.equipe || []).length
        : 36.4
      const horasRastreadas = horasPorProjeto[plan.ID_Projeto] || 0
      const horasPlan = (d.equipe || []).reduce((s, e) => s + pBR(e.horas), 0)
      const custoRealEquipe = horasRastreadas * mediaHora

      const custoRealTotal = custoRealOPP + custoRealEquipe

      const medsPlan  = d.medicoesCronograma || d.medicoes || []
      const medsReais = medPorProjeto[plan.ID_Projeto] || []

      const totalRecebido  = medsReais.filter(m => m.Status_Financeiro === 'Recebido').reduce((s, m) => s + pBR(m.Valor), 0)
      const totalPendente  = medsReais.filter(m => m.Status_Financeiro !== 'Recebido').reduce((s, m) => s + pBR(m.Valor), 0)
      const percRecebido   = V > 0 ? totalRecebido / V * 100 : 0

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
        valorContrato:   Math.round(V),
        receitaLiquida:  Math.round(recLiq),
        // custos planejados (PAR)
        totalCustos:     Math.round(totalCustos),
        totalTercs:      Math.round(totalTercs),
        totalEq:         Math.round(totalEq),
        totalDesp:       Math.round(totalDesp + totalDespInt),
        lucroPlan:       Math.round(lucroPlan),
        margemPlan:      parseFloat(margemPlan.toFixed(1)),
        // custos reais
        custoRealOPP:    Math.round(custoRealOPP),
        custoRealEquipe: Math.round(custoRealEquipe),
        custoRealTotal:  Math.round(custoRealTotal),
        horasPlan:       Math.round(horasPlan),
        horasRastreadas: parseFloat(horasRastreadas.toFixed(1)),
        // medições (faturamento)
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
