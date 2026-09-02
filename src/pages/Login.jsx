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
      <form className="auth-card" onSubmit={handleLogin}>
        <div className="auth-logo">
          <img src={logo} alt="Divid Logo" />
        </div>
        <h2>Financeiro</h2>
        <p className="auth-sub">Entre com sua conta para continuar</p>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="seu@email.com" disabled={isLocked} />
        </div>
        <div className="form-group">
          <label>Senha</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="••••••••" disabled={isLocked} />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={isLocked}>
          {isLocked ? `Bloqueado (${formatRemainingTime(lockRemainingMs)})` : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

