const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const opp = require('../services/oppService');

const router = express.Router();

// GET /api/opp/diagnostico-cc — diagnóstico dos campos reais de contas-pagar
router.get('/diagnostico-cc', async (req, res, next) => {
  try {
    const amostra = await opp.oppRequest('GET', '/contas-pagar?limit=5&offset=0');
    const lista = Array.isArray(amostra) ? amostra : (amostra?.data || []);
    res.json({
      total_amostrado: lista.length,
      campos_primeiro_registro: lista[0] ? Object.keys(lista[0]) : [],
      registros: lista.map(d => d),
    });
  } catch (err) { next(err); }
});

// GET /api/opp/diagnostico-receitas — mostra contas-receber agrupados por OS para debug
router.get('/diagnostico-receitas', async (req, res, next) => {
  try {
    const { os } = req.query; // filtro opcional por número de OS
    let offset = 0, todos = [];
    while (true) {
      const r = await opp.oppRequest('GET', `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`);
      const lista = Array.isArray(r) ? r : (r?.data || []);
      if (lista.length === 0) break;
      todos.push(...lista);
      if (lista.length < 250) break;
      offset += 250;
      if (offset > 5000) break;
    }
    const osRegex = /(?:OS\s+nro?\.\s*|ordem de servi[cç]o\s*n[º°]?\s*)(\d+)/i;
    const porOS = {};
    for (const r of todos) {
      const match = (r.observacoes_rec || '').match(osRegex);
      if (!match) continue;
      const osNum = match[1];
      if (!porOS[osNum]) porOS[osNum] = { os: osNum, totalRecebido: 0, totalPendente: 0, registros: [] };
      const v = parseFloat(r.valor_rec || 0);
      if (r.liquidado_rec === 'Sim') porOS[osNum].totalRecebido += v;
      else porOS[osNum].totalPendente += v;
      porOS[osNum].registros.push({ nome_cliente: r.nome_cliente, valor_rec: r.valor_rec, liquidado: r.liquidado_rec, data_pag: r.data_pagamento });
    }
    const resultado = Object.values(porOS).sort((a, b) => Number(b.os) - Number(a.os));
    const filtrado = os ? resultado.filter(x => x.os === String(os)) : resultado;
    // Registros SEM o padrão de OS — amostrar para ver o formato real
    const semOS = todos.filter(r => !(r.observacoes_rec || '').match(osRegex));
    const amostrasObservacoes = [...new Set(semOS.map(r => r.observacoes_rec || '(vazio)').filter(Boolean))].slice(0, 30);

    res.json({
      total_registros_opp: todos.length,
      total_os_encontradas: resultado.length,
      total_sem_padrao_os: semOS.length,
      aviso: 'centro_custos_rec é sempre null no OPP — matching é feito pelo número da OS em observacoes_rec',
      os_agrupadas: filtrado,
      amostra_observacoes_sem_os: amostrasObservacoes,
    });
  } catch (err) { next(err); }
});

