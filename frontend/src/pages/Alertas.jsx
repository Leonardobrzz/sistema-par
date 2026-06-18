import { useState } from 'react'
import {
  CheckCircleIcon, XMarkIcon, ArrowTopRightOnSquareIcon,
  ExclamationCircleIcon, ExclamationTriangleIcon, InformationCircleIcon,
  BellAlertIcon, ClockIcon, TrashIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { formatDateTime } from '../utils/formatters'
import { useAlerts } from '../contexts/AlertContext'
import { useAuth } from '../contexts/AuthContext'
import api from '../utils/api'

const LEVEL = {
  error:   { label: 'Crítico',  icon: ExclamationCircleIcon,   iconColor: 'text-red-500',   bg: 'bg-red-50',   border: 'border-red-200',   dot: 'bg-red-500',   text: 'text-red-800' },
  warning: { label: 'Atenção',  icon: ExclamationTriangleIcon, iconColor: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500', text: 'text-amber-800' },
  info:    { label: 'Info',     icon: InformationCircleIcon,   iconColor: 'text-blue-500',  bg: 'bg-blue-50',  border: 'border-blue-200',  dot: 'bg-blue-500',  text: 'text-blue-800' },
}

const TIPO_LABEL = {
  TAREFA_ATRASADA:          { label: 'Tarefa Atrasada',        color: '#DC2626', bg: '#FEF2F2' },
  SEM_RESPONSAVEL:          { label: 'Sem Responsável',        color: '#DC2626', bg: '#FEF2F2' },
  PRAZO_NAO_DEFINIDO:       { label: 'Sem Data de Entrega',    color: '#D97706', bg: '#FFFBEB' },
  VENCE_AMANHA:             { label: 'Vence Amanhã',           color: '#DC2626', bg: '#FEF2F2' },
  VENCE_EM_BREVE:           { label: 'Vence em Breve',         color: '#D97706', bg: '#FFFBEB' },
  MEDICAO_ATRASADA:         { label: 'Medição Atrasada',       color: '#DC2626', bg: '#FEF2F2' },
  MEDICAO_PROXIMA:          { label: 'Medição Próxima',        color: '#2563EB', bg: '#EFF6FF' },
  FATURA_VENCIDA:           { label: 'Fatura Vencida',         color: '#DC2626', bg: '#FEF2F2' },
  TETO_TERCEIROS_BLOQUEIO:  { label: 'Teto Terceiros',         color: '#DC2626', bg: '#FEF2F2' },
  TETO_TERCEIROS_AVISO:     { label: 'Aviso Terceiros',        color: '#D97706', bg: '#FFFBEB' },
  MARGEM_ABAIXO_MINIMO:     { label: 'Margem Abaixo do Mín.',  color: '#DC2626', bg: '#FEF2F2' },
  CUSTO_PRODUCAO_ULTRAPASSOU:{ label: 'Custo Produção Alto',   color: '#DC2626', bg: '#FEF2F2' },
  DAILY_SCRUM_PENDENTE:     { label: 'Daily Scrum Pendente',   color: '#D97706', bg: '#FFFBEB' },
  PAR_PLANEJAMENTO_ATRASADO:{ label: 'Planejamento Atrasado',  color: '#D97706', bg: '#FFFBEB' },
  EAP_TAREFA_GRANDE:        { label: 'Tarefa Muito Grande',    color: '#D97706', bg: '#FFFBEB' },
  SEM_TEMPO_ESTIMADO:       { label: 'Sem Tempo Estimado',     color: '#64748B', bg: '#F1F5F9' },
}

const FILTROS = ['Todos', 'Crítico', 'Atenção', 'Info']
const SETOR_COLORS = {
  PO:          { bg: '#EEF2FF', color: '#4338CA' },
  Financeiro:  { bg: '#F0FDF4', color: '#15803D' },
  Coordenador: { bg: '#FFF7ED', color: '#C2410C' },
  Diretoria:   { bg: '#FDF4FF', color: '#7E22CE' },
  Comercial:   { bg: '#FFF1F2', color: '#BE123C' },
  Todos:       { bg: '#F1F5F9', color: '#475569' },
}
function setorStyle(s) { return SETOR_COLORS[s] || { bg: '#F1F5F9', color: '#64748B' } }

export default function Alertas() {
  const { alerts, resolveAlert, refreshAlerts } = useAlerts()
  const { user } = useAuth()
  const [limpando, setLimpando] = useState(false)
  const [filtro, setFiltro] = useState('Todos')
  const [filtroSetor, setFiltroSetor] = useState('')
  const [agruparPor, setAgruparPor] = useState('tipo') // 'tipo' | 'setor'
  const [busca, setBusca] = useState('')

  const errCount  = alerts.filter(a => a.Nivel === 'error').length
  const warnCount = alerts.filter(a => a.Nivel === 'warning').length
  const infoCount = alerts.filter(a => a.Nivel === 'info').length

  // Extrai setores únicos dos alertas ativos
  const setoresDisponiveis = [...new Set(
    alerts.flatMap(a => (a.Setor_Destino || '').split(',').map(s => s.trim()).filter(Boolean))
  )].sort()

  async function handleLimpar() {
    if (!window.confirm(`Isso vai resolver todos os ${alerts.length} alertas ativos e reprocessar apenas os válidos agora. Continuar?`)) return
    setLimpando(true)
    try {
      const res = await api.post('/alertas/limpar')
      toast.success(`${res.data.resolvidos} alertas resolvidos. ${res.data.novosAlertas} alertas válidos encontrados.`)
      refreshAlerts()
    } catch {
      toast.error('Erro ao limpar alertas')
    } finally {
      setLimpando(false)
    }
  }

  const alertasFiltrados = alerts.filter(a => {
    const cfg = LEVEL[a.Nivel] || LEVEL.info
    if (filtro !== 'Todos' && cfg.label !== filtro) return false
    if (filtroSetor) {
      const setores = (a.Setor_Destino || '').split(',').map(s => s.trim())
      if (!setores.includes(filtroSetor)) return false
    }
    if (busca) {
      const q = busca.toLowerCase()
      return (a.Mensagem || '').toLowerCase().includes(q) ||
             (a.nomeProjeto || '').toLowerCase().includes(q) ||
             (a.Setor_Destino || '').toLowerCase().includes(q)
    }
    return true
  })

  const ordemNivel = { error: 0, warning: 1, info: 2 }

  // Agrupa por tipo OU por setor
  const grupos = {}
  if (agruparPor === 'setor') {
    for (const a of alertasFiltrados) {
      const setores = (a.Setor_Destino || 'Outros').split(',').map(s => s.trim()).filter(Boolean)
      for (const s of setores) {
        if (!grupos[s]) grupos[s] = []
        grupos[s].push(a)
      }
    }
  } else {
    for (const a of alertasFiltrados) {
      const tipo = a.Tipo_Alerta || 'OUTROS'
      if (!grupos[tipo]) grupos[tipo] = []
      grupos[tipo].push(a)
    }
  }

  const gruposOrdenados = Object.entries(grupos).sort(([, a], [, b]) => {
    const na = ordemNivel[a[0]?.Nivel] ?? 3
    const nb = ordemNivel[b[0]?.Nivel] ?? 3
    return na - nb
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-par-50 flex items-center justify-center border border-par-100">
              <BellAlertIcon className="w-5 h-5 text-par-600" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-widest uppercase">Central de Alertas</h1>
          </div>
          <p className="text-sm text-slate-500 max-w-2xl">
            Alertas gerados automaticamente pelo ClickUp e pelas regras PAR.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 pulse-dot" />
            <span className="text-sm font-bold text-red-700">{errCount} Críticos</span>
          </div>
          <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-sm font-bold text-amber-700">{warnCount} Avisos</span>
          </div>
          <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-sm font-bold text-blue-700">{infoCount} Info</span>
          </div>
          {user?.perfil === 'Admin' && alerts.length > 0 && (
            <button onClick={handleLimpar} disabled={limpando}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all"
              style={{ background: limpando ? '#F1F5F9' : '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', cursor: limpando ? 'not-allowed' : 'pointer' }}
            >
              {limpando ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}
              {limpando ? 'Limpando...' : 'Limpar e Reprocessar'}
            </button>
          )}
        </div>
      </div>

      {/* Filtros e busca */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Linha 1: nivel + busca + agrupar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8' }}>NIVEL:</span>
          {FILTROS.map(f => (
            <button key={f} onClick={() => setFiltro(f)} style={{
              padding: '5px 14px', borderRadius: 8, border: '1.5px solid',
              borderColor: filtro === f ? '#7C3AED' : '#E2E8F0',
              background: filtro === f ? '#EDE9FE' : '#F8FAFC',
              color: filtro === f ? '#7C3AED' : '#64748B',
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}>{f}</button>
          ))}
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por projeto ou mensagem..."
            style={{ flex: 1, minWidth: 180, padding: '6px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#0F172A', background: '#F8FAFC' }}
          />
          {/* Agrupar por toggle */}
          <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 3, gap: 2 }}>
            {[['tipo', 'Por Tipo'], ['setor', 'Por Setor']].map(([v, lbl]) => (
              <button key={v} onClick={() => setAgruparPor(v)} style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: agruparPor === v ? '#fff' : 'transparent',
                color: agruparPor === v ? '#7C3AED' : '#64748B',
                boxShadow: agruparPor === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{lbl}</button>
            ))}
          </div>
        </div>

        {/* Linha 2: chips de setor */}
        {setoresDisponiveis.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8' }}>SETOR:</span>
            <button onClick={() => setFiltroSetor('')} style={{
              padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${!filtroSetor ? '#7C3AED' : '#E2E8F0'}`,
              background: !filtroSetor ? '#EDE9FE' : '#F8FAFC', color: !filtroSetor ? '#7C3AED' : '#64748B',
              fontWeight: !filtroSetor ? 700 : 600, fontSize: 12, cursor: 'pointer',
            }}>Todos</button>
            {setoresDisponiveis.map(s => {
              const st = setorStyle(s)
              const ativo = filtroSetor === s
              const count = alerts.filter(a => (a.Setor_Destino || '').split(',').map(x => x.trim()).includes(s)).length
              return (
                <button key={s} onClick={() => setFiltroSetor(ativo ? '' : s)} style={{
                  padding: '4px 12px', borderRadius: 20,
                  border: `1.5px solid ${ativo ? st.color : '#E2E8F0'}`,
                  background: ativo ? st.bg : '#F8FAFC',
                  color: ativo ? st.color : '#64748B',
                  fontWeight: ativo ? 700 : 600, fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {s}
                  <span style={{ fontSize: 10, fontWeight: 800, background: ativo ? st.color : '#CBD5E1', color: '#fff', borderRadius: 10, padding: '1px 5px' }}>{count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 flex items-center justify-center mb-4 border border-emerald-100">
            <CheckCircleIcon className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Tudo limpo por aqui!</h2>
          <p className="text-slate-500 mt-2">Nenhum alerta ativo no momento.</p>
        </div>
      ) : alertasFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94A3B8', fontSize: 14 }}>Nenhum alerta encontrado para este filtro.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {gruposOrdenados.map(([chave, lista]) => {
            const tipoInfo = agruparPor === 'setor'
              ? { label: chave, ...setorStyle(chave) }
              : (TIPO_LABEL[chave] || { label: chave, color: '#64748B', bg: '#F1F5F9' })
            const cfg = LEVEL[lista[0]?.Nivel] || LEVEL.info
            const errorsInGroup = lista.filter(a => a.Nivel === 'error').length
            return (
              <div key={chave}>
                {/* Cabeçalho do grupo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 8, background: tipoInfo.bg, color: tipoInfo.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {tipoInfo.label}
                  </span>
                  <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>{lista.length} alerta{lista.length > 1 ? 's' : ''}</span>
                  {errorsInGroup > 0 && agruparPor === 'setor' && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#FEF2F2', color: '#DC2626' }}>{errorsInGroup} crítico{errorsInGroup > 1 ? 's' : ''}</span>
                  )}
                  <div style={{ flex: 1, height: 1, background: '#F1F5F9' }} />
                </div>

                {/* Alertas do grupo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lista.map(alerta => {
                    const Icon = cfg.icon
                    const setores = (alerta.Setor_Destino || '').split(',').map(s => s.trim()).filter(Boolean)
                    return (
                      <div key={alerta.ID} style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'flex-start', gap: 14, transition: 'box-shadow 0.15s' }}>
                        <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: cfg.bg, border: `1px solid`, borderColor: cfg.border.replace('border-', ''), display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                          <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Projeto + Setor */}
                          <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            {alerta.nomeProjeto && (
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', background: '#F8FAFC', padding: '2px 8px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                                {alerta.nomeProjeto}
                              </span>
                            )}
                            {setores.map(s => (
                              <span key={s} style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', background: '#EDE9FE', padding: '2px 8px', borderRadius: 6 }}>
                                {s}
                              </span>
                            ))}
                          </div>

                          {/* Mensagem */}
                          <p style={{ fontSize: 13, fontWeight: 500, color: '#1E293B', margin: 0, lineHeight: 1.5 }}>{alerta.Mensagem}</p>

                          {/* Data + link */}
                          <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <ClockIcon className="w-3.5 h-3.5" style={{ display: 'inline' }} />
                              {formatDateTime(alerta.Data_Geracao)}
                            </span>
                            {alerta.Link_ClickUp && (
                              <a href={alerta.Link_ClickUp} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 11, color: '#7C3AED', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, background: '#EDE9FE', padding: '2px 8px', borderRadius: 6, textDecoration: 'none' }}>
                                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                                Abrir no ClickUp
                              </a>
                            )}
                          </div>
                        </div>

                        <button onClick={() => resolveAlert(alerta.ID)}
                          style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <XMarkIcon className="w-4 h-4" />
                          Resolver
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
