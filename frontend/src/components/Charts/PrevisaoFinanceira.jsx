import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { formatBRL } from '../../utils/formatters'

export default function PrevisaoFinanceira({ data, breakEven }) {
  // data: [{ mes: 'Jan/25', previsto: 50000, recebido: 45000 }]
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="prevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#818CF8" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="recGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v, name) => [formatBRL(v), name]}
          contentStyle={{ backgroundColor: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
          itemStyle={{ color: '#e2e8f0', fontWeight: '500' }}
        />
        {breakEven > 0 && (
          <ReferenceLine y={breakEven} stroke="#EF4444" strokeDasharray="4 4"
            label={{ value: 'Break-even', position: 'insideTopRight', fontSize: 10, fill: '#EF4444' }} />
        )}
        <Area type="monotone" dataKey="previsto" name="Previsto" stroke="#4f46e5" fill="url(#prevGrad)" strokeWidth={3} />
        <Area type="monotone" dataKey="recebido" name="Recebido" stroke="#10B981" fill="url(#recGrad)" strokeWidth={3} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
