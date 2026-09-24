import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ref, push, onValue, get, update, remove } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import './CadastrarInadimplencia.css'

const TIPOS_DEBITO = [
  'Aluguel', 'Condomínio', 'Água', 'Energia', 'Gás',
  'IPTU', 'Lixo', 'Seguro Incêndio', 'Seguro Fiança', 'Outro',
]

const STATUS_OPCOES = [
  { value: 'Pendente',        badge: 'badge-yellow' },
  { value: 'Pago',            badge: 'badge-green'  },
  { value: 'Em Negociação',   badge: 'badge-blue'   },
  { value: 'Protestado',      badge: 'badge-red'    },
  { value: 'Acordo',          badge: 'badge-blue'   },
]

const initialForm = {
  inquilinoId:    '',
  inquilinoNome:  '',
  imovelId:       '',
  codigoImovel:   '',
  tipoDebito:     '',
  mesReferencia:  '',
  dataVencimento: '',
  valorOriginal:  '',
  multa:          '2',
  juros:          '1',
  status:         'Pendente',
  dataPagamento:  '',
  observacao:     '',
}

function calcTotal(original, multa, juros) {
  const v = parseFloat(original) || 0
  const m = parseFloat(multa)    || 0
  const j = parseFloat(juros)    || 0
  return v + (v * m / 100) + (v * j / 100)
}

