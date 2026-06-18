import { formatBRL, formatPerc } from '../../utils/formatters'
import RadarEquilibrio from '../Charts/RadarEquilibrio'

function MetricRow({ label, value, valueClass = 'text-slate-700', highlight }) {
  return (
    <div className={`flex justify-between items-center py-2 border-b border-slate-100 last:border-0 ${highlight ? 'bg-slate-50 -mx-4 px-4 rounded' : ''}`}>
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`text-sm font-semibold ${valueClass}`}>{value}</span>
    </div>
  )
}

export default function ResumoDevolutivas({ totais, valorContrato }) {
  if (!totais) return null

  const {
    impostos, taxaAdm, comissao, totalDevolutivas,
    receitaLiquida, totalTerceiros, totalEquipe, totalDespesas, totalCustos,
    producao, producaoPerc, lucroEstimado, lucroPerc, breakEven, percTerceiros,
  } = totais

  const lucroColor = lucroPerc >= 20 ? 'text-emerald-600' : lucroPerc >= 10 ? 'text-amber-600' : 'text-red-600'
  const producaoColor = producaoPerc >= 35 ? 'text-emerald-600' : 'text-amber-600'

  return (
    <section>
      <h3 className="section-title">Resumo Financeiro (Devolutivas)</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Coluna esquerda: números */}
        <div>
          <div className="bg-par-700 text-white rounded-xl p-4 mb-4">
            <p className="text-xs opacity-75 uppercase tracking-wide">Valor Global do Contrato</p>
            <p className="text-2xl font-bold mt-1">{formatBRL(valorContrato)}</p>
          </div>

          <div className="space-y-0 bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Devolutivas</p>
            <MetricRow label={`Impostos (${totais.impostosPerc?.toFixed(2) || '—'}%)`} value={formatBRL(impostos)} />
            <MetricRow label={`Taxa Adm. (${totais.taxaAdmPerc?.toFixed(2) || '—'}%)`} value={formatBRL(taxaAdm)} />
            <MetricRow label={`Comissão (${totais.comissaoPerc?.toFixed(2) || '—'}%)`} value={formatBRL(comissao)} />
            <MetricRow label="Total Devolutivas" value={formatBRL(totalDevolutivas)} valueClass="text-red-600 font-bold" />
            <MetricRow label="Receita Líquida" value={formatBRL(receitaLiquida)} valueClass="text-par-700 font-bold" highlight />

            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4 mb-2">Custos</p>
            <MetricRow label="Terceirizados" value={`${formatBRL(totalTerceiros)} (${formatPerc(percTerceiros)})`} valueClass={percTerceiros >= 15 ? 'text-amber-600' : 'text-slate-700'} />
            <MetricRow label="Equipe Técnica" value={formatBRL(totalEquipe)} />
            <MetricRow label="Despesas Gerais" value={formatBRL(totalDespesas)} />
            <MetricRow label="Total Custos" value={formatBRL(totalCustos)} valueClass="text-red-600 font-bold" />

            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4 mb-2">Resultado</p>
            <MetricRow
              label="Produção"
              value={`${formatBRL(producao)} (${formatPerc(producaoPerc)})`}
              valueClass={producaoColor}
              highlight
            />
            {producaoPerc < 35 && (
              <p className="text-xs text-amber-600 mt-1">⚠️ Meta de produção abaixo de 35%</p>
            )}
            <MetricRow
              label="Lucro Estimado"
              value={`${formatBRL(lucroEstimado)} (${formatPerc(lucroPerc)})`}
              valueClass={lucroColor}
              highlight
            />
            <MetricRow label="Break-even" value={formatBRL(breakEven)} />
          </div>
        </div>

        {/* Coluna direita: radar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700 mb-3">Distribuição dos Custos</p>
          <RadarEquilibrio
            totalTerceiros={totalTerceiros}
            totalEquipe={totalEquipe}
            totalDespesas={totalDespesas}
            impostos={impostos}
            taxaAdm={taxaAdm}
            comissao={comissao}
            valorContrato={valorContrato}
          />
          <div className="grid grid-cols-2 gap-3 mt-4 text-center text-xs">
            <div className="bg-slate-50 rounded-lg p-2">
              <p className="text-slate-400">Produção</p>
              <p className={`font-bold text-base ${producaoColor}`}>{formatPerc(producaoPerc)}</p>
              <p className="text-slate-400">Meta ≥ 35%</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2">
              <p className="text-slate-400">Lucro Estimado</p>
              <p className={`font-bold text-base ${lucroColor}`}>{formatPerc(lucroPerc)}</p>
              <p className="text-slate-400">Meta ≥ 20%</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
