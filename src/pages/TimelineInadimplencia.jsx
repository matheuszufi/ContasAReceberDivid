import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ref, onValue, push, get } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const TIPOS_EVENTO = [
  { value: 'Observação',          icon: '📝', color: '#64748b' },
  { value: 'Contato realizado',   icon: '📞', color: '#3b82f6' },
  { value: 'Notificação enviada', icon: '📨', color: '#f59e0b' },
  { value: 'Acordo realizado',    icon: '🤝', color: '#8b5cf6' },
  { value: 'Pagamento parcial',   icon: '💰', color: '#22c55e' },
  { value: 'Encaminhado jurídico',icon: '⚖️', color: '#ef4444' },
  { value: 'Quitado',             icon: '✅', color: '#22c55e' },
  { value: 'Outros',              icon: '📌', color: '#94a3b8' },
]

const statusBadge = {
  'Pendente':      'badge-yellow',
  'Pago':          'badge-green',
  'Em Negociação': 'badge-blue',
  'Protestado':    'badge-red',
  'Acordo':        'badge-blue',
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function fmtMoney(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

export default function TimelineInadimplencia() {
  const navigate = useNavigate()
  const { id } = useParams()

  const [debito, setDebito] = useState(null)
  const [inquilino, setInquilino] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [tipo, setTipo] = useState('Observação')
  const [descricao, setDescricao] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsub1 = onValue(ref(db, `inadimplencias/${id}`), snap => {
      if (snap.exists()) {
        const data = snap.val()
        // Separate timeline from the rest
        const { timeline: tl, ...rest } = data
        setDebito(rest)
        if (rest.inquilinoId) {
          get(ref(db, `inquilinos/${rest.inquilinoId}`)).then(s => {
            if (s.exists()) setInquilino(s.val())
          })
        }
        if (tl) {
          const sorted = Object.entries(tl)
            .map(([key, v]) => ({ key, ...v }))
            .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
          setTimeline(sorted)
        } else {
          setTimeline([])
        }
      }
    })
    return () => unsub1()
  }, [id])

  const handleAddEvento = async (e) => {
    e.preventDefault()
    if (!descricao.trim()) return
    setSaving(true)
    try {
      await push(ref(db, `inadimplencias/${id}/timeline`), {
        tipo,
        descricao: descricao.trim(),
        criadoEm: new Date().toISOString(),
      })
      setDescricao('')
    } finally { setSaving(false) }
  }

  const tipoMeta = (t) => TIPOS_EVENTO.find(e => e.value === t) || TIPOS_EVENTO[TIPOS_EVENTO.length - 1]

  if (!debito) {
    return (
      <Layout title="Timeline" subtitle="">
        <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
      </Layout>
    )
  }

  return (
    <Layout
      title={`Timeline — ${debito.inquilinoNome || 'Débito'}`}
      subtitle={`${debito.tipoDebito || ''} ${debito.mesReferencia ? '| ' + debito.mesReferencia : ''}`}
    >
      {/* ── Info do Débito ── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h3>Resumo do Débito</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-sm" onClick={() => navigate(`/inadimplentes/editar/${id}`)}>✏️ Editar</button>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/inadimplentes')}>← Voltar</button>
          </div>
        </div>
        <div className="card-body">
          <div className="debito-info-grid">
            <div className="debito-info-item">
              <span className="dii-label">Inquilino</span>
              <span className="dii-value">{debito.inquilinoNome || '—'}</span>
            </div>
            <div className="debito-info-item">
              <span className="dii-label">Imóvel</span>
              <span className="dii-value">{debito.codigoImovel || '—'}</span>
            </div>
            <div className="debito-info-item">
              <span className="dii-label">Tipo</span>
              <span className="dii-value">{debito.tipoDebito || '—'}</span>
            </div>
            <div className="debito-info-item">
              <span className="dii-label">Vencimento</span>
              <span className="dii-value">
                {debito.dataVencimento
                  ? new Date(debito.dataVencimento + 'T00:00:00').toLocaleDateString('pt-BR')
                  : '—'}
              </span>
            </div>
            <div className="debito-info-item">
              <span className="dii-label">Valor Original</span>
              <span className="dii-value">{fmtMoney(debito.valorOriginal)}</span>
            </div>
            <div className="debito-info-item">
              <span className="dii-label">Total c/ Encargos</span>
              <span className="dii-value" style={{ fontWeight: 700, color: 'var(--danger)' }}>{fmtMoney(debito.valorTotal)}</span>
            </div>
            <div className="debito-info-item">
              <span className="dii-label">Multa / Juros</span>
              <span className="dii-value">{debito.multa || 0}% / {debito.juros || 0}% a.m.</span>
            </div>
            <div className="debito-info-item">
              <span className="dii-label">Status</span>
              <span className="dii-value">
                <span className={`badge ${statusBadge[debito.status] || 'badge-gray'}`}>{debito.status || 'Pendente'}</span>
              </span>
            </div>
            {(() => {
              const GARANTIA_LABELS = { seguro: 'Seguro Fiança', caucao: 'Caução', adiantamento: 'Adiantamento', sem_garantia: 'Sem Garantia' }
              const SEGURO_LABELS   = { credaluga: 'Credaluga', credpago: 'Credpago', lado_bom: 'Lado Bom Seguros' }
              const g = debito.garantia || inquilino?.garantia
              const s = debito.seguro   || inquilino?.seguro
              if (!g) return null
              const label = GARANTIA_LABELS[g] || g
              const full  = g === 'seguro' && s ? `${label} — ${SEGURO_LABELS[s] || s}` : label
              return (
                <div className="debito-info-item">
                  <span className="dii-label">Garantia</span>
                  <span className="dii-value" style={{ fontWeight: 600, color: g === 'seguro' ? '#7c3aed' : '#166534' }}>
                    {g === 'seguro' ? '🛡️' : '💰'} {full}
                  </span>
                </div>
              )
            })()}
          </div>
          {debito.observacao && (
            <div className="info-banner" style={{ marginTop: '12px' }}>
              <p style={{ margin: 0 }}><strong>Obs:</strong> {debito.observacao}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Adicionar Evento ── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h3>➕ Adicionar Evento</h3>
        </div>
        <div className="card-body">
          <form onSubmit={handleAddEvento}>
            <div className="form-grid-2" style={{ marginBottom: '12px' }}>
              <div className="form-group">
                <label>Tipo de Evento</label>
                <select value={tipo} onChange={e => setTipo(e.target.value)}>
                  {TIPOS_EVENTO.map(t => (
                    <option key={t.value} value={t.value}>{t.icon} {t.value}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Descrição *</label>
                <input
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                  placeholder="Descreva o evento ou observação..."
                  required
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={saving}>
                {saving ? 'Salvando...' : '💾 Registrar Evento'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="card">
        <div className="card-header">
          <h3>📅 Histórico ({timeline.length} eventos)</h3>
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
    </Layout>
  )
}
