/**
 * Middleware global de tratamento de erros.
 */
function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err.message, err.stack);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor.';

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorHandler;
