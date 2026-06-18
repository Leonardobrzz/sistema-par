import { PlusIcon, TrashIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useFieldArray } from 'react-hook-form'
import Input from '../common/Input'
import { tercPercColor } from '../../utils/formatters'

export default function ServicosTerceirizados({ control, register, errors, watch, valorContrato, totais }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'terceirizados' })

  const percTerceiros = totais?.percTerceiros || 0
  const isWarning = percTerceiros >= 15
  const isBlocked = percTerceiros >= 20

  function handleAdd() {
    append({
      fornecedor: '',
      servico: '',
      valor_estimado: '',
      percentual_contrato: '',
    })
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="section-title mb-0">Serviços Terceirizados</h3>
          {isWarning && (
            <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${isBlocked ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
              <ExclamationTriangleIcon className="w-3.5 h-3.5" />
              {percTerceiros.toFixed(1)}% {isBlocked ? '— LIMITE ATINGIDO' : '— Atenção'}
            </span>
          )}
        </div>
        <button type="button" onClick={handleAdd} className="btn-add" disabled={isBlocked}>
          <PlusIcon className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      {/* Gauge visual */}
      <div className="mb-4 bg-white border border-slate-200 shadow-sm rounded-xl p-4">
        <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
          <span>% Terceirizados sobre Contrato</span>
          <span className={`font-black ${tercPercColor(percTerceiros)}`}>{percTerceiros.toFixed(2)}%</span>
        </div>
        <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-emerald-400 opacity-20" style={{ width: '15%' }} />
          <div className="absolute inset-y-0 left-[15%] bg-amber-400 opacity-20" style={{ width: '5%' }} />
          <div className="absolute inset-y-0 left-[20%] bg-red-400 opacity-20" style={{ width: '80%' }} />
          <div
            className={`h-full rounded-full transition-all ${isBlocked ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-par-500'}`}
            style={{ width: `${Math.min(percTerceiros, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>0%</span>
          <span className="text-amber-600">15%</span>
          <span className="text-red-600">20%</span>
          <span>100%</span>
        </div>
      </div>

      {fields.length === 0 && (
        <div className="text-center text-slate-500 text-sm py-6 border-2 border-dashed border-slate-200 bg-slate-50 rounded-xl">
          Nenhum serviço terceirizado adicionado
        </div>
      )}

      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-12 gap-3 items-end bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-colors rounded-xl p-4">
            <div className="col-span-4">
              <Input
                label={index === 0 ? 'Fornecedor' : undefined}
                placeholder="Nome do fornecedor"
                {...register(`terceirizados.${index}.fornecedor`)}
              />
            </div>
            <div className="col-span-4">
              <Input
                label={index === 0 ? 'Serviço' : undefined}
                placeholder="Descrição do serviço"
                {...register(`terceirizados.${index}.servico`)}
              />
            </div>
            <div className="col-span-3">
              <Input
                label={index === 0 ? 'Valor Estimado (R$)' : undefined}
                type="text"
                placeholder="0,00"
                {...register(`terceirizados.${index}.valor_estimado`)}
              />
            </div>
            <div className={`col-span-1 flex items-center justify-center ${index === 0 ? 'mb-1' : ''}`}>
              <button
                type="button"
                onClick={() => remove(index)}
                className="p-2 text-red-500 hover:text-red-400 hover:bg-red-500/20 rounded-xl transition-all"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
