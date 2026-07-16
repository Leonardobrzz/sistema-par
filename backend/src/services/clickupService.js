const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = process.env.USE_POSTGRES === 'true'
  ? require('./postgresService')
  : require('./googleSheetsService');
const { broadcast } = require('./websocketService');

const BASE_URL = 'https://api.clickup.com/api/v2';
// Limite de 50MB por resposta para evitar OOM no parse de JSON grandes
const axiosClickUp = axios.create({ maxContentLength: 50 * 1024 * 1024, maxBodyLength: 50 * 1024 * 1024 });

function getHeaders() {
  return { Authorization: process.env.CLICKUP_API_TOKEN };
}

// ── Funções de leitura da API ClickUp ────────────────────────────────────────

async function getSpaces(teamId) {
  const res = await axios.get(`${BASE_URL}/team/${teamId}/space?archived=false`, { headers: getHeaders() });
  return res.data.spaces || [];
}

async function getFolders(spaceId) {
  const res = await axios.get(`${BASE_URL}/space/${spaceId}/folder?archived=false`, { headers: getHeaders() });
  return res.data.folders || [];
}

async function getLists(folderId) {
  const res = await axios.get(`${BASE_URL}/folder/${folderId}/list?archived=false`, { headers: getHeaders() });
  return res.data.lists || [];
}

async function getFolderlessLists(spaceId) {
  const res = await axios.get(`${BASE_URL}/space/${spaceId}/list?archived=false`, { headers: getHeaders() });
  return res.data.lists || [];
}

async function getTasks(listId, page = 0) {
  const res = await axiosClickUp.get(`${BASE_URL}/list/${listId}/task`, {
    headers: getHeaders(),
    params: {
      archived: false,
      include_closed: true,
      subtasks: true,
      page,
    },
  });
  return res.data.tasks || [];
}

// Extrai o valor de um campo personalizado pelo nome (case-insensitive)
function getCustomField(task, nome) {
  const field = (task.custom_fields || []).find(f => f.name?.toLowerCase() === nome.toLowerCase());
  if (!field || field.value === null || field.value === undefined) return '';
  if (field.type === 'drop_down') {
    return field.type_config?.options?.find(o => o.orderindex === field.value)?.name || '';
  }
  if (field.type === 'number') return String(field.value);
  return field.value || '';
}

async function getListFields(listId) {
  const res = await axios.get(`${BASE_URL}/list/${listId}/field`, { headers: getHeaders() });
  return res.data.fields || [];
}

async function getTimeEntries(teamId, startDate, endDate) {
  const res = await axios.get(`${BASE_URL}/team/${teamId}/time_entries`, {
    headers: getHeaders(),
    params: {
      start_date: startDate || Date.now() - 180 * 24 * 60 * 60 * 1000,
      end_date: endDate || Date.now(),
    },
  });
  return res.data.data || [];
}

