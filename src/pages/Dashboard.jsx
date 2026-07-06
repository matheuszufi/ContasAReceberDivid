import React from 'react'
import { useAuth } from '../auth'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Dashboard</h2>
        <p>Você está logado como: <strong>{user?.email}</strong></p>
        <button onClick={handleLogout}>Sair</button>
      </div>
    </div>
  )
}
