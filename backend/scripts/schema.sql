-- Schema Sistema PAR — execute no Supabase SQL Editor antes de migrar

CREATE TABLE IF NOT EXISTS "USER" (
  "ID"           TEXT PRIMARY KEY,
  "Nome"         TEXT,
  "Email"        TEXT UNIQUE,
  "Senha_Hash"   TEXT,
  "Perfil"       TEXT,
  "Empresa"      TEXT,
  "Ativo"        TEXT DEFAULT 'true',
  "Criado_Em"    TEXT,
  "Ultimo_Login" TEXT
);

CREATE TABLE IF NOT EXISTS "Projetos_Contratos" (
  "ID_Projeto"             TEXT PRIMARY KEY,
  "Nome"                   TEXT,
  "Cliente"                TEXT,
  "Valor_Global"           TEXT,
  "Teto_Terc_Perc"         TEXT,
  "Teto_Terc_Valor"        TEXT,
  "ID_ClickUp"             TEXT,
  "Centro_Custo_OPP"       TEXT,
  "Status"                 TEXT,
  "Progresso_Perc"         TEXT,
  "Data_Inicio"            TEXT,
  "Data_Entrega_Contrato"  TEXT,
  "Data_Entrega_Planejada" TEXT,
  "Empresa"                TEXT,
  "Setor"                  TEXT,
  "Tipologia"              TEXT,
  "Link_ClickUp"           TEXT,
  "Criado_Em"              TEXT,
  "Atualizado_Em"          TEXT,
  "Responsavel"            TEXT
);

CREATE TABLE IF NOT EXISTS "Planejamentos" (
  "ID"                     TEXT PRIMARY KEY,
  "ID_Projeto"             TEXT,
  "Nome_Projeto"           TEXT,
  "Cliente"                TEXT,
  "Nr_Contrato_OS"         TEXT,
  "Resp_Planejamento"      TEXT,
  "Resp_Aprovacao"         TEXT,
  "Setor"                  TEXT,
  "Tipologia"              TEXT,
  "Empresa"                TEXT,
  "Link_ClickUp"           TEXT,
  "Valor_Contrato"         TEXT,
  "Impostos_Perc"          TEXT,
  "Taxa_Adm_Perc"          TEXT,
  "Comissao_Perc"          TEXT,
  "Data_Inicio_OS"         TEXT,
  "Data_Entrega_Contrato"  TEXT,
  "Data_Entrega_Planejada" TEXT,
  "Status"                 TEXT,
  "Justificativa"          TEXT,
  "Criado_Por"             TEXT,
  "Criado_Em"              TEXT,
  "Aprovado_Por"           TEXT,
  "Aprovado_Em"            TEXT,
  "Comentario_Aprovacao"   TEXT,
  "Dados_JSON"             TEXT
);

CREATE TABLE IF NOT EXISTS "Medicoes" (
  "ID_Medicao"        TEXT PRIMARY KEY,
  "ID_Projeto"        TEXT,
  "Etapa"             TEXT,
  "Percentual"        TEXT,
  "Valor"             TEXT,
  "Data_Previsao"     TEXT,
  "Data_Realizacao"   TEXT,
  "Status_Fisico"     TEXT,
  "Status_Financeiro" TEXT,
  "ID_Tarefa_ClickUp" TEXT,
  "Nr_NF"             TEXT,
  "Data_Emissao_NF"   TEXT,
  "Data_Vencimento"   TEXT,
  "Data_Recebimento"  TEXT,
  "Observacao"        TEXT,
  "Nr_OS_OPP"         TEXT
);

CREATE TABLE IF NOT EXISTS "Terceirizados" (
  "ID"                    TEXT PRIMARY KEY,
  "ID_Projeto"            TEXT,
  "Servico"               TEXT,
  "Fornecedor"            TEXT,
  "Valor_Contratado"      TEXT,
  "Valor_Pago"            TEXT,
  "Status"                TEXT,
  "ID_Tarefa_ClickUp"     TEXT,
  "ID_Medicao_Vinculada"  TEXT,
  "Percentual_do_Total"   TEXT,
  "Data_Entrega_Prevista" TEXT,
  "Data_Entrega_Real"     TEXT,
  "Observacao"            TEXT,
  "Aprovado_Por"          TEXT,
  "Criado_Em"             TEXT,
  "OC"                    TEXT,
  "Status_ClickUp"        TEXT,
  "Etapa_ClickUp"         TEXT,
  "Responsavel"           TEXT
);

