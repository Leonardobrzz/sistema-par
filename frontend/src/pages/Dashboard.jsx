import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  FolderOpen, Briefcase, CheckCircle2, Clock, Shield, Bell,
  TrendingUp, Target, Calendar, AlertTriangle, Activity,
  ArrowRight, BarChart2, PieChart as PieIcon, BadgeDollarSign,
} from 'lucide-react'
import api from '../utils/api'
import PaineisClickUp from '../components/PaineisClickUp'
import ProjetosClickUp from '../components/ProjetosClickUp'

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v || 0)
const fmtFull = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtN = (v, dec = 1) => Number(v || 0).toFixed(dec)

const STATUS_COLORS = {
  'Em Andamento':           '#22C55E',
  'Em Andamento (Atrasado)':'#EF4444',
  'A Planejar':             '#F59E0B',
  'Planejado':              '#8B5CF6',
  'Concluído':              '#0EA5E9',
  'Pausado':                '#94A3B8',
}

const STATUS_BG = {
  'Em Andamento':           { bg: '#DCFCE7', color: '#15803D' },
  'Em Andamento (Atrasado)':{ bg: '#FEE2E2', color: '#DC2626' },
  'A Planejar':             { bg: '#FEF3C7', color: '#D97706' },
  'Planejado':              { bg: '#EDE9FE', color: '#7C3AED' },
  'Concluído':              { bg: '#E0F2FE', color: '#0369A1' },
  'Pausado':                { bg: '#F1F5F9', color: '#64748B' },
}

