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
    padding: '15px 20px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '10px 5px',
    transition: 'background-color 0.3s',
    minWidth: '200px'
  }

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Dashboard</h2>
            <p>Bem-vindo!</p>
          </div>
          <div>
            <button 
              onClick={handleLogout}
              style={{ 
                ...buttonStyle,
                backgroundColor: '#e74c3c', 
                color: 'white',
              }}
            >
              Sair
            </button>
          </div>
        </div>

        <hr style={{ margin: '20px 0', borderColor: '#ddd' }} />

        <div style={{ marginTop: '20px' }}>
          <h3>Imóveis</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button 
              onClick={() => navigate('/imoveis-me')}
              style={{ 
                ...buttonStyle,
                backgroundColor: '#3498db', 
                color: 'white',
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#2980b9'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#3498db'}
            >
              🏠 Imóveis ME
            </button>
            <button 
              onClick={() => navigate('/imoveis-ma')}
              style={{ 
                ...buttonStyle,
                backgroundColor: '#2ecc71', 
                color: 'white',
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#27ae60'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#2ecc71'}
            >
              🏢 Imóveis MA
            </button>
            <button 
              onClick={() => navigate('/imoveis-ml')}
              style={{ 
                ...buttonStyle,
                backgroundColor: '#f39c12', 
                color: 'white',
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#e67e22'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#f39c12'}
            >
              🏗️ Imóveis ML
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
