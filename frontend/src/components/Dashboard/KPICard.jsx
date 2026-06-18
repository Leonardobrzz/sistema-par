import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline'

const COLOR_MAP = {
  default: {
    bg:    'bg-white border-slate-200',
    icon:  'bg-slate-100 text-slate-500',
    value: 'text-slate-900',
    accent:'',
    bar:   '',
  },
  green: {
    bg:    'bg-white border-slate-200',
    icon:  'bg-emerald-50 text-emerald-600',
    value: 'text-emerald-700',
    accent:'from-emerald-50 to-transparent',
    bar:   'bg-emerald-500',
  },
  red: {
    bg:    'bg-white border-slate-200',
    icon:  'bg-red-50 text-red-600',
    value: 'text-red-700',
    accent:'from-red-50 to-transparent',
    bar:   'bg-red-500',
  },
  yellow: {
    bg:    'bg-white border-slate-200',
    icon:  'bg-amber-50 text-amber-600',
    value: 'text-amber-700',
    accent:'from-amber-50 to-transparent',
    bar:   'bg-amber-500',
  },
  blue: {
    bg:    'bg-white border-slate-200',
    icon:  'bg-blue-50 text-blue-600',
    value: 'text-blue-700',
    accent:'from-blue-50 to-transparent',
    bar:   'bg-blue-500',
  },
  purple: {
    bg:    'bg-white border-slate-200',
    icon:  'bg-par-50 text-par-500',
    value: 'text-par-700',
    accent:'from-par-50 to-transparent',
    bar:   'bg-par-500',
  },
}

export default function KPICard({ label, value, subtitle, trend, trendLabel, color = 'default', icon: Icon, onClick }) {
  const c = COLOR_MAP[color] || COLOR_MAP.default

  return (
    <div
      className={`${c.bg} rounded-2xl border p-6 flex flex-col gap-3 relative overflow-hidden
                  transition-all duration-200 hover:border-par-300 hover:shadow-md hover:-translate-y-0.5
                  ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {/* Accent circle */}
      {c.accent && (
        <div className={`absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br ${c.accent} opacity-50 pointer-events-none`} />
      )}

      {/* Top row */}
      <div className="flex items-start justify-between relative z-10">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        {Icon && (
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${c.icon}`}>
            <Icon style={{ width: 18, height: 18 }} />
          </div>
        )}
      </div>

      {/* Value */}
      <div className="relative z-10">
        <p className={`text-[2rem] font-extrabold tracking-tight leading-none ${c.value}`}>{value}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-1.5 font-medium">{subtitle}</p>}
      </div>

      {/* Trend */}
      {trendLabel && (
        <div className={`flex items-center gap-1.5 text-xs font-semibold relative z-10
          ${trend >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
        >
          {trend >= 0
            ? <ArrowTrendingUpIcon style={{ width: 14, height: 14 }} />
            : <ArrowTrendingDownIcon style={{ width: 14, height: 14 }} />
          }
          {trendLabel}
        </div>
      )}

      {/* Bottom accent bar */}
      {c.bar && (
        <div className={`absolute bottom-0 left-0 h-0.5 w-1/3 ${c.bar} opacity-50 rounded-full`} />
      )}
    </div>
  )
}
