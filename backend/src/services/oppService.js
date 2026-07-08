const axios = require('axios');

// ── Configuração base ─────────────────────────────────────────────────────────

const BASE_URL = process.env.OPP_BASE_URL || '';
const APP_USER_AGENT = 'SistemaPAR-JotaBarros/1.0';

/**
 * Retorna os headers padrão de autenticação do OPP.
 * Todos os campos sensíveis vêm do .env — nunca hardcoded.
 */
function getHeaders() {
  return {
    'access-token': process.env.OPP_ACCESS_TOKEN,
    'secret-access-token': process.env.OPP_SECRET_ACCESS_TOKEN,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'User-Agent': APP_USER_AGENT,
  };
}

/**
 * Valida se as variáveis de ambiente do OPP estão configuradas.
 * Lança erro descritivo se não estiverem.
 */
function assertConfig() {
  if (!BASE_URL) throw new Error('[OPP] OPP_BASE_URL não configurado no .env');
  if (!process.env.OPP_ACCESS_TOKEN) throw new Error('[OPP] OPP_ACCESS_TOKEN não configurado no .env');
  if (!process.env.OPP_SECRET_ACCESS_TOKEN) throw new Error('[OPP] OPP_SECRET_ACCESS_TOKEN não configurado no .env');
}

/**
 * Wrapper de request para tratar erros da API do OPP de forma consistente.
 * A API do OPP retorna HTTP 200 mesmo para erros — verifica o campo `code`.
 */
async function oppRequest(method, path, data = null) {
  assertConfig();
  try {
    const config = {
      method,
      url: `${BASE_URL}${path}`,
      headers: getHeaders(),
    };
    if (data) config.data = data;

    const res = await axios(config);

    // OPP pode retornar 200 com code != 200 internamente
    if (res.data?.code && res.data.code !== 200) {
      throw new Error(`[OPP] Erro na API: ${res.data.status || res.data.message || JSON.stringify(res.data)}`);
    }

    return res.data?.data ?? res.data;
  } catch (err) {
    if (err.response) {
      const msg = err.response.data?.message || err.response.data?.status || err.message;
      throw new Error(`[OPP] ${err.response.status} — ${msg}`);
    }
    throw err;
  }
}

// ── CLIENTES ─────────────────────────────────────────────────────────────────

/**
 * Lista clientes do OPP.
 * @param {object} filtros — filtros opcionais (ex: { situacao_cliente: 'Ativo' })
 */
async function listarClientes(filtros = {}) {
  const todos = [];
  let offset = 0;
  const LIMIT = 100;
  while (true) {
    const params = new URLSearchParams({ ...filtros, limit: LIMIT, offset }).toString();
    const resultado = await oppRequest('GET', `/clientes?${params}`);
    const lista = Array.isArray(resultado) ? resultado : resultado?.data || resultado?.clientes || [];
    if (lista.length === 0) break;
    todos.push(...lista);
    if (lista.length < LIMIT) break;
    offset += LIMIT;
    if (offset > 10000) break;
  }
  return todos;
}

/**
 * Busca um cliente específico pelo ID do OPP.
 * @param {number} idCliente
 */
async function buscarCliente(idCliente) {
  return oppRequest('GET', `/clientes/${idCliente}`);
}

/**
 * Cadastra um novo cliente no OPP.
 * ATENÇÃO: isso impacta o sistema de produção.
 * @param {object} dadosCliente
 */