function calcKpisFromPlan(plan) {
  try {
    const d = JSON.parse(plan.Dados_JSON || '{}')
    const V = parseFloat(d.valorContrato || plan.Valor_Contrato || 0)
    if (V === 0) return null
    const ip = Math.max(parseFloat(d.impostosPerc || 20), 16.33)
    const ta = Math.max(parseFloat(d.taxaAdmPerc || 12), 5)
    const co = 7.5
    const recLiq = V * (1 - (ip + ta + co) / 100)
    const custoEquipe = (d.equipe || []).reduce((s, e) => s + parseFloat(e.horas || 0) * parseFloat(e.mediaHora || 36.40), 0)
    const custoTerc = (d.terceirizados || []).reduce((s, t) => s + parseFloat(t.custo || 0), 0)
    const despesas = (d.despesas || []).reduce((s, dsp) => s + parseFloat(dsp.valor || 0), 0)
    const custoTotal = custoEquipe + custoTerc + despesas
    const lucro = recLiq - custoTotal
    return { V, lucroPerc: (lucro / V) * 100, tercPerc: (custoTerc / V) * 100, prodPerc: ((custoEquipe + custoTerc) / V) * 100 }
  } catch { return null }
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, color = '#7C3AED', warn, onClick }) {
  const isWarn = warn === 'danger'
  const isCaution = warn === 'caution'
  return (
    <div
      onClick={onClick}
      style={{
        background: isWarn ? '#FEF2F2' : isCaution ? '#FFFBEB' : '#fff',
        border: `1.5px solid ${isWarn ? '#FECACA' : isCaution ? '#FDE68A' : '#E2E8F0'}`,
        borderRadius: 16, padding: '20px 22px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.18s',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.09)' } }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.04)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: isWarn ? '#DC2626' : isCaution ? '#D97706' : color, lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: '#64748B', marginTop: 5 }}>{sub}</div>}
        </div>
        <div style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: isWarn ? '#FEE2E2' : isCaution ? '#FEF3C7' : `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isWarn ? '#DC2626' : isCaution ? '#D97706' : color,
        }}>{icon}</div>
      </div>
    </div>
  )
}

function avaliarSaude(p) {
  const status = p.Status || ''
  const perc = parseInt(p.Progresso_Perc || 0)
  const alertas = []
  const hoje = Date.now()

  // Projetos com 100% de progresso são OK independente da data
  if (perc >= 100) return { nivel: 'ok', alertas: [] }

  if (!p.Data_Entrega_Contrato) {
    alertas.push({ label: 'Sem data de entrega', tipo: perc >= 80 ? 'caution' : 'danger' })
  } else {
    const venc = new Date(p.Data_Entrega_Contrato).getTime()
    if (venc < hoje) {
      const diasAtraso = Math.floor((hoje - venc) / 86400000)
      alertas.push({ label: `Vencido há ${diasAtraso}d`, tipo: 'danger' })
    }
  }

  if (status === 'Em Andamento (Atrasado)' || status === 'Atrasado') {
    alertas.push({ label: 'Tarefas atrasadas', tipo: 'caution' })
  }

  const nivel = alertas.some(a => a.tipo === 'danger') ? 'danger' : alertas.length > 0 ? 'caution' : 'ok'
  return { nivel, alertas }
}

function SemafProjeto({ projeto, onClick }) {
  const status = projeto.Status || ''
  const { nivel, alertas } = avaliarSaude(projeto)
  const dot = nivel === 'danger' ? '#EF4444' : nivel === 'caution' ? '#F59E0B' : '#22C55E'
  const borda = nivel === 'danger' ? '#FECACA' : nivel === 'caution' ? '#FDE68A' : '#E2E8F0'

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', border: `1.5px solid ${borda}`,
        borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
        transition: 'all 0.18s', display: 'flex', flexDirection: 'column', gap: 6,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: dot, flexShrink: 0, marginTop: 3, boxShadow: `0 0 0 3px ${dot}30` }} />
        <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {projeto.Nome || '—'}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#64748B', paddingLeft: 17 }}>{projeto.Cliente || '—'}</div>
      {projeto.Responsavel && <div style={{ fontSize: 10, color: '#94A3B8', paddingLeft: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projeto.Responsavel}</div>}
      {alertas.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingLeft: 17 }}>
          {alertas.map((a, i) => (
            <span key={i} style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              background: a.tipo === 'danger' ? '#FEE2E2' : '#FEF3C7',
              color: a.tipo === 'danger' ? '#DC2626' : '#D97706',
            }}>{a.label}</span>
          ))}
        </div>
      )}
      <div style={{
        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
        background: (STATUS_BG[status] || STATUS_BG['Pausado']).bg,
        color: (STATUS_BG[status] || STATUS_BG['Pausado']).color,
        alignSelf: 'flex-start', marginLeft: 17,
      }}>{status || 'Sem status'}</div>
    </div>
  )
}

function MiniTag({ label, ok, danger }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
      background: danger ? '#FEE2E2' : ok ? '#DCFCE7' : '#FEF3C7',
      color: danger ? '#DC2626' : ok ? '#15803D' : '#D97706',
    }}>{label}</span>
  )
}

function PARGauge({ label, value, min, max, limitOk, limitWarn, unit = '%', invert = false }) {
  const perc = Math.min(Math.max((value / max) * 100, 0), 100)
  const ok = invert ? value >= limitOk : value <= limitOk
  const warn = !ok && (invert ? value >= limitWarn : value <= limitWarn)
  const color = ok ? '#22C55E' : warn ? '#F59E0B' : '#EF4444'
  const label2 = ok ? 'Conforme' : warn ? 'Atenção' : 'Violação'

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 900, color }}>{fmtN(value)}{unit}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${color}18`, color }}>{label2}</span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 10, background: '#F1F5F9', borderRadius: 99, overflow: 'visible' }}>
        <div style={{ height: '100%', width: `${perc}%`, background: color, borderRadius: 99, transition: 'width 0.7s cubic-bezier(.4,0,.2,1)' }} />
        {/* Linha de limite */}
        <div style={{
          position: 'absolute', top: -4, bottom: -4,
          left: `${((invert ? limitOk : limitOk) / max) * 100}%`,
          width: 2, background: '#94A3B8', borderRadius: 1,
        }} />
      </div>
      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>
        Limite PAR: {invert ? `≥ ${limitOk}${unit}` : `≤ ${limitOk}${unit}`}
      </div>
    </div>
  )
}

const CustomTooltipBar = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: '#0F172A' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 12, color: p.color, fontWeight: 600 }}>
          {p.name}: {fmtFull(p.value)}
        </div>
      ))}
    </div>
  )
}

