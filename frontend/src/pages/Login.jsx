import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import { EyeIcon, EyeSlashIcon, ArrowRightIcon } from '@heroicons/react/24/outline'

const FEATURES = [
  'Planejamento financeiro integrado',
  'Gestão de projetos em tempo real',
  'Controle de medições e faturamento',
]

// Paleta exclusiva desta tela — verde-petróleo + dourado, pra dar o tom
// editorial/elegante pedido, sem mexer nas cores padrão (--cyan etc.) usadas
// no resto do sistema.
const GOLD = '#C9A062'
const TEAL = '#1F4D45'
const TEAL_DARK = '#17382F'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [lembrar, setLembrar] = useState(false)
  const { register, handleSubmit, setValue, formState: { errors } } = useForm()

  useEffect(() => {
    const emailSalvo = localStorage.getItem('par_lembrar_email')
    if (emailSalvo) {
      setValue('email', emailSalvo)
      setLembrar(true)
    }
  }, [])

  async function onSubmit({ email, senha }) {
    setLoading(true)
    try {
      await login(email, senha, lembrar)
      if (lembrar) {
        localStorage.setItem('par_lembrar_email', email)
      } else {
        localStorage.removeItem('par_lembrar_email')
      }
      navigate('/dashboard')
    } catch (err) {
      if (!err.response) {
        toast.error('Erro de conexão com o servidor. Tente novamente.')
      } else if (err.response.status === 401 || err.response.status === 403) {
        toast.error(err.response.data?.error || 'Credenciais inválidas')
      } else {
        toast.error('Erro interno do servidor. Tente novamente em instantes.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>

      {/* ── Left panel ── */}
      <div style={{
        width: '44%',
        minWidth: 360,
        background: 'linear-gradient(165deg, #10263F 0%, #0C1E33 55%, #081527 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: '52px 52px 36px',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Textura de grade sutil, estilo papel de desenho/projeto */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)
          `,
          backgroundSize: '34px 34px',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: -140, right: -140,
          width: 380, height: 380, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.06)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1 }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 44 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 9,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2 L22 21 H2 Z" stroke={GOLD} strokeWidth="2" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            <div>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#ffffff', letterSpacing: '0.1em', margin: 0, lineHeight: 1 }}>PAR</p>
              <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', margin: '5px 0 0', fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
                Jota Barros · Projetos e Assessoria
              </p>
            </div>
          </div>

          {/* Divider + eyebrow */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
            <div style={{ width: 22, height: 1, background: GOLD, opacity: 0.6 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Sistema de Gestão de Projetos
            </span>
          </div>

          {/* Headline editorial */}
          <h2 style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontSize: 34,
            fontWeight: 500,
            lineHeight: 1.28,
            color: 'rgba(255,255,255,0.94)',
            margin: '0 0 44px',
            maxWidth: 400,
            letterSpacing: '-0.01em',
          }}>
            Cada projeto, do planejamento à{' '}
            <em style={{ color: GOLD, fontStyle: 'italic', fontWeight: 600 }}>medição final</em>.
          </h2>

          {/* Features numeradas */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
            {FEATURES.map((f, i) => (
              <li key={f} style={{
                display: 'flex', alignItems: 'baseline', gap: 14,
                padding: '13px 0',
                borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
              }}>
                <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 13, fontWeight: 600, color: GOLD, flexShrink: 0 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.72)', fontWeight: 500 }}>{f}</span>
              </li>
            ))}
          </ul>

          {/* Rodapé */}
          <div style={{ marginTop: 'auto', paddingTop: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', margin: 0, fontWeight: 600, letterSpacing: '0.04em' }}>
              PAR © {new Date().getFullYear()}
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', margin: 0, fontWeight: 600, letterSpacing: '0.04em' }}>
              v2026.05
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{
        flex: 1,
        background: '#F6F2E9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 32px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Eyebrow + título */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: TEAL, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 10px' }}>
              Acesso restrito
            </p>
            <h1 style={{ fontSize: 27, fontWeight: 800, color: '#1A1A14', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Bem-vindo de volta
            </h1>
            <p style={{ fontSize: 14, color: '#8C8372', margin: 0, fontWeight: 500 }}>
              Entre com suas credenciais para acessar o sistema PAR.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Usuário / Email */}
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#564F40', marginBottom: 7 }}>
                Usuário ou e-mail
              </label>
              <input
                type="text"
                autoComplete="username"
                placeholder="nome@empresa.com.br"
                style={{
                  width: '100%',
                  background: '#FFFFFF',
                  border: errors.email ? '1.5px solid #DC2626' : '1.5px solid #E3DCC9',
                  borderRadius: 9,
                  padding: '12px 16px',
                  fontSize: 14,
                  color: '#2B2820',
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                  boxShadow: errors.email ? '0 0 0 3px rgba(220,38,38,0.08)' : 'none',
                }}
                onFocus={e => { if (!errors.email) { e.target.style.borderColor = TEAL; e.target.style.boxShadow = `0 0 0 3px rgba(31,77,69,0.12)` } }}
                onBlur={e => { if (!errors.email) { e.target.style.borderColor = '#E3DCC9'; e.target.style.boxShadow = 'none' } }}
                {...register('email', { required: 'Campo obrigatório' })}
              />
              {errors.email && (
                <p style={{ color: '#DC2626', fontSize: 11, marginTop: 4, fontWeight: 600 }}>{errors.email.message}</p>
              )}
            </div>

            {/* Senha */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#564F40' }}>
                  Senha
                </label>
                <button
                  type="button"
                  style={{ fontSize: 12, color: TEAL, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, padding: 0 }}
                >
                  Esqueci a senha
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    background: '#FFFFFF',
                    border: errors.senha ? '1.5px solid #DC2626' : '1.5px solid #E3DCC9',
                    borderRadius: 9,
                    padding: '12px 48px 12px 16px',
                    fontSize: 14,
                    color: '#2B2820',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                    boxShadow: errors.senha ? '0 0 0 3px rgba(220,38,38,0.08)' : 'none',
                  }}
                  onFocus={e => { if (!errors.senha) { e.target.style.borderColor = TEAL; e.target.style.boxShadow = `0 0 0 3px rgba(31,77,69,0.12)` } }}
                  onBlur={e => { if (!errors.senha) { e.target.style.borderColor = '#E3DCC9'; e.target.style.boxShadow = 'none' } }}
                  {...register('senha', { required: 'Campo obrigatório' })}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(p => !p)}
                  style={{
                    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#A69C87', padding: 0,
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={lembrar}
                onChange={e => setLembrar(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: TEAL, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: '#71685A', fontWeight: 500 }}>Manter conectado neste dispositivo</span>
            </label>

            {/* Botão login */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? TEAL_DARK : TEAL,
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                padding: '13px',
                borderRadius: 9,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.2s',
                marginTop: 6,
                opacity: loading ? 0.85 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = TEAL_DARK }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = TEAL }}
            >
              {loading ? (
                <>
                  <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                  Autenticando...
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRightIcon style={{ width: 16, height: 16 }} />
                </>
              )}
            </button>
          </form>

          {/* Divisor "Ainda não tem acesso?" */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#E3DCC9' }} />
            <span style={{ fontSize: 12, color: '#A69C87', fontWeight: 600, whiteSpace: 'nowrap' }}>Ainda não tem acesso?</span>
            <div style={{ flex: 1, height: 1, background: '#E3DCC9' }} />
          </div>

          {/* Registrar conta */}
          <button
            style={{
              width: '100%',
              background: 'transparent',
              border: `1.5px solid ${TEAL}`,
              color: TEAL,
              fontWeight: 700,
              fontSize: 14,
              padding: '12px',
              borderRadius: 9,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(31,77,69,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            Registrar conta
          </button>

          {/* Bottom caption */}
          <p style={{ textAlign: 'center', fontSize: 12, color: '#B9B09D', marginTop: 36, fontWeight: 500 }}>
            PAR © {new Date().getFullYear()} · Sistema de Gestão de Projetos
          </p>
        </div>
      </div>
    </div>
  )
}
