// node backend/diagnosticar-recebido-projeto.js
//
// Só lê (não grava nada). Depois de trocar a coluna "Recebido" da tabela
// Rentabilidade por Projeto pra usar recebidoOPPPorProjeto (o mesmo cálculo
// do card "Total Recebido" do topo), muitos projetos continuaram em R$ 0.
// Isso pode ser porque o projeto realmente não recebeu nada ainda (correto)
// OU porque o vínculo projeto↔receita do OPP está falhando pra esse projeto
// (ID_Centro_Custo_OPP vazio e/ou casamento por texto não bate com nenhuma
// conta a receber). Esse script replica exatamente a lógica do
// dashboard-financeiro.js e reporta, pra cada projeto Aprovado:
//   - se tem ID_Centro_Custo_OPP preenchido
//   - se tem Nr_Contrato_OS preenchido (usado como reserva pro casamento)
//   - quanto ficou "recebido" por esse cálculo
// E no fim soma TODO o valor liquidado no OPP (universo inteiro, sem filtro
// de projeto) pra comparar com a soma do que ficou de fato vinculado a algum
// projeto — a diferença é dinheiro que o OPP já registrou como recebido mas
// que o Par não consegue amarrar a nenhum projeto específico.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const pBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0;

async function main() {
  const { oppRequest } = require('./src/services/oppService');
  const db = require('./src/services/postgresService');

  console.log('=== Carregando Planejamentos e Contas a Receber (liquidado) ===\n');
  const [planejamentos] = await Promise.all([db.readSheet('Planejamentos')]);
  const aprovados = planejamentos.filter((p) => p.Status === 'Aprovado');
  console.log(`Planejamentos Aprovados: ${aprovados.length}`);

  let offset = 0, oppReceitas = [];
  while (true) {
    const r = await oppRequest('GET', `/contas-receber?limit=250&offset=${offset}`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    oppReceitas.push(...lista);
    if (lista.length < 250) break;
    offset += 250;
    if (offset > 10000) break;
  }
  const liquidadas = oppReceitas.filter((r) => r.liquidado_rec === 'Sim');
  console.log(`Total de contas a receber carregadas: ${oppReceitas.length} (liquidadas: ${liquidadas.length})\n`);

  // Replica exatamente a lógica de dashboard-financeiro.js
  const infoPorCCId = {};
  aprovados.forEach((p) => {
    if (p.ID_Centro_Custo_OPP) infoPorCCId[String(p.ID_Centro_Custo_OPP)] = { setor: p.Setor || 'Outros', idProjeto: p.ID_Projeto };
  });
  const infoPorCC = {};
  aprovados.forEach((p) => {
    if (!p.ID_Centro_Custo_OPP && p.Nr_Contrato_OS) infoPorCC[p.Nr_Contrato_OS.toLowerCase().trim()] = { setor: p.Setor || 'Outros', idProjeto: p.ID_Projeto };
  });
  function infoProjetoDeReceita(rec) {
    const ccIdNum = String(rec.id_centro_custos || '');
    if (ccIdNum && ccIdNum !== '0' && infoPorCCId[ccIdNum]) return infoPorCCId[ccIdNum];
    const cc = (rec.centro_custos_rec || rec.centro_custo || '').toLowerCase().trim();
    if (!cc) return null;
    if (infoPorCC[cc]) return infoPorCC[cc];
    for (const [k, v] of Object.entries(infoPorCC)) {
      if (cc.includes(k) || k.includes(cc)) return v;
    }
    return null;
  }

  const recebidoOPPPorProjeto = {};
  let totalLiquidadoUniverso = 0;
  let totalLiquidadoVinculado = 0;
  const naoVinculadas = [];
  liquidadas.forEach((r) => {
    const v = parseFloat(r.valor_rec || 0);
    totalLiquidadoUniverso += v;
    const info = infoProjetoDeReceita(r);
    if (!info) { naoVinculadas.push(r); return; }
    totalLiquidadoVinculado += v;
    recebidoOPPPorProjeto[info.idProjeto] = (recebidoOPPPorProjeto[info.idProjeto] || 0) + v;
  });

  console.log('=== Totais gerais ===');
  console.log(`Total liquidado no OPP (universo inteiro): R$ ${totalLiquidadoUniverso.toFixed(2)}`);
  console.log(`Total liquidado VINCULADO a algum projeto: R$ ${totalLiquidadoVinculado.toFixed(2)}`);
  console.log(`Total liquidado SEM vínculo (perdido): R$ ${(totalLiquidadoUniverso - totalLiquidadoVinculado).toFixed(2)} (${naoVinculadas.length} contas)\n`);

  console.log('=== Projetos Aprovados: situação do vínculo ===\n');
  let comCCId = 0, comNrContrato = 0, semNenhum = 0, comRecebido = 0, semRecebidoComVinculo = 0, semRecebidoSemVinculo = 0;
  aprovados.forEach((p) => {
    const temCCId = !!p.ID_Centro_Custo_OPP;
    const temNrContrato = !temCCId && !!p.Nr_Contrato_OS;
    const recebido = recebidoOPPPorProjeto[p.ID_Projeto] || 0;
    if (temCCId) comCCId++;
    else if (temNrContrato) comNrContrato++;
    else semNenhum++;
    if (recebido > 0) comRecebido++;
    else if (temCCId || temNrContrato) semRecebidoComVinculo++;
    else semRecebidoSemVinculo++;
  });
  console.log(`Com ID_Centro_Custo_OPP preenchido: ${comCCId}`);
  console.log(`Sem ID_Centro_Custo_OPP, mas com Nr_Contrato_OS (fallback texto): ${comNrContrato}`);
  console.log(`SEM NENHUM dos dois campos (impossível casar nada pra esse projeto): ${semNenhum}\n`);
  console.log(`Projetos com recebido > 0: ${comRecebido}`);
  console.log(`Projetos com recebido = 0 MAS que têm algum vínculo configurado (pode ser que realmente não recebeu nada ainda): ${semRecebidoComVinculo}`);
  console.log(`Projetos com recebido = 0 E SEM NENHUM vínculo configurado (nunca vai casar, falta cadastro): ${semRecebidoSemVinculo}\n`);

  console.log('=== Detalhe dos projetos SEM NENHUM vínculo (ID_Centro_Custo_OPP e Nr_Contrato_OS vazios) ===\n');
  aprovados
    .filter((p) => !p.ID_Centro_Custo_OPP && !p.Nr_Contrato_OS)
    .forEach((p) => console.log(`  ${p.ID_Projeto} | ${p.Nome_Projeto || ''} | Valor_Contrato=${p.Valor_Contrato}`));

  console.log('\n=== Amostra de contas a receber liquidadas SEM vínculo a nenhum projeto (até 15) ===\n');
  naoVinculadas.slice(0, 15).forEach((r) => {
    console.log(`  id_conta_rec=${r.id_conta_rec} | cliente="${r.nome_cliente}" | centro_custos_rec="${r.centro_custos_rec}" | id_centro_custos=${r.id_centro_custos} | valor_rec=${r.valor_rec}`);
  });

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
