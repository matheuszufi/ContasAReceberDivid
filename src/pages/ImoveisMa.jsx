import React from 'react'
import { useNavigate } from 'react-router-dom'

export default function ImoveisMa() {
  const navigate = useNavigate()

  return (
    <div className="container">
      <div className="card">
        <button 
          onClick={() => navigate('/dashboard')}
          style={{ 
            marginBottom: '20px',
            backgroundColor: '#3498db',
            color: 'white',
            padding: '10px 20px',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          ← Voltar
        </button>
        
        <h2>Imóveis MA</h2>
        <p>Página de imóveis MA - em desenvolvimento</p>
        
        <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
          <h3>Características:</h3>
          <ul>
            <li>Média Administração</li>
            <li>Imóveis catalogados como MA</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
