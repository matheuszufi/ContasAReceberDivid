import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import logo from '../assets/images/divid-logo.png'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    }
  }

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
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="seu@email.com" />
        </div>
        <div className="form-group">
          <label>Senha</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="••••••••" />
        </div>
        <button type="submit" className="btn btn-primary btn-block">Entrar</button>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => navigate('/register')}>
          Criar conta
        </button>
      </form>
    </div>
  )
}
