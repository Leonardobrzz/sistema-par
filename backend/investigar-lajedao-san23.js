// node backend/investigar-lajedao-san23.js
//
// Só lê. Mostra tudo que existe hoje nos dois projetos (SAN-23 e SAN-30 -
// Lajedão III) antes de decidir como unificar — contrato, status, vínculo
// com OPP (cliente e centro de custo), e o cronograma/planejamento de cada
// um. Isso é preparação pra decidir qual vira o projeto definitivo e o que
// precisa ser carregado pro outro antes de arquivar.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

function mostrarProjeto(nomeContemLista, projetos, planejamentos) {
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  for (const nomeContem of nomeContemLista) {
    const candidatos = projetos.filter((p) => norm(p.Nome || '').includes(norm(nomeContem)));
    for (const proj of candidatos) {
      console.log(`\n### PROJETO: "${proj.Nome}" (${proj.ID_Projeto}) ###`);
      console.log(`  Status: ${proj.Status}`);
      console.log(`  Cliente: ${proj.Cliente}`);
      console.log(`  Valor_Contrato: ${proj.Valor_Contrato}`);
      console.log(`  ID_OPP_Cliente: ${proj.ID_OPP_Cliente || '(vazio)'}`);
      console.log(`  Setor: ${proj.Setor}`);
      const plans = planejamentos.filter((pl) => pl.ID_Projeto === proj.ID_Projeto);
      console.log(`  Planejamentos (${plans.length}):`);
      for (const pl of plans) {
        console.log(`    - ID ${pl.ID} | Status: ${pl.Status} | ID_Centro_Custo_OPP: ${pl.ID_Centro_Custo_OPP || '(vazio)'} | Nr_Contrato_OS: ${pl.Nr_Contrato_OS || '(vazio)'} | Nr_OS_OPP: ${pl.Nr_OS_OPP || '(vazio)'}`);
        let dados = {};
        try { dados = JSON.parse(pl.Dados_JSON || '{}'); } catch {}
        const d = dados._baseline || dados;
        const meds = d.medicoesCronograma || dados.medicoes || [];
        console.log(`      Cronograma (${meds.length} etapa(s)):`);
        for (const m of meds) {
          console.log(`        "${m.etapa || m.descricao}" — R$ ${m.valor || m.valorPlanejado} — prev: ${m.dataPrevisao || m.dataPrevista || '(sem data)'}`);
        }
      }
    }
  }
}

async function main() {
  const db = require('./src/services/postgresService');
  const [projetos, planejamentos, medicoes] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
    db.readSheet('Medicoes'),
  ]);

  mostrarProjeto(['SAN-23', 'SAN-30'], projetos, planejamentos);

  console.log('\n### Medições reais (tabela Medicoes) nesses projetos ###');
  const idsAlvo = projetos.filter((p) => /SAN-23|SAN-30/.test(p.Nome || '')).map((p) => p.ID_Projeto);
  const medsReais = medicoes.filter((m) => idsAlvo.includes(m.ID_Projeto));
  console.log(`${medsReais.length} medição(ões) real(is) cadastrada(s) nesses projetos.`);
  for (const m of medsReais) console.log(`  [${m.ID_Projeto}] ${m.Etapa} — R$ ${m.Valor_Medicao || m.Valor}`);

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
