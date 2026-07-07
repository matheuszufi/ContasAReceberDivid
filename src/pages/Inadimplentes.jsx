import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const statusBadge = {
  'Pendente':      'badge-yellow',
  'Pago':          'badge-green',
  'Em Negociação': 'badge-blue',
  'Protestado':    'badge-red',
  'Acordo':        'badge-blue',
}

export default function Inadimplentes() {
  const navigate = useNavigate()
  const [debitos, setDebitos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const r = ref(db, 'inadimplencias')
    const unsub = onValue(r, snap => {
      const data = snap.val()
      setDebitos(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este débito?')) return
    await remove(ref(db, `inadimplencias/${id}`))
  }

  const pendentes   = debitos.filter(d => d.status !== 'Pago')
  const totalAberto = pendentes.reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0)
  const vencidos30  = pendentes.filter(d => {
    if (!d.dataVencimento) return false
    const diff = (Date.now() - new Date(d.dataVencimento).getTime()) / 86400000
    return diff > 30
  }).length

  const filtered = debitos.filter(d =>
    d.inquilinoNome?.toLowerCase().includes(search.toLowerCase()) ||
    d.codigoImovel?.toLowerCase().includes(search.toLowerCase()) ||
    d.tipoDebito?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Layout title="⚠️ Inadimplentes" subtitle="Controle de cláientes com débitos pendentes">
      <div className="actions-bar">
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/inadimplentes/cadastrar')}>
          ➕ Registrar Débito
        </button>
        <input
          type="text"
          placeholder="Buscar por inquilino, imóvel ou tipo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon">⚠️</div>
          <div className="stat-value">{pendentes.length}</div>
          <div className="stat-label">Débitos em Aberto</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-value" style={{ fontSize: '18px' }}>
            R$ {totalAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="stat-label">Valor Total em Aberto</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <div className="stat-value">{vencidos30}</div>
          <div className="stat-label">Vencidos há +30 dias</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{debitos.filter(d => d.status === 'Pago').length}</div>
          <div className="stat-label">Pagos</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Todos os Débitos ({filtered.length})</h3>
        </div>
        <div className="table-container">
          {loading ? (
            <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Inquilino</th>
                  <th>Imóvel</th>
                  <th>Tipo</th>
                  <th>Mês Ref.</th>
                  <th>Vencimento</th>
                  <th>Valor Original</th>
                  <th>Total c/ Encargos</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty-state">
                        <div className="es-icon">✅</div>
                        <h3>Nenhum débito encontrado</h3>
                        <p>Todos os pagamentos estão em dia.</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(d => (
                  <tr key={d.id}>
                    <td><strong>{d.inquilinoNome || '—'}</strong></td>
                    <td>{d.codigoImovel || '—'}</td>
                    <td>{d.tipoDebito || '—'}</td>
                    <td>{d.mesReferencia ? new Date(d.mesReferencia + '-01').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '—'}</td>
                    <td>{d.dataVencimento ? new Date(d.dataVencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                    <td>R$ {Number(d.valorOriginal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td><strong>R$ {Number(d.valorTotal || d.valorOriginal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                    <td>
                      <span className={`badge ${statusBadge[d.status] || 'badge-gray'}`}>{d.status || 'Pendente'}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-sm" style={{ background: '#8b5cf6', color: '#fff', borderColor: '#8b5cf6' }} onClick={() => navigate(`/inadimplentes/timeline/${d.id}`)}>📅 Timeline</button>
                        <button className="btn btn-sm" onClick={() => navigate(`/inadimplentes/editar/${d.id}`)}>Editar</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(d.id)}>Excluir</button>
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
