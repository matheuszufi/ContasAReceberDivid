import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ref, push, onValue, get, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

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
  { value: 'Observação',           icon: '📝', color: '#64748b' },
  { value: 'Contato realizado',    icon: '📞', color: '#3b82f6' },
  { value: 'Notificação enviada',  icon: '📨', color: '#f59e0b' },
  { value: 'Acordo realizado',     icon: '🤝', color: '#8b5cf6' },
  { value: 'Pagamento parcial',    icon: '💰', color: '#22c55e' },
  { value: 'Encaminhado jurídico', icon: '⚖️', color: '#ef4444' },
  { value: 'Quitado',              icon: '✅', color: '#22c55e' },
  { value: 'Outros',               icon: '📌', color: '#94a3b8' },
]

const EVENTO_STATUS_MAP = {
  'Quitado':              'Pago',
  'Acordo realizado':     'Acordo',
  'Encaminhado jurídico': 'Protestado',
  'Pagamento parcial':    'Em Negociação',
}

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

  const tipoMeta = (t) => TIPOS_EVENTO.find(e => e.value === t) || TIPOS_EVENTO[TIPOS_EVENTO.length - 1]

  const handleAddEvento = async (e) => {
    e.preventDefault()
    if (!descricaoEvento.trim() || savingEvento) return
    setSavingEvento(true)
    try {
      await push(ref(db, `inadimplencias/${id}/timeline`), {
        tipo:       tipoEvento,
        descricao:  descricaoEvento.trim(),
        criadoEm:   new Date().toISOString(),
      })
      const newStatus = EVENTO_STATUS_MAP[tipoEvento]
      if (newStatus) {
        await update(ref(db, `inadimplencias/${id}`), { status: newStatus, atualizadoEm: new Date().toISOString() })
        setForm(prev => ({ ...prev, status: newStatus }))
      }
      setDescricaoEvento('')
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
                </div>
                {EVENTO_STATUS_MAP[tipoEvento] && (
                  <div className="info-banner" style={{ marginBottom: 12 }}>
                    <p style={{ margin: 0 }}>Este evento atualizará o status para <strong>{EVENTO_STATUS_MAP[tipoEvento]}</strong>.</p>
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
                          <p className="timeline-text">{evento.descricao}</p>
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
