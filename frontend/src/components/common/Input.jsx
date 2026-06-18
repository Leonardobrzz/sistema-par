import { forwardRef } from 'react'

const Input = forwardRef(({ label, required, error, className = '', ...props }, ref) => {
  return (
    <div className={className}>
      {label && (
        <label className="form-label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input ref={ref} className={`form-input ${error ? 'border-red-400 focus:ring-red-400' : ''}`} {...props} />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
})

export default Input
