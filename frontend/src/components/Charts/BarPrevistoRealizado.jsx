import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { formatBRL } from '../../utils/formatters'

export default function BarPrevistoRealizado({ data }) {
  // data: [{ mes: 'Jan/25', previsto: 50000, realizado: 45000 }]
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v, name) => [formatBRL(v), name]}
          contentStyle={{ backgroundColor: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
          itemStyle={{ color: '#e2e8f0', fontWeight: '500' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: '10px' }} iconType="circle" />
        <Bar dataKey="previsto" name="Previsto" fill="#4f46e5" radius={[4,4,0,0]} />
        <Bar dataKey="realizado" name="Realizado" fill="#10b981" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
