import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { FileText, ChevronDown, ChevronRight, Printer, Search, X, ArrowLeft } from "lucide-react"
import api from "../utils/api"
import { useTheme } from "../contexts/ThemeContext"

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
  const { isDark } = useTheme()
  const T = {
    border:  isDark ? '#334155' : '#E2E8F0',
    borderAlt: isDark ? '#1E293B' : '#F1F5F9',
    thead:   isDark ? '#1E293B' : '#F8FAFC',
    text1:   isDark ? '#F1F5F9' : '#0F172A',
    text2:   isDark ? '#94A3B8' : '#64748B',
  }
  if (!rows.length) return <div style={{ fontSize: 12, color: T.text2, padding: "10px 0" }}>{emptyText || "Nenhum item"}</div>
  return (
    <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${T.border}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: T.thead }}>
            {headers.map(h => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: T.text2, fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${T.borderAlt}` }}>
              {row.map((cell, j) => <td key={j} style={{ padding: "9px 12px", color: T.text1, fontWeight: j === 0 ? 600 : 400 }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DetalheRelatorio({ plano }) {
  const { isDark } = useTheme()
  const T = {
    bg:      isDark ? '#0F172A' : '#F8FAFC',
    card:    isDark ? '#1E293B' : '#ffffff',
    cardAlt: isDark ? '#0F172A' : '#F8FAFC',
    border:  isDark ? '#334155' : '#E2E8F0',
    text1:   isDark ? '#F1F5F9' : '#0F172A',
    text2:   isDark ? '#94A3B8' : '#64748B',
    text3:   isDark ? '#475569' : '#94A3B8',
  }
  const d = plano.dadosCompletos || {}
  const par = calcPAR(d)
  const margemOk = par.lucroPerc >= 23
  const tercOk = par.percTerceiros <= 25
  const prodOk = par.custoProducaoPerc <= 30
  const despOk = par.percDespesasGerais <= 7.5

  function imprimir() {
    const fD = (s) => {
      if (!s) return "—"
      const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
      return m ? `${m[3]}/${m[2]}/${m[1]}` : s
    }
    const fV = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)
    const fN = (v, d = 1) => Number(v || 0).toFixed(d)

    const medicoes = d.medicoes || []
    const equipe = d.equipe || []
    const despesasInternas = d.despesasInternas || []
    const terceirizados = d.terceirizados || []
    const despesas = d.despesas || []

    const rowsHtml = (headers, rows) => {
      if (!rows.length) return "<p style='color:#94A3B8;font-size:11px;padding:4px 0'>Nenhum item</p>"
      return `<table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(row => `<tr>${row.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>`
    }

    const infoRows = [
      ["Empresa", d.empresa || plano.Empresa || ""],
      ["Tipologia", d.tipologia || ""],
      ["Resp. Planejamento", d.respPlanejamento || plano.Resp_Planejamento || ""],
      ["Resp. Aprovação", d.respAprovacao || plano.Resp_Aprovacao || ""],
      ["Centro de Custo OPP", d.nrContratoOS || plano.Nr_Contrato_OS || ""],
      ["N° O.S. OPP", d.nrOsOpp || plano.Nr_OS_OPP || ""],
      ["N° O.S. Externa", d.dataInicioOS || ""],
      ["Data O.S. Externa", fD(d.dataOsExterna)],
      ["Data Entrega Contrato", fD(d.dataEntregaContrato || plano.Data_Entrega_Contrato)],
      ["Data Entrega Planejada", fD(d.dataEntregaPlanejada)],
    ].filter(([, v]) => v && v !== "—")

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Relatório PAR — ${plano.Nome_Projeto || ""}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #0F172A; padding: 28px; }
    h1 { font-size: 17px; font-weight: 900; margin-bottom: 4px; }
    .sub { font-size: 11px; color: #64748B; margin-bottom: 20px; }
    h2 { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; margin: 20px 0 8px; border-bottom: 1.5px solid #CBD5E1; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 11px; }
    th { background: #F1F5F9; padding: 7px 10px; text-align: left; font-weight: 700; color: #475569; font-size: 10px; text-transform: uppercase; border: 1px solid #CBD5E1; }
    td { padding: 7px 10px; border: 1px solid #E2E8F0; vertical-align: middle; }
    tr:nth-child(even) td { background: #F8FAFC; }
    .kpis { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .kpi { border: 1.5px solid #CBD5E1; border-radius: 6px; padding: 8px 12px; min-width: 120px; flex: 1; }
    .kpi-label { font-size: 9px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
    .kpi-val { font-size: 16px; font-weight: 900; }
    .kpi-sub { font-size: 9px; font-weight: 600; margin-top: 2px; }
    .ok { color: #15803D; } .nok { color: #DC2626; }
    .fin { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 14px; }
    .fin-row { display: flex; justify-content: space-between; padding: 5px 10px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 4px; font-size: 11px; }
    .fin-row.destaque { background: #F0FDF4; font-weight: 700; }
    .total-row { padding: 6px 12px; background: #DCFCE7; border-radius: 4px; font-size: 11px; font-weight: 700; color: #15803D; margin-top: 4px; }
    .obs { padding: 10px 14px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; font-size: 11px; color: #92400E; line-height: 1.6; margin-top: 4px; }
    .label { color: #64748B; }
    @page { size: A4; margin: 12mm; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div style="font-size:9px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px">Relatório PAR — Planejamento Aprovado</div>
  <h1>${plano.Nome_Projeto || ""}</h1>
  <div class="sub">
    ${plano.Cliente ? `Cliente: <strong>${plano.Cliente}</strong> &nbsp;·&nbsp; ` : ""}
    ${plano.Setor ? `Setor: <strong>${plano.Setor}</strong> &nbsp;·&nbsp; ` : ""}
    Status: <strong style="color:#15803D">Aprovado</strong>
  </div>

  <h2>Indicadores PAR</h2>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Valor do Contrato</div><div class="kpi-val ok">${fV(par.V)}</div></div>
    <div class="kpi"><div class="kpi-label">Receita Líquida</div><div class="kpi-val ok">${fV(par.receitaLiquida)}</div></div>
    <div class="kpi"><div class="kpi-label">Custo Total</div><div class="kpi-val">${fV(par.totalCustos)}</div></div>
    <div class="kpi"><div class="kpi-label">Lucro Estimado</div><div class="kpi-val ${margemOk ? "ok" : "nok"}">${fV(par.lucro)}</div><div class="kpi-sub ${margemOk ? "ok" : "nok"}">${fN(par.lucroPerc)}% (mín 23%)</div></div>
    <div class="kpi"><div class="kpi-label">Terceirizados</div><div class="kpi-val ${tercOk ? "ok" : "nok"}">${fN(par.percTerceiros)}%</div><div class="kpi-sub ${tercOk ? "ok" : "nok"}">máx 25%</div></div>
    <div class="kpi"><div class="kpi-label">Custo Produção</div><div class="kpi-val ${prodOk ? "ok" : "nok"}">${fN(par.custoProducaoPerc)}%</div><div class="kpi-sub ${prodOk ? "ok" : "nok"}">máx 30%</div></div>
    <div class="kpi"><div class="kpi-label">Despesas Gerais</div><div class="kpi-val ${despOk ? "ok" : "nok"}">${fN(par.percDespesasGerais)}%</div><div class="kpi-sub ${despOk ? "ok" : "nok"}">máx 7,5%</div></div>
  </div>

  <h2>Resumo Financeiro</h2>
  <div class="fin">
    <div class="fin-row"><span class="label">Valor Bruto</span><strong>${fV(par.V)}</strong></div>
    <div class="fin-row"><span class="label">Impostos (${fN(par.ip)}%)</span><strong>- ${fV(par.impostos)}</strong></div>
    <div class="fin-row"><span class="label">Taxa Adm. (${fN(par.ta)}%)</span><strong>- ${fV(par.taxaAdm)}</strong></div>
    <div class="fin-row"><span class="label">Comissão (7,5%)</span><strong>- ${fV(par.comissao)}</strong></div>
    <div class="fin-row destaque"><span>Receita Líquida</span><strong>${fV(par.receitaLiquida)}</strong></div>
    <div class="fin-row"><span class="label">Terceirizados</span><strong>- ${fV(par.totalTerceiros)}</strong></div>
    <div class="fin-row"><span class="label">Equipe Interna</span><strong>- ${fV(par.totalEquipe)}</strong></div>
    <div class="fin-row"><span class="label">Despesas Internas</span><strong>- ${fV(par.totalDespesasInternas)}</strong></div>
    <div class="fin-row"><span class="label">Despesas Gerais</span><strong>- ${fV(par.totalDespesas)}</strong></div>
    <div class="fin-row destaque"><span>Lucro Estimado</span><strong class="${margemOk ? "ok" : "nok"}">${fV(par.lucro)}</strong></div>
  </div>

  <h2>Informações Gerais</h2>
  <table>
    <tbody>
      ${infoRows.map(([l, v]) => `<tr><td style="width:40%;color:#64748B">${l}</td><td><strong>${v}</strong></td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Cronograma de Medições (${medicoes.length} etapa${medicoes.length !== 1 ? "s" : ""})</h2>
  ${rowsHtml(["Etapa / Descrição", "Valor (R$)", "%", "Data Prevista"],
    medicoes.map(m => [
      m.etapa || "—",
      m.valor ? fV(pBR(m.valor)) : "—",
      m.percentual ? `${m.percentual}%` : "—",
      fD(m.dataPrevisao),
    ])
  )}
  ${medicoes.length > 0 ? `<div class="total-row">Total: ${fV(medicoes.reduce((s, m) => s + pBR(m.valor), 0))} &nbsp;·&nbsp; Soma %: ${fN(medicoes.reduce((s, m) => s + pBR(m.percentual), 0), 2)}%</div>` : ""}

  <h2>Equipe Interna (${equipe.length} membro${equipe.length !== 1 ? "s" : ""} · ${fV(par.totalEquipe)})</h2>
  ${rowsHtml(["Colaborador", "Horas Est.", "R$/Hora", "Custo"],
    equipe.map(e => [
      e.colaborador || "—",
      `${pBR(e.horas)}h`,
      fV(pBR(e.mediaHora) || 36.4),
      fV(pBR(e.horas) * (pBR(e.mediaHora) || 36.4)),
    ])
  )}

  ${despesasInternas.length > 0 ? `
  <h2>Despesas Internas (${despesasInternas.length} · ${fV(par.totalDespesasInternas)})</h2>
  ${rowsHtml(["Serviço", "Vínculo (Medição)", "Ref. Contrato", "Custo", "% Custo/Ref."],
    despesasInternas.map(t => {
      const vRef = pBR(t.valorRef), vC = pBR(t.custo)
      return [t.servico || "—", t.vinculo || "—", fV(vRef), fV(vC), vRef > 0 ? `${((vC/vRef)*100).toFixed(1)}%` : "—"]
    })
  )}` : ""}

  <h2>Serviços Terceirizados (${terceirizados.length} · ${fV(par.totalTerceiros)})</h2>
  ${rowsHtml(["Serviço", "Vínculo (Medição)", "Ref. Contrato", "Custo", "% Custo/Ref."],
    terceirizados.map(t => {
      const vRef = pBR(t.valorRef), vC = pBR(t.custo)
      return [t.servico || "—", t.vinculo || "—", fV(vRef), fV(vC), vRef > 0 ? `${((vC/vRef)*100).toFixed(1)}%` : "—"]
    })
  )}

  ${despesas.length > 0 ? `
  <h2>Despesas Gerais (${despesas.length} · ${fV(par.totalDespesas)})</h2>
  ${rowsHtml(["Descrição", "Valor"],
    despesas.map(x => [x.descricao || "—", fV(pBR(x.valor))])
  )}` : ""}

  ${d.justificativa ? `
  <h2>Justificativa / Observações</h2>
  <div class="obs">${d.justificativa}</div>` : ""}
</body>
</html>`

    const janela = window.open("", "_blank")
    janela.document.write(html)
    janela.document.close()
    janela.focus()
    setTimeout(() => janela.print(), 600)
  }

  const medicoes = d.medicoes || []
  const equipe = d.equipe || []
  const despesasInternas = d.despesasInternas || []
  const terceirizados = d.terceirizados || []
  const despesas = d.despesas || []

  const fmtData = (s) => {
    if (!s) return "—"
    // ISO completo: "2026-07-20T..." ou só "2026-07-20"
    const match = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) return `${match[3]}/${match[2]}/${match[1]}`
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

      <div>
        {/* Cabeçalho do relatório */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
            Relatório PAR — Planejamento Aprovado
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 900, color: T.text1 }}>{plano.Nome_Projeto}</h1>
          <div style={{ fontSize: 12, color: T.text2, marginTop: 4 }}>
            {plano.Cliente && <span>Cliente: <strong>{plano.Cliente}</strong> &nbsp;·&nbsp; </span>}
            {plano.Setor && <span>Setor: <strong>{plano.Setor}</strong> &nbsp;·&nbsp; </span>}
            <span>Status: <strong style={{ color: "#15803D" }}>{plano.Status}</strong></span>
          </div>
        </div>

        {/* KPIs */}
        <h2 style={{ fontSize: 11, fontWeight: 800, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: `1.5px solid ${T.border}`, paddingBottom: 6 }}>Indicadores PAR</h2>
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
        <h2 style={{ fontSize: 11, fontWeight: 800, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: `1.5px solid ${T.border}`, paddingBottom: 6 }}>Resumo Financeiro</h2>
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
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: l === "Receita Líquida" || l === "Lucro Estimado" ? "#F0FDF4" : T.cardAlt, borderRadius: 6, fontSize: 12, border: `1px solid ${T.border}` }}>
              <span style={{ color: T.text2 }}>{l}</span>
              <span style={{ fontWeight: 700, color: l === "Lucro Estimado" ? (margemOk ? "#15803D" : "#DC2626") : T.text1 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Informações Gerais */}
        <h2 style={{ fontSize: 11, fontWeight: 800, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: `1.5px solid ${T.border}`, paddingBottom: 6 }}>Informações Gerais</h2>
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
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: T.cardAlt, borderRadius: 6, border: `1px solid ${T.border}` }}>
              <span style={{ color: T.text2 }}>{l}</span>
              <span style={{ fontWeight: 600, color: T.text1, textAlign: "right", maxWidth: 200 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Cronograma de Medições */}
        <h2 style={{ fontSize: 11, fontWeight: 800, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: `1.5px solid ${T.border}`, paddingBottom: 6 }}>
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
        <h2 style={{ fontSize: 11, fontWeight: 800, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: `1.5px solid ${T.border}`, paddingBottom: 6 }}>
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
          <h2 style={{ fontSize: 11, fontWeight: 800, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: `1.5px solid ${T.border}`, paddingBottom: 6 }}>
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
        <h2 style={{ fontSize: 11, fontWeight: 800, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: `1.5px solid ${T.border}`, paddingBottom: 6 }}>
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
          <h2 style={{ fontSize: 11, fontWeight: 800, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: `1.5px solid ${T.border}`, paddingBottom: 6 }}>
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
            <h2 style={{ fontSize: 11, fontWeight: 800, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, borderBottom: `1.5px solid ${T.border}`, paddingBottom: 6 }}>Justificativa / Observações</h2>
            <div style={{ padding: "12px 14px", background: isDark ? "#2D1F00" : "#FFFBEB", borderRadius: 8, border: `1px solid ${isDark ? "#78350F" : "#FDE68A"}`, fontSize: 12, color: isDark ? "#FCD34D" : "#92400E", lineHeight: 1.6, marginBottom: 20 }}>
              {d.justificativa}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function imprimirConsolidado(lista, detalhes) {
  const fD = (s) => {
    if (!s) return "—"
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s
  }
  const fV = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)

  const blocos = lista.map(p => {
    const d = detalhes[p.ID_Projeto]?.dadosCompletos || detalhes[p.ID_Projeto] || {}
    const medicoes = d.medicoes || d._baseline?.medicoes || []
    const valorContrato = pBR(d.valorContrato || p.Valor_Contrato)

    const linhasMedicoes = medicoes.length > 0
      ? `<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px">
          <thead>
            <tr style="background:#F1F5F9">
              <th style="padding:6px 10px;text-align:left;font-weight:700;color:#475569;border:1px solid #E2E8F0">Etapa</th>
              <th style="padding:6px 10px;text-align:center;font-weight:700;color:#475569;border:1px solid #E2E8F0">%</th>
              <th style="padding:6px 10px;text-align:right;font-weight:700;color:#475569;border:1px solid #E2E8F0">Valor</th>
              <th style="padding:6px 10px;text-align:center;font-weight:700;color:#475569;border:1px solid #E2E8F0">Data Prevista</th>
            </tr>
          </thead>
          <tbody>
            ${medicoes.map((m, i) => `
              <tr style="background:${i % 2 === 0 ? '#fff' : '#F8FAFC'}">
                <td style="padding:6px 10px;border:1px solid #E2E8F0;color:#0F172A;font-weight:600">${m.etapa || "—"}</td>
                <td style="padding:6px 10px;border:1px solid #E2E8F0;text-align:center;color:#7C3AED;font-weight:700">${m.percentual ? m.percentual + "%" : "—"}</td>
                <td style="padding:6px 10px;border:1px solid #E2E8F0;text-align:right;color:#0F172A;font-weight:700">${m.valor ? fV(pBR(m.valor)) : "—"}</td>
                <td style="padding:6px 10px;border:1px solid #E2E8F0;text-align:center;color:#475569">${fD(m.dataPrevisao || m.data_previsao)}</td>
              </tr>`).join("")}
          </tbody>
        </table>`
      : `<p style="font-size:12px;color:#94A3B8;margin:6px 0">Nenhuma medição cadastrada.</p>`

    return `
      <div style="break-inside:avoid;margin-bottom:28px;border:1.5px solid #E2E8F0;border-radius:10px;overflow:hidden">
        <div style="background:#F8FAFC;padding:14px 18px;border-bottom:1px solid #E2E8F0">
          <div style="font-size:15px;font-weight:800;color:#0F172A">${p.Nome_Projeto || "—"}</div>
          <div style="font-size:12px;color:#64748B;margin-top:3px">${p.Cliente || "—"}</div>
        </div>
        <div style="padding:12px 18px">
          <div style="display:inline-block;background:#EDE9FE;color:#7C3AED;font-weight:700;font-size:12px;padding:4px 12px;border-radius:6px;margin-bottom:10px">
            Valor do Contrato: ${fV(valorContrato)}
          </div>
          <div style="font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Cronograma de Medições</div>
          ${linhasMedicoes}
        </div>
      </div>`
  }).join("")

  const html = `<!DOCTYPE html>
  <html><head>
    <meta charset="utf-8"/>
    <title>Relatório Consolidado — Planejamentos Aprovados</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; color: #0F172A; background: #fff; padding: 32px; }
      @media print { body { padding: 16px; } }
    </style>
  </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:28px;border-bottom:2.5px solid #7C3AED;padding-bottom:16px">
      <div>
        <div style="font-size:20px;font-weight:900;color:#0F172A;text-transform:uppercase;letter-spacing:0.04em">Relatório Consolidado</div>
        <div style="font-size:13px;color:#64748B;margin-top:4px">Planejamentos Aprovados — ${new Date().toLocaleDateString("pt-BR")}</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:#7C3AED;background:#EDE9FE;padding:6px 14px;border-radius:8px">${lista.length} projeto(s)</div>
    </div>
    ${blocos}
  </body></html>`

  const w = window.open("", "_blank")
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

export default function RelatoriosPlanejamentoPAR() {
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const T = {
    bg:      isDark ? '#0F172A' : '#F8FAFC',
    card:    isDark ? '#1E293B' : '#ffffff',
    cardAlt: isDark ? '#0F172A' : '#F8FAFC',
    border:  isDark ? '#334155' : '#E2E8F0',
    text1:   isDark ? '#F1F5F9' : '#0F172A',
    text2:   isDark ? '#94A3B8' : '#64748B',
    text3:   isDark ? '#475569' : '#94A3B8',
    inputBg: isDark ? '#1E293B' : '#F8FAFC',
  }
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
        const aprovados = (Array.isArray(r.data) ? r.data : []).filter(p => (p.Status || "").toLowerCase() === "aprovado")
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
        <button onClick={() => navigate("/planejamento")}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.card, color: T.text2, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          <ArrowLeft size={15} /> Planejamento
        </button>
        <FileText size={22} color="#7C3AED" />
        <span style={{ fontWeight: 900, fontSize: 18, color: T.text1, textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>
          Relatórios — Planejamentos Aprovados
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#15803D", background: "#DCFCE7", padding: "4px 12px", borderRadius: 20 }}>
          {filtrados.length} projeto(s) aprovado(s)
        </span>
        <button onClick={() => imprimirConsolidado(filtrados, detalhes)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: "#7C3AED", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          <Printer size={15} /> PDF Consolidado
        </button>
      </div>

      {/* Filtros */}
      <div style={{ background: T.card, borderRadius: 14, padding: "16px 20px", border: `1.5px solid ${T.border}`, marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SETORES.map(s => (
            <button key={s} onClick={() => setFiltroSetor(filtroSetor === s ? "" : s)}
              style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${filtroSetor === s ? "#7C3AED" : T.border}`, background: filtroSetor === s ? "#EDE9FE" : T.cardAlt, color: filtroSetor === s ? "#7C3AED" : T.text2, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", gap: 8, background: T.inputBg, border: `1.5px solid ${T.border}`, borderRadius: 20, padding: "5px 12px" }}>
          <Search size={14} color={T.text3} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar projeto ou cliente..."
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, flex: 1, color: T.text1, fontFamily: "inherit" }} />
          {busca && <button onClick={() => setBusca("")} style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, display: "flex" }}><X size={14} /></button>}
        </div>
        {(filtroSetor || busca) && (
          <button onClick={() => { setFiltroSetor(""); setBusca("") }}
            style={{ padding: "5px 12px", borderRadius: 20, border: "1.5px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            Limpar
          </button>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: T.text2 }}>
          Carregando planejamentos aprovados...
        </div>
      )}

      {!loading && filtrados.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, background: T.cardAlt, borderRadius: 16, border: `2px dashed ${T.border}` }}>
          <FileText size={40} color={T.text3} style={{ margin: "0 auto 12px" }} />
          <div style={{ fontWeight: 700, fontSize: 15, color: T.text2 }}>Nenhum planejamento aprovado encontrado</div>
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
            <div key={p.ID_Projeto} style={{ background: T.card, borderRadius: 14, border: `1.5px solid ${estaAberto ? "#7C3AED" : T.border}`, overflow: "hidden", transition: "border-color 0.2s" }}>
              {/* Linha resumo — clicável */}
              <button onClick={() => setAberto(estaAberto ? null : p.ID_Projeto)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: estaAberto ? (isDark ? '#1E1040' : '#FAFAFF') : T.card, border: "none", cursor: "pointer", textAlign: "left" }}>
                {estaAberto ? <ChevronDown size={16} color="#7C3AED" /> : <ChevronRight size={16} color={T.text3} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: T.text1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.Nome_Projeto}
                  </div>
                  <div style={{ fontSize: 11, color: T.text2, marginTop: 2 }}>{p.Cliente}</div>
                </div>
                {p.Setor && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>{p.Setor}</span>
                )}
                {par && (
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: T.text2, flexShrink: 0 }}>
                    <span><span style={{ fontWeight: 700, color: T.text1 }}>{fmt(par.V)}</span> contrato</span>
                    <span style={{ fontWeight: 700, color: margemOk ? "#15803D" : "#DC2626" }}>{fmtN(par.lucroPerc)}% margem</span>
                  </div>
                )}
                <span style={{ fontSize: 11, fontWeight: 700, color: "#15803D", background: "#DCFCE7", padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0 }}>
                  Aprovado
                </span>
              </button>

              {/* Detalhe expandido */}
              {estaAberto && (
                <div style={{ padding: "0 24px 24px", borderTop: `1px solid ${T.border}` }}>
                  {!detalhe ? (
                    <div style={{ padding: 20, color: T.text2, fontSize: 13 }}>Carregando detalhes...</div>
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
