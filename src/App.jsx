import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Imoveis from './pages/Imoveis'
import CadastrarImovel from './pages/CadastrarImovel'
import ImoveisMe from './pages/ImoveisMe'
import ImoveisMa from './pages/ImoveisMa'
import ImoveisMl from './pages/ImoveisMl'
import Proprietarios from './pages/Proprietarios'
import CadastrarProprietario from './pages/CadastrarProprietario'
import Inquilinos from './pages/Inquilinos'
import CadastrarInquilino from './pages/CadastrarInquilino'
import Inadimplentes from './pages/Inadimplentes'
import CadastrarInadimplencia from './pages/CadastrarInadimplencia'
import TimelineInadimplencia from './pages/TimelineInadimplencia'
import { useAuth } from './auth'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Carregando...</div>
  return user ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard"                  element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/imoveis"                    element={<PrivateRoute><Imoveis /></PrivateRoute>} />
      <Route path="/imoveis/cadastrar"          element={<PrivateRoute><CadastrarImovel /></PrivateRoute>} />
      <Route path="/imoveis/editar/:id"         element={<PrivateRoute><CadastrarImovel /></PrivateRoute>} />
      <Route path="/imoveis-me"                 element={<PrivateRoute><ImoveisMe /></PrivateRoute>} />
      <Route path="/imoveis-ma"                 element={<PrivateRoute><ImoveisMa /></PrivateRoute>} />
      <Route path="/imoveis-ml"                 element={<PrivateRoute><ImoveisMl /></PrivateRoute>} />
      <Route path="/proprietarios"              element={<PrivateRoute><Proprietarios /></PrivateRoute>} />
      <Route path="/proprietarios/cadastrar"    element={<PrivateRoute><CadastrarProprietario /></PrivateRoute>} />
      <Route path="/proprietarios/editar/:id"   element={<PrivateRoute><CadastrarProprietario /></PrivateRoute>} />
      <Route path="/inquilinos"                 element={<PrivateRoute><Inquilinos /></PrivateRoute>} />
      <Route path="/inquilinos/cadastrar"       element={<PrivateRoute><CadastrarInquilino /></PrivateRoute>} />
      <Route path="/inquilinos/editar/:id"      element={<PrivateRoute><CadastrarInquilino /></PrivateRoute>} />
      <Route path="/inadimplentes"              element={<PrivateRoute><Inadimplentes /></PrivateRoute>} />
      <Route path="/inadimplentes/cadastrar"    element={<PrivateRoute><CadastrarInadimplencia /></PrivateRoute>} />
      <Route path="/inadimplentes/editar/:id"   element={<PrivateRoute><CadastrarInadimplencia /></PrivateRoute>} />
      <Route path="/inadimplentes/timeline/:id" element={<PrivateRoute><TimelineInadimplencia /></PrivateRoute>} />
    </Routes>
  )
}
