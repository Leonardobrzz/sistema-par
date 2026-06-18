import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { ShieldCheckIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import api from '../utils/api'

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)

export default function Aprovacao() {
  const navigate = useNavigate()
  const [planejamentos, setPlanejamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [justificativa, setJustificativa] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [aba, setAba] = useState("aprovacao")
  const [baselineInfo, setBaselineInfo] = useState(null)
  const [baselineLoading, setBaselineLoading] = useState(false)
  const [baselineMsg, setBaselineMsg] = useState("")
  const [justBypass, setJustBypass] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get("/planejamento")
      setPlanejamentos(r.data?.planejamentos || r.data || [])
    } catch { toast.error("Erro ao carregar planejamentos") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selected) return
    setBaselineLoading(true)
    api.get(`/planejamento/${selected.ID}`).then(r => {
      setBaselineInfo(r.data?.dadosCompletos?._baseline || null)
    }).catch(() => setBaselineInfo(null)).finally(() => setBaselineLoading(false))
  }, [selected])

  async function acao(tipo) {
    if (!selected) return
    setActionLoading(true)
    try {
      await api.post(`/planejamento/${selected.ID}/${tipo}`, { justificativa })
      setSuccessMsg(tipo === "aprovar" ? "Planejamento aprovado com sucesso!" : "Planejamento rejeitado.")
      toast.success(tipo === "aprovar" ? "Aprovado!" : "Rejeitado")
      load()
      setSelected(null)
    } catch (err) { toast.error(err.response?.data?.error || "Erro") }
    finally { setActionLoading(false) }
  }

  async function travarBaseline() {
    if (!selected) return
    setBaselineLoading(true)
    try {
      const res = await api.post(`/planejamento/${selected.ID}/baseline`, { justificativa: justBypass })
      setBaselineMsg(res.data.message || "Baseline travado!")
      toast.success("Baseline travado!")
      const r2 = await api.get(`/planejamento/${selected.ID}`)
      setBaselineInfo(r2.data?.dadosCompletos?._baseline || null)
    } catch (err) { toast.error(err.response?.data?.error || "Erro ao travar baseline") }
    finally { setBaselineLoading(false) }
  }

  const SETORES_PAR = ['Arquitetura', 'Saneamento', 'Infraestrutura', 'Administrativo']
  const [filtroSetor, setFiltroSetor] = useState("")
  const [filtroBusca, setFiltroBusca] = useState("")

  const planejamentosFiltrados = useMemo(() => planejamentos.filter(p => {
    if (filtroSetor && !(p.Setor || '').toLowerCase().includes(filtroSetor.toLowerCase())) return false
    if (filtroBusca) {
      const b = filtroBusca.toLowerCase()
      if (!(p.Nome_Projeto || '').toLowerCase().includes(b) && !(p.Setor || '').toLowerCase().includes(b)) return false
    }
    return true
  }), [planejamentos, filtroSetor, filtroBusca])

  const pendentes = planejamentosFiltrados.filter(p => p.Status === "Pendente Aprovacao" || p.Status === "Pendente Aprovação")
  const aprovados = planejamentosFiltrados.filter(p => p.Status === "Aprovado")
  const baselineTravado = !!baselineInfo

  let dadosSelected = null
  try { dadosSelected = selected?.Dados_JSON ? JSON.parse(selected.Dados_JSON) : null } catch {}
  const tercPerc = dadosSelected && selected?.Valor_Contrato
    ? (dadosSelected.terceirizados || []).reduce((s, t) => s + parseFloat(t.custo || 0), 0) / parseFloat(selected.Valor_Contrato) * 100
    : 0

  return (
    <div className="space-y-5 fade-in" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="flex items-center gap-3 mb-2">
        <ShieldCheckIcon className="w-6 h-6 text-par-400" />
        <h1 className="page-title">Aprovacoes e Baseline</h1>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {[{ key: "aprovacao", label: "Aprovacao", icon: ShieldCheckIcon }, { key: "baseline", label: "Baseline PAR", icon: LockClosedIcon }].map(tab => (
          <button key={tab.key} onClick={() => setAba(tab.key)} style={{
            padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
            background: aba === tab.key ? "#fff" : "transparent",
            color: aba === tab.key ? "#0F172A" : "#64748B",
            boxShadow: aba === tab.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.18s", display: "flex", alignItems: "center", gap: 6,
          }}>
            <tab.icon style={{ width: 15, height: 15 }} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {SETORES_PAR.map(s => (
          <button key={s} onClick={() => setFiltroSetor(filtroSetor === s ? "" : s)}
            style={{ padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${filtroSetor === s ? "#818cf8" : "rgba(255,255,255,0.1)"}`, background: filtroSetor === s ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.04)", color: filtroSetor === s ? "#a5b4fc" : "#94a3b8", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            {s}
          </button>
        ))}
        <input value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} placeholder="Buscar projeto..."
          style={{ padding: "6px 14px", borderRadius: 20, border: "1.5px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 12, fontFamily: "inherit", outline: "none", width: 180 }} />
        {(filtroSetor || filtroBusca) && (
          <button onClick={() => { setFiltroSetor(""); setFiltroBusca("") }}
            style={{ padding: "5px 14px", borderRadius: 20, border: "1.5px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#f87171", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            Limpar
          </button>
        )}
      </div>

      {aba === "aprovacao" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 20 }}>
          {/* Lista pendentes */}
          <div className="card-glass">
            <div style={{ padding: "18px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: 700, fontSize: 14, color: "#94a3b8" }}>
              Pendentes de Aprovacao ({pendentes.length})
            </div>
            {loading ? <div style={{ padding: 32, textAlign: "center", color: "#64748B" }}>Carregando...</div> : pendentes.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#64748B", fontSize: 13 }}>Nenhum planejamento pendente</div>
            ) : (
              <div style={{ padding: "8px 12px" }}>
                {pendentes.map(p => (
                  <div key={p.ID} onClick={() => { setSelected(p); setSuccessMsg(""); setJustificativa("") }}
                    style={{ padding: "12px 14px", borderRadius: 10, marginBottom: 6, cursor: "pointer",
                      background: selected?.ID === p.ID ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${selected?.ID === p.ID ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)"}`,
                      transition: "all 0.18s" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>{p.Nome_Projeto || p.ID_Projeto}</div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{p.Resp_Planejamento} · {p.Setor}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", marginTop: 4 }}>{fmt(p.Valor_Contrato)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detalhe */}
          <div className="card-glass" style={{ padding: "22px 24px" }}>
            {!selected ? (
              <div style={{ textAlign: "center", padding: 40, color: "#64748B" }}>
                <ShieldCheckIcon style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.3 }} />
                <div style={{ fontWeight: 600 }}>Selecione um planejamento para revisar</div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0", marginBottom: 4 }}>{selected.Nome_Projeto || selected.ID_Projeto}</div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748B", flexWrap: "wrap" }}>
                    <span>Valor: <strong style={{ color: "#a78bfa" }}>{fmt(selected.Valor_Contrato)}</strong></span>
                    <span>OS: <strong>{selected.Nr_Contrato_OS || "—"}</strong></span>
                    <span>Resp.: <strong>{selected.Resp_Planejamento}</strong></span>
                  </div>
                </div>

                {successMsg && (
                  <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, background: "#F0FDF4", border: "1px solid #86EFAC", color: "#15803D", fontWeight: 600, fontSize: 13 }}>{successMsg}</div>
                )}

                {tercPerc > 25 && (
                  <div style={{ padding: "12px 16px", borderRadius: 10, marginBottom: 16, background: "#FFF7ED", border: "1.5px solid #FED7AA" }}>
                    <div style={{ fontWeight: 700, color: "#9A3412", fontSize: 13 }}>Terceirizados acima de 25% — Autorizacao de Diretoria Necessaria</div>
                    <div style={{ fontSize: 12, color: "#C2410C", marginTop: 4 }}>Percentual atual: {tercPerc.toFixed(1)}%</div>
                    <textarea value={justBypass} onChange={e => setJustBypass(e.target.value)}
                      placeholder="Justificativa obrigatoria para aprovar com bypass..." rows={3}
                      style={{ width: "100%", marginTop: 10, padding: "8px 12px", borderRadius: 8, border: "1px solid #FED7AA", background: "#FFFBF5", fontSize: 12, fontFamily: "inherit", resize: "none", outline: "none" }} />
                  </div>
                )}

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontWeight: 600, fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 6 }}>Justificativa (opcional)</label>
                  <textarea value={justificativa} onChange={e => setJustificativa(e.target.value)} rows={3}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none" }} />
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={() => acao("rejeitar")} disabled={actionLoading}
                    style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #EF4444", background: "transparent", color: "#EF4444", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    Rejeitar
                  </button>
                  <button onClick={() => acao("aprovar")} disabled={actionLoading || (tercPerc > 25 && !justBypass)}
                    style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#4F46E5,#7C3AED)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    {actionLoading ? "Processando..." : "Aprovar Planejamento"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {aba === "baseline" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 20 }}>
          <div className="card-glass">
            <div style={{ padding: "18px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: 700, fontSize: 14, color: "#94a3b8" }}>
              Planejamentos Aprovados ({aprovados.length})
            </div>
            {aprovados.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#64748B", fontSize: 13 }}>Nenhum planejamento aprovado</div>
            ) : (
              <div style={{ padding: "8px 12px" }}>
                {aprovados.map(p => (
                  <div key={p.ID} onClick={() => { setSelected(p); setBaselineMsg("") }}
                    style={{ padding: "12px 14px", borderRadius: 10, marginBottom: 6, cursor: "pointer",
                      background: selected?.ID === p.ID ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${selected?.ID === p.ID ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)"}`,
                      transition: "all 0.18s" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>{p.Nome_Projeto || p.ID_Projeto}</div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{p.Setor}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", marginTop: 4 }}>{fmt(p.Valor_Contrato)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-glass" style={{ padding: "22px 24px" }}>
            {!selected ? (
              <div style={{ textAlign: "center", padding: 40, color: "#64748B" }}>
                <LockClosedIcon style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.3 }} />
                <div style={{ fontWeight: 600 }}>Selecione um planejamento aprovado</div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0", marginBottom: 4 }}>{selected.Nome_Projeto}</div>
                  {baselineLoading ? <div style={{ color: "#64748B", fontSize: 13 }}>Carregando baseline...</div> : baselineInfo ? (
                    <div style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", marginTop: 12 }}>
                      <div style={{ fontWeight: 700, color: "#a78bfa", fontSize: 13, marginBottom: 8 }}>Baseline v{baselineInfo.versao} — travado</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>Travado por: <strong style={{ color: "#e2e8f0" }}>{baselineInfo.travadoPor}</strong></div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Data: <strong style={{ color: "#e2e8f0" }}>{baselineInfo.dataTravamento ? new Date(baselineInfo.dataTravamento).toLocaleDateString("pt-BR") : "—"}</strong></div>
                    </div>
                  ) : (
                    <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", marginTop: 12, fontSize: 13, color: "#D97706" }}>
                      Nenhum baseline travado para este planejamento.
                    </div>
                  )}
                </div>

                {baselineTravado && (
                  <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", fontSize: 12, color: "#D97706" }}>
                    Ja existe um baseline. Travar novamente criara a Versao {(baselineInfo?.versao || 1) + 1}, arquivando a versao atual.
                  </div>
                )}

                {baselineMsg && (
                  <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, background: "#F0FDF4", border: "1px solid #86EFAC", color: "#15803D", fontWeight: 600, fontSize: 13 }}>{baselineMsg}</div>
                )}

                <button onClick={travarBaseline} disabled={baselineLoading}
                  style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#4F46E5,#7C3AED)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <LockClosedIcon style={{ width: 16, height: 16 }} />
                  {baselineTravado ? `Travar Nova Versao (v${(baselineInfo?.versao || 1) + 1})` : "Travar Baseline (Versao 1)"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
