import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useFieldArray } from 'react-hook-form'
import Input from '../common/Input'

const CATEGORIAS_DESPESA = [
  'Transporte', 'Hospedagem', 'Material de Escritório', 'Impressão/Plotagem',
  'Software', 'Equipamentos', 'Alimentação', 'Taxas e Certidões', 'Comunicação', 'Outros'
]

export default function DespesasGerais({ control, register, errors, watch, totais }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'despesas' })

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="section-title mb-0">Despesas Gerais</h3>
          {totais && (
            <p className="text-xs text-slate-500 mt-0.5">
              Total: <span className="font-semibold text-par-700">R$ {totais.totalDespesas?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </p>
          )}
        </div>
        <button type="button" onClick={() => append({ categoria: '', descricao: '', valor: '' })} className="btn-add">
          <PlusIcon className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      {fields.length === 0 && (
        <div className="text-center text-slate-500 text-sm py-6 border-2 border-dashed border-slate-200 bg-slate-50 rounded-xl">
          Nenhuma despesa adicionada
        </div>
      )}

      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-12 gap-3 items-end bg-white border border-slate-200 hover:bg-slate-50 transition-colors rounded-xl p-4">
            <div className="col-span-4">
              {index === 0 && <label className="form-label">Categoria</label>}
              <select className="form-select w-full" {...register(`despesas.${index}.categoria`)}>
                <option value="">Selecione...</option>
                {CATEGORIAS_DESPESA.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-5">
              <Input
                label={index === 0 ? 'Descrição' : undefined}
                placeholder="Descrição da despesa"
                {...register(`despesas.${index}.descricao`)}
              />
            </div>
            <div className="col-span-2">
              <Input
                label={index === 0 ? 'Valor (R$)' : undefined}
                type="text"
                placeholder="0,00"
                {...register(`despesas.${index}.valor`)}
              />
            </div>
            <div className={`col-span-1 flex items-center justify-center ${index === 0 ? 'mb-1' : ''}`}>
              <button type="button" onClick={() => remove(index)} className="p-2 text-red-500 hover:text-red-400 hover:bg-red-500/20 rounded-xl transition-all">
                <TrashIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
