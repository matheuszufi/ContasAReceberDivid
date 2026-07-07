import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleRegister = async (e) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('As senhas não correspondem')
      return
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres')
      return
    }

    try {
      await register(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleRegister}>
        <div className="auth-logo">🏠</div>
        <h2>Criar Conta</h2>
        <p className="auth-sub">Preencha os dados para criar sua conta</p>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="seu@email.com" />
        </div>
        <div className="form-group">
          <label>Senha</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="Mínimo 6 caracteres" />
        </div>
        <div className="form-group">
          <label>Confirmar Senha</label>
          <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" required placeholder="Repita a senha" />
        </div>
        <button type="submit" className="btn btn-primary btn-block">Criar Conta</button>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => navigate('/')}>
          ← Voltar ao Login
        </button>
      </form>
    </div>
  )
}
