// node backend/inspecionar-campos-contas-receber-opp.js
//
// Só lê (não grava nada). Mesma lógica do script de O.S.: o link direto de
// uma Conta a Receber no OPP provavelmente usa um ID interno diferente do
// "id_conta_rec" pequeno que já guardamos. Esse script imprime todos os
// campos brutos de algumas receitas pra eu achar o campo certo assim que
// tiver a URL de exemplo também.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const { listarReceitas } = require('./src/services/oppService');
  const agora = new Date();
  const inicio = new Date(agora);
  inicio.setMonth(inicio.getMonth() - 3);
  const fmt = (d) => d.toISOString().split('T')[0];

  const r = await listarReceitas({ data_inicio: fmt(inicio), data_fim: fmt(agora), limit: 5 });
  const lista = Array.isArray(r) ? r : (r?.data || []);

  if (!lista.length) {
    console.log('Nenhuma receita retornada (confere o período).');
    process.exit(1);
  }

  console.log(`### ${lista.length} Contas a Receber (todos os campos brutos da API) ###\n`);
  lista.slice(0, 5).forEach((x, i) => {
    console.log(`--- Registro ${i + 1} (id_conta_rec = ${x.id_conta_rec}) ---`);
    console.log(JSON.stringify(x, null, 2));
    console.log('');
  });

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