// ── GET /api/opp/os-para-vincular — projetos PAR + OS do OPP para tela de vínculo ──
router.get('/os-para-vincular', authMiddleware, async (req, res, next) => {
  try {
    const db = process.env.USE_POSTGRES === 'true'
      ? require('../services/postgresService')
      : require('../services/googleSheetsService');

    const [planejamentos, oppData] = await Promise.all([
      db.readSheet('Planejamentos'),
      (async () => {
        let offset = 0, todos = [];
        while (true) {
          const r = await opp.oppRequest('GET', `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`);
          const lista = Array.isArray(r) ? r : (r?.data || []);
          if (lista.length === 0) break;
          todos.push(...lista);
          if (lista.length < 250) break;
          offset += 250;
          if (offset > 5000) break;
        }
        return todos;
      })(),
    ]);

    const osRegex = /(?:OS\s+nro?\.\s*|ordem de servi[cç]o\s*n[º°]?\s*)(\d+)/i;
    const porOS = {};
    for (const r of oppData) {
      const match = (r.observacoes_rec || '').match(osRegex);
      if (!match) continue;
      const osNum = match[1];
      if (!porOS[osNum]) porOS[osNum] = { os: osNum, cliente: r.nome_cliente || '', totalRecebido: 0, totalPendente: 0 };
      const v = parseFloat(r.valor_rec || 0);
      if (r.liquidado_rec === 'Sim') porOS[osNum].totalRecebido += v;
      else porOS[osNum].totalPendente += v;
    }
    const osLista = Object.values(porOS).sort((a, b) => Number(b.os) - Number(a.os));

    // Normaliza string para comparação: sem acento, maiúsculo, só letras/números
    const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

    const pBRlocal = v => {
      const s = String(v || '0').trim()
      if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
      const parts = s.split('.')
      if (parts.length === 2 && parts[1].length <= 2) return parseFloat(s) || 0
      return parseFloat(s.replace(/\./g, '')) || 0
    }

    // Tenta casar automaticamente projeto PAR com OS do OPP
    // Critérios: nome do cliente (palavras em comum) + similaridade de valor total
    function sugerirOS(parCliente, parNome, parValor) {
      const cliNorm = norm(parCliente)
      const val = pBRlocal(parValor)

      let melhor = null, melhorScore = 0
      for (const os of osLista) {
        const osCliNorm = norm(os.cliente)
        if (!osCliNorm || osCliNorm === 'TESTE') continue

        let score = 0
        // Palavras do cliente PAR presentes no cliente OPP
        const palavrasPAR = cliNorm.split(' ').filter(w => w.length > 3)
        const palavrasOPP = osCliNorm.split(' ').filter(w => w.length > 3)
        for (const w of palavrasPAR) if (osCliNorm.includes(w)) score += 2
        for (const w of palavrasOPP) if (cliNorm.includes(w)) score += 1
        if (score < 2) continue

        // Bônus por similaridade de valor (rec + pend vs valorContrato)
        if (val > 0) {
          const osTotal = os.totalRecebido + os.totalPendente
          const diff = Math.abs(osTotal - val) / val
          if (diff < 0.05) score += 10      // dentro de 5% — match quase certo
          else if (diff < 0.15) score += 5  // dentro de 15%
          else if (diff < 0.30) score += 2  // dentro de 30%
        }

        if (score > melhorScore) { melhorScore = score; melhor = os }
      }
      return melhorScore >= 2 ? { os: melhor.os, cliente: melhor.cliente, score: melhorScore } : null
    }

    const aprovados = planejamentos
      .filter(p => p.Status === 'Aprovado')
      .map(p => ({
        id: p.ID,
        idProjeto: p.ID_Projeto,
        nome: p.Nome_Projeto,
        cliente: p.Cliente || '',
        setor: p.Setor || '',
        valorContrato: p.Valor_Contrato || '',
        nrOsOpp: p.Nr_OS_OPP || '',
        sugestao: p.Nr_OS_OPP ? null : sugerirOS(p.Cliente, p.Nome_Projeto, p.Valor_Contrato),
      }));

    res.json({ projetos: aprovados, osOpp: osLista });
  } catch (err) { next(err); }
});

// ── POST /api/opp/vincular-os — salva Nr_OS_OPP em um planejamento ───────────
router.post('/vincular-os', authMiddleware, async (req, res, next) => {
  try {
    const db = process.env.USE_POSTGRES === 'true'
      ? require('../services/postgresService')
      : require('../services/googleSheetsService');
    const { idPlanejamento, nrOsOpp } = req.body;
    if (!idPlanejamento) return res.status(400).json({ error: 'idPlanejamento obrigatório' });

    const rows = await db.readSheet('Planejamentos');
    const plan = rows.find(p => p.ID === idPlanejamento);
    if (!plan) return res.status(404).json({ error: 'Planejamento não encontrado' });

    await db.updateRowById('Planejamentos', 'ID', idPlanejamento, { ...plan, Nr_OS_OPP: String(nrOsOpp || '') });
    res.json({ ok: true, idPlanejamento, nrOsOpp });
  } catch (err) { next(err); }
});

// ── POST /api/opp/auto-vincular — aplica sugestões automáticas em lote ───────
router.post('/auto-vincular', authMiddleware, async (req, res, next) => {
  try {
    const db = process.env.USE_POSTGRES === 'true'
      ? require('../services/postgresService')
      : require('../services/googleSheetsService');

    // vinculos: [{ idPlanejamento, nrOsOpp }]
    const { vinculos } = req.body;
    if (!Array.isArray(vinculos) || vinculos.length === 0)
      return res.status(400).json({ error: 'vinculos[] obrigatório' });

    const rows = await db.readSheet('Planejamentos');
    const mapa = Object.fromEntries(rows.map(p => [p.ID, p]));

    const resultados = []
    for (const { idPlanejamento, nrOsOpp } of vinculos) {
      const plan = mapa[idPlanejamento]
      if (!plan) { resultados.push({ idPlanejamento, ok: false, erro: 'Não encontrado' }); continue }
      await db.updateRowById('Planejamentos', 'ID', idPlanejamento, { ...plan, Nr_OS_OPP: String(nrOsOpp || '') })
      resultados.push({ idPlanejamento, nrOsOpp, ok: true })
    }
    res.json({ ok: true, total: resultados.length, resultados });
  } catch (err) { next(err); }
});

