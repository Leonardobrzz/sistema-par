const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Middleware de timeout para rotas pesadas
function withTimeout(ms) {
  return (req, res, next) => {
    res.setTimeout(ms, () => {
      if (!res.headersSent) {
        res.status(503).json({ error: 'Tempo limite excedido. Tente novamente.' });
      }
    });
    next();
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatPerc(value) {
  return `${parseFloat(value || 0).toFixed(2)}%`;
}

// ── GET /api/relatorios/planejamento/:idProjeto/excel ─────────────────────────
router.get('/planejamento/:idProjeto/excel', async (req, res, next) => {
  try {
    const plan = await db.findOne('Planejamentos', (p) => p.ID_Projeto === req.params.idProjeto);
    if (!plan) return res.status(404).json({ error: 'Planejamento não encontrado.' });

    const project = await db.findOne('Projetos_Contratos', (p) => p.ID_Projeto === req.params.idProjeto);
    let dados = {};
    try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistema PAR — Jota Barros Projetos';
    wb.created = new Date();

    // ── Aba: Resumo Geral ──
    const wsResumo = wb.addWorksheet('Resumo Geral');
    wsResumo.mergeCells('A1:F1');
    wsResumo.getCell('A1').value = 'PLANEJAMENTO FINANCEIRO — JOTA BARROS PROJETOS';
    wsResumo.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF4338CA' } };
    wsResumo.getCell('A1').alignment = { horizontal: 'center' };

    const resumoData = [
      ['Projeto', plan.Nome_Projeto],
      ['Cliente', plan.Cliente],
      ['Nº Contrato / O.S.', plan.Nr_Contrato_OS],
      ['Empresa', plan.Empresa],
      ['Setor', plan.Setor],
      ['Responsável Planejamento', plan.Resp_Planejamento],
      ['Responsável Aprovação', plan.Resp_Aprovacao],
      ['Valor Total do Contrato', formatBRL(plan.Valor_Contrato)],
      ['Impostos %', formatPerc(plan.Impostos_Perc)],
      ['Taxa Adm %', formatPerc(plan.Taxa_Adm_Perc)],
      ['Comissão %', formatPerc(plan.Comissao_Perc)],
      ['Data Início OS', plan.Data_Inicio_OS],
      ['Data Entrega Contrato', plan.Data_Entrega_Contrato],
      ['Data Entrega Planejada', plan.Data_Entrega_Planejada],
      ['Status', plan.Status],
    ];

    resumoData.forEach((row, i) => {
      const r = wsResumo.addRow(row);
      r.getCell(1).font = { bold: true };
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });

    wsResumo.getColumn(1).width = 35;
    wsResumo.getColumn(2).width = 45;

    // ── Aba: Planejamento Financeiro ──
    const wsPlan = wb.addWorksheet('Planejamento Financeiro');

    const V = parseFloat(plan.Valor_Contrato || 0);
    const ip = parseFloat(plan.Impostos_Perc || 16.33);
    const ta = parseFloat(plan.Taxa_Adm_Perc || 12);
    const co = parseFloat(plan.Comissao_Perc || 7.5);
    const impostos = V * ip / 100;
    const taxaAdm = V * ta / 100;
    const comissao = V * co / 100;

    const terceirizados = dados.terceirizados || [];
    const equipe = dados.equipe || [];
    const despesas = dados.despesas || [];
    const totalTerceiros = terceirizados.reduce((s, t) => s + parseFloat(t.custo || 0), 0);
    const totalEquipe = equipe.reduce((s, e) => s + (parseFloat(e.mediaHora || 0) * parseFloat(e.horas || 0)), 0);
    const totalDespesas = despesas.reduce((s, d) => s + parseFloat(d.valor || 0), 0);
    const receitaLiquida = V - impostos - taxaAdm - comissao;
    const lucro = receitaLiquida - totalTerceiros - totalEquipe - totalDespesas;

    const planRows = [
      ['RECEITA', '', ''],
      ['Valor Total do Contrato', '', formatBRL(V)],
      ['(-) Impostos', formatPerc(ip), formatBRL(impostos)],
      ['(-) Taxa Administrativa', formatPerc(ta), formatBRL(taxaAdm)],
      ['(-) Comissão', formatPerc(co), formatBRL(comissao)],
      ['= Receita Líquida', '', formatBRL(receitaLiquida)],
      ['', '', ''],
      ['CUSTOS', '', ''],
      ['(-) Terceirizados', '', formatBRL(totalTerceiros)],
      ['(-) Equipe Interna', '', formatBRL(totalEquipe)],
      ['(-) Despesas Gerais', '', formatBRL(totalDespesas)],
      ['', '', ''],
      ['= LUCRO ESTIMADO', '', formatBRL(lucro)],
      ['% Lucro', '', formatPerc(V > 0 ? (lucro / V) * 100 : 0)],
    ];

    planRows.forEach((row) => {
      const r = wsPlan.addRow(row);
      if (row[0].startsWith('=') || row[0] === 'RECEITA' || row[0] === 'CUSTOS') {
        r.font = { bold: true };
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDE1FA' } };
      }
    });

    wsPlan.getColumn(1).width = 40;
    wsPlan.getColumn(2).width = 15;
    wsPlan.getColumn(3).width = 20;

    // ── Aba: Cronograma de Medições ──
    const wsMed = wb.addWorksheet('Cronograma Medições');
    wsMed.addRow(['Etapa / Medição', 'Previsão', 'Valor (R$)', '% do Contrato']).font = { bold: true };

    const medicoesPlan = dados.medicoes || [];
    for (const m of medicoesPlan) {
      wsMed.addRow([m.etapa, m.dataPrevisao, formatBRL(m.valor), formatPerc(m.percentual)]);
    }

    const totalMed = medicoesPlan.reduce((s, m) => s + parseFloat(m.valor || 0), 0);
    const totalPercMed = medicoesPlan.reduce((s, m) => s + parseFloat(m.percentual || 0), 0);
    const totalRow = wsMed.addRow(['TOTAL', '', formatBRL(totalMed), formatPerc(totalPercMed)]);
    totalRow.font = { bold: true };

    wsMed.getColumn(1).width = 40;
    wsMed.getColumn(2).width = 15;
    wsMed.getColumn(3).width = 20;
    wsMed.getColumn(4).width = 15;

    // ── Aba: Serviços Terceirizados ──
    const wsTerc = wb.addWorksheet('Serviços Terceirizados');
    wsTerc.addRow(['Task ID', 'Serviço', 'Vínculo', 'Ref. Contrato (R$)', 'Custo (R$)', '% Geral']).font = { bold: true };

    for (const t of terceirizados) {
      const percGeral = V > 0 ? (parseFloat(t.custo || 0) / V) * 100 : 0;
      wsTerc.addRow([t.taskId, t.servico, t.vinculo, formatBRL(t.valorRef), formatBRL(t.custo), formatPerc(percGeral)]);
    }

    const tRow = wsTerc.addRow(['TOTAL TERCEIROS', '', '', '', formatBRL(totalTerceiros), formatPerc(V > 0 ? (totalTerceiros / V) * 100 : 0)]);
    tRow.font = { bold: true };

    ['A', 'B', 'C', 'D', 'E', 'F'].forEach((col, i) => {
      wsTerc.getColumn(i + 1).width = [15, 35, 25, 20, 20, 12][i];
    });

    // ── Envia resposta ──
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Planejamento_${plan.Nome_Projeto?.replace(/\s/g, '_')}.xlsx"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

// ── GET /api/relatorios/planejamento/:idProjeto/pdf ───────────────────────────
router.get('/planejamento/:idProjeto/pdf', async (req, res, next) => {
  try {
    const plan = await db.findOne('Planejamentos', (p) => p.ID_Projeto === req.params.idProjeto);
    if (!plan) return res.status(404).json({ error: 'Planejamento não encontrado.' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Planejamento_${plan.Nome_Projeto?.replace(/\s/g, '_')}.pdf"`);
    doc.pipe(res);

    // Cabeçalho
    doc.fontSize(18).fillColor('#4338CA').text('PLANEJAMENTO FINANCEIRO', { align: 'center' });
    doc.fontSize(11).fillColor('#64748B').text('Jota Barros Projetos — Engenharia & Arquitetura', { align: 'center' });
    doc.fontSize(10).text(`PAR 2026 — Metodologia PAR`, { align: 'center' });
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#4338CA');
    doc.moveDown(0.5);

    // Informações Gerais
    doc.fontSize(12).fillColor('#4338CA').text('INFORMAÇÕES GERAIS', { underline: false });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#1E293B');

    const info = [
      ['Projeto', plan.Nome_Projeto],
      ['Cliente', plan.Cliente],
      ['Nº Contrato / O.S.', plan.Nr_Contrato_OS],
      ['Empresa', plan.Empresa],
      ['Setor', plan.Setor],
      ['Tipologia', plan.Tipologia],
      ['Resp. Planejamento', plan.Resp_Planejamento],
      ['Resp. Aprovação', plan.Resp_Aprovacao],
    ];

    info.forEach(([label, value]) => {
      doc.text(`${label}: `, { continued: true }).text(value || '—', { fillColor: '#374151' });
    });

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#E2E8F0');
    doc.moveDown(0.5);

    // Parâmetros Financeiros
    doc.fontSize(12).fillColor('#4338CA').text('PARÂMETROS FINANCEIROS');
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#1E293B');

    const V = parseFloat(plan.Valor_Contrato || 0);
    const ip = parseFloat(plan.Impostos_Perc || 16.33);
    const ta = parseFloat(plan.Taxa_Adm_Perc || 12);
    const co = parseFloat(plan.Comissao_Perc || 7.5);
    const impostos = V * ip / 100;
    const taxaAdm = V * ta / 100;
    const comissao = V * co / 100;

    let dados = {};
    try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}

    const terceirizados = dados.terceirizados || [];
    const equipe = dados.equipe || [];
    const despesas = dados.despesas || [];
    const totalTerceiros = terceirizados.reduce((s, t) => s + parseFloat(t.custo || 0), 0);
    const totalEquipe = equipe.reduce((s, e) => s + (parseFloat(e.mediaHora || 0) * parseFloat(e.horas || 0)), 0);
    const totalDespesas = despesas.reduce((s, d) => s + parseFloat(d.valor || 0), 0);
    const receitaLiquida = V - impostos - taxaAdm - comissao;
    const lucro = receitaLiquida - totalTerceiros - totalEquipe - totalDespesas;

    [
      ['Valor Total do Contrato', formatBRL(V)],
      ['Impostos (' + ip + '%)', formatBRL(impostos)],
      ['Taxa Administrativa (' + ta + '%)', formatBRL(taxaAdm)],
      ['Comissão (' + co + '%)', formatBRL(comissao)],
      ['Receita Líquida', formatBRL(receitaLiquida)],
      ['Total Terceirizados', formatBRL(totalTerceiros)],
      ['Total Equipe Interna', formatBRL(totalEquipe)],
      ['Total Despesas Gerais', formatBRL(totalDespesas)],
      ['Lucro Estimado', formatBRL(lucro) + ` (${V > 0 ? ((lucro / V) * 100).toFixed(1) : 0}%)`],
    ].forEach(([label, value]) => {
      doc.text(`${label}: `, { continued: true }).text(value);
    });

    doc.moveDown(2);

    // Assinaturas
    const ySign = doc.y;
    doc.fontSize(10).fillColor('#374151');
    doc.text('_______________________________', 80, ySign);
    doc.text('Elaborado por', 80, ySign + 15, { align: 'left', width: 200 });
    doc.text(plan.Resp_Planejamento || '', 80, ySign + 30);

    doc.text('_______________________________', 320, ySign);
    doc.text('Aprovado por', 320, ySign + 15, { align: 'left', width: 200 });
    doc.text(plan.Resp_Aprovacao || '', 320, ySign + 30);

    doc.end();
  } catch (err) {
    next(err);
  }
});

// GET /api/relatorios/terceirizados — relatório de todos os terceirizados
router.get('/terceirizados', async (req, res, next) => {
  try {
    const tercs = await db.readSheet('Terceirizados');
    const projects = await db.readSheet('Projetos_Contratos');
    const map = {};
    for (const p of projects) { map[p.ID_Projeto] = { nome: p.Nome, valor: parseFloat(p.Valor_Global || 0) }; }

    const enriched = tercs.map((t) => {
      const proj = map[t.ID_Projeto] || {};
      return {
        ...t,
        nomeProjeto: proj.nome || '',
        percContrato: proj.valor > 0 ? ((parseFloat(t.Valor_Contratado || 0) / proj.valor) * 100).toFixed(2) : '0',
      };
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// ── Helpers de auditoria ──────────────────────────────────────────────────────

async function buildAuditData(projetos, terceirizados, alertas) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Excluir listas genéricas de fase (sub-listas dentro de pastas)
  const NOMES_IGNORAR = /^(projetos internos|projetos externos|planejamento|execução|finalização|overview|backlog|painel de projetos|execução de projetos|0_padronizações)$/i;

  const projetosReais = projetos.filter((p) => {
    const nome = (p.Nome || '').trim();
    if (NOMES_IGNORAR.test(nome)) return false;
    if (p.Setor && p.Setor.trim() !== '' && nome !== p.Setor.trim()) return false;
    return p.ID_ClickUp || p.Cliente || p.Setor;
  });

  // Usa dados já sincronizados do Google Sheets (sem chamada à API do ClickUp)
  const results = [];
  for (const p of projetosReais) {
    const clienteDisplay = (p.Cliente || p.Setor || '—').trim();
    const venc = p.Data_Entrega_Contrato ? new Date(p.Data_Entrega_Contrato) : null;
    const vencido = venc && venc < hoje && p.Status !== 'Concluído';

    // Progresso já sincronizado do ClickUp (atualiza a cada 15 min via cron)
    const progresso = parseInt(p.Progresso_Perc || 0);

    const tercsProj = terceirizados.filter((t) => t.ID_Projeto === p.ID_Projeto && t.Status !== 'Cancelado');
    const tercPendentes = tercsProj.filter((t) => !['Pago', 'Concluído'].includes(t.Status)).length;

    const statusAtrasado = p.Status?.toLowerCase().includes('atrasado');

    // Alertas ativos para este projeto
    const alertasProj = (alertas || []).filter((a) => a.ID_Projeto === p.ID_Projeto && a.Status?.toLowerCase() === 'ativo');
    const temSemResponsavel = alertasProj.some(a => a.Tipo_Alerta === 'SEM_RESPONSAVEL');
    const temAtrasada = alertasProj.some(a => a.Tipo_Alerta === 'TAREFA_ATRASADA');
    const temSemPrazo = alertasProj.some(a => a.Tipo_Alerta === 'PRAZO_NAO_DEFINIDO');

    const erros = [];
    if (vencido) erros.push('Projeto vencido (data de entrega ultrapassada).');
    if (statusAtrasado && !vencido) erros.push('Projeto com status Atrasado.');
    if (tercPendentes > 0 && tercPendentes > tercsProj.length / 2) erros.push(`${tercPendentes} terceirizado(s) com pagamento pendente.`);
    if (temSemResponsavel) erros.push('Há tarefas sem responsável atribuído.');
    if (temAtrasada) erros.push('Há tarefas atrasadas no ClickUp.');
    if (temSemPrazo) erros.push('Projeto sem data de entrega definida.');

    results.push({
      ID_Projeto: p.ID_Projeto,
      Cliente: clienteDisplay,
      Nome: p.Nome,
      Setor: p.Setor || '',
      Status: p.Status,
      Vencimento: p.Data_Entrega_Contrato || '',
      Progresso: progresso,
      TercPendentes: tercPendentes,
      TercTotal: tercsProj.length,
      AlertasAtivos: alertasProj.length,
      Link_ClickUp: p.Link_ClickUp || '',
      Auditoria: erros.length > 0 ? 'ERRO' : 'OK',
      Erros: erros,
    });
  }

  // Ordena: projetos com ERRO primeiro
  results.sort((a, b) => {
    if (a.Auditoria === 'ERRO' && b.Auditoria !== 'ERRO') return -1;
    if (a.Auditoria !== 'ERRO' && b.Auditoria === 'ERRO') return 1;
    return 0;
  });

  return results;
}

// ── GET /api/relatorios/auditoria ─────────────────────────────────────────────
router.get('/auditoria', withTimeout(20000), async (req, res, next) => {
  try {
    const [projetos, terceirizados, alertas] = await Promise.all([
      db.readSheet('Projetos_Contratos'),
      db.readSheet('Terceirizados'),
      db.readSheet('Alertas'),
    ]);
    const data = await buildAuditData(projetos, terceirizados, alertas);
    res.json({ projetos: data, geradoEm: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/relatorios/auditoria/pdf ─────────────────────────────────────────
router.get('/auditoria/pdf', withTimeout(25000), async (req, res, next) => {
  try {
    const [projetos, terceirizados, alertas] = await Promise.all([
      db.readSheet('Projetos_Contratos'),
      db.readSheet('Terceirizados'),
      db.readSheet('Alertas'),
    ]);
    const data = await buildAuditData(projetos, terceirizados, alertas);
    const erros = data.filter((p) => p.Auditoria === 'ERRO');

    const doc = new PDFDocument({ margin: 45, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    const dataStr = new Date().toLocaleDateString('pt-BR');
    res.setHeader('Content-Disposition', `attachment; filename="Auditoria_${dataStr.replace(/\//g, '-')}.pdf"`);
    doc.pipe(res);

    // ── Cabeçalho ──
    doc.fontSize(16).fillColor('#1E3A5F').text('Jota Barros Projetos', { align: 'left' });
    doc.fontSize(9).fillColor('#64748B').text(`Relatório de Auditoria`, { align: 'left', continued: true });
    doc.text(`   Gerado em: ${dataStr}`, { align: 'right' });
    doc.moveDown(0.5);
    doc.moveTo(45, doc.y).lineTo(800, doc.y).lineWidth(1).stroke('#1E3A5F');
    doc.moveDown(0.5);

    // ── Tabela ──
    const cols = [
      { label: 'CLIENTE', width: 100 },
      { label: 'PROJETO', width: 200 },
      { label: 'STATUS', width: 100 },
      { label: 'VENCIMENTO', width: 80 },
      { label: 'PROGRESSO', width: 70 },
      { label: 'PEND/TERC', width: 65 },
      { label: 'AUDITORIA', width: 65 },
    ];

    const tableTop = doc.y;
    let x = 45;

    // Header row
    doc.rect(45, tableTop, cols.reduce((s, c) => s + c.width, 0), 18).fill('#1E3A5F');
    doc.fontSize(8).fillColor('#FFFFFF');
    cols.forEach((col) => {
      doc.text(col.label, x + 3, tableTop + 5, { width: col.width - 6, align: 'left' });
      x += col.width;
    });

    let y = tableTop + 18;
    doc.fontSize(8);

    data.forEach((row, i) => {
      const rowH = 20;

      // Nova página ANTES de desenhar a linha
      if (y > doc.page.height - 80) {
        doc.addPage({ layout: 'landscape' });
        y = 45;
      }

      const bg = i % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
      doc.rect(45, y, cols.reduce((s, c) => s + c.width, 0), rowH).fill(bg);

      const cells = [
        row.Cliente,
        row.Nome,
        row.Status,
        row.Vencimento ? new Date(row.Vencimento).toLocaleDateString('pt-BR') : '—',
        `${row.Progresso}%`,
        `${row.TercPendentes} / ${row.TercTotal}`,
        row.Auditoria,
      ];

      x = 45;
      cells.forEach((val, ci) => {
        const isErro = ci === 6 && val === 'ERRO';
        const isVenc = ci === 3 && row.Auditoria === 'ERRO';
        doc.fillColor(isErro ? '#DC2626' : isVenc ? '#DC2626' : '#1E293B');
        doc.text(String(val), x + 3, y + 6, { width: cols[ci].width - 6, align: 'left', lineBreak: false });
        x += cols[ci].width;
      });

      y += rowH;
    });

    doc.moveDown(1);
    y += 10;

    // ── Inconformidades ──
    if (erros.length > 0) {
      doc.rect(45, y, cols.reduce((s, c) => s + c.width, 0), 20).fill('#FEF2F2');
      doc.fontSize(10).fillColor('#991B1B').text('⚠ Inconformidades Encontradas (Checklist de Ajustes)', 48, y + 5);
      y += 24;

      erros.forEach((p) => {
        doc.fontSize(8).fillColor('#DC2626').text(`ERRO: ${p.Cliente} > ${p.Nome}`, 55, y);
        y += 12;
        p.Erros.forEach((e) => {
          doc.fillColor('#374151').text(`- ${e}`, 65, y);
          y += 11;
        });
        y += 2;
        if (y > doc.page.height - 60) { doc.addPage({ layout: 'landscape' }); y = 45; }
      });
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});

// ── GET /api/relatorios/auditoria/excel ───────────────────────────────────────
router.get('/auditoria/excel', withTimeout(25000), async (req, res, next) => {
  try {
    const [projetos, terceirizados, alertas] = await Promise.all([
      db.readSheet('Projetos_Contratos'),
      db.readSheet('Terceirizados'),
      db.readSheet('Alertas'),
    ]);
    const data = await buildAuditData(projetos, terceirizados, alertas);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistema PAR — Jota Barros Projetos';
    const ws = wb.addWorksheet('Auditoria de Projetos');

    ws.columns = [
      { header: 'Cliente',      key: 'Cliente',      width: 28 },
      { header: 'Projeto',      key: 'Nome',         width: 40 },
      { header: 'Setor',        key: 'Setor',        width: 20 },
      { header: 'Status',       key: 'Status',       width: 22 },
      { header: 'Vencimento',   key: 'Vencimento',   width: 14 },
      { header: 'Progresso %',  key: 'Progresso',    width: 13 },
      { header: 'Terc. Pend.',  key: 'TercPendentes',width: 12 },
      { header: 'Terc. Total',  key: 'TercTotal',    width: 12 },
      { header: 'Alertas',      key: 'AlertasAtivos',width: 10 },
      { header: 'Auditoria',    key: 'Auditoria',    width: 12 },
      { header: 'Inconformidades', key: 'Erros',     width: 60 },
    ];

    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };

    for (const p of data) {
      const row = ws.addRow({
        ...p,
        Vencimento: p.Vencimento ? new Date(p.Vencimento).toLocaleDateString('pt-BR') : '—',
        Erros: (p.Erros || []).join(' | '),
      });
      if (p.Auditoria === 'ERRO') {
        row.getCell('Auditoria').font = { bold: true, color: { argb: 'FFDC2626' } };
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } };
      }
    }

    const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Auditoria_${dateStr}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
