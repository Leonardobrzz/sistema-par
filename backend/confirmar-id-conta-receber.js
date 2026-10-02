// node backend/confirmar-id-conta-receber.js
//
// Só lê (não grava nada). A URL que você mandou da Conta a Receber termina em
// ".../editar/140174903" — esse número é bem maior que os "id_conta_rec" das
// primeiras 5 contas que o script anterior mostrou (tava na faixa de 126
// milhões, essa é 140 milhões), então pode ser só uma conta mais recente (ID
// maior = criada depois) com o MESMO campo, ou pode ser um campo diferente —
// esse script confere, procurando esse número exato em TODOS os campos
// numéricos de TODAS as contas a receber dos últimos 3 meses.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const ALVO = '140174903';

async function main() {
  const { listarReceitas } = require('./src/services/oppService');
  const agora = new Date();
  const inicio = new Date(agora);
  inicio.setMonth(inicio.getMonth() - 3);
  const fmt = (d) => d.toISOString().split('T')[0];

  const r = await listarReceitas({ data_inicio: fmt(inicio), data_fim: fmt(agora) });
  const lista = Array.isArray(r) ? r : (r?.data || []);
  console.log(`Total de contas a receber carregadas: ${lista.length}\n`);

  let achou = false;
  for (const x of lista) {
    for (const [campo, valor] of Object.entries(x)) {
      if (String(valor) === ALVO) {
        achou = true;
        console.log(`✅ Achou! Campo "${campo}" = ${ALVO} no registro:`);
        console.log(JSON.stringify(x, null, 2));
        console.log('');
      }
    }
  }

  if (!achou) {
    console.log(`❌ Não achei ${ALVO} em nenhum campo de nenhuma conta a receber dos últimos 3 meses.`);
    console.log('Pode ser uma conta mais antiga (fora da janela de 3 meses) — se souber o Nº da NF dessa conta específica, me diga que eu busco por ele.');
  }

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
