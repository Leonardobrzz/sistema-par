require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const opp = require('../src/services/oppService');

async function check() {
  const r = await opp.listarReceitas({ limit: 5 });
  const rows = r.data || r;
  if (!rows || !rows[0]) { console.log('Sem dados'); return; }

  console.log('Campos disponíveis:', Object.keys(rows[0]).join(', '));
  console.log('\nAmostra de observacoes_rec:');
  rows.forEach(row => console.log(' -', row.observacoes_rec));

  // Extrai número OS das observações
  console.log('\nOS extraídas:');
  rows.forEach(row => {
    const match = (row.observacoes_rec || '').match(/ordem de servi[çc]o\s+n[º°]?\s*(\d+)/i);
    if (match) console.log(' OS:', match[1], '| obs:', row.observacoes_rec?.slice(0, 80));
  });
}

check().catch(console.error);
