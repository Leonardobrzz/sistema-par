import { useState, useEffect } from "react"
import { toast } from "react-hot-toast"
import { Settings, RefreshCw, Database, Bell, Link, CheckCircle, AlertTriangle, Users } from "lucide-react"
import api from "../utils/api"

const PERFIS = ['Admin', 'PO', 'Coordenador', 'Comercial', 'Financeiro', 'Diretoria', 'Visualizador']

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
  const [usuarios, setUsuarios] = useState([])
  const [novoUser, setNovoUser] = useState({ nome: "", email: "", senha: "", perfil: "Visualizador" })
  const [salvandoUser, setSalvandoUser] = useState(false)
  const [mostrarFormUser, setMostrarFormUser] = useState(false)
  const userAtual = JSON.parse(localStorage.getItem("par_user") || "{}")

  useEffect(() => {
    api.get("/health").then(r => setHealth(r.data)).catch(() => setHealth(null))
    if (userAtual.perfil === "Admin") {
      api.get("/auth/usuarios").then(r => setUsuarios(r.data)).catch(() => {})
    }
  }, [])

  async function criarUsuario(e) {
    e.preventDefault()
    setSalvandoUser(true)
    try {
      await api.post("/auth/usuarios", novoUser)
      toast.success(`Usuário ${novoUser.nome} criado com sucesso!`)
      setNovoUser({ nome: "", email: "", senha: "", perfil: "Visualizador" })
      setMostrarFormUser(false)
      const r = await api.get("/auth/usuarios")
      setUsuarios(r.data)
    } catch (err) {
      toast.error(err.response?.data?.error || "Erro ao criar usuário")
    } finally { setSalvandoUser(false) }
  }

  async function toggleAtivo(user) {
    try {
      await api.put(`/auth/usuarios/${user.id}`, { ativo: user.ativo !== "true" })
      toast.success(`Usuário ${user.ativo === "true" ? "desativado" : "ativado"}`)
      const r = await api.get("/auth/usuarios")
      setUsuarios(r.data)
    } catch { toast.error("Erro ao atualizar usuário") }
  }

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

      {userAtual.perfil === "Admin" && (
        <Section title="Gestão de Usuários" icon={Users}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: "#94a3b8" }}>{usuarios.length} usuário(s) cadastrado(s)</span>
            <button onClick={() => setMostrarFormUser(!mostrarFormUser)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#7C3AED", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {mostrarFormUser ? "Cancelar" : "+ Novo Usuário"}
            </button>
          </div>

          {mostrarFormUser && (
            <form onSubmit={criarUsuario} style={{ background: "rgba(124,58,237,0.08)", borderRadius: 10, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input required placeholder="Nome completo" value={novoUser.nome} onChange={e => setNovoUser(p => ({...p, nome: e.target.value}))} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#e2e8f0", fontSize: 13 }} />
              <input required type="email" placeholder="E-mail" value={novoUser.email} onChange={e => setNovoUser(p => ({...p, email: e.target.value}))} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#e2e8f0", fontSize: 13 }} />
              <input required type="password" placeholder="Senha" value={novoUser.senha} onChange={e => setNovoUser(p => ({...p, senha: e.target.value}))} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#e2e8f0", fontSize: 13 }} />
              <select value={novoUser.perfil} onChange={e => setNovoUser(p => ({...p, perfil: e.target.value}))} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "#1e293b", color: "#e2e8f0", fontSize: 13 }}>
                {PERFIS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button type="submit" disabled={salvandoUser} style={{ gridColumn: "1/-1", padding: "10px", borderRadius: 8, border: "none", background: "#7C3AED", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {salvandoUser ? "Criando..." : "Criar Usuário"}
              </button>
            </form>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {usuarios.map(u => (
              <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{u.nome}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{u.email} · {u.perfil}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: u.ativo === "true" ? "#DCFCE7" : "#FEE2E2", color: u.ativo === "true" ? "#15803D" : "#DC2626" }}>
                    {u.ativo === "true" ? "Ativo" : "Inativo"}
                  </span>
                  <button onClick={() => toggleAtivo(u)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", cursor: "pointer" }}>
                    {u.ativo === "true" ? "Desativar" : "Ativar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

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