// ── Dashboard principal ──────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const [projetos, setProjetos] = useState([])
  const [planejamentos, setPlanejamentos] = useState([])
  const [medicoes, setMedicoes] = useState([])
  const [alertas, setAlertas] = useState([])
  const [oppStatus, setOppStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mostrarTodosSaude, setMostrarTodosSaude] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [rP, rPl, rA, rM] = await Promise.allSettled([
        api.get('/projetos'),
        api.get('/planejamento'),
        api.get('/alertas?status=ativo&limit=20'),
        api.get('/medicoes'),
      ])
      if (rP.status === 'fulfilled') setProjetos(rP.value.data?.projetos || rP.value.data || [])
      if (rPl.status === 'fulfilled') setPlanejamentos(rPl.value.data?.planejamentos || rPl.value.data || [])
      if (rA.status === 'fulfilled') setAlertas(rA.value.data?.alertas || rA.value.data || [])
      if (rM.status === 'fulfilled') setMedicoes(rM.value.data?.medicoes || rM.value.data || [])
      api.get('/opp/status').then(r => setOppStatus(r.data)).catch(() => setOppStatus({ ok: false }))
      setLoading(false)
    }
    load()
  }, [])

  // ── Cálculos ──
  const aprovados = planejamentos.filter(p => p.Status === 'Aprovado')
  const pendentesAprov = planejamentos.filter(p => p.Status === 'Pendente Aprovação')
  const emAndamento = projetos.filter(p => p.Status?.includes('Em Andamento'))
  const aPlanejar = projetos.filter(p => p.Status === 'A Planejar')
  const concluidos = projetos.filter(p => p.Status === 'Concluído')

  // KPIs PAR ponderados
  const kpisReais = (() => {
    const plans = aprovados.map(calcKpisFromPlan).filter(Boolean)
    if (!plans.length) return null
    const totalV = plans.reduce((s, k) => s + k.V, 0)
    if (!totalV) return null
    return {
      lucroPerc: plans.reduce((s, k) => s + k.lucroPerc * k.V, 0) / totalV,
      tercPerc: plans.reduce((s, k) => s + k.tercPerc * k.V, 0) / totalV,
      prodPerc: plans.reduce((s, k) => s + k.prodPerc * k.V, 0) / totalV,
      count: plans.length,
    }
  })()

  const totalContrato = aprovados.reduce((s, p) => s + parseFloat(p.Valor_Contrato || 0), 0)
  const totalRecebido = medicoes.filter(m => m.Status_Financeiro === 'Recebido').reduce((s, m) => s + parseFloat(m.Valor_Medicao || 0), 0)
  const totalAReceber = medicoes.filter(m => m.Status_Financeiro !== 'Recebido' && m.Status !== 'Cancelada').reduce((s, m) => s + parseFloat(m.Valor_Medicao || 0), 0)
  const alertasCriticos = alertas.filter(a => a.Nivel === 'error')

  // Dados para gráfico de distribuição por status (apenas ativos)
  const STATUS_VISIVEIS_GRAFICO = ['Backlog', 'A Planejar', 'Em Andamento', 'Em Andamento (Atrasado)', 'Paralisado', 'Pausado']
  const statusData = Object.entries(
    projetos
      .filter(p => STATUS_VISIVEIS_GRAFICO.includes(p.Status))
      .reduce((acc, p) => {
        const s = p.Status || 'Outros'
        acc[s] = (acc[s] || 0) + 1
        return acc
      }, {})
  ).map(([name, value]) => ({ name, value }))

  // Dados para gráfico financeiro (últimas medições por mês)
  const medicoesPorMes = (() => {
    const meses = {}
    medicoes.forEach(m => {
      const d = m.Data_Prevista || m.Data_Emissao_NF
      if (!d) return
      const key = d.slice(0, 7)
      if (!meses[key]) meses[key] = { mes: key, previsto: 0, recebido: 0 }
      meses[key].previsto += parseFloat(m.Valor_Medicao || 0)
      if (m.Status_Financeiro === 'Recebido') meses[key].recebido += parseFloat(m.Valor_Medicao || 0)
    })
    return Object.values(meses).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-6).map(m => ({
      ...m,
      label: new Date(m.mes + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    }))
  })()

  // Próximas medições (30 dias)
  const hoje = new Date()
  const daqui30 = new Date(hoje); daqui30.setDate(daqui30.getDate() + 30)
  const proximasMedicoes = medicoes
    .filter(m => {
      const d = m.Data_Prevista ? new Date(m.Data_Prevista) : null
      return d && d >= hoje && d <= daqui30 && m.Status !== 'Cancelada' && m.Status !== 'Concluída'
    })
    .sort((a, b) => new Date(a.Data_Prevista) - new Date(b.Data_Prevista))
    .slice(0, 5)

  // Projetos enriquecidos com KPIs e dias sem atualizar, ordenados por risco
  const NIVEL_ORD = { danger: 0, caution: 1, ok: 2 }
  const projetosRicos = projetos
    .map(p => {
      const plan = aprovados.find(pl => pl.ID_Projeto === p.ID_Projeto)
      const kpis = plan ? calcKpisFromPlan(plan) : null
      const d = p.Atualizado_Em || p.Criado_Em
      const semAtualizar = d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0
      const enriquecido = { ...p, _kpis: kpis, _semAtualizar: semAtualizar }
      return { ...enriquecido, _nivel: avaliarSaude(enriquecido).nivel }
    })
    .sort((a, b) => NIVEL_ORD[a._nivel] - NIVEL_ORD[b._nivel])
  const projetosExibidos = mostrarTodosSaude ? projetosRicos : projetosRicos.slice(0, 12)
  const countDanger = projetosRicos.filter(p => p._nivel === 'danger').length
  const countCaution = projetosRicos.filter(p => p._nivel === 'caution').length

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto', background: '#F8FAFC', minHeight: '100vh' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>Dashboard PAR</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {alertasCriticos.length > 0 && (
            <button onClick={() => navigate('/alertas')} style={{
              padding: '8px 16px', borderRadius: 10, border: 'none',
              background: '#EF4444', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <AlertTriangle size={14} /> {alertasCriticos.length} alerta(s) crítico(s)
            </button>
          )}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
            background: oppStatus?.ok ? '#DCFCE7' : oppStatus?.ok === false ? '#FEE2E2' : '#F1F5F9',
            border: `1px solid ${oppStatus?.ok ? '#86EFAC' : oppStatus?.ok === false ? '#FCA5A5' : '#E2E8F0'}`,
            fontSize: 12, fontWeight: 700,
            color: oppStatus?.ok ? '#15803D' : oppStatus?.ok === false ? '#DC2626' : '#94A3B8',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: oppStatus?.ok ? '#22C55E' : oppStatus?.ok === false ? '#EF4444' : '#94A3B8', display: 'inline-block' }} />
            OPP {oppStatus?.ok ? 'Online' : oppStatus?.ok === false ? 'Offline' : '...'}
          </div>
        </div>
      </div>

      {/* ── Banners de urgência ── */}
      {pendentesAprov.length > 0 && (
        <div style={{ padding: '14px 20px', borderRadius: 12, marginBottom: 14, background: '#EDE9FE', border: '1.5px solid #C4B5FD', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Shield size={20} style={{ color: '#7C3AED', flexShrink: 0 }} />
          <div style={{ flex: 1, fontWeight: 700, color: '#5B21B6', fontSize: 14 }}>
            {pendentesAprov.length} planejamento(s) aguardando aprovação da Diretoria
          </div>
          <button onClick={() => navigate('/aprovacao')} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            Aprovar Agora <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* ── 4 KPI Cards financeiros ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="Projetos em Andamento" value={emAndamento.length} sub={`${projetos.length} total · ${concluidos.length} concluídos`} icon={<FolderOpen size={20} />} color="#0EA5E9" onClick={() => navigate('/projetos')} />
        <StatCard label="Carteira Aprovada" value={fmt(totalContrato)} sub={`${aprovados.length} planejamento(s) aprovado(s)`} icon={<Briefcase size={20} />} color="#7C3AED" />
        <StatCard label="Total Recebido" value={fmt(totalRecebido)} sub="medições com status Recebido" icon={<CheckCircle2 size={20} />} color="#16A34A" />
        <StatCard label="A Receber" value={fmt(totalAReceber)} sub="medições pendentes/em andamento" icon={<BadgeDollarSign size={20} />} color="#D97706"
          warn={totalAReceber > 0 ? 'caution' : null} onClick={() => navigate('/medicoes')} />
      </div>

      {/* ── Linha 2: Gráfico financeiro + KPIs PAR ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Gráfico de barras — Medições por mês */}
        <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <BadgeDollarSign size={16} style={{ color: '#7C3AED' }} />
            <span style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Faturamento Previsto vs. Recebido</span>
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 20 }}>Últimos 6 meses · medições</div>
          {medicoesPorMes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: 13 }}>
              Nenhuma medição com data registrada ainda
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={medicoesPorMes} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8', fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v)} width={70} />
                <Tooltip content={<CustomTooltipBar />} />
                <Bar dataKey="previsto" name="Previsto" fill="#C4B5FD" radius={[6, 6, 0, 0]} />
                <Bar dataKey="recebido" name="Recebido" fill="#7C3AED" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* KPIs PAR com gauge */}
        <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Target size={16} style={{ color: '#7C3AED' }} />
            <span style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Regras PAR</span>
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 20 }}>
            {kpisReais ? `Média de ${kpisReais.count} plano(s) aprovado(s)` : 'Sem planejamentos aprovados'}
          </div>
          {!kpisReais ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#94A3B8', fontSize: 13 }}>
              Aprove um planejamento para ver os KPIs
            </div>
          ) : (
            <>
              <PARGauge label="Margem de Lucro" value={kpisReais.lucroPerc} max={50} limitOk={23} limitWarn={15} invert />
              <PARGauge label="% Terceirizados" value={kpisReais.tercPerc} max={40} limitOk={25} limitWarn={30} />
              <PARGauge label="Custo de Produção" value={kpisReais.prodPerc} max={50} limitOk={30} limitWarn={35} />
            </>
          )}
        </div>
      </div>

      {/* ── Linha 3: Pizza status + Próximas medições ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, marginBottom: 20 }}>

        {/* Pizza de status dos projetos */}
        <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <PieIcon size={16} style={{ color: '#7C3AED' }} />
            <span style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Projetos por Status</span>
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8 }}>{projetos.length} projetos no total</div>
          {projetos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: 13 }}>Nenhum projeto cadastrado</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.name] || '#94A3B8'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Próximas medições */}
        <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={16} style={{ color: '#7C3AED' }} />
              <span style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Próximas Medições</span>
            </div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Vencendo nos próximos 30 dias</div>
            </div>
            <button onClick={() => navigate('/medicoes')} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: 11, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
              Ver todas →
            </button>
          </div>
          {proximasMedicoes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#94A3B8', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={28} style={{ color: '#22C55E', opacity: 0.7 }} />
              Nenhuma medição vencendo nos próximos 30 dias
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {proximasMedicoes.map((m, i) => {
                const dias = Math.ceil((new Date(m.Data_Prevista) - hoje) / 86400000)
                const urgente = dias <= 7
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    borderRadius: 10, background: urgente ? '#FEF2F2' : '#F8FAFC',
                    border: `1px solid ${urgente ? '#FECACA' : '#E2E8F0'}`,
                  }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                      background: urgente ? '#EF444420' : '#7C3AED18',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: urgente ? '#EF4444' : '#7C3AED', lineHeight: 1 }}>{dias}</span>
                      <span style={{ fontSize: 8, color: '#94A3B8', fontWeight: 600 }}>dias</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.nomeProjeto || m.ID_Projeto}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>{m.Descricao || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#7C3AED' }}>
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(m.Valor_Medicao || 0)}
                      </div>
                      <div style={{ fontSize: 10, color: '#94A3B8' }}>
                        {new Date(m.Data_Prevista).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Semáforo de projetos ── */}
      <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} style={{ color: '#7C3AED' }} />
              <span style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Saúde dos Projetos</span>
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ color: '#22C55E', fontWeight: 700 }}>● OK {projetosRicos.length - countDanger - countCaution}</span>
              <span style={{ color: '#F59E0B', fontWeight: 700 }}>● Atenção {countCaution}</span>
              <span style={{ color: '#EF4444', fontWeight: 700 }}>● Risco {countDanger}</span>
            </div>
          </div>
          <button onClick={() => navigate('/projetos')} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: 11, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
            Ver todos →
          </button>
        </div>
        {projetos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#94A3B8', fontSize: 13 }}>Nenhum projeto cadastrado</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {projetosExibidos.map((p, i) => (
                <SemafProjeto key={i} projeto={p} onClick={() => navigate(`/acompanhamento?projeto=${p.ID_Projeto}`)} />
              ))}
            </div>
            {projetosRicos.length > 12 && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button
                  onClick={() => setMostrarTodosSaude(v => !v)}
                  style={{ padding: '7px 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: 12, fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                >
                  {mostrarTodosSaude ? 'Ver menos ▲' : `Ver todos os ${projetosRicos.length} projetos ▼`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Projetos ClickUp por Setor ── */}
      <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 20 }}>
        <ProjetosClickUp />
      </div>

      {/* ── Painéis ClickUp ── */}
      <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 20 }}>
        <PaineisClickUp />
      </div>

    </div>
  )
}
