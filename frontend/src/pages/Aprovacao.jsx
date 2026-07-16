import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ShieldCheckIcon, LockClosedIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline'
import api from '../utils/api'
import { useTheme } from '../contexts/ThemeContext'

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)
const fmtCur = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const parseBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0

function gerarPDFBaseline(b, nomeProjeto) {
  const linhas = (arr, fn) => arr.map(fn).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Baseline ${b.versaoLabel}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #0F172A; padding: 32px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .sub { color: #64748B; font-size: 11px; margin-bottom: 24px; }
    h2 { font-size: 11px; font-weight: 700; color: #7C3AED; text-transform: uppercase; letter-spacing: 0.08em; margin: 18px 0 8px; border-bottom: 1px solid #E2E8F0; padding-bottom: 4px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }
    .card { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 10px; }
    .card-label { font-size: 9px; color: #94A3B8; font-weight: 700; text-transform: uppercase; }
    .card-val { font-size: 13px; font-weight: 800; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th { background: #F1F5F9; font-size: 10px; text-align: left; padding: 6px 8px; font-weight: 700; color: #64748B; }
    td { padding: 6px 8px; font-size: 11px; border-bottom: 1px solid #F1F5F9; }
    .right { text-align: right; }
    .total { font-weight: 800; background: #F8FAFC; }
  </style></head><body>
  <h1>📋 ${b.versaoLabel || 'Baseline'} — ${nomeProjeto || ''}</h1>
  <div class="sub">Travado em ${b.travadoEm ? new Date(b.travadoEm).toLocaleString('pt-BR') : '—'} por ${b.travadoPor || '—'}</div>

  <h2>Financeiro</h2>
  <div class="grid">
    <div class="card"><div class="card-label">Valor do Contrato</div><div class="card-val">${fmtCur(b.valorContrato)}</div></div>
    <div class="card"><div class="card-label">Impostos</div><div class="card-val">${b.impostosPerc || 0}%</div></div>
    <div class="card"><div class="card-label">Taxa Adm</div><div class="card-val">${b.taxaAdmPerc || 0}%</div></div>
    <div class="card"><div class="card-label">Comissão</div><div class="card-val">${b.comissaoPerc || 7.5}%</div></div>
    <div class="card"><div class="card-label">Receita Líquida</div><div class="card-val">${fmtCur(b.valorContrato * (1 - (b.impostosPerc || 0) / 100 - (b.taxaAdmPerc || 0) / 100 - (b.comissaoPerc || 7.5) / 100))}</div></div>
  </div>

  <h2>Datas Planejadas</h2>
  <div class="grid">
    <div class="card"><div class="card-label">Início OS</div><div class="card-val">${b.dataInicioOS ? new Date(b.dataInicioOS).toLocaleDateString('pt-BR') : '—'}</div></div>
    <div class="card"><div class="card-label">Entrega Contrato</div><div class="card-val">${b.dataEntregaContrato ? new Date(b.dataEntregaContrato).toLocaleDateString('pt-BR') : '—'}</div></div>
    <div class="card"><div class="card-label">Entrega Planejada</div><div class="card-val">${b.dataEntregaPlanejada ? new Date(b.dataEntregaPlanejada).toLocaleDateString('pt-BR') : '—'}</div></div>
  </div>

  ${(b.horasPorColaborador || []).length > 0 ? `
  <h2>Equipe Interna — ${b.totalHorasEstimadas || 0}h estimadas</h2>
  <table><tr><th>Colaborador</th><th class="right">Horas</th><th class="right">R$/h</th><th class="right">Custo</th></tr>
  ${linhas(b.horasPorColaborador, e => `<tr><td>${e.colaborador}</td><td class="right">${e.horasEstimadas}h</td><td class="right">${fmtCur(e.mediaHora)}</td><td class="right">${fmtCur(e.custoEstimado)}</td></tr>`)}
  <tr class="total"><td colspan="3">Total</td><td class="right">${fmtCur(b.totalCustoEquipe)}</td></tr>
  </table>` : ''}

  ${(b.terceirizados || []).length > 0 ? `
  <h2>Serviços Terceirizados</h2>
  <table><tr><th>Descrição</th><th>Fornecedor</th><th class="right">Valor</th></tr>
  ${linhas(b.terceirizados, t => `<tr><td>${t.descricao}</td><td>${t.fornecedor || '—'}</td><td class="right">${fmtCur(t.custo)}</td></tr>`)}
  <tr class="total"><td colspan="2">Total</td><td class="right">${fmtCur(b.terceirizados.reduce((s, t) => s + t.custo, 0))}</td></tr>
  </table>` : ''}

  ${(b.despesas || []).length > 0 ? `
  <h2>Despesas Gerais</h2>
  <table><tr><th>Descrição</th><th class="right">Valor</th></tr>
  ${linhas(b.despesas, d => `<tr><td>${d.descricao}</td><td class="right">${fmtCur(d.valor)}</td></tr>`)}
  <tr class="total"><td>Total</td><td class="right">${fmtCur(b.despesas.reduce((s, d) => s + d.valor, 0))}</td></tr>
  </table>` : ''}

  ${(b.medicoes || []).length > 0 ? `
  <h2>Medições Planejadas</h2>
  <table><tr><th>Etapa</th><th class="right">%</th><th class="right">Valor</th><th>Previsão</th></tr>
  ${linhas(b.medicoes, m => `<tr><td>${m.etapa}</td><td class="right">${m.percentual}%</td><td class="right">${fmtCur(m.valor)}</td><td>${m.dataPrevisao ? new Date(m.dataPrevisao).toLocaleDateString('pt-BR') : '—'}</td></tr>`)}
  </table>` : ''}

  </body></html>`

  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

export default function Aprovacao() {
  const { isDark } = useTheme()
  const T = {
    bg:      isDark ? '#0F172A' : '#F8FAFC',
    card:    isDark ? '#1E293B' : '#ffffff',
    cardAlt: isDark ? '#162032' : '#F8FAFC',
    border:  isDark ? '#334155' : '#E2E8F0',
    borderSub: isDark ? '#1E293B' : '#F1F5F9',
    text1:   isDark ? '#F1F5F9' : '#0F172A',
    text2:   isDark ? '#94A3B8' : '#64748B',
    text3:   isDark ? '#64748B' : '#94A3B8',
    inputBg: isDark ? '#0F172A' : '#ffffff',
  }

  const navigate = useNavigate()
  const [planejamentos, setPlanejamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [justificativa, setJustificativa] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [aba, setAba] = useState("aprovacao")
  const [baselineInfo, setBaselineInfo] = useState(null)
  const [historicoBaselines, setHistoricoBaselines] = useState([])
  const [baselineLoading, setBaselineLoading] = useState(false)
  const [baselineMsg, setBaselineMsg] = useState("")
  const [justBypass, setJustBypass] = useState("")
  const [versaoViewing, setVersaoViewing] = useState(null)
  const [dadosCompletos, setDadosCompletos] = useState(null)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)

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
    setLoadingDetalhe(true)
    setVersaoViewing(null)
    setDadosCompletos(null)
    api.get(`/planejamento/${selected.ID}`).then(r => {
      const dados = r.data?.dadosCompletos || {}
      setBaselineInfo(dados._baseline || null)
      setHistoricoBaselines(dados._historicoBaselines || [])
      setDadosCompletos(dados)
    }).catch(() => { setBaselineInfo(null); setHistoricoBaselines([]); setDadosCompletos({}) })
    .finally(() => { setBaselineLoading(false); setLoadingDetalhe(false) })
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
    <div className="space-y-5 fade-in">
      <div className="flex items-center gap-3 mb-2">
        <ShieldCheckIcon className="w-6 h-6 text-par-400" />
        <h1 className="page-title">Aprovacoes e Baseline</h1>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 4, background: T.cardAlt, borderRadius: 10, padding: 4, width: "fit-content", border: `1px solid ${T.border}` }}>
        {[{ key: "aprovacao", label: "Aprovacao", icon: ShieldCheckIcon }, { key: "baseline", label: "Baseline PAR", icon: LockClosedIcon }].map(tab => (
          <button key={tab.key} onClick={() => { setAba(tab.key); setSelected(null) }} style={{
            padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
            background: aba === tab.key ? T.card : "transparent",
            color: aba === tab.key ? "#7C3AED" : T.text2,
            boxShadow: aba === tab.key ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
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
          style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${T.border}`, background: T.inputBg, color: T.text1, fontSize: 12, fontFamily: "inherit", outline: "none", width: 180 }} />
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
                      background: selected?.ID === p.ID ? (isDark ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.08)") : T.cardAlt,
                      border: `1px solid ${selected?.ID === p.ID ? "rgba(99,102,241,0.5)" : T.border}`,
                      transition: "all 0.18s" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: T.text1 }}>{p.Nome_Projeto || p.ID_Projeto}</div>
                    <div style={{ fontSize: 11, color: T.text2, marginTop: 2 }}>{p.Resp_Planejamento} · {p.Setor}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED", marginTop: 4 }}>{fmt(p.Valor_Contrato)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detalhe */}
          <div style={{ background: T.card, borderRadius: 14, border: `1.5px solid ${T.border}`, overflowY: "auto", maxHeight: "78vh", display: "flex", flexDirection: "column" }}>
            {!selected ? (
              <div style={{ textAlign: "center", padding: 60, color: T.text3 }}>
                <ShieldCheckIcon style={{ width: 44, height: 44, margin: "0 auto 12px", opacity: 0.3 }} />
                <div style={{ fontWeight: 600, fontSize: 14 }}>Selecione um planejamento para revisar</div>
              </div>
            ) : loadingDetalhe ? (
              <div style={{ padding: 60, textAlign: "center", color: T.text3 }}>Carregando planejamento...</div>
            ) : (() => {
              // dadosCompletos é o Dados_JSON já parseado + campos extras (_baseline, etc)
              const d = dadosCompletos || {}
              const V = parseBR(d.valorContrato || selected.Valor_Contrato)
              const ip = parseBR(d.impostosPerc || 20)
              const ta = parseBR(d.taxaAdmPerc || 12)
              const co = 7.5
              const impostos = V * ip / 100
              const taxaAdm = V * ta / 100
              const comissao = V * co / 100
              const recLiq = V - impostos - taxaAdm - comissao
              const totalTerc = (d.terceirizados || []).reduce((s, t) => s + parseBR(t.custo), 0)
              const totalEq = (d.equipe || []).reduce((s, e) => s + parseBR(e.horas) * (parseBR(e.mediaHora) || 36.4), 0)
              const totalDesp = (d.despesas || []).reduce((s, x) => s + parseBR(x.valor), 0)
              const totalDespInt = (d.despesasInternas || []).reduce((s, x) => s + parseBR(x.custo), 0)
              const totalCustos = totalTerc + totalEq + totalDesp + totalDespInt
              const lucro = recLiq - totalCustos
              const lucroPerc = V > 0 ? (lucro / V) * 100 : 0
              const tercPerc2 = V > 0 ? (totalTerc / V) * 100 : 0
              const margemOk = lucroPerc >= 23
              const tercOk = tercPerc2 <= 25
              const medicoes = d.medicoesCronograma || d.medicoes || []

              return (
                <>
                  {/* Cabeçalho fixo */}
                  <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, background: T.card, zIndex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T.text1, marginBottom: 6 }}>{selected.Nome_Projeto || selected.ID_Projeto}</div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: T.text2, flexWrap: "wrap" }}>
                      <span>Valor: <strong style={{ color: "#7C3AED" }}>{fmt(V || selected.Valor_Contrato)}</strong></span>
                      {selected.Nr_Contrato_OS && <span>OS: <strong style={{ color: T.text1 }}>{selected.Nr_Contrato_OS}</strong></span>}
                      {selected.Resp_Planejamento && <span>Resp.: <strong style={{ color: T.text1 }}>{selected.Resp_Planejamento}</strong></span>}
                      {selected.Setor && <span style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", padding: "2px 8px", borderRadius: 6 }}>{selected.Setor}</span>}
                    </div>
                  </div>

                  {/* Conteúdo com scroll */}
                  <div style={{ padding: "20px 24px", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>

                    {successMsg && (
                      <div style={{ padding: "10px 14px", borderRadius: 8, background: "#F0FDF4", border: "1px solid #86EFAC", color: "#15803D", fontWeight: 600, fontSize: 13 }}>{successMsg}</div>
                    )}

                    {/* KPIs */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                      {[
                        { label: "Valor Contrato", val: fmt(V), color: T.text1, bg: T.cardAlt },
                        { label: "Receita Líquida", val: fmt(recLiq), color: "#7C3AED", bg: isDark ? "#1a1040" : "#F5F3FF" },
                        { label: `Lucro Est. (${lucroPerc.toFixed(1)}%)`, val: fmt(lucro), color: margemOk ? "#15803D" : "#DC2626", bg: margemOk ? (isDark ? "#0f2820" : "#F0FDF4") : (isDark ? "#2a0f0f" : "#FEF2F2") },
                        { label: `Terc. (${tercPerc2.toFixed(1)}%)`, val: fmt(totalTerc), color: tercOk ? T.text2 : "#DC2626", bg: T.cardAlt },
                      ].map(k => (
                        <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: "12px 14px", border: `1px solid ${T.border}` }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 4, lineHeight: 1.3 }}>{k.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: k.color }}>{k.val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Aviso de margem ou terceirizados */}
                    {(!margemOk || !tercOk) && (
                      <div style={{ padding: "12px 16px", borderRadius: 10, background: isDark ? "#2a0f0f" : "#FEF2F2", border: "1.5px solid #FECACA" }}>
                        <div style={{ fontWeight: 700, color: "#DC2626", fontSize: 13, marginBottom: 4 }}>Atenção — fora da Metodologia PAR</div>
                        {!margemOk && <div style={{ fontSize: 12, color: "#B91C1C" }}>• Margem ({lucroPerc.toFixed(1)}%) abaixo do mínimo de 23%</div>}
                        {!tercOk && <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 3 }}>• Terceirizados ({tercPerc2.toFixed(1)}%) acima do máximo de 25%</div>}
                        {!tercOk && (
                          <textarea value={justBypass} onChange={e => setJustBypass(e.target.value)}
                            placeholder="Justificativa obrigatória para aprovar com bypass..." rows={2}
                            style={{ width: "100%", marginTop: 10, padding: "8px 12px", borderRadius: 8, border: "1px solid #FED7AA", background: T.inputBg, color: T.text1, fontSize: 12, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box" }} />
                        )}
                      </div>
                    )}

                    {/* Medições */}
                    {medicoes.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>📋 Medições ({medicoes.length})</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {medicoes.map((m, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, background: T.cardAlt, border: `1px solid ${T.border}`, fontSize: 12 }}>
                              <span style={{ color: T.text1, fontWeight: 600 }}>{m.etapa || m.descricao || `Medição ${i+1}`}</span>
                              <div style={{ display: "flex", gap: 12, color: T.text2 }}>
                                {m.percentual && <span style={{ color: "#7C3AED", fontWeight: 700 }}>{m.percentual}%</span>}
                                {(m.dataPrevisao || m.data) && <span>{new Date(m.dataPrevisao || m.data).toLocaleDateString("pt-BR")}</span>}
                                <span style={{ fontWeight: 700, color: "#15803D" }}>{fmt(parseBR(m.valor || m.valorPlanejado))}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Equipe */}
                    {(d.equipe || []).length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>👥 Equipe Interna — {fmt(totalEq)}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {d.equipe.map((e, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: T.cardAlt, border: `1px solid ${T.border}`, fontSize: 12 }}>
                              <span style={{ color: T.text1, fontWeight: 600 }}>{e.colaborador || e.nome || "—"}</span>
                              <span style={{ color: T.text2 }}>{parseBR(e.horas).toFixed(0)}h · {fmt(parseBR(e.horas) * (parseBR(e.mediaHora) || 36.4))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Terceirizados */}
                    {(d.terceirizados || []).length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>🏗 Terceirizados — {fmt(totalTerc)}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {d.terceirizados.map((t, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: T.cardAlt, border: `1px solid ${T.border}`, fontSize: 12 }}>
                              <span style={{ color: T.text1, fontWeight: 600 }}>{t.descricao || "—"}</span>
                              <span style={{ color: "#7C3AED", fontWeight: 700 }}>{fmt(parseBR(t.custo))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Despesas */}
                    {(d.despesas || []).length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>📎 Despesas Gerais — {fmt(totalDesp)}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {d.despesas.map((x, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: T.cardAlt, border: `1px solid ${T.border}`, fontSize: 12 }}>
                              <span style={{ color: T.text1 }}>{x.descricao || "—"}</span>
                              <span style={{ color: T.text2, fontWeight: 700 }}>{fmt(parseBR(x.valor))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Justificativa + botões */}
                    <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                      <label style={{ fontWeight: 600, fontSize: 13, color: T.text2, display: "block", marginBottom: 6 }}>Justificativa (opcional)</label>
                      <textarea value={justificativa} onChange={e => setJustificativa(e.target.value)} rows={3}
                        style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.inputBg, color: T.text1, fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box" }} />
                      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
                        <button onClick={() => acao("rejeitar")} disabled={actionLoading}
                          style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #EF4444", background: "transparent", color: "#EF4444", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                          Rejeitar
                        </button>
                        <button onClick={() => acao("aprovar")} disabled={actionLoading || (!tercOk && !justBypass)}
                          style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#4F46E5,#7C3AED)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                          {actionLoading ? "Processando..." : "✓ Aprovar Planejamento"}
                        </button>
                      </div>
                    </div>

                  </div>
                </>
              )
            })()}
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
                      background: selected?.ID === p.ID ? (isDark ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.08)") : T.cardAlt,
                      border: `1px solid ${selected?.ID === p.ID ? "rgba(99,102,241,0.5)" : T.border}`,
                      transition: "all 0.18s" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: T.text1 }}>{p.Nome_Projeto || p.ID_Projeto}</div>
                    <div style={{ fontSize: 11, color: T.text2, marginTop: 2 }}>{p.Setor}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#15803D", marginTop: 4 }}>{fmt(p.Valor_Contrato)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: T.card, borderRadius: 14, border: `1.5px solid ${T.border}`, padding: "22px 24px", overflowY: "auto", maxHeight: "75vh" }}>
            {!selected ? (
              <div style={{ textAlign: "center", padding: 40, color: T.text3 }}>
                <LockClosedIcon style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.3 }} />
                <div style={{ fontWeight: 600 }}>Selecione um planejamento aprovado</div>
              </div>
            ) : baselineLoading ? (
              <div style={{ padding: 32, textAlign: "center", color: T.text2 }}>Carregando baselines...</div>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.text1, marginBottom: 16 }}>{selected.Nome_Projeto}</div>

                {/* Timeline de versões */}
                {(historicoBaselines.length > 0 || baselineInfo) ? (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Histórico de Versões</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {historicoBaselines.map(b => (
                        <button key={b.versao} onClick={() => setVersaoViewing(versaoViewing?.versao === b.versao ? null : b)}
                          style={{ textAlign: "left", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${versaoViewing?.versao === b.versao ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.08)"}`, background: versaoViewing?.versao === b.versao ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)", cursor: "pointer", transition: "all 0.15s" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: versaoViewing?.versao === b.versao ? "#a78bfa" : "#94a3b8" }}>
                              🔒 {b.versaoLabel || `Versão ${b.versao}`}
                            </span>
                            <span style={{ fontSize: 11, color: "#64748B" }}>{b.dataTravamento ? new Date(b.dataTravamento).toLocaleDateString("pt-BR") : ""}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>Travado por {b.travadoPor || "—"} · {b.valorContrato ? fmtCur(b.valorContrato) : ""}</div>
                        </button>
                      ))}
                      {/* Versão atual/corrente */}
                      {baselineInfo && (
                        <button onClick={() => setVersaoViewing(versaoViewing?.versao === baselineInfo.versao ? null : baselineInfo)}
                          style={{ textAlign: "left", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${versaoViewing?.versao === baselineInfo.versao ? "#4F46E5" : "rgba(99,102,241,0.35)"}`, background: versaoViewing?.versao === baselineInfo.versao ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.07)", cursor: "pointer", transition: "all 0.15s" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa" }}>
                              🔒 {baselineInfo.versaoLabel || `Versão ${baselineInfo.versao}`} <span style={{ fontSize: 10, background: "rgba(99,102,241,0.3)", padding: "1px 6px", borderRadius: 4, marginLeft: 4, color: "#c4b5fd" }}>ATUAL</span>
                            </span>
                            <span style={{ fontSize: 11, color: "#64748B" }}>{baselineInfo.dataTravamento ? new Date(baselineInfo.dataTravamento).toLocaleDateString("pt-BR") : ""}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>Travado por {baselineInfo.travadoPor || "—"} · {baselineInfo.valorContrato ? fmtCur(baselineInfo.valorContrato) : ""}</div>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", marginBottom: 16, fontSize: 13, color: "#D97706" }}>
                    Nenhum baseline travado ainda.
                  </div>
                )}

                {/* Detalhe da versão selecionada */}
                {versaoViewing && (
                  <div style={{ marginBottom: 20, padding: "16px 18px", borderRadius: 12, background: T.cardAlt, border: `1.5px solid ${T.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#a78bfa" }}>
                        🔒 {versaoViewing.versaoLabel || `Versão ${versaoViewing.versao}`}
                        <span style={{ fontSize: 11, color: T.text2, fontWeight: 500, marginLeft: 8 }}>
                          Travado em {versaoViewing.travadoEm ? new Date(versaoViewing.travadoEm).toLocaleDateString("pt-BR") : "—"} por {versaoViewing.travadoPor || "—"}
                        </span>
                      </div>
                      <button onClick={() => gerarPDFBaseline(versaoViewing, selected?.Nome_Projeto)}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "none", background: "#7C3AED", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        <DocumentArrowDownIcon style={{ width: 14, height: 14 }} /> PDF
                      </button>
                    </div>

                    {/* Financeiro */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Financeiro</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
                      {[
                        ["Valor do Contrato", fmtCur(versaoViewing.valorContrato)],
                        ["Impostos", `${versaoViewing.impostosPerc || 0}%`],
                        ["Taxa Adm", `${versaoViewing.taxaAdmPerc || 0}%`],
                        ["Comissão", `${versaoViewing.comissaoPerc || 7.5}%`],
                        ["Receita Líquida", fmtCur((versaoViewing.valorContrato || 0) * (1 - (versaoViewing.impostosPerc || 0) / 100 - (versaoViewing.taxaAdmPerc || 0) / 100 - (versaoViewing.comissaoPerc || 7.5) / 100))],
                      ].map(([label, val]) => (
                        <div key={label} style={{ padding: "8px 10px", borderRadius: 8, background: T.bg, border: `1px solid ${T.border}` }}>
                          <div style={{ fontSize: 10, color: T.text3, fontWeight: 600 }}>{label}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, marginTop: 2 }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Datas */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Datas Planejadas</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
                      {[
                        ["Início OS", versaoViewing.dataInicioOS],
                        ["Entrega Contrato", versaoViewing.dataEntregaContrato],
                        ["Entrega Planejada", versaoViewing.dataEntregaPlanejada],
                      ].map(([l, d]) => (
                        <div key={l} style={{ padding: "8px 10px", borderRadius: 8, background: T.bg, border: `1px solid ${T.border}` }}>
                          <div style={{ fontSize: 10, color: T.text3, fontWeight: 600 }}>{l}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, marginTop: 2 }}>{d ? new Date(d).toLocaleDateString("pt-BR") : "—"}</div>
                        </div>
                      ))}
                    </div>

                    {/* Equipe */}
                    {(versaoViewing.horasPorColaborador || []).length > 0 && (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                          Equipe — {versaoViewing.totalHorasEstimadas || 0}h estimadas
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
                          {versaoViewing.horasPorColaborador.map((m, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, background: T.bg, border: `1px solid ${T.border}`, fontSize: 12 }}>
                              <span style={{ color: T.text1, fontWeight: 600 }}>{m.colaborador}</span>
                              <span style={{ color: T.text2 }}>{m.horasEstimadas}h · {fmtCur(m.custoEstimado)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Terceirizados */}
                    {(versaoViewing.terceirizados || []).length > 0 && (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Terceirizados</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
                          {versaoViewing.terceirizados.map((t, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, background: T.bg, border: `1px solid ${T.border}`, fontSize: 12 }}>
                              <span style={{ color: T.text1, fontWeight: 600 }}>{t.descricao}</span>
                              <span style={{ color: "#a78bfa", fontWeight: 700 }}>{fmtCur(t.custo)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Despesas */}
                    {(versaoViewing.despesas || []).length > 0 && (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Despesas Gerais</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
                          {versaoViewing.despesas.map((d, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, background: T.bg, border: `1px solid ${T.border}`, fontSize: 12 }}>
                              <span style={{ color: T.text1 }}>{d.descricao}</span>
                              <span style={{ color: T.text2, fontWeight: 700 }}>{fmtCur(d.valor)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Medições */}
                    {(versaoViewing.medicoes || []).length > 0 && (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Medições Planejadas</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {versaoViewing.medicoes.map((m, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, background: T.bg, border: `1px solid ${T.border}`, fontSize: 12 }}>
                              <span style={{ color: T.text2 }}>{m.etapa || m.descricao || `Medição ${i + 1}`}</span>
                              <span style={{ color: T.text1, fontWeight: 700 }}>{m.percentual}% · {fmtCur(m.valor)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {baselineTravado && (
                  <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 12, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", fontSize: 12, color: "#D97706" }}>
                    Travar novamente criará a Versão {(baselineInfo?.versao || 1) + 1}, arquivando a atual.
                  </div>
                )}

                {baselineMsg && (
                  <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, background: "#F0FDF4", border: "1px solid #86EFAC", color: "#15803D", fontWeight: 600, fontSize: 13 }}>{baselineMsg}</div>
                )}

                <button onClick={travarBaseline} disabled={baselineLoading}
                  style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#4F46E5,#7C3AED)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <LockClosedIcon style={{ width: 16, height: 16 }} />
                  {baselineTravado ? `Travar Nova Versão (v${(baselineInfo?.versao || 1) + 1})` : "Travar Baseline (Versão 1)"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
