import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import api from "../utils/api"

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)

const STATUS_COLOR = {
  "Em Andamento":           { bg: "#DCFCE7", color: "#15803D" },
  "Em Andamento (Atrasado)":{ bg: "#FEE2E2", color: "#DC2626" },
  "A Planejar":             { bg: "#FEF3C7", color: "#D97706" },
  "Paralisado":             { bg: "#F1F5F9", color: "#64748B" },
  "Aguardando Aprovação":   { bg: "#EFF6FF", color: "#2563EB" },
  "Aguardando Cliente":     { bg: "#FDF4FF", color: "#7E22CE" },
}

const PROBLEMA_COLOR = {
  campo:       { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  planejamento:{ bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
  medicao:     { bg: "#EFF6FF", color: "#1E40AF", border: "#BFDBFE" },
  horas:       { bg: "#F0FDF4", color: "#166534", border: "#86EFAC" },
}

function Badge({ label, type = "campo" }) {
  const c = PROBLEMA_COLOR[type]
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: "nowrap" }}>
      {label}
    </span>
  )
}

function KpiCard({ label, value, color = "#DC2626", bg = "#FEF2F2", border = "#FECACA" }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "16px 20px", border: `1px solid ${border}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
    </div>
  )
}

const FILTROS_TIPO = ["Todos", "Campo Vazio", "Sem Planejamento", "Medição sem O.C.", "Sem Data Entrega"]

export default function ChecklistIntegridade() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState("Todos")
  const [busca, setBusca] = useState("")

  useEffect(() => {
    setLoading(true)
    api.get("/checklist")
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const projetosFiltrados = useMemo(() => {
    if (!data?.projetos) return []
    return data.projetos.filter(p => {
      if (busca) {
        const q = busca.toLowerCase()
        if (!(p.nome || "").toLowerCase().includes(q) && !(p.cliente || "").toLowerCase().includes(q)) return false
      }
      if (filtro === "Campo Vazio" && p.camposFaltando.length === 0) return false
      if (filtro === "Sem Planejamento" && !p.problemasPlanejamento.some(x => x.includes("Sem planejamento"))) return false
      if (filtro === "Medição sem O.C." && p.medsSemOC === 0) return false
      if (filtro === "Sem Data Entrega" && !p.camposFaltando.includes("Data de Entrega")) return false
      return true
    })
  }, [data, filtro, busca])

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Checklist de Integridade</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>
          Projetos ativos com campos faltando, planejamento incompleto ou medições sem O.C. — corrija antes de avançar no fluxo PAR.
        </p>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 80, color: "#94A3B8", fontSize: 14 }}>Analisando projetos...</div>
      )}

      {!loading && data && (
        <>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
            <KpiCard label="Projetos c/ Problemas" value={data.stats.total} color="#DC2626" bg="#FEF2F2" border="#FECACA" />
            <KpiCard label="Sem Setor" value={data.stats.semSetor} color="#D97706" bg="#FFFBEB" border="#FDE68A" />
            <KpiCard label="Sem Planejamento" value={data.stats.semPlanejamento} color="#DC2626" bg="#FEF2F2" border="#FECACA" />
            <KpiCard label="Medição sem O.C." value={data.stats.medsSemOC} color="#2563EB" bg="#EFF6FF" border="#BFDBFE" />
            <KpiCard label="Sem Data Entrega" value={data.stats.semDataEntrega} color="#7E22CE" bg="#FDF4FF" border="#E9D5FF" />
          </div>

          {data.stats.total === 0 ? (
            <div style={{ textAlign: "center", padding: 80, background: "#F0FDF4", borderRadius: 16, border: "2px solid #86EFAC" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#15803D" }}>Todos os projetos estão íntegros!</div>
              <div style={{ fontSize: 13, color: "#64748B", marginTop: 6 }}>Nenhum campo crítico faltando nos projetos ativos.</div>
            </div>
          ) : (
            <>
              {/* Filtros */}
              <div style={{ background: "#fff", borderRadius: 12, padding: "14px 18px", border: "1px solid #E2E8F0", marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {FILTROS_TIPO.map(f => (
                  <button key={f} onClick={() => setFiltro(f)} style={{
                    padding: "5px 14px", borderRadius: 8, border: `1.5px solid ${filtro === f ? "#7C3AED" : "#E2E8F0"}`,
                    background: filtro === f ? "#EDE9FE" : "#F8FAFC",
                    color: filtro === f ? "#7C3AED" : "#64748B",
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}>{f}</button>
                ))}
                <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar projeto ou cliente..."
                    style={{ width: "100%", padding: "6px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#F8FAFC", color: "#0F172A", boxSizing: "border-box" }} />
                </div>
                <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>{projetosFiltrados.length} de {data.stats.total}</span>
              </div>

              {/* Tabela */}
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC" }}>
                        {["Projeto", "Cliente", "Setor", "Status", "Valor", "Problemas Identificados", "Ações"].map(h => (
                          <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {projetosFiltrados.length === 0 ? (
                        <tr><td colSpan={7} style={{ padding: "48px 0", textAlign: "center", color: "#94A3B8" }}>Nenhum projeto encontrado com este filtro.</td></tr>
                      ) : projetosFiltrados.map((p, i) => {
                        const sc = STATUS_COLOR[p.status] || { bg: "#F1F5F9", color: "#64748B" }
                        return (
                          <tr key={p.id} style={{ borderTop: "1px solid #F1F5F9", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                            {/* Projeto */}
                            <td style={{ padding: "12px 16px", maxWidth: 220 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</div>
                              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{p.id}</div>
                            </td>
                            {/* Cliente */}
                            <td style={{ padding: "12px 16px", fontSize: 13, color: "#475569", whiteSpace: "nowrap" }}>{p.cliente}</td>
                            {/* Setor */}
                            <td style={{ padding: "12px 16px", fontSize: 12, color: p.camposFaltando.includes("Setor") ? "#DC2626" : "#475569", fontWeight: p.camposFaltando.includes("Setor") ? 700 : 400 }}>
                              {p.setor === "—" ? <span style={{ color: "#DC2626" }}>⚠ Sem setor</span> : p.setor}
                            </td>
                            {/* Status */}
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: sc.bg, color: sc.color, whiteSpace: "nowrap" }}>{p.status}</span>
                            </td>
                            {/* Valor */}
                            <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: p.valorGlobal === 0 ? "#DC2626" : "#0F172A", whiteSpace: "nowrap" }}>
                              {p.valorGlobal === 0 ? <span style={{ color: "#DC2626" }}>⚠ Sem valor</span> : fmt(p.valorGlobal)}
                            </td>
                            {/* Problemas */}
                            <td style={{ padding: "12px 16px" }}>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 420 }}>
                                {p.camposFaltando.map(c => <Badge key={c} label={`Campo: ${c}`} type="campo" />)}
                                {p.problemasPlanejamento.map(c => <Badge key={c} label={c} type="planejamento" />)}
                                {p.medsSemOC > 0 && <Badge label={`${p.medsSemOC} medição(ões) sem O.C.`} type="medicao" />}
                                {p.horasSemProfissional > 0 && <Badge label={`${p.horasSemProfissional} hora(s) sem profissional`} type="horas" />}
                              </div>
                            </td>
                            {/* Ações */}
                            <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  onClick={() => navigate(`/planejamento/${p.id}`)}
                                  style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#EEF2FF", color: "#4338CA", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                  Planejamento
                                </button>
                                {p.linkClickUp && (
                                  <a href={p.linkClickUp} target="_blank" rel="noreferrer"
                                    style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#F0FDF4", color: "#15803D", fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "none" }}>
                                    ClickUp
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Legenda */}
              <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700 }}>LEGENDA:</span>
                {[["campo", "Campo Vazio"], ["planejamento", "Problema de Planejamento"], ["medicao", "Medição sem O.C."], ["horas", "Hora sem Profissional"]].map(([type, label]) => {
                  const c = PROBLEMA_COLOR[type]
                  return <span key={type} style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{label}</span>
                })}
              </div>
            </>
          )}
        </>
      )}

      {!loading && !data && (
        <div style={{ textAlign: "center", padding: 60, color: "#DC2626" }}>Erro ao carregar checklist. Verifique a conexão com o backend.</div>
      )}
    </div>
  )
}
