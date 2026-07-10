const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');
const { authMiddleware } = require('../middleware/auth');

// ── Constantes hardcoded PAR (Metodologia Jota Barros) ───────────────────────
const MARGEM_MINIMA_PERC      = 23;    // ⚠️ HARDCODE — nunca pode ser menor
const TETO_TERCEIROS_PERC     = 25;    // ⚠️ Limite sem bypass de diretoria
const TETO_CUSTO_PRODUCAO     = 30;    // ⚠️ Equipe Interna + Terceirizados ≤ 30%
const CUSTO_HORA_INTERNA      = 36.40; // R$/hora — equipe técnica interna
const MAX_HORAS_TAREFA        = 16;    // horas — acima disso exige particionamento
const PRAZO_MAX_PLANEJAMENTO  = 7;     // dias — máximo para sair do status "A PLANEJAR"

const router = express.Router();
router.use(authMiddleware);

// Calcula os totais financeiros de um planejamento
// Aceita vírgula ou ponto como separador decimal (formato BR ou EN)
const parseBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0;

function calcularTotais(dados) {
  const V = parseBR(dados.valorContrato);

  // Taxas ajustáveis — com mínimos protegidos
  const ip = Math.max(parseFloat(dados.impostosPerc || 20), 16.33);  // min 16.33%
  const ta = Math.max(parseFloat(dados.taxaAdmPerc  || 12),  5);     // min 5%
  const co = 7.50;                                                     // FIXO — não ajustável

  const impostos = V * ip / 100;
  const taxaAdm  = V * ta / 100;
  const comissao = V * co / 100;
  const totalDevolutivas = impostos + taxaAdm + comissao;
  const receitaLiquida = V - totalDevolutivas;

  const medicoes       = dados.medicoes       || [];
  const terceirizados  = dados.terceirizados  || [];
  const equipe         = dados.equipe         || [];
  const despesas       = dados.despesas       || [];

  const totalMedicoes  = medicoes.reduce((s, m) => s + parseBR(m.valor), 0);
  const totalTerceiros = terceirizados.reduce((s, t) => s + parseBR(t.custo), 0);
  const totalEquipe    = equipe.reduce((s, e) => {
    const hh = parseBR(e.horas);
    const hr = parseBR(e.mediaHora) || CUSTO_HORA_INTERNA;
    return s + (hh * hr);
  }, 0);
  const totalDespesas  = despesas.reduce((s, d) => s + parseBR(d.valor), 0);
  const totalCustos    = totalTerceiros + totalEquipe + totalDespesas;

  // Custo de Produção = Equipe Interna + Terceirizados (sem despesas gerais)
  const custoProducao     = totalEquipe + totalTerceiros;
  const custoProducaoPerc = V > 0 ? (custoProducao / V) * 100 : 0;

  const lucroEstimado = receitaLiquida - totalCustos;
  const lucroPerc     = V > 0 ? (lucroEstimado / V) * 100 : 0;
  const breakEven     = totalCustos + totalDevolutivas;

  // ── Validações das regras PAR ────────────────────────────────────────────────
  const percTerceiros = V > 0 ? (totalTerceiros / V) * 100 : 0;

  // Teto terceirizados (25% hardcode)
  const terceirosUltrapassouTeto = percTerceiros > TETO_TERCEIROS_PERC;

  // Custo de produção (30% hardcode)
  const custoProducaoUltrapassou = custoProducaoPerc > TETO_CUSTO_PRODUCAO;

  // Margem mínima (23% hardcode)
  const margemAbaixoMinimo = lucroPerc < MARGEM_MINIMA_PERC;

  // Terceirizados sem vínculo com item do contrato
  const tercSemVinculo = terceirizados.filter(t => !t.vinculo || String(t.vinculo).trim() === '');

  return {
    V, ip, ta, co,
    impostos, taxaAdm, comissao, totalDevolutivas, receitaLiquida,
    totalMedicoes, totalTerceiros, totalEquipe, totalDespesas, totalCustos,
    custoProducao, custoProducaoPerc,
    lucroEstimado, lucroPerc, breakEven, percTerceiros,

    // Flags de validação PAR
    terceirosUltrapassouTeto,
    custoProducaoUltrapassou,
    margemAbaixoMinimo,
    tercSemVinculo: tercSemVinculo.length,

    // Nível de alerta terceiros
    alertaTerceiros: percTerceiros > TETO_TERCEIROS_PERC
      ? 'bloqueio'
      : percTerceiros >= 20 ? 'aviso' : null,

    // Limites para referência no frontend
    limites: {
      margemMinima: MARGEM_MINIMA_PERC,
      tetoTerceiros: TETO_TERCEIROS_PERC,
      tetoCustoProducao: TETO_CUSTO_PRODUCAO,
      custoHoraInterna: CUSTO_HORA_INTERNA,
    },
  };
}


