import {
  RadarChart as ReRadar, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, Legend, Tooltip,
} from 'recharts'

export default function RadarEquilibrio({ totalTerceiros, totalEquipe, totalDespesas, impostos, taxaAdm, comissao, valorContrato }) {
  const V = parseFloat(valorContrato) || 1

  const data = [
    { subject: 'Terceirizados',  valor: Math.round((totalTerceiros / V) * 100) },
    { subject: 'Equipe Interna', valor: Math.round((totalEquipe / V) * 100) },
    { subject: 'Despesas',       valor: Math.round((totalDespesas / V) * 100) },
    { subject: 'Impostos',       valor: Math.round((impostos / V) * 100) },
    { subject: 'Taxa Adm',       valor: Math.round((taxaAdm / V) * 100) },
    { subject: 'Comissão',       valor: Math.round((comissao / V) * 100) },
  ]

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ReRadar data={data} outerRadius="70%">
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#64748B' }} />
        <Radar name="% do Contrato" dataKey="valor" stroke="#4338CA" fill="#4338CA" fillOpacity={0.25} />
        <Tooltip formatter={(v) => [`${v}%`, '% do Contrato']} />
      </ReRadar>
    </ResponsiveContainer>
  )
}
