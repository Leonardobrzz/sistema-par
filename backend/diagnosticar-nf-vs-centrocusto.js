// node backend/diagnosticar-nf-vs-centrocusto.js
//
// Só lê (não grava nada). Confirma a hipótese: contas a receber do OPP sem
// centro de custo (a maioria) ainda têm a O.S. de origem citada no campo
// "observacoes_rec" (ex.: "Ref. a ordem de serviço nº 1777, PREFEITURA..."),
// e essa O.S. já está vinculada a um projeto específico pela lógica de
// casamento por VALOR que o medicoes.js já usa (sem depender de centro de
// custo). Se isso bater, dá pra calcular o "Recebido" por projeto usando o
// mesmo motor confiável da tela de Medições, em vez do centro de custo (que
// falha pra ~98% do valor liquidado).
//
// Testa com as 3 contas da FORTIM já vistas (NF 2817/2818/2819, O.S.
// 1775/1776/1777) e também faz uma varredura geral: de TODAS as contas a
// receber liquidadas sem centro de custo, quantas têm "ordem de serviço nº"
// na observação, e dessas O.S. quantas batem uma O.S. real que já está presa
// a algum projeto aprovado (pelo casamento por valor do medicoes.js).

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const pBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0;

async function main() {
  const { oppRequest } = require('./src/services/oppService');
  const db = require('./src/services/postgresService');

  console.log('=== Carregando dados ===\n');
  const [planejamentos, ordensServico] = await Promise.all([
    db.readSheet('Planejamentos'),
    db.readSheet('OrdensServico_OPP'), // mesma tabela que medicoes.js usa pras O.S. já sincronizadas
  ]);
  const aprovados = planejamentos.filter((p) => p.Status === 'Aprovado');
  console.log(`Planejamentos aprovados: ${aprovados.length}`);
  console.log(`O.S. sincronizadas na tabela local: ${ordensServico.length}`);

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
  const semCC = liquidadas.filter((r) => !r.id_centro_custos || r.id_centro_custos === 0);
  console.log(`Liquidadas: ${liquidadas.length} | sem centro de custo: ${semCC.length}\n`);

  // Mapa O.S. (id_pedido ou similar) -> registro, pra achar pelo número citado na observação
  const osPorNumero = {};
  ordensServico.forEach((o) => {
    const num = String(o.ID_OS_OPP || o.id_pedido || '').trim();
    if (num) osPorNumero[num] = o;
  });

  const reOS = /ordem de servi[çc]o\s*n[ºo°]?\.?\s*(\d+)/i;

  let comReferenciaOS = 0, osEncontradaNaTabela = 0, osComProjeto = 0;
  const exemplos = [];
  semCC.forEach((r) => {
    const m = (r.observacoes_rec || '').match(reOS);
    if (!m) return;
    comReferenciaOS++;
    const numOS = m[1];
    const os = osPorNumero[numOS];
    if (!os) return;
    osEncontradaNaTabela++;
    if (exemplos.length < 10) {
      exemplos.push({ nf: r.n_documento_rec, valor: r.valor_rec, numOS, osValorTotal: os.Valor_Total, osIdProjetoDireto: os.ID_Projeto || '(sem campo direto)' });
    }
  });

  console.log(`Contas sem centro de custo cuja observação cita "ordem de serviço nº X": ${comReferenciaOS} de ${semCC.length}`);
  console.log(`Dessas, quantas O.S. existem na tabela local OrdensServico_OPP: ${osEncontradaNaTabela}\n`);

  console.log('=== Amostra (até 10) ===\n');
  exemplos.forEach((e) => {
    console.log(`  NF=${e.nf} valor_rec=${e.valor} → O.S. nº${e.numOS} | Valor_Total da O.S.=${e.osValorTotal} | campo ID_Projeto direto na O.S.: ${e.osIdProjetoDireto}`);
  });

  // Checa se a tabela OrdensServico_OPP tem ALGUM campo que já amarra direto
  // a um projeto (o que tornaria tudo isso muito mais simples)
  console.log('\n=== Campos de uma O.S. de amostra (pra ver se já existe vínculo direto a projeto) ===');
  if (ordensServico[0]) console.log(JSON.stringify(ordensServico[0], null, 2));

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
