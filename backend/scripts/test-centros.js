require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const opp = require('../src/services/oppService');

async function check() {
  const receitas = await opp.listarReceitas({ limit: 500 });
  const lista = Array.isArray(receitas) ? receitas : (receitas.data || []);
  const ossSet = new Set();
  for (const r of lista) {
    const m = (r.observacoes_rec || '').match(/ordem de servi[çc]o\s+n[º°]?\s*(\d+)/i);
    if (m) ossSet.add(m[1]);
  }
  const centros = [...ossSet].sort((a, b) => Number(a) - Number(b));
  console.log('Total OSs únicas:', centros.length);
  console.log('Últimas 10:', centros.slice(-10));
}

check().catch(console.error);