// ── POST /api/opp/aplicar-mapeamentos — aplica mapeamentos por nome parcial ──
router.post('/aplicar-mapeamentos', authMiddleware, async (req, res, next) => {
  try {
    const db = process.env.USE_POSTGRES === 'true'
      ? require('../services/postgresService')
      : require('../services/googleSheetsService');

    // mapeamentos: [{ nomeContém: string, os: string }]
    const MAPEAMENTOS = [
      // CODEVASF
      { nomeContém: 'CANAPI',                     os: '79' },
      { nomeContém: 'ABATEDOURO FRIGORÍ',          os: '95' },
      { nomeContém: 'MERCADO DO PRODUTOR',         os: '92' },
      { nomeContém: 'UNID. PESCADOS',              os: '91' },
      { nomeContém: 'UNID. DE LEITE',              os: '91' },
      { nomeContém: 'PRODUÇÃO DE ABELHAS',         os: '91' },
      { nomeContém: 'DERIVADOS DA MANDIOCA',       os: '93' },
      // Polícia Federal
      { nomeContém: 'DELEGACIA DE POLÍCIA FEDERAL', os: '90' },
      // EMBASA
      { nomeContém: 'SAA INEMA E PIMENTEIRA',      os: '78' },
      { nomeContém: 'SAA WENCESLAU',               os: '115' },
      { nomeContém: 'SAA RIO REAL',                os: '72' },
      { nomeContém: 'SAA LAFAIETE',                os: '73' },
      { nomeContém: 'SIAA SANTANA',                os: '3,77' },
      { nomeContém: 'SIAA FERRAZNÓPOLIS',          os: '77' },
      { nomeContém: 'SAA COMANDATUBA',             os: '160' },
      // Hospitais SESAB
      { nomeContém: 'HOSPITAL REGIONAL DE JUAZEIRO',         os: '40' },
      { nomeContém: 'HOSPITAL REGIONAL DE SANTO ANTÔNIO',   os: '38' },
      { nomeContém: 'HOSPITAL GERAL MANOEL VICTORINO',      os: '39' },
      // Fortim
      { nomeContém: 'REFORMA E.E.F. EMÍLIA QUEIROZ',        os: '127' },
      { nomeContém: 'LEVANTAMENTOS TOPOGRÁFICOS LOC. DE BARRO VERMELHO', os: '155' },
      { nomeContém: 'MANUTENÇÃO DE ARENINHAS',              os: '161' },
      // Apuiarés
      { nomeContém: 'CALÇADÃO DA RUA JOSÉ LOPES FILHO',     os: '152' },
      { nomeContém: 'LEVANTAMENTO TOPOGRÁFICO EM RUAS DA SEDE', os: '164' },
      { nomeContém: 'ARENINHA SÃO FRANCISCO',               os: '144' },
      { nomeContém: 'PP014275',                             os: '164' },
      // Nova Mamoré
      { nomeContém: 'CLUBE DOS SERVIDORES',                 os: '145' },
      { nomeContém: 'ESPAÇO ALTERNATIVO',                   os: '117' },
      { nomeContém: 'ESCOLA MUNICIPAL ONORINA',             os: '120' },
      { nomeContém: 'ESCOLA MUNICIPAL OZEIAS',              os: '120' },
      { nomeContém: 'ESCOLA MUNICIPAL EDUARDO VALVERDE',    os: '98' },
      { nomeContém: 'ESCOLA 5 SALAS',                      os: '162' },
      // Bezerros
      { nomeContém: 'DRENAGEM URBANA',                      os: '119' },
      // SENAR
      { nomeContém: 'AGUA BOA-MT',                          os: '149' },
      // DER/SE
      { nomeContém: 'REFORMA DA SEDE DO DER',               os: '43,62,63' },
      { nomeContém: 'LABORATÓRIO DER',                      os: '143' },
      // SEC CIDADES / UMARI
      { nomeContém: 'SAA UMARI',                            os: '87,88' },
      // Croatá
      { nomeContém: 'CV 993598',                            os: '104,105' },
      { nomeContém: 'CV 993599',                            os: '105' },
      // Solonópole
      { nomeContém: 'MONTE CASTELO',                        os: '49,50,65' },
    ];

    const rows = await db.readSheet('Planejamentos');
    const aprovados = rows.filter(p => p.Status === 'Aprovado');
    const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

    const resultados = [];
    for (const map of MAPEAMENTOS) {
      const busca = norm(map.nomeContém);
      const proj = aprovados.find(p => norm(p.Nome_Projeto).includes(busca));
      if (!proj) { resultados.push({ nomeContém: map.nomeContém, ok: false, erro: 'Não encontrado' }); continue; }
      if (proj.Nr_OS_OPP === map.os) { resultados.push({ nome: proj.Nome_Projeto, os: map.os, ok: true, status: 'ja_correto' }); continue; }
      await db.updateRowById('Planejamentos', 'ID', proj.ID, { ...proj, Nr_OS_OPP: map.os });
      resultados.push({ nome: proj.Nome_Projeto, osAntes: proj.Nr_OS_OPP, os: map.os, ok: true, status: 'atualizado' });
    }
    res.json({ ok: true, total: resultados.filter(r => r.status === 'atualizado').length, resultados });
  } catch (err) { next(err); }
});

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