const TIPOS_EVENTO = [
  { value: 'Observação',              icon: '📝', color: '#64748b' },
  { value: 'Contato realizado',       icon: '📞', color: '#3b82f6' },
  { value: 'Documentação solicitada', icon: '📄', color: '#eab308' },
  { value: 'Notificação enviada',     icon: '📨', color: '#f59e0b' },
  { value: 'Acordo realizado',        icon: '🤝', color: '#b191fd' },
]

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function CadastrarInadimplencia() {
  const navigate = useNavigate()
  const { id } = useParams()
  const location = useLocation()
  const isEdit = Boolean(id)

  const prefill = (!isEdit && location.state) ? location.state : {}
  const [form, setForm] = useState({ ...initialForm, ...prefill })
  const [inquilinos, setInquilinos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [tipoEvento, setTipoEvento] = useState('Observação')
  const [descricaoEvento, setDescricaoEvento] = useState('')
  const [dataAcordada, setDataAcordada] = useState('')
  const [documentosSolicitados, setDocumentosSolicitados] = useState([])
  const [documentoInput, setDocumentoInput] = useState('')
  const [savingEvento, setSavingEvento] = useState(false)

  useEffect(() => {
    return onValue(ref(db, 'inquilinos'), snap => {
      const data = snap.val()
      setInquilinos(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
  }, [])

  useEffect(() => {
    if (!isEdit) return
    get(ref(db, `inadimplencias/${id}`)).then(snap => {
      if (snap.exists()) setForm({ ...initialForm, ...snap.val() })
    })
  }, [id, isEdit])

  useEffect(() => {
    if (!isEdit) return
    return onValue(ref(db, `inadimplencias/${id}/timeline`), snap => {
      const data = snap.val()
      if (data) {
        const sorted = Object.entries(data)
          .map(([key, v]) => ({ key, ...v }))
          .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
        setTimeline(sorted)
      } else {
        setTimeline([])
      }
    })
  }, [id, isEdit])

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'status' && value !== 'Pago') {
      setForm(prev => ({ ...prev, status: value, dataPagamento: '' }))
    } else {
      setForm(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleInquilinoSelect = (e) => {
    const inquilinoId = e.target.value
    const inq = inquilinos.find(i => i.id === inquilinoId)
    setForm(prev => ({
      ...prev,
      inquilinoId,
      inquilinoNome:  inq?.nome        || '',
      imovelId:       inq?.imovelId    || '',
      codigoImovel:   inq?.codigoImovel || '',
    }))
  }

  const tipoMeta = (t) => {
    if (t === 'Acordo cumprido') return { icon: '✅', color: '#16a34a' }
    if (t === 'Acordo não cumprido') return { icon: '⚠️', color: '#dc2626' }
    return TIPOS_EVENTO.find(e => e.value === t) || TIPOS_EVENTO[0]
  }

  const handleAddDocumento = () => {
    const nome = documentoInput.trim()
    if (!nome || documentosSolicitados.includes(nome)) return
    setDocumentosSolicitados(prev => [...prev, nome])
    setDocumentoInput('')
  }

  const handleRemoveDocumento = (nome) =>
    setDocumentosSolicitados(prev => prev.filter(d => d !== nome))

  const handleDocumentoInputKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddDocumento()
    }
  }

  const handleAddEvento = async (e) => {
    e.preventDefault()
    if (!descricaoEvento.trim() || savingEvento) return
    if (tipoEvento === 'Acordo realizado' && !dataAcordada) return
    setSavingEvento(true)
    try {
      const documentos = tipoEvento === 'Documentação solicitada'
        ? [...documentosSolicitados, ...(documentoInput.trim() ? [documentoInput.trim()] : [])]
        : []
      await push(ref(db, `inadimplencias/${id}/timeline`), {
        tipo:       tipoEvento,
        descricao:  descricaoEvento.trim(),
        ...(tipoEvento === 'Acordo realizado' ? { dataAcordada } : {}),
        ...(documentos.length ? { documentos } : {}),
        criadoEm:   new Date().toISOString(),
      })
      setDescricaoEvento('')
      setDataAcordada('')
      setDocumentosSolicitados([])
      setDocumentoInput('')
    } finally {
      setSavingEvento(false)
    }
  }

  const handleAgreementStatus = async (evento, status) => {
    const statusLabel = status === 'pago' ? 'cumprido' : 'não cumprido'
    if (savingEvento || !window.confirm(`Informar que este acordo foi ${statusLabel}?`)) return
    setSavingEvento(true)
    try {
      await push(ref(db, `inadimplencias/${id}/timeline`), {
        tipo: status === 'pago' ? 'Acordo cumprido' : 'Acordo não cumprido',
        descricao: status === 'pago' ? 'Acordo realizado foi cumprido.' : 'Acordo realizado não foi cumprido.',
        acordoEventoId: evento.key,
        statusAcordo: status,
        ...(evento.dataAcordada ? { dataAcordada: evento.dataAcordada } : {}),
        criadoEm: new Date().toISOString(),
      })
    } finally {
      setSavingEvento(false)
    }
  }

  const handleContactResponse = async (evento, resposta) => {
    if (savingEvento) return
    setSavingEvento(true)
    try {
      await update(ref(db, `inadimplencias/${id}/timeline/${evento.key}`), {
        respostaContato: resposta,
        respostaContatoEm: new Date().toISOString(),
      })
    } finally {
      setSavingEvento(false)
    }
  }

  const total = calcTotal(form.valorOriginal, form.multa, form.juros)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload = {
        ...form,
        valorOriginal: parseFloat(form.valorOriginal) || 0,
        multa:         parseFloat(form.multa)         || 0,
        juros:         parseFloat(form.juros)         || 0,
        valorTotal:    total,
      }
      if (isEdit) {
        await update(ref(db, `inadimplencias/${id}`), { ...payload, atualizadoEm: new Date().toISOString() })
      } else {
        const newRef = await push(ref(db, 'inadimplencias'), { ...payload, criadoEm: new Date().toISOString() })
        await push(ref(db, `inadimplencias/${newRef.key}/timeline`), {
          tipo: 'Registro',
          descricao: `Débito registrado: ${form.tipoDebito || 'N/A'} | Valor original: R$ ${(parseFloat(form.valorOriginal) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Total com encargos: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          criadoEm: new Date().toISOString(),
        })
      }
      navigate('/inadimplentes')
    } catch (err) {
      setError('Erro ao salvar. Verifique sua conexão e tente novamente.')
      console.error(err)
    } finally { setLoading(false) }
  }

  const handleDeleteEvento = async (eventoId) => {
  if (!window.confirm('Deseja excluir este evento da timeline?')) return

  try {
    await remove(
      ref(db, `inadimplencias/${id}/timeline/${eventoId}`)
    )
  } catch (err) {
    console.error('Erro ao excluir evento:', err)
    alert('Não foi possível excluir o evento.')
  }
}

  return (
    <Layout
      title={isEdit ? 'Editar Débito' : 'Registrar Débito'}
      subtitle={isEdit ? 'Atualize os dados do débito' : 'Registre um novo débito em atraso'}
    >
      <form onSubmit={handleSubmit}>
        {error && <div className="error-msg">{error}</div>}

        {/* ── Inquilino / Imóvel ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">👤</span>
            <h3>Inquilino e Imóvel</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group fg-full">
                <label>Inquilino *</label>
                {inquilinos.length === 0 ? (
                  <div className="info-banner">
                    <p style={{ margin: 0 }}>Nenhum inquilino cadastrado. <button type="button" className="link-btn" onClick={() => navigate('/inquilinos/cadastrar')}>Cadastrar agora</button></p>
                  </div>
                ) : (
                  <select value={form.inquilinoId} onChange={handleInquilinoSelect} required>
                    <option value="">Selecione o inquilino...</option>
                    {inquilinos.map(inq => (
                      <option key={inq.id} value={inq.id}>
                        {inq.nome}{inq.codigoImovel ? ` — ${inq.codigoImovel}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label>Imóvel (preenchido automaticamente)</label>
                <input
                  value={form.codigoImovel || (form.imovelId ? '(vinculado)' : '')}
                  readOnly
                  placeholder="Selecione o inquilino para preencher"
                  style={{ background: '#f8fafc', color: '#64748b' }}
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select name="status" value={form.status} onChange={handleChange}>
                  {STATUS_OPCOES.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ── Débito ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">📋</span>
            <h3>Dados do Débito</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group">
                <label>Tipo de Débito *</label>
                <select name="tipoDebito" value={form.tipoDebito} onChange={handleChange} required>
                  <option value="">Selecione...</option>
                  {TIPOS_DEBITO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Mês de Referência</label>
                <input name="mesReferencia" type="month" value={form.mesReferencia} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Data de Vencimento *</label>
                <input name="dataVencimento" type="date" value={form.dataVencimento} onChange={handleChange} required />
              </div>
              {form.status === 'Pago' && (
                <div className="form-group">
                  <label>Data de Pagamento</label>
                  <input name="dataPagamento" type="date" value={form.dataPagamento} onChange={handleChange} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Valores ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">💰</span>
            <h3>Valores e Encargos</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group">
                <label>Valor Original (R$) *</label>
                <input name="valorOriginal" type="number" step="0.01" min="0" required value={form.valorOriginal} onChange={handleChange} placeholder="0,00" />
              </div>
              <div className="form-group">
                <label>Multa (%)</label>
                <input name="multa" type="number" step="0.01" min="0" max="100" value={form.multa} onChange={handleChange} placeholder="2" />
              </div>
              <div className="form-group">
                <label>Juros (% ao mês)</label>
                <input name="juros" type="number" step="0.01" min="0" max="100" value={form.juros} onChange={handleChange} placeholder="1" />
              </div>
              <div className="form-group">
                <label>Valor Total com Encargos</label>
                <div className="valor-total-display">
                  R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Observação ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">📝</span>
            <h3>Observação</h3>
          </div>
          <div className="form-section-body">
            <div className="form-group">
              <textarea name="observacao" value={form.observacao} onChange={handleChange}
                placeholder="Informações adicionais sobre o débito..." rows={3} />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/inadimplentes')}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Salvando...' : '💾 Salvar Débito'}
          </button>
        </div>
      </form>

      {isEdit && (
        <>
          {/* ── Adicionar Evento ── */}
          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-header">
              <h3>➕ Adicionar Evento na Timeline</h3>
            </div>
            <div className="card-body">
              <form onSubmit={handleAddEvento}>
                <div className="form-grid-2" style={{ marginBottom: 12 }}>
                  <div className="form-group">
                    <label>Tipo de Evento</label>
                    <select value={tipoEvento} onChange={e => setTipoEvento(e.target.value)}>
                      {TIPOS_EVENTO.map(t => (
                        <option key={t.value} value={t.value}>{t.icon} {t.value}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Descrição *</label>
                    <input
                      value={descricaoEvento}
                      onChange={e => setDescricaoEvento(e.target.value)}
                      placeholder="Descreva o evento ou observação..."
                      required
                    />
                  </div>
                  {tipoEvento === 'Acordo realizado' && (
                    <div className="form-group">
                      <label>Data acordada *</label>
                      <input
                        type="date"
                        value={dataAcordada}
                        onChange={e => setDataAcordada(e.target.value)}
                        required
                      />
                    </div>
                  )}
                </div>
                {tipoEvento === 'Documentação solicitada' && (
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label>Documentos Solicitados</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={documentoInput}
                        onChange={e => setDocumentoInput(e.target.value)}
                        onKeyDown={handleDocumentoInputKeyDown}
                        placeholder="Digite o nome do documento e pressione Enter..."
                      />
                      <button type="button" className="btn btn-secondary" style={{ width: 'auto', whiteSpace: 'nowrap' }} onClick={handleAddDocumento}>
                        + Adicionar
                      </button>
                    </div>
                    {documentosSolicitados.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {documentosSolicitados.map(doc => (
                          <span
                            key={doc}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde047', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}
                          >
                            {doc}
                            <button
                              type="button"
                              onClick={() => handleRemoveDocumento(doc)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#854d0e', fontWeight: 700, lineHeight: 1, padding: 0 }}
                              aria-label={`Remover ${doc}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={savingEvento}>
                    {savingEvento ? 'Salvando...' : '💾 Registrar Evento'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ── Timeline ── */}
          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-header">
              <h3>📅 Histórico ({timeline.length} evento{timeline.length !== 1 ? 's' : ''})</h3>
            </div>
            <div className="card-body">
              {timeline.length === 0 ? (
                <div className="empty-state">
                  <div className="es-icon">📋</div>
                  <h3>Nenhum evento registrado</h3>
                  <p>Adicione o primeiro evento acima.</p>
                </div>
              ) : (
                <ul className="timeline">
                  {timeline.map((evento, idx) => {
                    const meta = tipoMeta(evento.tipo)
                    const acordoResolucao = evento.tipo === 'Acordo realizado'
                      ? timeline.find(item => item.acordoEventoId === evento.key)
                      : null
                    return (
                      <li key={evento.key || idx} className="timeline-item">
                        <div className="timeline-icon" style={{ background: meta.color }}>
                          {meta.icon}
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-header">
                            <span className="timeline-tipo">{evento.tipo}</span>
                            <span className="timeline-date">{fmtDate(evento.criadoEm)}</span>
                          </div>
                          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12}}>
                            <p className="timeline-text" style={{ margin: 0 }}>
                              {evento.descricao}
                              {evento.dataAcordada && <><br /><strong>Data acordada:</strong> {new Date(`${evento.dataAcordada}T00:00:00`).toLocaleDateString('pt-BR')}</>}
                              {evento.documentos?.length > 0 && <><br /><strong>Documentos:</strong> {evento.documentos.join(', ')}</>}
                            </p>
                            <div className="timeline-actions">
                              {evento.tipo === 'Contato realizado' && !evento.respostaContato && (
                                <>
                                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleContactResponse(evento, 'sim')} disabled={savingEvento} style={{whiteSpace: 'nowrap'}}>
                                    Obteve resposta
                                  </button>
                                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleContactResponse(evento, 'nao')} disabled={savingEvento} style={{whiteSpace: 'nowrap'}}>
                                    Não obteve resposta
                                  </button>
                                </>
                              )}
                              {evento.tipo === 'Contato realizado' && evento.respostaContato && (
                                <span className="timeline-status">
                                  {evento.respostaContato === 'sim' ? 'Obteve resposta' : 'Não obteve resposta'}
                                </span>
                              )}
                              {evento.tipo === 'Acordo realizado' && !acordoResolucao && (
                                <>
                                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleAgreementStatus(evento, 'pago')} disabled={savingEvento} style={{whiteSpace: 'nowrap'}}>
                                    Informar cumprimento
                                  </button>
                                  <button type="button" className="btn btn-sm btn-danger" onClick={() => handleAgreementStatus(evento, 'nao_cumprido')} disabled={savingEvento} style={{whiteSpace: 'nowrap'}}>
                                    Informar não cumprimento
                                  </button>
                                </>
                              )}
                              {evento.tipo === 'Acordo realizado' && acordoResolucao && (
                                <span className="timeline-status">{acordoResolucao.statusAcordo === 'pago' ? 'Acordo cumprido' : 'Acordo não cumprido'}</span>
                              )}
                              <button type="button" className="btn btn-sm btn-danger" onClick={() => handleDeleteEvento(evento.key)} style={{whiteSpace: 'nowrap'}}>Excluir</button>
                            </div>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
