const express = require('express');
const { Pool } = require('pg');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function getPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  });
}

// GET /api/auditoria
router.get('/', async (req, res, next) => {
  const pgPool = getPool();
  try {
    const { tabela, acao, usuario, busca, limit = 200, offset = 0 } = req.query;

    const where = [];
    const params = [];
    let i = 1;

    if (tabela)  { where.push(`"Tabela" = $${i++}`); params.push(tabela); }
    if (acao)    { where.push(`"Acao" = $${i++}`);   params.push(acao); }
    if (usuario) { where.push(`("Usuario_Nome" ILIKE $${i} OR "Usuario_Email" ILIKE $${i})`); params.push(`%${usuario}%`); i++; }
    if (busca)   { where.push(`("Nome_Registro" ILIKE $${i} OR "ID_Registro" ILIKE $${i})`); params.push(`%${busca}%`); i++; }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const [result, countResult] = await Promise.all([
      pgPool.query(
        `SELECT * FROM "Auditoria" ${whereClause} ORDER BY "Criado_Em" DESC LIMIT $${i} OFFSET $${i + 1}`,
        [...params, parseInt(limit), parseInt(offset)]
      ),
      pgPool.query(`SELECT COUNT(*) FROM "Auditoria" ${whereClause}`, params),
    ]);

    res.json({ registros: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    next(err);
  } finally {
    pgPool.end().catch(() => {});
  }
});

module.exports = router;
