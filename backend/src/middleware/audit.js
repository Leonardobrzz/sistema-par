const { v4: uuidv4 } = require('uuid');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : null;

// Tabelas e campo identificador de cada uma
const TABLE_CONFIG = {
  Projetos_Contratos: { idField: 'ID_Projeto', nameField: 'Nome' },
  Planejamentos:      { idField: 'ID_Planejamento', nameField: 'Nome_Projeto' },
  Medicoes:           { idField: 'ID_Medicao', nameField: 'Descricao' },
  Terceirizados:      { idField: 'ID_Terceirizado', nameField: 'Empresa' },
  Alertas:            { idField: 'ID_Alerta', nameField: 'Tipo_Alerta' },
  USER:               { idField: 'ID', nameField: 'Nome' },
};

async function registrarAuditoria({ tabela, acao, idRegistro, nomeRegistro, dadosAntes, dadosDepois, usuario }) {
  if (!db) return;
  try {
    await db.insertRow('Auditoria', {
      ID_Auditoria:   uuidv4(),
      Tabela:         tabela,
      Acao:           acao,
      ID_Registro:    idRegistro || null,
      Nome_Registro:  nomeRegistro || null,
      Dados_Antes:    dadosAntes ? JSON.stringify(dadosAntes) : null,
      Dados_Depois:   dadosDepois ? JSON.stringify(dadosDepois) : null,
      Usuario_ID:     usuario?.id || null,
      Usuario_Nome:   usuario?.nome || null,
      Usuario_Email:  usuario?.email || null,
      Criado_Em:      new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[Auditoria] Falha ao registrar:', e.message);
  }
}

// Factory que retorna middleware de auditoria para uma tabela específica
function auditMiddleware(tabela) {
  const cfg = TABLE_CONFIG[tabela] || {};

  return async function audit(req, res, next) {
    const acao = req.method === 'POST' ? 'CRIACAO'
               : req.method === 'PUT'  ? 'EDICAO'
               : req.method === 'DELETE' ? 'EXCLUSAO'
               : null;

    if (!acao || !db) return next();

    const id = req.params.id || null;
    let dadosAntes = null;

    // Captura estado anterior para EDICAO e EXCLUSAO
    if ((acao === 'EDICAO' || acao === 'EXCLUSAO') && id && cfg.idField) {
      try {
        dadosAntes = await db.findOne(tabela, r => r[cfg.idField] === id);
      } catch (_) {}
    }

    // Intercepta res.json para capturar o que foi gravado
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      const dadosDepois = acao === 'EXCLUSAO' ? null : (body && !body.error ? body : null);
      const nomeRegistro = dadosAntes?.[cfg.nameField] || dadosDepois?.[cfg.nameField] || null;
      const idRegistro   = id || dadosDepois?.[cfg.idField] || null;

      registrarAuditoria({
        tabela, acao, idRegistro, nomeRegistro,
        dadosAntes:  acao !== 'CRIACAO' ? dadosAntes : null,
        dadosDepois: acao !== 'EXCLUSAO' ? dadosDepois : null,
        usuario: req.user,
      });

      return originalJson(body);
    };

    next();
  };
}

module.exports = { auditMiddleware, registrarAuditoria };
