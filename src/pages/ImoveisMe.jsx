import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, update, push, set, remove } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const CONTAS_OPCOES = [
  { value: 'agua',            label: 'Água' },
  { value: 'energia',         label: 'Energia' },
  { value: 'condominio',      label: 'Condomínio' },
  { value: 'gas',             label: 'Gás' },
  { value: 'iptu',            label: 'IPTU' },
  { value: 'lixo',            label: 'Lixo' },
  { value: 'seguro_incendio', label: 'Seguro Incêndio' },
]

const SEGURO_LABELS = {
  credaluga: 'Credaluga',
  credpago:  'Credpago',
  lado_bom:  'Lado Bom Seguros',
}

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
const thC = { padding: '10px 6px',  textAlign: 'center', fontWeight: 600, fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', minWidth: 88, background: '#f8fafc' }
const tdL = { padding: '10px 12px', textAlign: 'left',   verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }
const tdC = { padding: '5px 4px',   textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }

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
  const [valoresVariaveis, setValoresVariaveis] = useState({})
  const [loadedVV,  setLoadedVV]  = useState(false)
  const [modal, setModal]           = useState(null)
  const [varValues, setVarValues]   = useState({})
  const [extraContas, setExtraContas] = useState([])

  const closeModal = () => { setModal(null); setVarValues({}); setExtraContas([]) }

  const loading = !loadedIm || !loadedInq || !loadedInad || !loadedVV

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
    const u4 = onValue(ref(db, 'valoresVariaveis'), s => {
      setValoresVariaveis(s.val() || {})
      setLoadedVV(true)
    })
    return () => { u1(); u2(); u3(); u4() }
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

  const openModal = (row, mi) => {
    const key = monthKey(mi)
    setModal({ ...row, mi, key, items: getItems(row.imovel.id, mi) })
    const saved = valoresVariaveis[row.inquilino.id]?.[key] || {}
    const { extras, ...vals } = saved
    setVarValues(vals || {})
    setExtraContas(extras ? Object.entries(extras).map(([id, v]) => ({ id, ...v })) : [])
  }

  const handleVarValue = (contaKey, rawValue) => {
    setVarValues(prev => ({ ...prev, [contaKey]: rawValue }))
    if (modal?.inquilino?.id && modal?.key) {
      update(ref(db, `valoresVariaveis/${modal.inquilino.id}/${modal.key}`), {
        [contaKey]: parseFloat(rawValue) || 0,
      })
    }
  }

  const handleAddExtra = () => {
    setExtraContas(prev => [...prev, { id: null, nome: '', valor: '' }])
  }

  const handleExtraChange = (idx, field, value) => {
    setExtraContas(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  const handleExtraSave = async (idx) => {
    const extra = extraContas[idx]
    if (!extra || !extra.nome.trim() || extra.valor === '' || extra.valor === undefined) return
    const numVal = parseFloat(extra.valor)
    if (isNaN(numVal) || !modal?.inquilino?.id || !modal?.key) return
    const basePath = `valoresVariaveis/${modal.inquilino.id}/${modal.key}/extras`
    if (extra.id) {
      await update(ref(db, `${basePath}/${extra.id}`), { nome: extra.nome.trim(), valor: numVal })
    } else {
      const newRef = push(ref(db, basePath))
      await set(newRef, { nome: extra.nome.trim(), valor: numVal })
      setExtraContas(prev => prev.map((e, i) => i === idx ? { ...e, id: newRef.key } : e))
    }
  }

  const handleRemoveExtra = async (idx) => {
    const extra = extraContas[idx]
    if (extra?.id && modal?.inquilino?.id && modal?.key) {
      await remove(ref(db, `valoresVariaveis/${modal.inquilino.id}/${modal.key}/extras/${extra.id}`))
    }
    setExtraContas(prev => prev.filter((_, i) => i !== idx))
  }

  const goRegister = (imovel, inquilino, mesReferencia, valorOriginal) =>
    navigate('/inadimplentes/cadastrar', {
      state: {
        imovelId:      imovel.id,
        codigoImovel:  imovel.codigo,
        inquilinoId:   inquilino.id,
        inquilinoNome: inquilino.nome,
        mesReferencia,
        ...(valorOriginal ? { valorOriginal: String(valorOriginal) } : {}),
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
                        const items    = getItems(imovel.id, mi)
                        const summary  = getCellSummary(items)
                        const st       = summary ? STATUS_STYLE[summary] : null
                        const isCur    = isCurrentYear && mi === currentMonthIdx
                        const cellKey  = monthKey(mi)
                        const mesInicio = inquilino.dataEntrada?.substring(0, 7)
                        const mesFim    = inquilino.dataSaida?.substring(0, 7)
                        const foraDoContrato =
                          (mesInicio && cellKey < mesInicio) ||
                          (mesFim    && cellKey > mesFim)

                        if (foraDoContrato) {
                          return (
                            <td
                              key={mi}
                              style={{ ...tdC, background: '#f8fafc', cursor: 'default' }}
                              title="Fora do período do contrato"
                            >
                              <span style={{ color: '#e2e8f0', fontSize: 16, lineHeight: 1 }}>—</span>
                            </td>
                          )
                        }

                        const aluguel     = Number(imovel.valorAluguel) || 0
                        const valorSeguro = inquilino.garantia === 'seguro' ? Number(inquilino.valorSeguro) || 0 : 0
                        const vv          = valoresVariaveis[inquilino.id]?.[cellKey] || {}
                        const { extras: cellExtras, ...cellVarVals } = vv
                        const despesas    = (inquilino.contasInclusas || []).reduce((s, k) => {
                          if (inquilino.contasVariavel?.[k]) return s + (Number(cellVarVals[k]) || 0)
                          return s + (Number(inquilino.contasValores?.[k]) || 0)
                        }, 0)
                        const extrasTotal = cellExtras
                          ? Object.values(cellExtras).reduce((s, e) => s + (Number(e.valor) || 0), 0)
                          : 0
                        const totalMes    = aluguel + despesas + valorSeguro + extrasTotal

                        return (
                          <td
                            key={mi}
                            style={{ ...tdC, ...(isCur ? { background: '#eff6ff' } : {}) }}
                            onClick={() => openModal({ imovel, inquilino }, mi)}
                            title={summary
                              ? `${items.length} registro(s) — clique para ver detalhes`
                              : 'Clique para registrar conta'}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              {/* Aluguel com cor de status */}
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                background: st ? st.bg : '#f1f5f9',
                                border: `1px solid ${st ? st.border : '#e2e8f0'}`,
                                borderRadius: 5, padding: '2px 6px',
                                color: st ? st.color : '#94a3b8',
                              }}>
                                {st && <span style={{ fontSize: 9 }}>{st.icon}</span>}
                                <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {fmtBRL(aluguel)}
                                </span>
                              </div>
                              {/* Total: aluguel + contas do inquilino */}
                              {(despesas > 0 || extrasTotal > 0 || valorSeguro > 0) && (
                                <div style={{ fontSize: 10, color: '#334155', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  = {fmtBRL(totalMes)}
                                </div>
                              )}
                              {/* Sem registro: hint para adicionar */}
                              {!summary && (
                                <span style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 1 }}>+ conta</span>
                              )}
                            </div>
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
          onClick={closeModal}
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
                  👤 {modal.inquilino.nome}
                </p>
              </div>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '4px 10px', flexShrink: 0 }} onClick={closeModal}>✕</button>
            </div>

            {/* ── Composição do valor mensal ── */}
            {(() => {
              const contasInclusas = modal.inquilino.contasInclusas || []
              const allContas = contasInclusas.map(k => ({
                key:        k,
                label:      CONTAS_OPCOES.find(c => c.value === k)?.label || k,
                value:      Number(modal.inquilino.contasValores?.[k]) || 0,
                isVariavel: !!modal.inquilino.contasVariavel?.[k],
                origem:     modal.inquilino.contasOrigem?.[k] || '',
              }))
              const aluguel     = Number(modal.imovel.valorAluguel) || 0
              const valorSeguro = modal.inquilino.garantia === 'seguro' ? Number(modal.inquilino.valorSeguro) || 0 : 0
              const despesas    = allContas.reduce((s, { key, value, isVariavel }) =>
                s + (isVariavel ? Number(varValues[key]) || 0 : value), 0)
              const extrasTotal = extraContas.reduce((s, e) => s + (parseFloat(e.valor) || 0), 0)
              const totalMes    = aluguel + despesas + valorSeguro + extrasTotal
              const temVariavel = allContas.some(c => c.isVariavel)
              const varPreenchido = allContas.filter(c => c.isVariavel).every(c => Number(varValues[c.key]) > 0)
              return (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Composição do Valor Mensal
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span>🏠 Aluguel</span>
                      <span style={{ fontWeight: 600 }}>{fmtBRL(aluguel)}</span>
                    </div>
                    {allContas.map(({ key, label, value, isVariavel, origem }) => (
                      <div key={key} style={{ fontSize: 13, color: '#475569' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            📄 {label}
                            {isVariavel && (
                              <span style={{ fontSize: 10, fontWeight: 700, background: '#ede9fe', color: '#7c3aed', borderRadius: 8, padding: '1px 6px' }}>
                                variável
                              </span>
                            )}
                          </span>
                          {isVariavel ? (
                            <input
                              type="number" step="0.01" min="0"
                              placeholder="0,00"
                              value={varValues[key] ?? ''}
                              onChange={e => handleVarValue(key, e.target.value)}
                              style={{
                                width: 110, padding: '4px 8px',
                                border: '1.5px solid #c4b5fd', borderRadius: 6,
                                fontSize: 13, textAlign: 'right', outline: 'none',
                                background: '#faf5ff', color: '#6d28d9', fontWeight: 600,
                              }}
                              onFocus={e => (e.target.style.borderColor = '#7c3aed')}
                              onBlur={e => (e.target.style.borderColor = '#c4b5fd')}
                            />
                          ) : (
                            <span style={{ fontWeight: 600 }}>{value > 0 ? fmtBRL(value) : '—'}</span>
                          )}
                        </div>
                        {isVariavel && origem && (
                          <div style={{ fontSize: 11, color: '#94a3b8', marginLeft: 20, marginTop: 2 }}>📍 {origem}</div>
                        )}
                      </div>
                    ))}
                    {valorSeguro > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569' }}>
                        <span>🛡️ Seguro Fiança{modal.inquilino.seguro ? ` — ${SEGURO_LABELS[modal.inquilino.seguro] || modal.inquilino.seguro}` : ''}</span>
                        <span style={{ fontWeight: 600 }}>{fmtBRL(valorSeguro)}</span>
                      </div>
                    )}
                    {/* contas extras */}
                    {extraContas.map((extra, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ color: '#94a3b8', fontSize: 13, flexShrink: 0 }}>📋</span>
                        <input
                          type="text"
                          placeholder="Nome da conta"
                          value={extra.nome}
                          onChange={e => handleExtraChange(idx, 'nome', e.target.value)}
                          onBlur={() => handleExtraSave(idx)}
                          style={{
                            flex: 1, padding: '4px 8px', minWidth: 0,
                            border: '1.5px solid #e2e8f0', borderRadius: 6,
                            fontSize: 12, outline: 'none', background: '#fff',
                          }}
                        />
                        <input
                          type="number" step="0.01"
                          placeholder="0,00"
                          value={extra.valor}
                          onChange={e => handleExtraChange(idx, 'valor', e.target.value)}
                          onBlur={() => handleExtraSave(idx)}
                          style={{
                            width: 90, padding: '4px 8px', flexShrink: 0,
                            border: '1.5px solid #e2e8f0', borderRadius: 6,
                            fontSize: 12, textAlign: 'right', outline: 'none', background: '#fff',
                          }}
                        />
                        <button
                          onClick={() => handleRemoveExtra(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 18, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
                          title="Remover"
                        >×</button>
                      </div>
                    ))}
                    {/* botão nova conta */}
                    <button
                      onClick={handleAddExtra}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        background: 'none', border: '1.5px dashed #cbd5e1', borderRadius: 6,
                        padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: '#64748b',
                        width: '100%', marginTop: 2,
                      }}
                    >
                      ＋ Nova conta
                    </button>
                    {/* total */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 2 }}>
                      <span>= Total do Mês</span>
                      <span style={{ color: temVariavel && !varPreenchido ? '#94a3b8' : '#1e40af' }}>
                        {fmtBRL(totalMes)}
                        {temVariavel && !varPreenchido && (
                          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400, marginLeft: 4 }}>incompleto</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })()}

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
                            onClick={() => { closeModal(); navigate(`/inadimplentes/editar/${item.id}`) }}
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
              <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={closeModal}>Fechar</button>
              <button
                className="btn btn-primary"
                style={{ width: 'auto' }}
                onClick={() => {
                  const _aluguel     = Number(modal.imovel.valorAluguel) || 0
                  const _allContas   = (modal.inquilino.contasInclusas || []).map(k => ({
                    key: k, isVariavel: !!modal.inquilino.contasVariavel?.[k],
                    value: Number(modal.inquilino.contasValores?.[k]) || 0,
                  }))
                  const _despesas    = _allContas.reduce((s, { key, value, isVariavel }) =>
                    s + (isVariavel ? Number(varValues[key]) || 0 : value), 0)
                  const _seguro      = modal.inquilino.garantia === 'seguro' ? Number(modal.inquilino.valorSeguro) || 0 : 0
                  const _extrasTotal = extraContas.reduce((s, e) => s + (parseFloat(e.valor) || 0), 0)
                  const _totalMes    = _aluguel + _despesas + _seguro + _extrasTotal
                  closeModal()
                  goRegister(modal.imovel, modal.inquilino, modal.key, _totalMes || undefined)
                }}
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