// (removido — substituído pelo endpoint de centros de custo reais no final do arquivo)

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
      .filter(p => /^(ARQ|SAN|INF)-/i.test(p.Nome || '') && p.Status !== 'Arquivado')
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

// GET /api/opp/debug-categoria — mostra categorias únicas já no banco + amostra bruta da API
router.get('/debug-categoria', async (req, res, next) => {
  try {
    const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');

    // 1. Categorias que já estão no banco sincronizado
    const rows = await db.readSheet('Financeiro_OPP');
    const categoriasUnicas = [...new Set(rows.map(r => r.Categoria).filter(Boolean))].sort();
    const exemplos = rows.filter(r => r.Categoria).slice(0, 10).map(r => ({
      Categoria: r.Categoria,
      Tipo: r.Tipo,
      Descricao: r.Descricao,
    }));

    // 2. Tenta buscar amostra bruta da API (para ver campos disponíveis)
    let camposBrutos = null;
    try {
      const axios = require('axios');
      const BASE_URL = process.env.OPP_BASE_URL;
      const headers = {
        'access-token': process.env.OPP_API_KEY || process.env.OPP_TOKEN,
        'secret-access-token': process.env.OPP_SECRET || process.env.OPP_API_SECRET,
        'cache-control': 'no-cache',
      };
      const hoje = new Date();
      const umAnoAtras = new Date(hoje); umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
      const fmt = d => d.toISOString().split('T')[0];
      const r = await axios.get(`${BASE_URL}/contas-pagar?limit=3&data_inicio=${fmt(umAnoAtras)}&data_fim=${fmt(hoje)}`, { headers });
      const items = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
      camposBrutos = items.map(d => ({
        nome_conta: d.nome_conta,
        id_pedido: d.id_pedido,
        id_pedido_compra: d.id_pedido_compra,
        id_ordem_compra: d.id_ordem_compra,
        numero_pedido: d.numero_pedido,
        nr_pedido: d.nr_pedido,
        liquidado_pag: d.liquidado_pag,
        situacao: d.situacao,
        todos_campos: Object.keys(d),
      }));
    } catch (e) {
      camposBrutos = { erro: e.message };
    }

    res.json({
      totalNosBanco: rows.length,
      categoriasUnicas,
      exemplos,
      amostrabrutaAPI: camposBrutos,
    });
  } catch (err) { next(err); }
});

