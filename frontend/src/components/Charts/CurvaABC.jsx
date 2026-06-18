import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { formatBRL } from '../../utils/formatters'

export default function CurvaABC({ fornecedores }) {
  // fornecedores: [{ nome, valor }] sorted desc
  const sorted = [...(fornecedores || [])].sort((a, b) => b.valor - a.valor).slice(0, 12)
  const total = sorted.reduce((s, f) => s + f.valor, 0)
  let cumulative = 0
  const data = sorted.map((f) => {
    cumulative += f.valor
    const perc = total > 0 ? (cumulative / total) * 100 : 0
    return { nome: f.nome.split(' ')[0], valor: f.valor, cumPerc: perc }
  })

  const getColor = (entry) => {
    if (entry.cumPerc <= 80) return '#4338CA'
    if (entry.cumPerc <= 95) return '#818CF8'
    return '#C7D2FE'
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="nome" tick={{ fontSize: 9, fill: '#64748B' }} angle={-30} textAnchor="end" />
        <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
        <Tooltip formatter={(v) => [formatBRL(v), 'Valor']} />
        <Bar dataKey="valor" name="Valor" radius={[3,3,0,0]}>
          {data.map((entry, i) => <Cell key={i} fill={getColor(entry)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
