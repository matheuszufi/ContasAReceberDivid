import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const modeloBadge = { MA: 'badge-green', ME: 'badge-blue', ML: 'badge-yellow' }
const statusBadge  = {
  'Disponível':    'badge-green',
  'Ocupado':       'badge-blue',
  'Em Manutenção': 'badge-yellow',
  'Indisponível':  'badge-red',
}

export default function Imoveis() {
  const navigate = useNavigate()
  const [imoveis, setImoveis] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const r = ref(db, 'imoveis')
    const unsub = onValue(r, snap => {
      const data = snap.val()
      setImoveis(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este imóvel?')) return
    await remove(ref(db, `imoveis/${id}`))
  }

  const filtered = imoveis.filter(im =>
    im.codigo?.toLowerCase().includes(search.toLowerCase()) ||
    im.endereco?.rua?.toLowerCase().includes(search.toLowerCase()) ||
    im.proprietarioNome?.toLowerCase().includes(search.toLowerCase()) ||
    im.tipo?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Layout title="Imóveis" subtitle="Lista e gerenciamento de todos os imóveis">
      <div className="actions-bar">
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/imoveis/cadastrar')}>
          ➕ Cadastrar Imóvel
        </button>
        <input
          type="text"
          placeholder="Buscar por código, endereço, proprietário ou tipo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon">🏠</div>
          <div className="stat-value">{imoveis.length}</div>
          <div className="stat-label">Total de Imóveis</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🔑</div>
          <div className="stat-value">{imoveis.filter(i => i.status === 'Disponível').length}</div>
          <div className="stat-label">Disponíveis</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{imoveis.filter(i => i.status === 'Ocupado').length}</div>
          <div className="stat-label">Ocupados</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🔧</div>
          <div className="stat-value">{imoveis.filter(i => i.status === 'Em Manutenção').length}</div>
          <div className="stat-label">Em Manutenção</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Todos os Imóveis ({filtered.length})</h3>
        </div>
        <div className="table-container">
          {loading ? (
            <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
          ) : (
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Tipo</th>
                <th>Endereço</th>
                <th>Proprietário</th>
                <th>Modelo</th>
                <th>Aluguel</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <div className="es-icon">🏠</div>
                      <h3>Nenhum imóvel encontrado</h3>
                      <p>Cadastre um novo imóvel para começar.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(im => (
                <tr key={im.id}>
                  <td><strong>{im.codigo || '—'}</strong></td>
                  <td>{im.tipo || '—'}</td>
                  <td>
                    {im.endereco?.rua
                      ? `${im.endereco.rua}, ${im.endereco.numero || 's/n'} — ${im.endereco.bairro || im.endereco.cidade || ''}`
                      : '—'}
                  </td>
                  <td>{im.proprietarioNome || '—'}</td>
                  <td>
                    {im.modelo ? <span className={`badge ${modeloBadge[im.modelo] || 'badge-gray'}`}>{im.modelo}</span> : '—'}
                  </td>
                  <td>
                    {im.valorAluguel
                      ? `R$ ${Number(im.valorAluguel).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                  <td>
                    <span className={`badge ${statusBadge[im.status] || 'badge-gray'}`}>{im.status || '—'}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-sm" onClick={() => navigate(`/imoveis/editar/${im.id}`)}>Editar</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(im.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>          )}        </div>
      </div>
    </Layout>
  )
}
