import { useState, useEffect } from "react"
import { toast } from "react-hot-toast"
import { Settings, RefreshCw, Database, Bell, Link, CheckCircle, AlertTriangle } from "lucide-react"
import api from "../utils/api"

function Section({ title, icon: Icon, children }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 20 }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon size={18} color="#a78bfa" />
        <span style={{ fontWeight: 800, fontSize: 15, color: "#e2e8f0" }}>{title}</span>
      </div>
      <div style={{ padding: "20px 24px" }}>{children}</div>
    </div>
  )
}

function InfoRow({ label, value, status }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {status === "ok" && <CheckCircle size={14} color="#4ade80" />}
        {status === "error" && <AlertTriangle size={14} color="#f87171" />}
        <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 700 }}>{value}</span>
      </div>
    </div>
  )
}

export default function Configuracoes() {
  const [health, setHealth] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncingVH, setSyncingVH] = useState(false)

  useEffect(() => {
    api.get("/health").then(r => setHealth(r.data)).catch(() => setHealth(null))
  }, [])

  async function syncClickUp() {
    setSyncing(true)
    try {
      const r = await api.post("/clickup/sync")
      toast.success(`ClickUp sincronizado: ${r.data.tarefas || 0} tarefas`)
    } catch { toast.error("Erro ao sincronizar ClickUp") }
    finally { setSyncing(false) }
  }

  async function syncOPP() {
    setSyncingVH(true)
    try {
      const r = await api.post("/opp/sync")
      toast.success(`OPP sincronizado: ${r.data.totalReceitas || 0} receitas, ${r.data.totalDespesas || 0} despesas`)
    } catch { toast.error("Erro ao sincronizar OPP") }
    finally { setSyncingVH(false) }
  }

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-center gap-3 mb-2">
        <Settings size={22} color="#a78bfa" />
        <div>
          <h1 className="page-title">Configuracoes</h1>
          <p className="text-sm text-slate-500">Integracoes, sincronizacoes e status do sistema</p>
        </div>
      </div>

      <Section title="Status do Sistema" icon={Database}>
        <InfoRow label="Servidor" value={health ? "Online" : "Verificando..."} status={health ? "ok" : null} />
        <InfoRow label="Versao" value={health?.version || "—"} />
        <InfoRow label="Ultima verificacao" value={health?.timestamp ? new Date(health.timestamp).toLocaleString("pt-BR") : "—"} />
      </Section>

      <Section title="Sincronizacao ClickUp" icon={RefreshCw}>
        <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>
          O sistema sincroniza automaticamente com o ClickUp a cada 15 minutos via cron job.
          Use o botao abaixo para forcar uma sincronizacao imediata.
        </p>
        <InfoRow label="Sincronizacao automatica" value="A cada 15 minutos" status="ok" />
        <InfoRow label="Time ID" value="36936702" />
        <div style={{ marginTop: 16 }}>
          <button onClick={syncClickUp} disabled={syncing} className="btn-primary flex items-center gap-2">
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Sincronizando..." : "Sincronizar ClickUp agora"}
          </button>
        </div>
      </Section>

      <Section title="Sincronizacao OPP / OPP" icon={Link}>
        <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>
          Receitas e despesas sao sincronizadas automaticamente a cada 2 horas.
          O sistema reconcilia medicoes com os lancamentos financeiros do OPP.
        </p>
        <InfoRow label="Sincronizacao automatica" value="A cada 2 horas" status="ok" />
        <InfoRow label="Endpoints" value="/contas-receber e /contas-pagar" />
        <div style={{ marginTop: 16 }}>
          <button onClick={syncOPP} disabled={syncingVH} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} className={syncingVH ? "animate-spin" : ""} />
            {syncingVH ? "Sincronizando..." : "Sincronizar OPP agora"}
          </button>
        </div>
      </Section>

      <Section title="Alertas e Notificacoes" icon={Bell}>
        <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>
          Verificacao diaria de alertas ocorre automaticamente de segunda a sexta as 08h.
        </p>
        <InfoRow label="Verificacao diaria" value="08h (seg-sex)" status="ok" />
        <InfoRow label="Tipos de alerta" value="Prazo, Margem PAR, Custo" />
      </Section>

      <Section title="Regras PAR" icon={CheckCircle}>
        <InfoRow label="Margem minima de lucro" value=">= 23%" status="ok" />
        <InfoRow label="Custo maximo terceirizados" value="<= 25% do contrato" status="ok" />
        <InfoRow label="Custo maximo producao" value="<= 30% do contrato" status="ok" />
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 12 }}>
          Estas regras sao aplicadas automaticamente nos relatorios finais e no semaforo de projetos.
        </p>
      </Section>
    </div>
  )
}
