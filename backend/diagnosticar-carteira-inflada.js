// node backend/diagnosticar-carteira-inflada.js
//
// Só lê (não grava nada). O chef reparou que a tela "Dashboard" (normal)
// mostra Carteira Aprovada R$ 608,2 mi, bem diferente da "Dashboard
// Financeiro" (R$ 12.446.842) — mesmos 61 planejamentos aprovados.
//
// Hipótese: a tela "Dashboard" busca os planejamentos via GET /api/planejamento
// (não direto da tabela, como o dashboard-financeiro.js faz). Essa rota
// (planejamento.js, GET '/') faz: parseBR(p.Valor_Contrato) → valorContrato
// (um NÚMERO) → depois devolve `Valor_Contrato: String(valorFinal)` (o
// MESMO número, mas agora em formato americano "81486.55" em vez do BR
// original "81.486,55"). O frontend então aplica parseBR() DE NOVO nesse
// valor já processado — e parseBR() trata "." como separador de milhar,
// então "81486.55" vira "8148655" (ponto some, tudo vira inteiro = valor
// original × 100). Projetos com Valor_Contrato "redondo" (sem centavos)
// não sofrem esse problema (ex.: "4737088" sem ponto nenhum não muda ao
// re-parsear) — por isso o fator de inflação do total não é um 100x limpo,
// só os valores COM centavos inflam.
//
// Esse script reproduz os dois caminhos e compara.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const parseBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0;

async function main() {
  const db = require('./src/services/postgresService');
  const [planejamentos, projetos, terceirizados, ocs] = await Promise.all([
    db.readSheet('Planejamentos'),
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Terceirizados'),
    db.readSheet('OrdensCompra_OPP'),
  ]);

  const aprovados = planejamentos.filter((p) => p.Status === 'Aprovado');
  console.log(`Planejamentos Aprovados: ${aprovados.length}\n`);

  // Caminho 1: igual dashboard-financeiro.js — direto da tabela, sem passar
  // por /api/planejamento
  const totalDireto = aprovados.reduce((s, p) => s + parseBR(p.Valor_Contrato || 0), 0);
  console.log(`=== Caminho 1 (direto da tabela, como dashboard-financeiro.js) ===`);
  console.log(`Total: R$ ${totalDireto.toFixed(2)}\n`);

  // Caminho 2: replica EXATAMENTE a lógica de planejamento.js GET '/'
  const projMap = Object.fromEntries(projetos.map((p) => [p.ID_Projeto, p]));
  const ocValorMap = {};
  for (const oc of ocs) {
    if ((oc.Situacao || '').toLowerCase() !== 'cancelado') {
      ocValorMap[String(oc.ID_OC)] = parseBR(oc.Valor_Total || 0);
    }
  }
  const valorOCPorProjeto = {};
  for (const t of terceirizados) {
    if (!t.ID_Projeto || !t.OC) continue;
    const val = ocValorMap[String(t.OC)];
    if (val > 0) valorOCPorProjeto[t.ID_Projeto] = (valorOCPorProjeto[t.ID_Projeto] || 0) + val;
  }
  const enriched = planejamentos.map((p) => {
    const proj = projMap[p.ID_Projeto] || {};
    const valorContrato = parseBR(p.Valor_Contrato || 0);
    const valorGlobal = parseBR(proj.Valor_Global || 0);
    const valorOC = valorOCPorProjeto[p.ID_Projeto] || 0;
    const valorFinal = valorContrato > 0 ? valorContrato : valorGlobal > 0 ? valorGlobal : valorOC;
    return { ...p, Valor_Contrato: String(valorFinal) };
  });
  // Agora replica o que o FRONTEND (Dashboard.jsx) faz com o resultado dessa
  // rota: parseBR() DE NOVO em cima do Valor_Contrato já reprocessado.
  const enrichedAprovados = enriched.filter((p) => p.Status === 'Aprovado');
  const totalViaAPI = enrichedAprovados.reduce((s, p) => s + parseBR(p.Valor_Contrato || 0), 0);
  console.log(`=== Caminho 2 (via /api/planejamento + re-parse do front, como Dashboard.jsx) ===`);
  console.log(`Total: R$ ${totalViaAPI.toFixed(2)}\n`);

  console.log(`Diferença: R$ ${(totalViaAPI - totalDireto).toFixed(2)} (fator: ${(totalViaAPI / totalDireto).toFixed(2)}x)\n`);

  console.log('=== Projetos onde o valor muda entre os dois caminhos (inflados) ===\n');
  aprovados.forEach((p) => {
    const direto = parseBR(p.Valor_Contrato || 0);
    const viaAPI = parseBR(String(direto)); // simula o round-trip
    if (Math.abs(viaAPI - direto) > 0.5) {
      console.log(`  ${p.ID_Projeto} | Valor_Contrato original="${p.Valor_Contrato}" | direto=${direto.toFixed(2)} | depois do round-trip=${viaAPI.toFixed(2)}`);
    }
  });

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
