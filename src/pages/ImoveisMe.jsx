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
  { value: 'fundo_reserva',    label: 'Fundo de Reserva' },
]

const SEGURO_LABELS = {
  credaluga: 'Credaluga',
  credpago:  'Credpago',
  lado_bom:  'Lado Bom Seguros',
}

const TIPOS_DEBITO = [
  'Aluguel', 'Condomínio', 'Água', 'Energia', 'Gás',
  'IPTU', 'Lixo', 'Seguro Incêndio', 'Seguro Fiança', 'Outro',
]

const STATUS_STYLE = {
  'Pago':          { bg: '#dcfce7', border: '#86efac', color: '#166534', icon: '✅' },
  'Pendente':      { bg: '#fef9c3', border: '#fde047', color: '#854d0e', icon: '⚠️' },
  'Em Negociação': { bg: '#e2883f50', border: '#8e5f22', color: '#ac602e', icon: '🤝' },
  'Acordo':        { bg: '#dbeafe', border: '#d1a044', color: '#fdd893', icon: '🤝' },
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

// Soma/subtrai meses a uma string 'YYYY-MM'
const addMonths = (ym, n) => {
  if (!ym) return ym
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${padM(d.getMonth() + 1)}`
}

// Pré-pago: contas aparecem no mês de uso (entrada → saída).
// Pós-pago: contas aparecem um mês após o uso (entrada+1 → saída+1).
const getMesRange = (inquilino) => {
  const shift = inquilino?.metodoPagamento === 'pos_pago' ? 1 : 0
  const mesInicio = inquilino?.dataEntrada ? addMonths(inquilino.dataEntrada.substring(0, 7), shift) : undefined
  const mesFim    = inquilino?.dataSaida   ? addMonths(inquilino.dataSaida.substring(0, 7), shift)   : undefined
  return { mesInicio, mesFim }
}

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
  const [regForm, setRegForm]         = useState(null)
  const [regSaving, setRegSaving]     = useState(false)
  const [obsModal, setObsModal]       = useState('')
  const [filterNome, setFilterNome]           = useState('')
  const [filterImovel, setFilterImovel]       = useState('')
  const [filterInadimplentes, setFilterInadimplentes] = useState(false)

  const closeModal = () => { setModal(null); setVarValues({}); setExtraContas([]); setRegForm(null); setObsModal('') }

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

  const filteredRows = rows.filter(({ imovel, inquilino }) => {
    if (filterNome && !inquilino.nome?.toLowerCase().includes(filterNome.toLowerCase())) return false
    if (filterImovel && !imovel.codigo?.toLowerCase().includes(filterImovel.toLowerCase())) return false
    if (filterInadimplentes) {
      const hasInadimplente = MESES.some((_, mi) => {
        const mk = `${year}-${padM(mi + 1)}`
        return inadimplencias.some(i => i.imovelId === imovel.id && i.mesReferencia === mk && i.status !== 'Pago')
      })
      if (!hasInadimplente) return false
    }
    return true
  })

  const monthKey = mi => `${year}-${padM(mi + 1)}`
  const getItems = (imovelId, mi) =>
    inadimplencias.filter(i => i.imovelId === imovelId && i.mesReferencia === monthKey(mi))

  const openModal = (row, mi) => {
    const key = monthKey(mi)
    setModal({ ...row, mi, key, items: getItems(row.imovel.id, mi) })
    const saved = valoresVariaveis[row.inquilino.id]?.[key] || {}
    const { extras, _obs, ...vals } = saved
    setVarValues(vals || {})
    setExtraContas(extras ? Object.entries(extras).map(([id, v]) => ({ id, ...v })) : [])
    setObsModal(_obs || '')
  }

  const handleVarValue = (contaKey, rawValue) => {
    setVarValues(prev => ({ ...prev, [contaKey]: rawValue }))
    if (modal?.inquilino?.id && modal?.key) {
      update(ref(db, `valoresVariaveis/${modal.inquilino.id}/${modal.key}`), {
        [contaKey]: parseFloat(rawValue) || 0,
      })
    }
  }

  const handleRemoveVarValue = (contaKey) => {
    setVarValues(prev => { const n = { ...prev }; delete n[contaKey]; return n })
    if (modal?.inquilino?.id && modal?.key) {
      update(ref(db, `valoresVariaveis/${modal.inquilino.id}/${modal.key}`), { [contaKey]: null })
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

  const handleRegSubmit = async () => {
    if (!regForm || !modal || regSaving) return
    setRegSaving(true)
    try {
      const numVal     = parseFloat(regForm.valorOriginal) || 0
      const multa      = parseFloat(regForm.multa) || 0
      const juros      = parseFloat(regForm.juros) || 0
      const valorTotal = numVal + (numVal * multa / 100) + (numVal * juros / 100)
      await push(ref(db, 'inadimplencias'), {
        inquilinoId:    modal.inquilino.id,
        inquilinoNome:  modal.inquilino.nome,
        imovelId:       modal.imovel.id,
        codigoImovel:   modal.imovel.codigo,
        tipoDebito:     regForm.tipoDebito,
        mesReferencia:  modal.key,
        dataVencimento: regForm.dataVencimento,
        garantia:       modal.inquilino.garantia || '',
        seguro:         modal.inquilino.seguro   || '',
        valorOriginal:  numVal,
        multa,
        juros,
        valorTotal,
        status:         regForm.status,
        dataPagamento:  regForm.status === 'Pago' ? (regForm.dataPagamento || '') : '',
        observacao:     regForm.observacao,
        criadoEm:       new Date().toISOString(),
      })
      setRegForm(null)
    } finally {
      setRegSaving(false)
    }
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

  const totalRecuperado = rows.reduce((a, r) =>
    a + MESES.reduce((s, _, mi) =>
      s + getItems(r.imovel.id, mi)
        .filter(i => i.status === 'Pago' && (Number(i.multa) > 0 || Number(i.juros) > 0))
        .reduce((x, i) => x + (i.valorTotal || 0), 0)
    , 0)
  , 0)

  return (
    <Layout title="🏠 Imóveis ME" subtitle="Properfy — Planilha de Pagamentos Mensais">

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
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-value" style={{ color: '#0f766e', fontSize: 16 }}>{fmtBRL(totalRecuperado)}</div>
          <div className="stat-label">Recuperado em {year}</div>
        </div>
      </div>

      {/* ── Filtros ── */}
      {!loading && rows.length > 0 && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', flexShrink: 0 }}>🔍 Filtros</span>
          <input
            type="text"
            placeholder="Nome do inquilino..."
            value={filterNome}
            onChange={e => setFilterNome(e.target.value)}
            style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, width: 180, outline: 'none' }}
          />
          <input
            type="text"
            placeholder="Código do imóvel..."
            value={filterImovel}
            onChange={e => setFilterImovel(e.target.value)}
            style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, width: 150, outline: 'none' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer', flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={filterInadimplentes}
              onChange={e => setFilterInadimplentes(e.target.checked)}
            />
            Apenas com inadimplências
          </label>
          {(filterNome || filterImovel || filterInadimplentes) && (
            <button
              onClick={() => { setFilterNome(''); setFilterImovel(''); setFilterInadimplentes(false) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, padding: 0, marginLeft: 'auto' }}
            >
              ✕ Limpar ({filteredRows.length}/{rows.length})
            </button>
          )}
        </div>
      )}

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
          ) : filteredRows.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">🔍</div>
              <h3>Nenhum resultado para os filtros</h3>
              <p>Tente ajustar os filtros acima.</p>
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
                  {filteredRows.map(({ imovel, inquilino }) => (
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
                        {fmtBRL(inquilino.valorAluguel || imovel.valorAluguel)}
                      </td>
                      {MESES.map((_, mi) => {
                        const items    = getItems(imovel.id, mi)
                        const summary  = getCellSummary(items)
                        const st       = summary ? STATUS_STYLE[summary] : null
                        const isCur    = isCurrentYear && mi === currentMonthIdx
                        const cellKey  = monthKey(mi)
                        const { mesInicio, mesFim } = getMesRange(inquilino)
                        const foraDoContrato =
                          (mesInicio && cellKey < mesInicio) ||
                          (mesFim    && cellKey > mesFim)
                        const isDesocupacao = !!(mesFim && cellKey === mesFim && inquilino.desocupacaoRegistrada)

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

                        const vv          = valoresVariaveis[inquilino.id]?.[cellKey] || {}
                        const { extras: cellExtras, ...cellVarVals } = vv
                        const aluguel      = '_aluguel' in cellVarVals ? Number(cellVarVals._aluguel) || 0 : Number(inquilino.valorAluguel || imovel.valorAluguel) || 0
                        const valorSeguro  = '_seguro'  in cellVarVals ? Number(cellVarVals._seguro)  || 0 : (inquilino.garantia === 'seguro' ? Number(inquilino.valorSeguro) || 0 : 0)
                        const valorGaragem = '_garagem' in cellVarVals ? Number(cellVarVals._garagem) || 0 : (Number(inquilino.vagas) || 0) * (Number(inquilino.valorVaga) || 0)
                        const despesas    = (inquilino.contasInclusas || []).reduce((s, k) => {
                          if (k in cellVarVals) return s + (Number(cellVarVals[k]) || 0)
                          return s + (Number(inquilino.contasValores?.[k]) || 0)
                        }, 0)
                        const extrasTotal = cellExtras
                          ? Object.values(cellExtras).reduce((s, e) => s + (Number(e.valor) || 0), 0)
                          : 0
                        const totalMes    = aluguel + despesas + valorSeguro + valorGaragem + extrasTotal

                        // 12º aluguel = mês de reajuste
                        let isReajuste = false
                        if (mesInicio) {
                          const [eY, eM] = mesInicio.split('-').map(Number)
                          const elapsed = (year - eY) * 12 + ((mi + 1) - eM)
                          isReajuste = elapsed >= 0 && elapsed % 12 === 11
                        }

                        // Contas variáveis do inquilino ainda não alteradas neste mês
                        const contasVariaveisKeys = (inquilino.contasInclusas || []).filter(k => inquilino.contasVariavel?.[k])
                        const variavelPendente = contasVariaveisKeys.length > 0 && contasVariaveisKeys.some(k => !(k in cellVarVals))

                        const cellBg = isDesocupacao
                          ? '#fee2e2'
                          : variavelPendente
                            ? '#ede9fe'
                            : summary
                              ? STATUS_STYLE[summary]?.bg
                              : isReajuste
                                ? (isCur ? '#eff6ff' : '#fffbeb')
                                : isCur
                                  ? '#eff6ff'
                                  : undefined

                        return (
                          <td
                            key={mi}
                            style={{
                              ...tdC,
                              ...(cellBg ? { background: cellBg } : {}),
                              ...(isReajuste ? { borderBottom: '2.5px solid #f59e0b' } : {}),
                              ...(isDesocupacao ? { borderLeft: '3px solid #ef4444' } : {}),
                              ...(variavelPendente && !isDesocupacao ? { borderLeft: '3px solid #a855f7' } : {}),
                            }}
                            onClick={() => openModal({ imovel, inquilino }, mi)}
                            title={isDesocupacao
                              ? 'Mês de desocupação — clique para ver detalhes'
                              : variavelPendente
                              ? 'Conta(s) de valor variável ainda não alterada(s) neste mês'
                              : isReajuste
                              ? '12º aluguel — mês de reajuste'
                              : summary
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
                              {/* Badge de reajuste */}
                              {isReajuste && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#b45309', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 4, padding: '1px 4px', whiteSpace: 'nowrap' }}>
                                  📅 reajuste
                                </span>
                              )}
                              {/* Badge de conta variável pendente */}
                              {variavelPendente && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#7c3aed', background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 4, padding: '1px 4px', whiteSpace: 'nowrap' }}>
                                  🟣 variável
                                </span>
                              )}
                              {/* Badge de desocupação */}
                              {isDesocupacao && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4, padding: '1px 4px', whiteSpace: 'nowrap' }}>
                                  🚪 saída
                                </span>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b45309' }}>
          <span style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>📅</span>
          12º aluguel (reajuste)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#991b1b' }}>
          <span style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>🚪</span>
          Mês de desocupação
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#7c3aed' }}>
          <span style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>🟣</span>
          Conta variável não alterada no mês
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
                  👤 {modal.inquilino.nome}{modal.inquilino.numeroQuarto ? <span style={{ marginLeft: 8, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, padding: '1px 7px', fontSize: 12, fontWeight: 600, color: '#475569' }}>Quarto {modal.inquilino.numeroQuarto}</span> : ''}
                </p>
                {(() => {
                  const mi = modal.mi
                  const { mesInicio: mesIni } = getMesRange(modal.inquilino)
                  if (!mesIni) return null
                  const [eY, eM] = mesIni.split('-').map(Number)
                  const elapsed = (year - eY) * 12 + ((mi + 1) - eM)
                  if (elapsed >= 0 && elapsed % 12 === 11) {
                    return (
                      <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700, color: '#b45309' }}>
                        📅 12º aluguel — mês de reajuste
                      </div>
                    )
                  }
                  return null
                })()}
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
              const aluguelBase    = Number(modal.inquilino.valorAluguel || modal.imovel.valorAluguel) || 0
              const seguroBase     = modal.inquilino.garantia === 'seguro' ? Number(modal.inquilino.valorSeguro) || 0 : 0
              const garagemBase    = (Number(modal.inquilino.vagas) || 0) * (Number(modal.inquilino.valorVaga) || 0)
              const aluguel        = '_aluguel'  in varValues ? Number(varValues._aluguel)  || 0 : aluguelBase
              const valorSeguro    = '_seguro'   in varValues ? Number(varValues._seguro)   || 0 : seguroBase
              const valorGaragem   = '_garagem'  in varValues ? Number(varValues._garagem)  || 0 : garagemBase
              const despesas       = allContas.reduce((s, { key, value }) =>
                s + (key in varValues ? Number(varValues[key]) || 0 : value), 0)
              const extrasTotal    = extraContas.reduce((s, e) => s + (parseFloat(e.valor) || 0), 0)
              const totalMes       = aluguel + despesas + valorSeguro + valorGaragem + extrasTotal
              const temVariavel    = allContas.some(c => c.isVariavel)
              const varPreenchido  = allContas.filter(c => c.isVariavel).every(c => Number(varValues[c.key]) > 0)

              const EditableRow = ({ icon, label, baseVal, vKey, showSeguro }) => {
                const hasOv      = vKey in varValues
                const curVal     = hasOv ? varValues[vKey] : String(baseVal || '')
                const isModified = hasOv && parseFloat(varValues[vKey]) !== baseVal
                const bc         = isModified ? '#fcd34d' : '#e2e8f0'
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {icon} {label}{showSeguro && modal.inquilino.seguro ? ` — ${SEGURO_LABELS[modal.inquilino.seguro] || modal.inquilino.seguro}` : ''}
                      {isModified && <span style={{ fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#b45309', borderRadius: 8, padding: '1px 6px' }}>alterado</span>}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number" step="0.01"
                        placeholder={String(baseVal || '0,00')}
                        value={curVal}
                        onChange={e => handleVarValue(vKey, e.target.value)}
                        style={{ width: 110, padding: '4px 8px', border: `1.5px solid ${bc}`, borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none', background: isModified ? '#fffbeb' : '#fff', color: isModified ? '#92400e' : '#334155', fontWeight: 600 }}
                        onFocus={e => (e.target.style.borderColor = '#f59e0b')}
                        onBlur={e  => (e.target.style.borderColor = bc)}
                      />
                      {isModified && (
                        <button onClick={() => handleRemoveVarValue(vKey)} title="Reverter" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 15, padding: '0 2px', lineHeight: 1 }}>↺</button>
                      )}
                    </div>
                  </div>
                )
              }
              return (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 11, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Composição do Valor Mensal
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <EditableRow icon="🏠" label="Aluguel"       baseVal={aluguelBase}  vKey="_aluguel" />
                    {allContas.map(({ key, label, value, isVariavel, origem }) => {
                      const hasOverride = key in varValues
                      const inputVal    = hasOverride ? varValues[key] : String(value || '')
                      const isModified  = hasOverride && parseFloat(varValues[key]) !== value
                      const borderColor = isVariavel ? '#c4b5fd' : isModified ? '#fcd34d' : '#e2e8f0'
                      const bgColor     = isVariavel ? '#faf5ff' : isModified ? '#fffbeb' : '#fff'
                      const txtColor    = isVariavel ? '#6d28d9' : isModified ? '#92400e' : '#334155'
                      return (
                        <div key={key} style={{ fontSize: 13, color: '#475569' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              📄 {label}
                              {isVariavel && (
                                <span style={{ fontSize: 10, fontWeight: 700, background: '#ede9fe', color: '#7c3aed', borderRadius: 8, padding: '1px 6px' }}>
                                  variável
                                </span>
                              )}
                              {!isVariavel && isModified && (
                                <span style={{ fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#b45309', borderRadius: 8, padding: '1px 6px' }}>
                                  alterado
                                </span>
                              )}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input
                                type="number" step="0.01"
                                placeholder={String(value || '0,00')}
                                value={inputVal}
                                onChange={e => handleVarValue(key, e.target.value)}
                                style={{
                                  width: 110, padding: '4px 8px',
                                  border: `1.5px solid ${borderColor}`, borderRadius: 6,
                                  fontSize: 13, textAlign: 'right', outline: 'none',
                                  background: bgColor, color: txtColor, fontWeight: 600,
                                }}
                                onFocus={e => (e.target.style.borderColor = isVariavel ? '#7c3aed' : '#f59e0b')}
                                onBlur={e  => (e.target.style.borderColor = borderColor)}
                              />
                              {!isVariavel && isModified && (
                                <button
                                  onClick={() => handleRemoveVarValue(key)}
                                  title="Reverter para valor padrão"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 15, padding: '0 2px', lineHeight: 1 }}
                                >↺</button>
                              )}
                            </div>
                          </div>
                          {isVariavel && origem && (
                            <div style={{ fontSize: 11, color: '#94a3b8', marginLeft: 20, marginTop: 2 }}>📍 {origem}</div>
                          )}
                        </div>
                      )
                    })}
                    {seguroBase > 0 && (
                      <EditableRow icon="🛡️" label="Seguro Fiança" baseVal={seguroBase}  vKey="_seguro"  showSeguro />
                    )}
                    {garagemBase > 0 && (
                      <EditableRow icon="🚗" label={`Garagem (${modal.inquilino.vagas} vaga${Number(modal.inquilino.vagas) > 1 ? 's' : ''})`} baseVal={garagemBase} vKey="_garagem" />
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
                    {/* observação da composição */}
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Observação</div>
                      <textarea
                        value={obsModal}
                        onChange={e => setObsModal(e.target.value)}
                        onBlur={e => {
                          e.target.style.borderColor = '#e2e8f0'
                          if (modal?.inquilino?.id && modal?.key) {
                            update(ref(db, `valoresVariaveis/${modal.inquilino.id}/${modal.key}`), { _obs: obsModal })
                          }
                        }}
                        placeholder="Anotações sobre este mês..."
                        rows={2}
                        style={{
                          width: '100%', padding: '6px 10px',
                          border: '1.5px solid #e2e8f0', borderRadius: 6,
                          fontSize: 12, resize: 'vertical', outline: 'none',
                          fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box',
                        }}
                        onFocus={e => (e.target.style.borderColor = '#94a3b8')}
                      />
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* ── Registrar Inadimplência ── */}
            {regForm && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: '#334155', marginBottom: 12 }}>📋 Registrar Inadimplência</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>Tipo de Débito *</div>
                    <select
                      value={regForm.tipoDebito}
                      onChange={e => setRegForm(p => ({ ...p, tipoDebito: e.target.value }))}
                      style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                    >
                      {TIPOS_DEBITO.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>Vencimento</div>
                    <input
                      type="date"
                      value={regForm.dataVencimento}
                      onChange={e => setRegForm(p => ({ ...p, dataVencimento: e.target.value }))}
                      style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>Valor Original (R$) *</div>
                    <input
                      type="number" step="0.01" min="0"
                      value={regForm.valorOriginal}
                      onChange={e => setRegForm(p => ({ ...p, valorOriginal: e.target.value }))}
                      style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>Status</div>
                    <select
                      value={regForm.status}
                      onChange={e => setRegForm(p => ({ ...p, status: e.target.value }))}
                      style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                    >
                      {['Pendente','Pago','Em Negociação','Protestado','Acordo'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>Multa (%)</div>
                    <input
                      type="number" step="0.01" min="0"
                      value={regForm.multa}
                      onChange={e => setRegForm(p => ({ ...p, multa: e.target.value }))}
                      style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>Juros (%)</div>
                    <input
                      type="number" step="0.01" min="0"
                      value={regForm.juros}
                      onChange={e => setRegForm(p => ({ ...p, juros: e.target.value }))}
                      style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>Observação</div>
                    <textarea
                      value={regForm.observacao}
                      onChange={e => setRegForm(p => ({ ...p, observacao: e.target.value }))}
                      rows={2} placeholder="Opcional..."
                      style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                {(() => {
                  const v = parseFloat(regForm.valorOriginal) || 0
                  const vt = v + (v * (parseFloat(regForm.multa) || 0) / 100) + (v * (parseFloat(regForm.juros) || 0) / 100)
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, background: '#eff6ff', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                      <span>Total a registrar</span>
                      <span style={{ color: '#1e40af' }}>{fmtBRL(vt)}</span>
                    </div>
                  )
                })()}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setRegForm(null)}>Cancelar</button>
                  <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleRegSubmit} disabled={regSaving}>
                    {regSaving ? 'Salvando...' : '💾 Salvar Inadimplência'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={closeModal}>Fechar</button>
              {!regForm && (
                <button
                  className="btn btn-primary"
                  style={{ width: 'auto' }}
                  onClick={() => {
                    const _aluguel     = '_aluguel' in varValues ? Number(varValues._aluguel) || 0 : Number(modal.inquilino.valorAluguel || modal.imovel.valorAluguel) || 0
                    const _allContas   = (modal.inquilino.contasInclusas || []).map(k => ({
                      key: k, value: Number(modal.inquilino.contasValores?.[k]) || 0,
                    }))
                    const _despesas    = _allContas.reduce((s, { key, value }) =>
                      s + (key in varValues ? Number(varValues[key]) || 0 : value), 0)
                    const _seguro      = '_seguro'  in varValues ? Number(varValues._seguro)  || 0 : (modal.inquilino.garantia === 'seguro' ? Number(modal.inquilino.valorSeguro) || 0 : 0)
                    const _garagem     = '_garagem' in varValues ? Number(varValues._garagem) || 0 : (Number(modal.inquilino.vagas) || 0) * (Number(modal.inquilino.valorVaga) || 0)
                    const _extrasTotal = extraContas.reduce((s, e) => s + (parseFloat(e.valor) || 0), 0)
                    const _totalMes    = _aluguel + _despesas + _seguro + _garagem + _extrasTotal
                    setRegForm({
                      tipoDebito:     'Aluguel',
                      dataVencimento: '',
                      valorOriginal:  String(_totalMes || ''),
                      multa:          '0',
                      juros:          '0',
                      status:         'Pendente',
                      observacao:     '',
                    })
                  }}
                >
                  ➕ Registrar Inadimplência
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
