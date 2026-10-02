// node backend/diagnosticar-vencimento-nf.js
//
// Só lê (não grava nada). Na tela de Medições, a maioria das linhas com Nº NF
// (ex.: "503", "428", "524", "361", "511") ficou sem Vencimento, enquanto só
// as que mostram NF em formato composto (ex.: "90 - 1", "1 - 1", "113 - 1")
// mostraram a data certinho. Suspeita: o OPP guarda o "n_documento_rec" no
// formato composto "NÚMERO - PARCELA" (ex.: "90 - 1"), mas o número que a
// gente extrai da O.S. pelo texto da Referência (ex.: "NF_Nº 503" → "503")
// é só a parte da frente, sem o "- N" — então a busca por "503" nunca acha o
// registro que está gravado como "503 - 1" (ou parecido), e o Vencimento
// fica em branco.
//
// Esse script confere, pra uma lista de NFs "bare" (sem sufixo) que
// apareceram na tela, se existe alguma Conta a Receber cujo n_documento_rec
// comece com esse número + " - " — e quantas (pra saber se dá pra confiar
// sem ambiguidade, ou se tem mais de uma parcela com o mesmo número base).

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const NFS_BARE = ['503', '428', '524', '361', '511', '154', '162', '93', '91', '95', '39', '38', '40', '117', '145', '161', '144'];

async function main() {
  const { listarReceitas } = require('./src/services/oppService');
  const agora = new Date();
  const inicio = new Date(agora);
  inicio.setMonth(inicio.getMonth() - 12);
  const fmt = (d) => d.toISOString().split('T')[0];

  const r = await listarReceitas({ data_inicio: fmt(inicio), data_fim: fmt(agora) });
  const lista = Array.isArray(r) ? r : (r?.data || []);
  console.log(`Total de contas a receber carregadas (12 meses): ${lista.length}\n`);

  for (const nfBare of NFS_BARE) {
    // bate exato
    const exatos = lista.filter((x) => String(x.n_documento_rec || '').trim() === nfBare);
    // bate como "NÚMERO - algumacoisa" (base = nfBare)
    const compostos = lista.filter((x) => {
      const doc = String(x.n_documento_rec || '').trim();
      const base = doc.split(/\s*-\s*/)[0].trim();
      return base === nfBare && doc !== nfBare;
    });
    console.log(`NF "${nfBare}": ${exatos.length} com match EXATO, ${compostos.length} com match por BASE (composto)`);
    exatos.forEach((x) => console.log(`   exato → n_documento_rec="${x.n_documento_rec}" vencimento=${x.vencimento_rec} id_conta_rec=${x.id_conta_rec} cliente=${x.nome_cliente}`));
    compostos.forEach((x) => console.log(`   composto → n_documento_rec="${x.n_documento_rec}" vencimento=${x.vencimento_rec} id_conta_rec=${x.id_conta_rec} cliente=${x.nome_cliente}`));
    if (!exatos.length && !compostos.length) console.log('   (nada encontrado — pode ser NF ainda não lançada no Contas a Receber, ou fora da janela de 12 meses)');
    console.log('');
  }

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
