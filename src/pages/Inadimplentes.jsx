import React from 'react'
import Layout from '../components/Layout'

export default function Inadimplentes() {
  return (
    <Layout title="⚠️ Inadimplentes" subtitle="Controle de clientes com débitos pendentes">
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon">⚠️</div>
          <div className="stat-value">—</div>
          <div className="stat-label">Inadimplentes</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-value">—</div>
          <div className="stat-label">Valor em Aberto</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <div className="stat-value">—</div>
          <div className="stat-label">Vencidos há +30 dias</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Lista de Inadimplentes</h3>
          <button className="btn btn-primary" style={{ width: 'auto' }}>➕ Registrar Débito</button>
        </div>
        <div className="card-body">
          <div className="info-banner danger">
            <h3>Controle de Inadimplência</h3>
            <p>Nesta seção você gerencia todos os clientes e imóveis com débitos pendentes e histórico de inadimplência.</p>
          </div>
          <div style={{ marginTop: '20px' }}>
            <div className="empty-state">
              <div className="es-icon">✅</div>
              <h3>Nenhum inadimplente registrado</h3>
              <p>Todos os pagamentos estão em dia.</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
