import { Controller } from 'react-hook-form'
import Input from '../common/Input'

const SETORES = ['Arquitetura', 'Engenharia', 'Interiores', 'Urbanismo', 'Regularização', 'Outros']
const CATEGORIAS = ['Residencial', 'Comercial', 'Industrial', 'Institucional', 'Infraestrutura', 'Outros']
const STATUS_LIST = [
  'A Planejar', 'Em Andamento', 'Paralisado', 'Aguardando Aprovação',
  'Aguardando Cliente', 'Concluído', 'Arquivado'
]

export default function InformacoesGerais({ control, register, errors, watch }) {
  return (
    <section>
      <h3 className="section-title">Informações Gerais</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Gerente / PO"
          required
          error={errors.PO_Responsavel?.message}
          {...register('PO_Responsavel', { required: 'Obrigatório' })}
        />
        <div>
          <label className="form-label">Setor <span className="text-red-500">*</span></label>
          <select className="form-select" {...register('Setor', { required: 'Obrigatório' })}>
            <option value="">Selecione...</option>
            {SETORES.map((s) => <option key={s}>{s}</option>)}
          </select>
          {errors.Setor && <p className="text-red-500 text-xs mt-1">{errors.Setor.message}</p>}
        </div>
        <div>
          <label className="form-label">Categoria</label>
          <select className="form-select" {...register('Categoria')}>
            <option value="">Selecione...</option>
            {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Status</label>
          <select className="form-select" {...register('Status')}>
            {STATUS_LIST.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <Input
          label="Número do Contrato"
          placeholder="JBP-2025-001"
          {...register('Nr_Contrato')}
        />
        <Input
          label="Valor Global do Contrato (R$)"
          required
          type="text"
          placeholder="0,00"
          error={errors.Valor_Global?.message}
          {...register('Valor_Global', { required: 'Obrigatório' })}
        />
        <Input
          label="Endereço / Localização"
          placeholder="Cidade, Estado"
          className="md:col-span-2"
          {...register('Endereco')}
        />
        <Input
          label="Link ClickUp"
          placeholder="https://app.clickup.com/..."
          className="md:col-span-2"
          {...register('Link_ClickUp')}
        />
        <div className="md:col-span-2">
          <label className="form-label">Observações</label>
          <textarea
            className="form-input h-20 resize-none"
            {...register('Observacoes')}
          />
        </div>
      </div>
    </section>
  )
}
