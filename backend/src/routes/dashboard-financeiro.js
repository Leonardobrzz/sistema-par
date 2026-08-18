const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');

const router = express.Router();
router.use(authMiddleware);

const pBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0;

// Normaliza qualquer formato de data para YYYY-MM (para agrupamento mensal)
// Suporta: YYYY-MM-DD, DD/MM/YYYY, MM/YYYY, YYYY-MM
function mesYM(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);           // YYYY-MM-DD ou YYYY-MM
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return `${s.slice(6,10)}-${s.slice(3,5)}`; // DD/MM/YYYY
  if (/^\d{2}\/\d{4}/.test(s)) return `${s.slice(3,7)}-${s.slice(0,2)}`;         // MM/YYYY
  return null;
}

// Busca contas-receber do OPP (receitas liquidadas e pendentes)
async function fetchOppReceitas() {
  try {
    const { oppRequest } = require('../services/oppService');
    let offset = 0, todos = [];
    while (true) {
      const r = await oppRequest('GET', `/contas-receber?limit=250&offset=${offset}`);
      const lista = Array.isArray(r) ? r : (r?.data || []);
      if (lista.length === 0) break;
      todos.push(...lista);
      if (lista.length < 250) break;
      offset += 250;
    }
    return todos;
  } catch { return []; }
}

