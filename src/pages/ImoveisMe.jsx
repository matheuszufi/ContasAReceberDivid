import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const STATUS_STYLE = {
  'Pago':          { bg: '#dcfce7', border: '#86efac', color: '#166534', icon: '✅' },
  'Pendente':      { bg: '#fef9c3', border: '#fde047', color: '#854d0e', icon: '⚠️' },
  'Em Negociação': { bg: '#dbeafe', border: '#93c5fd', color: '#1e40af', icon: '🤝' },
  'Acordo':        { bg: '#dbeafe', border: '#93c5fd', color: '#1e40af', icon: '🤝' },
  'Protestado':    { bg: '#fee2e2', border: '#fca5a5', color: '#991b1b', icon: '❌' },
}

function getCellSummary(items) {
  if (!items.length) return null
  const s = items.map(i => i.status)
  if (s.includes('Protestado'))                             return 'Protestado'
  if (s.includes('Pendente'))                               return 'Pendente'
  if (s.includes('Em Negociação') || s.includes('Acordo')) return 'Em Negociação'
  return 'Pago'
}

const fmtBRL = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const padM   = n => String(n).padStart(2, '0')

const thL = { padding: '10px 12px', textAlign: 'left',   fontWeight: 600, fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }
const thC = { padding: '10px 6px',  textAlign: 'center', fontWeight: 600, fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', minWidth: 52, background: '#f8fafc' }
const tdL = { padding: '10px 12px', textAlign: 'left',   verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }
const tdC = { padding: '6px 4px',   textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }

export default function ImoveisMe() {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  const [year, setYear]             = useState(currentYear)
  const [imoveis, setImoveis]       = useState([])
  const [inquilinos, setInquilinos] = useState([])
  const [inadimplencias, setInadimplencias] = useState([])
  const [loadedIm,  setLoadedIm]  = useState(false)
  const [loadedInq, setLoadedInq] = useState(false)
  const [loadedInad, setLoadedInad] = useState(false)
  const [modal, setModal]           = useState(null)

  const loading = !loadedIm || !loadedInq || !loadedInad

  useEffect(() => {
    const u1 = onValue(ref(db, 'imoveis'), s => {
      const d = s.val()
      setImoveis(d ? Object.entries(d).map(([id, v]) => ({ id, ...v })).filter(im => im.modelo === 'ME') : [])
      setLoadedIm(true)
    })
    const u2 = onValue(ref(db, 'inquilinos'), s => {
      const d = s.val()
      setInquilinos(d ? Object.entries(d).map(([id, v]) => ({ id, ...v })) : [])
      setLoadedInq(true)
    })
    const u3 = onValue(ref(db, 'inadimplencias'), s => {
      const d = s.val()
      setInadimplencias(d ? Object.entries(d).map(([id, v]) => ({ id, ...v })) : [])
      setLoadedInad(true)
    })
    return () => { u1(); u2(); u3() }
  }, [])

  const rows = imoveis
    .map(im => ({
      imovel: im,
      inquilino: inquilinos.find(inq => inq.imovelId === im.id && inq.status !== 'Inativo'),
    }))
    .filter(r => r.inquilino)

  const monthKey = mi => `${year}-${padM(mi + 1)}`
  const getItems = (imovelId, mi) =>
    inadimplencias.filter(i => i.imovelId === imovelId && i.mesReferencia === monthKey(mi))

  const openModal = (row, mi) =>
    setModal({ ...row, mi, key: monthKey(mi), items: getItems(row.imovel.id, mi) })

  const goRegister = (imovel, inquilino, mesReferencia) =>
    navigate('/inadimplentes/cadastrar', {
      state: {
        imovelId:      imovel.id,
        codigoImovel:  imovel.codigo,
        inquilinoId:   inquilino.id,
        inquilinoNome: inquilino.nome,
        mesReferencia,
      },
    })

  const isCurrentYear   = year === currentYear
  const currentMonthIdx = new Date().getMonth()

  const totalPago = rows.reduce((a, r) =>
    a + MESES.reduce((s, _, mi) =>
      s + getItems(r.imovel.id, mi)
        .filter(i => i.status === 'Pago')
        .reduce((x, i) => x + (i.valorTotal || 0), 0)
    , 0)
  , 0)

  const totalPendente = rows.reduce((a, r) =>
    a + MESES.reduce((s, _, mi) =>
      s + getItems(r.imovel.id, mi)
        .filter(i => i.status !== 'Pago')
        .reduce((x, i) => x + (i.valorTotal || 0), 0)
    , 0)
  , 0)

  return (
    <Layout title="🏠 Imóveis ME" subtitle="Microempresa — Planilha de Pagamentos Mensais">

      {/* ── Toolbar ── */}
      <div className="actions-bar" style={{ flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setYear(y => y - 1)}>‹ {year - 1}</button>
          <span style={{ fontWeight: 700, fontSize: 20, minWidth: 56, textAlign: 'center' }}>{year}</span>
          <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setYear(y => y + 1)}>{year + 1} ›</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary"   style={{ width: 'auto' }} onClick={() => navigate('/imoveis/cadastrar')}>➕ Imóvel</button>
          <button className="btn btn-success"   style={{ width: 'auto' }} onClick={() => navigate('/inquilinos/cadastrar')}>👤 Inquilino</button>
          <button className="btn btn-secondary" style={{ width: 'auto', background: '#fef9c3', borderColor: '#fde047', color: '#854d0e' }} onClick={() => navigate('/inadimplentes/cadastrar')}>📋 Registrar Conta</button>
        </div>
      </div>

      {/* ── Cards resumo ── */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-icon">🏠</div>
          <div className="stat-value">{loading ? '…' : rows.length}</div>
          <div className="stat-label">Imóveis ME Ocupados</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value" style={{ color: '#166534', fontSize: 16 }}>{fmtBRL(totalPago)}</div>
          <div className="stat-label">Recebido em {year}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⚠️</div>
          <div className="stat-value" style={{ color: '#854d0e', fontSize: 16 }}>{fmtBRL(totalPendente)}</div>
          <div className="stat-label">Pendente em {year}</div>
        </div>
      </div>

      {/* ── Planilha ── */}
      <div className="card">
        <div className="card-header">
          <h3>Planilha de Pagamentos — {year}</h3>
          <span className="badge badge-blue">ME</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">🏠</div>
              <h3>Nenhum imóvel ME com inquilino ativo</h3>
              <p>Cadastre imóveis modelo ME e associe inquilinos para ver a planilha.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={thL}>Imóvel</th>
                    <th style={thL}>Inquilino</th>
                    <th style={{ ...thL, textAlign: 'right' }}>Aluguel</th>
                    {MESES.map((m, i) => (
                      <th key={i} style={{
                        ...thC,
                        ...(isCurrentYear && i === currentMonthIdx
                          ? { background: '#eff6ff', color: '#1d4ed8' }
                          : {}),
                      }}>
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ imovel, inquilino }) => (
                    <tr
                      key={imovel.id}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={tdL}>
                        <strong>{imovel.codigo || '—'}</strong>
                        {imovel.endereco?.rua && (
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                            {imovel.endereco.rua}{imovel.endereco.numero ? `, ${imovel.endereco.numero}` : ''}
                          </div>
                        )}
                      </td>
                      <td style={tdL}>{inquilino.nome || '—'}</td>
                      <td style={{ ...tdL, textAlign: 'right', fontWeight: 600 }}>
                        {fmtBRL(imovel.valorAluguel)}
                      </td>
                      {MESES.map((_, mi) => {
                        const items   = getItems(imovel.id, mi)
                        const summary = getCellSummary(items)
                        const st      = summary ? STATUS_STYLE[summary] : null
                        const isCur   = isCurrentYear && mi === currentMonthIdx
                        return (
                          <td
                            key={mi}
                            style={{ ...tdC, ...(isCur ? { background: '#eff6ff' } : {}) }}
                            onClick={() => openModal({ imovel, inquilino }, mi)}
                            title={summary
                              ? `${items.length} registro(s) — clique para ver detalhes`
                              : 'Clique para registrar conta'}
                          >
                            {summary ? (
                              <div style={{
                                background: st.bg, border: `1px solid ${st.border}`,
                                borderRadius: 6, padding: '3px 5px', color: st.color,
                                fontWeight: 700, fontSize: 11,
                                display: 'inline-flex', alignItems: 'center', gap: 2,
                              }}>
                                {st.icon}
                                {items.length > 1 && <span>{items.length}</span>}
                              </div>
                            ) : (
                              <span style={{ color: '#cbd5e1', fontSize: 18, lineHeight: 1 }}>+</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Legenda ── */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_STYLE)
          .filter(([l]) => l !== 'Acordo')
          .map(([label, s]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
              <span style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 4, padding: '1px 6px', color: s.color, fontWeight: 600 }}>
                {s.icon}
              </span>
              {label}
            </div>
          ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
          <span style={{ color: '#cbd5e1', fontSize: 16 }}>+</span> Não registrado
        </div>
      </div>

      {/* ── Modal detalhe do mês ── */}
      {modal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setModal(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 640, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* cabeçalho modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0 }}>{modal.imovel.codigo} — {MESES[modal.mi]}/{year}</h3>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
                  👤 {modal.inquilino.nome} &nbsp;·&nbsp; 💰 Aluguel: {fmtBRL(modal.imovel.valorAluguel)}
                </p>
              </div>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '4px 10px', flexShrink: 0 }} onClick={() => setModal(null)}>✕</button>
            </div>

            {/* registros do mês */}
            {modal.items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8' }}>
                <div style={{ fontSize: 36 }}>📋</div>
                <p>Nenhuma conta registrada para {MESES[modal.mi]}/{year}.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={thL}>Tipo</th>
                    <th style={thL}>Status</th>
                    <th style={thL}>Vencimento</th>
                    <th style={{ ...thL, textAlign: 'right' }}>Valor Total</th>
                    <th style={thL}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {modal.items.map(item => {
                    const s = STATUS_STYLE[item.status] || STATUS_STYLE['Pendente']
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={tdL}><strong>{item.tipoDebito || '—'}</strong></td>
                        <td style={tdL}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: s.bg, border: `1px solid ${s.border}`,
                            color: s.color, borderRadius: 10, padding: '2px 8px',
                            fontSize: 11, fontWeight: 600,
                          }}>
                            {s.icon} {item.status}
                          </span>
                        </td>
                        <td style={tdL}>{item.dataVencimento || '—'}</td>
                        <td style={{ ...tdL, textAlign: 'right', fontWeight: 600 }}>{fmtBRL(item.valorTotal)}</td>
                        <td style={tdL}>
                          <button
                            className="btn btn-sm"
                            onClick={() => { setModal(null); navigate(`/inadimplentes/editar/${item.id}`) }}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                    <td style={tdL} colSpan={3}>Total do mês</td>
                    <td style={{ ...tdL, textAlign: 'right' }}>
                      {fmtBRL(modal.items.reduce((s, i) => s + (i.valorTotal || 0), 0))}
                    </td>
                    <td style={tdL} />
                  </tr>
                </tbody>
              </table>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setModal(null)}>Fechar</button>
              <button
                className="btn btn-primary"
                style={{ width: 'auto' }}
                onClick={() => { setModal(null); goRegister(modal.imovel, modal.inquilino, modal.key) }}
              >
                ➕ Registrar Conta
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
