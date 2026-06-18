import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  LockClosedIcon,
  ClockIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import api from '../../utils/api'
import { formatDate, formatHoras } from '../../utils/formatters'

// ── Helpers ──────────────────────────────────────────────────────────────────

function desvioClass(desvioPerc, inverso = false) {
  if (desvioPerc === null) return 'text-slate-500'
  const v = inverso ? -desvioPerc : desvioPerc
  if (v > 15) return 'text-red-600 font-bold'
  if (v > 5) return 'text-amber-600 font-bold'
  if (v < -10) return 'text-emerald-600 font-bold'
  return 'text-slate-600'
}

function DesvioChip({ desvioPerc, desvioAbsoluto }) {
  if (desvioPerc === null && desvioAbsoluto === 0) return <span className="text-slate-500 text-xs">—</span>
  const positivo = desvioAbsoluto > 0
  const neutro = desvioAbsoluto === 0
  if (neutro) return <span className="text-[10px] uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md font-bold">No prazo</span>
  return (
    <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-md font-bold flex items-center gap-0.5 w-fit border ${
      positivo ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
    }`}>
      {positivo ? <ArrowUpIcon className="w-3 h-3" /> : <ArrowDownIcon className="w-3 h-3" />}
      {positivo ? '+' : ''}{desvioAbsoluto}h
      {desvioPerc !== null && ` (${positivo ? '+' : ''}${desvioPerc}%)`}
    </span>
  )
}

function BarraProgresso({ planejado, rastreado, max }) {
  const pPerc = max > 0 ? Math.min((planejado / max) * 100, 100) : 0
  const rPerc = max > 0 ? Math.min((rastreado / max) * 100, 100) : 0
  const overrun = rastreado > planejado
  return (
    <div className="relative h-2.5 bg-slate-100 rounded-full w-full overflow-visible border border-slate-200">
      {/* Planejado */}
      <div
        className="absolute top-0 left-0 h-full bg-slate-400 rounded-full"
        style={{ width: `${pPerc}%` }}
      />
      {/* Rastreado */}
      <div
        className={`absolute top-0 left-0 h-full rounded-full shadow-md ${overrun ? 'bg-red-500' : 'bg-par-500'}`}
        style={{ width: `${rPerc}%` }}
      />
    </div>
  )
}

function DataCompare({ label, planejado, atual }) {
  if (!planejado && !atual) return null
  const planDate = planejado ? new Date(planejado + (planejado.length === 10 ? 'T12:00:00' : '')) : null
  const atualDate = atual ? new Date(atual + (atual.length === 10 ? 'T12:00:00' : '')) : null
  const atrasoDias = planDate && atualDate
    ? Math.round((atualDate - planDate) / (1000 * 60 * 60 * 24))
    : null
  const igual = planejado === atual || atrasoDias === 0

  return (
    <div className="flex items-start justify-between py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 px-3 rounded-xl transition-colors">
      <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider w-44 pt-1">{label}</span>
      <div className="flex gap-6 flex-1">
        <div className="text-center flex-1">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Planejado</p>
          <p className="text-sm font-bold text-slate-800">{planDate ? formatDate(planejado) : '—'}</p>
        </div>
        <div className="text-center flex-1">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Atual</p>
          <p className={`text-sm font-bold ${igual ? 'text-slate-800' : atrasoDias > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {atualDate ? formatDate(atual) : '—'}
          </p>
        </div>
        <div className="text-center w-24 flex items-center justify-center">
          {atrasoDias !== null && !igual && (
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-widest border ${
              atrasoDias > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
            }`}>
              {atrasoDias > 0 ? `+${atrasoDias}d` : `${atrasoDias}d`}
            </span>
          )}
          {igual && <span className="text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-600 px-2 py-0.5 rounded-md font-bold uppercase tracking-widest">OK ✓</span>}
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ComparativoPAR({ planejamentoId, idProjeto, planejamento, onBaselineTravado }) {
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [travanado, setTravando] = useState(false)

  const refId = planejamentoId || idProjeto

  async function carregarComparativo() {
    if (!refId) return
    setLoading(true)
    try {
      const res = await api.get(`/planejamento/${refId}/comparativo`)
      setDados(res.data)
    } catch (err) {
      if (err.response?.status !== 404) {
        toast.error('Erro ao carregar comparativo PAR')
      }
      setDados(null)
    } finally {
      setLoading(false)
    }
  }

  async function atualizarDados() {
    setLoading(true)
    try {
      // 1) Sincroniza com ClickUp para puxar horas atuais (focado neste projeto)
      await api.post('/clickup/sync', { idProjeto })
    } catch {
      // não bloqueia se sync falhar
    }
    // 2) Recarrega o comparativo com dados frescos
    await carregarComparativo()
  }

  async function travarBaseline() {
    if (!planejamentoId) return toast.error('ID do planejamento não encontrado')
    if (!window.confirm(
      '⚠️ Ao travar o Baseline PAR, os dados de horas estimadas, datas e cronograma de medições serão congelados como referência permanente.\n\nEssa ação NÃO pode ser desfeita.\n\nDeseja confirmar?'
    )) return

    setTravando(true)
    try {
      const res = await api.post(`/planejamento/${planejamentoId}/baseline`)
      toast.success('Baseline PAR travado com sucesso! A partir de agora você pode acompanhar Planejado vs Executado.')
      await carregarComparativo()
      onBaselineTravado?.()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao travar baseline')
    } finally {
      setTravando(false)
    }
  }

  useEffect(() => {
    carregarComparativo()
  }, [refId])

  if (loading) {
    return (
      <div className="card-glass p-12 text-center flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-par-500/30 border-t-par-400 rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Carregando comparativo...</p>
      </div>
    )
  }

  // Sem planejamento cadastrado
  if (!dados) {
    return (
      <div className="card-glass border-dashed border-white/20 p-12 text-center text-slate-400 flex flex-col items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <ChartBarIcon className="w-8 h-8 text-slate-500 opacity-50" />
        </div>
        <p className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-2">Nenhum planejamento encontrado</p>
        <p className="text-xs text-slate-500">Crie o Planejamento Financeiro antes de travar o baseline.</p>
      </div>
    )
  }

  // Sem baseline ainda
  if (!dados.temBaseline) {
    return (
      <div className="card-glass p-8 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-par-500/10 rounded-full blur-[80px] -mr-10 -mt-10 group-hover:bg-par-500/20 transition-all duration-700 pointer-events-none"></div>
        <div className="flex flex-col md:flex-row items-start gap-6 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-par-500 to-par-700 flex items-center justify-center flex-shrink-0 shadow-[0_0_30px_rgba(var(--color-par-500),0.3)] border border-par-400/30">
            <LockClosedIcon className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-black text-white tracking-widest uppercase mb-2">Travar Baseline PAR</h3>
            <p className="text-sm text-slate-300 leading-relaxed font-medium">
              Ao travar o baseline, os dados de <strong className="text-par-300">horas estimadas por colaborador</strong>, <strong className="text-par-300">datas planejadas</strong> e
              o <strong className="text-par-300">cronograma de medições</strong> serão congelados como referência permanente.
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Durante a execução, o sistema compara automaticamente esses dados com o
              <strong className="text-slate-300"> tempo rastreado no ClickUp</strong> e as <strong className="text-slate-300">datas reais</strong> — mostrando desvios em tempo real.
            </p>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-white/5 rounded-xl p-4 border border-white/5 hover:bg-white/10 transition-colors">
                <ClockIcon className="w-5 h-5 text-par-400 mb-2" />
                <p className="font-bold text-slate-200">Tempo Rastreado</p>
                <p className="text-slate-500 mt-1">Horas logadas no ClickUp</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 border border-white/5 hover:bg-white/10 transition-colors">
                <CalendarDaysIcon className="w-5 h-5 text-par-400 mb-2" />
                <p className="font-bold text-slate-200">Datas</p>
                <p className="text-slate-500 mt-1">Previstas vs atuais</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4 border border-white/5 hover:bg-white/10 transition-colors">
                <ChartBarIcon className="w-5 h-5 text-par-400 mb-2" />
                <p className="font-bold text-slate-200">Medições</p>
                <p className="text-slate-500 mt-1">Cronograma vs realizado</p>
              </div>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4">
              <button
                onClick={travarBaseline}
                disabled={travanado}
                className="btn-primary flex items-center justify-center gap-2 disabled:opacity-60 px-6 py-2.5"
              >
                {travanado ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <LockClosedIcon className="w-4 h-4" />}
                {travanado ? 'Travando...' : 'Travar Baseline PAR'}
              </button>
              <p className="text-[11px] text-amber-500/80 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <ExclamationTriangleIcon className="w-4 h-4" /> Ação irreversível — faça isso quando o planejamento estiver finalizado
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // COM baseline — exibe comparativo completo
  const { horas, datas, medicoes, baseline } = dados
  const maxHoras = Math.max(horas.totalPlanejado, horas.totalRastreado, 1)
  const desvioTotal = horas.desvioPerc

  return (
    <div className="space-y-6 fade-in pb-10">
      {/* Header do baseline */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-par-50 border border-par-100 flex items-center justify-center shadow-sm">
            <LockClosedIcon className="w-5 h-5 text-par-600" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 uppercase tracking-widest mb-0.5">Baseline PAR Travado</p>
            <p className="text-[11px] text-slate-500 font-bold tracking-wider">
              Por <strong className="text-slate-700">{baseline.travadoPor}</strong> em {formatDate(baseline.travadoEm)}
            </p>
          </div>
        </div>
        <button onClick={atualizarDados} disabled={loading} className="btn-secondary flex items-center gap-2 disabled:opacity-60">
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Sincronizando...' : 'Atualizar Dados'}
        </button>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`card-glass p-5 ${
          desvioTotal === null ? '' :
          desvioTotal > 15 ? 'border-red-200 bg-red-50' :
          desvioTotal > 5 ? 'border-amber-200 bg-amber-50' :
          'border-emerald-200 bg-emerald-50'
        }`}>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Horas Estimadas</p>
          <p className="text-3xl font-black text-slate-900">{formatHoras(horas.totalPlanejado)}</p>
          <p className="text-xs text-slate-600 mt-1 font-medium">Planejado no baseline</p>
        </div>
        <div className={`card-glass p-5 ${
          desvioTotal === null ? '' :
          desvioTotal > 15 ? 'border-red-200 bg-red-50' :
          desvioTotal > 5 ? 'border-amber-200 bg-amber-50' :
          'border-emerald-200 bg-emerald-50'
        }`}>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Horas Rastreadas</p>
          <p className={`text-3xl font-black ${
            desvioTotal > 15 ? 'text-red-700' :
            desvioTotal > 5 ? 'text-amber-700' :
            'text-emerald-700'
          }`}>{formatHoras(horas.totalRastreado)}</p>
          <p className="text-xs text-slate-600 mt-1 font-medium">Tempo logado no ClickUp</p>
        </div>
        <div className="card-glass p-5">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Desvio Total</p>
          <div className="flex items-end gap-2">
            <p className={`text-3xl font-black ${
              horas.desvioAbsoluto > 0 ? 'text-red-600' :
              horas.desvioAbsoluto < 0 ? 'text-emerald-600' :
              'text-slate-400'
            }`}>
              {horas.desvioAbsoluto > 0 ? '+' : ''}{formatHoras(horas.desvioAbsoluto)}
            </p>
          </div>
          {desvioTotal !== null && (
            <p className={`text-[11px] mt-1.5 font-bold uppercase tracking-wider ${
              desvioTotal > 10 ? 'text-red-600' :
              desvioTotal > 0 ? 'text-amber-600' :
              'text-emerald-600'
            }`}>
              {desvioTotal > 0 ? '+' : ''}{desvioTotal}% {desvioTotal > 0 ? 'acima do estimado' : 'abaixo do estimado'}
            </p>
          )}
        </div>
      </div>

      {/* Barra visual geral */}
      <div className="card-glass p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2">
            <ChartBarIcon className="w-4 h-4 text-par-600" />
            <p className="text-[11px] font-bold text-slate-800 uppercase tracking-widest">Progresso de Horas</p>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-slate-200 rounded inline-block" /> Estimado</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-par-500 rounded inline-block" /> Rastreado</span>
          </div>
        </div>
        <BarraProgresso planejado={horas.totalPlanejado} rastreado={horas.totalRastreado} max={maxHoras} />
      </div>

      {/* Por colaborador */}
      {horas.porColaborador.length > 0 && (
        <div className="card-glass overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <p className="text-[10px] font-bold text-par-600 uppercase tracking-widest">Horas por Colaborador — Planejado vs Rastreado</p>
          </div>
          <div className="divide-y divide-slate-100">
            {horas.porColaborador.map((c, i) => {
              const maxC = Math.max(c.horasPlanejadas, c.horasRastreadas, 1)
              return (
                <div key={i} className="px-6 py-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-par-50 flex items-center justify-center text-par-600 text-xs font-bold flex-shrink-0 border border-par-100">
                        {c.colaborador.charAt(0).toUpperCase()}
                      </div>
                      <p className="text-sm font-bold text-slate-800">{c.colaborador}</p>
                    </div>
                    <div className="flex items-center gap-6 text-xs">
                      <div className="text-right">
                        <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-0.5">Est.</p>
                        <p className="font-bold text-slate-600">{formatHoras(c.horasPlanejadas)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-0.5">Real</p>
                        <p className={`font-bold ${c.desvioAbsoluto > 0 ? 'text-red-600' : c.desvioAbsoluto < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {formatHoras(c.horasRastreadas)}
                        </p>
                      </div>
                      <DesvioChip desvioPerc={c.desvioPerc} desvioAbsoluto={c.desvioAbsoluto} />
                    </div>
                  </div>
                  <BarraProgresso planejado={c.horasPlanejadas} rastreado={c.horasRastreadas} max={maxC} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Datas */}
      <div className="card-glass overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <p className="text-[10px] font-bold text-par-600 uppercase tracking-widest">Datas — Planejado vs Atual</p>
        </div>
        <div className="px-3 py-2">
          <DataCompare
            label="Início da OS"
            planejado={datas.planejado.dataInicioOS}
            atual={datas.atual.dataInicioOS}
          />
          <DataCompare
            label="Entrega Contrato"
            planejado={datas.planejado.dataEntregaContrato}
            atual={datas.atual.dataEntregaContrato}
          />
          <DataCompare
            label="Entrega Planejada"
            planejado={datas.planejado.dataEntregaPlanejada}
            atual={datas.atual.dataEntregaPlanejada}
          />
        </div>
      </div>

      {/* Medições */}
      {medicoes.length > 0 && (
        <div className="card-glass overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <p className="text-[10px] font-bold text-par-600 uppercase tracking-widest">Cronograma de Medições — Plan. vs Realizado</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="table-header px-6 py-3">Etapa</th>
                  <th className="table-header px-4 py-3 text-center">%</th>
                  <th className="table-header px-4 py-3">Data Prev. (Plan.)</th>
                  <th className="table-header px-4 py-3">Data Realização</th>
                  <th className="table-header px-4 py-3 text-center">Atraso</th>
                  <th className="table-header px-6 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {medicoes.map((m, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 text-sm font-bold text-slate-800">{m.etapa || `Medição ${i + 1}`}</td>
                    <td className="px-4 py-4 text-center text-par-600 font-bold">{m.percentual}%</td>
                    <td className="px-4 py-4 text-xs font-semibold text-slate-500">{m.dataPrevisaoPlanejada ? formatDate(m.dataPrevisaoPlanejada) : '—'}</td>
                    <td className={`px-4 py-4 text-xs font-bold ${
                      m.dataRealizacao
                        ? m.atrasoDias > 0 ? 'text-red-600' : 'text-emerald-600'
                        : 'text-slate-400'
                    }`}>
                      {m.dataRealizacao ? formatDate(m.dataRealizacao) : '—'}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {m.atrasoDias !== null ? (
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md font-bold border ${
                          m.atrasoDias > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                        }`}>
                          {m.atrasoDias > 0 ? `+${m.atrasoDias}d` : `${m.atrasoDias}d`}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-bold">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`badge ${
                        m.statusFinanceiro === 'Recebido' ? 'badge-green' :
                        m.statusFinanceiro === 'NF Emitida' ? 'badge-blue' :
                        m.statusFinanceiro === 'Atrasado' ? 'badge-red' :
                        'badge-gray'
                      }`}>
                        {m.statusFinanceiro || 'Pendente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
