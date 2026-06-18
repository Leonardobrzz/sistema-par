const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const opp = require('../services/oppService');

const router = express.Router();
router.use(authMiddleware);

// ── GET /api/opp/status — testa conexão com o OPP ───────────────────────────
router.get('/status', async (req, res, next) => {
  try {
    const result = await opp.testarConexao();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── CLIENTES ─────────────────────────────────────────────────────────────────

// GET /api/opp/clientes — lista clientes do OPP
router.get('/clientes', async (req, res, next) => {
  try {
    const data = await opp.listarClientes(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/opp/clientes/:id — detalhe de um cliente
router.get('/clientes/:id', async (req, res, next) => {
  try {
    const data = await opp.buscarCliente(req.params.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/opp/clientes — cadastra novo cliente
// ⚠️ Apenas Admin/Diretoria/Financeiro podem criar clientes
router.post('/clientes', async (req, res, next) => {
  try {
    if (!['Admin', 'Diretoria', 'Financeiro'].includes(req.user.perfil)) {
      return res.status(403).json({ error: 'Sem permissão para cadastrar clientes no OPP.' });
    }
    const data = await opp.cadastrarCliente(req.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/opp/clientes/:id — atualiza cliente
// ⚠️ Apenas Admin/Diretoria/Financeiro
router.put('/clientes/:id', async (req, res, next) => {
  try {
    if (!['Admin', 'Diretoria', 'Financeiro'].includes(req.user.perfil)) {
      return res.status(403).json({ error: 'Sem permissão para alterar clientes no OPP.' });
    }
    const data = await opp.atualizarCliente(req.params.id, req.body);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── ORDENS DE SERVIÇO ─────────────────────────────────────────────────────────

// GET /api/opp/os — lista ordens de serviço
router.get('/os', async (req, res, next) => {
  try {
    const data = await opp.listarOS(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/opp/os/:id — detalhe de uma O.S.
router.get('/os/:id', async (req, res, next) => {
  try {
    const data = await opp.buscarOS(req.params.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/opp/os — cria Ordem de Serviço no OPP
// ⚠️ Produção — apenas Financeiro/Admin/Diretoria
router.post('/os', async (req, res, next) => {
  try {
    if (!['Admin', 'Diretoria', 'Financeiro'].includes(req.user.perfil)) {
      return res.status(403).json({ error: 'Sem permissão para criar O.S. no OPP.' });
    }
    const data = await opp.criarOS(req.body);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// ── FINANCEIRO ────────────────────────────────────────────────────────────────

// GET /api/opp/financeiro — lista lançamentos
router.get('/financeiro', async (req, res, next) => {
  try {
    const data = await opp.listarLancamentos(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/opp/financeiro/oc/:ordemCompra — lançamentos por Ordem de Compra
// Esta é a chave de vínculo ClickUp ↔ OPP conforme briefing
router.get('/financeiro/oc/:ordemCompra', async (req, res, next) => {
  try {
    const data = await opp.buscarLancamentosPorOC(req.params.ordemCompra);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/opp/receitas — lista contas a receber do OPP
router.get('/receitas', async (req, res, next) => {
  try {
    const data = await opp.listarReceitas(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/opp/despesas — lista contas a pagar do OPP
router.get('/despesas', async (req, res, next) => {
  try {
    const data = await opp.listarDespesas(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/opp/extrato/:idProjeto — extrato financeiro por projeto (direto do OPP)
router.get('/extrato/:idProjeto', async (req, res, next) => {
  try {
    const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');
    const agora = new Date();
    const inicio = new Date(agora); inicio.setMonth(inicio.getMonth() - 18);
    const fmt = (d) => d.toISOString().split('T')[0];

    const [projeto, planejamento, medicoes, receitasOPP, despesasOPP] = await Promise.all([
      db.findOne('Projetos_Contratos', p => p.ID_Projeto === req.params.idProjeto),
      db.findOne('Planejamentos', p => p.ID_Projeto === req.params.idProjeto),
      db.findRows('Medicoes', m => m.ID_Projeto === req.params.idProjeto),
      opp.listarReceitas({ data_inicio: fmt(inicio), data_fim: fmt(agora) }).catch(() => []),
      opp.listarDespesas({ data_inicio: fmt(inicio), data_fim: fmt(agora) }).catch(() => []),
    ]);

    if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado.' });

    // Nome do Centro de Custo travado no planejamento PAR (prioridade máxima)
    const centroCustoTravado = (planejamento?.Travado && planejamento?.Nr_Contrato_OS)
      ? planejamento.Nr_Contrato_OS.trim().toLowerCase()
      : '';
    const clienteNome = (projeto.Cliente || '').trim().toLowerCase();
    const centroCusto = (projeto.Centro_Custo_OPP || '').trim().toLowerCase();

    const extractCC = (val) => {
      if (!val) return '';
      if (Array.isArray(val)) return val.map(v => v?.nome || String(v)).filter(Boolean).join(', ');
      return String(val);
    };

    const listaR = (Array.isArray(receitasOPP) ? receitasOPP : (receitasOPP?.data || [])).filter(r => r.lixeira !== 'Sim');
    const listaD = (Array.isArray(despesasOPP) ? despesasOPP : (despesasOPP?.data || [])).filter(d => d.lixeira !== 'Sim');

    const match = (profissional, cliente) => {
      const prof = (profissional || '').trim().toLowerCase();
      const cli = (cliente || '').trim().toLowerCase();
      // 1. Nome do Centro de Custo travado no PAR (prioridade máxima)
      if (centroCustoTravado && prof && prof.includes(centroCustoTravado)) return true;
      // 2. Centro_Custo_OPP do ClickUp (legado)
      if (!centroCustoTravado && centroCusto && prof && prof.includes(centroCusto)) return true;
      if (!centroCustoTravado && centroCusto && prof && centroCusto.includes(prof) && prof.length > 4) return true;
      // 3. Fallback: nome do cliente (só quando não há vínculo configurado)
      if (!centroCustoTravado && !centroCusto && clienteNome && cli.includes(clienteNome) && clienteNome.length > 4) return true;
      return false;
    };

    const receitas = listaR.filter(r => match(extractCC(r.centro_custo) || r.centro_custos_rec, r.nome_cliente))
      .map(r => ({ id: r.id_conta_rec, descricao: r.nome_conta || r.observacoes_rec, valor: parseFloat(r.valor_rec || 0), vencimento: r.vencimento_rec, cliente: r.nome_cliente, situacao: r.liquidado_rec === 'Sim' ? 'Liquidado' : 'Aberto' }));
    const despesas = listaD.filter(d => match(extractCC(d.centro_custo) || d.centro_custos_pag, d.nome_fornecedor))
      .map(d => ({ id: d.id_conta_pag, descricao: d.nome_conta || d.observacoes_pag, valor: parseFloat(d.valor_pag || 0), vencimento: d.vencimento_pag, cliente: d.nome_fornecedor, situacao: d.liquidado_pag === 'Sim' ? 'Liquidado' : 'Aberto' }));

    const totalReceitas = receitas.reduce((s, r) => s + r.valor, 0);
    const totalDespesas = despesas.reduce((s, r) => s + r.valor, 0);

    res.json({
      projeto: { id: projeto.ID_Projeto, nome: projeto.Nome, cliente: projeto.Cliente, centroCusto: projeto.Centro_Custo_OPP || null },
      vinculo: {
        travado: !!(planejamento?.Travado),
        centroCustoTravado: planejamento?.Nr_Contrato_OS || null,
        travadoEm: planejamento?.Travado_Em || null,
        travadoPor: planejamento?.Travado_Por || null,
      },
      resumo: { totalReceitas, totalDespesas, saldo: totalReceitas - totalDespesas },
      receitas,
      despesas,
    });
  } catch (err) { next(err); }
});

// GET /api/opp/centros-custo — lista OSs únicas da API do OPP para dropdown do planejamento
router.get('/centros-custo', async (req, res, next) => {
  try {
    const receitas = await opp.listarReceitas({ limit: 500 });
    const lista = Array.isArray(receitas) ? receitas : (receitas.data || []);
    // Mapa: nr_os -> { nr, cliente }
    const ossMap = new Map();
    for (const r of lista) {
      const m = (r.observacoes_rec || '').match(/ordem de servi[çc]o\s+n[º°]?\s*(\d+)/i);
      if (m && !ossMap.has(m[1])) {
        ossMap.set(m[1], { nr: m[1], cliente: r.nome_cliente || '' });
      }
    }
    const centros = [...ossMap.values()].sort((a, b) => Number(a.nr) - Number(b.nr));
    res.json({ centros });
  } catch (err) { next(err); }
});

// GET /api/opp/campos-disponiveis — retorna amostra dos campos reais que a API do OPP retorna
// Usado para debugar qual campo contém o Centro de Custo (Profissional)
router.get('/campos-disponiveis', async (req, res, next) => {
  try {
    const [receitas, despesas] = await Promise.allSettled([
      opp.listarReceitas({ limit: 1 }),
      opp.listarDespesas({ limit: 1 }),
    ]);
    const r = receitas.status === 'fulfilled' ? (Array.isArray(receitas.value) ? receitas.value[0] : receitas.value?.data?.[0]) : null;
    const d = despesas.status === 'fulfilled' ? (Array.isArray(despesas.value) ? despesas.value[0] : despesas.value?.data?.[0]) : null;
    res.json({
      camposReceita: r ? Object.keys(r) : [],
      amostraReceita: r || null,
      camposDespesa: d ? Object.keys(d) : [],
      amostraDespesa: d || null,
    });
  } catch (err) { next(err); }
});

// GET /api/opp/extrato-por-projeto — agrupa financeiro por Campo "Profissional" (Centro de Custo)
// Puxa DIRETO da API do OPP (dados sempre frescos, sem depender de sync)
// Metodologia PAR: 1.0 Receitas / 2.0 Custos Diretos / 3.0 Despesas Operacionais
router.get('/extrato-por-projeto', async (req, res, next) => {
  try {
    const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');

    // Puxa dados do OPP em paralelo com dados internos
    const agora = new Date();
    const inicio = new Date(agora);
    inicio.setMonth(inicio.getMonth() - 18); // últimos 18 meses
    const fmt = (d) => d.toISOString().split('T')[0];

    const [
      projetos, planejamentos, terceirizados,
      receitasOPP, despesasOPP
    ] = await Promise.all([
      db.readSheet('Projetos_Contratos'),
      db.readSheet('Planejamentos'),
      db.readSheet('Terceirizados'),
      opp.listarReceitas({ data_inicio: fmt(inicio), data_fim: fmt(agora) }).catch(() => []),
      opp.listarDespesas({ data_inicio: fmt(inicio), data_fim: fmt(agora) }).catch(() => []),
    ]);

    const listaReceitas = (Array.isArray(receitasOPP) ? receitasOPP : (receitasOPP?.data || []))
      .filter(r => r.lixeira !== 'Sim');
    const listaDespesas = (Array.isArray(despesasOPP) ? despesasOPP : (despesasOPP?.data || []))
      .filter(d => d.lixeira !== 'Sim');

    // Extrai nome do centro de custo — o campo pode ser string, null, ou array de objetos
    const extractCC = (val) => {
      if (!val) return '';
      if (Array.isArray(val)) return val.map(v => v?.nome || v?.descricao || String(v)).filter(Boolean).join(', ');
      return String(val);
    };

    // Extrai número de OS/OC das observações (ex: "Ref. a ordem de serviço nº 1791, ...")
    const extractOSFromObs = (obs) => {
      if (!obs) return '';
      const m = String(obs).match(/n[uúº°]\s*(\d+)/i);
      return m ? m[1] : '';
    };

    // Normaliza campos do OPP para formato interno
    const normReceita = (r) => ({
      tipo: 'Receita',
      id: String(r.id_conta_rec || ''),
      descricao: r.nome_conta || r.observacoes_rec || '',
      valor: parseFloat(r.valor_rec || 0),
      vencimento: r.vencimento_rec || '',
      competencia: r.data_emissao || '',
      situacao: r.liquidado_rec === 'Sim' ? 'Liquidado' : (r.situacao || 'Aberto'),
      cliente: r.nome_cliente || '',
      nrDocumento: r.n_documento_rec || '',
      nrOS: extractOSFromObs(r.observacoes_rec),
      // Centro de Custo: campo centro_custo (array) ou centro_custos_rec (string/null)
      profissional: extractCC(r.centro_custo) || extractCC(r.centro_custos_rec) || '',
      categoria: String(r.categoria_rec || '1.0 Receitas'),
      _raw: r,
    });

    const normDespesa = (d) => {
      const profissional = extractCC(d.centro_custo) || extractCC(d.centro_custos_pag) || '';
      const catRaw = String(d.categoria_pag || '');
      // Tenta classificar por categoria PAR se o OPP não retornar categorizado
      const cat = catRaw || (() => {
        const desc = (d.nome_conta || d.descricao || '').toLowerCase();
        if (desc.includes('subcontrat') || desc.includes('material') || desc.includes('terceiro') || desc.includes('topografia')) return '2.0 Custos Diretos de Projetos';
        return '3.0 Despesas Operacionais';
      })();
      return {
        tipo: 'Despesa',
        id: String(d.id_conta_pag || ''),
        descricao: d.nome_conta || d.observacoes_pag || '',
        valor: parseFloat(d.valor_pag || 0),
        vencimento: d.vencimento_pag || '',
        competencia: d.data_emissao || '',
        situacao: d.liquidado_pag === 'Sim' ? 'Liquidado' : (d.situacao || 'Aberto'),
        cliente: d.nome_fornecedor || '',
        nrDocumento: d.n_documento_pag || '',
        nrOS: extractOSFromObs(d.observacoes_pag),
        profissional,
        categoria: cat,
        _raw: d,
      };
    };

    const todasTxs = [
      ...listaReceitas.map(normReceita),
      ...listaDespesas.map(normDespesa),
    ];

    // Identifica quais campos únicos de "profissional" existem nos dados reais
    const profissionaisUnicos = [...new Set(todasTxs.map(t => t.profissional).filter(Boolean))].sort();

    // Índice de planejamentos aprovados para buscar dados do plano
    const planMap = {};
    for (const pl of planejamentos) {
      if (pl.Status === 'Aprovado' || pl.Status === 'Pendente Aprovação') planMap[pl.ID_Projeto] = pl;
    }

    const CUSTO_HORA = 36.40;

    const resultado = projetos
      .filter(p => parseFloat(p.Valor_Global || 0) > 0 || (p.Nr_Contrato && String(p.Nr_Contrato).trim()))
      .map(p => {
        const centroCusto = (p.Centro_Custo_OPP || '').trim().toLowerCase();
        const clienteNome = (p.Cliente || '').trim().toLowerCase();

        // Filtra transações que correspondem a este projeto
        // Prioridade 1: campo Profissional bate com Centro_Custo_OPP
        // Prioridade 2: Nome_Cliente bate com Cliente do projeto
        const txs = todasTxs.filter(t => {
          const prof = (t.profissional || '').trim().toLowerCase();
          const nomeCliente = (t.cliente || '').trim().toLowerCase();
          if (centroCusto && prof && prof.includes(centroCusto)) return true;
          if (centroCusto && prof && centroCusto.includes(prof) && prof.length > 4) return true;
          if (!centroCusto && clienteNome && nomeCliente.includes(clienteNome) && clienteNome.length > 4) return true;
          return false;
        });

        // Classifica por categoria PAR
        const receitas10  = txs.filter(t => t.tipo === 'Receita');
        const custosDiretos20 = txs.filter(t => t.tipo === 'Despesa' && (
          (t.categoria || '').includes('2.0') ||
          (t.categoria || '').toLowerCase().includes('custo direto') ||
          (t.categoria || '').toLowerCase().includes('subcontrat') ||
          (t.categoria || '').toLowerCase().includes('material')
        ));
        const despesasOp30 = txs.filter(t => t.tipo === 'Despesa' && !custosDiretos20.includes(t));

        const totalReceitas = receitas10.reduce((s, t) => s + t.valor, 0);
        const totalCustosDiretos = custosDiretos20.reduce((s, t) => s + t.valor, 0);
        const totalDespesasOp = despesasOp30.reduce((s, t) => s + t.valor, 0);
        const totalDespesas = totalCustosDiretos + totalDespesasOp;
        const saldo = totalReceitas - totalDespesas;

        // O.C.s (terceirizados) deste projeto
        const tercsProj = terceirizados.filter(t => t.ID_Projeto === p.ID_Projeto && t.Status !== 'Cancelado');
        const totalOC_contratado = tercsProj.reduce((s, t) => s + parseFloat(t.Valor_Contratado || t.Valor_Total || 0), 0);
        const totalOC_entregue = tercsProj.filter(t => t.Status === 'Entregue').reduce((s, t) => s + parseFloat(t.Valor_Contratado || t.Valor_Total || 0), 0);
        const totalOC_pendente = totalOC_contratado - totalOC_entregue;

        // Dados do planejamento aprovado
        const plan = planMap[p.ID_Projeto];
        let dadosPlan = {};
        try { dadosPlan = JSON.parse(plan?.Dados_JSON || '{}'); } catch {}
        const budgetTerceiros = (dadosPlan.terceirizados || []).reduce((s, t) => s + parseFloat(t.custo || 0), 0);
        const horasEquipe = (dadosPlan.equipe || []).reduce((s, e) => s + parseFloat(e.horas || 0), 0);
        const custoEquipePlan = horasEquipe * CUSTO_HORA;
        const margemReal = parseFloat(p.Valor_Global || 0) > 0
          ? ((totalReceitas - totalDespesas - custoEquipePlan) / parseFloat(p.Valor_Global)) * 100
          : null;

        return {
          id: p.ID_Projeto,
          nome: p.Nome,
          cliente: p.Cliente || '—',
          setor: p.Setor || '—',
          status: p.Status,
          centroCusto: p.Centro_Custo_OPP || '—',
          valorContrato: parseFloat(p.Valor_Global || 0),
          statusPlanejamento: plan?.Status || null,
          financeiro: {
            receitas10: { total: totalReceitas, lista: receitas10.slice(0, 20).map(({_raw, ...t}) => t) },
            custosDiretos20: { total: totalCustosDiretos, lista: custosDiretos20.slice(0, 20).map(({_raw, ...t}) => t) },
            despesasOp30: { total: totalDespesasOp, lista: despesasOp30.slice(0, 20).map(({_raw, ...t}) => t) },
            totalDespesas,
            saldo,
            margemReal: margemReal !== null ? parseFloat(margemReal.toFixed(1)) : null,
          },
          ocs: {
            budget: budgetTerceiros,
            contratado: totalOC_contratado,
            entregue: totalOC_entregue,
            pendente: totalOC_pendente,
            percBudget: budgetTerceiros > 0 ? parseFloat(((totalOC_contratado / budgetTerceiros) * 100).toFixed(1)) : 0,
            lista: tercsProj.map(t => ({
              fornecedor: t.Fornecedor,
              servico: t.Servico,
              valor: parseFloat(t.Valor_Contratado || t.Valor_Total || 0),
              status: t.Status,
              oc: t.OC || t.Nr_OC || '—',
            })),
          },
          semDados: txs.length === 0,
        };
      })
      .filter(p => p.valorContrato > 0);

    // Stats globais
    const stats = {
      total: resultado.length,
      comDados: resultado.filter(r => !r.semDados).length,
      semDados: resultado.filter(r => r.semDados).length,
      totalReceitas: resultado.reduce((s, r) => s + r.financeiro.receitas10.total, 0),
      totalDespesas: resultado.reduce((s, r) => s + r.financeiro.totalDespesas, 0),
    };

    res.json({ projetos: resultado, stats, profissionaisUnicos });
  } catch (err) { next(err); }
});

// GET /api/opp/financeiro-cliente?nome=... — busca lançamentos de um cliente no cache local
router.get('/financeiro-cliente', async (req, res, next) => {
  try {
    const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');
    const nome = (req.query.nome || '').toLowerCase().trim();
    if (!nome) return res.json({ receitas: [], despesas: [] });
    const rows = await db.readSheet('Financeiro_OPP');
    const match = r => (r.Nome_Cliente || '').toLowerCase().includes(nome);
    const receitas = rows.filter(r => (r.Tipo || '').toLowerCase() === 'receita' && match(r));
    const despesas = rows.filter(r => (r.Tipo || '').toLowerCase() === 'despesa' && match(r));
    res.json({ receitas, despesas });
  } catch (err) { next(err); }
});

// POST /api/opp/sync — dispara sync manual de receitas/despesas do OPP
// ⚠️ Apenas Financeiro/Admin/Diretoria
router.post('/sync', async (req, res, next) => {
  try {
    if (!['Admin', 'Diretoria', 'Financeiro', 'Coordenador'].includes(req.user.perfil)) {
      return res.status(403).json({ error: 'Sem permissão para sincronizar dados do OPP.' });
    }
    const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');
    const [result] = await Promise.all([
      opp.syncReceitasDespesas(db),
      opp.syncOrdensCompra(db),
    ]);
    res.json({ ok: true, ...result, sincronizadoEm: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

