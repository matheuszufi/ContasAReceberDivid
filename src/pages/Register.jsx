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
    <div className="container">
      <form className="card" onSubmit={handleRegister}>
        <h2>Criar Conta</h2>
        {error && <div className="error">{error}</div>}
        <label>
          Email
          <input 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            type="email" 
            required 
          />
        </label>
        <label>
          Senha
          <input 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            type="password" 
            required 
          />
        </label>
        <label>
          Confirmar Senha
          <input 
            value={confirmPassword} 
            onChange={(e) => setConfirmPassword(e.target.value)} 
            type="password" 
            required 
          />
        </label>
        <button type="submit">Registrar</button>
        <button type="button" className="secondary" onClick={() => navigate('/')}>
          Voltar
        </button>
      </form>
    </div>
  )
}
