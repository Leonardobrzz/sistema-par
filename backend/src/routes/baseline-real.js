const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService')

const router = express.Router()
router.use(authMiddleware)

// Detecta formato americano (1234.56) vs BR (1.234,56 ou 1.234.567)
const pBR = (v) => {
  const s = String(v || 0).trim()
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  const parts = s.split('.')
  if (parts.length === 2 && parts[1].length <= 2) return parseFloat(s) || 0
  return parseFloat(s.replace(/\./g, '')) || 0
}

async function fetchOppBatch() {
  try {
    const { oppRequest } = require('../services/oppService')
    const todosCC = await oppRequest('GET', '/centros-custo?limit=500')
    const listaCC = Array.isArray(todosCC) ? todosCC : (todosCC?.data || [])

    // contas-pagar (despesas) e contas-receber em paralelo
    async function paginar(endpoint) {
      let offset = 0, todos = []
      while (true) {
        const r = await oppRequest('GET', `${endpoint}?limit=250&offset=${offset}&lixeira=Nao`)
        const lista = Array.isArray(r) ? r : (r?.data || [])
        if (lista.length === 0) break
        todos.push(...lista)
        if (lista.length < 250) break
        offset += 250
      }
      return todos
    }

    const [despesas, receitas] = await Promise.all([
      paginar('/contas-pagar'),
      paginar('/contas-receber'),
    ])

    // Mapa ccId → { total, totalPago } (despesas por CC id)
    const porCC = {}
    for (const d of despesas) {
      if (d.lixeira === 'Sim') continue
      if ((d.situacao || '').toLowerCase().includes('estornada')) continue
      const ccId = String(d.id_centro_custos || '')
      if (!ccId) continue
      if (!porCC[ccId]) porCC[ccId] = { total: 0, totalPago: 0 }
      porCC[ccId].total     += parseFloat(d.valor_pag  || 0)
      porCC[ccId].totalPago += parseFloat(d.valor_pago || 0)
    }

    // Agrupa receitas por id_centro_custos — fonte principal e confiável
    // (confirmado: vem preenchido em ~97% dos lançamentos; só falta em casos
    // residuais como fatura de cartão, lançamento de banco etc. O comentário
    // antigo dizia que esse campo vinha sempre nulo — não é mais verdade, ou
    // nunca foi pra Contas a Receber; só é nulo mesmo pra alguns lançamentos
    // avulsos.)
    const recebidoPorCC = {}  // ccId → total liquidado
    const pendentePorCC = {}  // ccId → total pendente

    // Agrupa também por número de OS (extraído de observacoes_rec) — usado só
    // como reserva pros projetos que ainda não têm ID_Centro_Custo_OPP
    // confirmado no Par. Captura "OS nro. 79" (formato ativo) e "ordem de
    // serviço nº 1791" (formato legado)
    const osRegex = /(?:OS\s+nro?\.\s*|ordem de servi[cç]o\s*n[º°]?\s*)(\d+)/i
    const recebidoPorOS  = {}  // osNum → total liquidado
    const pendentesPorOS = {}  // osNum → total pendente

    for (const r of receitas) {
      if (r.lixeira === 'Sim') continue
      const v = parseFloat(r.valor_rec || 0)
      const liquidado = r.liquidado_rec === 'Sim'

      const ccId = String(r.id_centro_custos || '')
      if (ccId && ccId !== '0') {
        if (liquidado) recebidoPorCC[ccId] = (recebidoPorCC[ccId] || 0) + v
        else           pendentePorCC[ccId] = (pendentePorCC[ccId] || 0) + v
      }

      const obs = r.observacoes_rec || ''
      const match = obs.match(osRegex)
      if (!match) continue
      const osNum = match[1]
      if (liquidado) {
        recebidoPorOS[osNum]  = (recebidoPorOS[osNum]  || 0) + v
      } else {
        pendentesPorOS[osNum] = (pendentesPorOS[osNum] || 0) + v
      }
    }

    return { listaCC, porCC, recebidoPorOS, pendentesPorOS, recebidoPorCC, pendentePorCC }
  } catch {
    return { listaCC: [], porCC: {}, recebidoPorOS: {}, pendentesPorOS: {}, recebidoPorCC: {}, pendentePorCC: {} }
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

    const { listaCC, porCC, recebidoPorOS, pendentesPorOS, recebidoPorCC, pendentePorCC } = oppData

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

      // Centro de custo do projeto: prioriza o vínculo confirmado
      // (ID_Centro_Custo_OPP, conferido manualmente contra o cadastro real do
      // OPP), cai pro casamento por texto (Nr_Contrato_OS) só pros projetos
      // que ainda não têm esse vínculo revisado.
      const ccIdConfirmado = plan.ID_Centro_Custo_OPP ? String(plan.ID_Centro_Custo_OPP) : null
      const ccFuzzy = ccIdConfirmado ? null : findCC(plan.Nr_Contrato_OS || '')
      const ccId = ccIdConfirmado || (ccFuzzy ? String(ccFuzzy.id_centro_custos) : null)

      // Custo real — OPP (despesas pagas)
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

      // totalRecebido vem do OPP. Prioridade: centro de custo confirmado
      // (ID_Centro_Custo_OPP) — muito mais confiável que texto digitado à mão
      // na observação. Só cai pro método antigo (Nr_OS_OPP + texto da
      // observação) pros projetos que ainda não têm um centro de custo
      // confirmado no Par.
      let totalRecebido, totalPendenteOPP
      if (ccIdConfirmado) {
        totalRecebido    = recebidoPorCC[ccIdConfirmado] || 0
        totalPendenteOPP = pendentePorCC[ccIdConfirmado] || 0
      } else {
        const osNums = String(plan.Nr_OS_OPP || '').split(',').map(s => s.trim()).filter(Boolean)
        totalRecebido    = osNums.reduce((s, n) => s + (recebidoPorOS[n]  || 0), 0)
        totalPendenteOPP = osNums.reduce((s, n) => s + (pendentesPorOS[n] || 0), 0)
      }
      const totalPendente = totalPendenteOPP ||
        medsReais.filter(m => m.Status_Financeiro !== 'Recebido').reduce((s, m) => s + pBR(m.Valor), 0)
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
        cliente:     plan.Cliente || '',
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
        // medições (faturamento) — dados ao vivo do OPP
        totalRecebido:  Math.round(totalRecebido),
        totalPendente:  Math.round(totalPendente),
        saldoReceber:   Math.max(0, Math.round(V - totalRecebido)),
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
