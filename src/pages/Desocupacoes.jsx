import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const modeloBadge = { MA: 'badge-green', ME: 'badge-blue', ML: 'badge-yellow' }

const fmtMoney = (v) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

// Célula de status: exibe o badge; ao clicar, vira um select para trocar Ativo/Inativo
function StatusCell({ status, onChange }) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <td className="editable-cell editing">
        <select
          autoFocus
          value={status || 'Ativo'}
          onChange={e => { onChange(e.target.value); setEditing(false) }}
          onBlur={() => setEditing(false)}
        >
          <option value="Ativo">Ativo</option>
          <option value="Inativo">Inativo</option>
        </select>
      </td>
    )
  }

  return (
    <td className="editable-cell" onClick={() => setEditing(true)} title="Clique para alterar o status">
      <span className={`badge ${status === 'Inativo' ? 'badge-gray' : 'badge-green'}`}>
        {status || 'Ativo'}
      </span>
    </td>
  )
}

export default function Desocupacoes() {
  const navigate = useNavigate()
  const [inquilinos, setInquilinos] = useState([])
  const [imoveis, setImoveis] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [novoInquilinoId, setNovoInquilinoId] = useState('')

  useEffect(() => {
    const r1 = ref(db, 'inquilinos')
    const unsub1 = onValue(r1, snap => {
      const data = snap.val()
      setInquilinos(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
      setLoading(false)
    })
    const r2 = ref(db, 'imoveis')
    const unsub2 = onValue(r2, snap => {
      const data = snap.val()
      setImoveis(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
    return () => { unsub1(); unsub2() }
  }, [])

  const imovelMap = useMemo(
    () => Object.fromEntries(imoveis.map(im => [im.id, im])),
    [imoveis]
  )

  // Entram aqui os inquilinos com data de saída registrada (mesmo campo usado em
  // Inquilinos.jsx e no modal de Desocupação) ou marcados manualmente pelo flag;
  // inquilinos inativos somem da planilha assim que o status é alterado
  const desocupando = useMemo(
    () => inquilinos.filter(i => (i.dataSaida || i.desocupando) && i.status !== 'Inativo'),
    [inquilinos]
  )

  const disponiveisParaAdicionar = useMemo(
    () => inquilinos
      .filter(i => !i.dataSaida && !i.desocupando)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [inquilinos]
  )

  const filtered = useMemo(() => {
    const termo = search.toLowerCase()
    return desocupando.filter(i => {
      const imovel = imovelMap[i.imovelId]
      return (
        (i.nome || '').toLowerCase().includes(termo) ||
        (imovel?.codigo || i.codigoImovel || '').toLowerCase().includes(termo)
      )
    })
  }, [desocupando, imovelMap, search])

  const imoveisEnvolvidos = useMemo(
    () => new Set(desocupando.map(i => i.imovelId).filter(Boolean)).size,
    [desocupando]
  )

  const handleCampoChange = (inquilinoId, campo, valor) => {
    update(ref(db, `inquilinos/${inquilinoId}`), { [campo]: valor })
  }

  const handleStatusChange = (inquilinoId, status) => {
    update(ref(db, `inquilinos/${inquilinoId}`), { status })
  }

  const handleAdicionar = (e) => {
    e.preventDefault()
    if (!novoInquilinoId) return
    update(ref(db, `inquilinos/${novoInquilinoId}`), { desocupando: true })
    setNovoInquilinoId('')
  }

  const handleRemover = (inquilinoId) => {
    if (!window.confirm('Remover este inquilino da lista de desocupações?')) return
    update(ref(db, `inquilinos/${inquilinoId}`), { desocupando: false, dataSaida: '' })
  }

  return (
    <Layout title="Desocupações" subtitle="Controle de inquilinos em processo de desocupação">
      <div className="actions-bar">
        <input
          type="text"
          placeholder="Buscar por nome ou imóvel..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
        <form onSubmit={handleAdicionar} style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <select
            value={novoInquilinoId}
            onChange={e => setNovoInquilinoId(e.target.value)}
            style={{ minWidth: 240 }}
          >
            <option value="">Selecione um inquilino...</option>
            {disponiveisParaAdicionar.map(i => (
              <option key={i.id} value={i.id}>{i.nome}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '9px 16px' }}>
            + Adicionar
          </button>
        </form>
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-value">{desocupando.length}</div>
          <div className="stat-label">Desocupando</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏠</div>
          <div className="stat-value">{imoveisEnvolvidos}</div>
          <div className="stat-label">Imóveis Envolvidos</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Inquilinos Desocupando ({filtered.length})</h3>
        </div>
        <div className="table-container">
          {loading ? (
            <div className="empty-state">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">Nenhum inquilino em processo de desocupação.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Inquilino</th>
                  <th>Imóvel</th>
                  <th>Modelo</th>
                  <th>Data de Saída</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inq => {
                  const imovel = imovelMap[inq.imovelId]
                  return (
                    <tr key={inq.id}>
                      <td>{inq.nome}</td>
                      <td>{imovel?.codigo || inq.codigoImovel || '—'}</td>
                      <td>
                        {imovel?.modelo
                          ? <span className={`badge ${modeloBadge[imovel.modelo] || 'badge-gray'}`}>{imovel.modelo}</span>
                          : '—'}
                      </td>
                      <td>
                        <input
                          type="date"
                          defaultValue={inq.dataSaida || ''}
                          onBlur={e => handleCampoChange(inq.id, 'dataSaida', e.target.value)}
                        />
                      </td>
                      <td>
                        <StatusCell status={inq.status} onChange={v => handleStatusChange(inq.id, v)} />
                      </td>
                      <td style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-secondary"
                          style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                          onClick={() => navigate(`/inquilinos/editar/${inq.id}`)}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                          onClick={() => handleRemover(inq.id)}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  )
}
