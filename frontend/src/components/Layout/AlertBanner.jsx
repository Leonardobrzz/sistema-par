import { XMarkIcon } from '@heroicons/react/20/solid'
import { useAlerts } from '../../contexts/AlertContext'

const COLORS = {
  error:   'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info:    'bg-blue-500 text-white',
}

export default function AlertBanner({ alert }) {
  const { resolveAlert } = useAlerts()

  return (
    <div className={`flex items-center justify-between px-6 py-2 text-sm font-medium ${COLORS[alert.Nivel] || COLORS.info}`}>
      <p className="flex-1 truncate">
        ⚠️ {alert.Mensagem}
        {alert.nomeProjeto && <span className="ml-2 opacity-80">— {alert.nomeProjeto}</span>}
      </p>
      <button
        onClick={() => resolveAlert(alert.ID)}
        className="ml-4 flex-shrink-0 opacity-80 hover:opacity-100"
        title="Dispensar"
      >
        <XMarkIcon className="w-4 h-4" />
      </button>
    </div>
  )
}
