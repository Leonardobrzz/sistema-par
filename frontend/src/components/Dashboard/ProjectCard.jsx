import { useNavigate } from 'react-router-dom'
import { ArrowTopRightOnSquareIcon, ExclamationTriangleIcon, ClockIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import { statusBadgeClass, formatDate, formatBRL } from '../../utils/formatters'

function StatusDot({ status }) {
  const s = (status || '').toLowerCase()
  const color =
    s.includes('atrasado')                               ? '#EF4444'
    : s.includes('concluído') || s.includes('concluido') ? '#16A34A'
    : s.includes('paralisado')                           ? '#F97316'
    : s.includes('planejar')                             ? '#D97706'
    : s.includes('aguardando')                           ? '#2563EB'
    : '#1E3A5F'
  return (
    <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: color }} />
  )
}

function ProgressBar({ value, max, colorClass = 'bg-par-500' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const dangerClass = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : colorClass
  return (
    <div className="h-1 rounded-full w-full overflow-hidden bg-slate-100">
      <div
        className={`h-full rounded-full transition-all duration-700 ${dangerClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function ProjectCard({ project }) {
  const navigate   = useNavigate()
  const percTerc   = parseFloat(project.percTerceiros || 0)
  const horasLog   = project.horasLogadas || 0
  const horasEst   = project.horasEstimadas || 0
  const progresso  = parseInt(project.Progresso_Perc || 0)
  const hasAlert   = project.temSemResponsavel || project.temVenceAmanha

  const accentColor =
    project.Status?.includes('Atrasado') ? '#EF4444'
    : project.Status?.includes('Concluíd') || project.Status?.includes('Concluido') ? '#16A34A'
    : '#1E3A5F'

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 cursor-pointer
                 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md
                 hover:border-par-300 group relative overflow-hidden"
      onClick={() => navigate(`/projetos?id=${project.ID_Projeto}`)}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full"
        style={{ background: accentColor }} />

      <div className="p-4 pl-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <StatusDot status={project.Status} />
              <h3 className="font-bold text-slate-800 text-sm truncate group-hover:text-par-600 transition-colors">
                {project.Nome}
              </h3>
            </div>
            <p className="text-xs text-slate-400 truncate pl-4">
              {project.Cliente || '—'}
              {project.Setor && project.Setor !== project.Cliente && ` · ${project.Setor}`}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {hasAlert && (
              <div className="w-5 h-5 rounded-lg bg-red-50 flex items-center justify-center" title="Atenção">
                <ExclamationTriangleIcon style={{ width: 12, height: 12 }} className="text-red-400" />
              </div>
            )}
            {project.Link_ClickUp && (
              <a
                href={project.Link_ClickUp} target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400
                           hover:text-par-600 hover:bg-par-50 transition-all"
                title="Abrir no ClickUp"
              >
                <ArrowTopRightOnSquareIcon style={{ width: 14, height: 14 }} />
              </a>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div className="mb-3">
          <span className={statusBadgeClass(project.Status)}>{project.Status || '—'}</span>
        </div>

        {/* Progresso */}
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-semibold">
            <span className="flex items-center gap-1">
              <ChartBarIcon style={{ width: 11, height: 11 }} /> Progresso
            </span>
            <span className={progresso >= 100 ? 'text-emerald-500' : ''}>{progresso}%</span>
          </div>
          <ProgressBar value={progresso} max={100} colorClass="bg-par-500" />
        </div>

        {/* Footer metrics */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
          <div className="text-center">
            <p className="text-[10px] text-slate-400 font-medium">Contrato</p>
            <p className="text-xs font-bold text-slate-700">{formatBRL(project.Valor_Global)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-400 font-medium">Entrega</p>
            <p className="text-xs font-bold text-slate-700">{formatDate(project.Data_Entrega_Contrato) || '—'}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-400 font-medium">3ºs</p>
            <p className={`text-xs font-bold ${percTerc > 20 ? 'text-red-500' : percTerc > 15 ? 'text-amber-500' : 'text-slate-700'}`}>
              {percTerc.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Horas ClickUp */}
        {horasLog > 0 && (
          <div className="mt-2.5">
            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
              <span className="flex items-center gap-1">
                <ClockIcon style={{ width: 11, height: 11 }} /> Horas (ClickUp)
              </span>
              <span className={horasEst > 0 && horasLog > horasEst ? 'text-red-400 font-bold' : ''}>
                {horasLog}h{horasEst > 0 ? ` / ${horasEst}h` : ''}
              </span>
            </div>
            {horasEst > 0 && <ProgressBar value={horasLog} max={horasEst} />}
          </div>
        )}
      </div>
    </div>
  )
}
