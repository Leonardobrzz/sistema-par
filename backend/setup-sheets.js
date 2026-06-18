/**
 * Script de setup completo — cria todas as abas necessárias do Sistema PAR
 * Execute: node setup-sheets.js
 */

require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const KEY_FILE = path.resolve(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);

const REQUIRED_SHEETS = [
  { name: 'Usuarios', headers: ['ID', 'Nome', 'Email', 'Senha_Hash', 'Perfil', 'Empresa', 'Ativo', 'Criado_Em', 'Ultimo_Login'] },
  { name: 'Projetos_Contratos', headers: ['ID_Projeto', 'Nome', 'Cliente', 'Valor_Global', 'Teto_Terc_Perc', 'Teto_Terc_Valor', 'ID_ClickUp', 'Centro_Custo_OPP', 'Status', 'Data_Inicio', 'Data_Entrega_Contrato', 'Data_Entrega_Planejada', 'Empresa', 'Setor', 'Tipologia', 'Link_ClickUp', 'Criado_Em', 'Atualizado_Em'] },
  { name: 'Planejamentos', headers: ['ID', 'ID_Projeto', 'Nome_Projeto', 'Cliente', 'Nr_Contrato_OS', 'Resp_Planejamento', 'Resp_Aprovacao', 'Setor', 'Tipologia', 'Empresa', 'Link_ClickUp', 'Valor_Contrato', 'Impostos_Perc', 'Taxa_Adm_Perc', 'Comissao_Perc', 'Data_Inicio_OS', 'Data_Entrega_Contrato', 'Data_Entrega_Planejada', 'Status', 'Justificativa', 'Criado_Por', 'Criado_Em', 'Aprovado_Por', 'Aprovado_Em', 'Dados_JSON'] },
  { name: 'Medicoes', headers: ['ID_Medicao', 'ID_Projeto', 'Etapa', 'Percentual', 'Valor', 'Data_Previsao', 'Data_Realizacao', 'Status_Fisico', 'Status_Financeiro', 'ID_Tarefa_ClickUp', 'Nr_NF', 'Data_Emissao_NF', 'Data_Vencimento', 'Data_Recebimento', 'Observacao'] },
  { name: 'Terceirizados', headers: ['ID', 'ID_Projeto', 'Servico', 'Fornecedor', 'Valor_Contratado', 'Valor_Pago', 'Status', 'ID_Tarefa_ClickUp', 'ID_Medicao_Vinculada', 'Percentual_do_Total', 'Data_Entrega_Prevista', 'Data_Entrega_Real', 'Observacao', 'Aprovado_Por', 'Criado_Em'] },
  { name: 'Equipe_Planejamento', headers: ['ID', 'ID_Planejamento', 'Colaborador', 'Media_Hora', 'Horas_Estimadas', 'Total'] },
  { name: 'Despesas_Planejamento', headers: ['ID', 'ID_Planejamento', 'Descricao', 'Valor'] },
  { name: 'Log_Horas', headers: ['ID', 'ID_Projeto', 'Colaborador', 'Horas_Estimadas', 'Horas_Logadas', 'Custo_Calculado', 'Data', 'ID_TimeEntry_ClickUp'] },
  { name: 'Custos_OPP', headers: ['ID', 'ID_Projeto', 'Centro_Custo', 'Descricao', 'Valor_Lancado', 'Data_Lancamento', 'Tipo', 'Fornecedor_Cliente', 'Nr_Documento', 'ID_Importacao'] },
  { name: 'Alertas', headers: ['ID', 'Tipo_Alerta', 'ID_Projeto', 'Mensagem', 'Data_Geracao', 'Setor_Destino', 'Visto_Por', 'Status', 'Nivel'] },
  { name: 'Log_Importacoes', headers: ['ID', 'Data_Upload', 'Arquivo', 'Usuario', 'Registros_Processados', 'Erros', 'Status', 'Detalhes'] },
  { name: 'Configuracoes', headers: ['Chave', 'Valor', 'Descricao'] },
];

async function main() {
  console.log('🚀 Setup das abas do Sistema PAR\n');

  const credentials = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const authClient = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = spreadsheet.data.sheets.map(s => s.properties.title);
  console.log('📋 Abas existentes:', existing.join(', '), '\n');

  // Cria abas que não existem (exceto Usuarios que já criamos)
  const toCreate = REQUIRED_SHEETS.filter(s => !existing.includes(s.name));

  if (toCreate.length === 0) {
    console.log('✅ Todas as abas já existem!');
  } else {
    console.log(`➕ Criando ${toCreate.length} abas: ${toCreate.map(s => s.name).join(', ')}\n`);

    const requests = toCreate.map(s => ({ addSheet: { properties: { title: s.name } } }));
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } });

    // Adiciona cabeçalhos em cada aba criada
    for (const sheet of toCreate) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.name}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [sheet.headers] },
      });
      console.log(`  ✅ ${sheet.name}`);
    }
  }

  console.log('\n🎉 Setup concluído! Reinicie o servidor backend.');
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
