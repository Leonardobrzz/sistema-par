export default function Badge({ children, variant = 'gray' }) {
  const variants = {
    gray:   'bg-slate-100 text-slate-700',
    green:  'bg-emerald-100 text-emerald-800',
    yellow: 'bg-amber-100 text-amber-800',
    red:    'bg-red-100 text-red-800',
    blue:   'bg-blue-100 text-blue-800',
    orange: 'bg-orange-100 text-orange-800',
    purple: 'bg-par-100 text-par-800',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant] || variants.gray}`}>
      {children}
    </span>
  )
}
