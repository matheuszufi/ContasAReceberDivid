import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import ImoveisMe from './pages/ImoveisMe'
import ImoveisMa from './pages/ImoveisMa'
import ImoveisMl from './pages/ImoveisMl'
import { useAuth } from './auth'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div>Carregando...</div>
  return user ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/imoveis-me"
        element={
          <PrivateRoute>
            <ImoveisMe />
          </PrivateRoute>
        }
      />
      <Route
        path="/imoveis-ma"
        element={
          <PrivateRoute>
            <ImoveisMa />
          </PrivateRoute>
        }
      />
      <Route
        path="/imoveis-ml"
        element={
          <PrivateRoute>
            <ImoveisMl />
          </PrivateRoute>
        }
      />
    </Routes>
  )
}
