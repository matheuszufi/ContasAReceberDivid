import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const modeloBadge = { MA: 'badge-green', ME: 'badge-blue', ML: 'badge-yellow' }

export default function Proprietarios() {
  const navigate = useNavigate()
  const [proprietarios, setProprietarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const r = ref(db, 'proprietarios')
    const unsub = onValue(r, snap => {
      const data = snap.val()
      setProprietarios(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este proprietário?')) return
    await remove(ref(db, `proprietarios/${id}`))
  }

  const filtered = proprietarios.filter(p =>
    p.nome?.toLowerCase().includes(search.toLowerCase()) ||
    p.cpf?.includes(search) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Layout title="Proprietários" subtitle="Gestão de proprietários de imóveis">
      <div className="actions-bar">
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/proprietarios/cadastrar')}>
          ➕ Cadastrar Proprietário
        </button>
        <input
          type="text"
          placeholder="Buscar por nome, CPF ou email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-value">{proprietarios.length}</div>
          <div className="stat-label">Total de Proprietários</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{proprietarios.filter(p => p.status === 'Ativo').length}</div>
          <div className="stat-label">Ativos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">❌</div>
          <div className="stat-value">{proprietarios.filter(p => p.status === 'Inativo').length}</div>
          <div className="stat-label">Inativos</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Todos os Proprietários ({filtered.length})</h3>
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
                  <th>Email</th>
                  <th>Modelo</th>
                  <th>Banco / PIX</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state">
                        <div className="es-icon">👥</div>
                        <h3>Nenhum proprietário encontrado</h3>
                        <p>Cadastre um novo proprietário para começar.</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(p => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.nome}</strong>
                      {p.rg && <div style={{ fontSize: '11px', color: '#64748b' }}>RG: {p.rg}</div>}
                    </td>
                    <td>{p.cpf || '—'}</td>
                    <td>
                      {p.telefone || '—'}
                      {p.telefoneSecundario && <div style={{ fontSize: '11px', color: '#64748b' }}>{p.telefoneSecundario}</div>}
                    </td>
                    <td>{p.email || '—'}</td>
                    <td>
                      {p.modelo
                        ? <span className={`badge ${modeloBadge[p.modelo] || 'badge-gray'}`}>{p.modelo}</span>
                        : '—'}
                    </td>
                    <td>
                      {p.banco && <div style={{ fontSize: '12px' }}>{p.banco}</div>}
                      {p.pix && <div style={{ fontSize: '11px', color: '#64748b' }}>PIX: {p.pix}</div>}
                      {!p.banco && !p.pix && '—'}
                    </td>
                    <td>
                      <span className={`badge ${p.status === 'Ativo' ? 'badge-green' : 'badge-gray'}`}>
                        {p.status || 'Ativo'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-sm" onClick={() => navigate(`/proprietarios/editar/${p.id}`)}>Editar</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Excluir</button>
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
