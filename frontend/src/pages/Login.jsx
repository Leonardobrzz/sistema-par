import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

const FEATURES = [
  'Planejamento financeiro integrado',
  'Gestão de projetos em tempo real',
  'Controle de medições e faturamento',
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [lembrar, setLembrar] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm()

  async function onSubmit({ email, senha }) {
    setLoading(true)
    try {
      await login(email, senha, lembrar)
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Credenciais inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>

      {/* ── Left panel ── */}
      <div style={{
        width: '42%',
        minWidth: 320,
        background: 'linear-gradient(160deg, #122D57 0%, #0E2748 60%, #091A33 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: '48px 44px',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Decorative circles */}
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 280, height: 280, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.07)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: 40, right: -120,
          width: 280, height: 280, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.05)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -100, left: -60,
          width: 320, height: 320, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.05)',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 42, fontWeight: 800, color: '#ffffff', letterSpacing: '0.12em', margin: 0, lineHeight: 1 }}>PAR</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '6px 0 0', fontWeight: 500 }}>
            Jota Barros Projetos e Assessoria
          </p>
        </div>

        {/* Company logo */}
        <div style={{
          width: 160, height: 160,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 40,
          overflow: 'hidden',
        }}>
          <img
            src="/image.png"
            alt="Jota Barros"
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }}
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', marginBottom: 32 }} />

        {/* Features */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {FEATURES.map(f => (
            <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>{f}</span>
            </li>
          ))}
        </ul>

        {/* Bottom version */}
        <div style={{ marginTop: 'auto', paddingTop: 48 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0, fontWeight: 600, letterSpacing: '0.04em' }}>
            PAR © {new Date().getFullYear()} · v2026.05
          </p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{
        flex: 1,
        background: '#EEF3F8',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 32px',
      }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* Title */}
          <div style={{ marginBottom: 36 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Bem-vindo de volta
            </h1>
            <p style={{ fontSize: 14, color: '#94A3B8', margin: 0, fontWeight: 500 }}>
              Acesse o sistema PAR com suas credenciais
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Usuário / Email */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Usuário / E-mail
              </label>
              <input
                type="text"
                autoComplete="username"
                placeholder="usuario ou email@empresa.com"
                style={{
                  width: '100%',
                  background: '#ffffff',
                  border: errors.email ? '1.5px solid #DC2626' : '1.5px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '12px 16px',
                  fontSize: 14,
                  color: '#0F172A',
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                  boxShadow: errors.email ? '0 0 0 3px rgba(220,38,38,0.08)' : 'none',
                }}
                onFocus={e => { if (!errors.email) { e.target.style.borderColor = '#1E3A5F'; e.target.style.boxShadow = '0 0 0 3px rgba(30,58,95,0.1)' } }}
                onBlur={e => { if (!errors.email) { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none' } }}
                {...register('email', { required: 'Campo obrigatório' })}
              />
              {errors.email && (
                <p style={{ color: '#DC2626', fontSize: 11, marginTop: 4, fontWeight: 600 }}>{errors.email.message}</p>
              )}
            </div>

            {/* Senha */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Senha
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: errors.senha ? '1.5px solid #DC2626' : '1.5px solid #E2E8F0',
                    borderRadius: 10,
                    padding: '12px 48px 12px 16px',
                    fontSize: 14,
                    color: '#0F172A',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                    boxShadow: errors.senha ? '0 0 0 3px rgba(220,38,38,0.08)' : 'none',
                  }}
                  onFocus={e => { if (!errors.senha) { e.target.style.borderColor = '#1E3A5F'; e.target.style.boxShadow = '0 0 0 3px rgba(30,58,95,0.1)' } }}
                  onBlur={e => { if (!errors.senha) { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none' } }}
                  {...register('senha', { required: 'Campo obrigatório' })}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(p => !p)}
                  style={{
                    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 0,
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  {showPassword
                    ? <EyeSlashIcon style={{ width: 18, height: 18 }} />
                    : <EyeIcon style={{ width: 18, height: 18 }} />
                  }
                </button>
              </div>
              {errors.senha && (
                <p style={{ color: '#DC2626', fontSize: 11, marginTop: 4, fontWeight: 600 }}>{errors.senha.message}</p>
              )}
            </div>

            {/* Lembrar de mim */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={lembrar}
                onChange={e => setLembrar(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#1E3A5F', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>Lembrar de mim</span>
            </label>

            {/* Botão login */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? '#009CB0' : '#00B5CC',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                padding: '13px',
                borderRadius: 10,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.2s',
                marginTop: 4,
                opacity: loading ? 0.8 : 1,
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#009CB0' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#00B5CC' }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                  Autenticando...
                </span>
              ) : 'Entrar'}
            </button>
          </form>

          {/* Footer links */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
            <button
              style={{ fontSize: 13, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
              onMouseEnter={e => e.currentTarget.style.color = '#1E3A5F'}
              onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
            >
              Esqueci a senha
            </button>
            <button
              style={{ fontSize: 13, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
              onMouseEnter={e => e.currentTarget.style.color = '#1E3A5F'}
              onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
            >
              Registrar conta
            </button>
          </div>

          {/* Bottom caption */}
          <p style={{ textAlign: 'center', fontSize: 12, color: '#CBD5E1', marginTop: 40, fontWeight: 500 }}>
            PAR © {new Date().getFullYear()} · Sistema de Gestão de Projetos
          </p>
        </div>
      </div>
    </div>
  )
}
