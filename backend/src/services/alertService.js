const db = process.env.USE_POSTGRES === 'true' ? require('./postgresService') : require('./googleSheetsService');
const { broadcast } = require('./websocketService');
const { v4: uuidv4 } = require('uuid');

// ── Constantes PAR (espelha planejamento.js) ──────────────────────────────────
const TETO_AVISO        = parseFloat(process.env.TETO_TERCEIROS_AVISO    || '20');
const TETO_BLOQUEIO     = 25;   // HARDCODE PAR — nunca muda por .env
const MARGEM_MINIMA     = 23;   // HARDCODE PAR
const TETO_CUSTO_PROD   = 30;   // HARDCODE PAR
const MAX_HORAS_TAREFA  = 16;   // HARDCODE PAR — acima exige particionamento
const DIAS_SEM_ATUALIZACAO = parseInt(process.env.ALERTA_DIAS_SEM_ATUALIZACAO || '2');
const DIAS_A_PLANEJAR      = parseInt(process.env.ALERTA_DIAS_A_PLANEJAR      || '7');


function diasUteisDesde(date) {
  const now = new Date();
  const start = new Date(date);
  let count = 0;
  const cursor = new Date(start);
  // Cap em 999 para evitar loop infinito em datas muito antigas
  while (cursor < now && count < 999) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) count++;
  }
  return count;
}

/**
 * Verificação completa: lê tudo 1x, analisa em memória, escreve em lote.
 * Total de chamadas à API: 4 leituras + até 2 escritas em lote.
 */
