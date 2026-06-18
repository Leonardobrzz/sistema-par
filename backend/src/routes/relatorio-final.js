const express = require('express');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/relatorio-final/:idProjeto — consolida fechamento do projeto
router.get('/:idProjeto', async (req, res, next) => {
  try {
    const { idProjeto } = req.params;

    const [projeto, plan, medicoes, terceirizados, logHoras, alertas] = await Promise.all([
      db.findOne('Projetos_Contratos', (p) => p.ID_Projeto === idProjeto),
      db.findOne('Planejamentos', (p) => p.ID_Projeto === idProjeto),
      db.findRows('Medicoes', (m) => m.ID_Projeto === idProjeto),
      db.findRows('Terceirizados', (t) => t.ID_Projeto === idProjeto && t.Status !== 'Cancelado'),
      db.findRows('Log_Horas', (l) => l.ID_Projeto === idProjeto),
      db.findRows('Alertas', (a) => a.ID_Projeto === idProjeto),
    ]);

    if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado.' });

    let dadosPlan = {};
    let baseline = null;
    let historicoBaselines = [];
    try {
      dadosPlan = JSON.parse(plan?.Dados_JSON || '{}');
      baseline = dadosPlan._baseline || null;
      historicoBaselines = dadosPlan._historicoBaselines || [];
    } catch {}

    const V = parseFloat(dadosPlan.valorContrato || plan?.Valor_Contrato || 0);
    const ip = Math.max(parseFloat(dadosPlan.impostosPerc || 20), 16.33);
    const ta = Math.max(parseFloat(dadosPlan.taxaAdmPerc || 12), 5);
    const co = 7.5;
    const totalDevolutivas = V * (ip + ta + co) / 100;
    const receitaLiquida = V - totalDevolutivas;

    // ── Financeiro Planejado (baseline) ──────────────────────────────────────
    const custoEquipePlanejado = (dadosPlan.equipe || []).reduce((s, e) => {
      return s + parseFloat(e.horas || 0) * parseFloat(e.mediaHora || 36.40);
    }, 0);
    const custoTerceirosPlanejado = (dadosPlan.terceirizados || []).reduce((s, t) => s + parseFloat(t.custo || 0), 0);
    const despesasPlanejadas = (dadosPlan.despesas || []).reduce((s, d) => s + parseFloat(d.valor || 0), 0);
    const custoTotalPlanejado = custoEquipePlanejado + custoTerceirosPlanejado + despesasPlanejadas;
    const lucroPlanejado = receitaLiquida - custoTotalPlanejado;
    const lucroPercPlanejado = V > 0 ? (lucroPlanejado / V) * 100 : 0;

    // ── Financeiro Real ───────────────────────────────────────────────────────
    const totalRecebido = medicoes
      .filter(m => m.Status_Financeiro === 'Recebido')
      .reduce((s, m) => s + parseFloat(m.Valor || 0), 0);
    const totalFaturado = medicoes
      .filter(m => ['Faturado', 'Recebido'].includes(m.Status_Financeiro))
      .reduce((s, m) => s + parseFloat(m.Valor || 0), 0);

    const custoTerceirosReal = terceirizados.reduce((s, t) => s + parseFloat(t.Valor_Pago || t.Valor_Contratado || 0), 0);
    const horasRastreadas = logHoras.reduce((s, l) => s + parseFloat(l.Horas_Logadas || 0), 0);
    const custoEquipeReal = horasRastreadas * 36.40;
    const custoTotalReal = custoEquipeReal + custoTerceirosReal;
    const lucroReal = totalRecebido - totalDevolutivas - custoTotalReal;
    const lucroPercReal = totalRecebido > 0 ? (lucroReal / totalRecebido) * 100 : 0;

    // ── Horas: planejado vs real ──────────────────────────────────────────────
    const horasPlanejadas = baseline?.totalHorasEstimadas ||
      (dadosPlan.equipe || []).reduce((s, e) => s + parseFloat(e.horas || 0), 0);

    // ── Medições: status completo ─────────────────────────────────────────────
    const medicoesRecebidas = medicoes.filter(m => m.Status_Financeiro === 'Recebido').length;
    const medicoesPendentes = medicoes.filter(m => !['Recebido'].includes(m.Status_Financeiro)).length;
    const medicoesAtrasadas = medicoes.filter(m =>
      m.Status_Financeiro !== 'Recebido' && m.Data_Previsao && new Date(m.Data_Previsao) < new Date()
    ).length;

    // ── Desvios principais ───────────────────────────────────────────────────
    const desvioHoras = horasRastreadas - horasPlanejadas;
    const desvioHorasPerc = horasPlanejadas > 0 ? (desvioHoras / horasPlanejadas) * 100 : 0;
    const desvioLucro = lucroReal - lucroPlanejado;
    const desvioLucroPerc = lucroPlanejado !== 0 ? (desvioLucro / Math.abs(lucroPlanejado)) * 100 : 0;

    // ── Alertas históricos ────────────────────────────────────────────────────
    const alertasHistorico = alertas.map(a => ({
      tipo: a.Tipo_Alerta,
      nivel: a.Nivel,
      mensagem: a.Mensagem,
      data: a.Data_Geracao,
      status: a.Status,
    }));

    // ── Terceirizados breakdown ───────────────────────────────────────────────
    const terceirizadosBreakdown = terceirizados.map(t => ({
      fornecedor: t.Fornecedor || t.Nome_Fornecedor || '—',
      descricao: t.Descricao || t.Servico || '—',
      valorContratado: parseFloat(t.Valor_Contratado || 0),
      valorPago: parseFloat(t.Valor_Pago || 0),
      status: t.Status,
      vinculo: t.Vinculo_Contrato || t.vinculo || '—',
    }));

    // ── Horas por colaborador ─────────────────────────────────────────────────
    const horasPorColab = {};
    for (const l of logHoras) {
      const nome = l.Colaborador || 'Desconhecido';
      if (!horasPorColab[nome]) horasPorColab[nome] = 0;
      horasPorColab[nome] += parseFloat(l.Horas_Logadas || 0);
    }

    res.json({
      projeto: {
        id: projeto.ID_Projeto,
        nome: projeto.Nome,
        cliente: projeto.Cliente,
        status: projeto.Status,
        nrContrato: projeto.Nr_Contrato,
        setor: projeto.Setor,
        dataInicio: projeto.Data_Inicio,
        dataEntregaContrato: projeto.Data_Entrega_Contrato,
        dataEntregaReal: projeto.Data_Entrega_Real || null,
      },
      baseline: baseline ? {
        travadoEm: baseline.travadoEm,
        travadoPor: baseline.travadoPor,
        versao: baseline.versao || 1,
      } : null,
      historicoBaselines: historicoBaselines.map(b => ({
        versao: b.versao,
        travadoEm: b.travadoEm,
        travadoPor: b.travadoPor,
      })),

      // Financeiro comparativo
      financeiro: {
        valorContrato: V,
        totalDevolutivas,
        receitaLiquida,
        planejado: {
          custoEquipe: custoEquipePlanejado,
          custoTerceiros: custoTerceirosPlanejado,
          despesas: despesasPlanejadas,
          custoTotal: custoTotalPlanejado,
          lucro: lucroPlanejado,
          lucroPerc: lucroPercPlanejado,
        },
        real: {
          totalRecebido,
          totalFaturado,
          custoEquipe: custoEquipeReal,
          custoTerceiros: custoTerceirosReal,
          custoTotal: custoTotalReal,
          lucro: lucroReal,
          lucroPerc: lucroPercReal,
        },
        desvios: {
          lucro: desvioLucro,
          lucroPerc: desvioLucroPerc,
        },
      },

      // Horas
      horas: {
        planejadas: horasPlanejadas,
        rastreadas: horasRastreadas,
        desvio: desvioHoras,
        desvioPerc: desvioHorasPerc,
        porColaborador: Object.entries(horasPorColab).map(([nome, horas]) => ({ nome, horas })),
      },

      // Medições
      medicoes: {
        total: medicoes.length,
        recebidas: medicoesRecebidas,
        pendentes: medicoesPendentes,
        atrasadas: medicoesAtrasadas,
        lista: medicoes.map(m => ({
          etapa: m.Etapa,
          percentual: m.Percentual,
          valor: parseFloat(m.Valor || 0),
          statusFisico: m.Status_Fisico,
          statusFinanceiro: m.Status_Financeiro,
          dataPrevisao: m.Data_Previsao,
          dataRealizacao: m.Data_Realizacao,
          nrNF: m.Nr_NF,
          oc: m.OC || '',
          nrOsOpp: m.Nr_OS_OPP || '',
        })),
      },

      // Terceirizados
      terceirizados: {
        total: terceirizados.length,
        custoContratado: terceirizados.reduce((s, t) => s + parseFloat(t.Valor_Contratado || 0), 0),
        custoPago: custoTerceirosReal,
        percContrato: V > 0 ? (custoTerceirosReal / V) * 100 : 0,
        lista: terceirizadosBreakdown,
      },

      // Alertas históricos
      alertasHistorico,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