router.get('/', async (req, res, next) => {
  try {
    const [planejamentos, medicoesTabela, oppReceitas] = await Promise.all([
      db.readSheet('Planejamentos'),
      db.readSheet('Medicoes'),
      fetchOppReceitas(),
    ]);

    const aprovados = planejamentos.filter(p => p.Status === 'Aprovado');

    // ── Medições reais da tabela indexadas por projeto ─────────────────────
    const medTabPorProjeto = {};
    medicoesTabela.forEach(m => {
      if (!medTabPorProjeto[m.ID_Projeto]) medTabPorProjeto[m.ID_Projeto] = [];
      medTabPorProjeto[m.ID_Projeto].push(m);
    });

    // ── Fonte unificada de medições (tabela tem prioridade; JSON como fallback) ──
    // Para cada projeto aprovado: usa medições da tabela se existirem, senão usa Dados_JSON
    const todasMedicoes = []; // { idProjeto, valor, dataPrevisao, dataRecebimento, statusFinanceiro }

    // 1. Medições reais da tabela (independente de planejamento aprovado)
    medicoesTabela.forEach(m => {
      todasMedicoes.push({
        idProjeto:       m.ID_Projeto,
        valor:           pBR(m.Valor),
        dataPrevisao:    m.Data_Previsao || '',
        dataRecebimento: m.Data_Recebimento || '',
        statusFinanceiro:m.Status_Financeiro || 'Pendente',
        fonte:           'tabela',
      });
    });

    // 2. Medições do Dados_JSON para projetos SEM medições na tabela
    const projetosComMedTabela = new Set(medicoesTabela.map(m => m.ID_Projeto));
    aprovados.forEach(plan => {
      if (projetosComMedTabela.has(plan.ID_Projeto)) return; // já tem na tabela
      let dados = {};
      try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}
      const d = dados._baseline || dados;
      const meds = d.medicoes || d.medicoesCronograma || [];
      meds.forEach(m => {
        todasMedicoes.push({
          idProjeto:       plan.ID_Projeto,
          valor:           pBR(m.valor),
          dataPrevisao:    m.dataPrevisao || m.dataPrevista || '',
          dataRecebimento: '',
          statusFinanceiro:'Pendente',
          fonte:           'json',
        });
      });
    });

    // ── Mapas de projeto: por idProjeto e por CC ─────────────────────────
    const setorPorProjeto = {};
    aprovados.forEach(p => { setorPorProjeto[p.ID_Projeto] = p.Setor || 'Outros'; });
    medicoesTabela.forEach(m => {
      if (!setorPorProjeto[m.ID_Projeto]) setorPorProjeto[m.ID_Projeto] = m.Setor || 'Outros';
    });

    // mapa ccNome → { setor, idProjeto } para receitas OPP
    const infoPorCC = {};
    aprovados.forEach(p => {
      if (p.Nr_Contrato_OS) infoPorCC[p.Nr_Contrato_OS.toLowerCase().trim()] = { setor: p.Setor || 'Outros', idProjeto: p.ID_Projeto };
    });
    function infoProjetoDeReceita(rec) {
      const cc = (rec.centro_custos_rec || rec.centro_custo || '').toLowerCase().trim();
      if (!cc) return null;
      if (infoPorCC[cc]) return infoPorCC[cc];
      for (const [k, v] of Object.entries(infoPorCC)) {
        if (cc.includes(k) || k.includes(cc)) return v;
      }
      return null;
    }

    // mapa idProjeto → totalRecebidoOPP (apenas liquidadas)
    const recebidoOPPPorProjeto = {};
    oppReceitas
      .filter(r => r.liquidado_rec === 'Sim')
      .forEach(r => {
        const info = infoProjetoDeReceita(r);
        if (!info) return;
        recebidoOPPPorProjeto[info.idProjeto] = (recebidoOPPPorProjeto[info.idProjeto] || 0) + parseFloat(r.valor_rec || 0);
      });

    function setorDaReceita(rec) {
      const info = infoProjetoDeReceita(rec);
      return info ? info.setor : 'Outros';
    }

    // ── Receita mensal — mês atual + próximos 12 meses (passado acumulado) ─
    const hoje = new Date();
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    // Janela completa: 12 passados + atual + 12 futuros (para calcular acumulado)
    const todosOsMeses = [];
    for (let i = 12; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      todosOsMeses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    for (let i = 1; i <= 12; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      todosOsMeses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    // Janela de exibição: apenas mês atual + 12 futuros
    const meses = todosOsMeses.filter(m => m >= mesAtual);

    const recebidoPorMes    = Object.fromEntries(todosOsMeses.map(m => [m, 0]));
    const aReceberPorMesMap = Object.fromEntries(todosOsMeses.map(m => [m, 0]));
    const aPagePorMesMap    = Object.fromEntries(todosOsMeses.map(m => [m, 0]));

    // Mapa idProjeto → custos absolutos do planejamento
    const custosPorProjeto = {};
    aprovados.forEach(plan => {
      let dados = {};
      try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}
      const d = dados._baseline || dados;
      const V   = pBR(d.valorContrato || plan.Valor_Contrato);
      const imp = Math.max(pBR(d.impostosPerc) || 20, 16.33);
      const ta  = Math.max(pBR(d.taxaAdmPerc)  || 12, 5);
      const co  = 7.5;
      const deducoes = V * (imp + ta + co) / 100;
      const terc  = (d.terceirizados  || []).reduce((s, t) => s + pBR(t.custo),  0);
      const desp  = (d.despesas       || []).reduce((s, x) => s + pBR(x.valor),  0);
      const despInt = (d.despesasInternas || []).reduce((s, x) => s + pBR(x.custo), 0);
      custosPorProjeto[plan.ID_Projeto] = {
        V,
        totalCusto: deducoes + terc + desp + despInt,
      };
    });

    // Recebidos = medições com Status_Financeiro = 'Recebido' (Data_Recebimento ou Data_Previsao)
    medicoesTabela
      .filter(m => m.Status_Financeiro === 'Recebido')
      .forEach(m => {
        const dataRef = m.Data_Recebimento || m.Data_Previsao;
        const mes = mesYM(dataRef);
        const valor = pBR(m.Valor);
        if (mes && recebidoPorMes[mes] !== undefined) recebidoPorMes[mes] += valor;
      });

    // A Receber = medições pendentes agrupadas por Data_Previsao
    // A Pagar   = proporção do custo total do projeto (deduções + terc + equipe + despesas)
    //             distribuída pela participação de cada medição no valor total do contrato
    todasMedicoes.forEach(m => {
      if (m.statusFinanceiro === 'Recebido' || !m.dataPrevisao) return;
      const mes = mesYM(m.dataPrevisao);
      if (!mes || aReceberPorMesMap[mes] === undefined) return;
      aReceberPorMesMap[mes] += m.valor;
      const proj = custosPorProjeto[m.idProjeto];
      if (proj && proj.V > 0) {
        // proporção desta medição no contrato × custo total planejado
        aPagePorMesMap[mes] += (m.valor / proj.V) * proj.totalCusto;
      } else {
        aPagePorMesMap[mes] += m.valor * 0.355; // fallback ~35.5%
      }
    });

    // Acumula tudo antes do mês atual no primeiro ponto (mês atual)
    const mesesPassados = todosOsMeses.filter(m => m < mesAtual);
    const acumRecebido  = mesesPassados.reduce((s, m) => s + recebidoPorMes[m], 0);
    const acumAReceber  = mesesPassados.reduce((s, m) => s + aReceberPorMesMap[m], 0);
    const acumAPagar    = mesesPassados.reduce((s, m) => s + aPagePorMesMap[m], 0);

    const receitaMensal = meses.map((mes, idx) => ({
      mes,
      recebido:  Math.round(recebidoPorMes[mes] + (idx === 0 ? acumRecebido : 0)),
      aReceber:  Math.round(aReceberPorMesMap[mes] + (idx === 0 ? acumAReceber : 0)),
      aPagar:    Math.round(aPagePorMesMap[mes] + (idx === 0 ? acumAPagar : 0)),
      isFuture:  mes > mesAtual,
    }));

    // ── Fluxo de caixa: próximos 6 meses ─────────────────────────────────
    const d6m = new Date(hoje.getFullYear(), hoje.getMonth() + 6, hoje.getDate());
    const fluxo90 = {};
    todasMedicoes
      .filter(m => m.statusFinanceiro !== 'Recebido' && m.dataPrevisao)
      .forEach(m => {
        const dt = new Date(m.dataPrevisao);
        if (dt >= hoje && dt <= d6m) {
          const mes = mesYM(m.dataPrevisao);
          const setor = setorPorProjeto[m.idProjeto] || 'Outros';
          if (!fluxo90[mes]) fluxo90[mes] = { mes, valor: 0, qtd: 0, porSetor: {} };
          fluxo90[mes].valor += m.valor;
          fluxo90[mes].qtd++;
          fluxo90[mes].porSetor[setor] = (fluxo90[mes].porSetor[setor] || 0) + m.valor;
        }
      });
    const fluxoCaixa90 = Object.values(fluxo90)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map(f => ({
        ...f,
        valor: Math.round(f.valor),
        porSetor: Object.fromEntries(Object.entries(f.porSetor).map(([k,v]) => [k, Math.round(v)])),
      }));

    // ── Aging de recebíveis (só medições vencidas não recebidas) ──────────
    const aging = { ate30: 0, de31a60: 0, de61a90: 0, acima90: 0, total: 0 };
    todasMedicoes
      .filter(m => m.statusFinanceiro !== 'Recebido' && m.dataPrevisao && new Date(m.dataPrevisao) < hoje)
      .forEach(m => {
        const diff = Math.floor((hoje - new Date(m.dataPrevisao)) / 86400000);
        aging.total += m.valor;
        if (diff <= 30)      aging.ate30   += m.valor;
        else if (diff <= 60) aging.de31a60 += m.valor;
        else if (diff <= 90) aging.de61a90 += m.valor;
        else                 aging.acima90 += m.valor;
      });
    Object.keys(aging).forEach(k => { aging[k] = Math.round(aging[k]); });

    // ── KPIs ──────────────────────────────────────────────────────────────
    const totalCarteira  = aprovados.reduce((s, p) => s + pBR(p.Valor_Contrato), 0);
    const totalRecebido  = medicoesTabela
      .filter(m => m.Status_Financeiro === 'Recebido')
      .reduce((s, m) => s + pBR(m.Valor), 0);
    const totalAReceber  = todasMedicoes.filter(m => m.statusFinanceiro !== 'Recebido').reduce((s, m) => s + m.valor, 0);
    const totalAtrasado  = aging.total;

    // ── Rentabilidade por projeto ──────────────────────────────────────────
    const rentabilidade = aprovados.map(plan => {
      let dados = {};
      try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}
      const d = dados._baseline || dados;
      const V  = pBR(d.valorContrato || plan.Valor_Contrato);
      const ip = Math.max(pBR(d.impostosPerc) || 20, 16.33);
      const ta = Math.max(pBR(d.taxaAdmPerc)  || 12, 5);
      const co = 7.5;
      const recLiq       = V * (1 - (ip + ta + co) / 100);
      const totalTercs   = (d.terceirizados   || []).reduce((s, t) => s + pBR(t.custo), 0);
      const totalEq      = (d.equipe          || []).reduce((s, e) => s + pBR(e.horas) * (pBR(e.mediaHora) || 36.4), 0);
      const totalDesp    = (d.despesas        || []).reduce((s, x) => s + pBR(x.valor), 0);
      const totalDespInt = (d.despesasInternas|| []).reduce((s, x) => s + pBR(x.custo), 0);
      const lucro   = recLiq - totalTercs - totalEq - totalDesp - totalDespInt;
      const margem  = V > 0 ? (lucro / V) * 100 : 0;
      const recebido = medicoesTabela
        .filter(m => m.ID_Projeto === plan.ID_Projeto && m.Status_Financeiro === 'Recebido')
        .reduce((s, m) => s + pBR(m.Valor), 0);

      return {
        id: plan.ID_Projeto,
        nome: plan.Nome_Projeto,
        setor: plan.Setor,
        valorContrato: Math.round(V),
        lucroEstimado: Math.round(lucro),
        margemPerc: parseFloat(margem.toFixed(1)),
        recebido: Math.round(recebido),
        percRecebido: V > 0 ? parseFloat((recebido / V * 100).toFixed(1)) : 0,
      };
    }).sort((a, b) => b.valorContrato - a.valorContrato);

    // ── Recebido/aReceber/atrasado por setor ──────────────────────────────
    const recebidoPorSetor = {};
    rentabilidade.forEach(r => {
      const s = r.setor || 'Outros';
      recebidoPorSetor[s] = (recebidoPorSetor[s] || 0) + r.recebido;
    });
    const aReceberPorSetor = {};
    const atrasadoPorSetor = {};
    todasMedicoes.forEach(m => {
      const s = setorPorProjeto[m.idProjeto] || 'Outros';
      if (m.statusFinanceiro !== 'Recebido') {
        aReceberPorSetor[s] = (aReceberPorSetor[s] || 0) + m.valor;
        if (m.dataPrevisao && new Date(m.dataPrevisao) < hoje) {
          atrasadoPorSetor[s] = (atrasadoPorSetor[s] || 0) + m.valor;
        }
      }
    });

    // ── Rentabilidade por setor ────────────────────────────────────────────
    const porSetor = {};
    rentabilidade.forEach(r => {
      const s = r.setor || 'Outros';
      if (!porSetor[s]) porSetor[s] = { setor: s, qtd: 0, carteira: 0, lucro: 0 };
      porSetor[s].qtd++;
      porSetor[s].carteira += r.valorContrato;
      porSetor[s].lucro    += r.lucroEstimado;
    });
    const setores = Object.values(porSetor).map(s => ({
      ...s,
      carteira:    Math.round(s.carteira),
      lucro:       Math.round(s.lucro),
      margemMedia: s.carteira > 0 ? parseFloat((s.lucro / s.carteira * 100).toFixed(1)) : 0,
      totalRecebido:  Math.round(recebidoPorSetor[s.setor] || 0),
      totalAReceber:  Math.round(aReceberPorSetor[s.setor] || 0),
      totalAtrasado:  Math.round(atrasadoPorSetor[s.setor] || 0),
    }));

    res.json({
      kpis: {
        totalCarteira:  Math.round(totalCarteira),
        totalRecebido:  Math.round(totalRecebido),
        totalAReceber:  Math.round(totalAReceber),
        totalAtrasado:  Math.round(totalAtrasado),
        qtdAprovados:   aprovados.length,
      },
      receitaMensal,
      fluxoCaixa90,
      aging,
      rentabilidade: rentabilidade.slice(0, 30),
      setores,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
