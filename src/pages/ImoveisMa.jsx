import React from 'react'
import Layout from '../components/Layout'

export default function ImoveisMa() {
  return (
    <Layout title="🏢 Imóveis MA" subtitle="Média Administração — Controle de Imóveis">
      <div className="actions-bar">
        <button className="btn btn-primary" style={{ width: 'auto' }}>➕ Cadastrar Imóvel</button>
        <button className="btn btn-success" style={{ width: 'auto' }}>👤 Cadastrar Inquilino</button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Imóveis MA</h3>
          <span className="badge badge-green">MA</span>
        </div>
        <div className="card-body">
          <div className="info-banner success">
            <h3>Planilha de Controle</h3>
            <p>Nesta seção você gerencia todos os imóveis da categoria MA (Média Administração) e seus respectivos inquilinos.</p>
          </div>
          <div style={{ marginTop: '20px' }}>
            <div className="empty-state">
              <div className="es-icon">🏢</div>
              <h3>Nenhum imóvel cadastrado</h3>
              <p>Clique em "Cadastrar Imóvel" para adicionar o primeiro imóvel.</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
