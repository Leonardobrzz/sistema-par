import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useFieldArray } from 'react-hook-form'
import Input from '../common/Input'

const TIPOS_MEDICAO = ['Projetos', 'Prefeitura', 'Laudo', 'Entrega Final', 'Parcela', 'Outros']

export default function CronogramaRecebimento({ control, register, errors, watch }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'medicoes' })

  const medicoes = watch('medicoes') || []
  const somaPerc = medicoes.reduce((s, m) => s + (parseFloat(m.percentual) || 0), 0)
  const isOk = Math.abs(somaPerc - 100) < 0.01

  function handleAdd() {
    append({
      descricao: '',
      tipo: 'Projetos',
      percentual: '',
      data_prevista: '',
      previsao_NF: '',
    })
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="section-title mb-0">Cronograma de Recebimento</h3>
        <button type="button" onClick={handleAdd} className="btn-add">
          <PlusIcon className="w-4 h-4" />
          Adicionar Medição
        </button>
      </div>

      <div className={`mb-3 rounded-lg px-4 py-2 text-sm font-medium flex items-center justify-between ${isOk ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
        <span>Soma dos percentuais: <strong>{somaPerc.toFixed(2)}%</strong></span>
        {!isOk && <span className="text-xs">⚠️ Deve totalizar 100% para submeter</span>}
        {isOk && <span className="text-xs">✅ OK</span>}
      </div>

      {fields.length === 0 && (
        <div className="text-center text-slate-500 text-sm py-6 border-2 border-dashed border-slate-200 bg-slate-50 rounded-xl">
          Nenhuma medição adicionada
        </div>
      )}

      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-12 gap-3 items-end bg-white border border-slate-200 hover:bg-slate-50 transition-colors rounded-xl p-4 shadow-sm">
            <div className="col-span-3">
              <Input
                label={index === 0 ? 'Descrição' : undefined}
                placeholder="Entrega de Projeto..."
                {...register(`medicoes.${index}.descricao`)}
              />
            </div>
            <div className="col-span-2">
              {index === 0 && <label className="form-label">Tipo</label>}
              <select className="form-select w-full" {...register(`medicoes.${index}.tipo`)}>
                {TIPOS_MEDICAO.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <Input
                label={index === 0 ? '% do Contrato' : undefined}
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="25.00"
                error={errors.medicoes?.[index]?.percentual?.message}
                {...register(`medicoes.${index}.percentual`, {
                  min: { value: 0.01, message: 'Mín. 0.01' },
                })}
              />
            </div>
            <div className="col-span-2">
              <Input
                label={index === 0 ? 'Data Prevista' : undefined}
                type="date"
                {...register(`medicoes.${index}.data_prevista`)}
              />
            </div>
            <div className="col-span-2">
              <Input
                label={index === 0 ? 'Previsão NF' : undefined}
                type="date"
                {...register(`medicoes.${index}.previsao_NF`)}
              />
            </div>
            <div className={`col-span-1 flex items-center justify-center ${index === 0 ? 'mb-1' : ''}`}>
              <button
                type="button"
                onClick={() => remove(index)}
                className="p-2 text-red-500 hover:text-red-400 hover:bg-red-500/20 rounded-xl transition-all"
                title="Remover"
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
