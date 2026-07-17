const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');

const router = express.Router();
router.use(authMiddleware);

const pBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0;

// GET /api/dashboard-financeiro — dados consolidados para o painel financeiro
router.get('/', async (req, res, next) => {
  try {
    const [projetos, planejamentos, medicoes] = await Promise.all([
      db.readSheet('Projetos_Contratos'),
      db.readSheet('Planejamentos'),
      db.readSheet('Medicoes'),
    ]);

    const aprovados = planejamentos.filter(p => p.Status === 'Aprovado');

    // ── Receita vs Despesa por mês (últimos 18 meses) ─────────────────────
    const hoje = new Date();
    const meses = [];
    for (let i = 17; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const recebidoPorMes = {};
    const previsaoPorMes = {};
    meses.forEach(m => { recebidoPorMes[m] = 0; previsaoPorMes[m] = 0; });

    medicoes.forEach(m => {
      const valor = pBR(m.Valor);
      if (m.Status_Financeiro === 'Recebido' && m.Data_Recebimento) {
        const mes = m.Data_Recebimento.slice(0, 7);
        if (recebidoPorMes[mes] !== undefined) recebidoPorMes[mes] += valor;
      }
      if (m.Status_Financeiro !== 'Recebido' && m.Data_Previsao) {
        const mes = m.Data_Previsao.slice(0, 7);
        if (previsaoPorMes[mes] !== undefined) previsaoPorMes[mes] += valor;
      }
    });

    const receitaMensal = meses.map(mes => ({
      mes,
      recebido: Math.round(recebidoPorMes[mes]),
      previsto: Math.round(previsaoPorMes[mes]),
    }));

    // ── Rentabilidade por projeto (aprovados) ──────────────────────────────
    const rentabilidade = aprovados.map(plan => {
      let dados = {};
      try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}
      const d = dados._baseline || dados;
      const V = pBR(d.valorContrato || plan.Valor_Contrato);
      const ip = Math.max(pBR(d.impostosPerc) || 20, 16.33);
      const ta = Math.max(pBR(d.taxaAdmPerc) || 12, 5);
      const co = 7.5;
      const recLiq = V * (1 - (ip + ta + co) / 100);
      const totalTercs = (d.terceirizados || []).reduce((s, t) => s + pBR(t.custo), 0);
      const totalEq = (d.equipe || []).reduce((s, e) => s + pBR(e.horas) * (pBR(e.mediaHora) || 36.4), 0);
      const totalDesp = (d.despesas || []).reduce((s, x) => s + pBR(x.valor), 0);
      const totalDespInt = (d.despesasInternas || []).reduce((s, x) => s + pBR(x.custo), 0);
      const lucro = recLiq - totalTercs - totalEq - totalDesp - totalDespInt;
      const margem = V > 0 ? (lucro / V) * 100 : 0;

      // Medições recebidas desse projeto
      const medProj = medicoes.filter(m => m.ID_Projeto === plan.ID_Projeto && m.Status_Financeiro === 'Recebido');
      const recebido = medProj.reduce((s, m) => s + pBR(m.Valor), 0);

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

    // ── Fluxo de caixa: próximos 90 dias ──────────────────────────────────
    const d90 = new Date(); d90.setDate(d90.getDate() + 90);
    const fluxo90 = {};
    medicoes
      .filter(m => m.Status_Financeiro !== 'Recebido' && m.Data_Previsao)
      .forEach(m => {
        const dt = new Date(m.Data_Previsao);
        if (dt <= d90) {
          const mes = m.Data_Previsao.slice(0, 7);
          if (!fluxo90[mes]) fluxo90[mes] = { mes, valor: 0, qtd: 0 };
          fluxo90[mes].valor += pBR(m.Valor);
          fluxo90[mes].qtd++;
        }
      });
    const fluxoCaixa90 = Object.values(fluxo90).sort((a, b) => a.mes.localeCompare(b.mes))
      .map(f => ({ ...f, valor: Math.round(f.valor) }));

    // ── Aging de recebíveis ────────────────────────────────────────────────
    const aging = { ate30: 0, de31a60: 0, de61a90: 0, acima90: 0, total: 0 };
    medicoes
      .filter(m => m.Status_Financeiro !== 'Recebido' && m.Data_Previsao && new Date(m.Data_Previsao) < hoje)
      .forEach(m => {
        const diff = Math.floor((hoje - new Date(m.Data_Previsao)) / 86400000);
        const v = pBR(m.Valor);
        aging.total += v;
        if (diff <= 30)       aging.ate30   += v;
        else if (diff <= 60)  aging.de31a60 += v;
        else if (diff <= 90)  aging.de61a90 += v;
        else                  aging.acima90 += v;
      });
    Object.keys(aging).forEach(k => { aging[k] = Math.round(aging[k]); });

    // ── KPIs rápidos ──────────────────────────────────────────────────────
    const totalCarteira = aprovados.reduce((s, p) => s + pBR(p.Valor_Contrato), 0);
    const totalRecebido = medicoes.filter(m => m.Status_Financeiro === 'Recebido').reduce((s, m) => s + pBR(m.Valor), 0);
    const totalAReceber = medicoes.filter(m => m.Status_Financeiro !== 'Recebido').reduce((s, m) => s + pBR(m.Valor), 0);
    const totalAtrasado = medicoes.filter(m => m.Status_Financeiro !== 'Recebido' && m.Data_Previsao && new Date(m.Data_Previsao) < hoje).reduce((s, m) => s + pBR(m.Valor), 0);

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
      lucro: Math.round(s.lucro),
      margemMedia: s.carteira > 0 ? parseFloat((s.lucro / s.carteira * 100).toFixed(1)) : 0,
    }));

    res.json({
      kpis: {
        totalCarteira: Math.round(totalCarteira),
        totalRecebido: Math.round(totalRecebido),
        totalAReceber: Math.round(totalAReceber),
        totalAtrasado: Math.round(totalAtrasado),
        qtdAprovados: aprovados.length,
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
