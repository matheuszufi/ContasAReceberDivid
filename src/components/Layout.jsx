import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import './Layout.css'

const navSections = [
  {
    label: 'Principal',
    items: [
      { path: '/dashboard', icon: '', label: 'Dashboard' },
      { path: '/perfil',    icon: '', label: 'Meu Perfil' },
    ]
  },
  {
    label: 'Cadastros',
    items: [
      { path: '/proprietarios', icon: '', label: 'Proprietários' },
      { path: '/imoveis',       icon: '', label: 'Imóveis' },
      { path: '/inquilinos',    icon: '', label: 'Inquilinos' },
      { path: '/contas/cadastrar',  icon: '', label: 'Contas' },
      { path: '/seguros/cadastrar', icon: '', label: 'Seguros' },
    ]
  },
  {
    label: 'Controle',
    items: [
      { path: '/inadimplentes', icon: '', label: 'Inadimplentes' },
      { path: '/seguro-fianca', icon: '', label: 'Seguro Fiança' },
      { path: '/seguro-incendio', icon: '', label: 'Seguro Incêndio' },
      { path: '/desocupacoes', icon: '', label: 'Desocupações' },
    ]
  },
  {
    label: 'Contas a receber',
    items: [
      { path: '/imoveis-todos', icon: '', label: 'Planilha de Cobrança' },
    ]
  }
]

export default function Layout({ children, title, subtitle }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signOut } = useAuth()

  const handleLogout = async () => {
    try {
      await signOut()
      navigate('/')
    } catch (err) {
      console.error('Erro ao sair:', err)
    }
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>ContasReceber</h2>
          <p>Sistema de Gestão</p>
        </div>

        <nav className="sidebar-nav">
          {navSections.map(section => (
            <div key={section.label}>
              <div className="sidebar-section-label">{section.label}</div>
              {section.items.map(item => (
                <button
                  key={item.path}
                  className={`nav-item${
                    location.pathname === item.path ||
                    (item.path !== '/dashboard' && location.pathname.startsWith(item.path + '/'))
                      ? ' active' : ''
                  }`}
                  onClick={() => navigate(item.path)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <p>{user?.email}</p>
          </div>
          <button className="nav-item logout-item" onClick={handleLogout}>
            <span className="nav-icon">🚪</span>
            Sair
          </button>
        </div>
      </aside>

      <div className="main-content">
        {(title || subtitle) && (
          <header className="page-header">
            <div>
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </header>
        )}
        <div className="page-body">
          {children}
        </div>
      </div>
    </div>
  )
}
