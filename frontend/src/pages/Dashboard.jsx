import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  FolderOpen, Briefcase, CheckCircle2, Clock, Shield, Bell,
  TrendingUp, Target, Calendar, AlertTriangle, Activity,
  ArrowRight, BarChart2, PieChart as PieIcon, BadgeDollarSign,
  SlidersHorizontal, X, Check,
} from 'lucide-react'
import api from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
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

// Definição de todas as seções disponíveis
const SECOES_DISPONIVEIS = [
  { id: 'kpis',        label: 'Cards KPI',              desc: 'Projetos em andamento, carteira, recebido, a receber' },
  { id: 'financeiro',  label: 'Gráfico de Faturamento', desc: 'Faturamento previsto vs recebido (6 meses)' },
  { id: 'par',         label: 'Regras PAR',              desc: 'Margem de lucro, terceirizados, custo de produção' },
  { id: 'pizza',       label: 'Projetos por Status',     desc: 'Distribuição dos projetos por status' },
  { id: 'medicoes',    label: 'Próximas Medições',       desc: 'Medições vencendo nos próximos 30 dias' },
  { id: 'saude',       label: 'Saúde dos Projetos',      desc: 'Semáforo de risco por projeto' },
  { id: 'clickup',     label: 'Projetos ClickUp',        desc: 'Projetos por setor sincronizados do ClickUp' },
  { id: 'paineis',     label: 'Painéis ClickUp',         desc: 'Painéis de tarefas do ClickUp' },
]

const SECOES_DEFAULT = SECOES_DISPONIVEIS.map(s => s.id)

function loadPrefs() {
  try {
    const s = localStorage.getItem('par_dashboard_secoes')
    if (s) return JSON.parse(s)
  } catch {}
  return SECOES_DEFAULT
}

