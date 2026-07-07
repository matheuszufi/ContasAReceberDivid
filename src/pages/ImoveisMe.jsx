import React from 'react'
import Layout from '../components/Layout'

export default function ImoveisMe() {
  return (
    <Layout title="🏠 Imóveis ME" subtitle="Microempresa — Controle de Imóveis">
      <div className="actions-bar">
        <button className="btn btn-primary" style={{ width: 'auto' }}>➕ Cadastrar Imóvel</button>
        <button className="btn btn-success" style={{ width: 'auto' }}>👤 Cadastrar Inquilino</button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Imóveis ME</h3>
          <span className="badge badge-blue">ME</span>
        </div>
        <div className="card-body">
          <div className="info-banner">
            <h3>Planilha de Controle</h3>
            <p>Nesta seção você gerencia todos os imóveis da categoria ME (Microempresa) e seus respectivos inquilinos.</p>
          </div>
          <div style={{ marginTop: '20px' }}>
            <div className="empty-state">
              <div className="es-icon">🏠</div>
              <h3>Nenhum imóvel cadastrado</h3>
              <p>Clique em "Cadastrar Imóvel" para adicionar o primeiro imóvel.</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
