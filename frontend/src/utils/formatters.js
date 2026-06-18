/**
 * Formata valor para moeda BRL
 */
export function formatBRL(value) {
  const num = parseFloat(value) || 0
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Formata percentual
 */
export function formatPerc(value, decimals = 2) {
  return `${(parseFloat(value) || 0).toFixed(decimals)}%`
}

/**
 * Formata data BR (DD/MM/AAAA)
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T12:00:00' : ''))
    return d.toLocaleDateString('pt-BR')
  } catch {
    return dateStr
  }
}

/**
 * Formata data e hora BR
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleString('pt-BR')
  } catch {
    return dateStr
  }
}

/**
 * Formata número de horas (ex: 1.5 → "1h30min")
 */
export function formatHoras(horas) {
  const num = parseFloat(horas) || 0
  const isNegative = num < 0
  const absNum = Math.abs(num)
  
  const h = Math.floor(absNum)
  const m = Math.round((absNum - h) * 60)
  
  const sign = isNegative ? '-' : ''
  
  if (m === 0) return `${sign}${h}h`
  return `${sign}${h}h${m < 10 ? '0'+m : m}min`
}

/**
 * Status → classe CSS de badge
 */
export function statusBadgeClass(status) {
  const s = status?.toLowerCase() || ''
  if (s.includes('andamento'))                                                    return 'badge badge-blue'
  if (s.includes('concluíd') || s.includes('concluido') || s.includes('recebido')) return 'badge badge-green'
  if (s.includes('atrasado') || s.includes('cancelado'))                          return 'badge badge-red'
  if (s.includes('planejar') || s.includes('planejado'))                          return 'badge badge-yellow'
  if (s.includes('aguardando') || s.includes('faturado'))                         return 'badge badge-navy'
  if (s.includes('aprovação') || s.includes('aprovacao'))                         return 'badge badge-yellow'
  if (s.includes('paralisado'))                                                   return 'badge badge-orange'
  if (s.includes('arquivado') || s.includes('rascunho'))                          return 'badge badge-gray'
  if (s.includes('negociação') || s.includes('backlog'))                          return 'badge badge-purple'
  return 'badge badge-gray'
}

export function statusAccentColor(status) {
  const s = status?.toLowerCase() || ''
  if (s.includes('andamento'))                                                     return '#2563EB'
  if (s.includes('concluíd') || s.includes('concluido'))                          return '#16A34A'
  if (s.includes('atrasado') || s.includes('cancelado'))                          return '#DC2626'
  if (s.includes('planejar') || s.includes('planejado'))                          return '#D97706'
  if (s.includes('aguardando'))                                                   return '#1E3A5F'
  if (s.includes('paralisado'))                                                   return '#F97316'
  return '#94A3B8'
}

/**
 * Nível de alerta → classe CSS
 */
export function alertLevelClass(nivel) {
  if (nivel === 'error') return 'alert-error'
  if (nivel === 'warning') return 'alert-warning'
  return 'alert-info'
}

/**
 * Percentual de terceirizados → cor
 */
export function tercPercColor(perc) {
  const p = parseFloat(perc) || 0
  if (p >= 20) return 'text-red-600'
  if (p >= 15) return 'text-amber-600'
  return 'text-emerald-600'
}

/**
 * Parse de input monetário BR (1.234,56 → 1234.56)
 */
export function parseBRL(str) {
  if (!str) return 0
  return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0
}
