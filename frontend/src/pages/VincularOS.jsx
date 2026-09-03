import { useState, useEffect } from "react"
import { Link2, Check, Search, RefreshCw, X, AlertCircle, Zap, Plus } from "lucide-react"
import api from "../utils/api"
import { useTheme } from "../contexts/ThemeContext"
import toast from "react-hot-toast"

const fmtBRL = v => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export default function VincularOS() {
  const { dark } = useTheme()
  const [projetos, setProjetos]     = useState([])
  const [osOpp, setOsOpp]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [buscaProjeto, setBuscaProjeto] = useState("")
  const [buscaOS, setBuscaOS]       = useState("")
  const [selecionado, setSelecionado] = useState(null) // id do planejamento selecionado
  const [salvando, setSalvando]     = useState(false)

  async function carregar() {
    setLoading(true)
    try {
      const { data } = await api.get("/opp/os-para-vincular")
      setProjetos(data.projetos || [])
      setOsOpp(data.osOpp || [])
    } catch {
      toast.error("Erro ao carregar dados")
    }
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const projetoSel = projetos.find(p => p.id === selecionado)
  // OS já vinculadas ao projeto selecionado (pode ser lista separada por vírgula)
  const osSel = projetoSel ? String(projetoSel.nrOsOpp || '').split(',').map(s => s.trim()).filter(Boolean) : []

  async function toggleOS(osNum) {
    if (!selecionado) return toast.error("Selecione um projeto primeiro")
    const proj = projetos.find(p => p.id === selecionado)
    const atual = String(proj?.nrOsOpp || '').split(',').map(s => s.trim()).filter(Boolean)
    let nova
    if (atual.includes(osNum)) {
      nova = atual.filter(n => n !== osNum) // remover
    } else {
      nova = [...atual, osNum] // adicionar
    }
    setSalvando(true)
    try {
      await api.post("/opp/vincular-os", { idPlanejamento: selecionado, nrOsOpp: nova.join(',') })
      toast.success(nova.includes(osNum) ? `OS ${osNum} removida` : `OS ${osNum} adicionada!`)
      // Atualiza localmente sem recarregar tudo
      setProjetos(prev => prev.map(p => p.id === selecionado ? { ...p, nrOsOpp: nova.join(',') } : p))
    } catch {
      toast.error("Erro ao salvar")
    }
    setSalvando(false)
  }

  async function autoVincularTudo() {
    const sugestoes = projetos.filter(p => !p.nrOsOpp && p.sugestao)
    if (sugestoes.length === 0) return toast("Nenhuma sugestão automática disponível")
    if (!window.confirm(`Vincular automaticamente ${sugestoes.length} projeto(s) com base no nome e valor do contrato?\n\nVocê pode revisar e corrigir depois.`)) return
    setSalvando(true)
    try {
      const vinculos = sugestoes.map(p => ({ idPlanejamento: p.id, nrOsOpp: p.sugestao.os }))
      const { data } = await api.post("/opp/auto-vincular", { vinculos })
      toast.success(`${data.total} vínculo(s) aplicados!`)
      await carregar()
    } catch {
      toast.error("Erro no auto-vínculo")
    }
    setSalvando(false)
  }

  async function desvincularTudo(idPlanejamento) {
    if (!window.confirm("Remover todos os vínculos deste projeto?")) return
    setSalvando(true)
    try {
      await api.post("/opp/vincular-os", { idPlanejamento, nrOsOpp: "" })
      toast.success("Vínculos removidos")
      setProjetos(prev => prev.map(p => p.id === idPlanejamento ? { ...p, nrOsOpp: '' } : p))
      if (selecionado === idPlanejamento) setSelecionado(null)
    } catch {
      toast.error("Erro ao remover")
    }
    setSalvando(false)
  }

  const bg   = dark ? "#0F172A" : "#F8FAFC"
  const card = dark ? "#1E293B" : "#FFFFFF"
  const brd  = dark ? "#334155" : "#E2E8F0"
  const txt  = dark ? "#F1F5F9" : "#1E293B"
  const sub  = dark ? "#94A3B8" : "#64748B"

  const projetosFiltrados = projetos.filter(p =>
    !buscaProjeto || p.nome.toLowerCase().includes(buscaProjeto.toLowerCase()) || p.cliente.toLowerCase().includes(buscaProjeto.toLowerCase())
  )
  const semVinculo = projetosFiltrados.filter(p => !p.nrOsOpp)
  const comVinculo = projetosFiltrados.filter(p => p.nrOsOpp)
  const osFiltradas = osOpp.filter(o =>
    !buscaOS || o.os.includes(buscaOS) || (o.cliente || "").toLowerCase().includes(buscaOS.toLowerCase())
  )

  // Total recebido+pendente das OS selecionadas para o projeto ativo
  const totalOSSel = osSel.reduce((s, n) => {
    const os = osOpp.find(o => o.os === n)
    return s + (os ? os.totalRecebido + os.totalPendente : 0)
  }, 0)

  return (
    <div style={{ minHeight: "100vh", background: bg, padding: "24px", color: txt }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <Link2 size={24} color="#2563EB" />
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Vincular OS OPP</h1>
            <p style={{ margin: 0, fontSize: 13, color: sub }}>
              Associe cada projeto PAR às OS do OPP (pode ser múltiplas OS por projeto)
            </p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {projetos.filter(p => !p.nrOsOpp && p.sugestao).length > 0 && (
              <button onClick={autoVincularTudo} disabled={salvando}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#2563EB", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                <Zap size={14} /> Auto-vincular ({projetos.filter(p => !p.nrOsOpp && p.sugestao).length})
              </button>
            )}
            <button onClick={carregar} disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: card, border: `1px solid ${brd}`, borderRadius: 8, color: txt, cursor: "pointer", fontSize: 13 }}>
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>
        </div>

        {/* Instrução quando projeto selecionado */}
        {selecionado && (
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "10px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertCircle size={16} color="#2563EB" />
              <span style={{ fontSize: 13, color: "#1D4ED8" }}>
                <strong>{projetoSel?.nome}</strong> — clique nas OS à direita para adicionar/remover. OS vinculadas: {osSel.length > 0 ? osSel.map(n => `#${n}`).join(', ') : 'nenhuma'}
              </span>
              {osSel.length > 0 && (
                <span style={{ fontSize: 13, color: "#16A34A", marginLeft: 8 }}>
                  Total: {fmtBRL(totalOSSel)}
                </span>
              )}
              <button onClick={() => setSelecionado(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#2563EB" }}>
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* ─── COLUNA ESQUERDA: Projetos PAR ─── */}
          <div>
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${brd}`, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${brd}`, display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Projetos PAR</h2>
                <span style={{ marginLeft: "auto", fontSize: 12, color: sub }}>{semVinculo.length} sem vínculo · {comVinculo.length} vinculados</span>
              </div>
              <div style={{ padding: "10px 12px", borderBottom: `1px solid ${brd}` }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: sub }} />
                  <input value={buscaProjeto} onChange={e => setBuscaProjeto(e.target.value)}
                    placeholder="Buscar projeto ou cliente..."
                    style={{ width: "100%", padding: "7px 10px 7px 32px", background: bg, border: `1px solid ${brd}`, borderRadius: 7, color: txt, fontSize: 13, boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ maxHeight: 560, overflowY: "auto" }}>
                {loading ? (
                  <div style={{ padding: 24, textAlign: "center", color: sub }}>Carregando...</div>
                ) : (
                  <>
                    {semVinculo.length > 0 && (
                      <>
                        <div style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#DC2626", background: dark ? "#1a1a2e" : "#FEF2F2", borderBottom: `1px solid ${brd}` }}>
                          SEM VÍNCULO ({semVinculo.length})
                        </div>
                        {semVinculo.map(p => (
                          <ProjetoPAR key={p.id} p={p} selecionado={selecionado === p.id}
                            osOpp={osOpp}
                            onClick={() => setSelecionado(selecionado === p.id ? null : p.id)}
                            dark={dark} brd={brd} txt={txt} sub={sub} />
                        ))}
                      </>
                    )}
                    {comVinculo.length > 0 && (
                      <>
                        <div style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#16A34A", background: dark ? "#0f2e1a" : "#F0FDF4", borderBottom: `1px solid ${brd}` }}>
                          VINCULADOS ({comVinculo.length})
                        </div>
                        {comVinculo.map(p => (
                          <ProjetoPAR key={p.id} p={p} selecionado={selecionado === p.id}
                            osOpp={osOpp}
                            onClick={() => setSelecionado(selecionado === p.id ? null : p.id)}
                            onDesvincular={() => desvincularTudo(p.id)}
                            dark={dark} brd={brd} txt={txt} sub={sub} />
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ─── COLUNA DIREITA: OS do OPP ─── */}
          <div>
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${brd}`, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${brd}`, display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Ordens de Serviço — OPP</h2>
                <span style={{ marginLeft: "auto", fontSize: 12, color: sub }}>{osOpp.length} OS</span>
              </div>
              <div style={{ padding: "10px 12px", borderBottom: `1px solid ${brd}` }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: sub }} />
                  <input value={buscaOS} onChange={e => setBuscaOS(e.target.value)}
                    placeholder="Buscar por nº OS ou cliente..."
                    style={{ width: "100%", padding: "7px 10px 7px 32px", background: bg, border: `1px solid ${brd}`, borderRadius: 7, color: txt, fontSize: 13, boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ maxHeight: 560, overflowY: "auto" }}>
                {loading ? (
                  <div style={{ padding: 24, textAlign: "center", color: sub }}>Carregando...</div>
                ) : osFiltradas.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: sub }}>Nenhuma OS encontrada</div>
                ) : osFiltradas.map(o => {
                  const vinculadaA = projetos.find(p => String(p.nrOsOpp || '').split(',').map(s => s.trim()).includes(o.os))
                  const estaNoSel  = osSel.includes(o.os)
                  return (
                    <div key={o.os}
                      onClick={() => !salvando && selecionado && toggleOS(o.os)}
                      style={{
                        padding: "11px 16px", borderBottom: `1px solid ${brd}`, display: "flex", alignItems: "center", gap: 12,
                        cursor: selecionado ? "pointer" : "default",
                        background: estaNoSel ? (dark ? "#0f2e1a" : "#F0FDF4") : vinculadaA ? (dark ? "#1a2e0f" : "#F7FEF4") : "transparent",
                        outline: estaNoSel ? `2px solid #16A34A` : "none",
                        transition: "background 0.12s",
                      }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: estaNoSel ? "#16A34A" : vinculadaA ? "#86EFAC" : "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {estaNoSel
                          ? <Check size={18} color="#fff" />
                          : <span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>#{o.os}</span>
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {o.cliente || "Cliente não informado"}
                        </div>
                        <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>
                          {o.totalRecebido > 0 && <span style={{ color: "#16A34A" }}>✓ {fmtBRL(o.totalRecebido)} rec. </span>}
                          {o.totalPendente > 0 && <span>⏳ {fmtBRL(o.totalPendente)} pend.</span>}
                        </div>
                      </div>
                      {estaNoSel && <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 700 }}>Vinculada</span>}
                      {!estaNoSel && vinculadaA && (
                        <span style={{ fontSize: 11, color: "#64748B", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {vinculadaA.nome.split('-').slice(-1)[0]?.trim()}
                        </span>
                      )}
                      {selecionado && !estaNoSel && (
                        <Plus size={14} color="#2563EB" style={{ flexShrink: 0 }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProjetoPAR({ p, selecionado, onClick, onDesvincular, osOpp, dark, brd, txt, sub }) {
  const osNums = String(p.nrOsOpp || '').split(',').map(s => s.trim()).filter(Boolean)
  const totalRec = osNums.reduce((s, n) => {
    const os = osOpp.find(o => o.os === n)
    return s + (os ? os.totalRecebido : 0)
  }, 0)
  const totalPend = osNums.reduce((s, n) => {
    const os = osOpp.find(o => o.os === n)
    return s + (os ? os.totalPendente : 0)
  }, 0)
  const fmtBRL = v => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  return (
    <div onClick={onClick}
      style={{
        padding: "12px 16px", borderBottom: `1px solid ${brd}`, cursor: "pointer",
        background: selecionado ? (dark ? "#1e3a5f" : "#EFF6FF") : "transparent",
        transition: "background 0.15s",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</div>
          <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>{p.cliente} · {p.setor}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {osNums.length > 0 ? (
            <>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 140 }}>
                {osNums.map(n => (
                  <span key={n} style={{ background: "#16A34A", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 20 }}>#{n}</span>
                ))}
              </div>
              {onDesvincular && (
                <button onClick={e => { e.stopPropagation(); onDesvincular() }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", padding: 2 }} title="Remover vínculos">
                  <X size={13} />
                </button>
              )}
            </>
          ) : (
            <span style={{ background: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Sem OS</span>
          )}
        </div>
      </div>
      {osNums.length > 0 && (totalRec > 0 || totalPend > 0) && (
        <div style={{ fontSize: 11, color: sub, marginTop: 4, paddingLeft: 2 }}>
          {totalRec > 0 && <span style={{ color: "#16A34A" }}>Recebido: {fmtBRL(totalRec)} </span>}
          {totalPend > 0 && <span>Pendente: {fmtBRL(totalPend)}</span>}
        </div>
      )}
      {p.sugestao && osNums.length === 0 && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#D97706" }}>
          Sugestão: OS #{p.sugestao.os} — {p.sugestao.cliente}
        </div>
      )}
    </div>
  )
}