async function cadastrarCliente(dadosCliente) {
  const payload = {
    razao_cliente: dadosCliente.razao_cliente,
    tipo_pessoa: dadosCliente.tipo_pessoa || 'PJ',
    tipo_cadastro: dadosCliente.tipo_cadastro || 'Cliente',
    cnpj_cliente: dadosCliente.cnpj_cliente || '',
    fantasia_cliente: dadosCliente.fantasia_cliente || '',
    endereco_cliente: dadosCliente.endereco_cliente || '',
    numero_cliente: dadosCliente.numero_cliente || '',
    bairro_cliente: dadosCliente.bairro_cliente || '',
    complemento_cliente: dadosCliente.complemento_cliente || '',
    cep_cliente: dadosCliente.cep_cliente || '',
    cidade_cliente: dadosCliente.cidade_cliente || '',
    uf_cliente: dadosCliente.uf_cliente || '',
    contato_cliente: dadosCliente.contato_cliente || '',
    fone_cliente: dadosCliente.fone_cliente || '',
    celular_cliente: dadosCliente.celular_cliente || '',
    email_cliente: dadosCliente.email_cliente || '',
    situacao_cliente: dadosCliente.situacao_cliente || 'Ativo',
    observacoes_cliente: dadosCliente.observacoes_cliente || '',
  };

  console.log(`[OPP] Cadastrando cliente: ${payload.razao_cliente}`);
  return oppRequest('POST', '/clientes', payload);
}

/**
 * Atualiza um cliente existente no OPP.
 * ATENÇÃO: isso impacta o sistema de produção.
 * @param {number} idCliente
 * @param {object} dadosCliente
 */
async function atualizarCliente(idCliente, dadosCliente) {
  console.log(`[OPP] Atualizando cliente ID ${idCliente}`);
  return oppRequest('PUT', `/clientes/${idCliente}`, dadosCliente);
}

// ── ORDENS DE SERVIÇO (O.S.) ─────────────────────────────────────────────────

/**
 * Lista ordens de serviço do OPP.
 * @param {object} filtros — filtros opcionais
 */
async function listarOS(filtros = {}) {
  const params = new URLSearchParams(filtros).toString();
  return oppRequest('GET', `/ordens-servico${params ? '?' + params : ''}`);
}

/**
 * Busca uma O.S. específica pelo ID.
 * @param {number} idOS
 */
async function buscarOS(idOS) {
  return oppRequest('GET', `/ordens-servico/${idOS}`);
}

/**
 * Cria uma nova Ordem de Serviço no OPP.
 * ATENÇÃO: isso impacta o sistema de produção.
 * @param {object} dadosOS
 */
async function criarOS(dadosOS) {
  console.log(`[OPP] Criando O.S. para cliente ID ${dadosOS.id_cliente}`);
  return oppRequest('POST', '/ordens-servico', dadosOS);
}

/**
 * Reconcilia os dados do OPP com a tabela de Medições.
 * Se encontrar uma receita no OPP com o mesmo Nr_NF da medição, atualiza o status.
 */
async function reconcileMedicoes(db) {
  console.log('[OPP Reconcile] Iniciando reconciliação financeira...');

  const [medicoes, financeiroOPP] = await Promise.all([
    db.readSheet('Medicoes'),
    db.readSheet('Financeiro_OPP')
  ]);

  const updates = [];
  let count = 0;

  for (const m of medicoes) {
    if (!m.Nr_NF || m.Status_Financeiro === 'Recebido') continue;

    // Busca no financeiro sincronizado do OPP
    const match = financeiroOPP.find(f =>
      f.Tipo === 'Receita' &&
      (f.ID_OPP === m.Nr_NF || f.Descricao.includes(m.Nr_NF))
    );

    if (match) {
      let novoStatus = m.Status_Financeiro;
      if (match.Situacao === 'Liquidado') {
        novoStatus = 'Recebido';
      } else if (match.Situacao === 'Aberto') {
        novoStatus = 'NF Emitida';
      }

      if (novoStatus !== m.Status_Financeiro) {
        updates.push({
          id: m.ID,
          data: {
            Status_Financeiro: novoStatus,
            Data_Pagamento_Real: match.Data_Vencimento || '', // ou data de liquidação se disponível
            Atualizado_Via: 'OPP Sync'
          }
        });
        count++;
      }
    }
  }

  // Executa os updates em lote
  for (const u of updates) {
    await db.updateRowById('Medicoes', 'ID', u.id, u.data);
  }

  console.log(`[OPP Reconcile] Concluído. ${count} medições atualizadas.`);
  return count;
}

