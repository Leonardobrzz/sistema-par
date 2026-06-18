import { useState, useEffect } from "react"
import { toast } from "react-hot-toast"
import { Settings, RefreshCw, Database, Bell, Link, CheckCircle, AlertTriangle, Users } from "lucide-react"
import api from "../utils/api"

const PERFIS = ['Admin', 'PO', 'Coordenador', 'Comercial', 'Financeiro', 'Diretoria', 'Visualizador']

function Section({ title, icon: Icon, children }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 10, background: "#F8FAFC" }}>
        <Icon size={18} color="#7C3AED" />
        <span style={{ fontWeight: 800, fontSize: 15, color: "#0F172A" }}>{title}</span>
      </div>
      <div style={{ padding: "20px 24px" }}>{children}</div>
    </div>
  )
}

function InfoRow({ label, value, status }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F1F5F9" }}>
      <span style={{ fontSize: 13, color: "#64748B", fontWeight: 600 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {status === "ok" && <CheckCircle size={14} color="#22C55E" />}
        {status === "error" && <AlertTriangle size={14} color="#EF4444" />}
        <span style={{ fontSize: 13, color: "#0F172A", fontWeight: 700 }}>{value}</span>
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

  const inputStyle = { padding: "9px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#0F172A", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" }
  const btnPrimary = { padding: "10px 20px", borderRadius: 8, border: "none", background: "#7C3AED", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }
  const btnSecondary = { padding: "10px 20px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <Settings size={22} color="#7C3AED" />
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Configurações</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>Integrações, sincronizações e status do sistema</p>
        </div>
      </div>

      <Section title="Status do Sistema" icon={Database}>
        <InfoRow label="Servidor" value={health ? "Online" : "Verificando..."} status={health ? "ok" : null} />
        <InfoRow label="Versão" value={health?.version || "—"} />
        <InfoRow label="Última verificação" value={health?.timestamp ? new Date(health.timestamp).toLocaleString("pt-BR") : "—"} />
      </Section>

      {userAtual.perfil === "Admin" && (
        <Section title="Gestão de Usuários" icon={Users}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: "#64748B" }}>{usuarios.length} usuário(s) cadastrado(s)</span>
            <button onClick={() => setMostrarFormUser(!mostrarFormUser)} style={btnPrimary}>
              {mostrarFormUser ? "Cancelar" : "+ Novo Usuário"}
            </button>
          </div>

          {mostrarFormUser && (
            <form onSubmit={criarUsuario} style={{ background: "#F8FAFC", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #E2E8F0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <input required placeholder="Nome completo" value={novoUser.nome} onChange={e => setNovoUser(p => ({...p, nome: e.target.value}))} style={inputStyle} />
                <input required type="email" placeholder="E-mail" value={novoUser.email} onChange={e => setNovoUser(p => ({...p, email: e.target.value}))} style={inputStyle} />
                <input required type="password" placeholder="Senha" value={novoUser.senha} onChange={e => setNovoUser(p => ({...p, senha: e.target.value}))} style={inputStyle} />
                <select value={novoUser.perfil} onChange={e => setNovoUser(p => ({...p, perfil: e.target.value}))} style={inputStyle}>
                  {PERFIS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <button type="submit" disabled={salvandoUser} style={{ ...btnPrimary, width: "100%", justifyContent: "center" }}>
                {salvandoUser ? "Criando..." : "Criar Usuário"}
              </button>
            </form>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {usuarios.map(u => (
              <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#F8FAFC", borderRadius: 10, border: "1px solid #E2E8F0" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{u.nome}</div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{u.email} · <span style={{ color: "#7C3AED", fontWeight: 600 }}>{u.perfil}</span></div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: u.ativo === "true" ? "#DCFCE7" : "#FEE2E2", color: u.ativo === "true" ? "#15803D" : "#DC2626" }}>
                    {u.ativo === "true" ? "Ativo" : "Inativo"}
                  </span>
                  <button onClick={() => toggleAtivo(u)} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 6, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", cursor: "pointer", fontWeight: 600 }}>
                    {u.ativo === "true" ? "Desativar" : "Ativar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Sincronização ClickUp" icon={RefreshCw}>
        <p style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
          O sistema sincroniza automaticamente com o ClickUp a cada 15 minutos via cron job.
        </p>
        <InfoRow label="Sincronização automática" value="A cada 15 minutos" status="ok" />
        <InfoRow label="Time ID" value="36936702" />
        <div style={{ marginTop: 16 }}>
          <button onClick={syncClickUp} disabled={syncing} style={btnPrimary}>
            <RefreshCw size={16} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
            {syncing ? "Sincronizando..." : "Sincronizar ClickUp agora"}
          </button>
        </div>
      </Section>

      <Section title="Sincronização OPP" icon={Link}>
        <p style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
          Receitas e despesas são sincronizadas automaticamente a cada 2 horas.
        </p>
        <InfoRow label="Sincronização automática" value="A cada 2 horas" status="ok" />
        <InfoRow label="Endpoints" value="/contas-receber e /contas-pagar" />
        <div style={{ marginTop: 16 }}>
          <button onClick={syncOPP} disabled={syncingVH} style={btnSecondary}>
            <RefreshCw size={16} style={{ animation: syncingVH ? "spin 1s linear infinite" : "none" }} />
            {syncingVH ? "Sincronizando..." : "Sincronizar OPP agora"}
          </button>
        </div>
      </Section>

      <Section title="Alertas e Notificações" icon={Bell}>
        <p style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
          Verificação diária de alertas ocorre automaticamente de segunda a sexta às 08h.
        </p>
        <InfoRow label="Verificação diária" value="08h (seg-sex)" status="ok" />
        <InfoRow label="Tipos de alerta" value="Prazo, Margem PAR, Custo" />
      </Section>

      <Section title="Regras PAR" icon={CheckCircle}>
        <InfoRow label="Margem mínima de lucro" value=">= 23%" status="ok" />
        <InfoRow label="Custo máximo terceirizados" value="<= 25% do contrato" status="ok" />
        <InfoRow label="Custo máximo produção" value="<= 30% do contrato" status="ok" />
        <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 12 }}>
          Estas regras são aplicadas automaticamente nos relatórios finais e no semáforo de projetos.
        </p>
      </Section>
    </div>
  )
}
