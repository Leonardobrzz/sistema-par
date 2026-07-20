const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');

const router = express.Router();
router.use(authMiddleware);

const pBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0;

router.get('/', async (req, res, next) => {
  try {
    const [planejamentos, medicoesTabela] = await Promise.all([
      db.readSheet('Planejamentos'),
      db.readSheet('Medicoes'),
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

    // ── Mapa idProjeto → setor ────────────────────────────────────────────
    const setorPorProjeto = {};
    aprovados.forEach(p => { setorPorProjeto[p.ID_Projeto] = p.Setor || 'Outros'; });
    // inclui projetos sem planejamento aprovado (medições avulsas)
    medicoesTabela.forEach(m => {
      if (!setorPorProjeto[m.ID_Projeto]) setorPorProjeto[m.ID_Projeto] = m.Setor || 'Outros';
    });

    // ── Receita mensal — últimos 18 meses ─────────────────────────────────
    const hoje = new Date();
    const meses = [];
    for (let i = 17; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const SETORES_LIST = ['Arquitetura','Infraestrutura','Saneamento'];
    const recebidoPorMes = Object.fromEntries(meses.map(m => [m, 0]));
    const previsaoPorMes = Object.fromEntries(meses.map(m => [m, 0]));
    const recebidoPorMesSetor = Object.fromEntries(meses.map(m => [m, {}]));
    const previsaoPorMesSetor = Object.fromEntries(meses.map(m => [m, {}]));

    todasMedicoes.forEach(m => {
      const setor = setorPorProjeto[m.idProjeto] || 'Outros';
      if (m.statusFinanceiro === 'Recebido' && m.dataRecebimento) {
        const mes = m.dataRecebimento.slice(0, 7);
        if (recebidoPorMes[mes] !== undefined) {
          recebidoPorMes[mes] += m.valor;
          recebidoPorMesSetor[mes][setor] = (recebidoPorMesSetor[mes][setor] || 0) + m.valor;
        }
      } else if (m.statusFinanceiro !== 'Recebido' && m.dataPrevisao) {
        const mes = m.dataPrevisao.slice(0, 7);
        if (previsaoPorMes[mes] !== undefined) {
          previsaoPorMes[mes] += m.valor;
          previsaoPorMesSetor[mes][setor] = (previsaoPorMesSetor[mes][setor] || 0) + m.valor;
        }
      }
    });

    const receitaMensal = meses.map(mes => ({
      mes,
      recebido: Math.round(recebidoPorMes[mes]),
      previsto:  Math.round(previsaoPorMes[mes]),
      porSetor: SETORES_LIST.reduce((acc, s) => {
        acc[s] = {
          recebido: Math.round(recebidoPorMesSetor[mes][s] || 0),
          previsto:  Math.round(previsaoPorMesSetor[mes][s] || 0),
        };
        return acc;
      }, {}),
    }));

    // ── Fluxo de caixa: próximos 6 meses ─────────────────────────────────
    const d6m = new Date(hoje.getFullYear(), hoje.getMonth() + 6, hoje.getDate());
    const fluxo90 = {};
    todasMedicoes
      .filter(m => m.statusFinanceiro !== 'Recebido' && m.dataPrevisao)
      .forEach(m => {
        const dt = new Date(m.dataPrevisao);
        if (dt >= hoje && dt <= d6m) {
          const mes = m.dataPrevisao.slice(0, 7);
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
    const totalRecebido  = todasMedicoes.filter(m => m.statusFinanceiro === 'Recebido').reduce((s, m) => s + m.valor, 0);
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
      const recebido = todasMedicoes
        .filter(m => m.idProjeto === plan.ID_Projeto && m.statusFinanceiro === 'Recebido')
        .reduce((s, m) => s + m.valor, 0);

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
      carteira: Math.round(s.carteira),
      lucro:    Math.round(s.lucro),
      margemMedia: s.carteira > 0 ? parseFloat((s.lucro / s.carteira * 100).toFixed(1)) : 0,
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
