const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    // Busca tanto na coluna 'Email' (novo padrão) quanto 'Usuario' (tabela antiga do usuário)
    const user = await db.findOne('USER', (u) => {
      const emailDigitado = email.toLowerCase().trim();
      const dbEmail = u.Email ? u.Email.toLowerCase().trim() : null;
      const dbUsuario = u.Usuario ? u.Usuario.toLowerCase().trim() : null;
      return dbEmail === emailDigitado || dbUsuario === emailDigitado;
    });

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Se 'Ativo' existir na planilha, checa. Senão, pula a validação (legado)
    if (user.Ativo && user.Ativo !== 'true' && user.Ativo !== '1') {
      return res.status(403).json({ error: 'Usuário inativo. Contate o administrador.' });
    }

    // Verifica a senha. Se houver Senha (texto puro no legado), compara direto. Se houver Senha_Hash, usa bcrypt.
    let senhaValida = false;
    if (user.Senha_Hash) {
      senhaValida = await bcrypt.compare(senha, user.Senha_Hash);
    } else if (user.Senha) {
      senhaValida = (senha === user.Senha); // Legado em texto puro
    }

    if (!senhaValida) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Atualiza último login (tenta salvar a data, se a coluna não existir, o sheet service ignora)
    try {
      await db.updateRowById('USER', 'ID', user.ID, { ...user, Ultimo_Login: new Date().toISOString() });
    } catch(e) {} // ignora erro em legacy

    const token = jwt.sign(
      { 
        id: user.ID || user.Usuario, 
        nome: user.Nome || user.Usuario, 
        email: user.Email || user.Usuario, 
        perfil: user.Perfil || 'Admin', 
        empresa: user.Empresa || 'Jota Barros Projetos' 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: { 
        id: user.ID || user.Usuario, 
        nome: user.Nome || user.Usuario, 
        email: user.Email || user.Usuario, 
        perfil: user.Perfil || 'Admin', 
        empresa: user.Empresa || 'Jota Barros Projetos' 
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/setup — cria o primeiro usuário admin (só funciona se não houver nenhum)
router.post('/setup', async (req, res, next) => {
  try {
    const { nome, email, senha, empresa } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }

    const users = await db.readSheet('USER');
    if (users.length > 0) {
      return res.status(403).json({ error: 'Sistema já configurado. Contate o administrador.' });
    }

    const senhaHash = await bcrypt.hash(senha, 12);
    const user = {
      ID: uuidv4(),
      Nome: nome,
      Email: email.toLowerCase().trim(),
      Senha_Hash: senhaHash,
      Perfil: 'Admin',
      Empresa: empresa || 'Jota Barros Projetos',
      Ativo: 'true',
      Criado_Em: new Date().toISOString(),
      Ultimo_Login: '',
    };

    await db.insertRow('USER', user);

    res.status(201).json({ message: 'Usuário administrador criado com sucesso.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — retorna dados do usuário atual
router.get('/me', require('../middleware/auth').authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
