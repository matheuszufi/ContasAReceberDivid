import React from 'react'
import { useNavigate } from 'react-router-dom'

export default function Inadimplentes() {
  const navigate = useNavigate()

  const buttonStyle = {
    padding: '12px 24px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    margin: '8px',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa', padding: '30px 20px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ 
          backgroundColor: 'white', 
          padding: '25px 30px', 
          borderRadius: '10px',
          marginBottom: '30px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{ margin: '0 0 8px 0', color: '#2c3e50', fontSize: '24px' }}>
              ⚠️ Inadimplentes
            </h1>
            <p style={{ margin: '0', color: '#7f8c8d', fontSize: '14px' }}>
              Controle de Clientes Inadimplentes
            </p>
          </div>
          <button 
            onClick={() => navigate('/dashboard')}
            style={{ 
              ...buttonStyle,
              backgroundColor: '#95a5a6',
              color: 'white'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#7f8c8d'
              e.target.style.transform = 'translateY(-2px)'
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#95a5a6'
              e.target.style.transform = 'translateY(0)'
            }}
          >
            ← Voltar
          </button>
        </div>

        {/* Conteúdo */}
        <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '10px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          <div style={{ 
            display: 'flex', 
            gap: '15px', 
            marginBottom: '30px',
            flexWrap: 'wrap'
          }}>
            <button 
              style={{ 
                ...buttonStyle,
                backgroundColor: '#3498db',
                color: 'white'
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#2980b9'
                e.target.style.transform = 'translateY(-2px)'
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = '#3498db'
                e.target.style.transform = 'translateY(0)'
              }}
            >
              ➕ Cadastrar Imóvel
            </button>
            <button 
              style={{ 
                ...buttonStyle,
                backgroundColor: '#2ecc71',
                color: 'white'
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#27ae60'
                e.target.style.transform = 'translateY(-2px)'
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = '#2ecc71'
                e.target.style.transform = 'translateY(0)'
              }}
            >
              👤 Cadastrar Inquilino
            </button>
          </div>

          <div style={{ 
            padding: '20px', 
            backgroundColor: '#ecf0f1', 
            borderRadius: '6px',
            borderLeft: '4px solid #e74c3c'
          }}>
            <h3 style={{ marginTop: '0', color: '#2c3e50' }}>Planilha de Controle</h3>
            <p style={{ color: '#7f8c8d', marginBottom: '0' }}>
              Nesta seção você gerencia todos os clientes e imóveis com débitos pendentes e histórico de inadimplência.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