// GET /api/planejamento — lista todos os planejamentos
router.get('/', async (req, res, next) => {
  try {
    const [planejamentos, projetos, terceirizados, ocs] = await Promise.all([
      db.readSheet('Planejamentos'),
      db.readSheet('Projetos_Contratos'),
      db.readSheet('Terceirizados'),
      db.readSheet('OrdensCompra_OPP'),
    ]);
    const projMap = Object.fromEntries(projetos.map(p => [p.ID_Projeto, p]));
    // Mapa ID_OC -> Valor_Total (apenas OCs não canceladas)
    const ocValorMap = {};
    for (const oc of ocs) {
      if ((oc.Situacao || '').toLowerCase() !== 'cancelado') {
        ocValorMap[String(oc.ID_OC)] = parseFloat(oc.Valor_Total || 0);
      }
    }
    // Soma dos valores de OC por projeto (via Terceirizados.OC)
    const valorOCPorProjeto = {};
    for (const t of terceirizados) {
      if (!t.ID_Projeto || !t.OC) continue;
      const val = ocValorMap[String(t.OC)];
      if (val > 0) {
        valorOCPorProjeto[t.ID_Projeto] = (valorOCPorProjeto[t.ID_Projeto] || 0) + val;
      }
    }

    const enriched = planejamentos.map(p => {
      const proj = projMap[p.ID_Projeto] || {};
      const valorContrato = parseFloat(p.Valor_Contrato || 0);
      const valorGlobal = parseFloat(proj.Valor_Global || 0);
      const valorOC = valorOCPorProjeto[p.ID_Projeto] || 0;
      // Prioridade: planejamento > Projetos_Contratos > soma das OCs no OPP
      const valorFinal = valorContrato > 0 ? valorContrato : valorGlobal > 0 ? valorGlobal : valorOC;
      return {
        ...p,
        Valor_Contrato: String(valorFinal),
      };
    });
    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// GET /api/planejamento/:id — detalhe de um planejamento
router.get('/:id', async (req, res, next) => {
  try {
    const plan = await db.findOne('Planejamentos', (p) => p.ID === req.params.id || p.ID_Projeto === req.params.id);
    if (!plan) return res.status(404).json({ error: 'Planejamento não encontrado.' });

    // Desserializa o JSON de dados completos
    let dadosCompletos = {};
    try { dadosCompletos = JSON.parse(plan.Dados_JSON || '{}'); } catch {}

    const totais = calcularTotais(dadosCompletos);

    res.json({ ...plan, dadosCompletos, totais });
  } catch (err) {
    next(err);
  }
});

// POST /api/planejamento — cria ou salva rascunho de planejamento
router.post('/', async (req, res, next) => {
  try {
    const dados = req.body;
    const totais = calcularTotais(dados);

    // Valida se medições somam 100%
    const medicoes = dados.medicoes || [];
    const somaMedicoes = medicoes.reduce((s, m) => s + parseFloat(m.percentual || 0), 0);
    const status = dados.status || 'Rascunho';

    // ── Validações que só bloqueiam ao submeter para aprovação ───────────────
    if (status !== 'Rascunho') {
      if (Math.abs(somaMedicoes - 100) > 0.01 && medicoes.length > 0) {
        return res.status(400).json({
          error: `A soma das medições deve ser exatamente 100%. Atual: ${somaMedicoes.toFixed(2)}%`,
          codigo: 'MEDICOES_SEM_100',
        });
      }

      if (totais.margemAbaixoMinimo) {
        return res.status(400).json({
          error: `Margem de lucro (${totais.lucroPerc.toFixed(1)}%) está abaixo do mínimo obrigatório de ${MARGEM_MINIMA_PERC}%. Ajuste os custos antes de enviar para aprovação.`,
          codigo: 'MARGEM_ABAIXO_MINIMO',
          margemAtual: totais.lucroPerc,
          margemMinima: MARGEM_MINIMA_PERC,
        });
      }

      if (totais.custoProducaoUltrapassou) {
        return res.status(400).json({
          error: `Custo de produção (${totais.custoProducaoPerc.toFixed(1)}%) ultrapassa o teto de ${TETO_CUSTO_PRODUCAO}%. Revise equipe e terceirizados.`,
          codigo: 'CUSTO_PRODUCAO_ULTRAPASSOU',
          custoAtual: totais.custoProducaoPerc,
          tetoPermitido: TETO_CUSTO_PRODUCAO,
        });
      }

      if (totais.terceirosUltrapassouTeto) {
        const bypasAutorizado = dados.bypassDiretoria === true;
        const ehDiretoria = ['Admin', 'Diretoria'].includes(req.user.perfil);
        if (!bypasAutorizado || !ehDiretoria) {
          return res.status(400).json({
            error: `Terceirizados em ${totais.percTerceiros.toFixed(1)}% (limite: ${TETO_TERCEIROS_PERC}%). Requer autorização da Diretoria com justificativa.`,
            codigo: 'TERCEIROS_REQUER_BYPASS',
            percAtual: totais.percTerceiros,
            tetoPermitido: TETO_TERCEIROS_PERC,
            requerBypass: true,
          });
        }
        if (!dados.justificativaBypass || dados.justificativaBypass.trim().length < 20) {
          return res.status(400).json({
            error: 'Justificativa de bypass obrigatória (mínimo 20 caracteres).',
            codigo: 'BYPASS_SEM_JUSTIFICATIVA',
          });
        }
      }
    }

    // Verifica se já existe planejamento para o projeto
    const existing = await db.findOne('Planejamentos', (p) => p.ID_Projeto === dados.idProjeto);
    const planData = {
      ID: existing?.ID || uuidv4(),
      ID_Projeto: dados.idProjeto || '',
      Nome_Projeto: dados.nomeProjeto || '',
      Cliente: dados.cliente || '',
      Nr_Contrato_OS: dados.nrContratoOS || '',
      Nr_OS_OPP: dados.nrOsOpp || '',
      Resp_Planejamento: dados.respPlanejamento || '',
      Resp_Aprovacao: dados.respAprovacao || '',
      Setor: dados.setor || '',
      Tipologia: dados.tipologia || '',
      Empresa: dados.empresa || '',
      Link_ClickUp: dados.linkClickUp || '',
      Valor_Contrato: String(dados.valorContrato || 0),
      Impostos_Perc: String(dados.impostosPerc || 16.33),
      Taxa_Adm_Perc: String(dados.taxaAdmPerc || 12),
      Comissao_Perc: String(dados.comissaoPerc || 7.50),
      Data_Inicio_OS: dados.dataInicioOS || '',
      Data_OS_Externa: dados.dataOsExterna || '',
      Data_Entrega_Contrato: dados.dataEntregaContrato || '',
      Data_Entrega_Planejada: dados.dataEntregaPlanejada || '',
      Status: status,
      Justificativa: dados.justificativa || '',
      Criado_Por: req.user.id,
      Criado_Em: existing?.Criado_Em || new Date().toISOString(),
      Aprovado_Por: existing?.Aprovado_Por || '',
      Aprovado_Em: existing?.Aprovado_Em || '',
      Dados_JSON: JSON.stringify(dados),
    };

    if (existing) {
      await db.updateRowById('Planejamentos', 'ID', existing.ID, planData);
    } else {
      await db.insertRow('Planejamentos', planData);
    }

    // Atualiza status do projeto
    if (dados.idProjeto) {
      const project = await db.findOne('Projetos_Contratos', (p) => p.ID_Projeto === dados.idProjeto);
      if (project) {
        await db.updateRowById('Projetos_Contratos', 'ID_Projeto', dados.idProjeto, {
          ...project,
          Status: project.Status, // mantém status do ClickUp, não sobrescreve
          Valor_Global: String(dados.valorContrato || project.Valor_Global),
          Atualizado_Em: new Date().toISOString(),
        });
      }
    }

    res.status(existing ? 200 : 201).json({ ...planData, totais });
  } catch (err) {
    next(err);
  }
});

// POST /api/planejamento/:id/aprovar — aprova ou rejeita um planejamento
router.post('/:id/aprovar', async (req, res, next) => {
  try {
    const plan = await db.findOne('Planejamentos', (p) => p.ID === req.params.id);
    if (!plan) return res.status(404).json({ error: 'Planejamento não encontrado.' });

    if (!['Coordenador', 'Admin', 'Diretoria'].includes(req.user.perfil)) {
      return res.status(403).json({ error: 'Somente Coordenador ou Diretoria pode aprovar planejamentos.' });
    }

    if (plan.Status !== 'Pendente Aprovação') {
      return res.status(409).json({ error: `Planejamento está em status "${plan.Status}". Somente "Pendente Aprovação" pode ser aprovado.` });
    }

    const { acao, comentario } = req.body; // acao: 'aprovar' | 'rejeitar'
    if (!['aprovar', 'rejeitar'].includes(acao)) {
      return res.status(400).json({ error: 'Campo "acao" deve ser "aprovar" ou "rejeitar".' });
    }

    const novoStatus = acao === 'aprovar' ? 'Aprovado' : 'Rejeitado';
    const updated = {
      ...plan,
      Status: novoStatus,
      Aprovado_Por: req.user.nome,
      Aprovado_Em: new Date().toISOString(),
      Comentario_Aprovacao: comentario || '',
    };

    await db.updateRowById('Planejamentos', 'ID', plan.ID, updated);

    // Atualiza status do projeto se aprovado
    if (acao === 'aprovar' && plan.ID_Projeto) {
      const project = await db.findOne('Projetos_Contratos', (p) => p.ID_Projeto === plan.ID_Projeto);
      if (project) {
        await db.updateRowById('Projetos_Contratos', 'ID_Projeto', plan.ID_Projeto, {
          ...project, Status: 'Planejado', Atualizado_Em: new Date().toISOString(),
        });
      }

      // ── Cria O.S. no OPP automaticamente ao aprovar ────────────────────
      try {
        const opp = require('../services/oppService');
        const projeto = await db.findOne('Projetos_Contratos', (p) => p.ID_Projeto === plan.ID_Projeto);
        const osResult = await opp.criarOSDoPlano(plan, projeto);
        const osId = osResult?.id_ordem || osResult?.id_os || osResult?.id || osResult?.codigo_os || '';
        if (osId) {
          // Salva o ID da O.S. no planejamento
          await db.updateRowById('Planejamentos', 'ID', plan.ID, {
            ...updated,
            Nr_OS_OPP: String(osId),
          });
          console.log(`[Aprovação] O.S. OPP #${osId} criada para ${plan.Nome_Projeto}`);
        }
      } catch (errOpp) {
        // Não bloqueia a aprovação se o OPP falhar — só registra
        console.error('[Aprovação] Falha ao criar O.S. no OPP (não bloqueante):', errOpp.message);
      }
    }

    // ── Notifica no ClickUp (comentário na tarefa linkada) ──────────────────
    if (acao === 'aprovar' && plan.Link_ClickUp) {
      try {
        const clickup = require('../services/clickupService');
        const taskId = clickup.extrairTaskId(plan.Link_ClickUp);
        if (taskId) {
          const valor = (() => {
            try {
              const d = JSON.parse(plan.Dados_JSON || '{}');
              const v = d._baseline?.valorContrato || d.valorContrato || 0;
              return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            } catch { return ''; }
          })();
          const msg = `✅ Planejamento Financeiro aprovado no Sistema PAR\n\nProjeto: ${plan.Nome_Projeto}${valor ? `\nValor: ${valor}` : ''}\nAprovado por: ${req.user.nome}\nData: ${new Date().toLocaleDateString('pt-BR')}`;
          await clickup.criarComentarioTask(taskId, msg);
          console.log(`[Aprovação] Comentário ClickUp criado na tarefa ${taskId}`);
        }
      } catch (errCU) {
        console.error('[Aprovação] Falha ao comentar no ClickUp (não bloqueante):', errCU.message);
      }
    }

    console.log(`[Aprovação] Planejamento ${plan.ID} ${novoStatus} por ${req.user.nome}`);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/planejamento/pendentes — planejamentos aguardando aprovação
router.get('/pendentes/lista', async (req, res, next) => {
  try {
    if (!['Coordenador', 'Admin', 'Diretoria'].includes(req.user.perfil)) {
      return res.status(403).json({ error: 'Sem permissão.' });
    }
    const all = await db.readSheet('Planejamentos');
    const pendentes = all.filter(p => p.Status === 'Pendente Aprovação');
    res.json(pendentes);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/planejamento/:id/checar-integridade ───────────────────────────
// Checklist de integridade antes de mover para baseline / aprovação
router.get('/:id/checar-integridade', async (req, res, next) => {
  try {
    const plan = await db.findOne('Planejamentos', (p) => p.ID === req.params.id || p.ID_Projeto === req.params.id);
    if (!plan) return res.status(404).json({ error: 'Planejamento não encontrado.' });

    let dados = {};
    try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}

    const totais = calcularTotais(dados);
    const medicoes = dados.medicoes || [];
    const equipe = dados.equipe || [];
    const terceirizados = dados.terceirizados || [];

    const somaMedicoes = medicoes.reduce((s, m) => s + parseFloat(m.percentual || 0), 0);
    const temDataInicio = !!(dados.dataInicioOS || plan.Data_Inicio_OS);
    const temDataEntrega = !!(dados.dataEntregaContrato || plan.Data_Entrega_Contrato);
    const tarefasGrandes = equipe.filter(e => parseFloat(e.horas || 0) > MAX_HORAS_TAREFA);

    const checklist = [
      { item: 'Margem de lucro ≥ 23%',           ok: !totais.margemAbaixoMinimo,         valor: `${totais.lucroPerc.toFixed(1)}%`,         critico: true  },
      { item: 'Terceirizados ≤ 25%',              ok: !totais.terceirosUltrapassouTeto,   valor: `${totais.percTerceiros.toFixed(1)}%`,     critico: true  },
      { item: 'Custo de produção ≤ 30%',          ok: !totais.custoProducaoUltrapassou,   valor: `${totais.custoProducaoPerc.toFixed(1)}%`, critico: true  },
      { item: 'Medições somam 100%',              ok: Math.abs(somaMedicoes - 100) < 0.01, valor: `${somaMedicoes.toFixed(2)}%`,            critico: true  },
      { item: 'Data de início definida',          ok: temDataInicio,                       valor: dados.dataInicioOS || '—',                critico: false },
      { item: 'Data de entrega definida',         ok: temDataEntrega,                      valor: dados.dataEntregaContrato || '—',         critico: false },
      { item: 'Equipe cadastrada',                ok: equipe.length > 0,                   valor: `${equipe.length} membro(s)`,             critico: false },
      { item: 'Sem tarefas > 16h (particionadas)',ok: tarefasGrandes.length === 0,         valor: `${tarefasGrandes.length} pendente(s)`,  critico: false },
      { item: 'Terceirizados com vínculo',        ok: totais.tercSemVinculo === 0,         valor: `${totais.tercSemVinculo} sem vínculo`,  critico: false },
    ];

    const podeAprovar = checklist.filter(c => c.critico).every(c => c.ok);
    const criticosFalhando = checklist.filter(c => c.critico && !c.ok);

    res.json({ podeAprovar, criticosFalhando, checklist, totais });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/planejamento/:id/baseline ──────────────────────────────────────
// Trava o baseline PAR com versionamento (Versão 1, Versão 2...)
router.post('/:id/baseline', async (req, res, next) => {
  try {
    const plan = await db.findOne('Planejamentos', (p) => p.ID === req.params.id);
    if (!plan) return res.status(404).json({ error: 'Planejamento não encontrado.' });

    // Somente PO, Coordenador, Admin ou Diretoria podem travar
    if (!['PO', 'Coordenador', 'Admin', 'Diretoria'].includes(req.user.perfil)) {
      return res.status(403).json({ error: 'Sem permissão para travar o baseline.' });
    }

    let dados = {};
    try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}

    // Verifica se já existe baseline travado
    if (dados._baseline && dados._baseline.travado) {
      return res.status(409).json({
        error: 'Baseline já travado em ' + new Date(dados._baseline.travadoEm).toLocaleString('pt-BR') +
          ' por ' + dados._baseline.travadoPor + '. Um baseline só pode ser travado uma vez.',
      });
    }

    const equipe = dados.equipe || [];
    const medicoes = dados.medicoes || [];

    // Monta o snapshot imutável do planejado
    const baseline = {
      travado: true,
      travadoEm: new Date().toISOString(),
      travadoPor: req.user.nome,
      travadoPorId: req.user.id,

      // Datas planejadas
      dataInicioOS: dados.dataInicioOS || plan.Data_Inicio_OS || '',
      dataEntregaContrato: dados.dataEntregaContrato || plan.Data_Entrega_Contrato || '',
      dataEntregaPlanejada: dados.dataEntregaPlanejada || plan.Data_Entrega_Planejada || '',

      // Horas estimadas por colaborador
      horasPorColaborador: equipe.map((e) => ({
        colaborador: e.colaborador || e.nome || '',
        horasEstimadas: parseFloat(e.horas || e.horas_estimadas || 0),
        mediaHora: parseFloat(e.mediaHora || e.valor_hora || 0),
        custoEstimado: parseFloat(e.mediaHora || 0) * parseFloat(e.horas || 0),
      })),

      // Total de horas estimadas
      totalHorasEstimadas: equipe.reduce((s, e) => s + parseFloat(e.horas || e.horas_estimadas || 0), 0),
      totalCustoEquipe: equipe.reduce((s, e) => s + (parseFloat(e.mediaHora || 0) * parseFloat(e.horas || 0)), 0),

      // Cronograma de medições planejado
      medicoes: medicoes.map((m) => ({
        etapa: m.etapa || m.nome || '',
        percentual: parseFloat(m.percentual || 0),
        valor: parseFloat(m.valor || 0),
        dataPrevisao: m.dataPrevisao || m.data_previsao || '',
      })),

      // Terceirizados planejados
      terceirizados: (dados.terceirizados || []).map((t) => ({
        descricao: t.descricao || t.nome || '',
        custo: parseFloat(t.custo || 0),
        fornecedor: t.fornecedor || '',
      })),

      // Despesas gerais planejadas
      despesas: (dados.despesas || []).map((d) => ({
        descricao: d.descricao || '',
        valor: parseFloat(d.valor || 0),
      })),

      // Resumo financeiro planejado
      valorContrato: parseFloat(dados.valorContrato || plan.Valor_Contrato || 0),
      impostosPerc: parseFloat(dados.impostosPerc || plan.Impostos_Perc || 16.33),
      taxaAdmPerc: parseFloat(dados.taxaAdmPerc || plan.Taxa_Adm_Perc || 12),
      comissaoPerc: parseFloat(dados.comissaoPerc || plan.Comissao_Perc || 7.5),
    };

    // ── Versionamento de Baseline ─────────────────────────────────────────────
    // Se já existe baseline travado, não bloqueia — cria uma nova versão
    const versaoAnterior = dados._baseline?.versao || 0;
    const versaoNova = versaoAnterior + 1;
    baseline.versao = versaoNova;
    baseline.versaoLabel = `Versão ${versaoNova}`;

    // Guarda histórico de versões anteriores
    const historicoBaselines = dados._historicoBaselines || [];
    if (dados._baseline) {
      historicoBaselines.push({ ...dados._baseline, arquivadoEm: new Date().toISOString() });
    }

    const dadosAtualizados = { ...dados, _baseline: baseline, _historicoBaselines: historicoBaselines };

    await db.updateRowById('Planejamentos', 'ID', plan.ID, {
      ...plan,
      Dados_JSON: JSON.stringify(dadosAtualizados),
    });

    console.log(`[Baseline] ${baseline.versaoLabel} travada por ${req.user.nome} para ${plan.Nome_Projeto}`);

    res.json({
      message: `${baseline.versaoLabel} do baseline PAR travada com sucesso!`,
      baseline,
      versaoAnterior: versaoAnterior > 0 ? versaoAnterior : null,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/planejamento/:id/comparativo ────────────────────────────────────
// Retorna lado a lado: planejado (baseline) vs executado (Log_Horas do ClickUp)
router.get('/:id/comparativo', async (req, res, next) => {
  try {
    // Aceita tanto o ID do planejamento quanto o ID do projeto
    const plan = await db.findOne('Planejamentos', (p) => p.ID === req.params.id || p.ID_Projeto === req.params.id);
    if (!plan) return res.status(404).json({ error: 'Planejamento não encontrado.' });

    let dados = {};
    try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}

    const baseline = dados._baseline || null;

    // Busca horas, medições e projeto em paralelo
    const [logHoras, medicoesReais, projeto] = await Promise.all([
      db.findRows('Log_Horas', (l) => l.ID_Projeto === plan.ID_Projeto),
      db.findRows('Medicoes', (m) => m.ID_Projeto === plan.ID_Projeto),
      db.findOne('Projetos_Contratos', (p) => p.ID_Projeto === plan.ID_Projeto),
    ]);

    // Agrupa horas rastreadas por colaborador
    const horasReaisPorColab = {};
    for (const entry of logHoras) {
      const colab = entry.Colaborador || entry.colaborador || 'Não identificado';
      if (!horasReaisPorColab[colab]) horasReaisPorColab[colab] = 0;
      horasReaisPorColab[colab] += parseFloat(entry.Horas_Logadas || entry.horas_logadas || 0);
    }
    const totalHorasRastreadas = Object.values(horasReaisPorColab).reduce((s, h) => s + h, 0);

    // ── Monta o comparativo ──
    const comparativo = {
      temBaseline: !!baseline,
      planejamento: {
        id: plan.ID,
        nome: plan.Nome_Projeto,
        status: plan.Status,
      },

      // Datas: planejado vs atual
      datas: {
        planejado: {
          dataInicioOS: baseline?.dataInicioOS || plan.Data_Inicio_OS || '',
          dataEntregaContrato: baseline?.dataEntregaContrato || plan.Data_Entrega_Contrato || '',
          dataEntregaPlanejada: baseline?.dataEntregaPlanejada || plan.Data_Entrega_Planejada || '',
        },
        atual: {
          dataInicioOS: plan.Data_Inicio_OS || '',
          dataEntregaContrato: projeto?.Data_Entrega_Contrato || plan.Data_Entrega_Contrato || '',
          dataEntregaPlanejada: projeto?.Data_Entrega_Planejada || plan.Data_Entrega_Planejada || '',
        },
      },

      // Horas: planejado vs rastreado
      horas: (() => {
        const totalPlanejado = parseFloat(
          baseline?.totalHorasEstimadas ||
          dados.totalHorasEstimadas ||
          (dados.equipe || []).reduce((s, e) => s + parseFloat(e.horas_estimadas || e.horasEstimadas || e.horas || 0), 0) ||
          0
        );
        const totalRastreado = parseFloat(totalHorasRastreadas.toFixed(2));
        const desvioPerc = totalPlanejado > 0
          ? parseFloat(((totalRastreado / totalPlanejado - 1) * 100).toFixed(1))
          : null;

        const planejadosPorColab = baseline?.horasPorColaborador || dados.equipe || [];
        const todos = new Set([
          ...planejadosPorColab.map((p) => p.colaborador || p.nome || p.membro || p.Colaborador),
          ...Object.keys(horasReaisPorColab),
        ]);

        const porColaborador = [...todos].filter(Boolean).map((colab) => {
          const planColab = planejadosPorColab.find(
            (p) => (p.colaborador || p.nome || p.membro || p.Colaborador)?.toLowerCase() === colab.toLowerCase()
          );
          const rastreado = parseFloat((horasReaisPorColab[colab] || 0).toFixed(2));
          const planejadoH = parseFloat(planColab?.horasEstimadas || planColab?.horas_estimadas || planColab?.horas || planColab?.horasTotal || 0);
          const desvio = rastreado - planejadoH;
          const dp = planejadoH > 0 ? ((rastreado / planejadoH - 1) * 100) : null;
          return {
            nome: colab,
            colaborador: colab,
            horasEstimadas: planejadoH,
            horasPlanejadas: planejadoH,
            horasLogadas: rastreado,
            horasRastreadas: rastreado,
            desvioAbsoluto: parseFloat(desvio.toFixed(2)),
            desvioPerc: dp !== null ? parseFloat(dp.toFixed(1)) : null,
            custoEstimado: planColab?.custoEstimado || 0,
          };
        }).sort((a, b) => Math.abs(b.desvioAbsoluto) - Math.abs(a.desvioAbsoluto));

        return {
          planejadas: totalPlanejado,
          totalPlanejado,
          rastreadas: totalRastreado,
          totalRastreado,
          desvioAbsoluto: parseFloat((totalRastreado - totalPlanejado).toFixed(2)),
          desvioPerc,
          porColaborador,
        };
      })(),

      // Medições: cronograma planejado vs realizado
      medicoes: (() => {
        // Usa medições da baseline se existir, senão usa dados do plano
        const planejadas = baseline?.medicoes || dados.medicoes || [];
        return planejadas.map((mp, i) => {
          // Tenta casar pelo nome/etapa, depois por índice
          const realizada = medicoesReais.find((mr) => {
            if (mp.etapa && mr.Descricao) {
              return mr.Descricao.toLowerCase().trim() === mp.etapa.toLowerCase().trim();
            }
            return false;
          }) || medicoesReais[i];

          const dataP = mp.dataPrevisao || mp.dataPrevista ? new Date(mp.dataPrevisao || mp.dataPrevista) : null;
          const dataR = realizada?.Data_Realizacao ? new Date(realizada.Data_Realizacao) : null;
          const hoje = new Date();
          // Se não realizou mas já passou da data prevista — calcula atraso em relação a hoje
          const atrasoDias = dataP
            ? (dataR
                ? Math.round((dataR - dataP) / 86400000)
                : hoje > dataP ? Math.round((hoje - dataP) / 86400000) : 0)
            : 0;

          const descricao = mp.etapa || mp.descricao || mp.etapaDescricao || `Medição ${i + 1}`;
          const valor = mp.valor || mp.valorMedicao || 0;
          const dataPrevista = mp.dataPrevisao || mp.dataPrevista || '';

          return {
            descricao,
            etapa: descricao,
            percentual: mp.percentual || mp.percentualMedicao || 0,
            valor,
            valorPlanejado: valor,
            dataPrevista,
            dataPrevisaoPlanejada: dataPrevista,
            dataRealizacao: realizada?.Data_Realizacao || null,
            statusFinanceiro: realizada?.Status_Financeiro || realizada?.statusFinanceiro || 'Pendente',
            statusFisico: realizada?.Status_Fisico || realizada?.statusFisico || 'Não iniciado',
            atrasoDias: Math.max(0, atrasoDias),
            valorRealizado: parseFloat(realizada?.Valor_Medicao || realizada?.valorRealizado || 0),
          };
        });
      })(),

      // Info do baseline
      baseline: baseline ? {
        travadoEm: baseline.travadoEm,
        travadoPor: baseline.travadoPor,
      } : null,
    };

    res.json(comparativo);
  } catch (err) {
    next(err);
  }
});

// GET /api/planejamento/:id/despesas-opp — busca despesas reais do OPP pelo centro de custo
router.get('/:id/despesas-opp', async (req, res, next) => {
  try {
    // Aceita centro de custo direto via query param (para importação sem salvar antes)
    let centroCusto = req.query.centroCusto || '';
    if (!centroCusto) {
      const plan = await db.findOne('Planejamentos', p => p.ID === req.params.id || p.ID_Projeto === req.params.id);
      if (!plan) return res.status(404).json({ error: 'Planejamento não encontrado.' });
      centroCusto = plan.Nr_Contrato_OS || '';
    }
    if (!centroCusto) return res.json({ centroCusto: '', lancamentos: [], total: 0 });

    const { oppRequest } = require('../services/oppService');

    // Busca centros de custo filtrando pelo nome para reduzir payload
    const ccNorm = centroCusto.toLowerCase().trim();
    let cc = null;

    // Tenta buscar filtrando pelo nome primeiro (se a API suportar)
    try {
      const busca = await oppRequest('GET', `/centros-custo?desc_centro_custos=${encodeURIComponent(centroCusto)}&limit=50`);
      const listaBusca = Array.isArray(busca) ? busca : (busca?.data || []);
      cc = listaBusca.find(c =>
        (c.desc_centro_custos || '').toLowerCase().trim() === ccNorm ||
        (c.desc_centro_custos || '').toLowerCase().includes(ccNorm) ||
        ccNorm.includes((c.desc_centro_custos || '').toLowerCase())
      ) || null;
    } catch (_) {}

    // Fallback: busca paginada até encontrar
    if (!cc) {
      let pagCC = 1;
      outer: while (pagCC <= 10) {
        const centros = await oppRequest('GET', `/centros-custo?limit=100&pagina=${pagCC}`);
        const lista = Array.isArray(centros) ? centros : (centros?.data || []);
        if (!lista.length) break;
        for (const c of lista) {
          const desc = (c.desc_centro_custos || '').toLowerCase().trim();
          if (desc === ccNorm || desc.includes(ccNorm) || ccNorm.includes(desc)) {
            cc = c; break outer;
          }
        }
        if (lista.length < 100) break;
        pagCC++;
      }
    }

    if (!cc) return res.json({ centroCusto, centroCustoEncontrado: false, lancamentos: [], total: 0 });

    // Busca contas a pagar filtradas pelo centro de custo (máx 3 páginas para não travar)
    let pagina = 1, todos = [];
    while (pagina <= 5) {
      const r = await oppRequest('GET', `/contas-pagar?id_centro_custos=${cc.id_centro_custos}&limit=100&pagina=${pagina}`);
      const lista = Array.isArray(r) ? r : (r?.data || []);
      if (lista.length === 0) break;
      todos.push(...lista);
      if (lista.length < 100) break;
      pagina++;
    }

    const lancamentos = todos
      .filter(d => !(d.situacao || '').toLowerCase().includes('estornada') && d.lixeira !== 'Sim')
      .map(d => ({
        id: d.id_conta_pag,
        descricao: d.nome_conta || '',
        fornecedor: d.nome_fornecedor || '',
        valor: parseFloat(d.valor_pag || 0),
        valorPago: parseFloat(d.valor_pago || 0),
        situacao: d.situacao || '',
        liquidado: d.liquidado_pag === 'Sim',
        data: d.vencimento_pag || d.data_emissao || '',
        oc: d.id_registro || '',
        nrDocumento: d.n_documento_pag || '',
      }));

    const total = lancamentos.reduce((s, l) => s + l.valor, 0);
    const totalPago = lancamentos.filter(l => l.liquidado).reduce((s, l) => s + l.valorPago, 0);

    res.json({ centroCusto, centroCustoId: cc.id_centro_custos, centroCustoEncontrado: true, lancamentos, total, totalPago });
  } catch (err) { next(err); }
});

// POST /api/planejamento/calcular — calcula totais sem salvar (preview)
router.post('/calcular', async (req, res, next) => {
  try {
    const totais = calcularTotais(req.body);
    res.json(totais);
  } catch (err) {
    next(err);
  }
});

// POST /api/planejamento/:id/travar — trava o vínculo OPP pelo Nome do Centro de Custo
router.post('/:id/travar', async (req, res, next) => {
  try {
    const plan = await db.findOne('Planejamentos', p => p.ID_Projeto === req.params.id);
    if (!plan) return res.status(404).json({ error: 'Planejamento não encontrado.' });
    if (plan.Travado) return res.status(400).json({ error: 'Planejamento já está travado.' });
    if (!plan.Nr_Contrato_OS) return res.status(400).json({ error: 'Preencha o Nome do Centro de Custo antes de travar.' });

    await db.updateRowById('Planejamentos', 'ID', plan.ID, {
      ...plan,
      Travado: true,
      Travado_Em: new Date().toISOString(),
      Travado_Por: req.user.nome || req.user.id,
    });

    res.json({
      ok: true,
      centroCusto: plan.Nr_Contrato_OS,
      message: `Vínculo travado. PAR vai buscar "${plan.Nr_Contrato_OS}" no OPP a partir de agora.`,
    });
  } catch (err) { next(err); }
});

// POST /api/planejamento/:id/destravar — estorna o planejamento aprovado (com motivo)
router.post('/:id/destravar', async (req, res, next) => {
  try {
    const plan = await db.findOne('Planejamentos', p => p.ID_Projeto === req.params.id);
    if (!plan) return res.status(404).json({ error: 'Planejamento não encontrado.' });

    const { motivo } = req.body;
    const dadosAtuais = (() => { try { return JSON.parse(plan.Dados_JSON || '{}') } catch { return {} } })();
    const historicoEstornos = dadosAtuais._historicoEstornos || [];
    historicoEstornos.push({
      data: new Date().toISOString(),
      usuario: req.user?.nome || req.user?.email || 'Sistema',
      motivo: motivo || 'Sem motivo informado',
    });

    await db.updateRowById('Planejamentos', 'ID', plan.ID, {
      ...plan,
      Travado: false,
      Travado_Em: '',
      Travado_Por: '',
      Dados_JSON: JSON.stringify({ ...dadosAtuais, _historicoEstornos: historicoEstornos }),
    });

    res.json({ ok: true, message: 'Planejamento estornado com sucesso.' });
  } catch (err) { next(err); }
});

module.exports = router;
