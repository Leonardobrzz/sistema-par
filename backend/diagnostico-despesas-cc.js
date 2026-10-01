// node backend/diagnostico-despesas-cc.js
//
// Só lê (OPP + banco). Não grava nada.
//
// Na tela "Extrato Financeiro por Projeto", 2.0 Custos Diretos e 3.0 Despesas
// Operacionais vêm sempre R$ 0,00 pra TODOS os 66 projetos, mesmo em projetos
// com receita grande batendo certo. As Receitas (contas-receber) já estão
// batendo via id_centro_custos — então o suspeito é um dos três:
//   1) a chamada a /contas-pagar está falhando (erro de rede/API engolido
//      por um catch silencioso) e por isso a lista fica vazia;
//   2) a lista vem cheia, mas o campo id_centro_custos simplesmente não vem
//      preenchido nas despesas (diferente das receitas);
//   3) a lista vem cheia e com id_centro_custos preenchido, mas nenhum bate
//      com os ID_Centro_Custo_OPP que os projetos já têm confirmado.
// Este script testa os três, na ordem, com os MESMOS parâmetros que a tela
// usa (18 meses pra trás até hoje).

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const opp = require('./src/services/oppService');
  const db = require('./src/services/postgresService');

  const agora = new Date();
  const inicio = new Date(agora);
  inicio.setMonth(inicio.getMonth() - 18);
  const fmt = (d) => d.toISOString().split('T')[0];

  console.log(`Buscando /contas-pagar de ${fmt(inicio)} até ${fmt(agora)}...\n`);

  let despesas = [];
  try {
    despesas = await opp.listarDespesas({ data_inicio: fmt(inicio), data_fim: fmt(agora) });
  } catch (e) {
    console.log('❌ A chamada a /contas-pagar FALHOU com erro:');
    console.log(e.message);
    console.log('\n→ É isso: o catch silencioso na tela está escondendo esse erro e devolvendo lista vazia.');
    process.exit(1);
  }

  const lista = Array.isArray(despesas) ? despesas : (despesas?.data || []);
  console.log(`✅ Chamada funcionou. Total de despesas retornadas: ${lista.length}\n`);

  if (lista.length === 0) {
    console.log('→ A lista veio vazia mesmo sem erro (0 despesas nesse período). Isso explicaria os R$ 0,00.');
    process.exit(0);
  }

  const semLixeira = lista.filter(d => d.lixeira !== 'Sim');
  console.log(`Depois de filtrar lixeira: ${semLixeira.length}\n`);

  const comCCId = semLixeira.filter(d => d.id_centro_custos && String(d.id_centro_custos) !== '0' && String(d.id_centro_custos).trim() !== '');
  console.log(`Com id_centro_custos preenchido (não vazio, não "0"): ${comCCId.length} de ${semLixeira.length} (${((comCCId.length / semLixeira.length) * 100).toFixed(1)}%)\n`);

  console.log('Amostra de 5 despesas (campos relevantes):');
  semLixeira.slice(0, 5).forEach(d => {
    console.log(`  nome_conta="${d.nome_conta}" | id_centro_custos=${JSON.stringify(d.id_centro_custos)} | centro_custo=${JSON.stringify(d.centro_custo)} | centro_custos_pag=${JSON.stringify(d.centro_custos_pag)} | valor_pag=${d.valor_pag}`);
  });

  if (comCCId.length === 0) {
    console.log('\n→ Nenhuma despesa tem id_centro_custos preenchido. Diferente das receitas (que vêm ~97% preenchidas),');
    console.log('  no OPP as despesas parecem não ser lançadas com centro de custo/projeto — isso é um dado real do OPP,');
    console.log('  não um bug no código. Precisaríamos achar outro campo pra ligar despesa a projeto (ex: nome_fornecedor + OC).');
    process.exit(0);
  }

  // Cruza com os centros de custo confirmados nos Planejamentos
  const planejamentos = await db.readSheet('Planejamentos');
  const ccsConfirmados = new Set(
    planejamentos.filter(p => p.ID_Centro_Custo_OPP).map(p => String(p.ID_Centro_Custo_OPP))
  );
  console.log(`\nPlanejamentos com ID_Centro_Custo_OPP confirmado: ${ccsConfirmados.size}`);

  const despesasQueBatem = comCCId.filter(d => ccsConfirmados.has(String(d.id_centro_custos)));
  console.log(`Despesas cujo id_centro_custos bate com algum projeto confirmado: ${despesasQueBatem.length} de ${comCCId.length}`);

  if (despesasQueBatem.length > 0) {
    const totalBatendo = despesasQueBatem.reduce((s, d) => s + parseFloat(d.valor_pag || 0), 0);
    console.log(`Valor total dessas despesas: R$ ${totalBatendo.toFixed(2)}`);
    console.log('\n→ Tem despesa batendo! Se a tela ainda mostra R$ 0,00, o bug está em outro lugar (categoria/filtro na tela).');
  } else {
    console.log('\n→ Nenhuma despesa bate com os centros de custo já confirmados. Pode ser que os projetos com despesa real');
    console.log('  ainda não tenham o Centro de Custo confirmado no Planejamento, ou que IDs estejam em formatos diferentes.');
  }

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
