import { useState, useEffect } from "react"
import { Link2, Check, Search, RefreshCw, X, AlertCircle, Zap, Plus, Database, Building2 } from "lucide-react"
import api from "../utils/api"
import { useTheme } from "../contexts/ThemeContext"
import toast from "react-hot-toast"

const fmtBRL = v => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export default function VincularOS() {
  const { dark } = useTheme()
  const [modo, setModo]             = useState("os") // "os" | "cliente"
  const [projetos, setProjetos]     = useState([])
  const [osOpp, setOsOpp]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [buscaProjeto, setBuscaProjeto] = useState("")
  const [buscaOS, setBuscaOS]       = useState("")
  const [selecionado, setSelecionado] = useState(null) // id do planejamento selecionado
  const [salvando, setSalvando]     = useState(false)

  // ─── Estado do modo "Cliente" (vínculo ID_OPP_Cliente em Projetos_Contratos) ───
  const [projetosCliente, setProjetosCliente]   = useState([])
  const [clientesOpp, setClientesOpp]           = useState([])
  const [loadingCliente, setLoadingCliente]     = useState(false)
  const [carregouCliente, setCarregouCliente]   = useState(false)
  const [buscaProjetoCliente, setBuscaProjetoCliente] = useState("")
  const [buscaCliente, setBuscaCliente]         = useState("")
  const [selecionadoCliente, setSelecionadoCliente] = useState(null) // idProjeto selecionado

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

  async function carregarClientes() {
    setLoadingCliente(true)
    try {
      const { data } = await api.get("/opp/clientes-para-vincular")
      setProjetosCliente(data.projetos || [])
      setClientesOpp(data.clientes || [])
      setCarregouCliente(true)
    } catch {
      toast.error("Erro ao carregar clientes do OPP")
    }
    setLoadingCliente(false)
  }

  useEffect(() => { carregar() }, [])
  useEffect(() => { if (modo === "cliente" && !carregouCliente) carregarClientes() }, [modo])

  async function vincularCliente(idProjeto, idOppCliente) {
    setSalvando(true)
    try {
      await api.post("/opp/vincular-cliente", { idProjeto, idOppCliente })
      toast.success(idOppCliente ? "Cliente vinculado!" : "Vínculo removido")
      setProjetosCliente(prev => prev.map(p => p.idProjeto === idProjeto ? { ...p, idOppCliente } : p))
    } catch {
      toast.error("Erro ao salvar vínculo")
    }
    setSalvando(false)
  }

  async function toggleCliente(idCliente) {
    if (!selecionadoCliente) return toast.error("Selecione um projeto primeiro")
    const proj = projetosCliente.find(p => p.idProjeto === selecionadoCliente)
    const jaVinculado = String(proj?.idOppCliente || '') === String(idCliente)
    await vincularCliente(selecionadoCliente, jaVinculado ? '' : idCliente)
  }

  async function desvincularCliente(idProjeto) {
    if (!window.confirm("Remover o vínculo de cliente OPP deste projeto?")) return
    await vincularCliente(idProjeto, '')
    if (selecionadoCliente === idProjeto) setSelecionadoCliente(null)
  }

  async function autoVincularClientesTudo() {
    const sugestoes = projetosCliente.filter(p => !p.idOppCliente && p.sugestao)
    if (sugestoes.length === 0) return toast("Nenhuma sugestão automática disponível")
    if (!window.confirm(`Vincular automaticamente ${sugestoes.length} projeto(s) a clientes do OPP com base no nome?\n\nVocê pode revisar e corrigir depois.`)) return
    setSalvando(true)
    try {
      const vinculos = sugestoes.map(p => ({ idProjeto: p.idProjeto, idOppCliente: p.sugestao.idCliente }))
      const { data } = await api.post("/opp/auto-vincular-cliente", { vinculos })
      toast.success(`${data.total} vínculo(s) de cliente aplicados!`)
      await carregarClientes()
    } catch {
      toast.error("Erro no auto-vínculo de cliente")
    }
    setSalvando(false)
  }

  const projetoSel = projetos.find(p => p.id === selecionado)
  // OS já vinculadas ao projeto selecionado (pode ser lista separada por vírgula)
  const osSel = projetoSel ? String(projetoSel.nrOsOpp || '').split(',').map(s => s.trim()).filter(Boolean) : []

  const projetoClienteSel = projetosCliente.find(p => p.idProjeto === selecionadoCliente)

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

  async function corrigirMedicoes() {
    if (!window.confirm("Corrigir automaticamente valores de medição com decimal errado (ex: R$25,02 → R$25.020) e remover OS incorreta do CORES VALE?")) return
    setSalvando(true)
    try {
      const [r1, r2] = await Promise.all([
        api.post("/opp/corrigir-medicoes"),
        api.post("/opp/fix-especificos"),
      ])
      const total = (r1.data.total_medicoes_corrigidas || 0) + (r2.data.resultados?.filter(r => r.de || r.acao).length || 0)
      toast.success(`${total} correção(ões) aplicada(s)!`)
      await carregar()
    } catch {
      toast.error("Erro ao corrigir medições")
    }
    setSalvando(false)
  }

  async function aplicarMapeamentos() {
    if (!window.confirm("Aplicar todos os mapeamentos pré-definidos (OS por nome de projeto)?\n\nIsso sobrescreverá os vínculos atuais dos projetos mapeados.")) return
    setSalvando(true)
    try {
      const { data } = await api.post("/opp/aplicar-mapeamentos")
      toast.success(`${data.total} vínculo(s) aplicados!`)
      await carregar()
    } catch {
      toast.error("Erro ao aplicar mapeamentos")
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

  const projetosClienteFiltrados = projetosCliente.filter(p =>
    !buscaProjetoCliente || p.nome.toLowerCase().includes(buscaProjetoCliente.toLowerCase()) || (p.cliente || "").toLowerCase().includes(buscaProjetoCliente.toLowerCase())
  )
  const semVinculoCliente = projetosClienteFiltrados.filter(p => !p.idOppCliente)
  const comVinculoCliente = projetosClienteFiltrados.filter(p => p.idOppCliente)
  const clientesFiltrados = clientesOpp.filter(c =>
    !buscaCliente || c.nome.toLowerCase().includes(buscaCliente.toLowerCase()) || (c.fantasia || "").toLowerCase().includes(buscaCliente.toLowerCase())
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Link2 size={24} color="#2563EB" />
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Vincular OPP</h1>
            <p style={{ margin: 0, fontSize: 13, color: sub }}>
              {modo === "os"
                ? "Associe cada projeto PAR às OS do OPP (pode ser múltiplas OS por projeto)"
                : "Associe cada projeto PAR ao cliente correspondente no OPP (1 cliente por projeto)"}
            </p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {modo === "os" ? (
              <>
                <button onClick={corrigirMedicoes} disabled={salvando}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#059669", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  <Check size={14} /> Corrigir medições
                </button>
                <button onClick={aplicarMapeamentos} disabled={salvando}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#7C3AED", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  <Database size={14} /> Aplicar mapeamentos
                </button>
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
              </>
            ) : (
              <>
                {projetosCliente.filter(p => !p.idOppCliente && p.sugestao && p.sugestao.score >= 0.75).length > 0 && (
                  <button onClick={autoVincularClientesTudo} disabled={salvando}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#2563EB", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                    <Zap size={14} /> Auto-vincular ({projetosCliente.filter(p => !p.idOppCliente && p.sugestao && p.sugestao.score >= 0.75).length})
                  </button>
                )}
                <button onClick={carregarClientes} disabled={loadingCliente}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: card, border: `1px solid ${brd}`, borderRadius: 8, color: txt, cursor: "pointer", fontSize: 13 }}>
                  <RefreshCw size={14} /> Atualizar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Alternância de modo */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, background: card, border: `1px solid ${brd}`, borderRadius: 10, padding: 4, width: "fit-content" }}>
          <button onClick={() => setModo("os")}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: modo === "os" ? "#2563EB" : "transparent", border: "none", borderRadius: 7, color: modo === "os" ? "#fff" : txt, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            <Link2 size={14} /> Por O.S.
          </button>
          <button onClick={() => setModo("cliente")}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: modo === "cliente" ? "#2563EB" : "transparent", border: "none", borderRadius: 7, color: modo === "cliente" ? "#fff" : txt, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            <Building2 size={14} /> Por Cliente
          </button>
        </div>

        {/* Instrução quando projeto selecionado (modo OS) */}
        {modo === "os" && selecionado && (
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

        {/* Instrução quando projeto selecionado (modo Cliente) */}
        {modo === "cliente" && selecionadoCliente && (
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "10px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertCircle size={16} color="#2563EB" />
              <span style={{ fontSize: 13, color: "#1D4ED8" }}>
                <strong>{projetoClienteSel?.nome}</strong> — clique num cliente à direita para vincular (clique de novo para remover).
              </span>
              <button onClick={() => setSelecionadoCliente(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#2563EB" }}>
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {modo === "os" && (
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
        )}

        {modo === "cliente" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* ─── COLUNA ESQUERDA: Projetos PAR (cliente) ─── */}
          <div>
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${brd}`, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${brd}`, display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Projetos PAR (Aprovados)</h2>
                <span style={{ marginLeft: "auto", fontSize: 12, color: sub }}>{semVinculoCliente.length} sem vínculo · {comVinculoCliente.length} vinculados</span>
              </div>
              <div style={{ padding: "10px 12px", borderBottom: `1px solid ${brd}` }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: sub }} />
                  <input value={buscaProjetoCliente} onChange={e => setBuscaProjetoCliente(e.target.value)}
                    placeholder="Buscar projeto ou cliente..."
                    style={{ width: "100%", padding: "7px 10px 7px 32px", background: bg, border: `1px solid ${brd}`, borderRadius: 7, color: txt, fontSize: 13, boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ maxHeight: 560, overflowY: "auto" }}>
                {loadingCliente ? (
                  <div style={{ padding: 24, textAlign: "center", color: sub }}>Carregando...</div>
                ) : (
                  <>
                    {semVinculoCliente.length > 0 && (
                      <>
                        <div style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#DC2626", background: dark ? "#1a1a2e" : "#FEF2F2", borderBottom: `1px solid ${brd}` }}>
                          SEM VÍNCULO ({semVinculoCliente.length})
                        </div>
                        {semVinculoCliente.map(p => (
                          <ClienteProjetoPAR key={p.idProjeto} p={p} selecionado={selecionadoCliente === p.idProjeto}
                            clientesOpp={clientesOpp}
                            onClick={() => setSelecionadoCliente(selecionadoCliente === p.idProjeto ? null : p.idProjeto)}
                            dark={dark} brd={brd} txt={txt} sub={sub} />
                        ))}
                      </>
                    )}
                    {comVinculoCliente.length > 0 && (
                      <>
                        <div style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#16A34A", background: dark ? "#0f2e1a" : "#F0FDF4", borderBottom: `1px solid ${brd}` }}>
                          VINCULADOS ({comVinculoCliente.length})
                        </div>
                        {comVinculoCliente.map(p => (
                          <ClienteProjetoPAR key={p.idProjeto} p={p} selecionado={selecionadoCliente === p.idProjeto}
                            clientesOpp={clientesOpp}
                            onClick={() => setSelecionadoCliente(selecionadoCliente === p.idProjeto ? null : p.idProjeto)}
                            onDesvincular={() => desvincularCliente(p.idProjeto)}
                            dark={dark} brd={brd} txt={txt} sub={sub} />
                        ))}
                      </>
                    )}
                    {projetosClienteFiltrados.length === 0 && (
                      <div style={{ padding: 24, textAlign: "center", color: sub }}>Nenhum projeto Aprovado encontrado</div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ─── COLUNA DIREITA: Clientes do OPP ─── */}
          <div>
            <div style={{ background: card, borderRadius: 12, border: `1px solid ${brd}`, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${brd}`, display: "flex", alignItems: "center", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Clientes — OPP</h2>
                <span style={{ marginLeft: "auto", fontSize: 12, color: sub }}>{clientesOpp.length} clientes</span>
              </div>
              <div style={{ padding: "10px 12px", borderBottom: `1px solid ${brd}` }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: sub }} />
                  <input value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
                    placeholder="Buscar por nome ou fantasia..."
                    style={{ width: "100%", padding: "7px 10px 7px 32px", background: bg, border: `1px solid ${brd}`, borderRadius: 7, color: txt, fontSize: 13, boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ maxHeight: 560, overflowY: "auto" }}>
                {loadingCliente ? (
                  <div style={{ padding: 24, textAlign: "center", color: sub }}>Carregando...</div>
                ) : clientesFiltrados.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: sub }}>Nenhum cliente encontrado</div>
                ) : clientesFiltrados.map(c => {
                  const vinculadoA = projetosCliente.find(p => String(p.idOppCliente || '') === String(c.idCliente))
                  const estaSel = projetoClienteSel && String(projetoClienteSel.idOppCliente || '') === String(c.idCliente)
                  return (
                    <div key={c.idCliente}
                      onClick={() => !salvando && selecionadoCliente && toggleCliente(c.idCliente)}
                      style={{
                        padding: "11px 16px", borderBottom: `1px solid ${brd}`, display: "flex", alignItems: "center", gap: 12,
                        cursor: selecionadoCliente ? "pointer" : "default",
                        background: estaSel ? (dark ? "#0f2e1a" : "#F0FDF4") : vinculadoA ? (dark ? "#1a2e0f" : "#F7FEF4") : "transparent",
                        outline: estaSel ? `2px solid #16A34A` : "none",
                        transition: "background 0.12s",
                      }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: estaSel ? "#16A34A" : vinculadoA ? "#86EFAC" : "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {estaSel
                          ? <Check size={18} color="#fff" />
                          : <Building2 size={16} color="#fff" />
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.nome}
                        </div>
                        <div style={{ fontSize: 12, color: sub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {[c.fantasia, [c.cidade, c.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </div>
                      {estaSel && <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 700 }}>Vinculado</span>}
                      {!estaSel && vinculadoA && (
                        <span style={{ fontSize: 11, color: "#64748B", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {vinculadoA.nome.split('-').slice(-1)[0]?.trim()}
                        </span>
                      )}
                      {selecionadoCliente && !estaSel && (
                        <Plus size={14} color="#2563EB" style={{ flexShrink: 0 }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
        )}
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

function ClienteProjetoPAR({ p, selecionado, onClick, onDesvincular, clientesOpp, dark, brd, txt, sub }) {
  const clienteVinculado = p.idOppCliente ? clientesOpp.find(c => String(c.idCliente) === String(p.idOppCliente)) : null

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
          {p.idOppCliente ? (
            <>
              <span style={{ background: "#16A34A", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {clienteVinculado?.nome || `Cliente #${p.idOppCliente}`}
              </span>
              {onDesvincular && (
                <button onClick={e => { e.stopPropagation(); onDesvincular() }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", padding: 2 }} title="Remover vínculo">
                  <X size={13} />
                </button>
              )}
            </>
          ) : p.idCentroCusto ? (
            <span style={{ background: "#FEF3C7", color: "#92400E", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }} title="Já tem centro de custo vinculado — funciona, mas sem cliente OPP o motor perde a 2ª via de casamento">
              Só centro de custo
            </span>
          ) : (
            <span style={{ background: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Sem vínculo</span>
          )}
        </div>
      </div>
      {p.sugestao && !p.idOppCliente && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#D97706" }}>
          Sugestão: {p.sugestao.nome} ({Math.round(p.sugestao.score * 100)}% confiança)
        </div>
      )}
    </div>
  )
}
