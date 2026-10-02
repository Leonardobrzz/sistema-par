// node backend/investigar-os-arq2025-4.js
//
// Só lê (não grava nada). Confere pela API do OPP, ao vivo, o que são as
// O.S. 49, 50 e 65 que aparecem vinculadas ao projeto
// "ARQ-2025-4-URBANIZAÇÃO..." (Solonópole) na tela de Medições.
//
// Já vi no código do medicoes.js (linha 331) que esse campo
// "Nr_OS_OPP" é do PLANEJAMENTO inteiro, não da etapa — ou seja, o
// mesmo "49,50,65" deveria aparecer em QUALQUER etapa desse projeto que
// ainda esteja como "do planejamento" (prévia, sem medição real casada
// ainda). Esse script confirma isso e busca os dados reais das 3 O.S.
// no OPP pra ver se fazem sentido com o contrato.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

function norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

async function main() {
  const db = require('./src/services/postgresService');

  const [projetos, planejamentos] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
  ]);

  const proj = projetos.find((p) => norm(p.Nome || '').includes('ARQ-2025-4') && norm(p.Nome || '').includes('URBANIZA'));
  if (!proj) {
    console.log('Não achei o projeto — confere o nome exato entre os candidatos abaixo:');
    console.log(projetos.filter((p) => norm(p.Nome || '').includes('ARQ-2025-4')).map((p) => p.Nome));
    process.exit(1);
  }

  console.log(`### PROJETO: "${proj.Nome}" (${proj.ID_Projeto}) ###`);
  console.log(`Cliente (Par): ${proj.Cliente} | ID_OPP_Cliente: ${proj.ID_OPP_Cliente || '(vazio)'}\n`);

  const plans = planejamentos.filter((pl) => pl.ID_Projeto === proj.ID_Projeto);
  for (const pl of plans) {
    console.log(`--- Planejamento ${pl.ID} | Status: ${pl.Status} | Nr_OS_OPP (campo do PLANEJAMENTO INTEIRO): "${pl.Nr_OS_OPP || '(vazio)'}" ---`);
    let dados = {};
    try { dados = JSON.parse(pl.Dados_JSON || '{}'); } catch {}
    const d = dados._baseline || dados;
    const meds = d.medicoesCronograma || dados.medicoes || [];
    console.log(`Cronograma (${meds.length} etapa(s)) — todas vão mostrar o MESMO Nr_OS_OPP acima na tela, enquanto não tiverem medição real casada:`);
    meds.forEach((m, idx) => {
      console.log(`  [${idx}] "${m.etapa || m.descricao}" — R$ ${m.valor || m.valorPlanejado}`);
    });
    console.log('');
  }

  console.log('### O que são as O.S. 49, 50 e 65 (lendo da tabela OrdensServico_OPP, já sincronizada e conferida com o OPP) ###\n');
  const tabelaOS = await db.readSheet('OrdensServico_OPP');
  const porId = new Map(tabelaOS.map((r) => [String(r.ID_OS_OPP), r]));
  for (const osNum of ['49', '50', '65']) {
    const os = porId.get(osNum);
    if (!os) { console.log(`O.S. ${osNum}: não encontrada na tabela sincronizada.\n`); continue; }
    console.log(`O.S. ${osNum}:`);
    console.log(`  Cliente (ID_Cliente_OPP ${os.ID_Cliente_OPP}): ${os.Nome_Cliente || '(?)'}`);
    console.log(`  Valor total: R$ ${os.Valor_Total || '(?)'}`);
    console.log(`  Situação: ${os.Status || '(?)'}`);
    console.log(`  Data do pedido: ${os.Data_Pedido || '(?)'}  |  Entrega: ${os.Data_Entrega || '(?)'}  |  Realização: ${os.Data_Realizacao || '(?)'}`);
    console.log(`  Referência: ${os.Referencia || '(vazio)'}`);
    console.log(`  Problema/Serviço (texto livre): ${os.Problema || '(vazio)'}`);
    console.log(`  Observação: ${os.Observacao || '(vazio)'}\n`);
  }

  // Confere se esse mesmo "49,50,65" (ou pedaços dele) aparece no Nr_OS_OPP
  // de algum OUTRO planejamento — pra saber se foi vinculado só aqui ou se
  // teve copy-paste.
  console.log('### Esse Nr_OS_OPP aparece em outro projeto também? ###');
  const alvo = (plans[0]?.Nr_OS_OPP || '').trim();
  if (alvo) {
    const outros = planejamentos.filter((pl) => pl.ID_Projeto !== proj.ID_Projeto && (pl.Nr_OS_OPP || '').trim() === alvo);
    if (outros.length === 0) {
      console.log('Não — esse conjunto de O.S. está vinculado só a este projeto.');
    } else {
      for (const o of outros) {
        const p2 = projetos.find((p) => p.ID_Projeto === o.ID_Projeto);
        console.log(`  ⚠️  Mesmo Nr_OS_OPP também está no planejamento do projeto "${p2 ? p2.Nome : '(?)'}" (Planejamento ${o.ID})`);
      }
    }
  }

  console.log('\nFim.');
  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
