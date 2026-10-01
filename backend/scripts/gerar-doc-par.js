// node backend/scripts/gerar-doc-par.js
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, convertInchesToTwip, PageBreak,
  NumberFormat, LevelFormat, TableOfContents, StyleLevel,
} = require('docx')
const fs = require('fs')
const path = require('path')

function h1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    pageBreakBefore: false,
  })
}
function h2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
  })
}
function h3(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
  })
}
function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, ...opts })],
    spacing: { after: 120 },
    alignment: AlignmentType.JUSTIFIED,
  })
}
function bullet(text, level = 0) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    bullet: { level },
    spacing: { after: 80 },
  })
}
function bold(text) {
  return new TextRun({ text, bold: true, size: 22 })
}
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] })
}
function tableRow(cells, isHeader = false) {
  return new TableRow({
    children: cells.map(c => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: c, bold: isHeader, size: isHeader ? 20 : 20, color: isHeader ? 'FFFFFF' : '000000' })],
        spacing: { before: 60, after: 60 },
        alignment: AlignmentType.LEFT,
      })],
      shading: isHeader ? { fill: '1E3A5F', type: ShadingType.CLEAR, color: '1E3A5F' } : undefined,
    })),
  })
}
function simpleTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      tableRow(headers, true),
      ...rows.map(r => tableRow(r, false)),
    ],
  })
}

