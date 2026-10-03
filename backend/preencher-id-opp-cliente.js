// node backend/preencher-id-opp-cliente.js
//
// Preenche o ID_OPP_Cliente em Projetos_Contratos pros 24 projetos dos 6
// clientes confirmados pelo chef (ver conversa) — os outros 4 clientes
// (POLÍCIA FEDERAL, BEZERROS-PE, DISTRITO FEDERAL, CORES VALE) ficam de
// fora até o chef confirmar o nome certo no OPP.
//
// Esse script GRAVA no banco (Projetos_Contratos.ID_OPP_Cliente). Antes de
// cada gravação, confirma que o valor atual do campo é mesmo vazio (pra não
// sobrescrever nada por engano) e, no final, relê e mostra o resultado de
// cada linha.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const ATUALIZACOES = [
  // NOVA MAMORÉ-RO → Município de Nova Mamoré
  { id: '9793aaeb-647e-4292-b93c-391301e8c15e', nome: 'ARQ-2026-4- ESCOLA MUNICIPAL EDUARDO VALVERDE', idOppCliente: '40140806' },
  { id: 'b194267f-5e54-45d3-9db7-4566a3d64587', nome: 'ARQ-2026-2-ESCOLA MUNICIPAL ONORINA DE SOUZA', idOppCliente: '40140806' },
  { id: 'c486e5de-653b-4636-b28f-6ceb4afbd70e', nome: 'ARQ-2026-3-ESCOLA MUNICIPAL OZEIAS MARTINS DA SILVA', idOppCliente: '40140806' },
  { id: '84a3cf32-ac61-408c-8cfa-bdfd04733b48', nome: 'ARQ-2026-5-ESPAÇO ALTERNATIVO', idOppCliente: '40140806' },
  { id: '23d6b008-7074-47a6-bf55-9de62e03f726', nome: 'ARQ-2026-6-CLUBE DOS SERVIDORES PÚBLICOS', idOppCliente: '40140806' },

  // SESAB → Bahia Secretaria de Saúde do Estado
  { id: '3a1d9aaa-bd3c-4885-bfc5-d41473e690cd', nome: 'ARQ-2026-7-LACEN', idOppCliente: '40806559' },
  { id: 'f1620cbc-dd2c-483d-aad4-037fed7cafb1', nome: 'ARQ-2026-1-BRS IRECÊ', idOppCliente: '40806559' },
  { id: '5bce13a4-f412-421a-a7a3-bdcbd9e52641', nome: 'ARQ-2026-2-BRS PAULO AFONSO', idOppCliente: '40806559' },
  { id: 'bdff5416-512a-419f-a150-8e21d04fced8', nome: 'ARQ-2026-3-BRS SENHOR DO BONFIM', idOppCliente: '40806559' },
  { id: 'd6c0bc13-4646-4ff8-880e-371b143e5538', nome: 'ARQ-2025-2-HOSPITAL GERAL MANOEL VICTORINO', idOppCliente: '40806559' },
  { id: 'f0ddc49a-57a2-49eb-aee0-26a97c51c9ca', nome: 'ARQ-2026-5-NRS JUAZEIRO', idOppCliente: '40806559' },
  { id: 'a0434042-67f3-476f-95d1-da7d1adf6d20', nome: 'ARQ-2026-6-HOSPITAL ANA NERY', idOppCliente: '40806559' },
  { id: '05acb886-939d-4be9-a8f9-0b8975f398db', nome: 'ARQ-2025-1-HOSPITAL REGIONAL DE SANTO ANTÔNIO DE JESUS', idOppCliente: '40806559' },
  { id: 'b0a8822d-d83e-44e0-9a09-373168960d59', nome: 'ARQ-2025-3-HOSPITAL REGIONAL DE JUAZEIRO', idOppCliente: '40806559' },
  { id: '15b43383-5898-4119-aba6-baef5fa1798e', nome: 'ARQ-2026-4-NRS CENTRO NORTE JACOBINA', idOppCliente: '40806559' },

  // CORREIOS - PA → Empresa Brasileira de Correios e Telégrafos
  { id: 'f8612b21-8b8a-4a2e-8557-aeedfd6a2f8b', nome: 'ARQ-2026-2-AGÊNCIA DE CORREIOS DE MARABÁ', idOppCliente: '43270527' },
  { id: '54aed992-f713-4857-a2bc-d41ef2d3070c', nome: 'ARQ-2026-3-AGÊNCIA DE CORREIOS DE SALINÓPOLIS', idOppCliente: '43270527' },
  { id: '5dfe9b1e-a692-4527-b0ad-4d95110e1765', nome: 'ARQ-2026-4-AGÊNCIA DE CORREIOS DE SANTARÉM', idOppCliente: '43270527' },
  { id: '2fb6f1f8-2d43-4d27-9824-79396e546d83', nome: 'ARQ-2026-5-AGÊNCIA DE CORREIOS DE ANANINDEUA', idOppCliente: '43270527' },

  // CORREIOS - SE → mesma Empresa Brasileira de Correios e Telégrafos
  { id: 'ccaff644-eca2-4681-bf45-8dccc185d97c', nome: 'ARQ-2026-1-CENTRO DE ENTREGA DE ENCOMENDAS DE ARACAJU', idOppCliente: '43270527' },
  { id: 'f55262df-ca75-4168-b858-b3f43a25df78', nome: 'ARQ-2026-2-CENTRO DE TRATAMENTO DE CARTAS E ENCOMENDAS DE ARACAJU', idOppCliente: '43270527' },

  // DESENVOLVE-SE SERGIPE → Agência Sergipe de Desenvolvimento S.A
  { id: '92f2120c-e16c-4dd9-b07f-82afc5694767', nome: 'INF-2026-01 PAVIMENTAÇÃO E TERRAPLANAGEM - LOTE 05 - ORLA PONTA DOS MANGUES', idOppCliente: '42384408' },

  // ÁGUAS DO SERTÃO (os 2 contratos) → EMBASA, mesmo ID já usado em SAN-28-SAA URANDI
  { id: 'ca8b69e2-f809-4775-8a47-1994215e1bbb', nome: 'SAN-01 SAA AURORA', idOppCliente: '42104337' },
  { id: '3052db94-d761-4a14-84c2-6645d6f73967', nome: 'SAN-01 SAA UMARI', idOppCliente: '42104337' },
];

