import React from 'react'
import Layout from '../components/Layout'

export default function ImoveisMl() {
  return (
    <Layout title="🏗️ Imóveis ML" subtitle="Omie — Controle de Imóveis">
      <div className="actions-bar">
        <button className="btn btn-primary" style={{ width: 'auto' }}>➕ Cadastrar Imóvel</button>
        <button className="btn btn-success" style={{ width: 'auto' }}>👤 Cadastrar Inquilino</button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Imóveis ML</h3>
          <span className="badge badge-yellow">ML</span>
        </div>
        <div className="card-body">
          <div className="info-banner warning">
            <h3>Planilha de Controle</h3>
            <p>Nesta seção você gerencia todos os imóveis da categoria ML (Médio/Longo Prazo) e seus respectivos inquilinos.</p>
          </div>
          <div style={{ marginTop: '20px' }}>
            <div className="empty-state">
              <div className="es-icon">🏗️</div>
              <h3>Nenhum imóvel cadastrado</h3>
              <p>Clique em "Cadastrar Imóvel" para adicionar o primeiro imóvel.</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
