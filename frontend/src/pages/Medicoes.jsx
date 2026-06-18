import { useEffect, useState, useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { PlusIcon, ArrowPathIcon, ChartBarIcon, SparklesIcon } from '@heroicons/react/24/outline'
import api from '../utils/api'
import { formatDate, formatBRL } from '../utils/formatters'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Modal from '../components/common/Modal'
import Input from '../components/common/Input'

const STATUS_MEDICAO = ['Prevista', 'Em Andamento', 'Concluída', 'Cancelada']
const STATUS_FIN_COLOR = {
  'Pendente': 'badge-gray',
  'NF Emitida': 'badge-blue',
  'Recebido': 'badge-green',
  'Atrasado': 'badge-red',
}

export default function Medicoes() {
  const [medicoes, setMedicoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [projetos, setProjetos] = useState([])
  const [filtroSetor, setFiltroSetor] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroProjeto, setFiltroProjeto] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [medRes, projRes] = await Promise.all([
        api.get('/medicoes'),
        api.get('/projetos'),
      ])
      setMedicoes(medRes.data.medicoes || [])
      setProjetos(projRes.data.projetos || [])
    } catch {
      toast.error('Erro ao carregar medições')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const SETORES_PAR = ['Arquitetura', 'Saneamento', 'Infraestrutura', 'Administrativo']
  const projetoMap = useMemo(() => Object.fromEntries(projetos.map(p => [p.ID_Projeto, p])), [projetos])
  const medicoesFiltradas = useMemo(() => medicoes.filter(m => {
    const proj = projetoMap[m.ID_Projeto] || {}
    if (filtroSetor && !(proj.Setor || '').toLowerCase().includes(filtroSetor.toLowerCase())) return false
    if (filtroStatus && m.Status !== filtroStatus) return false
    if (filtroProjeto && m.ID_Projeto !== filtroProjeto) return false
    if (filtroBusca) {
      const b = filtroBusca.toLowerCase()
      if (!(m.nomeProjeto || '').toLowerCase().includes(b) && !(m.Descricao || '').toLowerCase().includes(b)) return false
    }
    return true
  }), [medicoes, filtroSetor, filtroStatus, filtroProjeto, filtroBusca, projetoMap])

  return (
    <div className="space-y-5 fade-in">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ChartBarIcon className="w-5 h-5 text-par-400" />
            <h1 className="page-title">Medições & Faturamento</h1>
          </div>
          <p className="text-sm text-slate-500">{medicoesFiltradas.length} de {medicoes.length} registros</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary flex items-center gap-2">
            <ArrowPathIcon className="w-4 h-4" />
            Atualizar
          </button>
          <button onClick={() => { setEditItem(null); setShowModal(true) }} className="btn-primary flex items-center gap-2">
            <PlusIcon className="w-4 h-4" />
            Nova Medição
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
        <select className="form-select text-sm" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Status: Todos</option>
          {STATUS_MEDICAO.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-select text-sm" value={filtroProjeto} onChange={e => setFiltroProjeto(e.target.value)}>
          <option value="">Projeto: Todos</option>
          {projetos.filter(p => !filtroSetor || (p.Setor || '').toLowerCase().includes(filtroSetor.toLowerCase())).map(p => <option key={p.ID_Projeto} value={p.ID_Projeto}>{p.Nome}</option>)}
        </select>
        <input value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} placeholder="Buscar..."
          className="form-input text-sm w-40" />
        {(filtroSetor || filtroStatus || filtroProjeto || filtroBusca) && (
          <button onClick={() => { setFiltroSetor(''); setFiltroStatus(''); setFiltroProjeto(''); setFiltroBusca('') }}
            className="px-3 py-1.5 rounded-full text-xs font-bold border border-red-500/30 bg-red-500/10 text-red-400 cursor-pointer">
            Limpar
          </button>
        )}
      </div>

      {/* ── Tabela ── */}
      {loading ? (
        <div className="card-glass py-20">
          <LoadingSpinner text="Buscando registros..." />
        </div>
      ) : (
        <div className="card-glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr>
                  <th className="table-header py-4 px-5">Projeto</th>
                  <th className="table-header px-5">Descrição</th>
                  <th className="table-header px-5 text-center">Tipo</th>
                  <th className="table-header px-5 text-right">%</th>
                  <th className="table-header px-5 text-right">Valor</th>
                  <th className="table-header px-5">Previsto</th>
                  <th className="table-header px-5 text-center">Status Operacional</th>
                  <th className="table-header px-5 text-center">Financeiro</th>
                  <th className="table-header px-5">O.C. / OS OPP</th>
                  <th className="table-header px-5 text-right w-24">Ações</th>
                </tr>
              </thead>
              <tbody>
                {medicoes.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-16 px-4">
                      <ChartBarIcon className="w-12 h-12 text-slate-600 mx-auto mb-3 opacity-50" />
                      <p className="text-sm text-slate-400">Nenhuma medição encontrada</p>
                    </td>
                  </tr>
                ) : (
                  medicoesFiltradas.map((m) => (
                    <tr key={m.ID_Medicao} className={`table-row group ${m.atrasada ? 'bg-red-500/5' : ''}`}>
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-200 text-sm max-w-xs truncate">{m.nomeProjeto || m.ID_Projeto}</p>
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-300 max-w-xs truncate">{m.Descricao}</td>
                      <td className="px-5 py-4 text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white/5 px-2 py-1 rounded-md border border-white/5">
                          {m.Tipo}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right text-sm font-bold text-par-300">
                        {parseFloat(m.Percentual || 0).toFixed(1)}%
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-slate-200 text-right">{formatBRL(m.Valor_Medicao)}</td>
                      <td className="px-5 py-4 text-xs font-medium text-slate-400">{formatDate(m.Data_Prevista) || '—'}</td>
                      <td className="px-5 py-4 text-center">
                        <span className={`badge ${m.Status === 'Concluída' ? 'badge-green' : m.Status === 'Cancelada' ? 'badge-gray' : 'badge-blue'}`}>
                          {m.Status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className={`badge ${STATUS_FIN_COLOR[m.Status_Financeiro] || 'badge-gray'}`}>
                            {m.Status_Financeiro || 'Pendente'}
                          </span>
                          {m.atrasada && (
                            <div className="w-2 h-2 rounded-full bg-red-500 pulse-dot" title="Atrasado" />
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {m.OC || m.Nr_OS_OPP ? (
                          <div className="text-xs">
                            {m.OC && <div className="font-bold text-par-300">O.C.: {m.OC}</div>}
                            {m.Nr_OS_OPP && <div className="text-slate-400">OS: {m.Nr_OS_OPP}</div>}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => { setEditItem(m); setShowModal(true) }}
                          className="text-xs text-par-400 hover:text-par-300 font-bold transition-colors opacity-0 group-hover:opacity-100"
                        >
                          EDITAR
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <MedicaoModal
          item={editItem}
          projetos={projetos}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}

function MedicaoModal({ item, projetos, onClose, onSaved }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm({ defaultValues: item || {} })

  async function onSubmit(data) {
    setLoading(true)
    try {
      if (item?.ID_Medicao) {
        await api.put(`/medicoes/${item.ID_Medicao}`, data)
        toast.success('Medição atualizada!')
      } else {
        await api.post('/medicoes', data)
        toast.success('Medição criada!')
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
    <Modal open title={item ? 'Editar Medição' : 'Nova Medição'} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-1">
        <div className="grid grid-cols-2 gap-5">
          <div className="col-span-2">
            <label className="form-label">Projeto <span className="text-red-500">*</span></label>
            <select className="form-select" {...register('ID_Projeto', { required: 'Obrigatório' })}>
              <option value="">Selecione...</option>
              {projetos.map((p) => <option key={p.ID_Projeto} value={p.ID_Projeto}>{p.Nome}</option>)}
            </select>
          </div>
          <Input label="Descrição" required error={errors.Descricao?.message} className="col-span-2" {...register('Descricao', { required: 'Obrigatório' })} />
          <Input label="% do Contrato" type="number" step="0.01" min="0" max="100" required error={errors.Percentual?.message} {...register('Percentual', { required: true })} />
          <Input label="Valor (R$)" type="text" placeholder="0,00" {...register('Valor_Medicao')} />
          <Input label="Data Prevista" type="date" {...register('Data_Prevista')} />
          <Input label="Previsão de NF" type="date" {...register('Previsao_NF')} />
          <Input label="Data de Emissão da NF" type="date" {...register('Data_Emissao_NF')} />
          <Input label="Número NF" {...register('Nr_NF')} />
          <Input label="Data de Recebimento" type="date" {...register('Data_Recebimento')} />
          <Input
            label="O.C. (Ordem de Compra)"
            placeholder="Código da O.C. no OPP"
            title="Chave primária que vincula esta medição à O.S. criada no ERP OPP"
            {...register('OC')}
          />
          <Input
            label="Nº O.S. no OPP"
            placeholder="Número da O.S. no OPP/OPP"
            {...register('Nr_OS_OPP')}
          />
          <div>
            <label className="form-label">Status</label>
            <select className="form-select" {...register('Status')}>
              {STATUS_MEDICAO.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="form-label">Observações</label>
            <textarea className="form-input h-20 resize-none" {...register('Observacoes')} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-6">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
            {loading ? 'Salvando...' : 'Salvar Medição'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
