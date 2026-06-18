import { useEffect, useState, useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { PlusIcon, TrashIcon, ArrowPathIcon, UsersIcon, SparklesIcon } from '@heroicons/react/24/outline'
import api from '../utils/api'
import { formatDate, formatBRL, tercPercColor } from '../utils/formatters'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Modal from '../components/common/Modal'
import Input from '../components/common/Input'

const WORKFLOW_STEPS = [
  'Backlog', 'Autorizado', 'Em Negociação', 'Ordem de Compra',
  'Em Andamento', 'Análise Técnica', 'Aguardando Aprovação Externa', 'Contas a Pagar', 'Concluído'
]

const STATUS_COLOR = {
  'Backlog': 'badge-gray',
  'Autorizado': 'badge-blue',
  'Em Negociação': 'badge-yellow',
  'Ordem de Compra': 'badge-yellow',
  'Em Andamento': 'badge-green',
  'Análise Técnica': 'badge-blue',
  'Aguardando Aprovação Externa': 'badge-orange',
  'Contas a Pagar': 'badge-red',
  'Concluído': 'badge-green',
  'Cancelado': 'badge-gray',
}

export default function Terceirizados() {
  const [terceirizados, setTerceirizados] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [filters, setFilters] = useState({ status: '', idProjeto: '' })
  const [projetos, setProjetos] = useState([])
  const [filtroSetor, setFiltroSetor] = useState('')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tercRes, projRes] = await Promise.all([
        api.get('/terceirizados', { params: filters }),
        api.get('/projetos'),
      ])
      setTerceirizados(Array.isArray(tercRes.data) ? tercRes.data : (tercRes.data.terceirizados || []))
      setProjetos(projRes.data.projetos || [])
    } catch {
      toast.error('Erro ao carregar terceirizados')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  function handleEdit(item) {
    setEditItem(item)
    setShowModal(true)
  }

  async function handleDelete(id) {
    if (!window.confirm('Cancelar este serviço terceirizado?')) return
    try {
      await api.delete(`/terceirizados/${id}`)
      toast.success('Cancelado com sucesso')
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cancelar')
    }
  }

  const SETORES_PAR = ['Arquitetura', 'Saneamento', 'Infraestrutura', 'Administrativo']
  const fornecedoresUnicos = useMemo(() => [...new Set(terceirizados.map(t => t.Fornecedor).filter(Boolean))].sort(), [terceirizados])
  const projetosFiltrados = useMemo(() => projetos.filter(p => {
    if (filtroSetor && !(p.Setor || '').toLowerCase().includes(filtroSetor.toLowerCase())) return false
    return true
  }), [projetos, filtroSetor])
  const tercFiltrados = useMemo(() => terceirizados.filter(t => {
    if (filtroFornecedor && t.Fornecedor !== filtroFornecedor) return false
    if (filtroBusca) {
      const b = filtroBusca.toLowerCase()
      if (!(t.Fornecedor || '').toLowerCase().includes(b) && !(t.Descricao_Servico || '').toLowerCase().includes(b) && !(t.nomeProjeto || '').toLowerCase().includes(b)) return false
    }
    return true
  }), [terceirizados, filtroFornecedor, filtroBusca])

  return (
    <div className="space-y-5 fade-in">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UsersIcon className="w-5 h-5 text-par-400" />
            <h1 className="page-title">Serviços Terceirizados</h1>
          </div>
          <p className="text-sm text-slate-500">{tercFiltrados.length} de {terceirizados.length} registros</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary flex items-center gap-2">
            <ArrowPathIcon className="w-4 h-4" />
            Atualizar
          </button>
          <button onClick={() => { setEditItem(null); setShowModal(true) }} className="btn-primary flex items-center gap-2">
            <PlusIcon className="w-4 h-4" />
            Novo Registro
          </button>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex gap-2 flex-wrap items-center">
        {SETORES_PAR.map(s => (
          <button key={s} onClick={() => setFiltroSetor(filtroSetor === s ? '' : s)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${filtroSetor === s ? 'border-par-400 bg-par-400/10 text-par-300' : 'border-white/10 bg-white/5 text-slate-400 hover:border-par-400/50'}`}>
            {s}
          </button>
        ))}
        <select className="form-select text-sm" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Status: Todos</option>
          {WORKFLOW_STEPS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="form-select text-sm" value={filters.idProjeto} onChange={(e) => setFilters({ ...filters, idProjeto: e.target.value })}>
          <option value="">Projeto: Todos</option>
          {projetosFiltrados.map((p) => <option key={p.ID_Projeto} value={p.ID_Projeto}>{p.Nome}</option>)}
        </select>
        <select className="form-select text-sm" value={filtroFornecedor} onChange={(e) => setFiltroFornecedor(e.target.value)}>
          <option value="">Fornecedor: Todos</option>
          {fornecedoresUnicos.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <input value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} placeholder="Buscar..."
          className="form-input text-sm w-40" />
      </div>

      {/* ── Tabela ── */}
      {loading ? (
        <div className="card-glass py-20">
          <LoadingSpinner text="Buscando terceirizados..." />
        </div>
      ) : (
        <div className="card-glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr>
                  <th className="table-header px-5 py-4 w-1/4">Projeto</th>
                  <th className="table-header px-5">Fornecedor</th>
                  <th className="table-header px-5">Serviço</th>
                  <th className="table-header px-5 text-right">Valor Est.</th>
                  <th className="table-header px-5 text-right">% Contrato</th>
                  <th className="table-header px-5 text-center">Status</th>
                  <th className="table-header px-5 text-center">Vencimento</th>
                  <th className="table-header px-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {terceirizados.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-16 px-4">
                      <UsersIcon className="w-12 h-12 text-slate-600 mx-auto mb-3 opacity-50" />
                      <p className="text-sm text-slate-400">Nenhum registro encontrado</p>
                    </td>
                  </tr>
                ) : (
                  tercFiltrados.map((t) => {
                    const perc = parseFloat(t.Percentual_Contrato || 0);
                    return (
                      <tr key={t.ID_Terceirizado} className="table-row group">
                        <td className="px-5 py-4">
                          <p className="font-bold text-sm max-w-[200px] truncate" title={t.nomeProjeto || t.ID_Projeto}>
                            {t.nomeProjeto || t.ID_Projeto}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-sm font-bold text-par-400">{t.Fornecedor}</td>
                        <td className="px-5 py-4 text-xs font-semibold max-w-xs truncate" title={t.Descricao_Servico}>{t.Descricao_Servico}</td>
                        <td className="px-5 py-4 text-sm font-bold text-right">{formatBRL(t.Valor_Estimado)}</td>
                        <td className="px-5 py-4 text-xs font-semibold text-right">
                          <span className={`${perc > 20 ? 'text-red-500' : perc > 15 ? 'text-amber-500' : ''}`}>
                            {perc.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className={`badge ${STATUS_COLOR[t.Status] || 'badge-gray'}`}>{t.Status}</span>
                        </td>
                        <td className="px-5 py-4 text-xs font-semibold text-center">{formatDate(t.Data_Vencimento) || '—'}</td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEdit(t)} className="text-xs text-par-400 hover:text-par-300 font-bold transition-colors">
                              EDITAR
                            </button>
                            <span className="text-white/10">|</span>
                            <button onClick={() => handleDelete(t.ID_Terceirizado)} className="text-xs text-red-500 hover:text-red-400 font-bold transition-colors" title="Cancelar Serviço">
                              CANCELAR
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <TerceirizadoModal
          item={editItem}
          projetos={projetos}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}

function TerceirizadoModal({ item, projetos, onClose, onSaved }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: item || {},
  })

  async function onSubmit(data) {
    setLoading(true)
    try {
      if (item?.ID_Terceirizado) {
        await api.put(`/terceirizados/${item.ID_Terceirizado}`, data)
        toast.success('Atualizado com sucesso!')
      } else {
        await api.post('/terceirizados', data)
        toast.success('Criado com sucesso!')
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open title={item ? 'Editar Terceirizado' : 'Novo Terceirizado'} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-1">
        <div className="grid grid-cols-2 gap-5">
          <div className="col-span-2">
            <label className="form-label">Projeto <span className="text-red-500">*</span></label>
            <select className="form-select" {...register('ID_Projeto', { required: 'Obrigatório' })}>
              <option value="">Selecione...</option>
              {projetos.map((p) => <option key={p.ID_Projeto} value={p.ID_Projeto}>{p.Nome}</option>)}
            </select>
          </div>
          <Input label="Fornecedor" required error={errors.Fornecedor?.message} {...register('Fornecedor', { required: 'Obrigatório' })} />
          <Input label="CNPJ/CPF" {...register('CNPJ_CPF')} />
          <Input label="Descrição do Serviço" className="col-span-2" {...register('Descricao_Servico')} />
          <Input label="Valor Estimado (R$)" type="text" placeholder="0,00" error={errors.Valor_Estimado?.message} {...register('Valor_Estimado', { required: 'Obrigatório' })} required />
          <Input label="Valor Contratado (R$)" type="text" placeholder="0,00" {...register('Valor_Contratado')} />
          <div>
            <label className="form-label">Status</label>
            <select className="form-select" {...register('Status')}>
              {WORKFLOW_STEPS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <Input label="Data de Vencimento" type="date" {...register('Data_Vencimento')} />
          <Input label="Número NF" {...register('Nr_NF')} />
          <Input label="Data de Pagamento" type="date" {...register('Data_Pagamento')} />
          <div className="col-span-2">
            <label className="form-label">Observações</label>
            <textarea className="form-input h-20 resize-none" {...register('Observacoes')} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-6">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
             {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
            {loading ? 'Salvando...' : 'Salvar Registro'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
