import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const modeloBadge = { MA: 'badge-green', ME: 'badge-blue', ML: 'badge-yellow' }
const MODELOS = ['MA', 'ME', 'ML']
const STATUS_LIST = ['Disponível', 'Ocupado', 'Em Manutenção', 'Indisponível']
const statusBadge  = {
  'Disponível':    'badge-green',
  'Ocupado':       'badge-blue',
  'Em Manutenção': 'badge-yellow',
  'Indisponível':  'badge-red',
}

const formatCEP = (v) =>
  v.replace(/\D/g, '').replace(/(\d{5})(\d{1,3})/, '$1-$2').substring(0, 9)

// Célula genérica: exibe o valor; ao clicar, vira input (ou select) editável
function EditableCell({ value, display, onSave, type = 'text', options = [], placeholder = '—' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current.select) inputRef.current.select()
    }
  }, [editing])

  const start = () => {
    setDraft(value ?? '')
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  const cancel = () => {
    setEditing(false)
    setDraft(value ?? '')
  }

  if (!editing) {
    return (
      <td className="editable-cell" onClick={start} title="Clique para editar">
        {display !== undefined ? display : (value || <span className="cell-empty">{placeholder}</span>)}
      </td>
    )
  }

  if (type === 'select') {
    return (
      <td className="editable-cell editing">
        <select
          ref={inputRef}
          className="cell-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
          }}
        >
          <option value="">—</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
    )
  }

  return (
    <td className="editable-cell editing">
      <input
        ref={inputRef}
        className="cell-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') cancel()
        }}
      />
    </td>
  )
}

export default function Imoveis() {
  const navigate = useNavigate()
  const [imoveis, setImoveis] = useState([])
  const [proprietarios, setProprietarios] = useState([])
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

  useEffect(() => {
    return onValue(ref(db, 'proprietarios'), snap => {
      const data = snap.val()
      setProprietarios(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
  }, [])

  const proprietariosById = Object.fromEntries(proprietarios.map(p => [p.id, p]))

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este imóvel?')) return
    await remove(ref(db, `imoveis/${id}`))
  }

  const handleModeloChange = async (id, modelo) => {
    await update(ref(db, `imoveis/${id}`), { modelo })
  }

  const handleStatusChange = async (id, status) => {
    await update(ref(db, `imoveis/${id}`), { status })
  }

  const handleCampoChange = async (id, campo, valor) => {
    await update(ref(db, `imoveis/${id}`), { [campo]: valor })
  }

  const handleEnderecoChange = async (id, campo, valor) => {
    const value = campo === 'cep' ? formatCEP(valor) : valor
    await update(ref(db, `imoveis/${id}/endereco`), { [campo]: value })
  }

  // Ao trocar o proprietário direto na planilha, mantém proprietarios[].imoveisIds sincronizado
  const handleProprietarioChange = async (im, novoProprietarioId) => {
    const novoProprietario = proprietarios.find(p => p.id === novoProprietarioId)
    await update(ref(db, `imoveis/${im.id}`), {
      proprietarioId: novoProprietarioId,
      proprietarioNome: novoProprietario?.nome || '',
    })
    await Promise.all(
      proprietarios
        .filter(p => (p.imoveisIds || []).includes(im.id) || p.id === novoProprietarioId)
        .map(p => {
          const tinha = (p.imoveisIds || []).includes(im.id)
          const deveTer = p.id === novoProprietarioId
          if (tinha === deveTer) return Promise.resolve()
          const novaLista = deveTer
            ? [...(p.imoveisIds || []), im.id]
            : (p.imoveisIds || []).filter(iid => iid !== im.id)
          return update(ref(db, `proprietarios/${p.id}`), { imoveisIds: novaLista })
        })
    )
  }

  const filtered = imoveis.filter(im =>
    im.codigo?.toLowerCase().includes(search.toLowerCase()) ||
    im.endereco?.rua?.toLowerCase().includes(search.toLowerCase()) ||
    (proprietariosById[im.proprietarioId]?.nome || im.proprietarioNome)?.toLowerCase().includes(search.toLowerCase())
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
          <span className="hint-text">Clique em qualquer célula para editar</span>
        </div>
        <div className="table-container table-scroll-x">
          {loading ? (
            <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
          ) : (
          <table className="imoveis-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Proprietário</th>
                <th>Modelo</th>
                <th>Status</th>
                <th>CEP</th>
                <th>Rua</th>
                <th>Número</th>
                <th>Complemento</th>
                <th>Bairro</th>
                <th>Cidade</th>
                <th>Estado</th>
                <th>UC Energia</th>
                <th>UC Água</th>
                <th>Observação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={15}>
                    <div className="empty-state">
                      <div className="es-icon">🏠</div>
                      <h3>Nenhum imóvel encontrado</h3>
                      <p>Cadastre um novo imóvel para começar.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(im => (
                <tr key={im.id}>
                  <EditableCell
                    value={im.codigo || ''}
                    display={<strong>{im.codigo || '—'}</strong>}
                    onSave={v => handleCampoChange(im.id, 'codigo', v)}
                  />
                  <EditableCell
                    value={im.proprietarioId || ''}
                    display={proprietariosById[im.proprietarioId]?.nome || im.proprietarioNome || '—'}
                    type="select"
                    options={proprietarios.map(p => ({ value: p.id, label: p.nome }))}
                    onSave={v => handleProprietarioChange(im, v)}
                  />
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
                    <select
                      className={`badge-select ${statusBadge[im.status] || 'badge-gray'}`}
                      value={im.status || ''}
                      onChange={e => handleStatusChange(im.id, e.target.value)}
                    >
                      <option value="">—</option>
                      {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <EditableCell
                    value={im.endereco?.cep || ''}
                    onSave={v => handleEnderecoChange(im.id, 'cep', v)}
                  />
                  <EditableCell
                    value={im.endereco?.rua || ''}
                    onSave={v => handleEnderecoChange(im.id, 'rua', v)}
                  />
                  <EditableCell
                    value={im.endereco?.numero || ''}
                    onSave={v => handleEnderecoChange(im.id, 'numero', v)}
                  />
                  <EditableCell
                    value={im.endereco?.complemento || ''}
                    onSave={v => handleEnderecoChange(im.id, 'complemento', v)}
                  />
                  <EditableCell
                    value={im.endereco?.bairro || ''}
                    onSave={v => handleEnderecoChange(im.id, 'bairro', v)}
                  />
                  <EditableCell
                    value={im.endereco?.cidade || ''}
                    onSave={v => handleEnderecoChange(im.id, 'cidade', v)}
                  />
                  <EditableCell
                    value={im.endereco?.estado || ''}
                    onSave={v => handleEnderecoChange(im.id, 'estado', v.toUpperCase().substring(0, 2))}
                  />
                  <EditableCell
                    value={im.ucEnergia || ''}
                    onSave={v => handleCampoChange(im.id, 'ucEnergia', v)}
                  />
                  <EditableCell
                    value={im.ucAgua || ''}
                    onSave={v => handleCampoChange(im.id, 'ucAgua', v)}
                  />
                  <EditableCell
                    value={im.observacao || ''}
                    display={<span className="table-cell-wrap">{im.observacao || '—'}</span>}
                    onSave={v => handleCampoChange(im.id, 'observacao', v)}
                  />
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-sm" onClick={() => navigate(`/imoveis/editar/${im.id}`)}>Editar</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(im.id)}>Excluir</button>
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
