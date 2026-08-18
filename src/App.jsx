import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Imoveis from './pages/Imoveis'
import ImoveisTodos from './pages/ImoveisTodos'
import CadastrarImovel from './pages/CadastrarImovel'
import Proprietarios from './pages/Proprietarios'
import CadastrarProprietario from './pages/CadastrarProprietario'
import Inquilinos from './pages/Inquilinos'
import CadastrarInquilino from './pages/CadastrarInquilino'
import ImportarPlanilha from './pages/ImportarPlanilha'
import Inadimplentes from './pages/Inadimplentes'
import CadastrarInadimplencia from './pages/CadastrarInadimplencia'
import CadastrarConta from './pages/CadastrarConta'
import CadastrarSeguro from './pages/CadastrarSeguro'
import ImportarInadimplencia from './pages/ImportarInadimplencia'
import TimelineInadimplencia from './pages/TimelineInadimplencia'
import SeguroFianca from './pages/SeguroFianca'
import SeguroIncendio from './pages/SeguroIncendio'
import Desocupacoes from './pages/Desocupacoes'
import { useAuth } from './auth'
import { firebaseError } from './firebase'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Carregando...</div>
  return user ? children : <Navigate to="/" replace />
}

function FirebaseErrorScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f8fafc',
      color: '#0f172a',
      fontFamily: 'sans-serif',
      padding: '24px'
    }}>
      <div style={{ maxWidth: '640px', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '12px' }}>Não foi possível conectar ao Firebase</h2>
        <p style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
          Verifique a configuração do projeto Firebase e atualize as chaves do app antes de publicar novamente.
        </p>
        <pre style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          background: '#e2e8f0',
          padding: '12px',
          borderRadius: '8px',
          textAlign: 'left'
        }}>
          {firebaseError?.message || 'Erro desconhecido de configuração do Firebase.'}
        </pre>
      </div>
    </div>
  )
}

export default function App() {
  if (firebaseError) {
    return <FirebaseErrorScreen />
  }

  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard"                  element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/imoveis"                    element={<PrivateRoute><Imoveis /></PrivateRoute>} />
      <Route path="/imoveis-todos"              element={<PrivateRoute><ImoveisTodos /></PrivateRoute>} />
      <Route path="/imoveis/cadastrar"          element={<PrivateRoute><CadastrarImovel /></PrivateRoute>} />
      <Route path="/imoveis/editar/:id"         element={<PrivateRoute><CadastrarImovel /></PrivateRoute>} />
      <Route path="/proprietarios"              element={<PrivateRoute><Proprietarios /></PrivateRoute>} />
      <Route path="/proprietarios/cadastrar"    element={<PrivateRoute><CadastrarProprietario /></PrivateRoute>} />
      <Route path="/proprietarios/editar/:id"   element={<PrivateRoute><CadastrarProprietario /></PrivateRoute>} />
      <Route path="/inquilinos"                 element={<PrivateRoute><Inquilinos /></PrivateRoute>} />
      <Route path="/inquilinos/cadastrar"       element={<PrivateRoute><CadastrarInquilino /></PrivateRoute>} />
      <Route path="/inquilinos/editar/:id"      element={<PrivateRoute><CadastrarInquilino /></PrivateRoute>} />
      <Route path="/inquilinos/importar"        element={<PrivateRoute><ImportarPlanilha /></PrivateRoute>} />
      <Route path="/inadimplentes"              element={<PrivateRoute><Inadimplentes /></PrivateRoute>} />
      <Route path="/inadimplentes/importar"     element={<PrivateRoute><ImportarInadimplencia /></PrivateRoute>} />
      <Route path="/inadimplentes/cadastrar"    element={<PrivateRoute><CadastrarInadimplencia /></PrivateRoute>} />
      <Route path="/inadimplentes/editar/:id"   element={<PrivateRoute><CadastrarInadimplencia /></PrivateRoute>} />
      <Route path="/inadimplentes/timeline/:id" element={<PrivateRoute><TimelineInadimplencia /></PrivateRoute>} />
      <Route path="/contas/cadastrar"           element={<PrivateRoute><CadastrarConta /></PrivateRoute>} />
      <Route path="/seguros/cadastrar"          element={<PrivateRoute><CadastrarSeguro /></PrivateRoute>} />
      <Route path="/seguro-fianca"               element={<PrivateRoute><SeguroFianca /></PrivateRoute>} />
      <Route path="/seguro-incendio"             element={<PrivateRoute><SeguroIncendio /></PrivateRoute>} />
      <Route path="/desocupacoes"                element={<PrivateRoute><Desocupacoes /></PrivateRoute>} />
    </Routes>
  )
}