// Alias de compatibilidade retroativa
async function listarLancamentos(filtros = {}) {
  // Agrega receitas + despesas num só retorno
  const [r, d] = await Promise.allSettled([listarReceitas(filtros), listarDespesas(filtros)]);
  const receitas = r.status === 'fulfilled' ? (Array.isArray(r.value) ? r.value : r.value?.data || []) : [];
  const despesas = d.status === 'fulfilled' ? (Array.isArray(d.value) ? d.value : d.value?.data || []) : [];
  return [...receitas, ...despesas];
}

async function buscarLancamentosPorOC(ordemCompra) {
  return oppRequest('GET', `/contas-receber?nome_conta=${encodeURIComponent(ordemCompra)}`);
}


/**
 * Lista receitas (contas a receber) do OPP.
 * @param {object} filtros — ex: { data_inicio, data_fim, situacao }
 */
async function listarReceitas(filtros = {}) {
  return listarComPaginacao('/contas-receber', filtros);
}

async function listarDespesas(filtros = {}) {
  return listarComPaginacao('/contas-pagar', filtros);
}

// Busca todas as páginas da API OPP (máximo 250 por página)
async function listarComPaginacao(endpoint, filtros = {}) {
  assertConfig();
  const LIMIT = 250;
  let offset = 0;
  const todos = [];
  while (true) {
    const params = new URLSearchParams({ ...filtros, limit: LIMIT, offset }).toString();
    const res = await oppRequest('GET', `${endpoint}?${params}`);
    const lista = Array.isArray(res) ? res : (res?.data || []);
    todos.push(...lista);
    if (lista.length < LIMIT) break;
    offset += LIMIT;
    if (offset > 5000) break; // segurança
  }
  return todos;
}

/**
 * Sincroniza receitas e despesas do OPP com o banco local (Google Sheets).
 * Puxa os últimos 12 meses e salva na aba Financeiro_OPP.
 * @param {object} db — instância do googleSheetsService
 */