// GET /api/opp/debug-oc — inspeciona OrdensCompra_OPP e tenta buscar campos de pagamento da API
router.get('/debug-oc', async (req, res, next) => {
  try {
    const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');
    const ocs = await db.readSheet('OrdensCompra_OPP');
    const situacoes = [...new Set(ocs.map(o => o.Situacao).filter(Boolean))];

    // Tenta buscar detalhe de uma OC da API para ver campos disponíveis
    let ocDetalheAPI = null;
    let contasPagarPorOC = null;
    const ocTeste = ocs.find(o => o.ID_OC && o.Situacao === 'Atendido') || ocs[0];
    if (ocTeste) {
      try {
        ocDetalheAPI = await opp.oppRequest('GET', `/ordens-compra/${ocTeste.ID_OC}`);
      } catch (e) { ocDetalheAPI = { erro: e.message }; }

      try {
        // Tenta contas-pagar filtrado por id_pedido
        const hoje = new Date().toISOString().split('T')[0];
        const umAnoAtras = new Date(); umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
        const inicio = umAnoAtras.toISOString().split('T')[0];
        const r1 = await opp.oppRequest('GET', `/contas-pagar?id_pedido=${ocTeste.ID_OC}&data_inicio=${inicio}&data_fim=${hoje}&limit=5`);
        contasPagarPorOC = { filtro: `id_pedido=${ocTeste.ID_OC}`, resultado: r1 };
      } catch (e) {
        try {
          // Fallback: tenta endpoint de itens da OC
          const r2 = await opp.oppRequest('GET', `/ordens-compra/${ocTeste.ID_OC}/pagamentos`);
          contasPagarPorOC = { filtro: 'endpoint /pagamentos', resultado: r2 };
        } catch (e2) {
          contasPagarPorOC = { erro: e.message, erroPagamentos: e2.message };
        }
      }
    }

    res.json({
      total: ocs.length,
      situacoesUnicas: situacoes,
      ocTeste: ocTeste ? { ID_OC: ocTeste.ID_OC, Situacao: ocTeste.Situacao } : null,
      ocDetalheAPI,
      contasPagarPorOC,
      amostra: ocs.slice(0, 10).map(o => ({ ID_OC: o.ID_OC, Nome_Fornecedor: o.Nome_Fornecedor, Valor_Total: o.Valor_Total, Situacao: o.Situacao })),
    });
  } catch (err) { next(err); }
});

// POST /api/opp/corrigir-medicoes — corrige valores de medição com decimal errado (×1000) no Dados_JSON + limpa OS incorretas
router.post('/corrigir-medicoes', authMiddleware, async (req, res, next) => {
  try {
    const db = process.env.USE_POSTGRES === 'true'
      ? require('../services/postgresService')
      : require('../services/googleSheetsService');

    // Converte valor: se já for number JS usa direto; se string BR (25.020,00) converte
    const toNum = v => {
      if (typeof v === 'number') return v;
      return parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0;
    };

    const planejamentos = await db.readSheet('Planejamentos');

    const corrigidos = [];
    const erros = [];

    for (const plan of planejamentos) {
      let dados = {};
      try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch { continue; }

      const d = dados._baseline || dados;
      // valorContrato pode estar no _baseline ou no nível raiz do JSON
      const contrato = toNum(d.valorContrato) || toNum(dados.valorContrato) || toNum(plan.Valor_Contrato) || 0;
      if (contrato <= 0) continue;

      // Campos onde ficam as medições planejadas
      let meds = d.medicoesCronograma || d.medicoes || [];
      if (!Array.isArray(meds) || meds.length === 0) continue;

      let alterou = false;
      const detalhes = [];

      for (const mp of meds) {
        const campoValor = mp.valor !== undefined ? 'valor' : (mp.valorPlanejado !== undefined ? 'valorPlanejado' : null);
        if (!campoValor) continue;
        const v = toNum(mp[campoValor]);
        // Regra: valor < 1000, valor×1000 dentro do contrato (±15%) e contrato > 1000
        if (v > 0 && v < 1000 && (v * 1000) <= (contrato * 1.15)) {
          const novo = parseFloat((v * 1000).toFixed(2));
          detalhes.push({ de: v, para: novo });
          mp[campoValor] = novo;
          alterou = true;
        }
      }

      if (!alterou) continue;

      // Reconstrói o JSON com os valores corrigidos
      if (dados._baseline) dados._baseline = { ...dados._baseline, medicoesCronograma: d.medicoesCronograma, medicoes: d.medicoes };
      else { dados.medicoesCronograma = d.medicoesCronograma; dados.medicoes = d.medicoes; }

      try {
        await db.updateRowById('Planejamentos', 'ID', plan.ID, { ...plan, Dados_JSON: JSON.stringify(dados) });
        corrigidos.push({ projeto: plan.Nome_Projeto, contrato, medicoes: detalhes });
      } catch (e) {
        erros.push({ projeto: plan.Nome_Projeto, erro: e.message });
      }
    }

    // Limpa OS incorreta do projeto CORES VALE — busca por OS 95 em projetos que não são o ABATEDOURO
    const coresVale = planejamentos.find(p => {
      if ((p.Nr_OS_OPP || '') !== '95') return false;
      const nome = (p.Nome_Projeto || '').toUpperCase();
      return !nome.includes('ABATEDOURO');
    });
    let coresValeCorrigido = false;
    if (coresVale) {
      await db.updateRowById('Planejamentos', 'ID', coresVale.ID, { ...coresVale, Nr_OS_OPP: '' });
      coresValeCorrigido = true;
    }

    res.json({
      total_medicoes_corrigidas: corrigidos.length,
      cores_vale_os_removida: coresValeCorrigido,
      corrigidos,
      erros,
    });
  } catch (err) { next(err); }
});

