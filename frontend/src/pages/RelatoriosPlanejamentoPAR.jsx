import { useState, useEffect, useRef } from "react"
import { FileText, ChevronDown, ChevronRight, Printer, Search, X } from "lucide-react"
import api from "../utils/api"

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)
const fmtN = (v, dec = 1) => Number(v || 0).toFixed(dec)
const pBR = (v) => parseFloat(String(v || 0).replace(/\./g, "").replace(",", ".")) || 0

function calcPAR(d) {
  const V = pBR(d.valorContrato)
  const ip = Math.max(pBR(d.impostosPerc) || 20, 16.33)
  const ta = Math.max(pBR(d.taxaAdmPerc) || 12, 5)
  const co = 7.5
  const impostos = V * ip / 100
  const taxaAdm = V * ta / 100
  const comissao = V * co / 100
  const receitaLiquida = V - impostos - taxaAdm - comissao
  const totalTerceiros = (d.terceirizados || []).reduce((s, t) => s + pBR(t.custo), 0)
  const totalEquipe = (d.equipe || []).reduce((s, e) => s + pBR(e.horas) * (pBR(e.mediaHora) || 36.4), 0)
  const totalDespesasInternas = (d.despesasInternas || []).reduce((s, x) => s + pBR(x.custo), 0)
  const totalDespesas = (d.despesas || []).reduce((s, x) => s + pBR(x.valor), 0)
  const totalCustos = totalTerceiros + totalEquipe + totalDespesasInternas + totalDespesas
  const lucro = receitaLiquida - totalCustos
  const lucroPerc = V > 0 ? (lucro / V) * 100 : 0
  const percTerceiros = V > 0 ? (totalTerceiros / V) * 100 : 0
  const percDespesasGerais = V > 0 ? (totalDespesas / V) * 100 : 0
  const custoProducaoPerc = V > 0 ? ((totalEquipe + totalDespesasInternas + totalTerceiros) / V) * 100 : 0
  return { V, ip, ta, co, impostos, taxaAdm, comissao, receitaLiquida, totalTerceiros, totalEquipe, totalDespesasInternas, totalDespesas, totalCustos, lucro, lucroPerc, percTerceiros, percDespesasGerais, custoProducaoPerc }
}

