import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const modeloBadge = { MA: 'badge-green', ME: 'badge-blue', ML: 'badge-yellow' }
const MODELOS = ['MA', 'ME', 'ML']
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

  const handleModeloChange = async (id, modelo) => {
    await update(ref(db, `imoveis/${id}`), { modelo })
  }

  const filtered = imoveis.filter(im =>
    im.codigo?.toLowerCase().includes(search.toLowerCase()) ||
    im.endereco?.rua?.toLowerCase().includes(search.toLowerCase()) ||
    im.proprietarioNome?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Layout title="Imóveis" subtitle="Lista e gerenciamento de todos os imóveis">
      <div className="actions-bar">
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/imoveis/cadastrar')}>
          <b>+</b> Cadastrar Imóvel
        </button>
        <input
          type="text"
          placeholder="Buscar por código, endereço ou proprietário..."
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
                <th>Endereço</th>
                <th>Cidade/Estado</th>
                <th>Proprietário</th>
                  <th>Modelo</th>
                  <th>Status</th>
                  <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
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
                  <td>
                    {im.endereco?.rua
                      ? [
                          `${im.endereco.rua}, ${im.endereco.numero || 's/n'}`,
                          im.endereco.complemento,
                          im.endereco.bairro,
                          im.endereco.cep,
                        ].filter(Boolean).join(' — ')
                      : '—'}
                  </td>
                  <td>
                    {[im.endereco?.cidade, im.endereco?.estado].filter(Boolean).join('/') || '—'}
                  </td>
                  <td>{im.proprietarioNome || '—'}</td>
                  <td>
                    <select
                      className={`badge-select ${modeloBadge[im.modelo] || 'badge-gray'}`}
                      value={im.modelo || ''}
                      onChange={e => handleModeloChange(im.id, e.target.value)}
                    >
                      <option value="">—</option>
                      {MODELOS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
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
