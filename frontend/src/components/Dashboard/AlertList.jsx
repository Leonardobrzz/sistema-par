import {
  CheckCircleIcon, XMarkIcon, ArrowTopRightOnSquareIcon,
  ExclamationCircleIcon, ExclamationTriangleIcon, InformationCircleIcon,
} from '@heroicons/react/24/outline'
import { formatDateTime } from '../../utils/formatters'
import { useAlerts } from '../../contexts/AlertContext'

const LEVEL = {
  error:   { icon: ExclamationCircleIcon,  iconColor: 'text-red-500',    bg: 'bg-red-50',    border: 'border-red-200',   dot: 'bg-red-500' },
  warning: { icon: ExclamationTriangleIcon, iconColor: 'text-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200', dot: 'bg-amber-500' },
  info:    { icon: InformationCircleIcon,   iconColor: 'text-blue-500',   bg: 'bg-blue-50',   border: 'border-blue-200',  dot: 'bg-blue-500' },
}

export default function AlertList({ alerts, maxItems = 10 }) {
  const { resolveAlert } = useAlerts()
  const items = (alerts || []).slice(0, maxItems)

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-3">
          <CheckCircleIcon className="w-6 h-6 text-emerald-400" />
        </div>
        <p className="text-sm font-semibold text-slate-400">Tudo certo!</p>
        <p className="text-xs text-slate-600 mt-1">Nenhum alerta ativo no sistema</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((alerta) => {
        const cfg = LEVEL[alerta.Nivel] || LEVEL.info
        const Icon = cfg.icon
        return (
          <div
            key={alerta.ID}
            className={`rounded-xl p-3.5 flex gap-3 items-start border ${cfg.bg} ${cfg.border} transition-all duration-200 hover:shadow-sm group`}
          >
            {/* Icon */}
            <div className="mt-0.5 flex-shrink-0">
              <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {alerta.nomeProjeto && (
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                  {alerta.nomeProjeto}
                </p>
              )}
              <p className="text-xs font-medium text-slate-800 leading-relaxed">{alerta.Mensagem}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <p className="text-[10px] text-slate-600">{formatDateTime(alerta.Data_Geracao)}</p>
                {alerta.Link_ClickUp && (
                  <a
                    href={alerta.Link_ClickUp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-par-600 hover:text-par-700 font-semibold transition-colors"
                    title="Abrir no ClickUp"
                  >
                    <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
                    ClickUp
                  </a>
                )}
              </div>
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => resolveAlert(alerta.ID)}
              className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center
                         text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-all
                         opacity-0 group-hover:opacity-100"
              title="Dispensar alerta"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
