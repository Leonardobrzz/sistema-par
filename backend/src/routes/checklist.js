const express = require('express');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Campos críticos que todo projeto real deve ter
const CAMPOS_CRITICOS = [
  { campo: 'Setor',                 label: 'Setor',                tipo: 'texto' },
  { campo: 'Cliente',               label: 'Cliente',              tipo: 'texto' },
  { campo: 'Valor_Global',          label: 'Valor do Contrato',    tipo: 'numero' },
  { campo: 'Data_Entrega_Contrato', label: 'Data de Entrega',      tipo: 'data' },
  { campo: 'Nr_Contrato',           label: 'Número do Contrato',   tipo: 'texto' },
  { campo: 'Centro_Custo_OPP',      label: 'Centro de Custo',      tipo: 'texto' },
];

const isProjetoReal = (p) =>
  parseFloat(p.Valor_Global || 0) > 0 || (p.Nr_Contrato && String(p.Nr_Contrato).trim() !== '');

const isEmpty = (val, tipo) => {
  if (tipo === 'numero') return !val || parseFloat(val) === 0;
  return !val || String(val).trim() === '';
};

// GET /api/checklist — lista projetos com campos faltando
router.get('/', async (req, res, next) => {
  try {
    const [projects, planejamentos, medicoes, logHoras] = await Promise.all([
      db.readSheet('Projetos_Contratos'),
      db.readSheet('Planejamentos'),
      db.readSheet('Medicoes'),
      db.readSheet('Log_Horas'),
    ]);

    const planMap = {};
    for (const pl of planejamentos) planMap[pl.ID_Projeto] = pl;

    const statusAtivos = ['Em Andamento', 'Em Andamento (Atrasado)', 'A Planejar', 'Paralisado', 'Aguardando Aprovação', 'Aguardando Cliente'];

    const result = [];

    for (const p of projects) {
      // Só projetos reais e ativos
      if (!isProjetoReal(p)) continue;
      if (!statusAtivos.includes(p.Status)) continue;

      const camposFaltando = CAMPOS_CRITICOS
        .filter(c => isEmpty(p[c.campo], c.tipo))
        .map(c => c.label);

      const plan = planMap[p.ID_Projeto];
      const problemasPlanejamento = [];
      if (!plan) {
        problemasPlanejamento.push('Sem planejamento financeiro');
      } else if (plan.Status === 'Rascunho') {
        problemasPlanejamento.push('Planejamento em Rascunho (não submetido)');
      } else if (plan.Status === 'Pendente Aprovação') {
        problemasPlanejamento.push('Aguardando aprovação da diretoria');
      }

      // Verifica medições sem O.C.
      const medsProj = medicoes.filter(m => m.ID_Projeto === p.ID_Projeto);
      const medsSemOC = medsProj.filter(m => !m.OC || String(m.OC).trim() === '').length;

      // Verifica horas sem profissional definido
      const horasSemProfissional = logHoras.filter(l => l.ID_Projeto === p.ID_Projeto && (!l.Colaborador || String(l.Colaborador).trim() === '')).length;

      // Vínculo com o OPP (cliente/centro de custo) — só importa pra quem já
      // tem o planejamento financeiro Aprovado, porque é esse vínculo que o
      // motor de O.S./NF (medicoesService.js) usa pra achar o Recebido real
      // de cada projeto no Dashboard Financeiro e nas Medições. Descoberto
      // na prática: 28 dos 61 projetos aprovados estavam sem ID_OPP_Cliente,
      // e 1 (sem cliente E sem centro de custo) nunca ia mostrar Recebido
      // nenhum, mesmo que já tivesse sido pago no OPP — só achamos isso
      // rodando script manual. Esse checklist agora pega isso sozinho.
      const problemasVinculoOPP = [];
      if (plan && plan.Status === 'Aprovado') {
        const temClienteOPP = !!(p.ID_OPP_Cliente && String(p.ID_OPP_Cliente).trim());
        const temCentroCusto = !!(plan.ID_Centro_Custo_OPP && String(plan.ID_Centro_Custo_OPP).trim());
        if (!temClienteOPP && !temCentroCusto) {
          problemasVinculoOPP.push('Aprovado sem NENHUM vínculo com o OPP (nem cliente, nem centro de custo) — Recebido nunca vai aparecer aqui, mesmo se já tiver sido pago no OPP');
        } else if (!temClienteOPP) {
          problemasVinculoOPP.push('Aprovado sem ID_OPP_Cliente (só tem centro de custo) — motor de O.S./NF não tem uma 2ª via de casamento pra esse projeto');
        }
      }

      const totalProblemas = camposFaltando.length + problemasPlanejamento.length + (medsSemOC > 0 ? 1 : 0) + (horasSemProfissional > 0 ? 1 : 0) + problemasVinculoOPP.length;

      if (totalProblemas === 0) continue;

      result.push({
        id: p.ID_Projeto,
        nome: p.Nome,
        cliente: p.Cliente || '—',
        setor: p.Setor || '—',
        status: p.Status,
        valorGlobal: parseFloat(p.Valor_Global || 0),
        camposFaltando,
        problemasPlanejamento,
        medsSemOC,
        horasSemProfissional,
        problemasVinculoOPP,
        totalProblemas,
        statusPlanejamento: plan?.Status || null,
        linkClickUp: p.ID_ClickUp
          ? `https://app.clickup.com/${process.env.CLICKUP_TEAM_ID}/v/li/${p.ID_ClickUp}`
          : null,
      });
    }

    // Ordena: mais problemas primeiro
    result.sort((a, b) => b.totalProblemas - a.totalProblemas);

    const stats = {
      total: result.length,
      semSetor: result.filter(r => r.camposFaltando.includes('Setor')).length,
      semPlanejamento: result.filter(r => r.problemasPlanejamento.some(p => p.includes('Sem planejamento'))).length,
      medsSemOC: result.filter(r => r.medsSemOC > 0).length,
      semDataEntrega: result.filter(r => r.camposFaltando.includes('Data de Entrega')).length,
      semVinculoOPP: result.filter(r => r.problemasVinculoOPP.length > 0).length,
    };

    res.json({ projetos: result, stats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
