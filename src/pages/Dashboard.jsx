import React from 'react'
import { useAuth } from '../auth'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await signOut()
      navigate('/')
    } catch (err) {
      console.error('Erro ao sair:', err)
    }
  }

  const buttonStyle = {
    padding: '18px 30px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    margin: '12px 8px',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    minWidth: '220px'
  }

  const navButtonsContainerStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '20px',
    marginTop: '30px'
  }

  const sectionStyle = {
    marginTop: '35px',
    marginBottom: '10px'
  }

  const sectionTitleStyle = {
    fontSize: '20px',
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: '20px',
    borderBottom: '3px solid #3498db',
    paddingBottom: '12px'
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa', padding: '40px 20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '40px',
          backgroundColor: 'white',
          padding: '25px 30px',
          borderRadius: '10px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
        }}>
          <div>
            <h1 style={{ margin: '0 0 8px 0', color: '#2c3e50', fontSize: '28px', fontWeight: '700' }}>
              Painel de Controle
            </h1>
            <p style={{ margin: '0', color: '#7f8c8d', fontSize: '14px' }}>
              Gerenciamento de Contas a Receber
            </p>
          </div>
          <button 
            onClick={handleLogout}
            style={{ 
              ...buttonStyle,
              backgroundColor: '#e74c3c', 
              color: 'white',
              minWidth: '140px'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#c0392b'
              e.target.style.transform = 'translateY(-2px)'
              e.target.style.boxShadow = '0 4px 12px rgba(231,76,60,0.3)'
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#e74c3c'
              e.target.style.transform = 'translateY(0)'
              e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
            }}
          >
            🚪 Sair
          </button>
        </div>

        {/* Imóveis Section */}
        <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '10px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          <h2 style={sectionTitleStyle}>📦 Imóveis</h2>
          <div style={navButtonsContainerStyle}>
            <button 
              onClick={() => navigate('/imoveis-me')}
              style={{ 
                ...buttonStyle,
                backgroundColor: '#3498db', 
                color: 'white',
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#2980b9'
                e.target.style.transform = 'translateY(-4px)'
                e.target.style.boxShadow = '0 6px 16px rgba(52,152,219,0.3)'
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = '#3498db'
                e.target.style.transform = 'translateY(0)'
                e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              🏠 <br/> Imóveis ME
            </button>
            <button 
              onClick={() => navigate('/imoveis-ma')}
              style={{ 
                ...buttonStyle,
                backgroundColor: '#2ecc71', 
                color: 'white',
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#27ae60'
                e.target.style.transform = 'translateY(-4px)'
                e.target.style.boxShadow = '0 6px 16px rgba(46,204,113,0.3)'
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = '#2ecc71'
                e.target.style.transform = 'translateY(0)'
                e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              🏢 <br/> Imóveis MA
            </button>
            <button 
              onClick={() => navigate('/imoveis-ml')}
              style={{ 
                ...buttonStyle,
                backgroundColor: '#f39c12', 
                color: 'white',
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#e67e22'
                e.target.style.transform = 'translateY(-4px)'
                e.target.style.boxShadow = '0 6px 16px rgba(243,156,18,0.3)'
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = '#f39c12'
                e.target.style.transform = 'translateY(0)'
                e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              🏗️ <br/> Imóveis ML
            </button>
          </div>
        </div>

        {/* Gestão Section */}
        <div style={{ 
          backgroundColor: 'white', 
          padding: '30px', 
          borderRadius: '10px', 
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          marginTop: '30px'
        }}>
          <h2 style={sectionTitleStyle}>⚙️ Gestão</h2>
          <div style={navButtonsContainerStyle}>
            <button 
              onClick={() => navigate('/inadimplentes')}
              style={{ 
                ...buttonStyle,
                backgroundColor: '#e74c3c', 
                color: 'white',
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#c0392b'
                e.target.style.transform = 'translateY(-4px)'
                e.target.style.boxShadow = '0 6px 16px rgba(231,76,60,0.3)'
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = '#e74c3c'
                e.target.style.transform = 'translateY(0)'
                e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              ⚠️ <br/> Inadimplentes
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
