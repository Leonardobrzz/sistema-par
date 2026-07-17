import { useState, useEffect, useCallback } from "react"
import { Clock, Search, X, Filter, ChevronDown, ChevronRight } from "lucide-react"
import api from "../utils/api"
import { useTheme } from "../contexts/ThemeContext"

const TABELAS = ["Projetos_Contratos", "Planejamentos", "Medicoes", "Terceirizados", "Alertas"]
const ACOES   = ["CRIACAO", "EDICAO", "EXCLUSAO", "APROVACAO", "REJEICAO"]

const ACAO_LABEL = {
  CRIACAO:  { label: "Criação",  cor: "#16A34A", bg: "#DCFCE7" },
  EDICAO:   { label: "Edição",   cor: "#2563EB", bg: "#DBEAFE" },
  EXCLUSAO: { label: "Exclusão", cor: "#DC2626", bg: "#FEE2E2" },
  APROVACAO:{ label: "Aprovação",cor: "#7C3AED", bg: "#EDE9FE" },
  REJEICAO: { label: "Rejeição", cor: "#D97706", bg: "#FEF3C7" },
}

const TABELA_LABEL = {
  Projetos_Contratos: "Projeto",
  Planejamentos:      "Planejamento",
  Medicoes:           "Medição",
  Terceirizados:      "Terceirizado",
  Alertas:            "Alerta",
}

