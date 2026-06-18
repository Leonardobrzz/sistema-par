import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useFieldArray } from 'react-hook-form'
import Input from '../common/Input'

const CARGOS = ['Arquiteto Sênior', 'Arquiteto Pleno', 'Arquiteto Júnior', 'Estagiário', 'Engenheiro', 'Projetista', 'Coordenador', 'Outros']

export default function EquipeTecnica({ control, register, errors, watch, totais }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'equipe' })

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="section-title mb-0">Equipe Técnica</h3>
          {totais && (
            <p className="text-xs text-slate-500 mt-0.5">
              Total: <span className="font-semibold text-par-700">R$ {totais.totalEquipe?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </p>
          )}
        </div>
        <button type="button" onClick={() => append({ cargo: '', nome: '', horas_estimadas: '', valor_hora: '' })} className="btn-add">
          <PlusIcon className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      {fields.length === 0 && (
        <div className="text-center text-slate-500 text-sm py-6 border-2 border-dashed border-slate-200 bg-slate-50 rounded-xl">
          Nenhum membro adicionado
        </div>
      )}

      <div className="space-y-2">
        {fields.map((field, index) => {
          const horas = parseFloat(watch(`equipe.${index}.horas_estimadas`) || 0)
          const isIllegal = horas > 16
          
          return (
            <div key={field.id} className={`grid grid-cols-12 gap-3 items-end transition-all rounded-xl p-4 border ${
              isIllegal ? 'bg-red-50/50 border-red-200' : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}>
              <div className="col-span-3">
                {index === 0 && <label className="form-label">Cargo</label>}
                <select className="form-select w-full" {...register(`equipe.${index}.cargo`)}>
                  <option value="">Selecione...</option>
                  {CARGOS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-3">
                <Input
                  label={index === 0 ? 'Nome' : undefined}
                  placeholder="Nome do profissional"
                  {...register(`equipe.${index}.nome`)}
                />
              </div>
              <div className="col-span-2 relative">
                <Input
                  label={index === 0 ? 'Horas Est.' : undefined}
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="40"
                  style={isIllegal ? { borderColor: '#ef4444', color: '#ef4444', fontWeight: 'bold' } : {}}
                  {...register(`equipe.${index}.horas_estimadas`)}
                />
                {isIllegal && (
                  <div className="absolute -bottom-4 left-0 text-[9px] font-black text-red-600 uppercase tracking-tighter animate-pulse">
                    ⚠️ Particionar tarefa (Max 16h)
                  </div>
                )}
              </div>
              <div className="col-span-3">
                <Input
                  label={index === 0 ? 'Valor/Hora (R$)' : undefined}
                  type="text"
                  placeholder="0,00"
                  {...register(`equipe.${index}.valor_hora`)}
                />
              </div>
              <div className={`col-span-1 flex items-center justify-center ${index === 0 ? 'mb-1' : ''}`}>
                <button type="button" onClick={() => remove(index)} className="p-2 text-red-500 hover:text-red-400 hover:bg-red-500/20 rounded-xl transition-all">
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