let _syncEmAndamento = false;
async function syncReceitasDespesas(db) {
  if (_syncEmAndamento) { console.log('[OPP Sync] Já em andamento, ignorando.'); return { totalReceitas: 0, totalDespesas: 0, medicoesReconciliadas: 0 }; }
  _syncEmAndamento = true;
  try {
  const agora = new Date();
  const inicio = new Date(agora);
  inicio.setMonth(inicio.getMonth() - 12);
  const fmt = (d) => d.toISOString().split('T')[0];

  console.log('[OPP Sync] Iniciando sync de receitas/despesas do OPP...');

  const [receitas, despesas] = await Promise.allSettled([
    listarReceitas({ data_inicio: fmt(inicio), data_fim: fmt(agora) }),
    listarDespesas({ data_inicio: fmt(inicio), data_fim: fmt(agora) }),
  ]);

  const rows = [];

  if (receitas.status === 'fulfilled') {
    const lista = Array.isArray(receitas.value) ? receitas.value : (receitas.value?.data || []);
    for (const r of lista) {
      rows.push({
        ID_OPP: String(r.id_conta_rec || ''),
        Tipo: 'Receita',
        Profissional: r.centro_custos_rec || r.profissional || r.profissional_rec || r.nome_profissional || r.centro_custo || '',
        Categoria: r.categoria || r.nome_categoria || r.categoria_rec || '1.0 Receitas',
        Descricao: r.nome_conta || r.observacoes_rec || '',
        Valor: String(r.valor_rec || 0),
        Data_Vencimento: r.vencimento_rec || '',
        Data_Competencia: r.data_emissao || '',
        Situacao: r.liquidado_rec === 'Sim' ? 'Liquidado' : (r.situacao || 'Aberto'),
        ID_Cliente_OPP: String(r.id_cliente || ''),
        Nome_Cliente: r.nome_cliente || '',
        Nr_Documento: r.n_documento_rec || '',
        Nr_OS_OPP: (() => {
          const m = (r.observacoes_rec || '').match(/ordem de servi[çc]o\s+n[º°]?\s*(\d+)/i);
          return m ? m[1] : (r.nr_os || r.numero_os || '');
        })(),
        Sincronizado_Em: agora.toISOString(),
      });
    }
  }

  if (despesas.status === 'fulfilled') {
    const lista = Array.isArray(despesas.value) ? despesas.value : (despesas.value?.data || []);
    for (const d of lista) {
      // Ignora apenas contas estornadas (situacao = "Conta estornada.")
      if ((d.situacao || '').toLowerCase().includes('estornada')) continue;
      // Classificação automática de categoria pelo nome (fallback se API não retornar)
      const cat = d.categoria || d.nome_categoria || d.categoria_pag || '';
      const catClassificada = cat || (
        (d.nome_conta || '').toLowerCase().includes('subcontrat') ||
        (d.nome_conta || '').toLowerCase().includes('material') ||
        (d.nome_conta || '').toLowerCase().includes('terceiro')
          ? '2.0 Custos Diretos de Projetos'
          : '3.0 Despesas Operacionais'
      );
      rows.push({
        ID_OPP: String(d.id_conta_pag || ''),
        Tipo: 'Despesa',
        Profissional: d.profissional || d.profissional_pag || d.nome_profissional || d.centro_custo || '',
        Categoria: catClassificada,
        Descricao: d.nome_conta || d.observacoes_pag || '',
        Valor: String(parseFloat(d.valor_pag || 0) || parseFloat(d.valor_pago || 0) || 0),
        Data_Vencimento: d.vencimento_pag || '',
        Data_Competencia: d.data_emissao || '',
        Situacao: d.liquidado_pag === 'Sim' ? 'Liquidado' : (d.situacao || 'Aberto'),
        ID_Cliente_OPP: String(d.id_fornecedor || ''),
        Nome_Cliente: d.nome_fornecedor || '',
        Nr_Documento: d.n_documento_pag || '',
        Nr_OS_OPP: d.nr_os || d.numero_os || '',
        // Extrai número da OC das observações: "Ref. a ordem de compra nº 600, ..."
        OC: (() => {
          const obs = d.observacoes_pag || '';
          const nome = d.nome_conta || '';
          // "Ref. a ordem de compra nº 600, ..." ou "Ordem nro. 600\n..." ou "Ordem de Compra 600"
          const m = obs.match(/ordem(?:\s+de\s+compra)?\s+n(?:r?o\.?|[º°])\s*(\d+)/i)
                 || nome.match(/ordem(?:\s+de\s+compra)?\s+(\d+)/i);
          return m ? m[1] : '';
        })(),
        Sincronizado_Em: agora.toISOString(),
      });
    }
  }

  if (rows.length > 0) {
    // Deduplica por ID_OPP antes de inserir
    const rowsUnicos = Object.values(Object.fromEntries(rows.map(r => [r.ID_OPP, r])));
    console.log(`[OPP Sync] ${rows.length} linhas -> ${rowsUnicos.length} únicas após deduplicação`);
    try {
      await db.clearSheetData('Financeiro_OPP');
    } catch { /* Aba pode não existir ainda */ }
    await db.insertManyRows('Financeiro_OPP', rowsUnicos);
  }

  console.log(`[OPP Sync] Sync concluído: ${rows.filter(r => r.Tipo === 'Receita').length} receitas, ${rows.filter(r => r.Tipo === 'Despesa').length} despesas.`);

  // Roda reconciliação automática após o sync
  const atualizados = await reconcileMedicoes(db);

  _syncEmAndamento = false;
  return {
    totalReceitas: rows.filter(r => r.Tipo === 'Receita').length,
    totalDespesas: rows.filter(r => r.Tipo === 'Despesa').length,
    medicoesReconciliadas: atualizados
  };
  } catch (err) { _syncEmAndamento = false; throw err; }
}