const doc = new Document({
  creator: 'Sistema PAR – J. Barros Projetos',
  title: 'Manual de Contexto – Sistema PAR',
  description: 'Documentação completa do sistema PAR: módulos, processos e fluxos.',
  styles: {
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1',
        basedOn: 'Normal', next: 'Normal',
        run: { size: 32, bold: true, color: '1E3A5F' },
        paragraph: { spacing: { before: 400, after: 200 } },
      },
      {
        id: 'Heading2', name: 'Heading 2',
        basedOn: 'Normal', next: 'Normal',
        run: { size: 26, bold: true, color: '2563EB' },
        paragraph: { spacing: { before: 300, after: 150 } },
      },
      {
        id: 'Heading3', name: 'Heading 3',
        basedOn: 'Normal', next: 'Normal',
        run: { size: 24, bold: true, color: '374151' },
        paragraph: { spacing: { before: 200, after: 100 } },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        margin: { top: convertInchesToTwip(1.18), bottom: convertInchesToTwip(0.98), left: convertInchesToTwip(1.18), right: convertInchesToTwip(0.98) },
      },
    },
    children: [
      // ── CAPA ──────────────────────────────────────────────────────────────
      new Paragraph({
        children: [new TextRun({ text: '', break: 6 })],
      }),
      new Paragraph({
        children: [new TextRun({ text: 'J. BARROS PROJETOS', bold: true, size: 36, color: '1E3A5F' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'SISTEMA PAR', bold: true, size: 52, color: '2563EB' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Planejamento · Acompanhamento · Resultados', size: 26, color: '6B7280', italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Manual de Contexto – Módulos, Processos e Fluxos', bold: true, size: 28, color: '374151' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Versão 1.0  ·  Setembro 2026', size: 22, color: '9CA3AF' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      pageBreak(),

      // ── 1. VISÃO GERAL ────────────────────────────────────────────────────
      h1('1. Visão Geral do Sistema PAR'),
      p('O Sistema PAR (Planejamento · Acompanhamento · Resultados) é a plataforma de gestão financeira e operacional da J. Barros Projetos. Ele centraliza o ciclo completo de um contrato de consultoria/projetos: desde o cadastro do projeto até o fechamento financeiro, passando por planejamento, controle de medições, integração com o ERP OPP/VHSys, sincronização com o ClickUp e geração de alertas automáticos.'),
      p('A aplicação é composta por um frontend React (SPA) hospedado na Vercel e um backend Node.js/Express hospedado na Railway, utilizando Google Sheets como banco de dados principal e PostgreSQL para o log de auditoria.'),

      h2('1.1 Arquitetura Tecnológica'),
      simpleTable(
        ['Camada', 'Tecnologia', 'Hospedagem'],
        [
          ['Frontend', 'React + Vite + TailwindCSS + Recharts', 'Vercel – par.jbarrosprojetos.com.br'],
          ['Backend', 'Node.js + Express', 'Railway – sistema-par-production.up.railway.app'],
          ['Banco de dados principal', 'Google Sheets (API v4 – Service Account)', 'Google Cloud'],
          ['Banco de auditoria', 'PostgreSQL (Supabase)', 'Supabase Cloud'],
          ['ERP financeiro', 'OPP / VHSys', 'API REST externa'],
          ['Gestão de tarefas', 'ClickUp API v2 + Webhooks', 'ClickUp Cloud'],
          ['Autenticação', 'JWT (24h) + bcrypt', 'Própria – sem provedor externo'],
        ]
      ),

      h2('1.2 Metodologia PAR'),
      p('A metodologia PAR define regras financeiras rígidas validadas automaticamente pelo sistema em todos os planejamentos:'),
      simpleTable(
        ['Regra PAR', 'Limite', 'Ação automática'],
        [
          ['Margem de lucro', '≥ 23 %', 'Alerta MARGEM_ABAIXO_MINIMO'],
          ['Custo com terceirizados', '≤ 25 % do contrato', 'Alerta TETO_TERCEIROS_BLOQUEIO'],
          ['Custo de produção (equipe + terceiros)', '≤ 30 %', 'Alerta CUSTO_PRODUCAO_ULTRAPASSOU'],
          ['Custo/hora interno padrão', 'R$ 36,40/h', 'Base de cálculo do custo da equipe'],
          ['Comissão fixa', '7,5 % do contrato', 'Impostada automaticamente, não editável'],
          ['Prazo para planejamento', '7 dias úteis', 'Alerta PAR_PLANEJAMENTO_ATRASADO'],
          ['Tamanho máximo de tarefa', '16 horas', 'Alerta EAP_TAREFA_GRANDE'],
        ]
      ),

      pageBreak(),

      // ── 2. MÓDULOS DO SISTEMA ─────────────────────────────────────────────
      h1('2. Módulos do Sistema'),

      // 2.1 Dashboard
      h2('2.1 Dashboard'),
      p('Tela principal do sistema após o login. Apresenta uma visão panorâmica de toda a carteira de projetos em tempo real. O layout é personalizável: cada seção pode ser ocultada individualmente e a preferência é salva no navegador.'),
      h3('Seções disponíveis'),
      bullet('KPIs: projetos em andamento, valor total da carteira, total recebido vs. a receber'),
      bullet('Gráfico de faturamento: barras/área comparando faturamento planejado vs. recebido nos últimos 6 meses'),
      bullet('Gauge de Regras PAR: margem de lucro, % terceirizados e custo de produção com semáforo visual'),
      bullet('Gráfico de pizza: projetos por status'),
      bullet('Próximas Medições: medições vencendo nos próximos 30 dias'),
      bullet('Saúde dos Projetos: semáforo de risco por projeto (verde/amarelo/vermelho)'),
      bullet('Projetos ClickUp: tarefas sincronizadas do ClickUp agrupadas por setor'),
      bullet('Painéis ClickUp: dashboards do ClickUp embutidos (Arquitetura, Saneamento, Infraestrutura)'),

      // 2.2 Gestão de Projetos
      h2('2.2 Gestão de Projetos'),
      p('Listagem completa de todos os projetos com filtros por status, setor e texto livre. Cada linha é expansível e mostra as tarefas vinculadas no ClickUp com seus próprios filtros de status.'),
      h3('Status de projetos reconhecidos pelo sistema'),
      bullet('Em Andamento'),
      bullet('Atrasado'),
      bullet('Pendência'),
      bullet('Aguardando Faturamento'),
      bullet('Paralisado'),
      bullet('A Planejar'),
      bullet('Planejado'),
      bullet('Concluído'),
      bullet('Backlog'),
      h3('Prefixo obrigatório'),
      p('Todo projeto deve ter um prefixo de setor no nome: ARQ- (Arquitetura), INF- (Infraestrutura) ou SAN- (Saneamento). Projetos sem esse prefixo não são processados pelo sistema.'),

      // 2.3 Planejamento Financeiro
      h2('2.3 Planejamento Financeiro'),
      p('Formulário completo para o planejamento financeiro de cada projeto, seguindo a metodologia PAR. O planejamento é o coração do sistema: todas as métricas financeiras derivam dele.'),
      h3('Seções do planejamento'),
      bullet('Dados do contrato: valor, impostos %, taxa administrativa %, comissão (fixada em 7,5%)'),
      bullet('Equipe interna: colaboradores, estimativa de horas e custo por hora (padrão R$36,40/h)'),
      bullet('Terceirizados: fornecedor, valor, vínculo ao item do contrato'),
      bullet('Medições: marcos de pagamento com percentual do contrato'),
      bullet('Despesas internas e gerais'),
      bullet('Painel de validação PAR: mostra em tempo real se as regras são atendidas'),
      h3('Ciclo de status do planejamento'),
      p('Rascunho → Salvo → Em Aprovação → Aprovado (baseline travado) → Rejeitado'),
      p('Ao ser aprovado, o sistema grava um snapshot completo do planejamento no campo Dados_JSON._baseline da planilha Planejamentos. Toda versão anterior é preservada em _historicoBaselines.'),

      // 2.4 Acompanhamento
      h2('2.4 Acompanhamento'),
      p('Tela de comparativo entre o que foi planejado (baseline) e o que foi realizado. Seleciona-se um projeto e o sistema exibe barras de progresso e KPIs para:'),
      bullet('Horas: planejadas vs. realizadas (log do ClickUp)'),
      bullet('Custo da equipe: planejado vs. real'),
      bullet('Terceirizados: planejado vs. comprometido'),
      bullet('Despesas: planejadas vs. lançadas'),
      bullet('Desvio percentual e margem real calculados em tempo real'),

      // 2.5 Medições
      h2('2.5 Medições'),
      p('Cadastro e controle de todas as medições (marcos de faturamento) da empresa. Permite filtros por setor, status financeiro, projeto e texto livre.'),
      h3('Status Físico'),
      bullet('Prevista → Em Andamento → Concluída / Cancelada'),
      h3('Status Financeiro'),
      bullet('A Faturar → NF Emitida (Faturado) → Recebido / Atrasado'),
      p('O status "Recebido" pode ser atualizado automaticamente pelo sistema quando a reconciliação com o OPP confirma o pagamento.'),

      // 2.6 Terceirizados
      h2('2.6 Terceirizados'),
      p('Gestão completa dos subcontratados de cada projeto. O fluxo de status segue uma esteira de aprovação:'),
      bullet('Backlog → Autorizado → Em Negociação → Ordem de Compra (OC emitida)'),
      bullet('Em Andamento → Análise Técnica → Aguardando Aprovação Externa'),
      bullet('Contas a Pagar → Concluído'),
      p('O sistema enriquece automaticamente os registros com dados do OPP contas-a-pagar, buscando a OC pelo número presente no campo observacoes_pag do ERP. Também exibe o status da tarefa vinculada no ClickUp.'),

      // 2.7 Vincular OS OPP
      h2('2.7 Vincular OS OPP'),
      p('Tela de vinculação entre projetos PAR e Ordens de Serviço (OS) do ERP OPP/VHSys. Esta vinculação é o que permite ao sistema saber quais pagamentos recebidos no OPP correspondem a quais projetos PAR.'),
      p('O sistema sugere automaticamente a melhor OS para cada projeto com base em dois critérios:'),
      bullet('Similaridade de nome do cliente (sobreposição de palavras)'),
      bullet('Proximidade do valor do contrato (faixa de 5% a 30%)'),
      p('O usuário pode confirmar a sugestão ou selecionar manualmente. Um projeto pode ter múltiplas OS vinculadas (ex.: OS 43, 62, 63 para o DER/SE).'),
      h3('Funções adicionais na tela'),
      bullet('"Aplicar Mapeamentos Pré-definidos": aplica 38 vinculações nome→OS predefinidas em lote para projetos existentes'),
      bullet('"Corrigir Medições": executa algoritmo para detectar e corrigir valores de medição gravados com separador decimal errado (ex.: R$25,02 → R$25.020,00)'),

      // 2.8 Importação OPP
      h2('2.8 Integração OPP / VHSys'),
      p('Painel que mostra o status da conexão com o ERP OPP, o número de receitas e despesas sincronizadas e um botão para forçar sincronização manual. A sincronização automática reconcilia medições do PAR com pagamentos confirmados no OPP.'),
      p('Processo de reconciliação:'),
      bullet('O OPP retorna todos os registros de contas-a-receber por OS'),
      bullet('O sistema extrai o número da OS do campo observacoes_rec via regex'),
      bullet('Cada OS é cruzada com o campo Nr_OS_OPP da planilha Planejamentos'),
      bullet('Se o pagamento está liquidado no OPP, o Status_Financeiro da medição é atualizado para "Recebido"'),

      // 2.9 Aprovação
      h2('2.9 Aprovação de Baseline'),
      p('Tela restrita a perfis Admin, Diretoria e PO. Lista os planejamentos aguardando aprovação com um resumo financeiro (valor contrato, impostos, receita líquida, custo equipe, terceirizados, margem). Permite aprovar ou rejeitar com justificativa. Gera um PDF imprimível do baseline aprovado.'),

      // 2.10 Baseline Real
      h2('2.10 Baseline vs. Real'),
      p('Comparativo visual por projeto mostrando o avanço real em relação ao baseline aprovado. Exibe barras de progresso para horas e valores financeiros, com indicação de desvio percentual.'),

      // 2.11 Relatório Final
      h2('2.11 Relatório Final'),
      p('Tela de encerramento de projeto. Consolida todos os dados realizados e compara com o planejado:'),
      bullet('Valor contrato, receita líquida, custo equipe, terceirizados, despesas, lucro final'),
      bullet('Lista de todas as medições com status'),
      bullet('Horas por colaborador (do Log_Horas)'),
      bullet('Margem real final em %'),

      // 2.12 Relatórios
      h2('2.12 Relatórios'),
      p('Hub de relatórios com duas abas:'),
      bullet('Exportar: seleciona projeto e exporta o planejamento financeiro em XLSX (ExcelJS) ou PDF (PDFKit) com planilhas de Resumo Geral, Equipe, Terceirizados, Medições e Despesas'),
      bullet('Auditoria / Logs: exibe o histórico de importações do OPP (Log_Importacoes)'),

      // 2.13 Relatórios Gerenciais
      h2('2.13 Relatórios Gerenciais'),
      p('Relatório de gestão com exportação PDF. KPIs: total da carteira, total recebido, margem média, projetos em andamento. Tabela com breakdown por setor e linha por projeto. Cabeçalho com logo da empresa.'),

      // 2.14 Relatório de Medições (REL.MED)
      h2('2.14 Relatório de Medições (REL.MED)'),
      p('Relatório ao vivo cruzando dados do PAR (planejamento) com dados do OPP (recebimentos). Mostra para cada projeto:'),
      bullet('Valor do contrato, total recebido (buscado em tempo real no OPP), saldo a receber'),
      bullet('Cada medição com valor planejado, data prevista e status (Recebido / Atrasada / Pendente)'),
      bullet('Totais gerais: carteira total, total recebido OPP, total de medições, breakdown por status'),
      p('Permite filtros por setor e exportação em Excel e PDF.'),

      // 2.15 Extrato Projeto
      h2('2.15 Extrato do Projeto'),
      p('Visão financeira detalhada de um projeto com todas as contas do OPP agrupadas por categoria:'),
      bullet('Receitas, custos diretos, pessoal, despesas operacionais, investimentos, impostos, movimentações'),
      bullet('Cálculo local dos indicadores PAR (margem, % terceiros, custo de produção) a partir do Dados_JSON'),
      bullet('Flags PAR por linha (OK/NOK)'),

      // 2.16 Dashboard Financeiro
      h2('2.16 Dashboard Financeiro'),
      p('Dashboard com KPI tiles e gráficos de área/barras (Recharts) mostrando faturamento mensal e acumulado (planejado vs. recebido). Dados agregados por mês/ano a partir de Planejamentos + Medições + OPP.'),

      // 2.17 Alertas
      h2('2.17 Alertas'),
      p('Central de notificações automáticas do sistema. Alertas são gerados pelo engine de regras e filtrados por setor do usuário. Permitem marcar como visto, excluir e dispensar em lote.'),
      h3('Tipos de alerta'),
      simpleTable(
        ['Código', 'Descrição', 'Nível'],
        [
          ['TAREFA_ATRASADA', 'Tarefa ClickUp com prazo vencido', 'Atenção'],
          ['SEM_RESPONSAVEL', 'Tarefa sem responsável atribuído', 'Atenção'],
          ['PRAZO_NAO_DEFINIDO', 'Tarefa sem data de entrega', 'Info'],
          ['VENCE_AMANHA / VENCE_EM_BREVE', 'Prazo de tarefa próximo', 'Atenção'],
          ['MEDICAO_ATRASADA', 'Medição com data vencida e não recebida', 'Crítico'],
          ['MEDICAO_PROXIMA', 'Medição vence em breve', 'Atenção'],
          ['FATURA_VENCIDA', 'NF emitida mas pagamento não confirmado', 'Crítico'],
          ['TETO_TERCEIROS_BLOQUEIO', 'Terceirizados > 25 % do contrato', 'Crítico'],
          ['TETO_TERCEIROS_AVISO', 'Terceirizados > 20 % do contrato', 'Atenção'],
          ['MARGEM_ABAIXO_MINIMO', 'Margem de lucro < 23 %', 'Crítico'],
          ['CUSTO_PRODUCAO_ULTRAPASSOU', 'Custo de produção > 30 %', 'Crítico'],
          ['DAILY_SCRUM_PENDENTE', 'Daily scrum não registrado', 'Info'],
          ['PAR_PLANEJAMENTO_ATRASADO', 'Projeto > 7 dias sem planejamento aprovado', 'Atenção'],
          ['EAP_TAREFA_GRANDE', 'Tarefa > 16 h sem subtarefas', 'Info'],
          ['SEM_TEMPO_ESTIMADO', 'Tarefa sem estimativa de horas', 'Info'],
        ]
      ),

      // 2.18 Checklist
      h2('2.18 Checklist de Integridade'),
      p('Lista todos os projetos ativos e verifica se campos críticos estão preenchidos:'),
      bullet('Setor, Cliente, Valor Global, Data de Entrega do Contrato, Número do Contrato, Centro de Custo OPP'),
      bullet('Existência de planejamento financeiro'),
      bullet('Existência de medições cadastradas'),
      bullet('Existência de lançamentos de horas no Log_Horas'),

      // 2.19 Auditoria
      h2('2.19 Auditoria'),
      p('Log de auditoria completo armazenado em PostgreSQL (não no Google Sheets). Registra automaticamente todas as operações de criação, edição, exclusão e aprovação nas tabelas principais. Exibe diff JSON antes/depois de cada alteração. Filtros por tabela, ação, usuário e texto livre. Paginado.'),

      // 2.20 Comercial
      h2('2.20 Comercial'),
      p('Visão comercial com duas abas:'),
      bullet('Clientes: projetos agrupados por cliente com valor total da carteira, quantidade de projetos e resumo financeiro'),
      bullet('Terceirizados: visão consolidada do workflow de terceirizados com enriquecimento OPP e botão de sincronização'),

      // 2.21 Configurações
      h2('2.21 Configurações'),
      p('Painel administrativo com:'),
      bullet('Status das integrações (Google Sheets, OPP, ClickUp)'),
      bullet('Gerenciamento de usuários: criar, listar, ativar/desativar, alterar perfil'),
      bullet('Perfis disponíveis: Admin, PO, Coordenador, Comercial, Financeiro, Diretoria, Visualizador'),
      bullet('Informações do sistema (versão, sheets conectadas)'),
      bullet('Chaves de configuração da planilha Configuracoes (chave-valor)'),

      pageBreak(),

      // ── 3. MODELO DE DADOS ────────────────────────────────────────────────
      h1('3. Modelo de Dados'),
      p('O banco de dados principal é o Google Sheets, composto pelas seguintes planilhas:'),

      simpleTable(
        ['Planilha', 'Descrição', 'Colunas-chave'],
        [
          ['USER', 'Usuários do sistema', 'ID, Nome, Email, Senha_Hash, Perfil, Ativo'],
          ['Projetos_Contratos', 'Cadastro dos projetos', 'ID_Projeto, Nome, Cliente, Valor_Global, Status, Setor, ID_ClickUp, Centro_Custo_OPP'],
          ['Planejamentos', 'Planejamentos financeiros PAR', 'ID, ID_Projeto, Valor_Contrato, Impostos_Perc, Taxa_Adm_Perc, Status, Nr_OS_OPP, Dados_JSON'],
          ['Medicoes', 'Marcos de faturamento', 'ID_Medicao, ID_Projeto, Valor, Data_Previsao, Status_Fisico, Status_Financeiro, Nr_NF'],
          ['Terceirizados', 'Subcontratados por projeto', 'ID, ID_Projeto, Fornecedor, Valor_Contratado, OC, Status'],
          ['Log_Horas', 'Registro de horas (ClickUp)', 'ID, ID_Projeto, Colaborador, Horas_Estimadas, Horas_Logadas, ID_TimeEntry_ClickUp'],
          ['Alertas', 'Alertas automáticos', 'ID, Tipo_Alerta, ID_Projeto, Mensagem, Nivel, Setor_Destino'],
          ['Financeiro_OPP', 'Lançamentos financeiros do OPP', 'ID_OPP, Tipo, Valor, Situacao, Nr_OS_OPP, OC, Sincronizado_Em'],
          ['OrdensCompra_OPP', 'Ordens de compra do OPP', 'ID_OC, Nome_Fornecedor, Valor_Total, Valor_Liquidado, Situacao'],
          ['Custos_OPP', 'Custos importados do Opportune (legado)', 'ID, ID_Projeto, Descricao, Valor, Tipo'],
          ['Log_Importacoes', 'Log de importações CSV/XLSX', 'ID, Data_Upload, Arquivo, Registros_Processados, Status'],
          ['Configuracoes', 'Parâmetros do sistema', 'Chave, Valor, Descricao'],
          ['Equipe_Planejamento', 'Equipe por planejamento', 'ID, ID_Planejamento, Colaborador, Media_Hora, Horas_Estimadas'],
          ['Despesas_Planejamento', 'Despesas por planejamento', 'ID, ID_Planejamento, Descricao, Valor'],
        ]
      ),

      new Paragraph({ spacing: { after: 200 } }),
      h3('Dados_JSON – estrutura interna'),
      p('O campo Dados_JSON da planilha Planejamentos é um blob JSON que contém o planejamento completo. Estrutura principal:'),
      bullet('valorContrato, impostosPerc, taxaAdmPerc, comissaoPerc'),
      bullet('equipe[ ] → { colaborador, mediaHora, horasEstimadas, total }'),
      bullet('terceirizados[ ] → { servico, fornecedor, valor, vinculo }'),
      bullet('medicoes[ ] → { etapa, percentual, valor, dataPrevisao }'),
      bullet('despesas[ ] / despesasInternas[ ] → { descricao, valor }'),
      bullet('_baseline → snapshot completo no momento da aprovação (inclui todas as seções acima + data)'),
      bullet('_historicoBaselines[ ] → array de snapshots anteriores'),

      p('O PostgreSQL armazena a tabela Auditoria (ID, Tabela, Acao, ID_Registro, Nome_Registro, Usuario_Nome, Usuario_Email, Antes_JSON, Depois_JSON, Criado_Em).'),

      pageBreak(),

      // ── 4. INTEGRAÇÕES ────────────────────────────────────────────────────
      h1('4. Integrações Externas'),

      h2('4.1 OPP / VHSys ERP'),
      p('O OPP é o ERP financeiro da empresa. O PAR consome sua API REST para:'),
      bullet('Contas a receber (/contas-receber): pagamentos recebidos por OS. Paginado (250 registros/página, até 10.000). Autenticado por access-token e secret-access-token nos headers.'),
      bullet('Contas a pagar (/contas-pagar): pagamentos a fornecedores. Cruzado com OC dos terceirizados PAR.'),
      bullet('Centros de custo (/centros-custo): usados no módulo Extrato.'),
      p('O OPP sempre retorna HTTP 200 mesmo em caso de erro – o serviço verifica o campo code internamente. O número da OS é extraído do campo observacoes_rec via regex (ex.: "OS nro. 43" ou "ordem de serviço nº 43").'),

      h2('4.2 ClickUp'),
      p('O ClickUp é usado para gestão de tarefas dos projetos. A integração ocorre em dois sentidos:'),
      bullet('Sync ativo: POST /api/clickup/sync faz uma varredura completa de todos os spaces → folders → lists → tasks do ClickUp. Lê campos customizados (Fase, Setor, Centro_Custo, Responsavel) e escreve em Projetos_Contratos e Log_Horas.'),
      bullet('Webhooks: o ClickUp envia eventos em tempo real (task_created, task_updated, time_entry_created) para o backend. O HMAC-SHA256 valida a autenticidade. Esses eventos disparam atualizações incrementais e broadcast via WebSocket para o frontend.'),
      p('Espaços ClickUp monitorados: Arquitetura, Saneamento, Infraestrutura (3 spaces separados).'),
      p('IDs dos dashboards ClickUp embutidos no PAR: Arquitetura (1376zy-3053), Saneamento (1376zy-3173), Infraestrutura (1376zy-3193).'),

      h2('4.3 Google Sheets'),
      p('Banco de dados principal. O backend usa uma conta de serviço Google (credenciais em variável de ambiente GOOGLE_CREDENTIALS em base64 ou arquivo JSON). Cache em memória com TTL de 3 minutos por planilha, invalidado automaticamente em qualquer escrita. Interface unificada (readSheet, appendRow, updateRowById, deleteRowById, batchUpdate) que pode ser substituída por PostgreSQL via flag USE_POSTGRES=true.'),

      h2('4.4 PostgreSQL (Supabase)'),
      p('Usado exclusivamente para a tabela de auditoria. Configurado via variável DATABASE_URL com suporte a SSL Supabase. Todas as operações de CRUD nas entidades principais passam pelo auditMiddleware, que grava diffs JSON antes/depois.'),

      pageBreak(),

      // ── 5. FLUXOS E PROCESSOS ─────────────────────────────────────────────
      h1('5. Fluxos e Processos'),

      h2('Fluxo 1: Entrada de Projeto'),
      bullet('1. Projeto criado no ClickUp em um dos 3 spaces (ARQ-, SAN- ou INF-)'),
      bullet('2. Webhook ou sync manual escrita em Projetos_Contratos com status "A Planejar"'),
      bullet('3. Se ficar > 7 dias úteis sem planejamento aprovado → alerta PAR_PLANEJAMENTO_ATRASADO'),

      h2('Fluxo 2: Planejamento Financeiro PAR'),
      bullet('1. PO/Coordenador acessa PlanejamentoFinanceiro, preenche contrato, equipe, terceiros, medições'),
      bullet('2. Sistema valida regras PAR em tempo real (margem ≥ 23%, terceiros ≤ 25%, custo produção ≤ 30%)'),
      bullet('3. Planejamento salvo → submetido para aprovação'),
      bullet('4. Admin/Diretoria/PO aprova → baseline gravado em Dados_JSON._baseline'),
      bullet('5. Histórico de baselines mantido em _historicoBaselines'),

      h2('Fluxo 3: Acompanhamento de Horas (ClickUp)'),
      bullet('1. Colaboradores lançam horas no ClickUp via time entries'),
      bullet('2. Sync/webhook escreve no Log_Horas (deduplicado por ID_TimeEntry_ClickUp)'),
      bullet('3. Engine de alertas verifica tarefas > 16h sem subtarefas → EAP_TAREFA_GRANDE'),
      bullet('4. Acompanhamento.jsx exibe planejado vs. real atualizado'),

      h2('Fluxo 4: Reconciliação Financeira OPP'),
      bullet('1. OPP contas-receber consultado em tempo real (paginado)'),
      bullet('2. Número da OS extraído de observacoes_rec via regex'),
      bullet('3. OS cruzada com Nr_OS_OPP de cada Planejamento'),
      bullet('4. Se liquidado no OPP → Status_Financeiro da medição atualizado para "Recebido"'),
      bullet('5. Total recebido por projeto calculado somando todas as OS vinculadas'),

      h2('Fluxo 5: Medições e Faturamento'),
      bullet('1. Medições criadas no planejamento ou manualmente no módulo Medições'),
      bullet('2. Status_Fisico avança: Prevista → Em Andamento → Concluída'),
      bullet('3. Status_Financeiro avança: A Faturar → NF Emitida → Recebido'),
      bullet('4. Engine gera alertas: MEDICAO_ATRASADA (vencida), MEDICAO_PROXIMA, FATURA_VENCIDA'),
      bullet('5. REL.MED consolida visão ao vivo cruzando PAR + OPP'),

      h2('Fluxo 6: Gestão de Terceirizados'),
      bullet('1. Terceirizado cadastrado com OC (Ordem de Compra)'),
      bullet('2. Sistema verifica teto: aviso em 20%, bloqueio em 25% do contrato'),
      bullet('3. Status avança pela esteira: Backlog → OC → Em Andamento → Contas a Pagar → Concluído'),
      bullet('4. OPP contas-pagar enriquece o registro automaticamente pelo número da OC'),
      bullet('5. Alerta TETO_TERCEIROS_BLOQUEIO se limite ultrapassado'),

      h2('Fluxo 7: Engine de Alertas'),
      bullet('1. checkAllAlerts() roda após cada sync/escrita'),
      bullet('2. Lê Projetos_Contratos, Terceirizados, Medições, Alertas em paralelo'),
      bullet('3. Gera/expira alertas por projeto e tipo'),
      bullet('4. Alertas filtrados por Setor_Destino (apenas quem precisa ver recebe)'),
      bullet('5. Broadcast via WebSocket para todos os clientes conectados'),

      h2('Fluxo 8: Auditoria'),
      bullet('1. Qualquer CRUD em Projetos, Planejamentos, Medições, Terceirizados ou Alertas'),
      bullet('2. auditMiddleware captura estado antes e depois'),
      bullet('3. Diff gravado em PostgreSQL → tabela Auditoria'),
      bullet('4. Visualizável na tela Auditoria com expansão de diff JSON'),

      pageBreak(),

      // ── 6. PERFIS DE USUÁRIO ──────────────────────────────────────────────
      h1('6. Perfis de Usuário e Permissões'),
      simpleTable(
        ['Perfil', 'Principais permissões'],
        [
          ['Admin', 'Acesso total: usuários, aprovações, auditorias, configurações'],
          ['Diretoria', 'Aprovação de baselines, relatórios gerenciais, visão financeira completa'],
          ['PO (Product Owner)', 'Criação e aprovação de planejamentos, acompanhamento de projetos'],
          ['Coordenador', 'Edição de projetos e planejamentos do seu setor'],
          ['Comercial', 'Visão comercial (clientes, carteira), sem acesso a detalhes financeiros'],
          ['Financeiro', 'Medições, reconciliação OPP, relatórios financeiros'],
          ['Visualizador', 'Somente leitura em todas as telas'],
        ]
      ),

      new Paragraph({ spacing: { after: 200 } }),
      p('Alertas são filtrados por Setor_Destino, que corresponde ao perfil do usuário. Cada perfil recebe apenas os alertas relevantes para seu escopo de trabalho.'),

      pageBreak(),

      // ── 7. VARIÁVEIS DE AMBIENTE ──────────────────────────────────────────
      h1('7. Variáveis de Ambiente Principais'),
      simpleTable(
        ['Variável', 'Uso'],
        [
          ['GOOGLE_SHEET_ID', 'ID da planilha Google Sheets principal'],
          ['GOOGLE_CREDENTIALS', 'Credenciais da conta de serviço (base64 ou arquivo JSON)'],
          ['OPP_BASE_URL', 'URL base da API OPP/VHSys'],
          ['OPP_ACCESS_TOKEN', 'Token de acesso ao OPP'],
          ['OPP_SECRET_ACCESS_TOKEN', 'Token secreto do OPP'],
          ['CLICKUP_API_TOKEN', 'Token da API ClickUp'],
          ['CLICKUP_TEAM_ID', 'ID do workspace ClickUp'],
          ['CLICKUP_WEBHOOK_SECRET', 'Chave HMAC para validação de webhooks'],
          ['DATABASE_URL', 'Connection string PostgreSQL (Supabase) para auditoria'],
          ['JWT_SECRET', 'Segredo para assinatura dos tokens JWT'],
          ['USE_POSTGRES', 'Se "true", usa PostgreSQL como banco principal em vez do Sheets'],
          ['TETO_AVISO', 'Percentual de aviso de terceirizados (padrão 20%)'],
          ['TETO_BLOQUEIO', 'Percentual de bloqueio de terceirizados (padrão 25%)'],
        ]
      ),

      new Paragraph({ spacing: { after: 400 } }),

      // ── RODAPÉ ─────────────────────────────────────────────────────────────
      new Paragraph({
        children: [new TextRun({ text: 'Sistema PAR – J. Barros Projetos  ·  Documento gerado automaticamente  ·  Setembro 2026', size: 18, color: '9CA3AF', italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
      }),
    ],
  }],
})

const out = path.join(__dirname, '..', '..', 'Contexto_Sistema_PAR.docx')
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(out, buf)
  console.log('Arquivo gerado:', out)
})
