export default function LoadingSpinner({ size = 'md', text = '' }) {
  const sizes = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="relative">
        <div
          className={`${sizes[size]} rounded-full border-2 border-par-500/20`}
          style={{ borderWidth: '2px' }}
        />
        <div
          className={`${sizes[size]} rounded-full border-t-2 border-par-500 animate-spin absolute inset-0`}
          style={{ borderWidth: '2px', borderColor: 'transparent', borderTopColor: '#6366f1' }}
        />
        <div
          className={`${sizes[size]} rounded-full border-r-2 border-par-400/40 animate-spin absolute inset-0`}
          style={{ borderWidth: '2px', borderColor: 'transparent', borderRightColor: 'rgba(99,102,241,0.4)', animationDuration: '0.75s' }}
        />
      </div>
      {text && (
        <div className="text-center">
          <p className="text-slate-400 text-sm font-medium">{text}</p>
          <div className="flex items-center justify-center gap-1 mt-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1 h-1 rounded-full bg-par-500/60"
                style={{ animation: `pulse-dot 1.4s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