function KPI({ label, value, ok, sub }) {
  return (
    <div style={{ background: ok ? "#F0FDF4" : "#FEF2F2", borderRadius: 10, padding: "12px 16px", border: `1.5px solid ${ok ? "#86EFAC" : "#FECACA"}`, flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: ok ? "#15803D" : "#DC2626" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: ok ? "#16A34A" : "#DC2626", fontWeight: 600, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Tabela({ headers, rows, emptyText }) {
  if (!rows.length) return <div style={{ fontSize: 12, color: "#94A3B8", padding: "10px 0" }}>{emptyText || "Nenhum item"}</div>
  return (
    <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #E2E8F0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#F8FAFC" }}>
            {headers.map(h => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#64748B", fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
              {row.map((cell, j) => <td key={j} style={{ padding: "9px 12px", color: "#0F172A", fontWeight: j === 0 ? 600 : 400 }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetalheRelatorio({ plano }) {
  const d = plano.dadosCompletos || {}
  const par = calcPAR(d)
  const margemOk = par.lucroPerc >= 23
  const tercOk = par.percTerceiros <= 25
  const prodOk = par.custoProducaoPerc <= 30
  const despOk = par.percDespesasGerais <= 7.5
  const printRef = useRef()

  function imprimir() {
    const conteudo = printRef.current.innerHTML
    const janela = window.open("", "_blank")
    janela.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Relatório PAR — ${plano.Nome_Projeto || ""}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, sans-serif; font-size: 11px; color: #0F172A; padding: 24px; }
          h1 { font-size: 16px; font-weight: 900; margin-bottom: 4px; }
          h2 { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; margin: 18px 0 8px; border-bottom: 1.5px solid #E2E8F0; padding-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th { background: #F8FAFC; padding: 6px 10px; text-align: left; font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; border: 1px solid #E2E8F0; }
          td { padding: 6px 10px; border: 1px solid #E2E8F0; }
          .kpi-grid { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
          .kpi { border: 1.5px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; flex: 1; min-width: 110px; }
          .kpi-label { font-size: 9px; font-weight: 700; color: #94A3B8; text-transform: uppercase; }
          .kpi-val { font-size: 15px; font-weight: 900; }
          .ok { color: #15803D; }
          .nok { color: #DC2626; }
          .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
          .info-block { border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px 12px; }
          .info-line { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #F1F5F9; font-size: 11px; }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>${conteudo}</body>
      </html>
    `)
    janela.document.close()
    janela.focus()
    setTimeout(() => { janela.print(); janela.close() }, 400)
  }

  const medicoes = d.medicoes || []
  const equipe = d.equipe || []
  const despesasInternas = d.despesasInternas || []
  const terceirizados = d.terceirizados || []
  const despesas = d.despesas || []

  const fmtData = (s) => {
    if (!s) return "—"
    if (s.includes("-")) return s.split("-").reverse().join("/")
    return s
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={imprimir}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, border: "1.5px solid #7C3AED", background: "#EDE9FE", color: "#7C3AED", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          <Printer size={15} /> Gerar PDF / Imprimir
        </button>
      </div>

      <div ref={printRef}>
        {/* Cabeçalho do relatório */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
            Relatório PAR — Planejamento Aprovado
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 900, color: "#0F172A" }}>{plano.Nome_Projeto}</h1>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
            {plano.Cliente && <span>Cliente: <strong>{plano.Cliente}</strong> &nbsp;·&nbsp; </span>}
            {plano.Setor && <span>Setor: <strong>{plano.Setor}</strong> &nbsp;·&nbsp; </span>}
            <span>Status: <strong style={{ color: "#15803D" }}>{plano.Status}</strong></span>
          </div>
        </div>

        {/* KPIs */}
        <h2 style={{ fontSize: 11, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: "1.5px solid #E2E8F0", paddingBottom: 6 }}>Indicadores PAR</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          <KPI label="Valor do Contrato" value={fmt(par.V)} ok={par.V > 0} />
          <KPI label="Receita Líquida" value={fmt(par.receitaLiquida)} ok={par.receitaLiquida > 0} />
          <KPI label="Custo Total" value={fmt(par.totalCustos)} ok={true} />
          <KPI label="Lucro Estimado" value={fmt(par.lucro)} ok={margemOk} sub={`${fmtN(par.lucroPerc)}% (mín 23%)`} />
          <KPI label="Terceirizados" value={`${fmtN(par.percTerceiros)}%`} ok={tercOk} sub="máx 25%" />
          <KPI label="Custo Produção" value={`${fmtN(par.custoProducaoPerc)}%`} ok={prodOk} sub="máx 30%" />
          <KPI label="Despesas Gerais" value={`${fmtN(par.percDespesasGerais)}%`} ok={despOk} sub="máx 7,5%" />
        </div>

        {/* Resumo Financeiro */}
        <h2 style={{ fontSize: 11, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: "1.5px solid #E2E8F0", paddingBottom: 6 }}>Resumo Financeiro</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            ["Valor Bruto", fmt(par.V)],
            [`Impostos (${fmtN(par.ip)}%)`, `- ${fmt(par.impostos)}`],
            [`Taxa Adm. (${fmtN(par.ta)}%)`, `- ${fmt(par.taxaAdm)}`],
            ["Comissão (7,5%)", `- ${fmt(par.comissao)}`],
            ["Receita Líquida", fmt(par.receitaLiquida)],
            ["Terceirizados", `- ${fmt(par.totalTerceiros)}`],
            ["Equipe Interna", `- ${fmt(par.totalEquipe)}`],
            ["Despesas Internas", `- ${fmt(par.totalDespesasInternas)}`],
            ["Despesas Gerais", `- ${fmt(par.totalDespesas)}`],
            ["Lucro Estimado", fmt(par.lucro)],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: l === "Receita Líquida" || l === "Lucro Estimado" ? "#F0FDF4" : "#F8FAFC", borderRadius: 6, fontSize: 12, border: "1px solid #E2E8F0" }}>
              <span style={{ color: "#475569" }}>{l}</span>
              <span style={{ fontWeight: 700, color: l === "Lucro Estimado" ? (margemOk ? "#15803D" : "#DC2626") : "#0F172A" }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Informações Gerais */}
        <h2 style={{ fontSize: 11, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: "1.5px solid #E2E8F0", paddingBottom: 6 }}>Informações Gerais</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20, fontSize: 12 }}>
          {[
            ["Empresa", d.empresa || plano.Empresa],
            ["Tipologia", d.tipologia],
            ["Resp. Planejamento", d.respPlanejamento || plano.Resp_Planejamento],
            ["Resp. Aprovação", d.respAprovacao || plano.Resp_Aprovacao],
            ["Centro de Custo OPP", d.nrContratoOS || plano.Nr_Contrato_OS],
            ["N° O.S. OPP", d.nrOsOpp || plano.Nr_OS_OPP],
            ["N° O.S. Externa", d.dataInicioOS],
            ["Data O.S. Externa", fmtData(d.dataOsExterna)],
            ["Data Entrega Contrato", fmtData(d.dataEntregaContrato || plano.Data_Entrega_Contrato)],
            ["Data Entrega Planejada", fmtData(d.dataEntregaPlanejada)],
          ].filter(([, v]) => v).map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "#F8FAFC", borderRadius: 6, border: "1px solid #E2E8F0" }}>
              <span style={{ color: "#64748B" }}>{l}</span>
              <span style={{ fontWeight: 600, color: "#0F172A", textAlign: "right", maxWidth: 200 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Cronograma de Medições */}
        <h2 style={{ fontSize: 11, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: "1.5px solid #E2E8F0", paddingBottom: 6 }}>
          Cronograma de Medições ({medicoes.length} etapas)
        </h2>
        <div style={{ marginBottom: 20 }}>
          <Tabela
            headers={["Etapa", "Valor (R$)", "%", "Data Prevista"]}
            rows={medicoes.map(m => [
              m.etapa || "—",
              m.valor ? fmt(pBR(m.valor)) : "—",
              m.percentual ? `${m.percentual}%` : "—",
              fmtData(m.dataPrevisao),
            ])}
          />
          {medicoes.length > 0 && (
            <div style={{ display: "flex", gap: 20, marginTop: 8, padding: "8px 12px", background: "#F0FDF4", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
              <span>Total: <span style={{ color: "#15803D" }}>{fmt(medicoes.reduce((s, m) => s + pBR(m.valor), 0))}</span></span>
              <span>Soma %: <span style={{ color: "#15803D" }}>{fmtN(medicoes.reduce((s, m) => s + pBR(m.percentual), 0), 2)}%</span></span>
            </div>
          )}
        </div>

        {/* Equipe Interna */}
        <h2 style={{ fontSize: 11, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: "1.5px solid #E2E8F0", paddingBottom: 6 }}>
          Equipe Interna ({equipe.length} membros · {fmt(par.totalEquipe)})
        </h2>
        <div style={{ marginBottom: 20 }}>
          <Tabela
            headers={["Colaborador", "Horas Est.", "R$/Hora", "Custo"]}
            rows={equipe.map(e => [
              e.colaborador || "—",
              `${pBR(e.horas)}h`,
              fmt(pBR(e.mediaHora) || 36.4),
              fmt(pBR(e.horas) * (pBR(e.mediaHora) || 36.4)),
            ])}
          />
        </div>

        {/* Despesas Internas */}
        {despesasInternas.length > 0 && (<>
          <h2 style={{ fontSize: 11, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: "1.5px solid #E2E8F0", paddingBottom: 6 }}>
            Despesas Internas ({despesasInternas.length} · {fmt(par.totalDespesasInternas)})
          </h2>
          <div style={{ marginBottom: 20 }}>
            <Tabela
              headers={["Serviço", "Vínculo (Medição)", "Ref. Contrato", "Custo", "% Custo/Ref."]}
              rows={despesasInternas.map(t => {
                const vRef = pBR(t.valorRef), vCusto = pBR(t.custo)
                return [
                  t.servico || "—",
                  t.vinculo || "—",
                  fmt(vRef),
                  fmt(vCusto),
                  vRef > 0 ? `${((vCusto / vRef) * 100).toFixed(1)}%` : "—",
                ]
              })}
            />
          </div>
        </>)}

        {/* Serviços Terceirizados */}
        <h2 style={{ fontSize: 11, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: "1.5px solid #E2E8F0", paddingBottom: 6 }}>
          Serviços Terceirizados ({terceirizados.length} · {fmt(par.totalTerceiros)})
        </h2>
        <div style={{ marginBottom: 20 }}>
          <Tabela
            headers={["Serviço", "Vínculo (Medição)", "Ref. Contrato", "Custo", "% Custo/Ref."]}
            rows={terceirizados.map(t => {
              const vRef = pBR(t.valorRef), vCusto = pBR(t.custo)
              return [
                t.servico || "—",
                t.vinculo || "—",
                fmt(vRef),
                fmt(vCusto),
                vRef > 0 ? `${((vCusto / vRef) * 100).toFixed(1)}%` : "—",
              ]
            })}
          />
        </div>

        {/* Despesas Gerais */}
        {despesas.length > 0 && (<>
          <h2 style={{ fontSize: 11, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: "1.5px solid #E2E8F0", paddingBottom: 6 }}>
            Despesas Gerais ({despesas.length} · {fmt(par.totalDespesas)})
          </h2>
          <div style={{ marginBottom: 20 }}>
            <Tabela
              headers={["Descrição", "Valor"]}
              rows={despesas.map(d => [d.descricao || "—", fmt(pBR(d.valor))])}
            />
          </div>
        </>)}

        {/* Justificativa */}
        {d.justificativa && (
          <>
            <h2 style={{ fontSize: 11, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: "1.5px solid #E2E8F0", paddingBottom: 6 }}>Justificativa / Observações</h2>
            <div style={{ padding: "12px 14px", background: "#FFFBEB", borderRadius: 8, border: "1px solid #FDE68A", fontSize: 12, color: "#92400E", lineHeight: 1.6, marginBottom: 20 }}>
              {d.justificativa}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function RelatoriosPlanejamentoPAR() {
  const [planejamentos, setPlanejamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState("")
  const [filtroSetor, setFiltroSetor] = useState("")
  const [aberto, setAberto] = useState(null)
  const [detalhes, setDetalhes] = useState({})
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(null)

  useEffect(() => {
    async function carregar() {
      setLoading(true)
      try {
        const r = await api.get("/planejamento")
        const aprovados = (Array.isArray(r.data) ? r.data : []).filter(p => p.Status === "Aprovado")
        setPlanejamentos(aprovados)
        // Já carrega todos os detalhes em paralelo
        const ids = aprovados.map(p => p.ID_Projeto).filter(Boolean)
        const resultados = await Promise.allSettled(ids.map(id => api.get(`/planejamento/${id}`)))
        const mapa = {}
        resultados.forEach((res, i) => {
          if (res.status === "fulfilled") mapa[ids[i]] = res.value.data
        })
        setDetalhes(mapa)
      } catch { }
      setLoading(false)
    }
    carregar()
  }, [])

  const SETORES = ["Arquitetura", "Saneamento", "Infraestrutura", "Administrativo"]

  const filtrados = planejamentos.filter(p => {
    const nome = (p.Nome_Projeto || "").toLowerCase()
    const cliente = (p.Cliente || "").toLowerCase()
    const setor = p.Setor || ""
    if (filtroSetor && !setor.toLowerCase().includes(filtroSetor.toLowerCase())) return false
    if (busca) {
      const b = busca.toLowerCase()
      if (!nome.includes(b) && !cliente.includes(b)) return false
    }
    return true
  })

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <FileText size={22} color="#7C3AED" />
        <span style={{ fontWeight: 900, fontSize: 18, color: "#0F172A", textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>
          Relatórios — Planejamentos Aprovados
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#15803D", background: "#DCFCE7", padding: "4px 12px", borderRadius: 20 }}>
          {filtrados.length} projeto(s) aprovado(s)
        </span>
      </div>

      {/* Filtros */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", border: "1.5px solid #E2E8F0", marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SETORES.map(s => (
            <button key={s} onClick={() => setFiltroSetor(filtroSetor === s ? "" : s)}
              style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${filtroSetor === s ? "#7C3AED" : "#E2E8F0"}`, background: filtroSetor === s ? "#EDE9FE" : "#F8FAFC", color: filtroSetor === s ? "#7C3AED" : "#64748B", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 8, background: "#F8FAFC", border: "1.5px solid #E2E8F0", borderRadius: 20, padding: "5px 12px" }}>
          <Search size={14} color="#94A3B8" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar projeto ou cliente..."
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, flex: 1, color: "#0F172A", fontFamily: "inherit" }} />
          {busca && <button onClick={() => setBusca("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex" }}><X size={14} /></button>}
        </div>
        {(filtroSetor || busca) && (
          <button onClick={() => { setFiltroSetor(""); setBusca("") }}
            style={{ padding: "5px 12px", borderRadius: 20, border: "1.5px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            Limpar
          </button>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>
          Carregando planejamentos aprovados...
        </div>
      )}

      {!loading && filtrados.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, background: "#F8FAFC", borderRadius: 16, border: "2px dashed #E2E8F0" }}>
          <FileText size={40} color="#CBD5E1" style={{ margin: "0 auto 12px" }} />
          <div style={{ fontWeight: 700, fontSize: 15, color: "#475569" }}>Nenhum planejamento aprovado encontrado</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtrados.map(p => {
          const estaAberto = aberto === p.ID_Projeto
          const detalhe = detalhes[p.ID_Projeto]
          const d = detalhe?.dadosCompletos || {}
          const par = detalhe ? calcPAR(d) : null
          const margemOk = par ? par.lucroPerc >= 23 : true

          return (
            <div key={p.ID_Projeto} style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${estaAberto ? "#7C3AED" : "#E2E8F0"}`, overflow: "hidden", transition: "border-color 0.2s" }}>
              {/* Linha resumo — clicável */}
              <button onClick={() => setAberto(estaAberto ? null : p.ID_Projeto)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: estaAberto ? "#FAFAFF" : "#fff", border: "none", cursor: "pointer", textAlign: "left" }}>
                {estaAberto ? <ChevronDown size={16} color="#7C3AED" /> : <ChevronRight size={16} color="#94A3B8" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.Nome_Projeto}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{p.Cliente}</div>
                </div>
                {p.Setor && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>{p.Setor}</span>
                )}
                {par && (
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748B", flexShrink: 0 }}>
                    <span><span style={{ fontWeight: 700, color: "#0F172A" }}>{fmt(par.V)}</span> contrato</span>
                    <span style={{ fontWeight: 700, color: margemOk ? "#15803D" : "#DC2626" }}>{fmtN(par.lucroPerc)}% margem</span>
                  </div>
                )}
                <span style={{ fontSize: 11, fontWeight: 700, color: "#15803D", background: "#DCFCE7", padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0 }}>
                  Aprovado
                </span>
              </button>

              {/* Detalhe expandido */}
              {estaAberto && (
                <div style={{ padding: "0 24px 24px", borderTop: "1px solid #F1F5F9" }}>
                  {!detalhe ? (
                    <div style={{ padding: 20, color: "#94A3B8", fontSize: 13 }}>Carregando detalhes...</div>
                  ) : (
                    <div style={{ marginTop: 20 }}>
                      <DetalheRelatorio plano={detalhe} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
