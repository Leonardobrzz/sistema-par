// node backend/verificar-relatorios-opp.js
//
// Só lê (não grava nada). Confere se a tabela OrdensServico_OPP (a cópia
// sincronizada do OPP que a tela de Medições & Faturamento usa pra casar
// com os valores planejados) está batendo com o Relatório de Ordem de
// Serviço que o chef tirou direto do OPP hoje (02/10/2026).
//
// Se aparecer "faltando" ou "valor divergente" aqui, quer dizer que a
// sincronização da tabela OrdensServico_OPP está desatualizada — precisa
// rodar de novo o script que sincroniza essa tabela a partir da API do
// OPP (não é um problema de lógica de casamento, é só a cópia local que
// ficou pra trás).
//
// Também mostra um resumo do Relatório de Contas a Receber (não tem
// tabela própria pra comparar porque o PAR consulta isso direto na API
// do OPP toda vez que precisa — não guarda cópia local — então não tem
// como "dessincronizar"; o resumo aqui é só pra conferência visual).

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const refOS = require('./ref-os-opp.json');
const refReceber = require('./ref-contas-receber.json');

// mesmo parser "esperto" usado em medicoes.js — distingue formato BR
// (vírgula decimal), formato já com ponto decimal (2 casas) e formato
// com ponto de milhar.
const pBR = (v) => {
  // tira "R$" de qualquer lugar da string (os relatórios em PDF às vezes
  // jogam o "R$" pro fim da célula quando o texto da coluna anterior é
  // mais longo) antes de aplicar a lógica de parsing esperta.
  const s = String(v || 0).trim().replace(/R\$\s*/g, '').trim();
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  const partes = s.split('.');
  if (partes.length === 2 && partes[1].length <= 2) return parseFloat(s) || 0;
  return parseFloat(s.replace(/\./g, '')) || 0;
};

async function main() {
  const db = require('./src/services/postgresService');
  const tabelaOS = await db.readSheet('OrdensServico_OPP');

  console.log(`Relatório do OPP (PDF de hoje): ${refOS.length} O.S.`);
  console.log(`Tabela OrdensServico_OPP no Par: ${tabelaOS.length} O.S.\n`);

  const porId = new Map();
  for (const row of tabelaOS) porId.set(String(row.ID_OS_OPP), row);

  const faltando = [];
  const valorDivergente = [];
  const statusDivergente = [];
  let ok = 0;

  for (const ref of refOS) {
    const row = porId.get(String(ref.os));
    if (!row) { faltando.push(ref); continue; }
    const valorRef = pBR(ref.valor);
    const valorPar = pBR(row.Valor_Total);
    const diff = Math.abs(valorRef - valorPar);
    if (diff > 0.5) {
      valorDivergente.push({ os: ref.os, cliente: ref.cliente, valorRelatorio: valorRef, valorPar });
      continue;
    }
    // situação: só avisa, não conta como erro grave (nomenclatura pode variar um pouco)
    const statusRefNorm = (ref.situacao || '').toLowerCase();
    const statusParNorm = (row.Status || '').toLowerCase();
    if (statusRefNorm && statusParNorm && !statusParNorm.includes(statusRefNorm.slice(0, 5))) {
      statusDivergente.push({ os: ref.os, cliente: ref.cliente, situacaoRelatorio: ref.situacao, statusPar: row.Status });
    }
    ok++;
  }

  console.log(`✅ Batendo certinho (número + valor): ${ok}`);
  console.log(`⚠️  Faltando na tabela do Par (sync desatualizada): ${faltando.length}`);
  for (const f of faltando.slice(0, 30)) {
    console.log(`   O.S. ${f.os} — ${f.cliente} — R$ ${f.valor} — ${f.situacao}`);
  }
  if (faltando.length > 30) console.log(`   ... e mais ${faltando.length - 30}`);

  console.log(`\n⚠️  Valor divergente (mesma O.S., valor diferente): ${valorDivergente.length}`);
  for (const d of valorDivergente) {
    console.log(`   O.S. ${d.os} — ${d.cliente} — relatório: R$ ${d.valorRelatorio.toFixed(2)} | Par: R$ ${d.valorPar.toFixed(2)}`);
  }

  console.log(`\nℹ️  Situação com nome diferente (não é erro, só aviso): ${statusDivergente.length}`);
  for (const d of statusDivergente.slice(0, 15)) {
    console.log(`   O.S. ${d.os} — relatório: "${d.situacaoRelatorio}" | Par: "${d.statusPar}"`);
  }

  // resumo de contas a receber (sem tabela própria pra comparar — só informativo)
  const pbrSum = (arr, campo) => arr.reduce((s, r) => s + pBR(r[campo]), 0);
  const totalOriginal = pbrSum(refReceber, 'valor_original');
  const totalBaixado = pbrSum(refReceber, 'valor_baixado');
  console.log(`\n=== Contas a Receber (relatório de hoje, só informativo — não tem cópia local no Par pra comparar) ===`);
  console.log(`Total original: R$ ${totalOriginal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`Total já recebido (baixado): R$ ${totalBaixado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`Saldo a receber: R$ ${(totalOriginal - totalBaixado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
