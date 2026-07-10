import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const modeloBadge = { MA: 'badge-green', ME: 'badge-blue', ML: 'badge-yellow' }

export default function Inquilinos() {
  const navigate = useNavigate()
  const [inquilinos, setInquilinos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const inquilinosRef = ref(db, 'inquilinos')
    const unsubscribe = onValue(inquilinosRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const list = Object.entries(data).map(([id, val]) => ({ id, ...val }))
        setInquilinos(list)
      } else {
        setInquilinos([])
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este inquilino?')) return
    await remove(ref(db, `inquilinos/${id}`))
  }

  const filtered = inquilinos.filter(i =>
    i.nome?.toLowerCase().includes(search.toLowerCase()) ||
    i.cpf?.includes(search) ||
    i.codigoImovel?.toLowerCase().includes(search.toLowerCase())
  )

  const ativos   = inquilinos.filter(i => i.status === 'Ativo').length
  const inativos = inquilinos.filter(i => i.status === 'Inativo').length

  return (
    <Layout title="Inquilinos" subtitle="Gestão de inquilinos cadastrados">
      <div className="actions-bar">
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/inquilinos/cadastrar')}>
          ➕ Cadastrar Inquilino
        </button>
        <input
          type="text"
          placeholder="Buscar por nome, CPF ou imóvel..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon">👤</div>
          <div className="stat-value">{inquilinos.length}</div>
          <div className="stat-label">Total de Inquilinos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{ativos}</div>
          <div className="stat-label">Ativos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">❌</div>
          <div className="stat-value">{inativos}</div>
          <div className="stat-label">Inativos</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Todos os Inquilinos ({filtered.length})</h3>
        </div>
        <div className="table-container">
          {loading ? (
            <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th>Telefone</th>
                  <th>Imóvel</th>
                  <th>Quarto</th>
                  <th>Modelo</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state">
                        <div className="es-icon">👤</div>
                        <h3>Nenhum inquilino encontrado</h3>
                        <p>Tente ajustar os filtros ou cadastre um novo inquilino.</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(inq => (
                  <tr key={inq.id}>
                    <td><strong>{inq.nome}</strong></td>
                    <td>{inq.cpf || '—'}</td>
                    <td>{inq.telefone || '—'}</td>
                    <td>{inq.codigoImovel || '—'}</td>
                    <td>{inq.numeroQuarto || '—'}</td>
                    <td>
                      {inq.modelo
                        ? <span className={`badge ${modeloBadge[inq.modelo] || 'badge-gray'}`}>{inq.modelo}</span>
                        : '—'}
                    </td>
                    <td>
                      {inq.valorImovel
                        ? `R$ ${Number(inq.valorImovel).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td>
                      <span className={`badge ${inq.status === 'Ativo' ? 'badge-green' : 'badge-gray'}`}>
                        {inq.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-sm" onClick={() => navigate(`/inquilinos/editar/${inq.id}`)}>Editar</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(inq.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  )
}

