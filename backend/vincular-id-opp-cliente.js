// Modo seguro por padrão:         node backend/vincular-id-opp-cliente.js
// Aplicar só os matches exatos:    node backend/vincular-id-opp-cliente.js --apply
// Aplicar exatos + prováveis:      node backend/vincular-id-opp-cliente.js --apply-provaveis
//
// Causa raiz encontrada: NENHUM dos 1140 projetos do Par tem
// Projetos_Contratos.ID_OPP_Cliente preenchido. Sem isso, não dá pra casar
// com confiança um projeto do Par com o cliente certo no OPP — e é por
// causa disso que a tela de Medições não consegue puxar as O.S. reais
// (cada medição já existe como O.S. própria no OPP, com valor e NF de
// verdade — ver backend/investigar-os-reais-opp.js), e é a mesma causa da
// fragilidade já conhecida na aba "Projetos PAR" do Comercial/OPP.
//
// O Par não guarda CNPJ nenhum (nem em Projetos_Contratos nem em tabela
// própria de clientes) — só o nome em texto livre (Cliente). Então o único
// jeito de casar é por nome. Pra não repetir o erro já visto antes neste
// projeto (match de texto genérico pegando o projeto errado), este script:
//
//   1. Normaliza os dois lados (maiúsculas, sem acento, sem pontuação).
//   2. PASSO 1 — "exato": nome normalizado do Par é IGUAL a um único
//      cliente do OPP (razão social OU nome fantasia). Esse é aplicado com
//      --apply.
//   3. PASSO 2 — "provável": o nome do Par aparece como PALAVRA INTEIRA
//      dentro do nome de um único cliente do OPP (ex.: "FORTIM" dentro de
//      "PREFEITURA MUNICIPAL DE FORTIM") — cobre o caso, muito comum aqui,
//      de o Par guardar só o nome curto do município/cliente e o OPP guardar
//      a razão social completa. Só aplicado com --apply-provaveis (e só
//      quando existe exatamente 1 candidato — se achar mais de um, vira
//      ambíguo e não aplica nada).
//   4. Quando bate em mais de um cliente do OPP (ambíguo) ou não bate em
//      nenhum, só LISTA pra revisão manual — nunca aplica um palpite.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const APLICAR_EXATOS = process.argv.includes('--apply') || process.argv.includes('--apply-provaveis');
const APLICAR_PROVAVEIS = process.argv.includes('--apply-provaveis');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Nomes de "cliente" no Par que na verdade são categorias/pastas internas,
// não clientes de verdade — confirmado olhando a rodada anterior:
// "Financeiro" e "Compras" bateram por acaso com uma palavra genérica dentro
// do nome de um cliente qualquer do OPP ("...DEPARTAMENTO FINANCEIRO",
// "BOLSA NACIONAL DE COMPRAS") que não tem nada a ver. Essas nunca entram
// no PASSO 2 — ficam sempre em "sem match" pra não gravar um vínculo errado.
const NOMES_GENERICOS_IGNORAR = new Set([
  'FINANCEIRO', 'COMPRAS', 'PAINEL DE PROJETOS', 'EXECUCAO DE PROJETOS',
  '0 PADRONIZACOES', 'ARQUITETURA', 'ADMINISTRATIVO', 'COMERCIAL', 'PROJETOS',
]);