async function main() {
  const db = require('./src/services/postgresService');

  const projetos = await db.readSheet('Projetos_Contratos');
  const projMap = {};
  for (const p of projetos) projMap[p.ID_Projeto] = p;

  console.log(`Vou atualizar ${ATUALIZACOES.length} projetos.\n`);

  let ok = 0, jaTinha = 0, naoAchou = 0;
  for (const item of ATUALIZACOES) {
    const atual = projMap[item.id];
    if (!atual) {
      console.log(`[NÃO ACHEI] ${item.id} | ${item.nome} — ID_Projeto não existe em Projetos_Contratos. Pulei.`);
      naoAchou++;
      continue;
    }
    if (atual.ID_OPP_Cliente && String(atual.ID_OPP_Cliente).trim()) {
      console.log(`[JÁ TINHA] ${item.nome} — já tem ID_OPP_Cliente="${atual.ID_OPP_Cliente}", não sobrescrevi. Confere se é diferente do esperado (${item.idOppCliente}).`);
      jaTinha++;
      continue;
    }
    await db.updateRowById('Projetos_Contratos', 'ID_Projeto', item.id, { ID_OPP_Cliente: item.idOppCliente });
    console.log(`[OK] ${item.nome} → ID_OPP_Cliente=${item.idOppCliente}`);
    ok++;
  }

  console.log(`\nResumo: ${ok} atualizados | ${jaTinha} já tinham valor (não tocados) | ${naoAchou} não encontrados.\n`);

  // Relê pra confirmar
  console.log('=== Confirmação (relendo do banco) ===');
  const projetosDepois = await db.readSheet('Projetos_Contratos');
  const projMapDepois = {};
  for (const p of projetosDepois) projMapDepois[p.ID_Projeto] = p;
  for (const item of ATUALIZACOES) {
    const p = projMapDepois[item.id];
    console.log(`  ${item.nome} → ID_OPP_Cliente="${p ? p.ID_OPP_Cliente : '???'}"`);
  }

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