CREATE TABLE IF NOT EXISTS "Equipe_Planejamento" (
  "ID"              TEXT PRIMARY KEY,
  "ID_Planejamento" TEXT,
  "Colaborador"     TEXT,
  "Media_Hora"      TEXT,
  "Horas_Estimadas" TEXT,
  "Total"           TEXT
);

CREATE TABLE IF NOT EXISTS "Despesas_Planejamento" (
  "ID"              TEXT PRIMARY KEY,
  "ID_Planejamento" TEXT,
  "Descricao"       TEXT,
  "Valor"           TEXT
);

CREATE TABLE IF NOT EXISTS "Log_Horas" (
  "ID"                   TEXT PRIMARY KEY,
  "ID_Projeto"           TEXT,
  "Colaborador"          TEXT,
  "Horas_Estimadas"      TEXT,
  "Horas_Logadas"        TEXT,
  "Custo_Calculado"      TEXT,
  "Data"                 TEXT,
  "ID_TimeEntry_ClickUp" TEXT
);

CREATE TABLE IF NOT EXISTS "Custos_OPP" (
  "ID"                 TEXT PRIMARY KEY,
  "ID_Projeto"         TEXT,
  "Centro_Custo"       TEXT,
  "Descricao"          TEXT,
  "Valor_Lancado"      TEXT,
  "Data_Lancamento"    TEXT,
  "Tipo"               TEXT,
  "Fornecedor_Cliente" TEXT,
  "Nr_Documento"       TEXT,
  "ID_Importacao"      TEXT
);

CREATE TABLE IF NOT EXISTS "Alertas" (
  "ID"            TEXT PRIMARY KEY,
  "Tipo_Alerta"   TEXT,
  "ID_Projeto"    TEXT,
  "Mensagem"      TEXT,
  "Data_Geracao"  TEXT,
  "Setor_Destino" TEXT,
  "Visto_Por"     TEXT,
  "Status"        TEXT,
  "Nivel"         TEXT,
  "Link_ClickUp"  TEXT
);

CREATE TABLE IF NOT EXISTS "Log_Importacoes" (
  "ID"                    TEXT PRIMARY KEY,
  "Data_Upload"           TEXT,
  "Arquivo"               TEXT,
  "Usuario"               TEXT,
  "Registros_Processados" TEXT,
  "Erros"                 TEXT,
  "Status"                TEXT,
  "Detalhes"              TEXT
);

CREATE TABLE IF NOT EXISTS "Configuracoes" (
  "Chave"     TEXT PRIMARY KEY,
  "Valor"     TEXT,
  "Descricao" TEXT
);

CREATE TABLE IF NOT EXISTS "Financeiro_OPP" (
  "ID_OPP"           TEXT PRIMARY KEY,
  "Tipo"             TEXT,
  "Profissional"     TEXT,
  "Categoria"        TEXT,
  "Descricao"        TEXT,
  "Valor"            TEXT,
  "Data_Vencimento"  TEXT,
  "Data_Competencia" TEXT,
  "Situacao"         TEXT,
  "ID_Cliente_OPP"   TEXT,
  "Nome_Cliente"     TEXT,
  "Nr_Documento"     TEXT,
  "Nr_OS_OPP"        TEXT,
  "OC"               TEXT,
  "Sincronizado_Em"  TEXT
);

CREATE TABLE IF NOT EXISTS "OrdensCompra_OPP" (
  "ID_OC"           TEXT PRIMARY KEY,
  "ID_Ordem_OPP"    TEXT,
  "Nome_Fornecedor" TEXT,
  "Valor_Total"     TEXT,
  "Data_Pedido"     TEXT,
  "Situacao"        TEXT,
  "Observacao"      TEXT,
  "Sincronizado_Em" TEXT
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_projetos_status       ON "Projetos_Contratos"("Status");
CREATE INDEX IF NOT EXISTS idx_projetos_clickup      ON "Projetos_Contratos"("ID_ClickUp");
CREATE INDEX IF NOT EXISTS idx_medicoes_projeto      ON "Medicoes"("ID_Projeto");
CREATE INDEX IF NOT EXISTS idx_terceirizados_projeto ON "Terceirizados"("ID_Projeto");
CREATE INDEX IF NOT EXISTS idx_alertas_projeto       ON "Alertas"("ID_Projeto");
CREATE INDEX IF NOT EXISTS idx_alertas_status        ON "Alertas"("Status");
CREATE INDEX IF NOT EXISTS idx_log_horas_projeto     ON "Log_Horas"("ID_Projeto");
CREATE INDEX IF NOT EXISTS idx_custos_projeto        ON "Custos_OPP"("ID_Projeto");
CREATE INDEX IF NOT EXISTS idx_planejamentos_projeto ON "Planejamentos"("ID_Projeto");
