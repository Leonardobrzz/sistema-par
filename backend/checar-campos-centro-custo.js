// node backend/checar-campos-centro-custo.js
//
// Só lê. Mostra os campos crus que o OPP devolve em /centros-custo, pra ver
// se já vem o ID do cliente junto (o que permitiria preencher o
// ID_OPP_Cliente automaticamente sempre que alguém travar o vínculo de
// Centro de Custo na tela de Planejamento Financeiro — sem precisar de
// script nenhum da minha parte depois).

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const { oppRequest } = require('./src/services/oppService');
  const data = await oppRequest('GET', '/centros-custo?limit=5');
  const lista = Array.isArray(data) ? data : (data?.data || []);
  console.log(`${lista.length} registro(s) de amostra:\n`);
  for (const c of lista) {
    console.log(JSON.stringify(c, null, 2));
    console.log('---');
  }
  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
