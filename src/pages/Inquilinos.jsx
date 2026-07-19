import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove, update, get } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const modeloBadge = { MA: 'badge-green', ME: 'badge-blue', ML: 'badge-yellow' }

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const CONTA_LABELS = {
  agua: 'Água', energia: 'Energia', condominio: 'Condomínio',
  gas: 'Gás', iptu: 'IPTU', lixo: 'Lixo', seguro_incendio: 'Seguro Incêndio',
}

export default function Inquilinos() {
  const navigate = useNavigate()
  const [inquilinos, setInquilinos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [desocModal, setDesocModal] = useState(null)
  const [desocDate, setDesocDate] = useState('')
  const [desocValues, setDesocValues] = useState({})
  const [desocExtras, setDesocExtras] = useState([])
  const [desocSaving, setDesocSaving] = useState(false)

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

  const getDefaultDesocValues = (inq) => {
    const vals = {}
    if (inq.valorAluguel !== undefined && inq.valorAluguel !== '')
      vals._aluguel = String(inq.valorAluguel)
    ;(inq.contasInclusas || []).forEach(k => {
      if (!inq.contasVariavel?.[k] && inq.contasValores?.[k] !== undefined)
        vals[k] = String(inq.contasValores[k])
    })
    if (inq.garantia === 'seguro' && inq.valorSeguro)
      vals._seguro = String(inq.valorSeguro)
    const garagemVal = (Number(inq.vagas) || 0) * (Number(inq.valorVaga) || 0)
    if (garagemVal > 0) vals._garagem = String(garagemVal)
    return vals
  }

  const loadDesocData = (inq, monthKey) => {
    const defaults = getDefaultDesocValues(inq)
    get(ref(db, `valoresVariaveis/${inq.id}/${monthKey}`)).then(snap => {
      if (snap.exists()) {
        const { extras, _obs, ...savedVals } = snap.val()
        const savedStr = Object.fromEntries(Object.entries(savedVals).map(([k, v]) => [k, String(v)]))
        setDesocValues({ ...defaults, ...savedStr })
        setDesocExtras(extras
          ? Object.entries(extras).map(([id, v]) => ({ id, nome: v.nome, valor: String(v.valor) }))
          : [])
      } else {
        setDesocValues(defaults)
        setDesocExtras([])
      }
    })
  }

  const closeDesocModal = () => {
    setDesocModal(null)
    setDesocDate('')
    setDesocValues({})
    setDesocExtras([])
  }

  const openDesocModal = (inq) => {
    const defaults = getDefaultDesocValues(inq)
    setDesocModal(inq)
    setDesocDate(inq.dataSaida || '')
    setDesocValues(defaults)
    setDesocExtras([])
    if (inq.dataSaida) loadDesocData(inq, inq.dataSaida.substring(0, 7))
  }

  const handleDesocDateChange = (date) => {
    setDesocDate(date)
    if (date && desocModal) {
      loadDesocData(desocModal, date.substring(0, 7))
    } else if (desocModal) {
      setDesocValues(getDefaultDesocValues(desocModal))
      setDesocExtras([])
    }
  }

  const handleDesocAddExtra = () => {
    setDesocExtras(prev => [...prev, { id: null, nome: '', valor: '' }])
  }

  const handleDesocExtraChange = (idx, field, value) => {
    setDesocExtras(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  const handleDesocRemoveExtra = (idx) => {
    setDesocExtras(prev => prev.filter((_, i) => i !== idx))
  }

  const handleDesocSave = async () => {
    if (!desocModal || !desocDate || desocSaving) return
    setDesocSaving(true)
    try {
      await update(ref(db, `inquilinos/${desocModal.id}`), { dataSaida: desocDate, desocupacaoRegistrada: true })
      const monthKey = desocDate.substring(0, 7)
      const toSave = {}
      Object.entries(desocValues).forEach(([k, v]) => {
        const n = parseFloat(v)
        if (!isNaN(n)) toSave[k] = n
      })
      const extrasObj = {}
      desocExtras.forEach((e, i) => {
        const n = parseFloat(e.valor)
        if (e.nome.trim() && !isNaN(n)) {
          extrasObj[e.id || `extra_${i}`] = { nome: e.nome.trim(), valor: n }
        }
      })
      if (Object.keys(extrasObj).length > 0) toSave.extras = extrasObj
      if (Object.keys(toSave).length > 0) {
        await update(ref(db, `valoresVariaveis/${desocModal.id}/${monthKey}`), toSave)
      }
      closeDesocModal()
    } finally {
      setDesocSaving(false)
    }
  }

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
          <b>+</b> Cadastrar Inquilino
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
                        <button className="btn btn-sm" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }} onClick={() => openDesocModal(inq)}>Desocupação</button>
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
      {desocModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={closeDesocModal}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0 }}>🚪 Cadastrar Desocupação</h3>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{desocModal.nome}</p>
              </div>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '4px 10px', flexShrink: 0 }} onClick={closeDesocModal}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 6 }}>Data de Desocupação *</label>
              <input
                type="date"
                value={desocDate}
                onChange={e => handleDesocDateChange(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            {desocDate && (() => {
              const defVals = getDefaultDesocValues(desocModal)
              const border = (key) => {
                const cur = parseFloat(desocValues[key])
                const def = parseFloat(defVals[key])
                return !isNaN(cur) && !isNaN(def) && cur !== def ? '#f59e0b' : '#fca5a5'
              }
              return (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: '#991b1b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Valores do Mês de Desocupação — {MESES[parseInt(desocDate.substring(5, 7), 10) - 1]}/{desocDate.substring(0, 4)}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>Pré-preenchido com o contrato. Borda amarela indica valor alterado.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#374151' }}>🏠 Aluguel</span>
                    <input
                      type="number" step="0.01" min="0" placeholder="0,00"
                      value={desocValues._aluguel ?? ''}
                      onChange={e => setDesocValues(p => ({ ...p, _aluguel: e.target.value }))}
                      style={{ width: 120, padding: '4px 8px', border: `1.5px solid ${border('_aluguel')}`, borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }}
                    />
                  </div>
                  {(desocModal.contasInclusas || []).map(k => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#374151' }}>📄 {CONTA_LABELS[k] || k}</span>
                      <input
                        type="number" step="0.01" min="0" placeholder="0,00"
                        value={desocValues[k] ?? ''}
                        onChange={e => setDesocValues(p => ({ ...p, [k]: e.target.value }))}
                        style={{ width: 120, padding: '4px 8px', border: `1.5px solid ${border(k)}`, borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }}
                      />
                    </div>
                  ))}
                  {desocModal.garantia === 'seguro' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#374151' }}>🛡️ Seguro Fiança</span>
                      <input
                        type="number" step="0.01" min="0" placeholder="0,00"
                        value={desocValues._seguro ?? ''}
                        onChange={e => setDesocValues(p => ({ ...p, _seguro: e.target.value }))}
                        style={{ width: 120, padding: '4px 8px', border: `1.5px solid ${border('_seguro')}`, borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }}
                      />
                    </div>
                  )}
                  {Number(desocModal.vagas) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#374151' }}>🚗 Garagem ({desocModal.vagas} vaga{Number(desocModal.vagas) > 1 ? 's' : ''})</span>
                      <input
                        type="number" step="0.01" min="0" placeholder="0,00"
                        value={desocValues._garagem ?? ''}
                        onChange={e => setDesocValues(p => ({ ...p, _garagem: e.target.value }))}
                        style={{ width: 120, padding: '4px 8px', border: `1.5px solid ${border('_garagem')}`, borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }}
                      />
                    </div>
                  )}
                  {/* Contas extras */}
                  {desocExtras.map((extra, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ color: '#94a3b8', fontSize: 13, flexShrink: 0 }}>📋</span>
                      <input
                        type="text"
                        placeholder="Nome da conta"
                        value={extra.nome}
                        onChange={e => handleDesocExtraChange(idx, 'nome', e.target.value)}
                        style={{ flex: 1, padding: '4px 8px', minWidth: 0, border: '1.5px solid #fca5a5', borderRadius: 6, fontSize: 12, outline: 'none', background: '#fff' }}
                      />
                      <input
                        type="number" step="0.01"
                        placeholder="0,00"
                        value={extra.valor}
                        onChange={e => handleDesocExtraChange(idx, 'valor', e.target.value)}
                        style={{ width: 90, padding: '4px 8px', flexShrink: 0, border: '1.5px solid #fca5a5', borderRadius: 6, fontSize: 12, textAlign: 'right', outline: 'none', background: '#fff' }}
                      />
                      <button
                        onClick={() => handleDesocRemoveExtra(idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 18, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
                        title="Remover"
                      >×</button>
                    </div>
                  ))}
                  <button
                    onClick={handleDesocAddExtra}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'none', border: '1.5px dashed #fca5a5', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: '#991b1b', width: '100%', marginTop: 4 }}
                  >
                    ＋ Nova conta
                  </button>
                </div>
              </div>
              )
            })()}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={closeDesocModal}>Cancelar</button>
              <button
                className="btn btn-primary"
                style={{ width: 'auto', background: '#ef4444', borderColor: '#ef4444' }}
                onClick={handleDesocSave}
                disabled={desocSaving || !desocDate}
              >
                {desocSaving ? 'Salvando...' : '🚪 Salvar Desocupação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