function fmtData(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function DiffViewer({ antes, depois }) {
  const { isDark } = useTheme()
  const T = { text1: isDark ? "#F1F5F9" : "#0F172A", text2: isDark ? "#94A3B8" : "#64748B", bg: isDark ? "#0F172A" : "#F8FAFC", border: isDark ? "#334155" : "#E2E8F0" }

  const parseJson = (s) => { try { return JSON.parse(s || "{}") } catch { return {} } }
  const a = parseJson(antes)
  const b = parseJson(depois)
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter(k => a[k] !== b[k] && !["Atualizado_Em", "Criado_Em"].includes(k))

  if (!keys.length) return <div style={{ fontSize: 12, color: T.text2, padding: "8px 0" }}>Nenhuma alteração detectada nos campos.</div>

  return (
    <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      {keys.map(k => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 8, padding: "6px 10px", background: T.bg, borderRadius: 6, border: `1px solid ${T.border}` }}>
          <span style={{ color: T.text2, fontWeight: 600, alignSelf: "center" }}>{k}</span>
          <span style={{ color: "#DC2626", background: "#FEE2E2", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", wordBreak: "break-all" }}>
            {a[k] !== undefined ? String(a[k] || "—") : <em style={{ color: T.text2 }}>n/a</em>}
          </span>
          <span style={{ color: "#15803D", background: "#DCFCE7", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", wordBreak: "break-all" }}>
            {b[k] !== undefined ? String(b[k] || "—") : <em style={{ color: T.text2 }}>n/a</em>}
          </span>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 8, paddingLeft: 10 }}>
        <span />
        <span style={{ fontSize: 10, color: "#DC2626", fontWeight: 700 }}>ANTES</span>
        <span style={{ fontSize: 10, color: "#15803D", fontWeight: 700 }}>DEPOIS</span>
      </div>
    </div>
  )
}

export default function Auditoria() {
  const { isDark } = useTheme()
  const T = {
    bg:      isDark ? "#0F172A" : "#F8FAFC",
    card:    isDark ? "#1E293B" : "#ffffff",
    cardAlt: isDark ? "#0F172A" : "#F8FAFC",
    border:  isDark ? "#334155" : "#E2E8F0",
    text1:   isDark ? "#F1F5F9" : "#0F172A",
    text2:   isDark ? "#94A3B8" : "#64748B",
    text3:   isDark ? "#475569" : "#94A3B8",
    inputBg: isDark ? "#1E293B" : "#F8FAFC",
  }

  const [registros, setRegistros] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [aberto, setAberto] = useState(null)

  const [busca, setBusca] = useState("")
  const [filtroTabela, setFiltroTabela] = useState("")
  const [filtroAcao, setFiltroAcao] = useState("")
  const [filtroUsuario, setFiltroUsuario] = useState("")
  const [pagina, setPagina] = useState(0)
  const POR_PAGINA = 50

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const params = { limit: POR_PAGINA, offset: pagina * POR_PAGINA }
      if (busca)        params.busca   = busca
      if (filtroTabela) params.tabela  = filtroTabela
      if (filtroAcao)   params.acao    = filtroAcao
      if (filtroUsuario)params.usuario = filtroUsuario
      const { data } = await api.get("/auditoria", { params })
      setRegistros(data.registros || [])
      setTotal(data.total || 0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [busca, filtroTabela, filtroAcao, filtroUsuario, pagina])

  useEffect(() => { setPagina(0) }, [busca, filtroTabela, filtroAcao, filtroUsuario])
  useEffect(() => { carregar() }, [carregar])

  const limpar = () => { setBusca(""); setFiltroTabela(""); setFiltroAcao(""); setFiltroUsuario("") }
  const temFiltro = busca || filtroTabela || filtroAcao || filtroUsuario

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Clock size={22} color="#7C3AED" />
        <span style={{ fontWeight: 900, fontSize: 18, color: T.text1, textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>
          Histórico de Alterações
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text2, background: T.cardAlt, border: `1px solid ${T.border}`, padding: "4px 12px", borderRadius: 20 }}>
          {total.toLocaleString("pt-BR")} registro(s)
        </span>
      </div>

      {/* Filtros */}
      <div style={{ background: T.card, borderRadius: 14, padding: "16px 20px", border: `1.5px solid ${T.border}`, marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {/* Busca */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.inputBg, border: `1.5px solid ${T.border}`, borderRadius: 20, padding: "5px 12px", minWidth: 220 }}>
          <Search size={14} color={T.text3} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar projeto ou registro..."
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, flex: 1, color: T.text1, fontFamily: "inherit" }} />
          {busca && <button onClick={() => setBusca("")} style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, display: "flex" }}><X size={14} /></button>}
        </div>

        {/* Tabela */}
        <select value={filtroTabela} onChange={e => setFiltroTabela(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 20, border: `1.5px solid ${filtroTabela ? "#7C3AED" : T.border}`, background: filtroTabela ? "#EDE9FE" : T.cardAlt, color: filtroTabela ? "#7C3AED" : T.text2, fontWeight: 600, fontSize: 12, cursor: "pointer", outline: "none" }}>
          <option value="">Todos os módulos</option>
          {TABELAS.map(t => <option key={t} value={t}>{TABELA_LABEL[t] || t}</option>)}
        </select>

        {/* Ação */}
        <select value={filtroAcao} onChange={e => setFiltroAcao(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 20, border: `1.5px solid ${filtroAcao ? "#7C3AED" : T.border}`, background: filtroAcao ? "#EDE9FE" : T.cardAlt, color: filtroAcao ? "#7C3AED" : T.text2, fontWeight: 600, fontSize: 12, cursor: "pointer", outline: "none" }}>
          <option value="">Todas as ações</option>
          {ACOES.map(a => <option key={a} value={a}>{ACAO_LABEL[a]?.label || a}</option>)}
        </select>

        {/* Usuário */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.inputBg, border: `1.5px solid ${T.border}`, borderRadius: 20, padding: "5px 12px" }}>
          <Filter size={14} color={T.text3} />
          <input value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)} placeholder="Filtrar por usuário..."
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, width: 160, color: T.text1, fontFamily: "inherit" }} />
        </div>

        {temFiltro && (
          <button onClick={limpar} style={{ padding: "5px 12px", borderRadius: 20, border: "1.5px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      {loading && <div style={{ textAlign: "center", padding: 60, color: T.text2 }}>Carregando...</div>}

      {!loading && registros.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, background: T.cardAlt, borderRadius: 16, border: `2px dashed ${T.border}` }}>
          <Clock size={40} color={T.text3} style={{ margin: "0 auto 12px" }} />
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text2 }}>Nenhum registro encontrado</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {registros.map(r => {
          const acaoInfo = ACAO_LABEL[r.Acao] || { label: r.Acao, cor: T.text2, bg: T.cardAlt }
          const expandido = aberto === r.ID_Auditoria
          const temDiff = r.Dados_Antes || r.Dados_Depois

          return (
            <div key={r.ID_Auditoria} style={{ background: T.card, borderRadius: 10, border: `1px solid ${expandido ? "#7C3AED" : T.border}`, overflow: "hidden" }}>
              <button
                onClick={() => temDiff && setAberto(expandido ? null : r.ID_Auditoria)}
                style={{ width: "100%", display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 12, alignItems: "center", padding: "12px 16px", background: "transparent", border: "none", cursor: temDiff ? "pointer" : "default", textAlign: "left" }}>
                {temDiff
                  ? (expandido ? <ChevronDown size={14} color="#7C3AED" /> : <ChevronRight size={14} color={T.text3} />)
                  : <span style={{ width: 14 }} />
                }
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: T.text1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.Nome_Registro || r.ID_Registro || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: T.text2, marginTop: 2 }}>
                    {TABELA_LABEL[r.Tabela] || r.Tabela}
                    {r.ID_Registro && <span style={{ color: T.text3 }}> · {r.ID_Registro.slice(0, 8)}…</span>}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, color: acaoInfo.cor, background: acaoInfo.bg, whiteSpace: "nowrap" }}>
                  {acaoInfo.label}
                </span>
                <div style={{ textAlign: "right", minWidth: 130 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text1 }}>{r.Usuario_Nome || "—"}</div>
                  <div style={{ fontSize: 10, color: T.text2 }}>{r.Usuario_Email}</div>
                </div>
                <div style={{ fontSize: 11, color: T.text2, whiteSpace: "nowrap", minWidth: 120, textAlign: "right" }}>
                  {fmtData(r.Criado_Em)}
                </div>
              </button>

              {expandido && temDiff && (
                <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${T.border}` }}>
                  <div style={{ marginTop: 12 }}>
                    <DiffViewer antes={r.Dados_Antes} depois={r.Dados_Depois} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Paginação */}
      {total > POR_PAGINA && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24 }}>
          <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0}
            style={{ padding: "6px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: pagina === 0 ? T.text3 : T.text1, cursor: pagina === 0 ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13 }}>
            ← Anterior
          </button>
          <span style={{ padding: "6px 12px", fontSize: 13, color: T.text2 }}>
            Página {pagina + 1} de {Math.ceil(total / POR_PAGINA)}
          </span>
          <button onClick={() => setPagina(p => p + 1)} disabled={(pagina + 1) * POR_PAGINA >= total}
            style={{ padding: "6px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: (pagina + 1) * POR_PAGINA >= total ? T.text3 : T.text1, cursor: (pagina + 1) * POR_PAGINA >= total ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13 }}>
            Próxima →
          </button>
        </div>
      )}
    </div>
  )
}
