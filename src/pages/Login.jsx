import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import logo from '../assets/images/divid-logo.png'
import {
  getLoginLockState,
  registerFailedLogin,
  resetLoginAttempts,
  getMaxAttempts,
  formatRemainingTime
} from '../lib/loginRateLimit'
import './Login.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [lockRemainingMs, setLockRemainingMs] = useState(0)
  const { login } = useAuth()
  const navigate = useNavigate()

  // reflete um bloqueio já existente (ex.: após recarregar a página) assim que o email é digitado
  useEffect(() => {
    const state = getLoginLockState(email)
    setLockRemainingMs(state.locked ? state.remainingMs : 0)
  }, [email])

  // atualiza a contagem regressiva de bloqueio a cada segundo
  useEffect(() => {
    if (lockRemainingMs <= 0) return undefined
    const interval = setInterval(() => {
      const state = getLoginLockState(email)
      setLockRemainingMs(state.locked ? state.remainingMs : 0)
    }, 1000)
    return () => clearInterval(interval)
  }, [lockRemainingMs, email])

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(null)

    const lockState = getLoginLockState(email)
    if (lockState.locked) {
      setLockRemainingMs(lockState.remainingMs)
      setError(`Muitas tentativas de login. Tente novamente em ${formatRemainingTime(lockState.remainingMs)}.`)
      return
    }

    try {
      await login(email, password)
      resetLoginAttempts(email)
      navigate('/dashboard')
    } catch (err) {
      const result = registerFailedLogin(email)
      if (result.locked) {
        setLockRemainingMs(result.remainingMs)
        setError(`Muitas tentativas de login. Tente novamente em ${formatRemainingTime(result.remainingMs)}.`)
      } else {
        const remainingAttempts = getMaxAttempts() - result.attempts
        setError(`${err.message} (tentativas restantes: ${remainingAttempts})`)
      }
    }
  }

  const isLocked = lockRemainingMs > 0

  return (
    <div className="auth-container">
      <div className="auth-shell">
        <aside className="auth-hero" aria-label="Informações do produto">
          <div className="auth-brand">
            <img src={logo} alt="Divid Logo" />
          </div>
          <div className="auth-hero-badge">Sistema financeiro</div>
          <h1>Controle total do seu imóvel e do seu fluxo financeiro.</h1>
          <p>
            Acompanhe inadimplência, seguros, garantias e movimentações em um único lugar,
            com organização e segurança para a sua operação.
          </p>
          <ul className="auth-benefits">
            <li>Dashboard em tempo real</li>
            <li>Controle de inadimplência</li>
            <li>Histórico e relatórios</li>
          </ul>
        </aside>

        <form className="auth-card" onSubmit={handleLogin}>
          <div className="auth-card-header">
            <span className="auth-mini-label">Acesso</span>
            <h2>Entrar</h2>
          </div>

          <p className="auth-sub">Entre com sua conta para continuar</p>
          {error && <div className="error-msg" role="alert" aria-live="polite">{error}</div>}

          <div className="form-group">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="seu@email.com"
              autoComplete="email"
              disabled={isLocked}
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Senha</label>
            <div className="password-wrap">
              <input
                id="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={isLocked}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={isLocked}>
            {isLocked ? `Bloqueado (${formatRemainingTime(lockRemainingMs)})` : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

