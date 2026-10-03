// node backend/diagnosticar-lixeira-contas-receber.js
//
// Só lê (não grava nada). ACHADO IMPORTANTE: o registro de exemplo que
// puxamos antes (id_conta_rec=124639445, FORTIM) veio com "lixeira":"Sim" —
// ou seja, é um registro na LIXEIRA do OPP! E o código que busca contas a
// receber (fetchOppReceitas, em dashboard-financeiro.js, e os diagnósticos
// anteriores) NUNCA filtrou isso — ao contrário de /ordens-compra e
// /contas-pagar no resto do sistema, que sempre usam &lixeira=Nao.
//
// O chef mostrou print do OPP com "Centro de custos" preenchido de verdade
// pra essas contas (ex.: "SAN AGUAS DO SERTÃO AURORA E"). Então a hipótese
// é: existe uma versão ATIVA (lixeira=Nao) dessas contas, com centro de
// custo preenchido, e a gente só estava enxergando/contando uma versão
// antiga/substituída (lixeira=Sim) sem esse campo — o que pode estar
// inflando o total (contando as duas) e escondendo o vínculo de verdade.
//
// Esse script busca a MESMA conta (pelo id_conta_rec ou pelo NF) com e sem
// o filtro de lixeira, pra confirmar.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const { oppRequest } = require('./src/services/oppService');

  console.log('=== 1) Contagem com e sem filtro de lixeira ===\n');
  async function contarTudo(comFiltro) {
    let offset = 0, total = 0, liquidadas = 0, comCC = 0;
    while (true) {
      const url = comFiltro
        ? `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`
        : `/contas-receber?limit=250&offset=${offset}`;
      const r = await oppRequest('GET', url);
      const lista = Array.isArray(r) ? r : (r?.data || []);
      if (lista.length === 0) break;
      total += lista.length;
      lista.forEach((x) => {
        if (x.liquidado_rec === 'Sim') liquidadas++;
        if (x.id_centro_custos && x.id_centro_custos !== 0) comCC++;
      });
      if (lista.length < 250) break;
      offset += 250;
      if (offset > 10000) break;
    }
    return { total, liquidadas, comCC };
  }
  const semFiltro = await contarTudo(false);
  console.log(`SEM &lixeira=Nao: total=${semFiltro.total} | liquidadas=${semFiltro.liquidadas} | com centro de custo=${semFiltro.comCC}`);
  const comFiltro = await contarTudo(true);
  console.log(`COM &lixeira=Nao: total=${comFiltro.total} | liquidadas=${comFiltro.liquidadas} | com centro de custo=${comFiltro.comCC}\n`);

  console.log('=== 2) Procurando de novo as contas da FORTIM (NF 2817/2818/2819), agora COM &lixeira=Nao ===\n');
  let offset = 0, todasAtivas = [];
  while (true) {
    const r = await oppRequest('GET', `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    todasAtivas.push(...lista);
    if (lista.length < 250) break;
    offset += 250;
    if (offset > 10000) break;
  }
  ['2817', '2818', '2819'].forEach((nf) => {
    const achados = todasAtivas.filter((x) => String(x.n_documento_rec) === nf);
    if (achados.length === 0) {
      console.log(`NF ${nf}: NÃO aparece na lista ATIVA (lixeira=Nao) — só existia na lixeira.`);
    } else {
      achados.forEach((a) => console.log(`NF ${nf} (ATIVA): id_conta_rec=${a.id_conta_rec} | id_centro_custos=${a.id_centro_custos} | centro_custos_rec="${a.centro_custos_rec}" | valor_rec=${a.valor_rec} | lixeira=${a.lixeira}`));
    }
  });

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