async function checkAllAlerts() {
  try {
    const now = new Date();

    // ── 1. Leitura única de todas as abas necessárias ──
    const [projects, terceirizados, medicoes, alertasAll] = await Promise.all([
      db.readSheet('Projetos_Contratos'),
      db.readSheet('Terceirizados'),
      db.readSheet('Medicoes'),
      db.readSheet('Alertas'),
    ]);

    const activeAlerts = alertasAll.filter(a => a.Status === 'ativo' || a.Status === 'Ativo');

    // Projeto real = tem contrato ou valor global > 0 (exclui iterações de sprint do ClickUp)
    const isProjetoReal = (p) =>
      parseFloat(p.Valor_Global || 0) > 0 || (p.Nr_Contrato && String(p.Nr_Contrato).trim() !== '');

    // Índices em memória
    const projectMap = {};
    for (const p of projects) projectMap[p.ID_Projeto] = p;

    const tercByProject = {};
    for (const t of terceirizados) {
      if (t.Status === 'Cancelado') continue;
      if (!tercByProject[t.ID_Projeto]) tercByProject[t.ID_Projeto] = [];
      tercByProject[t.ID_Projeto].push(t);
    }

    const medicoesByProject = {};
    for (const m of medicoes) {
      if (!medicoesByProject[m.ID_Projeto]) medicoesByProject[m.ID_Projeto] = [];
      medicoesByProject[m.ID_Projeto].push(m);
    }

    // Índice de alertas ativos por tipo+projeto (para dedup rápido)
    const activeIndex = {}; // `${tipo}|${idProjeto}` -> alert
    for (const a of activeAlerts) {
      activeIndex[`${a.Tipo_Alerta}|${a.ID_Projeto}`] = a;
    }

    const toResolveIds = new Set();
    const toCreate = [];

    // ─────────────────────────────────────────
    // 2a. PAR_PLANEJAMENTO_ATRASADO
    // ─────────────────────────────────────────
    for (const a of activeAlerts) {
      if (a.Tipo_Alerta !== 'PAR_PLANEJAMENTO_ATRASADO') continue;
      const p = projectMap[a.ID_Projeto];
      if (!p || p.Status !== 'A Planejar') { toResolveIds.add(a.ID); continue; }
      const updatedAt = p.Atualizado_Em ? new Date(p.Atualizado_Em) : (p.Criado_Em ? new Date(p.Criado_Em) : null);
      if (!updatedAt) continue;
      if (Math.floor((now - updatedAt) / 86400000) < DIAS_A_PLANEJAR) toResolveIds.add(a.ID);
    }
    for (const p of projects) {
      if (p.Status !== 'A Planejar') continue;
      if (!isProjetoReal(p)) continue;
      const updatedAt = p.Atualizado_Em ? new Date(p.Atualizado_Em) : (p.Criado_Em ? new Date(p.Criado_Em) : null);
      if (!updatedAt) continue;
      const diff = Math.floor((now - updatedAt) / 86400000);
      if (diff < DIAS_A_PLANEJAR) continue;
      if (activeIndex[`PAR_PLANEJAMENTO_ATRASADO|${p.ID_Projeto}`]) continue;
      toCreate.push({
        tipo: 'PAR_PLANEJAMENTO_ATRASADO', idProjeto: p.ID_Projeto,
        mensagem: `Projeto "${p.Nome}" está em "A Planejar" há ${diff} dias sem movimentação.`,
        nivel: 'warning', setorDestino: ['PO', 'Coordenador'],
      });
    }

    // ─────────────────────────────────────────
    // 2b. TETO_TERCEIROS
    // ─────────────────────────────────────────
    const percMap = {};
    for (const p of projects) {
      const vg = parseFloat(p.Valor_Global || 0);
      if (vg === 0) { percMap[p.ID_Projeto] = 0; continue; }
      const total = (tercByProject[p.ID_Projeto] || []).reduce((s, t) => s + parseFloat(t.Valor_Contratado || 0), 0);
      percMap[p.ID_Projeto] = (total / vg) * 100;
    }

    for (const a of activeAlerts) {
      if (a.Tipo_Alerta === 'TETO_TERCEIROS_BLOQUEIO') {
        if ((percMap[a.ID_Projeto] ?? 0) < TETO_BLOQUEIO) toResolveIds.add(a.ID);
      } else if (a.Tipo_Alerta === 'TETO_TERCEIROS_AVISO') {
        if ((percMap[a.ID_Projeto] ?? 0) < TETO_AVISO) toResolveIds.add(a.ID);
      }
    }
    for (const p of projects) {
      const perc = percMap[p.ID_Projeto] ?? 0;
      if (perc >= TETO_BLOQUEIO && !activeIndex[`TETO_TERCEIROS_BLOQUEIO|${p.ID_Projeto}`]) {
        toCreate.push({
          tipo: 'TETO_TERCEIROS_BLOQUEIO', idProjeto: p.ID_Projeto,
          mensagem: `BLOQUEIO: Terceirizados do projeto "${p.Nome}" atingiram ${perc.toFixed(1)}% do contrato (limite: ${TETO_BLOQUEIO}%).`,
          nivel: 'error', setorDestino: ['PO', 'Comercial', 'Coordenador'],
        });
      } else if (perc >= TETO_AVISO && perc < TETO_BLOQUEIO && !activeIndex[`TETO_TERCEIROS_AVISO|${p.ID_Projeto}`]) {
        toCreate.push({
          tipo: 'TETO_TERCEIROS_AVISO', idProjeto: p.ID_Projeto,
          mensagem: `AVISO: Terceirizados do projeto "${p.Nome}" em ${perc.toFixed(1)}% do contrato (aviso: ${TETO_AVISO}%).`,
          nivel: 'warning', setorDestino: ['PO', 'Comercial'],
        });
      }
    }

    // ─────────────────────────────────────────
    // 2c. MEDICAO_ATRASADA / MEDICAO_PROXIMA
    // ─────────────────────────────────────────
    // Índice de medições ativas para resolução
    const medicaoIndex = {}; // `${idProjeto}|${etapa}` -> medicao
    for (const m of medicoes) {
      medicaoIndex[`${m.ID_Projeto}|${m.Etapa}`] = m;
    }

    for (const a of activeAlerts) {
      if (a.Tipo_Alerta !== 'MEDICAO_ATRASADA' && a.Tipo_Alerta !== 'MEDICAO_PROXIMA') continue;
      const key = Object.keys(medicaoIndex).find(k => k.startsWith(a.ID_Projeto + '|') && a.Mensagem.includes(k.split('|')[1]));
      if (!key) { toResolveIds.add(a.ID); continue; }
      const m = medicaoIndex[key];
      if (m.Status_Fisico === 'Concluído' || m.Status_Financeiro === 'Recebido' || m.Status_Financeiro === 'Faturado') {
        toResolveIds.add(a.ID); continue;
      }
      if (a.Tipo_Alerta === 'MEDICAO_PROXIMA' && m.Data_Previsao) {
        const diff = Math.floor((new Date(m.Data_Previsao) - now) / 86400000);
        if (diff > 7 || diff < 0) toResolveIds.add(a.ID);
      }
    }

    for (const m of medicoes) {
      if (m.Status_Financeiro === 'Recebido' || m.Status_Financeiro === 'Faturado') continue;
      if (!m.Data_Previsao) continue;
      const project = projectMap[m.ID_Projeto];
      if (!project) continue;
      const dataPrevisao = new Date(m.Data_Previsao);

      const taskLink = m.ID_Tarefa_ClickUp
        ? `https://app.clickup.com/t/${m.ID_Tarefa_ClickUp}`
        : (project.ID_ClickUp ? `https://app.clickup.com/${process.env.CLICKUP_TEAM_ID}/v/li/${project.ID_ClickUp}` : '');

      if (dataPrevisao < now && m.Status_Fisico !== 'Concluído') {
        const existing = activeAlerts.find(a => a.Tipo_Alerta === 'MEDICAO_ATRASADA' && a.ID_Projeto === m.ID_Projeto && a.Mensagem.includes(m.Etapa));
        if (!existing) {
          toCreate.push({
            tipo: 'MEDICAO_ATRASADA', idProjeto: m.ID_Projeto,
            mensagem: `Medição "${m.Etapa}" do projeto "${project.Nome}" está prevista para ${m.Data_Previsao} mas o avanço físico é insuficiente.`,
            nivel: 'error', setorDestino: ['Financeiro', 'PO'],
            linkClickUp: taskLink,
          });
        }
      }

      const diff = Math.floor((dataPrevisao - now) / 86400000);
      if (diff >= 0 && diff <= 7 && m.Status_Fisico !== 'Concluído') {
        const existing = activeAlerts.find(a => a.Tipo_Alerta === 'MEDICAO_PROXIMA' && a.ID_Projeto === m.ID_Projeto && a.Mensagem.includes(m.Etapa));
        if (!existing) {
          toCreate.push({
            tipo: 'MEDICAO_PROXIMA', idProjeto: m.ID_Projeto,
            mensagem: `Medição "${m.Etapa}" do projeto "${project.Nome}" prevista em ${diff} dias. Verifique avanço físico.`,
            nivel: 'info', setorDestino: ['Financeiro', 'Comercial', 'PO'],
            linkClickUp: taskLink,
          });
        }
      }
    }

    // ─────────────────────────────────────────
    // 2d. FATURA_VENCIDA
    // ─────────────────────────────────────────
    const nfMap = {};
    for (const m of medicoes) { if (m.Nr_NF) nfMap[m.Nr_NF] = m; }

    for (const a of activeAlerts) {
      if (a.Tipo_Alerta !== 'FATURA_VENCIDA') continue;
      const nfMatch = a.Mensagem.match(/NF\s+(\S+)/);
      if (!nfMatch) continue;
      const m = nfMap[nfMatch[1]];
      if (!m || m.Status_Financeiro === 'Recebido') toResolveIds.add(a.ID);
    }
    for (const m of medicoes) {
      if (m.Status_Financeiro === 'Recebido' || !m.Data_Vencimento || !m.Nr_NF) continue;
      if (new Date(m.Data_Vencimento) >= now) continue;
      const project = projectMap[m.ID_Projeto];
      if (!project) continue;
      const existing = activeAlerts.find(a => a.Tipo_Alerta === 'FATURA_VENCIDA' && a.ID_Projeto === m.ID_Projeto && a.Mensagem.includes(m.Nr_NF));
      if (!existing) {
        toCreate.push({
          tipo: 'FATURA_VENCIDA', idProjeto: m.ID_Projeto,
          mensagem: `NF ${m.Nr_NF} do projeto "${project.Nome}" venceu em ${m.Data_Vencimento} sem recebimento registrado.`,
          nivel: 'error', setorDestino: ['Financeiro'],
        });
      }
    }

    // ─────────────────────────────────────────
    // 2e. DAILY_SCRUM_PENDENTE
    // Aplica apenas a projetos reais (com contrato ou valor > 0)
    // ─────────────────────────────────────────
    const statusAtivos = ['Em Andamento', 'Em Andamento (Atrasado)'];

    for (const a of activeAlerts) {
      if (a.Tipo_Alerta !== 'DAILY_SCRUM_PENDENTE') continue;
      const p = projectMap[a.ID_Projeto];
      if (!p || !statusAtivos.includes(p.Status) || !isProjetoReal(p)) { toResolveIds.add(a.ID); continue; }
      const updatedAt = p.Atualizado_Em ? new Date(p.Atualizado_Em) : null;
      if (!updatedAt) continue;
      if (diasUteisDesde(updatedAt) < DIAS_SEM_ATUALIZACAO) toResolveIds.add(a.ID);
    }
    for (const p of projects) {
      if (!statusAtivos.includes(p.Status)) continue;
      if (!isProjetoReal(p)) continue; // ignora iterações/sprints sem contrato
      const updatedAt = p.Atualizado_Em ? new Date(p.Atualizado_Em) : null;
      if (!updatedAt) continue;
      const diasUteis = diasUteisDesde(updatedAt);
      if (diasUteis < DIAS_SEM_ATUALIZACAO) continue;
      if (activeIndex[`DAILY_SCRUM_PENDENTE|${p.ID_Projeto}`]) continue;
      toCreate.push({
        tipo: 'DAILY_SCRUM_PENDENTE', idProjeto: p.ID_Projeto,
        mensagem: `Projeto "${p.Nome}" sem atualização de status há ${diasUteis} dias úteis. Daily Scrum pendente.`,
        nivel: 'warning', setorDestino: ['PO', 'Coordenador'],
      });
    }

    // ─────────────────────────────────────────
    // 2e. SEM_TEMPO_ESTIMADO
    // Tarefas no ClickUp sem horas estimadas (Time Estimate)
    // ─────────────────────────────────────────
    for (const a of activeAlerts) {
      if (a.Tipo_Alerta !== 'SEM_TEMPO_ESTIMADO') continue;
      const p = projectMap[a.ID_Projeto];
      if (!p || !statusAtivos.includes(p.Status) || !p.ID_ClickUp) { toResolveIds.add(a.ID); continue; }
    }
    // Essa validação geralmente depende de uma leitura profunda das tasks do ClickUp
    // Por enquanto, vamos marcar tarefas que vieram do sync com tempo_estimado = 0
    const tasks = await db.readSheet('Log_Horas'); // Usando log_horas como proxy de tasks sincronizadas
    for (const t of tasks) {
      if (activeIndex[`SEM_TEMPO_ESTIMADO|${t.ID_Projeto}`]) continue;
      if (!t.Tempo_Estimado || parseFloat(t.Tempo_Estimado) === 0) {
        const proj = projectMap[t.ID_Projeto];
        if (proj && statusAtivos.includes(proj.Status)) {
          // Deep link: URL direta da tarefa no ClickUp
          const linkClickUp = t.ID_Tarefa
            ? `https://app.clickup.com/t/${t.ID_Tarefa}`
            : (proj.ID_ClickUp ? `https://app.clickup.com/${process.env.CLICKUP_TEAM_ID}/v/li/${proj.ID_ClickUp}` : '');
          toCreate.push({
            tipo: 'SEM_TEMPO_ESTIMADO', idProjeto: t.ID_Projeto,
            mensagem: `Tarefa "${t.Tarefa}" no projeto "${proj.Nome}" está sem tempo estimado no ClickUp.`,
            nivel: 'warning', setorDestino: ['PO'],
            linkClickUp,
          });
        }
      }
    }

    // ─────────────────────────────────────────
    // 2f. PRAZO_NAO_DEFINIDO
    // Projetos do ClickUp Em Andamento sem data de entrega
    // ─────────────────────────────────────────
    for (const a of activeAlerts) {
      if (a.Tipo_Alerta !== 'PRAZO_NAO_DEFINIDO') continue;
      const p = projectMap[a.ID_Projeto];
      if (!p || !statusAtivos.includes(p.Status) || !p.ID_ClickUp) { toResolveIds.add(a.ID); continue; }
      if (p.Data_Entrega_Contrato && String(p.Data_Entrega_Contrato).trim() !== '') toResolveIds.add(a.ID);
    }
    for (const p of projects) {
      if (!statusAtivos.includes(p.Status)) continue;
      if (!p.ID_ClickUp) continue; // só projetos importados do ClickUp
      if (p.Data_Entrega_Contrato && String(p.Data_Entrega_Contrato).trim() !== '') continue;
      if (activeIndex[`PRAZO_NAO_DEFINIDO|${p.ID_Projeto}`]) continue;
      toCreate.push({
        tipo: 'PRAZO_NAO_DEFINIDO', idProjeto: p.ID_Projeto,
        mensagem: `Projeto "${p.Nome}" está em andamento sem data de entrega definida.`,
        nivel: 'warning', setorDestino: ['Comercial', 'PO'],
      });
    }

    // ─────────────────────────────────────────
    // 2g. MARGEM_ABAIXO_MINIMO
    // Planejamentos aprovados onde lucroPerc < 23%
    // ─────────────────────────────────────────
    const planejamentos = await db.readSheet('Planejamentos');
    const planMap = {};
    for (const pl of planejamentos) planMap[pl.ID_Projeto] = pl;

    for (const a of activeAlerts) {
      if (a.Tipo_Alerta !== 'MARGEM_ABAIXO_MINIMO') continue;
      const pl = planMap[a.ID_Projeto];
      if (!pl) { toResolveIds.add(a.ID); continue; }
      let dados = {};
      try { dados = JSON.parse(pl.Dados_JSON || '{}'); } catch {}
      const V = parseFloat(dados.valorContrato || pl.Valor_Contrato || 0);
      if (V === 0) { toResolveIds.add(a.ID); continue; }
      // recalcula margem simplificada
      const ip = Math.max(parseFloat(dados.impostosPerc || 20), 16.33);
      const ta = Math.max(parseFloat(dados.taxaAdmPerc || 12), 5);
      const deductPct = ip + ta + 7.5;
      const recLiq = V * (1 - deductPct / 100);
      const custos = (dados.terceirizados || []).reduce((s, t) => s + parseFloat(t.custo || 0), 0)
        + (dados.equipe || []).reduce((s, e) => s + parseFloat(e.horas || 0) * 36.4, 0)
        + (dados.despesas || []).reduce((s, d) => s + parseFloat(d.valor || 0), 0);
      const lucroPerc = V > 0 ? ((recLiq - custos) / V) * 100 : 0;
      if (lucroPerc >= MARGEM_MINIMA) toResolveIds.add(a.ID);
    }
    for (const pl of planejamentos) {
      if (!['Aprovado', 'Pendente Aprovação'].includes(pl.Status)) continue;
      if (activeIndex[`MARGEM_ABAIXO_MINIMO|${pl.ID_Projeto}`]) continue;
      let dados = {};
      try { dados = JSON.parse(pl.Dados_JSON || '{}'); } catch {}
      const V = parseFloat(dados.valorContrato || pl.Valor_Contrato || 0);
      if (V === 0) continue;
      const ip = Math.max(parseFloat(dados.impostosPerc || 20), 16.33);
      const ta = Math.max(parseFloat(dados.taxaAdmPerc || 12), 5);
      const deductPct = ip + ta + 7.5;
      const recLiq = V * (1 - deductPct / 100);
      const custos = (dados.terceirizados || []).reduce((s, t) => s + parseFloat(t.custo || 0), 0)
        + (dados.equipe || []).reduce((s, e) => s + parseFloat(e.horas || 0) * 36.4, 0)
        + (dados.despesas || []).reduce((s, d) => s + parseFloat(d.valor || 0), 0);
      const lucroPerc = V > 0 ? ((recLiq - custos) / V) * 100 : 0;
      if (lucroPerc < MARGEM_MINIMA) {
        const proj = projectMap[pl.ID_Projeto];
        toCreate.push({
          tipo: 'MARGEM_ABAIXO_MINIMO', idProjeto: pl.ID_Projeto,
          mensagem: `Margem do projeto "${proj?.Nome || pl.Nome_Projeto}" em ${lucroPerc.toFixed(1)}% — abaixo do mínimo PAR de ${MARGEM_MINIMA}%.`,
          nivel: 'error', setorDestino: ['PO', 'Coordenador', 'Diretoria'],
        });
      }
    }

    // ─────────────────────────────────────────
    // 2h. CUSTO_PRODUCAO_ULTRAPASSOU
    // Custo equipe + terceirizados > 30% do contrato
    // ─────────────────────────────────────────
    for (const a of activeAlerts) {
      if (a.Tipo_Alerta !== 'CUSTO_PRODUCAO_ULTRAPASSOU') continue;
      const pl = planMap[a.ID_Projeto];
      if (!pl) { toResolveIds.add(a.ID); continue; }
      let dados = {};
      try { dados = JSON.parse(pl.Dados_JSON || '{}'); } catch {}
      const V = parseFloat(dados.valorContrato || pl.Valor_Contrato || 0);
      if (V === 0) { toResolveIds.add(a.ID); continue; }
      const prod = (dados.equipe || []).reduce((s, e) => s + parseFloat(e.horas || 0) * 36.4, 0)
        + (dados.terceirizados || []).reduce((s, t) => s + parseFloat(t.custo || 0), 0);
      if ((prod / V) * 100 <= TETO_CUSTO_PROD) toResolveIds.add(a.ID);
    }
    for (const pl of planejamentos) {
      if (!['Aprovado', 'Pendente Aprovação'].includes(pl.Status)) continue;
      if (activeIndex[`CUSTO_PRODUCAO_ULTRAPASSOU|${pl.ID_Projeto}`]) continue;
      let dados = {};
      try { dados = JSON.parse(pl.Dados_JSON || '{}'); } catch {}
      const V = parseFloat(dados.valorContrato || pl.Valor_Contrato || 0);
      if (V === 0) continue;
      const prod = (dados.equipe || []).reduce((s, e) => s + parseFloat(e.horas || 0) * 36.4, 0)
        + (dados.terceirizados || []).reduce((s, t) => s + parseFloat(t.custo || 0), 0);
      const prodPerc = (prod / V) * 100;
      if (prodPerc > TETO_CUSTO_PROD) {
        const proj = projectMap[pl.ID_Projeto];
        toCreate.push({
          tipo: 'CUSTO_PRODUCAO_ULTRAPASSOU', idProjeto: pl.ID_Projeto,
          mensagem: `Custo de produção do projeto "${proj?.Nome || pl.Nome_Projeto}" em ${prodPerc.toFixed(1)}% — acima do teto PAR de ${TETO_CUSTO_PROD}%.`,
          nivel: 'error', setorDestino: ['PO', 'Coordenador', 'Diretoria'],
        });
      }
    }

    // ─────────────────────────────────────────
    // 2i. EAP_TAREFA_GRANDE
    // Membros de equipe com > 16h estimadas sem particionamento
    // ─────────────────────────────────────────
    for (const a of activeAlerts) {
      if (a.Tipo_Alerta !== 'EAP_TAREFA_GRANDE') continue;
      // Resolve se o projeto saiu dos status ativos
      const p = projectMap[a.ID_Projeto];
      if (!p || !statusAtivos.includes(p.Status)) { toResolveIds.add(a.ID); continue; }
    }
    for (const pl of planejamentos) {
      if (!['Aprovado', 'Pendente Aprovação'].includes(pl.Status)) continue;
      let dados = {};
      try { dados = JSON.parse(pl.Dados_JSON || '{}'); } catch {}
      const equipe = dados.equipe || [];
      const grandeTarefas = equipe.filter(e => parseFloat(e.horas || e.horas_estimadas || 0) > MAX_HORAS_TAREFA);
      if (grandeTarefas.length > 0 && !activeIndex[`EAP_TAREFA_GRANDE|${pl.ID_Projeto}`]) {
        const proj = projectMap[pl.ID_Projeto];
        const nomes = grandeTarefas.map(e => `${e.colaborador || e.nome || '?'} (${parseFloat(e.horas || 0).toFixed(0)}h)`).join(', ');
        const linkClickUp = proj?.ID_ClickUp
          ? `https://app.clickup.com/${process.env.CLICKUP_TEAM_ID}/v/li/${proj.ID_ClickUp}`
          : '';
        toCreate.push({
          tipo: 'EAP_TAREFA_GRANDE', idProjeto: pl.ID_Projeto,
          mensagem: `Projeto "${proj?.Nome || pl.Nome_Projeto}": ${grandeTarefas.length} tarefa(s) com mais de ${MAX_HORAS_TAREFA}h sem particionamento — ${nomes}.`,
          nivel: 'warning', setorDestino: ['PO', 'Coordenador'],
          linkClickUp,
        });
      }
    }

    // ─────────────────────────────────────────
    // 3. Escrever em lote (máx 2 chamadas à API)
    // ─────────────────────────────────────────
    if (toResolveIds.size > 0) {
      await db.updateManyRowsWhere('Alertas', a => toResolveIds.has(a.ID), { Status: 'Resolvido' });
    }

    if (toCreate.length > 0) {
      const rows = toCreate.map(({ tipo, idProjeto, mensagem, nivel, setorDestino, linkClickUp }) => ({
        ID: uuidv4(),
        Tipo_Alerta: tipo,
        ID_Projeto: idProjeto || '',
        Mensagem: mensagem,
        Data_Geracao: new Date().toISOString(),
        Setor_Destino: Array.isArray(setorDestino) ? setorDestino.join(',') : setorDestino,
        Visto_Por: '',
        Status: 'ativo',
        Nivel: nivel,
        Link_ClickUp: linkClickUp || '',
      }));
      await db.insertManyRows('Alertas', rows);
      // Broadcast dos novos alertas
      for (const r of rows) {
        const setores = r.Setor_Destino.split(',');
        broadcast('alert', r, setores);
      }
    }

    console.log(`[Alertas] Resolvidos: ${toResolveIds.size} | Criados: ${toCreate.length}`);
  } catch (err) {
    console.error('[Alertas] Erro na verificação:', err.message);
  }
}

async function createAlert({ tipo, idProjeto, mensagem, nivel = 'warning', setorDestino, linkClickUp = '' }) {
  const alerta = {
    ID: uuidv4(),
    Tipo_Alerta: tipo,
    ID_Projeto: idProjeto || '',
    Mensagem: mensagem,
    Data_Geracao: new Date().toISOString(),
    Setor_Destino: Array.isArray(setorDestino) ? setorDestino.join(',') : setorDestino,
    Visto_Por: '',
    Status: 'ativo',
    Nivel: nivel,
    Link_ClickUp: linkClickUp,
  };
  await db.insertRow('Alertas', alerta);
  broadcast('alert', alerta, Array.isArray(setorDestino) ? setorDestino : [setorDestino]);
  return alerta;
}

module.exports = { createAlert, checkAllAlerts };