async function getTaskById(taskId) {
  const res = await axios.get(`${BASE_URL}/task/${taskId}`, {
    headers: getHeaders(),
    params: { include_subtasks: true, custom_fields: true },
  });
  return res.data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isClosed(task) {
  const type = task.status?.type?.toLowerCase() || '';
  const name = task.status?.status?.toLowerCase() || '';
  // ClickUp usa type='closed' para o status especial Closed,
  // type='done' para status customizados de conclusão (ex: CONCLUIDO, DONE, FINALIZADO),
  // e alguns workspaces usam status names como 'complete', 'concluído', 'concluido'
  return (
    type === 'closed' ||
    type === 'done' ||
    name === 'complete' ||
    name === 'completed' ||
    name === 'concluído' ||
    name === 'concluido' ||
    name === 'finalizado' ||
    name === 'done'
  );
}

function isOverdue(task) {
  if (!task.due_date || isClosed(task)) return false;
  return parseInt(task.due_date) < Date.now();
}

// Retorna quantos dias faltam para o prazo (negativo = já atrasado)
function daysUntilDue(task) {
  if (!task.due_date || isClosed(task)) return null;
  const diff = parseInt(task.due_date) - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function hasNoAssignee(task) {
  return !isClosed(task) && (!task.assignees || task.assignees.length === 0);
}

// ── Detecta setor pelo prefixo do nome da lista (PROJETOS 2025) ──────────────
// ARQ → Arquitetura, SAN → Saneamento, INF/INFRA → Infraestrutura, ADM → Administrativo
function detectarSetorPorPrefixo(nomeLista) {
  const n = (nomeLista || '').toUpperCase();
  if (n.startsWith('ARQ')) return 'Arquitetura';
  if (n.startsWith('SAN')) return 'Saneamento';
  if (n.startsWith('INF')) return 'Infraestrutura';
  if (n.startsWith('ADM')) return 'Administrativo';
  return '';
}

// ── Coletar todas as listas de um space ──────────────────────────────────────

async function getAllListsFromSpace(spaceId) {
  const result = [];
  try {
    const folders = await getFolders(spaceId);
    console.log(`[ClickUp] Space ${spaceId}: ${folders.length} pasta(s) encontradas: ${folders.map(f => f.name).join(', ')}`);
    for (const folder of folders) {
      try {
        // Pasta = Cliente — não vira projeto, apenas as listas dentro viram
        const lists = await getLists(folder.id);
        console.log(`[ClickUp] Pasta "${folder.name}": ${lists.length} lista(s)`);
        for (const list of lists) {
          result.push({ ...list, _isFolder: false, _folderId: folder.id, _folderName: folder.name, _spaceId: spaceId });
        }
      } catch (err) {
        console.error(`[ClickUp] Erro ao buscar listas da pasta "${folder.name}" (${folder.id}):`, err.message);
      }
    }
  } catch (err) {
    console.error(`[ClickUp] Erro ao buscar pastas do space ${spaceId}:`, err.message);
  }
  try {
    const folderlessLists = await getFolderlessLists(spaceId);
    for (const list of folderlessLists) {
      result.push({ ...list, _isFolder: false, _folderId: null, _folderName: null, _spaceId: spaceId });
    }
  } catch (err) {
    console.error(`[ClickUp] Erro ao buscar listas sem pasta do space ${spaceId}:`, err.message);
  }
  return result;
}

// ── Auto-importar listas como projetos ───────────────────────────────────────

async function autoImportProjects(items) {
  const existing = await db.readSheet('Projetos_Contratos');
  const existingIds = new Set(existing.map((p) => p.ID_ClickUp).filter(Boolean));

  const novosProjetos = [];
  for (const item of items) {
    if (existingIds.has(item.id)) continue;

    // No espaço PROJETOS 2025: Pasta = Cliente, Lista = Projeto
    // Pastas não viram projetos — apenas listas são importadas como projetos
    if (item._isFolder) continue;

    const setor = detectarSetorPorPrefixo(item.name);
    const projeto = {
      ID_Projeto: uuidv4(),
      Nome: item.name,
      Cliente: item._folderName || '',   // Pasta = nome do cliente
      Valor_Global: '0',
      Teto_Terc_Perc: '30',
      Teto_Terc_Valor: '0',
      ID_ClickUp: item.id,
      Centro_Custo_OPP: '',
      Status: (() => {
        const s = (item.status?.status || '').toLowerCase().trim();
        if (s === 'closed' || s === 'complete' || s === 'concluído' || s === 'concluido' || s === 'fechado') return 'Concluído';
        if (s === 'backlog' || s === 'a planejar') return 'Backlog';
        if (s === 'paralisado') return 'Paralisado';
        if (s === 'em analise' || s === 'em análise') return 'Em Análise';
        if (s === 'arquivado') return 'Arquivado';
        if (s === 'aguardando faturamento') return 'Aguardando Faturamento';
        if (s === 'pendencia' || s === 'pendência') return 'Pendência';
        return 'Em Andamento';
      })(),
      Progresso_Perc: '0',
      Data_Inicio: item.start_date ? new Date(parseInt(item.start_date)).toISOString().split('T')[0] : '',
      Data_Entrega_Contrato: item.due_date ? new Date(parseInt(item.due_date)).toISOString().split('T')[0] : '',
      Data_Entrega_Planejada: item.due_date ? new Date(parseInt(item.due_date)).toISOString().split('T')[0] : '',
      Empresa: 'Jota Barros Projetos',
      Setor: setor,
      Tipologia: '',
      Link_ClickUp: `https://app.clickup.com/${process.env.CLICKUP_TEAM_ID}/v/li/${item.id}`,
      Criado_Em: new Date().toISOString(),
      Atualizado_Em: new Date().toISOString(),
      Responsavel: '',
    };

    novosProjetos.push(projeto);
    existingIds.add(item.id);
    console.log(`[ClickUp] Na fila para importação Lista: ${item.name} | Setor: ${setor || '(sem prefixo)'} | Cliente: ${item._folderName || '—'}`);
  }

  if (novosProjetos.length > 0) {
    await db.insertManyRows('Projetos_Contratos', novosProjetos);
    console.log(`[ClickUp] ${novosProjetos.length} novos projetos importados do ClickUp em lote.`);
    broadcast('sync', { type: 'PROJETOS_IMPORTADOS', count: novosProjetos.length });
  }
}

// ── Gerar alertas ─────────────────────────────────────────────────────────────

async function gerarAlertas(tasks, projetos) {
  // Projetos baseados em pasta: Nome === Setor e Setor não vazio
  // Projetos baseados em lista avulsa: Setor vazio
  const projectByFolder = {}; // folderId → projeto-pasta
  const projectByList = {};   // listId → projeto-lista
  for (const p of projetos) {
    if (!p.ID_ClickUp) continue;
    const isFolderProject = p.Setor && p.Setor.trim() !== '' && p.Nome === p.Setor;
    if (isFolderProject) {
      projectByFolder[p.ID_ClickUp] = p;
    } else {
      projectByList[p.ID_ClickUp] = p;
    }
  }

  const agora = new Date().toISOString();

  // Monta o conjunto desejado de alertas com IDs determinísticos (tipo|taskId)
  const desired = new Map(); // id → alert

  for (const task of tasks) {
    // Prioriza projeto-pasta (via folderId); fallback para projeto-lista (via listId)
    const projeto = (task._folderId && projectByFolder[task._folderId]) || projectByList[task._listId];
    if (!projeto) continue;
    const dias = daysUntilDue(task);

    const taskUrl = `https://app.clickup.com/t/${task.id}`;

    if (dias !== null && dias < 0) {
      const diasStr = Math.abs(dias) === 1 ? '1 dia' : `${Math.abs(dias)} dias`;
      const id = `ATRASADA_${task.id}`;
      desired.set(id, {
        ID: id, Tipo_Alerta: 'TAREFA_ATRASADA', ID_Projeto: projeto.ID_Projeto,
        Mensagem: `[ATRASADA ${diasStr}] "${task.name}" — ${projeto.Nome}`,
        Data_Geracao: agora, Setor_Destino: 'Coordenador', Visto_Por: '', Status: 'Ativo', Nivel: 'error',
        Link_ClickUp: taskUrl,
      });
    }
    if (dias === 1) {
      const id = `VENCE_AMANHA_${task.id}`;
      desired.set(id, {
        ID: id, Tipo_Alerta: 'VENCE_AMANHA', ID_Projeto: projeto.ID_Projeto,
        Mensagem: `[VENCE AMANHÃ] "${task.name}" — ${projeto.Nome}`,
        Data_Geracao: agora, Setor_Destino: 'Coordenador', Visto_Por: '', Status: 'Ativo', Nivel: 'error',
        Link_ClickUp: taskUrl,
      });
    }
    if (dias === 2 || dias === 3) {
      const id = `VENCE_EM_BREVE_${task.id}`;
      desired.set(id, {
        ID: id, Tipo_Alerta: 'VENCE_EM_BREVE', ID_Projeto: projeto.ID_Projeto,
        Mensagem: `[VENCE EM ${dias} DIAS] "${task.name}" — ${projeto.Nome}`,
        Data_Geracao: agora, Setor_Destino: 'Coordenador', Visto_Por: '', Status: 'Ativo', Nivel: 'warning',
        Link_ClickUp: taskUrl,
      });
    }
    if (hasNoAssignee(task)) {
      const id = `SEM_RESP_${task.id}`;
      desired.set(id, {
        ID: id, Tipo_Alerta: 'SEM_RESPONSAVEL', ID_Projeto: projeto.ID_Projeto,
        Mensagem: `[SEM RESPONSÁVEL] "${task.name}" — ${projeto.Nome}`,
        Data_Geracao: agora, Setor_Destino: 'PO', Visto_Por: '', Status: 'Ativo', Nivel: 'error',
        Link_ClickUp: taskUrl,
      });
    }
  }

  for (const p of projetos) {
    if (!p.Data_Entrega_Contrato && p.Status?.includes('Em Andamento')) {
      const id = `SEM_PRAZO_${p.ID_Projeto}`;
      desired.set(id, {
        ID: id, Tipo_Alerta: 'PRAZO_NAO_DEFINIDO', ID_Projeto: p.ID_Projeto,
        Mensagem: `[SEM PRAZO] Projeto "${p.Nome}" não tem data de entrega`,
        Data_Geracao: agora, Setor_Destino: 'Comercial', Visto_Por: '', Status: 'Ativo', Nivel: 'warning',
        Link_ClickUp: p.Link_ClickUp || '',
      });
    }
  }

  // Tipos gerenciados pelo ClickUp (IDs determinísticos)
  const CLICKUP_TIPOS = new Set(['TAREFA_ATRASADA', 'VENCE_AMANHA', 'VENCE_EM_BREVE', 'SEM_RESPONSAVEL', 'PRAZO_NAO_DEFINIDO']);

  // Lê alertas existentes
  const existentes = await db.readSheet('Alertas');

  // Preserva alertas fora do domínio ClickUp (gerados pelo alertService.js)
  const naoClickUp = existentes.filter(a =>
    !CLICKUP_TIPOS.has(a.Tipo_Alerta) &&
    (a.Status === 'ativo' || a.Status === 'Ativo')
  );

  // Preserva alertas ClickUp já lidos pelo usuário que saíram do desired
  const lidosClickUp = existentes.filter(a =>
    CLICKUP_TIPOS.has(a.Tipo_Alerta) &&
    a.Visto_Por && a.Visto_Por.trim() !== '' &&
    !desired.has(a.ID)
  );

  // Lista final: alertas externos + lidos preservados + desired atual (normalizado para 'ativo')
  const desiredNormalized = [...desired.values()].map(a => ({ ...a, Status: 'ativo' }));
  const final = [...naoClickUp, ...lidosClickUp, ...desiredNormalized];

  await db.clearSheetData('Alertas');
  if (final.length > 0) {
    await db.insertManyRows('Alertas', final);
  }

  broadcast('alert', { count: desired.size, alertas: desiredNormalized });
  console.log(`[ClickUp] Alertas: ${desired.size} ativos, ${lidosClickUp.length} lidos preservados, ${naoClickUp.length} externos mantidos.`);
}

// ── Atualizar status e progresso dos projetos ─────────────────────────────────

async function syncProjectStatuses(tasks, projetos, lists = []) {
  // Mapa listId → tasks
  const tasksByList = {};
  // Mapa folderId → tasks (para projetos-pasta que agregam todas as sub-listas)
  const tasksByFolder = {};
  for (const t of tasks) {
    if (!tasksByList[t._listId]) tasksByList[t._listId] = [];
    tasksByList[t._listId].push(t);
    if (t._folderId) {
      if (!tasksByFolder[t._folderId]) tasksByFolder[t._folderId] = [];
      tasksByFolder[t._folderId].push(t);
    }
  }

  // Mapa id → item (lista ou pasta) para backfill de datas
  const itemById = {};
  for (const l of lists) {
    itemById[l.id] = l;
    // Para pastas (_isFolder), também indexa pelo folderId
    if (l._isFolder) itemById[l._folderId] = l;
  }

  for (const project of projetos) {
    if (!project.ID_ClickUp) continue;
    // Projetos-pasta: agrega tarefas de todas as sub-listas via folderId
    // Projetos-lista: usa tasksByList
    const projectTasks = tasksByFolder[project.ID_ClickUp]?.length
      ? tasksByFolder[project.ID_ClickUp]
      : (tasksByList[project.ID_ClickUp] || []);
    if (projectTasks.length === 0) continue;

    const total = projectTasks.length;
    const done = projectTasks.filter(isClosed).length;
    const atrasadas = projectTasks.filter(isOverdue).length;
    const progresso = total > 0 ? Math.round((done / total) * 100) : 0;

    // Coleta responsáveis únicos de todas as tarefas do projeto
    const responsaveisSet = new Set();
    for (const t of projectTasks) {
      for (const a of (t.assignees || [])) {
        if (a.username) responsaveisSet.add(a.username);
      }
    }
    const novoResponsavel = [...responsaveisSet].join(', ');

    // Status da lista no ClickUp tem prioridade
    const itemInfo2 = itemById[project.ID_ClickUp];
    const listStatusRaw = (itemInfo2?.status?.status || '').toLowerCase();
    const listStatusClosed = listStatusRaw === 'closed' || listStatusRaw === 'complete' || listStatusRaw === 'fechado' || listStatusRaw === 'concluído' || listStatusRaw === 'concluido';

    let novoStatus = project.Status;
    if (listStatusClosed || done === total) {
      novoStatus = 'Concluído';
    } else if (listStatusRaw === 'backlog' || listStatusRaw === 'a planejar') {
      novoStatus = 'Backlog';
    } else if (listStatusRaw === 'paralisado') {
      novoStatus = 'Paralisado';
    } else if (listStatusRaw === 'em analise' || listStatusRaw === 'em análise') {
      novoStatus = 'Em Análise';
    } else if (listStatusRaw === 'arquivado') {
      novoStatus = 'Arquivado';
    } else if (listStatusRaw === 'aguardando faturamento') {
      novoStatus = 'Aguardando Faturamento';
    } else if (listStatusRaw === 'pendencia' || listStatusRaw === 'pendência') {
      novoStatus = 'Pendência';
    } else if (atrasadas > 0) {
      novoStatus = 'Em Andamento (Atrasado)';
    } else {
      novoStatus = 'Em Andamento';
    }

    const mudouStatus = novoStatus !== project.Status;
    const mudouProgresso = String(progresso) !== String(project.Progresso_Perc);
    const mudouResponsavel = novoResponsavel !== (project.Responsavel || '');

    // Backfill: preencher Cliente e Data_Entrega_Contrato se estiverem vazios
    const itemInfo = itemById[project.ID_ClickUp];
    const clienteAtual = project.Cliente || '';
    // Para pasta: o próprio nome da pasta é o cliente
    // Para lista avulsa: usa _folderName (caso tenha)
    const novoCliente = clienteAtual || (itemInfo?.name && itemInfo._isFolder ? itemInfo.name : (itemInfo?._folderName || ''));
    const vencAtual = project.Data_Entrega_Contrato || '';
    const novoVenc = vencAtual || (itemInfo?.due_date ? new Date(parseInt(itemInfo.due_date)).toISOString().split('T')[0] : '');
    const mudouCliente = novoCliente !== clienteAtual;
    const mudouVenc = novoVenc !== vencAtual;

    if (mudouStatus || mudouProgresso || mudouCliente || mudouVenc || mudouResponsavel) {
      await db.updateRowById('Projetos_Contratos', 'ID_Projeto', project.ID_Projeto, {
        ...project,
        Status: novoStatus,
        Progresso_Perc: String(progresso),
        Total_Tarefas: total,
        Cliente: novoCliente,
        Data_Entrega_Contrato: novoVenc,
        Data_Entrega_Planejada: project.Data_Entrega_Planejada || novoVenc,
        Responsavel: novoResponsavel || project.Responsavel || '',
        Atualizado_Em: new Date().toISOString(),
      });
      if (mudouStatus) console.log(`[ClickUp] Projeto "${project.Nome}" status → ${novoStatus}`);
      if (mudouCliente) console.log(`[ClickUp] Projeto "${project.Nome}" cliente → ${novoCliente}`);
      if (mudouResponsavel) console.log(`[ClickUp] Projeto "${project.Nome}" responsável → ${novoResponsavel || '(sem)'}`);
    }
  }
}

// ── Sincronização completa ────────────────────────────────────────────────────

let _syncing = false; // lock para evitar execuções simultâneas

async function syncClickUp(idProjeto = null) {
  if (_syncing) {
    console.log('[ClickUp] Sync já em andamento, ignorando nova chamada.');
    return;
  }
  _syncing = true;
  try {
    if (idProjeto) {
      await syncSingleProject(idProjeto);
    } else {
      await _doSync();
    }
  } finally {
    _syncing = false;
  }
}

async function syncSingleProject(idProjeto) {
  console.log(`[ClickUp] Sync focado no projeto: ${idProjeto}`);
  const teamId = process.env.CLICKUP_TEAM_ID;
  
  // Buscar o projeto e garantir que tem ID do ClickUp
  const projeto = await db.findOne('Projetos_Contratos', (r) => r.ID_Projeto === idProjeto);
  if (!projeto || !projeto.ID_ClickUp) {
    console.warn(`[ClickUp] Projeto ${idProjeto} não encontrado ou sem vínculo ClickUp.`);
    return;
  }

  // Projetos de pasta (estilo Jota Barros): Nome === Setor
  const isFolderProject = projeto.Setor && projeto.Setor.trim() !== '' && projeto.Nome === projeto.Setor;
  
  const allTasks = [];
  const allLists = [];

  try {
    if (isFolderProject) {
      // É uma pasta: buscar todas as listas dentro dela
      const lists = await getLists(projeto.ID_ClickUp);
      for (const list of lists) {
        const tasks = await getTasks(list.id);
        const mappedTasks = tasks.map(t => ({
          ...t,
          _listId: list.id,
          _listName: list.name,
          _folderId: projeto.ID_ClickUp,
          _folderName: projeto.Nome
        }));
        allTasks.push(...mappedTasks);
        allLists.push({ id: list.id, name: list.name, _isFolder: false, _folderId: projeto.ID_ClickUp, _folderName: projeto.Nome });
      }
    } else {
      // É uma lista avulsa
      const tasks = await getTasks(projeto.ID_ClickUp);
      const mappedTasks = tasks.map(t => ({
        ...t,
        _listId: projeto.ID_ClickUp,
        _listName: projeto.Nome,
        _folderId: null,
        _folderName: null
      }));
      allTasks.push(...mappedTasks);
      allLists.push({ id: projeto.ID_ClickUp, name: projeto.Nome, _isFolder: false, _folderId: null, _folderName: null });
    }

    // 1. Sincroniza Status e Progresso
    await syncProjectStatuses(allTasks, [projeto], allLists);

    // 2. Sincroniza Horas Logadas — tenta time_entries, fallback em time_spent das tasks
    const timeEntries = await getTimeEntries(teamId);
    await syncTimeEntries(timeEntries, [projeto]);
    await syncHorasDoTimespent(allTasks, projeto);

    broadcast('sync', { type: 'SYNC_PROJETO_CONCLUIDO', idProjeto });
  } catch (err) {
    console.error(`[ClickUp] Erro no sync focado do projeto ${projeto.Nome}:`, err.message);
    throw err;
  }
}

async function _doSync() {
  const teamId = process.env.CLICKUP_TEAM_ID;
  const spaceIdsEnv = (process.env.CLICKUP_SPACE_IDS || '').trim();

  if (!teamId) {
    console.warn('[ClickUp] CLICKUP_TEAM_ID não configurado. Sync ignorado.');
    return;
  }

  // Busca apenas o space "PROJETOS 2026" (ou os IDs configurados em CLICKUP_SPACE_IDS)
  let spaceIds;
  if (!spaceIdsEnv || spaceIdsEnv.toUpperCase() === 'ALL') {
    try {
      const spaces = await getSpaces(teamId);
      const SPACES_PERMITIDOS = ['PROJETOS 2026'];
      const filtrados = spaces.filter(s => SPACES_PERMITIDOS.includes((s.name || '').trim()));
      spaceIds = filtrados.map(s => s.id);
      console.log(`[ClickUp] Spaces encontrados: ${spaces.map(s => s.name).join(', ')}`);
      console.log(`[ClickUp] Sincronizando apenas: ${filtrados.map(s => s.name).join(', ')} (${spaceIds.length} space(s))`);
    } catch (err) {
      console.error('[ClickUp] Erro ao buscar spaces do time:', err.message);
      spaceIds = [];
    }
  } else {
    spaceIds = spaceIdsEnv.split(',').map((s) => s.trim());
  }

  const allLists = [];

  // 1a. FASE 1: coletar estrutura (pastas + listas) de todos os spaces → importar projetos
  // Isso é rápido (apenas folders/lists, sem tasks) e garante que os projetos existam mesmo
  // se a fase de tasks for interrompida.
  for (const spaceId of spaceIds) {
    try {
      const items = await getAllListsFromSpace(spaceId);
      allLists.push(...items);
      console.log(`[ClickUp] Space ${spaceId}: ${items.filter(i=>i._isFolder).length} pastas, ${items.filter(i=>!i._isFolder).length} listas avulsas.`);
    } catch (err) {
      console.error(`[ClickUp] Erro ao processar space ${spaceId}:`, err.message);
    }
  }

  // 2. Auto-importar novas pastas/listas como projetos (ANTES de buscar tasks)
  await autoImportProjects(allLists);

  // 3. Recarregar projetos após import
  const todosProjectos = await db.readSheet('Projetos_Contratos');

  // 3a. Passagem leve: atualiza status de TODOS os projetos com base no status da lista no ClickUp
  // (não busca tasks — apenas usa allLists que já está em memória)
  const allListsById = {};
  for (const l of allLists) { if (!l._isFolder) allListsById[l.id] = l; }

  for (const projeto of todosProjectos) {
    if (!projeto.ID_ClickUp) continue;
    const listItem = allListsById[projeto.ID_ClickUp];
    if (!listItem) continue;
    const listStatusRaw = (listItem?.status?.status || '').toLowerCase().trim();
    if (!listStatusRaw) continue;

    const statusMap = {
      'closed': 'Concluído', 'complete': 'Concluído', 'concluído': 'Concluído', 'concluido': 'Concluído', 'fechado': 'Concluído',
      'backlog': 'Backlog', 'a planejar': 'Backlog',
      'paralisado': 'Paralisado',
      'em analise': 'Em Análise', 'em análise': 'Em Análise',
      'arquivado': 'Arquivado',
      'aguardando faturamento': 'Aguardando Faturamento',
      'pendencia': 'Pendência', 'pendência': 'Pendência',
      'em andamento': 'Em Andamento', 'in progress': 'Em Andamento', 'planejado': 'Em Andamento',
    };
    const novoStatus = statusMap[listStatusRaw];
    // Só atualiza se o status mudou E o novo status é conhecido (não sobrescreve com undefined)
    if (novoStatus && novoStatus !== projeto.Status) {
      console.log(`[ClickUp] Status leve: "${projeto.Nome}" ${projeto.Status} → ${novoStatus}`);
      await db.updateRowById('Projetos_Contratos', 'ID_Projeto', projeto.ID_Projeto, {
        ...projeto, Status: novoStatus, Atualizado_Em: new Date().toISOString(),
      });
      projeto.Status = novoStatus; // atualiza em memória para a fase seguinte
    }
  }

  const STATUS_ATIVOS = ['Em Andamento', 'Em Andamento (Atrasado)', 'Backlog', 'A Planejar', 'Planejado'];
  const projetos = todosProjectos.filter(p => p.ID_ClickUp && STATUS_ATIVOS.includes(p.Status));
  console.log(`[ClickUp] Sincronizando ${projetos.length}/${todosProjectos.length} projetos ativos.`);

  // 1b. FASE 2: processar tarefas projeto a projeto (sem acumular tudo na memória)
  const allTasks = []; // mantém apenas tarefas para alertas (limpas a cada projeto)
  const projetoClickUpIds = new Set(projetos.map(p => p.ID_ClickUp).filter(Boolean));
  const listasAtivas = allLists.filter(i =>
    !i._isFolder && projetoClickUpIds.has(i.id)
  );
  console.log(`[ClickUp] Buscando tarefas de ${listasAtivas.length} listas ativas.`);

  for (const item of listasAtivas) {
    try {
      const tasks = await getTasks(item.id);
      const mapped = tasks.map((t) => ({
        ...t,
        _listId: item.id,
        _listName: item.name,
        _folderId: item._folderId || null,
        _folderName: item._folderName || null,
        _spaceId: item._spaceId,
      }));
      // Processa status deste projeto imediatamente, sem acumular na memória
      const projeto = projetos.find(p => p.ID_ClickUp === item.id);
      if (projeto) {
        await syncProjectStatuses(mapped, [projeto], [item]);
      }
      allTasks.push(...mapped);
    } catch (err) {
      console.error(`[ClickUp] Erro ao buscar tarefas da lista ${item.name}:`, err.message);
    }
  }

  // 4a. Sincronizar campo "OS Cliente" das listas → Centro_Custo_OPP nos projetos
  await syncOsCliente(allLists, projetos);

  // 4b. Sincronizar campo "OS Interna" das tarefas → Nr_OS_OPP nas medições
  await syncOsInterna(allTasks);

  // 4c. Sincronizar terceirizados do espaço Gestão
  await syncTerceirizadosClickUp();

  // 5. Gerar alertas (atrasadas, sem responsável, etc.)
  await gerarAlertas(allTasks, projetos);

  // 6. Sincronizar horas logadas
  try {
    const timeEntries = await getTimeEntries(teamId);
    await syncTimeEntries(timeEntries, projetos);
  } catch (err) {
    console.error('[ClickUp] Erro ao sincronizar time entries:', err.message);
  }

  // 6b. Fallback: sincroniza time_spent das tasks (captura horas manuais não retornadas pela API de entries)
  try {
    for (const projeto of projetos) {
      if (!projeto.ID_ClickUp) continue;
      const tasksDoProjeto = allTasks.filter(t => t._listId === projeto.ID_ClickUp || t._folderId === projeto.ID_ClickUp);
      if (tasksDoProjeto.length > 0) await syncHorasDoTimespent(tasksDoProjeto, projeto);
    }
  } catch (err) {
    console.error('[ClickUp] Erro no fallback time_spent:', err.message);
  }

  broadcast('sync', { type: 'SYNC_CONCLUIDO', totalTarefas: allTasks.length });
  console.log(`[ClickUp] Sync concluído: ${allTasks.length} tarefas, ${allLists.length} listas.`);
  return allTasks;
}

// Sincroniza tarefas do espaço Gestão → Terceirizados (Solicitação, Contratação, Execução & Pagamento)
// Extrai campo "Ordem de Compra" e salva na aba Terceirizados do Google Sheets
async function syncTerceirizadosClickUp() {
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!teamId) throw new Error('CLICKUP_TEAM_ID não configurado');

  // Busca o espaço "Gestão" pelo nome — não precisa de variável extra
  let gestaoSpaceId = process.env.CLICKUP_GESTAO_SPACE_ID;
  if (!gestaoSpaceId) {
    const spaces = await getSpaces(teamId);
    // Prioriza match exato "Gestão", depois fallback para contains
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const gestaoSpace = spaces.find(s => norm(s.name) === 'gestao') || spaces.find(s => norm(s.name).includes('gestao') && !norm(s.name).includes('de ') && !norm(s.name).includes('demanda'));
    if (!gestaoSpace) throw new Error('Espaço "Gestão" não encontrado no ClickUp. Configure CLICKUP_GESTAO_SPACE_ID.');
    gestaoSpaceId = gestaoSpace.id;
    console.log(`[ClickUp Terc] Espaço Gestão encontrado automaticamente: ${gestaoSpace.name} (${gestaoSpaceId})`);
  }

  try {
    console.log('[ClickUp Terc] Sincronizando terceirizados do espaço Gestão...');
    const folders = await getFolders(gestaoSpaceId);
    const tercFolder = folders.find(f => f.name?.toLowerCase().includes('terceiriz'));
    if (!tercFolder) { console.log('[ClickUp Terc] Pasta Terceirizados não encontrada no espaço Gestão.'); return 0; }

    const LISTAS_ALVO = ['solicitação', 'contratação', 'execução', 'execucao', 'pagamento'];
    const allLists = await getLists(tercFolder.id);
    const lists = allLists.filter(l => LISTAS_ALVO.some(kw => l.name?.toLowerCase().includes(kw)));
    console.log(`[ClickUp Terc] Listas filtradas: ${lists.map(l => l.name).join(', ')}`);
    const allTasks = [];
    for (const list of lists) {
      let page = 0;
      while (true) {
        const tasks = await getTasks(list.id, page);
        tasks.forEach(t => { t._listName = list.name; });
        allTasks.push(...tasks);
        if (tasks.length < 100) break;
        page++;
      }
    }

    const existentes = await db.readSheet('Terceirizados');
    const projetos = await db.readSheet('Projetos_Contratos');
    const projetoByClickUp = {};
    for (const p of projetos) if (p.ID_ClickUp) projetoByClickUp[p.ID_ClickUp] = p;

    const porTaskId = Object.fromEntries(existentes.filter(r => r.ID_Tarefa_ClickUp).map(r => [r.ID_Tarefa_ClickUp, r]));

    let atualizados = 0, criados = 0;
    for (const task of allTasks) {
      // Extrai "Ordem de Compra" — só o número (remove prefixo "OC " se existir)
      const ocRaw = getCustomField(task, 'Ordem de Compra') || getCustomField(task, 'ordem de compra') || '';
      const oc = ocRaw.toString().replace(/^OC\s*/i, '').trim();

      const etapa = task._listName || '';
      const status = task.status?.status || '';
      const responsavel = task.assignees?.map(a => a.username).join(', ') || '';
      const fornecedor = getCustomField(task, 'Fornecedor') || getCustomField(task, 'fornecedor') || '';
      const descricao = task.name || '';
      const dataEntrega = task.due_date ? new Date(parseInt(task.due_date)).toISOString().split('T')[0] : '';

      // Vincula ao projeto via campo "Local da Tarefa no projeto" (URL da lista do ClickUp)
      const localUrl = getCustomField(task, 'Local da Tarefa no projeto') || '';
      const matchUrl = localUrl.match(/\/li\/(\d+)/);
      const listId = matchUrl ? matchUrl[1] : '';
      const projetoVinculado = listId ? projetoByClickUp[listId] : null;
      const idProjeto = projetoVinculado?.ID_Projeto || '';

      const existente = porTaskId[task.id];
      if (existente) {
        const ocMudou = oc && existente.OC !== oc;
        const statusMudou = existente.Status_ClickUp !== status;
        const etapaMudou = existente.Etapa_ClickUp !== etapa;
        const respMudou = responsavel && existente.Responsavel !== responsavel;
        const projetoMudou = idProjeto && existente.ID_Projeto !== idProjeto;
        if (ocMudou || statusMudou || etapaMudou || respMudou || projetoMudou || !existente.Responsavel) {
          await db.updateRowById('Terceirizados', 'ID', existente.ID, {
            ...existente,
            OC: oc || existente.OC || '',
            Status_ClickUp: status,
            Etapa_ClickUp: etapa,
            Responsavel: responsavel || existente.Responsavel || '',
            Fornecedor: fornecedor || existente.Fornecedor || '',
            ID_Projeto: idProjeto || existente.ID_Projeto || '',
          });
          atualizados++;
        }
      } else {
        // Cria novo registro
        await db.insertRow('Terceirizados', {
          ID: uuidv4(),
          ID_Projeto: idProjeto,
          Servico: descricao,
          Fornecedor: fornecedor,
          Valor_Contratado: '',
          Valor_Pago: '',
          Status: etapa.includes('Execução') ? 'Confirmado' : etapa.includes('Contratação') ? 'Confirmado' : 'Solicitado',
          ID_Tarefa_ClickUp: task.id,
          ID_Medicao_Vinculada: '',
          Percentual_do_Total: '',
          Data_Entrega_Prevista: dataEntrega,
          Data_Entrega_Real: '',
          Observacao: '',
          Aprovado_Por: '',
          Criado_Em: new Date().toISOString(),
          OC: oc,
          Status_ClickUp: status,
          Etapa_ClickUp: etapa,
          Responsavel: responsavel,
          Fornecedor: fornecedor,
        });
        criados++;
      }
    }
    // Remove registros que vieram de listas fora das 3 alvo (ex: "Cadastro de Tercei... 2020")
    const taskIdsAlvo = new Set(allTasks.map(t => t.id));
    const paraRemover = existentes.filter(r =>
      r.ID_Tarefa_ClickUp &&
      !taskIdsAlvo.has(r.ID_Tarefa_ClickUp)
    );
    let removidos = 0;
    for (const r of paraRemover) {
      await db.updateRowById('Terceirizados', 'ID', r.ID, { ...r, Status: 'Cancelado' });
      removidos++;
    }
    console.log(`[ClickUp Terc] Concluído: ${criados} criados, ${atualizados} atualizados, ${removidos} removidos, ${allTasks.length} tarefas processadas.`);
    return allTasks.length;
  } catch (err) {
    console.error('[ClickUp Terc] Erro ao sincronizar terceirizados:', err.message);
    return 0;
  }
}

// Lê campo "OS Interna" de cada tarefa do ClickUp e atualiza Nr_OS_OPP nas medições vinculadas
async function syncOsInterna(allTasks) {
  try {
    const medicoes = await db.readSheet('Medicoes');
    // Índice: ID_Tarefa_ClickUp → medição
    const medicaoByTask = {};
    for (const m of medicoes) {
      if (m.ID_Tarefa_ClickUp) medicaoByTask[m.ID_Tarefa_ClickUp] = m;
    }

    let atualizadas = 0;
    for (const task of allTasks) {
      const osInterna = getCustomField(task, 'OS Interna');
      if (!osInterna) continue;

      const medicao = medicaoByTask[task.id];
      if (!medicao) continue;

      // Só atualiza se o valor mudou
      if ((medicao.Nr_OS_OPP || '') === String(osInterna)) continue;

      await db.updateRowById('Medicoes', 'ID_Medicao', medicao.ID_Medicao, {
        ...medicao,
        Nr_OS_OPP: String(osInterna),
      });
      atualizadas++;
    }

    if (atualizadas > 0) {
      console.log(`[ClickUp] OS Interna: ${atualizadas} medições atualizadas com Nr_OS_OPP.`);
    }
  } catch (err) {
    console.error('[ClickUp] Erro ao sincronizar OS Interna:', err.message);
  }
}

// Lê campo "OS Cliente" das listas do ClickUp e salva em Centro_Custo_OPP
async function syncOsCliente(allLists, projetos) {
  // Mapa ID_ClickUp → projeto
  const projetoByClickUp = {};
  for (const p of projetos) {
    if (p.ID_ClickUp) projetoByClickUp[p.ID_ClickUp] = p;
  }

  let atualizados = 0;
  for (const list of allLists) {
    if (list._isFolder) continue;
    const projeto = projetoByClickUp[list.id];
    if (!projeto) continue;

    try {
      const fields = await getListFields(list.id);
      const osField = fields.find(f => f.name === 'OS Cliente');
      if (!osField || !osField.value) continue;

      const novoOS = String(osField.value).trim();
      if (!novoOS || novoOS === (projeto.Centro_Custo_OPP || '')) continue;

      await db.updateRowById('Projetos_Contratos', 'ID_Projeto', projeto.ID_Projeto, {
        ...projeto,
        Centro_Custo_OPP: novoOS,
        Atualizado_Em: new Date().toISOString(),
      });
      console.log(`[ClickUp] OS Cliente "${novoOS}" → ${projeto.Nome}`);
      atualizados++;
    } catch (err) {
      // Silencia erros por lista individual para não travar o sync
    }
  }

  if (atualizados > 0) {
    console.log(`[ClickUp] OS Cliente: ${atualizados} projetos com Centro_Custo_OPP atualizado.`);
  }
}

// Fallback: extrai horas do campo time_spent das tasks (captura lançamentos manuais)
async function syncHorasDoTimespent(tasks, projeto) {
  for (const task of tasks) {
    if (!task.time_spent || parseInt(task.time_spent) === 0) continue;
    const horas = (parseInt(task.time_spent) / 3600000).toFixed(2);
    const entryId = `timespent_${task.id}`;
    const assignee = task.assignees?.[0]?.username || task.assignees?.[0]?.email || 'Não identificado';

    const exists = await db.findOne('Log_Horas', r => r.ID_TimeEntry_ClickUp === entryId);
    if (!exists) {
      await db.insertRow('Log_Horas', {
        ID: entryId,
        ID_Projeto: projeto.ID_Projeto,
        Colaborador: assignee,
        Horas_Estimadas: '',
        Horas_Logadas: horas,
        Custo_Calculado: '',
        Data: new Date().toISOString().split('T')[0],
        ID_TimeEntry_ClickUp: entryId,
      });
      console.log(`[ClickUp] time_spent task "${task.name}": ${horas}h → ${assignee}`);
    } else if (parseFloat(exists.Horas_Logadas).toFixed(2) !== horas) {
      await db.updateRowById('Log_Horas', 'ID_TimeEntry_ClickUp', entryId, { ...exists, Horas_Logadas: horas });
      console.log(`[ClickUp] time_spent atualizado "${task.name}": ${horas}h`);
    }
  }
}

async function syncTimeEntries(timeEntries, projetos) {
  console.log(`[ClickUp] Sincronizando ${timeEntries.length} time entries...`);
  
  // Mapeia tanto por listId quanto por folderId → ID_Projeto
  const projectMapList = {};
  const projectMapFolder = {};
  for (const p of projetos || []) {
    if (!p.ID_ClickUp) continue;
    
    // Projetos de pasta: convencionado no auto-import que se Nome === Setor, é projeto de PASTA
    // Projetos de lista: Setor vazio ou diferente do Nome
    const isFolderProject = p.Setor && p.Setor.trim() !== '' && p.Nome === p.Setor;
    
    if (isFolderProject) {
      projectMapFolder[p.ID_ClickUp] = p.ID_Projeto;
    } else {
      projectMapList[p.ID_ClickUp] = p.ID_Projeto;
    }
  }

  let novos = 0;
  let atualizados = 0;

  // Log diagnóstico: mostra os list_ids únicos das entries vs os IDs mapeados
  const uniqueListIds = [...new Set(timeEntries.map(e => e.task_location?.list_id || e.task?.list?.id).filter(Boolean))];
  console.log(`[ClickUp] list_ids nas entries: ${uniqueListIds.slice(0,10).join(', ')}`);
  console.log(`[ClickUp] projectMapList keys: ${Object.keys(projectMapList).join(', ')}`);

  for (const entry of timeEntries) {
    const listId    = entry.task_location?.list_id  || entry.task?.list?.id;
    const folderId  = entry.task_location?.folder_id || entry.task?.folder?.id;

    // Tenta achar o projeto: primeiro pela lista, depois pela pasta
    const idProjeto = projectMapList[listId] || projectMapFolder[folderId] || '';

    if (!idProjeto) continue;

    const horasLogadas = entry.duration ? (parseFloat(entry.duration) / 3600000).toFixed(2) : '0';

    try {
      const exists = await db.findOne('Log_Horas', (r) => String(r.ID_TimeEntry_ClickUp) === String(entry.id));
      
      if (!exists) {
        await db.insertRow('Log_Horas', {
          ID: String(entry.id),
          ID_Projeto: idProjeto,
          Colaborador: entry.user?.username || entry.user?.email || '',
          Horas_Estimadas: '',
          Horas_Logadas: horasLogadas,
          Custo_Calculado: '',
          Data: entry.start ? new Date(parseInt(entry.start)).toISOString().split('T')[0] : '',
          ID_TimeEntry_ClickUp: String(entry.id),
        });
        novos++;
      } else {
        // Normaliza para comparação (Sheets pode retornar string ou numero)
        const currentVal = parseFloat(exists.Horas_Logadas || 0).toFixed(2);
        if (currentVal !== horasLogadas) {
          await db.updateRowById('Log_Horas', 'ID_TimeEntry_ClickUp', String(entry.id), {
            ...exists,
            Horas_Logadas: horasLogadas,
          });
          console.log(`[ClickUp] Time entry ${entry.id} atualizado: ${currentVal}h → ${horasLogadas}h`);
          atualizados++;
        }
      }
    } catch (err) {
      console.error(`[ClickUp] Erro ao processar entry ${entry.id}:`, err.message);
    }
  }
  console.log(`[ClickUp] Sync de horas finalizado. Novos: ${novos}, Atualizados: ${atualizados}`);
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

async function registerWebhook(teamId) {
  const baseUrl = process.env.CLICKUP_WEBHOOK_BASE_URL;
  if (!baseUrl) {
    console.warn('[ClickUp] CLICKUP_WEBHOOK_BASE_URL não configurado. Webhooks desativados.');
    return;
  }

  try {
    const res = await axios.post(
      `${BASE_URL}/team/${teamId}/webhook`,
      {
        endpoint: `${baseUrl}/api/clickup/webhook`,
        events: ['taskStatusUpdated', 'taskAssigneeUpdated', 'taskDueDateUpdated', 'taskTimeEstimateUpdated'],
      },
      { headers: getHeaders() }
    );
    console.log('[ClickUp] Webhook registrado:', res.data.id);
    return res.data;
  } catch (err) {
    console.error('[ClickUp] Erro ao registrar webhook:', err.response?.data || err.message);
  }
}

/**
 * Processa um evento de webhook recebido do ClickUp.
 * Atualiza status em tempo real sem esperar o cron.
 */
async function processWebhookEvent(event) {
  const { event: eventType, task_id } = event;
  console.log(`[ClickUp Webhook] ${eventType} para tarefa ${task_id}`);

  try {
    const task = await getTaskById(task_id);
    const listId = task.list?.id;
    const projetos = await db.readSheet('Projetos_Contratos');
    const project = projetos.find((p) => p.ID_ClickUp === listId);
    if (!project) return;

    const agora = new Date().toISOString();

    if (eventType === 'taskStatusUpdated') {
      const newStatus = task.status?.status || '';
      const critico = ['paralisado', 'bloqueado', 'cancelado', 'archived'].includes(newStatus.toLowerCase());
      if (critico) {
        const msg = `Status crítico: tarefa "${task.name}" → ${newStatus} (${project.Nome})`;
        await db.insertRow('Alertas', {
          ID: uuidv4(),
          Tipo_Alerta: 'STATUS_CRITICO',
          ID_Projeto: project.ID_Projeto,
          Mensagem: msg,
          Data_Geracao: agora,
          Setor_Destino: 'Coordenador',
          Visto_Por: '',
          Status: 'Ativo',
          Nivel: 'error',
        });
        broadcast('alert', { type: 'STATUS_CRITICO', projectId: project.ID_Projeto, message: msg });
      }
      // Sincroniza apenas o projeto afetado, não o workspace inteiro
      syncClickUp(project.ID_Projeto).catch(() => {});
    }

    if (eventType === 'taskDueDateUpdated') {
      const msg = `Prazo alterado: "${task.name}" — verifique impacto nas medições (${project.Nome})`;
      await db.insertRow('Alertas', {
        ID: uuidv4(),
        Tipo_Alerta: 'PRAZO_ALTERADO',
        ID_Projeto: project.ID_Projeto,
        Mensagem: msg,
        Data_Geracao: agora,
        Setor_Destino: 'Financeiro',
        Visto_Por: '',
        Status: 'Ativo',
        Nivel: 'warning',
      });
      broadcast('alert', { type: 'PRAZO_ALTERADO', projectId: project.ID_Projeto, message: msg });
    }

    if (eventType === 'taskAssigneeUpdated') {
      // Se ficou sem responsável, gera alerta
      if (!task.assignees || task.assignees.length === 0) {
        const msg = `Tarefa sem responsável: "${task.name}" (${project.Nome})`;
        await db.insertRow('Alertas', {
          ID: uuidv4(),
          Tipo_Alerta: 'SEM_RESPONSAVEL',
          ID_Projeto: project.ID_Projeto,
          Mensagem: msg,
          Data_Geracao: agora,
          Setor_Destino: 'PO',
          Visto_Por: '',
          Status: 'Ativo',
          Nivel: 'info',
        });
        broadcast('alert', { type: 'SEM_RESPONSAVEL', projectId: project.ID_Projeto, message: msg });
      }
    }
  } catch (err) {
    console.error('[ClickUp Webhook] Erro ao processar evento:', err.message);
  }
}

// ── Calcular progresso em tempo real (para relatórios) ─────────────────────────

async function getProjectProgressFromClickUp(clickupId) {
  try {
    if (!clickupId) return null;

    // Tenta usar como folder (pasta de projeto) primeiro
    let allTasks = [];

    // Tenta como folder
    try {
      const lists = await getLists(clickupId);
      for (const list of lists) {
        const tasks = await getTasks(list.id);
        allTasks.push(...tasks);
      }
    } catch {
      // Se falhar como folder, tenta como list
      try {
        const tasks = await getTasks(clickupId);
        allTasks = tasks;
      } catch {
        return null;
      }
    }

    if (allTasks.length === 0) return 0;

    const done = allTasks.filter(isClosed).length;
    const progresso = Math.round((done / allTasks.length) * 100);
    return progresso;
  } catch (err) {
    console.error(`[ClickUp] Erro ao calcular progresso do projeto ${clickupId}:`, err.message);
    return null;
  }
}

// Extrai o ID da tarefa de uma URL do ClickUp (https://app.clickup.com/t/TASKID)
function extrairTaskId(url) {
  if (!url) return null;
  const m = url.match(/\/t\/([a-z0-9]+)/i);
  return m ? m[1] : null;
}

// Posta um comentário em uma tarefa do ClickUp
async function criarComentarioTask(taskId, texto) {
  if (!taskId) return null;
  const res = await axios.post(
    `${BASE_URL}/task/${taskId}/comment`,
    { comment_text: texto, notify_all: true },
    { headers: getHeaders() }
  );
  return res.data;
}

module.exports = {
  syncClickUp,
  syncTerceirizadosClickUp,
  isSyncing: () => _syncing,
  syncSingleProject,
  getTaskById,
  getSpaces,
  getLists,
  getTasks,
  getTimeEntries,
  syncTimeEntries,
  syncHorasDoTimespent,
  registerWebhook,
  processWebhookEvent,
  getProjectProgressFromClickUp,
  criarComentarioTask,
  extrairTaskId,
};
