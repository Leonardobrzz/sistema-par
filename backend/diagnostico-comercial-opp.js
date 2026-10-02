// node backend/diagnostico-comercial-opp.js
//
// Só lê (OPP + banco). Não grava nada em lugar nenhum.
//
// Investiga a tela "Comercial / OPP" (Clientes OPP + Demandas de
// Terceirização):
// (A) confirma se "Valor" na aba de Terceirizados está errado por não cruzar
//     com Ordens de Compra (igual ao bug já corrigido no Extrato por Projeto);
// (B) testa se o endpoint /clientes do OPP tem o mesmo problema de "lixeira"
//     que achamos nas despesas (retorna lixo quando não se passa lixeira=Nao);
// (C) mede se o casamento por NOME (texto) entre Financeiro_OPP e os clientes
//     está perdendo lançamentos que um casamento por ID resolveria;
// (D) procura "?" ou caracteres estranhos nos nomes dos clientes (sinal de
//     problema de acentuação/encoding na sincronização).

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

function norm(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  const opp = require('./src/services/oppService');
  const db = require('./src/services/postgresService');

  console.log('========================================================');
  console.log('PARTE A — Valor_Contratado em Terceirizados (bruto vs. via OC)');
  console.log('========================================================\n');

  const [tercs, ocs] = await Promise.all([
    db.readSheet('Terceirizados'),
    db.readSheet('OrdensCompra_OPP'),
  ]);

  const porOC = {};
  for (const oc of ocs) {
    const id = String(oc.ID_OC || '').trim();
    if (id) porOC[id] = parseFloat(oc.Valor_Total || 0) || 0;
  }

  let semValorBruto = 0, teriaValorViaOC = 0, totalComOC = 0, somaBruto = 0, somaViaOC = 0;
  for (const t of tercs) {
    const bruto = parseFloat(t.Valor_Contratado || 0) || 0;
    somaBruto += bruto;
    if (bruto === 0) semValorBruto++;
    if (t.OC) {
      totalComOC++;
      const viaOC = porOC[String(t.OC).trim()] || 0;
      somaViaOC += (viaOC || bruto);
      if (bruto === 0 && viaOC > 0) teriaValorViaOC++;
    } else {
      somaViaOC += bruto;
    }
  }

  console.log(`Total de registros em Terceirizados: ${tercs.length}`);
  console.log(`  Com Valor_Contratado = 0 no campo bruto: ${semValorBruto}`);
  console.log(`  Têm número de OC preenchido: ${totalComOC}`);
  console.log(`  Desses, o valor bruto está zerado MAS a OC teria um valor real: ${teriaValorViaOC}`);
  console.log(`  Soma de Valor_Contratado bruto (o que a tela mostra hoje): R$ ${somaBruto.toFixed(2)}`);
  console.log(`  Soma correta cruzando com OrdensCompra_OPP: R$ ${somaViaOC.toFixed(2)}`);
  console.log(`  Diferença: R$ ${(somaViaOC - somaBruto).toFixed(2)}\n`);

  console.log('========================================================');
  console.log('PARTE B — /clientes do OPP: existe o mesmo problema de lixeira?');
  console.log('========================================================\n');

  try {
    const semFiltro = await opp.oppRequest('GET', '/clientes?limit=10&offset=0');
    const listaSemFiltro = Array.isArray(semFiltro) ? semFiltro : (semFiltro?.data || []);
    console.log('Sem passar lixeira (comportamento atual do sistema):');
    console.log(`  Campos do primeiro registro: ${listaSemFiltro[0] ? Object.keys(listaSemFiltro[0]).join(', ') : '(vazio)'}`);
    if (listaSemFiltro[0] && 'lixeira' in listaSemFiltro[0]) {
      const comLixeiraSim = listaSemFiltro.filter(c => c.lixeira === 'Sim').length;
      console.log(`  De ${listaSemFiltro.length} amostrados, ${comLixeiraSim} têm lixeira = "Sim"`);
    } else {
      console.log('  Esse endpoint não tem campo "lixeira" — provavelmente não sofre desse bug.');
    }

    const comFiltro = await opp.oppRequest('GET', '/clientes?limit=10&offset=0&lixeira=Nao');
    const listaComFiltro = Array.isArray(comFiltro) ? comFiltro : (comFiltro?.data || []);
    console.log(`\nCom lixeira=Nao explícito: ${listaComFiltro.length} registros amostrados`);
    console.log(`Primeiro registro bruto (pra achar o nome certo do campo de ID):`);
    console.log(JSON.stringify(listaSemFiltro[0] || listaComFiltro[0] || {}, null, 2).slice(0, 1500));
  } catch (e) {
    console.log(`  Erro testando /clientes: ${e.message}`);
  }

  console.log('\n========================================================');
  console.log('PARTE C — Casamento por nome (texto) está perdendo dados?');
  console.log('========================================================\n');

  const todosClientes = await opp.listarClientes({});
  console.log(`Total de clientes retornados pelo /clientes (sem filtro de lixeira): ${todosClientes.length}`);

  let finRows = [];
  try { finRows = await db.readSheet('Financeiro_OPP'); } catch { finRows = []; }
  console.log(`Total de linhas em Financeiro_OPP (cache local, últimos 12 meses): ${finRows.length}`);

  if (finRows.length > 0 && todosClientes.length > 0) {
    const idField = Object.keys(todosClientes[0]).find(k => /^id.*client/i.test(k)) || 'id_cliente';
    console.log(`Campo de ID do cliente detectado em /clientes: "${idField}"`);

    // Amostra: pega até 15 clientes que têm pelo menos 1 lançamento pelo ID, e compara com o que o
    // casamento por nome (como a tela faz hoje) encontraria.
    const porIdCliente = {};
    for (const r of finRows) {
      const id = String(r.ID_Cliente_OPP || '');
      if (!id || id === '0') continue;
      (porIdCliente[id] = porIdCliente[id] || []).push(r);
    }
    console.log(`Linhas de Financeiro_OPP com ID_Cliente_OPP preenchido: ${Object.values(porIdCliente).flat().length} de ${finRows.length}\n`);

    let divergencias = 0, amostrasMostradas = 0;
    for (const c of todosClientes) {
      const id = String(c[idField] || '');
      const porId = porIdCliente[id] || [];
      if (porId.length === 0) continue; // só olha clientes que têm histórico real pelo ID

      const nomeClienteNorm = (c.razao_cliente || c.fantasia_cliente || '').toLowerCase().trim();
      const porNome = finRows.filter(r => (r.Nome_Cliente || '').toLowerCase().includes(nomeClienteNorm));

      if (porId.length !== porNome.length) {
        divergencias++;
        if (amostrasMostradas < 12) {
          amostrasMostradas++;
          console.log(`  "${c.razao_cliente}" (id_cliente=${id})`);
          console.log(`     lançamentos achados por ID: ${porId.length} | por nome (como a tela faz hoje): ${porNome.length}`);
        }
      }
    }
    console.log(`\nTotal de clientes com histórico real onde o casamento por nome dá um número DIFERENTE do casamento por ID: ${divergencias}`);
  }

  console.log('\n========================================================');
  console.log('PARTE D — Nomes de cliente com "?" ou caractere estranho (sinal de encoding quebrado)');
  console.log('========================================================\n');

  const suspeitos = todosClientes.filter(c => /\?/.test(c.razao_cliente || '') || /\?/.test(c.fantasia_cliente || ''));
  console.log(`Clientes com "?" no nome: ${suspeitos.length} de ${todosClientes.length}`);
  suspeitos.slice(0, 15).forEach(c => console.log(`  "${c.razao_cliente}" | fantasia: "${c.fantasia_cliente || ''}"`));

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
