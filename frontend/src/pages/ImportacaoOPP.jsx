import { useState, useEffect } from 'react'
import { 
  CloudArrowUpIcon, 
  ArrowPathIcon, 
  CheckCircleIcon, 
  ExclamationCircleIcon,
  ShieldCheckIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline'
import api from '../utils/api'
import { toast } from 'react-hot-toast'

export default function PainelIntegracaoOPP() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncLoading, setSyncLoading] = useState(false)
  const [stats, setStats] = useState({ receitas: 0, despesas: 0, ultimaSync: null })

  const checkStatus = async () => {
    setLoading(true)
    try {
      const res = await api.get('/opp/status')
      setStatus(res.data)
    } catch (err) {
      setStatus({ ok: false, message: 'Não foi possível conectar com a API do OPP.' })
    }
    setLoading(false)
  }

  const handleSync = async () => {
    setSyncLoading(true)
    try {
      const res = await api.post('/opp/sync')
      setStats({
        receitas: res.data.totalReceitas,
        despesas: res.data.totalDespesas,
        ultimaSync: new Date().toLocaleString('pt-BR')
      })
      toast.success(`Sincronização concluída! ${res.data.medicoesReconciliadas} medições foram atualizadas automaticamente.`)
    } catch (err) {
      toast.error('Erro ao sincronizar dados do OPP.')
    }
    setSyncLoading(false)
  }

  useEffect(() => {
    checkStatus()
  }, [])

  return (
    <div className="max-w-4xl mx-auto space-y-6 fade-in">
      {/* Header */}
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <BuildingOfficeIcon className="w-32 h-32" />
        </div>
        <div className="relative z-10">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Integração OPP (ERP)</h1>
          <p className="text-slate-500 mt-2 text-sm max-w-lg">
            Gerencie a conexão em tempo real entre o Sistema PAR e o seu ERP. O sistema sincroniza automaticamente receitas e despesas para reconciliação financeira.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status da Conexão */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Status da API</h3>
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${status?.ok ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              {status?.ok ? (
                <ShieldCheckIcon className="w-7 h-7 text-emerald-600" />
              ) : (
                <ExclamationCircleIcon className="w-7 h-7 text-red-600" />
              )}
            </div>
            <div>
              <p className={`font-bold text-lg ${status?.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                {status?.ok ? 'Conectado' : 'Desconectado'}
              </p>
              <p className="text-xs text-slate-500">{status?.message || 'Verificando conexão...'}</p>
            </div>
          </div>
          <button 
            onClick={checkStatus}
            disabled={loading}
            className="mt-6 w-full py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Testar Conexão
          </button>
        </div>

        {/* Sincronização */}
        <div className="bg-slate-900 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute bottom-0 right-0 p-4 opacity-10">
            <CloudArrowUpIcon className="w-20 h-20 text-white" />
          </div>
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Sincronização Manual</h3>
          <p className="text-slate-300 text-sm mb-6 leading-relaxed">
            Clique abaixo para forçar a atualização dos últimos 12 meses e reconciliar as faturas.
          </p>
          <button 
            onClick={handleSync}
            disabled={syncLoading || !status?.ok}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-3 ${
              syncLoading || !status?.ok ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-par-600 text-white hover:bg-par-500 shadow-lg shadow-par-600/20'
            }`}
          >
            {syncLoading ? (
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
            ) : (
              <CloudArrowUpIcon className="w-5 h-5" />
            )}
            {syncLoading ? 'Sincronizando...' : 'Sincronizar OPP agora'}
          </button>
        </div>
      </div>

      {/* Histórico da última Sync */}
      {stats.ultimaSync && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-3 border-bottom border-slate-200">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resultado da Última Operação</p>
          </div>
          <div className="p-6 grid grid-cols-3 gap-8">
            <div>
              <p className="text-xs text-slate-500 font-medium">Data/Hora</p>
              <p className="font-bold text-slate-800">{stats.ultimaSync}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Receitas Importadas</p>
              <p className="font-bold text-emerald-600">{stats.receitas}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Despesas Importadas</p>
              <p className="font-bold text-red-600">{stats.despesas}</p>
            </div>
          </div>
        </div>
      )}

      {/* Cards de Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-100 flex items-start gap-3">
          <CheckCircleIcon className="w-5 h-5 text-par-600 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-slate-900">Sync Automático</p>
            <p className="text-[10px] text-slate-500 mt-1">Status de faturamento atualizado via Nr_NF.</p>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-100 flex items-start gap-3">
          <CheckCircleIcon className="w-5 h-5 text-par-600 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-slate-900">Segurança de Dados</p>
            <p className="text-[10px] text-slate-500 mt-1">Conexão via Token seguro HTTPS/TLS.</p>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-100 flex items-start gap-3">
          <CheckCircleIcon className="w-5 h-5 text-par-600 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-slate-900">O.S. Automática</p>
            <p className="text-[10px] text-slate-500 mt-1">Criação de O.S. no OPP ao aprovar PAR.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
