const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticação JWT.
 * Verifica o token Bearer no header Authorization.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

/**
 * Middleware de autorização por perfil.
 * @param  {...string} perfis - perfis autorizados (PO, Comercial, Financeiro, Coordenador, Admin)
 */
function authorize(...perfis) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    if (!perfis.includes(req.user.perfil) && req.user.perfil !== 'Admin') {
      return res.status(403).json({ error: 'Acesso negado para este perfil.' });
    }
    next();
  };
}

module.exports = { authMiddleware, authorize };