/**
 * Cria uma O.S. no OPP a partir de um planejamento aprovado do Sistema PAR.
 * @param {object} planejamento — linha do Google Sheets (Planejamentos)
 * @param {object} projeto — linha do Google Sheets (Projetos_Contratos)
 */
async function criarOSDoPlano(planejamento, projeto) {
  const dados = (() => {
    try { return JSON.parse(planejamento.Dados_JSON || '{}'); } catch { return {}; }
  })();

  const payload = {
    problema_ordem: `${planejamento.Nome_Projeto || projeto?.Nome || 'Projeto PAR'}`,
    data_pedido: new Date().toISOString().split('T')[0],
    data_entrega: planejamento.Data_Entrega_Contrato || dados.dataEntregaContrato || '',
    situacao: 'Aberta',
    obs_pedido: [
      `Criado automaticamente pelo Sistema PAR em ${new Date().toLocaleString('pt-BR')}.`,
      `Nr. Contrato: ${planejamento.Nr_Contrato_OS || '—'}`,
      `Responsável PAR: ${planejamento.Resp_Planejamento || '—'}`,
      `Setor: ${planejamento.Setor || '—'}`,
    ].join('\n'),
  };

  // Vincula ao cliente OPP se o projeto tiver id_OPP_cliente
  if (projeto?.ID_OPP_Cliente) {
    payload.id_cliente = parseInt(projeto.ID_OPP_Cliente);
  }

  console.log(`[OPP] Criando O.S. no OPP para: ${payload.descricao_os}`);
  return oppRequest('POST', '/ordens-servico', payload);
}

// ── VERIFICAÇÃO DE CONECTIVIDADE ──────────────────────────────────────────────

/**
 * Testa a conexão com a API do OPP.
 * Faz uma listagem leve para validar autenticação.
 * @returns {{ ok: boolean, message: string }}
 */
async function testarConexao() {
  try {
    assertConfig();
    await listarClientes({ limit: 1 });
    return { ok: true, message: 'Conexão com OPP estabelecida com sucesso.' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

// Busca ordens de compra do OPP e salva na aba OrdensCompra_OPP
// Permite match via id_pedido (= OC do ClickUp)
async function syncOrdensCompra(db) {
  console.log('[OPP OC] Sincronizando ordens de compra...');
  const todos = await listarComPaginacao('/ordens-compra');
  const rows = todos
    .filter(o => o.id_pedido != null && String(o.id_pedido).trim() !== '')
    .map(o => ({
      ID_OC: String(o.id_pedido),
      ID_Ordem_OPP: String(o.id_ordem || ''),
      Nome_Fornecedor: o.nome_cliente || '',
      Valor_Total: String(o.valor_total_nota || 0),
      Data_Pedido: o.data_pedido || '',
      Situacao: o.situacao_pedido || o.status_pedido || '',
      Observacao: o.obs_pedido || '',
      Sincronizado_Em: new Date().toISOString(),
    }));
  try { await db.clearSheetData('OrdensCompra_OPP'); } catch {}
  if (rows.length > 0) await db.insertManyRows('OrdensCompra_OPP', rows);
  console.log(`[OPP OC] ${rows.length} ordens de compra sincronizadas.`);
  return rows.length;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // Clientes
  listarClientes,
  buscarCliente,
  cadastrarCliente,
  atualizarCliente,

  // Ordens de Serviço
  listarOS,
  buscarOS,
  criarOS,
  criarOSDoPlano,

  // Financeiro
  listarLancamentos,
  buscarLancamentosPorOC,
  listarReceitas,
  listarDespesas,
  syncReceitasDespesas,
  syncOrdensCompra,
  reconcileMedicoes,

  // Utilitários
  testarConexao,
  oppRequest, // exposto para endpoints específicos quando a doc expandir
};