function savePrefs(secoes) {
  localStorage.setItem('par_dashboard_secoes', JSON.stringify(secoes))
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

function StatCard({ label, value, sub, icon, color = '#7C3AED', bg, warn, onClick }) {
  const isWarn = warn === 'danger'
  const isCaution = warn === 'caution'
  const solidBg = isWarn ? '#EF4444' : isCaution ? '#F59E0B' : (bg || color)
  return (
    <div
      onClick={onClick}
      style={{
        background: solidBg,
        borderRadius: 16, padding: '20px 22px',
        boxShadow: `0 4px 20px ${solidBg}55`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.18s',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 10px 32px ${solidBg}77` } }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `0 4px 20px ${solidBg}55` }}
    >
      {/* Decorative circle */}
      <div style={{ position:'absolute', right:-18, top:-18, width:90, height:90, borderRadius:'50%', background:'rgba(255,255,255,.12)', pointerEvents:'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position:'relative' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.75)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.65)', marginTop: 5 }}>{sub}</div>}
        </div>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: 'rgba(255,255,255,.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff',
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
        <div style={{
          position: 'absolute', top: -4, bottom: -4,
          left: `${(limitOk / max) * 100}%`,
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

// ── Painel de personalização ─────────────────────────────────────────────────

function PainelPersonalizar({ secoes, onChange, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  function toggle(id) {
    if (secoes.includes(id)) {
      onChange(secoes.filter(s => s !== id))
    } else {
      // Mantém ordem original
      onChange(SECOES_DISPONIVEIS.map(s => s.id).filter(s => [...secoes, id].includes(s)))
    }
  }

  return (
    <div ref={ref} style={{
      position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 100,
      background: '#fff', borderRadius: 16, border: '1.5px solid #E2E8F0',
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)', width: 320, padding: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>Personalizar Dashboard</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex', alignItems: 'center' }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SECOES_DISPONIVEIS.map(s => {
          const ativo = secoes.includes(s.id)
          return (
            <div key={s.id} onClick={() => toggle(s.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderRadius: 10, cursor: 'pointer',
              background: ativo ? '#F5F3FF' : '#F8FAFC',
              border: `1.5px solid ${ativo ? '#C4B5FD' : '#E2E8F0'}`,
              transition: 'all 0.15s',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                background: ativo ? '#7C3AED' : '#E2E8F0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {ativo && <Check size={12} color="#fff" strokeWidth={3} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: ativo ? '#5B21B6' : '#374151' }}>{s.label}</div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{s.desc}</div>
              </div>
            </div>
          )
        })}
      </div>
      <button onClick={() => onChange(SECOES_DEFAULT)} style={{
        width: '100%', marginTop: 12, padding: '8px 0', borderRadius: 8,
        border: '1.5px solid #E2E8F0', background: '#F8FAFC',
        fontSize: 12, fontWeight: 700, color: '#64748B', cursor: 'pointer',
      }}>
        Restaurar padrão
      </button>
    </div>
  )
}

// ── Dashboard principal ──────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [projetos, setProjetos] = useState([])
  const [planejamentos, setPlanejamentos] = useState([])
  const [medicoes, setMedicoes] = useState([])
  const [alertas, setAlertas] = useState([])
  const [oppStatus, setOppStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mostrarTodosSaude, setMostrarTodosSaude] = useState(false)
  const [filtroSetor, setFiltroSetor] = useState('')
  const [secoesVisiveis, setSecoesVisiveis] = useState(loadPrefs)
  const [mostrarPersonalizar, setMostrarPersonalizar] = useState(false)
  const [periodoRecebido, setPeriodoRecebido] = useState({ inicio: '', fim: '' })

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

  function handleSetSecoes(novas) {
    setSecoesVisiveis(novas)
    savePrefs(novas)
  }

  const vis = (id) => secoesVisiveis.includes(id)

  // Setores disponíveis extraídos dos projetos
  const setoresDisponiveis = [...new Set(projetos.map(p => p.Setor).filter(Boolean))].sort()

  // Aplica filtro de setor nos projetos
  const projetosFiltrados = filtroSetor ? projetos.filter(p => p.Setor === filtroSetor) : projetos
  const medicoesFiltradas = filtroSetor
    ? medicoes.filter(m => {
        const proj = projetos.find(p => p.ID_Projeto === m.ID_Projeto)
        return proj?.Setor === filtroSetor
      })
    : medicoes

  // ── Cálculos ──
  const aprovados = planejamentos.filter(p => p.Status === 'Aprovado' && (!filtroSetor || p.Setor === filtroSetor))
  const pendentesAprov = planejamentos.filter(p => p.Status === 'Pendente Aprovação')
  const emAndamento = projetosFiltrados.filter(p => p.Status?.includes('Em Andamento'))
  const aPlanejar = projetosFiltrados.filter(p => p.Status === 'A Planejar')
  const concluidos = projetosFiltrados.filter(p => p.Status === 'Concluído')

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
  const medicoesPeriodo = medicoesFiltradas.filter(m => {
    if (m.Status_Financeiro !== 'Recebido') return false
    const d = m.Data_Recebimento || m.Data_Previsao || m.Data_Prevista || m.Data_Emissao_NF
    if (!d) return true
    if (periodoRecebido.inicio && d < periodoRecebido.inicio) return false
    if (periodoRecebido.fim && d > periodoRecebido.fim) return false
    return true
  })
  const totalRecebido = medicoesPeriodo.reduce((s, m) => s + parseFloat(m.Valor_Medicao || m.Valor || 0), 0)

  // A Receber: soma medições da tabela + medições planejadas dos planejamentos aprovados
  const totalAReceberTabela = medicoesFiltradas.filter(m => m.Status_Financeiro !== 'Recebido' && m.Status !== 'Cancelada').reduce((s, m) => s + parseFloat(m.Valor_Medicao || m.Valor || 0), 0)
  const totalAReceberPlanejado = aprovados.reduce((s, plan) => {
    // IDs já em Medicoes — evita dupla contagem
    const idsNaTabela = new Set(medicoesFiltradas.map(m => m.ID_Projeto))
    if (idsNaTabela.has(plan.ID_Projeto)) return s
    try {
      const dados = JSON.parse(plan.Dados_JSON || '{}')
      const meds = dados.medicoes || dados._baseline?.medicoesCronograma || []
      return s + meds.reduce((ss, m) => ss + parseFloat(m.valor || m.valorPlanejado || 0), 0)
    } catch { return s }
  }, 0)
  const totalAReceber = totalAReceberTabela + totalAReceberPlanejado
  const alertasCriticos = alertas.filter(a => a.Nivel === 'error')

  const STATUS_VISIVEIS_GRAFICO = ['Backlog', 'A Planejar', 'Em Andamento', 'Em Andamento (Atrasado)', 'Paralisado', 'Pausado']
  const statusData = Object.entries(
    projetosFiltrados
      .filter(p => STATUS_VISIVEIS_GRAFICO.includes(p.Status))
      .reduce((acc, p) => {
        const s = p.Status || 'Outros'
        acc[s] = (acc[s] || 0) + 1
        return acc
      }, {})
  ).map(([name, value]) => ({ name, value }))

  const medicoesPorMes = (() => {
    const meses = {}

    // 1. Medições reais da tabela Medicoes (recebidos e datas de realização)
    medicoesFiltradas.forEach(m => {
      const d = m.Data_Previsao || m.Data_Prevista || m.Data_Emissao_NF
      if (!d) return
      const key = d.slice(0, 7)
      if (!meses[key]) meses[key] = { mes: key, previsto: 0, recebido: 0 }
      if (m.Status_Financeiro === 'Recebido') {
        meses[key].recebido += parseFloat(m.Valor_Medicao || m.Valor || 0)
      }
    })

    // 2. Medições planejadas dos planejamentos aprovados (Dados_JSON)
    const plansAtivos = filtroSetor
      ? aprovados.filter(p => p.Setor === filtroSetor)
      : aprovados
    plansAtivos.forEach(plan => {
      try {
        const dados = JSON.parse(plan.Dados_JSON || '{}')
        const meds = dados.medicoes || dados._baseline?.medicoesCronograma || []
        meds.forEach(m => {
          const d = m.dataPrevisao || m.dataPrevista || m.dataPrevisaoPlanejada || ''
          if (!d) return
          const key = d.slice(0, 7)
          if (!meses[key]) meses[key] = { mes: key, previsto: 0, recebido: 0 }
          meses[key].previsto += parseFloat(m.valor || m.valorPlanejado || 0)
        })
      } catch {}
    })

    return Object.values(meses).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12).map(m => ({
      ...m,
      label: new Date(m.mes + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    }))
  })()

  const hoje = new Date()
  const daqui30 = new Date(hoje); daqui30.setDate(daqui30.getDate() + 30)
  const proximasMedicoes = (() => {
    const daTabela = medicoesFiltradas.filter(m => {
      const d = m.Data_Previsao || m.Data_Prevista
      const dt = d ? new Date(d) : null
      return dt && dt >= hoje && dt <= daqui30 && m.Status !== 'Cancelada' && m.Status !== 'Concluída'
    })
    const idsNaTabela = new Set(medicoesFiltradas.map(m => m.ID_Projeto))
    const doPlano = []
    aprovados.forEach(plan => {
      if (idsNaTabela.has(plan.ID_Projeto)) return
      try {
        const dados = JSON.parse(plan.Dados_JSON || '{}')
        const meds = dados.medicoes || dados._baseline?.medicoesCronograma || []
        meds.forEach((m, idx) => {
          const d = m.dataPrevisao || m.dataPrevista || ''
          if (!d) return
          const dt = new Date(d)
          if (dt >= hoje && dt <= daqui30) {
            doPlano.push({
              ID_Projeto: plan.ID_Projeto,
              nomeProjeto: plan.Nome || plan.ID_Projeto,
              Data_Previsao: d,
              Valor: m.valor || m.valorPlanejado || 0,
              Descricao: m.descricao || m.etapa || `Medição ${idx + 1}`,
              Status_Financeiro: 'Pendente',
            })
          }
        })
      } catch {}
    })
    return [...daTabela, ...doPlano]
      .sort((a, b) => new Date(a.Data_Previsao || a.Data_Prevista) - new Date(b.Data_Previsao || b.Data_Prevista))
      .slice(0, 5)
  })()

  const NIVEL_ORD = { danger: 0, caution: 1, ok: 2 }
  const projetosRicos = projetosFiltrados
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {(() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' })()}, <span style={{ color: '#0284C7' }}>{(user?.nome || '').split(' ')[0]}</span> 👋
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94A3B8', textTransform: 'capitalize' }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
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
          {/* Botão personalizar */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setMostrarPersonalizar(v => !v)}
              style={{
                padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                border: mostrarPersonalizar ? '1.5px solid #C4B5FD' : '1.5px solid #E2E8F0',
                background: mostrarPersonalizar ? '#F5F3FF' : '#fff',
                color: mostrarPersonalizar ? '#7C3AED' : '#475569',
                fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <SlidersHorizontal size={14} /> Personalizar
            </button>
            {mostrarPersonalizar && (
              <PainelPersonalizar
                secoes={secoesVisiveis}
                onChange={handleSetSecoes}
                onClose={() => setMostrarPersonalizar(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Filtro por Setor ── */}
      {(() => {
        const SETORES_FIXOS = ['Arquitetura', 'Saneamento', 'Infraestrutura']
        const setoresExtra = setoresDisponiveis.filter(s => !SETORES_FIXOS.includes(s))
        const todosSetores = [...SETORES_FIXOS, ...setoresExtra]
        return (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', marginRight: 4 }}>SETOR:</span>
            <button
              onClick={() => setFiltroSetor('')}
              style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${!filtroSetor ? '#7C3AED' : '#E2E8F0'}`,
                background: !filtroSetor ? '#EDE9FE' : '#fff',
                color: !filtroSetor ? '#7C3AED' : '#64748B',
                transition: 'all 0.15s',
              }}
            >
              Todos ({projetos.length})
            </button>
            {todosSetores.map(s => {
              const count = projetos.filter(p => p.Setor === s).length
              return (
                <button
                  key={s}
                  onClick={() => setFiltroSetor(filtroSetor === s ? '' : s)}
                  style={{
                    padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: `1.5px solid ${filtroSetor === s ? '#7C3AED' : '#E2E8F0'}`,
                    background: filtroSetor === s ? '#EDE9FE' : '#fff',
                    color: filtroSetor === s ? '#7C3AED' : '#64748B',
                    transition: 'all 0.15s',
                    opacity: count === 0 ? 0.5 : 1,
                  }}
                >
                  {s} ({count})
                </button>
              )
            })}
          </div>
        )
      })()}

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

      {/* ── 4 KPI Cards ── */}
      {vis('kpis') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard label="Projetos em Andamento" value={emAndamento.length} sub={`${projetosFiltrados.length} total · ${concluidos.length} concluídos`} icon={<FolderOpen size={20} />} bg="#22C55E" onClick={() => navigate('/projetos')} />
          <StatCard label="Carteira Aprovada" value={fmt(totalContrato)} sub={`${aprovados.length} planejamento(s) aprovado(s)`} icon={<Briefcase size={20} />} bg="#EF4444" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <StatCard label="Total Recebido" value={fmt(totalRecebido)} sub={periodoRecebido.inicio || periodoRecebido.fim ? 'filtrado por período' : 'medições com status Recebido'} icon={<CheckCircle2 size={20} />} bg="#0EA5E9" />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="date" value={periodoRecebido.inicio} onChange={e => setPeriodoRecebido(p => ({ ...p, inicio: e.target.value }))}
                style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1.5px solid #E2E8F0', fontSize: 11, color: '#475569', fontFamily: 'inherit', outline: 'none' }} />
              <span style={{ fontSize: 11, color: '#94A3B8' }}>até</span>
              <input type="date" value={periodoRecebido.fim} onChange={e => setPeriodoRecebido(p => ({ ...p, fim: e.target.value }))}
                style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1.5px solid #E2E8F0', fontSize: 11, color: '#475569', fontFamily: 'inherit', outline: 'none' }} />
              {(periodoRecebido.inicio || periodoRecebido.fim) && (
                <button onClick={() => setPeriodoRecebido({ inicio: '', fim: '' })} style={{ padding: '4px 7px', borderRadius: 6, border: 'none', background: '#FEE2E2', color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✕</button>
              )}
            </div>
          </div>
          <StatCard label="A Receber" value={fmt(totalAReceber)} sub="medições pendentes/em andamento" icon={<BadgeDollarSign size={20} />} bg="#F59E0B"
            onClick={() => navigate('/medicoes')} />
        </div>
      )}

      {/* ── Linha 2: Gráfico financeiro + KPIs PAR ── */}
      {(vis('financeiro') || vis('par')) && (
        <div style={{ display: 'grid', gridTemplateColumns: vis('financeiro') && vis('par') ? '1.6fr 1fr' : '1fr', gap: 20, marginBottom: 20 }}>
          {vis('financeiro') && (
            <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <BadgeDollarSign size={16} style={{ color: '#7C3AED' }} />
                <span style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Faturamento Previsto vs. Recebido</span>
              </div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 20 }}>Baseado nos planejamentos aprovados{filtroSetor ? ` · ${filtroSetor}` : ''}</div>
              {medicoesPorMes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: 13 }}>Nenhuma medição com data registrada ainda</div>
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
          )}
          {vis('par') && (
            <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Target size={16} style={{ color: '#7C3AED' }} />
                <span style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Regras PAR</span>
              </div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 20 }}>
                {kpisReais ? `Média de ${kpisReais.count} plano(s) aprovado(s)` : 'Sem planejamentos aprovados'}
                {filtroSetor ? ` · ${filtroSetor}` : ''}
              </div>
              {!kpisReais ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#94A3B8', fontSize: 13 }}>Aprove um planejamento para ver os KPIs</div>
              ) : (
                <>
                  <PARGauge label="Margem de Lucro" value={kpisReais.lucroPerc} max={50} limitOk={23} limitWarn={15} invert />
                  <PARGauge label="% Terceirizados" value={kpisReais.tercPerc} max={40} limitOk={25} limitWarn={30} />
                  <PARGauge label="Custo de Produção" value={kpisReais.prodPerc} max={50} limitOk={30} limitWarn={35} />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Linha 3: Pizza status + Próximas medições ── */}
      {(vis('pizza') || vis('medicoes')) && (
        <div style={{ display: 'grid', gridTemplateColumns: vis('pizza') && vis('medicoes') ? '1fr 1.4fr' : '1fr', gap: 20, marginBottom: 20 }}>
          {vis('pizza') && (
            <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <PieIcon size={16} style={{ color: '#7C3AED' }} />
                <span style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Projetos por Status</span>
              </div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12 }}>
                {projetosFiltrados.length} projetos{filtroSetor ? ` · ${filtroSetor}` : ' no total'}
              </div>
              {projetosFiltrados.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: 13 }}>Nenhum projeto</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Donut com total no centro */}
                  <div style={{ position: 'relative', flexShrink: 0, width: 170, height: 170 }}>
                    <ResponsiveContainer width={170} height={170}>
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%" cy="50%"
                          innerRadius={52} outerRadius={78}
                          paddingAngle={2}
                          dataKey="value"
                          strokeWidth={0}
                        >
                          {statusData.map((entry, i) => (
                            <Cell key={i} fill={STATUS_COLORS[entry.name] || '#94A3B8'} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v, n) => [`${v} projetos`, n]}
                          contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Total no centro */}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <span style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', lineHeight: 1 }}>
                        {statusData.reduce((a, b) => a + b.value, 0)}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', marginTop: 2 }}>projetos</span>
                    </div>
                  </div>
                  {/* Legenda customizada */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {statusData.sort((a, b) => b.value - a.value).map((entry) => {
                      const total = statusData.reduce((a, b) => a + b.value, 0)
                      const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0
                      const cor = STATUS_COLORS[entry.name] || '#94A3B8'
                      return (
                        <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: '#475569', fontWeight: 500, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <div style={{ width: 48, height: 5, borderRadius: 3, background: '#F1F5F9', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: cor, borderRadius: 3, transition: 'width 0.4s' }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 800, color: '#0F172A', minWidth: 20, textAlign: 'right' }}>{entry.value}</span>
                            <span style={{ fontSize: 10, color: '#94A3B8', minWidth: 28 }}>{pct}%</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {vis('medicoes') && (
            <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Calendar size={16} style={{ color: '#7C3AED' }} />
                    <span style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Próximas Medições</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                    Vencendo nos próximos 30 dias{filtroSetor ? ` · ${filtroSetor}` : ''}
                  </div>
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
                    const dias = Math.ceil((new Date(m.Data_Previsao || m.Data_Prevista) - hoje) / 86400000)
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
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(m.Valor_Medicao || m.Valor || 0)}
                          </div>
                          <div style={{ fontSize: 10, color: '#94A3B8' }}>
                            {new Date(m.Data_Previsao || m.Data_Prevista).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Semáforo de projetos ── */}
      {vis('saude') && (
        <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={16} style={{ color: '#7C3AED' }} />
                <span style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>
                  Saúde dos Projetos{filtroSetor ? ` · ${filtroSetor}` : ''}
                </span>
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
          {projetosFiltrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#94A3B8', fontSize: 13 }}>Nenhum projeto</div>
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
      )}

      {/* ── Projetos ClickUp por Setor ── */}
      {vis('clickup') && (
        <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 20 }}>
          <ProjetosClickUp filtroSetor={filtroSetor} />
        </div>
      )}

      {/* ── Painéis ClickUp ── */}
      {vis('paineis') && (
        <div style={{ background: '#fff', borderRadius: 18, padding: '22px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 20 }}>
          <PaineisClickUp />
        </div>
      )}

    </div>
  )
}