function normalizar(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toUpperCase()
    .replace(/[.,\-\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const db = require('./src/services/postgresService');
  const { listarClientes } = require('./src/services/oppService');

  console.log('Buscando clientes do OPP (já com o filtro de lixeira corrigido)...\n');
  const clientesOPP = await listarClientes();
  console.log(`${clientesOPP.length} clientes reais no OPP.\n`);

  const projetos = await db.readSheet('Projetos_Contratos');

  // Agrupa projetos por nome de cliente (texto exato do Par) — pra resolver
  // uma vez por cliente, não um por um dos 1140 projetos.
  const projetosPorCliente = {};
  for (const p of projetos) {
    const nome = (p.Cliente || '').trim();
    if (!nome) continue;
    (projetosPorCliente[nome] = projetosPorCliente[nome] || []).push(p);
  }
  const clientesPar = Object.keys(projetosPorCliente);
  console.log(`${clientesPar.length} nomes de cliente distintos entre os ${projetos.length} projetos do Par.\n`);

  // Mapa normalizado -> lista de clientes OPP (pode ter mais de um com o mesmo nome)
  const porNomeNormalizadoOPP = {};
  for (const c of clientesOPP) {
    const chaves = new Set([normalizar(c.razao_cliente), normalizar(c.fantasia_cliente)].filter(Boolean));
    for (const chave of chaves) {
      (porNomeNormalizadoOPP[chave] = porNomeNormalizadoOPP[chave] || []).push(c);
    }
  }

  const exatos = [];      // match único e exato -> aplicável
  const ambiguos = [];     // bateu em mais de um cliente OPP
  const semMatch = [];     // não bateu em nenhum

  for (const nomeCliente of clientesPar) {
    const chave = normalizar(nomeCliente);
    const candidatos = porNomeNormalizadoOPP[chave] || [];
    const qtdProjetos = projetosPorCliente[nomeCliente].length;
    if (candidatos.length === 1) {
      exatos.push({ nomeCliente, qtdProjetos, opp: candidatos[0] });
    } else if (candidatos.length > 1) {
      ambiguos.push({ nomeCliente, qtdProjetos, candidatos });
    } else {
      semMatch.push({ nomeCliente, qtdProjetos });
    }
  }

  console.log(`\n=== Match EXATO e único (${exatos.length} clientes, ${exatos.reduce((s, e) => s + e.qtdProjetos, 0)} projetos) ===`);
  for (const e of exatos.slice(0, 15)) {
    console.log(`  "${e.nomeCliente}" (${e.qtdProjetos} projeto(s)) → OPP id_cliente ${e.opp.id_cliente} ("${e.opp.razao_cliente}")`);
  }
  if (exatos.length > 15) console.log(`  ... e mais ${exatos.length - 15}`);

  console.log(`\n=== AMBÍGUO — bateu em mais de 1 cliente do OPP, não será aplicado (${ambiguos.length}) ===`);
  for (const a of ambiguos) {
    console.log(`  "${a.nomeCliente}" (${a.qtdProjetos} projeto(s)) → candidatos: ${a.candidatos.map((c) => `id ${c.id_cliente} ("${c.razao_cliente}")`).join(' | ')}`);
  }

  // ── PASSO 2 — só roda em cima de quem ficou sem match exato ──────────
  const provaveis = [];
  const semMatchFinal = [];
  for (const s of semMatch) {
    const chave = normalizar(s.nomeCliente);
    if (chave.length < 4) { semMatchFinal.push(s); continue; } // nome curto demais, risco alto de falso positivo
    if (NOMES_GENERICOS_IGNORAR.has(chave)) { semMatchFinal.push(s); continue; } // categoria interna, não é cliente de verdade
    const re = new RegExp(`(^|\\s)${escapeRegex(chave)}(\\s|$)`);
    const candidatos = clientesOPP.filter((c) => re.test(normalizar(c.razao_cliente)) || re.test(normalizar(c.fantasia_cliente)));
    if (candidatos.length === 1) {
      provaveis.push({ nomeCliente: s.nomeCliente, qtdProjetos: s.qtdProjetos, opp: candidatos[0] });
    } else if (candidatos.length > 1) {
      ambiguos.push({ nomeCliente: s.nomeCliente, qtdProjetos: s.qtdProjetos, candidatos });
    } else {
      semMatchFinal.push(s);
    }
  }

  console.log(`\n=== PROVÁVEL — nome do Par aparece como palavra inteira em 1 único cliente do OPP (${provaveis.length} clientes, ${provaveis.reduce((s, e) => s + e.qtdProjetos, 0)} projetos) ===`);
  console.log('(revise esta lista — só é aplicada com --apply-provaveis)');
  for (const p of provaveis) {
    console.log(`  "${p.nomeCliente}" (${p.qtdProjetos} projeto(s)) → OPP id_cliente ${p.opp.id_cliente} ("${p.opp.razao_cliente}"${p.opp.fantasia_cliente ? ' / fantasia: ' + p.opp.fantasia_cliente : ''})`);
  }

  console.log(`\n=== AMBÍGUO — bateu em mais de 1 cliente do OPP, não será aplicado (${ambiguos.length}) ===`);
  for (const a of ambiguos) {
    console.log(`  "${a.nomeCliente}" (${a.qtdProjetos} projeto(s)) → candidatos: ${a.candidatos.map((c) => `id ${c.id_cliente} ("${c.razao_cliente}")`).join(' | ')}`);
  }

  console.log(`\n=== SEM MATCH — não achei nenhum cliente com esse nome no OPP (${semMatchFinal.length}, mostrando até 25) ===`);
  for (const s of semMatchFinal.slice(0, 25)) {
    console.log(`  "${s.nomeCliente}" (${s.qtdProjetos} projeto(s))`);
  }
  if (semMatchFinal.length > 25) console.log(`  ... e mais ${semMatchFinal.length - 25} (provavelmente cliente ainda não cadastrado no OPP, ou nome completamente diferente)`);

  if (!APLICAR_EXATOS) {
    console.log('\nModo de conferência — nada foi gravado.');
    console.log('  --apply             grava só os matches EXATOS');
    console.log('  --apply-provaveis   grava os EXATOS + os PROVÁVEIS (revise a lista de prováveis acima antes!)');
    return process.exit(0);
  }

  let totalProjetosAtualizados = 0;
  console.log('\nGravando ID_OPP_Cliente para os matches exatos...');
  for (const e of exatos) {
    for (const proj of projetosPorCliente[e.nomeCliente]) {
      await db.updateRowById('Projetos_Contratos', 'ID_Projeto', proj.ID_Projeto, { ...proj, ID_OPP_Cliente: String(e.opp.id_cliente) });
      totalProjetosAtualizados++;
    }
  }

  if (APLICAR_PROVAVEIS) {
    console.log('Gravando ID_OPP_Cliente para os matches prováveis...');
    for (const p of provaveis) {
      for (const proj of projetosPorCliente[p.nomeCliente]) {
        await db.updateRowById('Projetos_Contratos', 'ID_Projeto', proj.ID_Projeto, { ...proj, ID_OPP_Cliente: String(p.opp.id_cliente) });
        totalProjetosAtualizados++;
      }
    }
  }

  console.log(`\n✅ ${totalProjetosAtualizados} projeto(s) atualizado(s) com ID_OPP_Cliente.`);
  console.log(`   Exatos aplicados: ${exatos.length} cliente(s).`);
  console.log(`   Prováveis ${APLICAR_PROVAVEIS ? 'aplicados' : 'NÃO aplicados (rode com --apply-provaveis)'}: ${provaveis.length} cliente(s).`);
  console.log(`Ainda restam ${ambiguos.length} cliente(s) ambíguo(s) e ${semMatchFinal.length} sem match — precisam de revisão manual.`);

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
