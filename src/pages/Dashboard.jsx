import React from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'

const navCards = [
  { path: '/imoveis',       icon: '🏠', label: 'Imóveis',        sub: 'Lista e gestão de imóveis',     color: '#3b82f6' },
  { path: '/proprietarios', icon: '👥', label: 'Proprietários',  sub: 'Donos de imóveis cadastrados',  color: '#0891b2' },
  { path: '/inquilinos',    icon: '👤', label: 'Inquilinos',     sub: 'Gestão de inquilinos',          color: '#8b5cf6' },
  { path: '/inadimplentes', icon: '⚠️', label: 'Inadimplentes', sub: 'Controle de débitos',           color: '#ef4444' },
  { path: '/imoveis-me',    icon: '🏠', label: 'Imóveis ME',     sub: 'ME',                  color: '#0ea5e9' },
  { path: '/imoveis-ma',    icon: '🏢', label: 'Imóveis MA',     sub: 'MA',           color: '#22c55e' },
  { path: '/imoveis-ml',    icon: '🏗️', label: 'Imóveis ML',     sub: 'ML',             color: '#f59e0b' },
]

export default function Dashboard() {
  const navigate = useNavigate()

  return (
    <Layout title="Dashboard" subtitle="Visão geral do sistema de gestão">
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon">🏠</div>
          <div className="stat-value">—</div>
          <div className="stat-label">Total de Imóveis</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👤</div>
          <div className="stat-value">—</div>
          <div className="stat-label">Inquilinos Ativos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⚠️</div>
          <div className="stat-value">—</div>
          <div className="stat-label">Inadimplentes</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-value">—</div>
          <div className="stat-label">Receita Mensal</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Acesso Rápido</h3>
        </div>
        <div className="card-body">
          <div className="nav-grid">
            {navCards.map(card => (
              <div
                key={card.path}
                className="nav-card"
                style={{ borderTopColor: card.color }}
                onClick={() => navigate(card.path)}
              >
                <div className="nc-icon">{card.icon}</div>
                <div className="nc-label">{card.label}</div>
                <div className="nc-sub">{card.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  )
}
