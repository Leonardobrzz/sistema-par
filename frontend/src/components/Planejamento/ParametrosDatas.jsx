import Input from '../common/Input'

export default function ParametrosDatas({ register, errors, watch, config }) {
  const impostos = watch('impostosPerc')
  const taxaAdm  = watch('taxaAdmPerc')
  const comissao = watch('comissaoPerc')

  return (
    <section>
      <h3 className="section-title">Parâmetros Financeiros &amp; Datas</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Impostos (%)"
          type="number"
          step="0.01"
          min="0"
          max="100"
          required
          defaultValue={config?.DEFAULT_IMPOSTOS_PERC || '16.33'}
          error={errors.impostosPerc?.message}
          {...register('impostosPerc', {
            required: 'Obrigatório',
            min: { value: 0, message: 'Mín. 0' },
            max: { value: 100, message: 'Máx. 100' },
          })}
        />
        <Input
          label="Taxa Administrativa (%)"
          type="number"
          step="0.01"
          min="0"
          max="100"
          required
          defaultValue={config?.DEFAULT_TAXA_ADM_PERC || '12'}
          error={errors.taxaAdmPerc?.message}
          {...register('taxaAdmPerc', {
            required: 'Obrigatório',
            min: { value: 0, message: 'Mín. 0' },
            max: { value: 100, message: 'Máx. 100' },
          })}
        />
        <Input
          label="Comissão Comercial (%)"
          type="number"
          step="0.01"
          min="0"
          max="100"
          defaultValue={config?.DEFAULT_COMISSAO_PERC || '7.5'}
          {...register('comissaoPerc', {
            min: { value: 0, message: 'Mín. 0' },
            max: { value: 100, message: 'Máx. 100' },
          })}
        />
        <div className="bg-par-50 rounded-lg p-3 flex flex-col justify-center">
          <p className="text-xs text-slate-500 mb-1">Total Devolutivas</p>
          <p className="text-lg font-bold text-par-700">
            {((parseFloat(impostos)||0) + (parseFloat(taxaAdm)||0) + (parseFloat(comissao)||0)).toFixed(2)}%
          </p>
        </div>
        <Input
          label="Data de Início"
          type="date"
          {...register('Data_Inicio')}
        />
        <Input
          label="Data de Entrega do Contrato"
          type="date"
          {...register('Data_Entrega_Contrato')}
        />
        <Input
          label="Área do Projeto (m²)"
          type="number"
          step="0.01"
          min="0"
          {...register('Area_m2')}
        />
        <Input
          label="Prazo em Meses"
          type="number"
          min="1"
          {...register('Prazo_Meses')}
        />
      </div>
    </section>
  )
}