// POST /api/opp/fix-especificos — corrige casos específicos que o algoritmo geral não captura
router.post('/fix-especificos', authMiddleware, async (req, res, next) => {
  try {
    const db = process.env.USE_POSTGRES === 'true'
      ? require('../services/postgresService')
      : require('../services/googleSheetsService');

    const planejamentos = await db.readSheet('Planejamentos');
    const resultados = [];

    // Casos específicos: nome parcial → campo valor incorreto → valor correto
    const FIXES_MEDICAO = [
      { nomeParcial: 'MONTE CASTELO',  valorErrado: 41.18,  valorCerto: 41180  },
      { nomeParcial: 'MIRANTE DO CAMARÁ', valorErrado: 2.49,   valorCerto: 2490   },
      { nomeParcial: 'PORTICO DE ENTRADA', valorErrado: 52.2,   valorCerto: 52200  },
      { nomeParcial: 'PORTICO DE ENTRADA', valorErrado: 52.20,  valorCerto: 52200  },
    ];

    for (const fix of FIXES_MEDICAO) {
      const plan = planejamentos.find(p =>
        (p.Nome_Projeto || '').toUpperCase().includes(fix.nomeParcial.toUpperCase())
      );
      if (!plan) { resultados.push({ fix: fix.nomeParcial, erro: 'não encontrado' }); continue; }

      let dados = {};
      try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch { continue; }
      const d = dados._baseline || dados;
      const meds = d.medicoesCronograma || d.medicoes || [];

      let alterou = false;
      for (const mp of meds) {
        const campo = mp.valor !== undefined ? 'valor' : 'valorPlanejado';
        const v = typeof mp[campo] === 'number' ? mp[campo] : parseFloat(mp[campo] || 0);
        if (Math.abs(v - fix.valorErrado) < 0.001) {
          mp[campo] = fix.valorCerto;
          alterou = true;
        }
      }

      if (alterou) {
        await db.updateRowById('Planejamentos', 'ID', plan.ID, { ...plan, Dados_JSON: JSON.stringify(dados) });
        resultados.push({ fix: fix.nomeParcial, de: fix.valorErrado, para: fix.valorCerto });
      } else {
        resultados.push({ fix: fix.nomeParcial, info: 'valor não encontrado nas medições' });
      }
    }

    // Remove OS 95 do CORES VALE (LEVANTAMENTOS TOPOGRÁFICOS — não é ABATEDOURO)
    const coresVale = planejamentos.find(p =>
      (p.Nome_Projeto || '').toUpperCase().includes('LEVANTAMENTOS TOPOGRÁFICOS') &&
      (p.Nr_OS_OPP || '').trim() === '95'
    );
    if (coresVale) {
      await db.updateRowById('Planejamentos', 'ID', coresVale.ID, { ...coresVale, Nr_OS_OPP: '' });
      resultados.push({ fix: 'CORES VALE', acao: 'Nr_OS_OPP removida' });
    } else {
      resultados.push({ fix: 'CORES VALE', info: 'não encontrado ou já sem OS 95' });
    }

    res.json({ total: resultados.length, resultados });
  } catch (err) { next(err); }
});

// GET /api/opp/centros-custo — lista centros de custo do OPP
router.get('/centros-custo', async (req, res, next) => {
  try {
    const busca = (req.query.busca || '').toLowerCase().trim();
    // Mesmo endpoint usado com sucesso no planejamento.js
    const data = await opp.oppRequest('GET', '/centros-custo?limit=500');
    let lista = Array.isArray(data) ? data : (data?.data || []);
    console.log(`[OPP CC] ${lista.length} centros. Primeiro:`, JSON.stringify(lista[0]));
    lista = lista.map(c => ({
      id: c.id_centro_custos || c.id,
      nome: c.desc_centro_custos || c.nome || c.descricao || '',
    })).filter(c => c.nome);
    if (busca) lista = lista.filter(c => c.nome.toLowerCase().includes(busca));
    res.json(lista);
  } catch (err) {
    console.error('[OPP CC] Erro:', err.message);
    next(err);
  }
});

module.exports = router;

