import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, update, push, set, remove } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { House, ChevronLeft, ChevronRight, Plus, UserPlus, CircleCheck, TriangleAlert, Wallet, ListFilter, X, Repeat, Trash2 } from 'lucide-react'
 
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

const CONTA_ICONS = {
  agua:            '💧',
  energia:         '⚡',
  condominio:      '🏢',
  gas:             '🔥',
  iptu:            '🏛️',
  lixo:            '🗑️',
  seguro_incendio: '🧯',
  fundo_reserva:   '💰',
}
 
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

const isContaPagaImobiliaria = (inquilino, k) => {
  const pagador = inquilino?.contasPagador?.[k] || (inquilino?.contasVariavel?.[k] ? 'imobiliaria' : 'inquilino')
  return pagador === 'imobiliaria'
}
 
const addMonths = (ym, n) => {
  if (!ym) return ym
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${padM(d.getMonth() + 1)}`
}
 
const getMesRange = (inquilino) => {
  const shift = inquilino?.metodoPagamento === 'pos_pago' ? 1 : 0
  const mesInicio = inquilino?.dataEntrada ? addMonths(inquilino.dataEntrada.substring(0, 7), shift) : undefined
  const mesFim    = inquilino?.dataSaida   ? addMonths(inquilino.dataSaida.substring(0, 7), shift)   : undefined
  return { mesInicio, mesFim }
}
 
// Fração do mês de entrada efetivamente ocupada pelo inquilino, para cobrança proporcional do 1º aluguel
const getFracaoEntrada = (inquilino) => {
  if (!inquilino?.dataEntrada) return 1
  const [y, m, d] = inquilino.dataEntrada.split('-').map(Number)
  if (!y || !m || !d) return 1
  const diasNoMes  = new Date(y, m, 0).getDate()
  const diasUsados = Math.min(Math.max(diasNoMes - d + 1, 0), diasNoMes)
  return diasNoMes ? diasUsados / diasNoMes : 1
}

// Verifica se um mês (YYYY-MM) está dentro do período de cobrança configurado para o seguro (fiança ou incêndio)
const isMesDentroRange = (mesKey, mesInicio, mesFim) =>
  (!mesInicio || mesKey >= mesInicio) && (!mesFim || mesKey <= mesFim)
 
const thL = { padding: '10px 12px', textAlign: 'left',   fontWeight: 600, fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }
const thC = { padding: '10px 6px',  textAlign: 'center', fontWeight: 600, fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', minWidth: 88, background: '#f8fafc' }
const tdL = { padding: '10px 12px', textAlign: 'left',   verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9' }
const tdC = { padding: '5px 4px',   textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }
 
export default function ImoveisTodos() {
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
  const [contasCatalogo, setContasCatalogo] = useState([])
  const [modal, setModal]           = useState(null)
  const [varValues, setVarValues]   = useState({})
  const [registradoVar, setRegistradoVar] = useState({})
  const [extraContas, setExtraContas] = useState([])
  const [saveError, setSaveError] = useState('')
  const [regForm, setRegForm]         = useState(null)
  const [regSaving, setRegSaving]     = useState(false)
  const [obsModal, setObsModal]       = useState('')
  const [filterNome, setFilterNome]           = useState('')
  const [filterImovel, setFilterImovel]       = useState('')
  const [filterModelo, setFilterModelo]       = useState('')
  const [filterInadimplentes, setFilterInadimplentes] = useState(false)
  const [filterContasVariaveis, setFilterContasVariaveis] = useState(false)
  const [filterDesocupacao, setFilterDesocupacao] = useState(false)
  const [filterEstrangeiro, setFilterEstrangeiro] = useState(false)
  const [sortBy, setSortBy]   = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  // ---- Cobranças parceladas ----
  const [cobrancasParceladas, setCobrancasParceladas] = useState([])
  const [loadedCP, setLoadedCP] = useState(false)
  const [modalParcela, setModalParcela] = useState(false)
  const [parcelaForm, setParcelaForm] = useState({ inquilinoId: '', descricao: '', valorParcela: '', mesInicio: '', mesFim: '' })
  const [parcelaSaving, setParcelaSaving] = useState(false)
  const [inquilinoBusca, setInquilinoBusca] = useState('')
  const [inquilinoSugestoesAberta, setInquilinoSugestoesAberta] = useState(false)
 
  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  const sortArrow = (field) => sortBy === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
 
  const closeModal = () => { setModal(null); setVarValues({}); setRegistradoVar({}); setExtraContas([]); setSaveError(''); setRegForm(null); setObsModal('') }
 
  const goInquilino = (inquilinoId) => navigate(`/inquilinos/editar/${inquilinoId}`)
  const goImovel = (imovelId) => navigate(`/imoveis/editar/${imovelId}`)
 
  const loading = !loadedIm || !loadedInq || !loadedInad || !loadedVV || !loadedCP
 
  useEffect(() => {
    const u1 = onValue(ref(db, 'imoveis'), s => {
      const d = s.val()
      setImoveis(d ? Object.entries(d).map(([id, v]) => ({ id, ...v })) : [])
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
    const u5 = onValue(ref(db, 'contas'), s => {
      const d = s.val()
      setContasCatalogo(d ? Object.entries(d).map(([id, v]) => ({ id, ...v })) : [])
    })
    const u6 = onValue(ref(db, 'cobrancasParceladas'), s => {
      const d = s.val()
      setCobrancasParceladas(d ? Object.entries(d).map(([id, v]) => ({ id, ...v })) : [])
      setLoadedCP(true)
    }, err => {
      console.error('Erro ao carregar cobrancasParceladas (verifique as regras do Firebase):', err)
      setCobrancasParceladas([])
      setLoadedCP(true)
    })
    return () => { u1(); u2(); u3(); u4(); u5(); u6() }
  }, [])

  const getContaMeta = (k) => {
    const catalogConta = contasCatalogo.find(c => c.id === k)
    if (catalogConta) return { label: catalogConta.nome, icone: catalogConta.icone || '📄' }
    const legacy = CONTAS_OPCOES.find(o => o.value === k)
    return { label: legacy?.label || k, icone: CONTA_ICONS[k] || '📄' }
  }

  // Identifica a conta "Seguro Incêndio" tanto no formato antigo (chave fixa) quanto no
  // catálogo novo (resolve pelo nome), para preservar o controle de período de cobrança.
  const isSeguroIncendioKey = (k) => {
    if (k === 'seguro_incendio') return true
    const nome = (getContaMeta(k).label || '').toLowerCase()
    return nome.includes('incêndio') || nome.includes('incendio')
  }

  // Retorna as cobranças parceladas ativas para um inquilino em um determinado mês (YYYY-MM)
  const getParcelasDoMes = (inquilinoId, mesKey) =>
    cobrancasParceladas.filter(p =>
      p.inquilinoId === inquilinoId && mesKey >= p.mesInicio && mesKey <= p.mesFim
    )

  const getParcelasTotal = (inquilinoId, mesKey) =>
    getParcelasDoMes(inquilinoId, mesKey).reduce((s, p) => s + (Number(p.valorParcela) || 0), 0)
 
  const rows = imoveis
    .flatMap(im => inquilinos
      .filter(inq => inq.imovelId === im.id && inq.status !== 'Inativo')
      .map(inquilino => ({ imovel: im, inquilino }))
    )
 
  const filteredRows = rows.filter(({ imovel, inquilino }) => {
    if (filterNome && !inquilino.nome?.toLowerCase().includes(filterNome.toLowerCase())) return false
    if (filterImovel && !imovel.codigo?.toLowerCase().includes(filterImovel.toLowerCase())) return false
    if (filterModelo && imovel.modelo !== filterModelo) return false
    if (filterInadimplentes) {
      const hasInadimplente = MESES.some((_, mi) => {
        const mk = `${year}-${padM(mi + 1)}`
        return inadimplencias.some(i => i.inquilinoId === inquilino.id && i.mesReferencia === mk && i.status !== 'Pago')
      })
      if (!hasInadimplente) return false
    }
    if (filterContasVariaveis) {
      const contasDoImovel = (imovel.contasInclusas || inquilino.contasInclusas || []).filter(k => !isContaPagaImobiliaria(inquilino, k))
      const hasContaVariavel = contasDoImovel.some(k => inquilino.contasVariavel?.[k] || imovel.contasVariavel?.[k])
      // "Registrada" aqui = qualquer conta lançada em algum mês (valor fixo/variável salvo,
      // extra cadastrada ou marcada como registrada), não só quando o check "registrado" é ativado.
      const mesesInquilino = valoresVariaveis[inquilino.id] || {}
      const hasContaRegistrada = Object.values(mesesInquilino).some(mes => {
        if (!mes) return false
        const { extras, _obs, _registrado, ...vals } = mes
        if (extras && Object.keys(extras).length > 0) return true
        if (_registrado && Object.values(_registrado).some(Boolean)) return true
        if (Object.keys(vals).length > 0) return true
        return false
      })
      if (!hasContaVariavel && !hasContaRegistrada) return false
    }
    if (filterDesocupacao && !(inquilino.dataSaida || inquilino.desocupando)) return false
    if (filterEstrangeiro && !inquilino.estrangeiro) return false
    return true
  })
 
  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortBy) return 0
    const va = sortBy === 'imovel' ? (a.imovel.codigo || '') : (a.inquilino.nome || '')
    const vb = sortBy === 'imovel' ? (b.imovel.codigo || '') : (b.inquilino.nome || '')
    const cmp = va.localeCompare(vb, 'pt-BR', { sensitivity: 'base' })
    return sortDir === 'asc' ? cmp : -cmp
  })
 
  const monthKey = mi => `${year}-${padM(mi + 1)}`
  const getItems = (inquilinoId, mi) =>
    inadimplencias.filter(i => i.inquilinoId === inquilinoId && i.mesReferencia === monthKey(mi))
 
  const getTotalMes = (imovel, inquilino, mi) => {
    const cellKey = monthKey(mi)
    const { mesInicio, mesFim } = getMesRange(inquilino)
    if ((mesInicio && cellKey < mesInicio) || (mesFim && cellKey > mesFim)) return 0
    const vv = valoresVariaveis[inquilino.id]?.[cellKey] || {}
    const { extras: cellExtras, ...cellVarVals } = vv
    const aluguelCheio = Number(inquilino.valorAluguel || imovel.valorAluguel) || 0
    const aluguel      = '_aluguel' in cellVarVals ? Number(cellVarVals._aluguel) || 0 : (cellKey === mesInicio ? aluguelCheio * getFracaoEntrada(inquilino) : aluguelCheio)
    const valorSeguro  = '_seguro'  in cellVarVals ? Number(cellVarVals._seguro)  || 0 : ((inquilino.garantia === 'seguro' && isMesDentroRange(cellKey, inquilino.seguroFiancaMesInicio, inquilino.seguroFiancaMesFim)) ? Number(inquilino.valorSeguro) || 0 : 0)
    const valorGaragem = '_garagem' in cellVarVals ? Number(cellVarVals._garagem) || 0 : (Number(inquilino.vagas) || 0) * (Number(inquilino.valorVaga) || 0)
    const valorGarantia = (inquilino.garantia === 'caucao' || inquilino.garantia === 'adiantamento') && cellKey === mesInicio ? Number(inquilino.valorGarantia) || 0 : 0
    const contasDoImovel = (imovel.contasInclusas || inquilino.contasInclusas || [])
    const despesas = contasDoImovel.reduce((s, k) => {
      if (isContaPagaImobiliaria(inquilino, k)) return s
      if (isSeguroIncendioKey(k) && !isMesDentroRange(cellKey, inquilino.seguroIncendioMesInicio, inquilino.seguroIncendioMesFim)) return s
      if (k in cellVarVals) return s + (Number(cellVarVals[k]) || 0)
      return s + (Number(inquilino.contasValores?.[k]) || 0)
    }, 0)
    const extrasTotal = cellExtras ? Object.values(cellExtras).reduce((s, e) => s + (Number(e.valor) || 0), 0) : 0
    const parcelasTotal = getParcelasTotal(inquilino.id, cellKey)
    return aluguel + despesas + valorSeguro + valorGaragem + valorGarantia + extrasTotal + parcelasTotal
  }
 
  const monthTotals = MESES.map((_, mi) =>
    sortedRows.reduce((s, { imovel, inquilino }) => s + getTotalMes(imovel, inquilino, mi), 0)
  )
 
  const openModal = (row, mi) => {
    const key = monthKey(mi)
    setModal({ ...row, mi, key, items: getItems(row.inquilino.id, mi) })
    const saved = valoresVariaveis[row.inquilino.id]?.[key] || {}
    const { extras, _obs, _registrado, ...vals } = saved
    console.log('[openModal] inquilino', row.inquilino.id, 'mes', key, 'dados carregados:', saved)
    setVarValues(vals || {})
    setRegistradoVar(_registrado || {})
    setExtraContas(extras ? Object.entries(extras).map(([id, v]) => ({ id, ...v })) : [])
    setObsModal(_obs || '')
  }
 
  const handleVarValue = (contaKey, rawValue) => {
    setVarValues(prev => ({ ...prev, [contaKey]: rawValue }))
    if (modal?.inquilino?.id && modal?.key) {
      update(ref(db, `valoresVariaveis/${modal.inquilino.id}/${modal.key}`), {
        [contaKey]: parseFloat(rawValue) || 0,
      }).catch(err => { console.error('Erro ao salvar valor:', err); setSaveError(`Erro ao salvar: ${err.message}`) })
    }
  }
 
  const handleRemoveVarValue = (contaKey) => {
    setVarValues(prev => { const n = { ...prev }; delete n[contaKey]; return n })
    if (modal?.inquilino?.id && modal?.key) {
      update(ref(db, `valoresVariaveis/${modal.inquilino.id}/${modal.key}`), { [contaKey]: null })
        .catch(err => { console.error('Erro ao reverter valor:', err); setSaveError(`Erro ao salvar: ${err.message}`) })
    }
  }
 
  const handleAddExtra = () => {
    const newId = push(ref(db)).key
    setExtraContas(prev => [...prev, { id: newId, contaId: '', nome: '', valor: '', registrado: false }])
  }

  const saveExtra = async (idx, extra) => {
    if (!extra || !modal?.inquilino?.id || !modal?.key) {
      console.warn('[saveExtra] abortado: faltam dados', { extra, inquilinoId: modal?.inquilino?.id, mes: modal?.key })
      return
    }
    const hasIdentity = Boolean(extra.id || extra.contaId || extra.nome)
    if (!hasIdentity) {
      console.warn('[saveExtra] abortado: sem identidade (contaId/nome/id vazios)', extra)
      return
    }
    const numVal = extra.valor === '' || extra.valor === undefined || extra.valor === null ? 0 : parseFloat(extra.valor)
    if (Number.isNaN(numVal)) {
      console.warn('[saveExtra] abortado: valor inválido', extra.valor)
      return
    }
    const basePath = `valoresVariaveis/${modal.inquilino.id}/${modal.key}/extras`
    const finalId = extra.id || push(ref(db, basePath)).key
    const payload = { contaId: extra.contaId || '', nome: extra.nome || '', valor: numVal, registrado: !!extra.registrado }
    console.log('[saveExtra] gravando em', `${basePath}/${finalId}`, payload)
    try {
      await set(ref(db, `${basePath}/${finalId}`), payload)
      console.log('[saveExtra] gravado com sucesso em', `${basePath}/${finalId}`)
      setSaveError('')
      if (finalId !== extra.id) {
        setExtraContas(prev => prev.map((e, i) => i === idx ? { ...e, id: finalId } : e))
      }
    } catch (err) {
      console.error('[saveExtra] ERRO ao salvar conta extra:', err)
      setSaveError(`Erro ao salvar conta: ${err.message}`)
      window.alert(`Falha ao salvar conta extra no Firebase:\n${err.message}`)
    }
  }

  const handleExtraChange = (idx, field, value) => {
    const next = extraContas.map((e, i) => i === idx ? { ...e, [field]: value } : e)
    setExtraContas(next)
    if (['valor', 'contaId', 'nome'].includes(field)) {
      saveExtra(idx, next[idx])
    }
  }

  const handleExtraSave = (idx) => saveExtra(idx, extraContas[idx])

  const handleExtraContaChange = (idx, contaId) => {
    const conta = contasCatalogo.find(c => c.id === contaId)
    const nome = conta?.nome || ''
    const next = extraContas.map((e, i) => i === idx ? { ...e, contaId, nome } : e)
    setExtraContas(next)
    saveExtra(idx, next[idx])
  }

  const handleRemoveExtra = async (idx) => {
    const extra = extraContas[idx]
    if (extra?.id && modal?.inquilino?.id && modal?.key) {
      try {
        await remove(ref(db, `valoresVariaveis/${modal.inquilino.id}/${modal.key}/extras/${extra.id}`))
      } catch (err) {
        console.error('Erro ao remover conta extra:', err)
        setSaveError(`Erro ao remover conta: ${err.message}`)
      }
    }
    setExtraContas(prev => prev.filter((_, i) => i !== idx))
  }

  const handleExtraToggleRegistrado = (idx) => {
    const next = extraContas.map((e, i) => i === idx ? { ...e, registrado: !e.registrado } : e)
    setExtraContas(next)
    console.log('[handleExtraToggleRegistrado] idx', idx, 'novo estado local:', next[idx])
    saveExtra(idx, next[idx])
  }

  const handleToggleRegistradoVar = (k) => {
    const novo = !registradoVar[k]
    setRegistradoVar(prev => ({ ...prev, [k]: novo }))
    if (modal?.inquilino?.id && modal?.key) {
      update(ref(db, `valoresVariaveis/${modal.inquilino.id}/${modal.key}/_registrado`), { [k]: novo })
        .catch(err => { console.error('Erro ao registrar conta:', err); setSaveError(`Erro ao salvar: ${err.message}`) })
    }
  }

  const handleMarkAllRegistrado = () => {
    const varKeysAtual = modal
      ? (modal.inquilino.contasInclusas || []).filter(k => modal.inquilino.contasVariavel?.[k] && !isContaPagaImobiliaria(modal.inquilino, k))
      : []
    const fixedKeys = []
    if (modal) {
      const { mesInicio: modalMesInicio } = getMesRange(modal.inquilino)
      const seguroBase   = (modal.inquilino.garantia === 'seguro' && isMesDentroRange(modal.key, modal.inquilino.seguroFiancaMesInicio, modal.inquilino.seguroFiancaMesFim)) ? Number(modal.inquilino.valorSeguro) || 0 : 0
      const garagemBase  = (Number(modal.inquilino.vagas) || 0) * (Number(modal.inquilino.valorVaga) || 0)
      const garantiaBase = (modal.inquilino.garantia === 'caucao' || modal.inquilino.garantia === 'adiantamento') && modal.key === modalMesInicio ? Number(modal.inquilino.valorGarantia) || 0 : 0
      if (seguroBase > 0) fixedKeys.push('_seguro')
      if (garagemBase > 0) fixedKeys.push('_garagem')
      if (garantiaBase > 0) fixedKeys.push('_garantia')
    }
    const allKeys = [...varKeysAtual, ...fixedKeys]
    const allRegistrado = extraContas.every(e => e.registrado) && allKeys.every(k => registradoVar[k])
    const novoValor = !allRegistrado

    const nextExtras = extraContas.map(e => ({ ...e, registrado: novoValor }))
    setExtraContas(nextExtras)
    nextExtras.forEach((e, i) => saveExtra(i, e))

    if (allKeys.length && modal?.inquilino?.id && modal?.key) {
      const patch = {}
      allKeys.forEach(k => { patch[k] = novoValor })
      setRegistradoVar(prev => ({ ...prev, ...patch }))
      update(ref(db, `valoresVariaveis/${modal.inquilino.id}/${modal.key}/_registrado`), patch)
        .catch(err => { console.error('Erro ao marcar todas:', err); setSaveError(`Erro ao salvar: ${err.message}`) })
    }
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

  // ---- Cobranças parceladas: salvar / remover ----
  const handleSaveParcela = async () => {
    if (!parcelaForm.inquilinoId || !parcelaForm.valorParcela || !parcelaForm.mesInicio || !parcelaForm.mesFim) return
    if (parcelaForm.mesFim < parcelaForm.mesInicio) return
    setParcelaSaving(true)
    try {
      const inquilino = inquilinos.find(i => i.id === parcelaForm.inquilinoId)
      await push(ref(db, 'cobrancasParceladas'), {
        inquilinoId:  parcelaForm.inquilinoId,
        imovelId:     inquilino?.imovelId || '',
        descricao:    parcelaForm.descricao || 'Cobrança parcelada',
        valorParcela: parseFloat(parcelaForm.valorParcela) || 0,
        mesInicio:    parcelaForm.mesInicio,
        mesFim:       parcelaForm.mesFim,
        criadoEm:     new Date().toISOString(),
      })
      setParcelaForm({ inquilinoId: '', descricao: '', valorParcela: '', mesInicio: '', mesFim: '' })
      setInquilinoBusca('')
    } finally {
      setParcelaSaving(false)
    }
  }

  const handleRemoveParcela = async (id) => {
    try {
      await remove(ref(db, `cobrancasParceladas/${id}`))
    } catch (err) {
      console.error('Erro ao remover cobrança parcelada:', err)
    }
  }

  const closeModalParcela = () => {
    setModalParcela(false)
    setParcelaForm({ inquilinoId: '', descricao: '', valorParcela: '', mesInicio: '', mesFim: '' })
    setInquilinoBusca('')
    setInquilinoSugestoesAberta(false)
  }
 
  const isCurrentYear   = year === currentYear
  const currentMonthIdx = new Date().getMonth()
 
  const totalPago = rows.reduce((a, r) =>
    a + MESES.reduce((s, _, mi) =>
      s + getItems(r.inquilino.id, mi)
        .filter(i => i.status === 'Pago')
        .reduce((x, i) => x + (i.valorTotal || 0), 0)
    , 0)
  , 0)
 
  const totalPendente = rows.reduce((a, r) =>
    a + MESES.reduce((s, _, mi) =>
      s + getItems(r.inquilino.id, mi)
        .filter(i => i.status !== 'Pago')
        .reduce((x, i) => x + (i.valorTotal || 0), 0)
    , 0)
  , 0)
 
  const totalRecuperado = rows.reduce((a, r) =>
    a + MESES.reduce((s, _, mi) =>
      s + getItems(r.inquilino.id, mi)
        .filter(i => i.status === 'Pago')
        .reduce((x, i) => x + (i.valorTotal || 0), 0)
    , 0)
  , 0)
 
  return (
    <Layout title="Planilha Imóveis" subtitle="Omie — Planilha de Pagamentos Mensais">

      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setYear(y => y - 1)}><ChevronLeft /></Button>
          <span className="min-w-14 text-center text-xl font-bold">{year}</span>
          <Button variant="outline" size="icon" onClick={() => setYear(y => y + 1)}><ChevronRight /></Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/imoveis/cadastrar')}><Plus /> Imóvel</Button>
          <Button variant="secondary" onClick={() => navigate('/inquilinos/cadastrar')}><UserPlus /> Inquilino</Button>
          <Button variant="secondary" onClick={() => setModalParcela(true)}><Repeat /> Cobrança Parcelada</Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <House className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{loading ? '…' : rows.length}</p>
              <p className="truncate text-sm text-muted-foreground">Imóveis ocupados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <CircleCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold tracking-tight">{fmtBRL(totalPago)}</p>
              <p className="truncate text-sm text-muted-foreground">Recebido em {year}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <TriangleAlert className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold tracking-tight">{fmtBRL(totalPendente)}</p>
              <p className="truncate text-sm text-muted-foreground">Pendente em {year}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600">
              <Wallet className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold tracking-tight">{fmtBRL(totalRecuperado)}</p>
              <p className="truncate text-sm text-muted-foreground">Recuperado em {year}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {!loading && rows.length > 0 && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}><ListFilter size={14} /> Filtros</span>
          <input
            type="text"
            placeholder="Nome do inquilino..."
            value={filterNome}
            onChange={e => setFilterNome(e.target.value)}
            style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, width: 180, outline: 'none' }}
          />
          <input
            type="text"
            placeholder="Imóvel..."
            value={filterImovel}
            onChange={e => setFilterImovel(e.target.value)}
            style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, width: 150, outline: 'none' }}
          />
          <select
            value={filterModelo}
            onChange={e => setFilterModelo(e.target.value)}
            style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', color: '#334155' }}
          >
            <option value="">Todos os modelos</option>
            <option value="MA">MA</option>
            <option value="ME">ME</option>
            <option value="ML">ML</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer', flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={filterInadimplentes}
              onChange={e => setFilterInadimplentes(e.target.checked)}
            />
            Apenas com inadimplências
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer', flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={filterContasVariaveis}
              onChange={e => setFilterContasVariaveis(e.target.checked)}
            />
            Apenas com contas registradas/contas variáveis
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer', flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={filterDesocupacao}
              onChange={e => setFilterDesocupacao(e.target.checked)}
            />
            Apenas com desocupação
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer', flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={filterEstrangeiro}
              onChange={e => setFilterEstrangeiro(e.target.checked)}
            />
            Apenas estrangeiros
          </label>
          {(filterNome || filterImovel || filterModelo || filterInadimplentes || filterContasVariaveis || filterDesocupacao || filterEstrangeiro) && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground"
              onClick={() => { setFilterNome(''); setFilterImovel(''); setFilterModelo(''); setFilterInadimplentes(false); setFilterContasVariaveis(false); setFilterDesocupacao(false); setFilterEstrangeiro(false) }}
            >
              <X /> Limpar ({filteredRows.length}/{rows.length})
            </Button>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 border-b pb-4">
          <CardTitle className="text-lg">Planilha de Pagamentos — {year}</CardTitle>
          <Badge variant="secondary">Todos</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">🏠</div>
              <h3>Nenhum imóvel com inquilino ativo</h3>
              <p>Cadastre imóveis e associe inquilinos para ver a planilha.</p>
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
                    <th style={{ ...thL, textAlign: 'center', width: 44 }}></th>
                    <th style={thL}></th>
                    <th style={thL}></th>
                    <th style={{ ...thL, textAlign: 'right' }}>Total do mês</th>
                    {MESES.map((_, i) => (
                      <th key={i} style={{
                        ...thC,
                        ...(isCurrentYear && i === currentMonthIdx
                          ? { background: '#eff6ff', color: '#1d4ed8' }
                          : {}),
                      }}>
                        {fmtBRL(monthTotals[i])}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th style={{ ...thL, textAlign: 'center', width: 44 }}></th>
                    <th style={{ ...thL, cursor: 'pointer' }} onClick={() => toggleSort('imovel')}>Imóvel{sortArrow('imovel')}</th>
                    <th style={{ ...thL, cursor: 'pointer' }} onClick={() => toggleSort('inquilino')}>Inquilino{sortArrow('inquilino')}</th>
                    <th style={{ ...thL, textAlign: 'center' }}>Modelo</th>
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
                  {sortedRows.map(({ imovel, inquilino }) => (
                    <tr
                      key={`${imovel.id}-${inquilino.id}`}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ ...tdC, cursor: 'default' }}>
                        {inquilino.codigoContrato && (
                          <a
                            href={`https://sistema.divid.com.br/rental/contract/view/${inquilino.codigoContrato}#financial-statement`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir contrato no Divid"
                            onClick={e => e.stopPropagation()}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 26, height: 26, borderRadius: 6,
                              background: '#eff6ff', border: '1px solid #bfdbfe',
                              color: '#1d4ed8', textDecoration: 'none', fontSize: 13,
                            }}
                          >
                            🔗
                          </a>
                        )}
                      </td>
                      <td
                        style={{ ...tdL, cursor: 'pointer' }}
                        onClick={() => goImovel(imovel.id)}
                        title="Ver cadastro do imóvel"
                      >
                        <strong style={{ color: '#1d4ed8' }}>{imovel.codigo || '—'}</strong>
                      </td>
                      <td
                        style={{ ...tdL, cursor: 'pointer', color: '#1d4ed8' }}
                        onClick={() => goInquilino(inquilino.id)}
                        title="Ver cadastro do inquilino"
                      >
                        {inquilino.nome || '—'}
                      </td>
                      <td style={{ ...tdL, textAlign: 'center' }}>
                        {imovel.modelo ? <Badge variant="outline">{imovel.modelo}</Badge> : '—'}
                      </td>
                      {MESES.map((_, mi) => {
                        const items    = getItems(inquilino.id, mi)
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
                        const { extras: cellExtras, _registrado: cellRegistradoVar, ...cellVarVals } = vv
                        const aluguelCheio = Number(inquilino.valorAluguel || imovel.valorAluguel) || 0
                        const aluguel      = '_aluguel' in cellVarVals ? Number(cellVarVals._aluguel) || 0 : (cellKey === mesInicio ? aluguelCheio * getFracaoEntrada(inquilino) : aluguelCheio)
                        const valorSeguro  = '_seguro'  in cellVarVals ? Number(cellVarVals._seguro)  || 0 : ((inquilino.garantia === 'seguro' && isMesDentroRange(cellKey, inquilino.seguroFiancaMesInicio, inquilino.seguroFiancaMesFim)) ? Number(inquilino.valorSeguro) || 0 : 0)
                        const valorGaragem = '_garagem' in cellVarVals ? Number(cellVarVals._garagem) || 0 : (Number(inquilino.vagas) || 0) * (Number(inquilino.valorVaga) || 0)
                        const valorGarantia = (inquilino.garantia === 'caucao' || inquilino.garantia === 'adiantamento') && cellKey === mesInicio ? Number(inquilino.valorGarantia) || 0 : 0
                        const despesas    = (inquilino.contasInclusas || []).reduce((s, k) => {
                          if (isContaPagaImobiliaria(inquilino, k)) return s
                          if (isSeguroIncendioKey(k) && !isMesDentroRange(cellKey, inquilino.seguroIncendioMesInicio, inquilino.seguroIncendioMesFim)) return s
                          if (k in cellVarVals) return s + (Number(cellVarVals[k]) || 0)
                          return s + (Number(inquilino.contasValores?.[k]) || 0)
                        }, 0)
                        const extrasTotal = cellExtras
                          ? Object.values(cellExtras).reduce((s, e) => s + (Number(e.valor) || 0), 0)
                          : 0
                        const extrasPendentes = cellExtras ? Object.values(cellExtras).filter(e => !e.registrado) : []
                        const parcelas       = getParcelasDoMes(inquilino.id, cellKey)
                        const parcelasTotal  = parcelas.reduce((s, p) => s + (Number(p.valorParcela) || 0), 0)
                        const totalMes    = aluguel + despesas + valorSeguro + valorGaragem + valorGarantia + extrasTotal + parcelasTotal
 
                        let isReajuste = false
                        if (mesInicio) {
                          const [eY, eM] = mesInicio.split('-').map(Number)
                          const elapsed = (year - eY) * 12 + ((mi + 1) - eM)
                          isReajuste = elapsed >= 0 && elapsed % 12 === 11
                        }
 
                        const contasVariaveisKeys = (imovel.contasInclusas || inquilino.contasInclusas || []).filter(k => (inquilino.contasVariavel?.[k] || imovel.contasVariavel?.[k]) && !isContaPagaImobiliaria(inquilino, k))
                        const contasVariaveisPendentes = contasVariaveisKeys.filter(k => !cellRegistradoVar?.[k])
                        const variavelPendente = contasVariaveisPendentes.length > 0 && contasVariaveisPendentes.some(k => !(k in cellVarVals))
                        const variavelZerada   = contasVariaveisPendentes.length > 0 && contasVariaveisPendentes.some(k => (k in cellVarVals) && (Number(cellVarVals[k]) === 0))
                        const variavelAlerta   = variavelPendente || variavelZerada
                        const pendentesNomes = contasVariaveisPendentes
                          .filter(k => !(k in cellVarVals) || Number(cellVarVals[k]) === 0)
                          .map(k => getContaMeta(k).label)
                        const temExtra = extrasPendentes.length > 0
                        const seguroPendente   = valorSeguro   > 0 && !cellRegistradoVar?._seguro
                        const garagemPendente  = valorGaragem  > 0 && !cellRegistradoVar?._garagem
                        const garantiaPendente = valorGarantia > 0 && !cellRegistradoVar?._garantia
 
                        const hasPendingInadimplencia = items.some(i => (i.status || '').toLowerCase() !== 'pago')
                        const hasSeguroAprovado = items.some(i => i.seguroAcionado === 'pagamento_aprovado')
                        const hasSeguroNaoAprovado = items.some(i => i.seguroAcionado && i.seguroAcionado !== 'pagamento_aprovado')
                        const isCellGreen = items.length > 0 && !hasPendingInadimplencia && (items.some(i => (i.status || '').toLowerCase() === 'pago') || hasSeguroAprovado)
                        const isCellYellow = items.length > 0 && !isCellGreen && (hasPendingInadimplencia || hasSeguroNaoAprovado)
                        const rentBadge = isCellGreen
                          ? { bg: '#dcfce7', border: '#86efac', color: '#166534', icon: '✅' }
                          : isCellYellow
                            ? { bg: '#fee2e2', border: '#fca5a5', color: '#991b1b', icon: '' }
                            : { bg: '#f1f5f9', border: '#e2e8f0', color: '#94a3b8', icon: '' }
 
                        const cellBg = isDesocupacao
                          ? '#cbd5e1'
                          : variavelAlerta
                            ? '#ede9fe'
                            : isCellGreen
                              ? '#dcfce7'
                              : isCellYellow
                                ? '#fee2e2'
                                : summary
                                  ? STATUS_STYLE[summary]?.bg
                                  : isReajuste
                                    ? (isCur ? '#eff6ff' : '#fffbeb')
                                    : isCur
                                      ? '#eff6ff'
                                      : temExtra
                                        ? '#fff7ed'
                                        : undefined
 
                        return (
                          <td
                            key={mi}
                            style={{
                              ...tdC,
                              ...(cellBg ? { background: cellBg } : {}),
                              ...(isReajuste ? { borderBottom: '2.5px solid #f59e0b' } : {}),
                              ...(isDesocupacao ? { borderLeft: '3px solid #ef4444' } : {}),
                              ...(variavelAlerta && !isDesocupacao ? { borderLeft: '3px solid #a855f7' } : {}),
                              ...(temExtra ? { borderRight: '3px solid #f97316' } : {}),
                            }}
                            onClick={() => openModal({ imovel, inquilino }, mi)}
                            title={isDesocupacao
                              ? 'Mês de desocupação — clique para ver detalhes'
                              : variavelPendente
                              ? `Falta lançar: ${pendentesNomes.join(', ')}`
                              : variavelZerada
                              ? `Valor zerado em: ${pendentesNomes.join(', ')}`
                              : isReajuste
                              ? '12º aluguel — mês de reajuste'
                              : summary
                                ? `${items.length} registro(s) — clique para detalhes`
                                : 'Clique para registrar conta'}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                background: rentBadge.bg,
                                border: `1px solid ${rentBadge.border}`,
                                borderRadius: 5, padding: '2px 6px',
                                color: rentBadge.color,
                              }}>
                                {rentBadge.icon && <span style={{ fontSize: 9 }}>{rentBadge.icon}</span>}
                                <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {fmtBRL(totalMes)}
                                </span>
                              </div>
                              {(contasVariaveisPendentes.length > 0 || temExtra || seguroPendente || garagemPendente || garantiaPendente || parcelas.length > 0) && (
                                <div style={{ display: 'flex', gap: 3, fontSize: 10, lineHeight: 1 }}>
                                  {contasVariaveisPendentes.map(k => {
                                    const pendente = !(k in cellVarVals) || Number(cellVarVals[k]) === 0
                                    const { label, icone } = getContaMeta(k)
                                    return (
                                      <span
                                        key={k}
                                        title={label}
                                        style={{ opacity: pendente ? 0.4 : 1 }}
                                      >
                                        {icone}
                                      </span>
                                    )
                                  })}
                                  {seguroPendente && (
                                    <span title="Seguro Fiança (não registrado)">🛡️</span>
                                  )}
                                  {garagemPendente && (
                                    <span title="Garagem (não registrada)">🚗</span>
                                  )}
                                  {garantiaPendente && (
                                    <span title={`${inquilino.garantia === 'caucao' ? 'Caução' : 'Adiantamento'} (não registrado)`}>🔒</span>
                                  )}
                                  {extrasPendentes.map((extra, i) => {
                                    const icone = contasCatalogo.find(c => c.id === extra.contaId)?.icone || '📋'
                                    return (
                                      <span key={i} title={`Conta extra (não registrada): ${extra.nome || 'sem nome'}`}>
                                        {icone}
                                      </span>
                                    )
                                  })}
                                  {parcelas.length > 0 && (
                                    <span title={parcelas.map(p => `${p.descricao} (${fmtBRL(p.valorParcela)})`).join(', ')}>
                                      🧾
                                    </span>
                                  )}
                                </div>
                              )}
                              {isReajuste && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#b45309', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 4, padding: '1px 4px', whiteSpace: 'nowrap' }}>
                                  📅 reajuste
                                </span>
                              )}
                              {isDesocupacao && (
                                <span style={{ 
                                  fontSize: 9, 
                                  fontWeight: 700, 
                                  color: '#1e293b', 
                                  background: '#e2e8f0', 
                                  border: '1px solid #94a3b8', 
                                  borderRadius: 4, padding: '1px 4px', whiteSpace: 'nowrap' }}>
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
        </CardContent>
      </Card>
 
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1e293b' }}>
          <span style={{ background: '#cbd5e1', border: '1px solid #94a3b8', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>🚪</span>
          Mês de desocupação
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#991b1b' }}>
          <span style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>⚠️</span>
          Inadimplência pendente no mês
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#7c3aed' }}>
          <span style={{ background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>🟣</span>
          Conta variável não alterada ou com valor zerado no mês
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#c2410c' }}>
          <span style={{ background: '#fff7ed', border: '1px solid #f97316', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>📎</span>
          Conta extra ainda não registrada no sistema de pagamento
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155' }}>
          <span style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>🧾</span>
          Cobrança parcelada ativa no mês
        </div>
      </div>
 
      {modal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={closeModal}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 640, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
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
 
            {(() => {
              const contasInclusas = (modal.imovel.contasInclusas || modal.inquilino.contasInclusas || [])
                .filter(k => !isContaPagaImobiliaria(modal.inquilino, k))
                .filter(k => !isSeguroIncendioKey(k) || isMesDentroRange(modal.key, modal.inquilino.seguroIncendioMesInicio, modal.inquilino.seguroIncendioMesFim))
              const allContas = contasInclusas.map(k => {
                const { label, icone } = getContaMeta(k)
                return {
                  key:        k,
                  label,
                  icone,
                  value:      Number(modal.inquilino.contasValores?.[k]) || 0,
                  isVariavel: !!(modal.inquilino.contasVariavel?.[k] || modal.imovel.contasVariavel?.[k]),
                  origem:     modal.inquilino.contasOrigem?.[k] || (modal.imovel.contasVariavel?.[k] ? 'Imóvel' : ''),
                }
              })
              const { mesInicio: modalMesInicio } = getMesRange(modal.inquilino)
              const aluguelCheio   = Number(modal.inquilino.valorAluguel || modal.imovel.valorAluguel) || 0
              const aluguelBase    = modal.key === modalMesInicio ? aluguelCheio * getFracaoEntrada(modal.inquilino) : aluguelCheio
              const seguroBase     = (modal.inquilino.garantia === 'seguro' && isMesDentroRange(modal.key, modal.inquilino.seguroFiancaMesInicio, modal.inquilino.seguroFiancaMesFim)) ? Number(modal.inquilino.valorSeguro) || 0 : 0
              const garagemBase    = (Number(modal.inquilino.vagas) || 0) * (Number(modal.inquilino.valorVaga) || 0)
              const garantiaBase   = (modal.inquilino.garantia === 'caucao' || modal.inquilino.garantia === 'adiantamento') && modal.key === modalMesInicio ? Number(modal.inquilino.valorGarantia) || 0 : 0
              const aluguel        = '_aluguel' in varValues ? Number(varValues._aluguel)  || 0 : aluguelBase
              const valorSeguro    = '_seguro'   in varValues ? Number(varValues._seguro)   || 0 : seguroBase
              const valorGaragem   = '_garagem'  in varValues ? Number(varValues._garagem)  || 0 : garagemBase
              const valorGarantia  = '_garantia' in varValues ? Number(varValues._garantia) || 0 : garantiaBase
              const despesas       = allContas.reduce((s, { key, value }) =>
                s + (key in varValues ? Number(varValues[key]) || 0 : value), 0)
              const extrasTotal    = extraContas.reduce((s, e) => s + (parseFloat(e.valor) || 0), 0)
              const parcelasModal      = getParcelasDoMes(modal.inquilino.id, modal.key)
              const parcelasModalTotal = parcelasModal.reduce((s, p) => s + (Number(p.valorParcela) || 0), 0)
              const totalMes       = aluguel + despesas + valorSeguro + valorGaragem + valorGarantia + extrasTotal + parcelasModalTotal
              const temVariavel    = allContas.some(c => c.isVariavel)
              const varPreenchido  = allContas.filter(c => c.isVariavel).every(c => Number(varValues[c.key]) > 0)
 
              const EditableRow = ({ icon, label, baseVal, vKey, showSeguro, registradoKey }) => {
                const hasOv      = vKey in varValues
                const curVal     = hasOv ? varValues[vKey] : String(baseVal || '')
                const isModified = hasOv && parseFloat(varValues[vKey]) !== baseVal
                const bc         = isModified ? '#fcd34d' : '#e2e8f0'
                const registrada = registradoKey ? !!registradoVar[registradoKey] : false
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, opacity: registrada ? 0.55 : 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {registradoKey && (
                        <input
                          type="checkbox"
                          checked={registrada}
                          onChange={() => handleToggleRegistradoVar(registradoKey)}
                          title="Registrada no sistema de pagamento"
                          style={{ cursor: 'pointer' }}
                        />
                      )}
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
                  {saveError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 6, padding: '6px 10px', fontSize: 12, marginBottom: 10 }}>
                      ⚠️ {saveError}
                      <button onClick={() => setSaveError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <EditableRow icon="🏠" label="Aluguel"       baseVal={aluguelBase}  vKey="_aluguel" />
                    {allContas.map(({ key, label, icone, value, isVariavel, origem }) => {
                      const hasOverride = key in varValues
                      const inputVal    = hasOverride ? varValues[key] : String(value || '')
                      const isModified  = hasOverride && parseFloat(varValues[key]) !== value
                      const borderColor = isVariavel ? '#c4b5fd' : isModified ? '#fcd34d' : '#e2e8f0'
                      const bgColor     = isVariavel ? '#faf5ff' : isModified ? '#fffbeb' : '#fff'
                      const txtColor    = isVariavel ? '#6d28d9' : isModified ? '#92400e' : '#334155'
                      const registrada  = isVariavel && !!registradoVar[key]
                      return (
                        <div key={key} style={{ fontSize: 13, color: '#475569', opacity: registrada ? 0.55 : 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              {isVariavel && (
                                <input
                                  type="checkbox"
                                  checked={registrada}
                                  onChange={() => handleToggleRegistradoVar(key)}
                                  title="Registrada no sistema de pagamento"
                                  style={{ cursor: 'pointer' }}
                                />
                              )}
                              {icone} {label}
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
                      <EditableRow icon="🛡️" label="Seguro Fiança" baseVal={seguroBase}  vKey="_seguro"  showSeguro registradoKey="_seguro" />
                    )}
                    {garagemBase > 0 && (
                      <EditableRow icon="🚗" label={`Garagem (${modal.inquilino.vagas} vaga${Number(modal.inquilino.vagas) > 1 ? 's' : ''})`} baseVal={garagemBase} vKey="_garagem" registradoKey="_garagem" />
                    )}
                    {garantiaBase > 0 && (
                      <EditableRow icon="🔒" label={modal.inquilino.garantia === 'caucao' ? 'Caução' : 'Adiantamento'} baseVal={garantiaBase} vKey="_garantia" registradoKey="_garantia" />
                    )}
                    {parcelasModal.length > 0 && (
                      <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 6, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {parcelasModal.map(p => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                              🧾 {p.descricao}
                              <span style={{ fontSize: 10, fontWeight: 700, background: '#f1f5f9', color: '#475569', borderRadius: 8, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                                parcela {p.mesInicio} a {p.mesFim}
                              </span>
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <strong>{fmtBRL(p.valorParcela)}</strong>
                              <button
                                onClick={() => {
                                  if (window.confirm(`Excluir a cobrança parcelada "${p.descricao}" (${p.mesInicio} a ${p.mesFim})? Isso remove a parcela de todos os meses do período.`)) {
                                    handleRemoveParcela(p.id)
                                  }
                                }}
                                title="Excluir cobrança parcelada"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 15, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {extraContas.map((extra, idx) => {
                      const contaMeta = extra.contaId ? contasCatalogo.find(c => c.id === extra.contaId) : null
                      const icone     = contaMeta?.icone || '📋'
                      const isLegacy  = !extra.contaId && extra.nome
                      return (
                        <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: extra.registrado ? 0.55 : 1 }}>
                          <input
                            type="checkbox"
                            checked={!!extra.registrado}
                            onChange={() => handleExtraToggleRegistrado(idx)}
                            disabled={(!extra.contaId && !extra.nome) || extra.valor === '' || extra.valor === undefined}
                            title={(extra.contaId || extra.nome) && extra.valor !== '' ? 'Registrada no sistema de pagamento' : 'Preencha a conta e o valor antes de marcar'}
                            style={{ flexShrink: 0, cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: 13, flexShrink: 0 }}>{icone}</span>
                          {isLegacy ? (
                            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#475569' }}>{extra.nome}</span>
                          ) : (
                            <select
                              value={extra.contaId || ''}
                              onChange={e => handleExtraContaChange(idx, e.target.value)}
                              style={{
                                flex: 1, minWidth: 0, padding: '4px 8px',
                                border: '1.5px solid #e2e8f0', borderRadius: 6,
                                fontSize: 12, outline: 'none', background: '#fff',
                              }}
                            >
                              <option value="">Selecione uma conta...</option>
                              {contasCatalogo.map(c => (
                                <option key={c.id} value={c.id}>{c.nome}</option>
                              ))}
                            </select>
                          )}
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
                      )
                    })}
                    {(() => {
                      const fixedRegistradoKeys = [
                        seguroBase   > 0 ? '_seguro'   : null,
                        garagemBase  > 0 ? '_garagem'  : null,
                        garantiaBase > 0 ? '_garantia' : null,
                      ].filter(Boolean)
                      if (extraContas.length === 0 && !temVariavel && fixedRegistradoKeys.length === 0) return null
                      const tudoRegistrado = extraContas.every(e => e.registrado)
                        && allContas.filter(c => c.isVariavel).every(c => registradoVar[c.key])
                        && fixedRegistradoKeys.every(k => registradoVar[k])
                      return (
                        <button
                          onClick={handleMarkAllRegistrado}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            background: 'none', border: '1.5px dashed #cbd5e1', borderRadius: 6,
                            padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: '#64748b',
                            width: '100%', marginTop: 2,
                          }}
                        >
                          {tudoRegistrado ? '☐ Desmarcar todas como registradas' : '☑ Marcar todas como registradas'}
                        </button>
                      )
                    })()}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 2 }}>
                      <span>= Total do Mês</span>
                      <span style={{ color: temVariavel && !varPreenchido ? '#94a3b8' : '#1e40af' }}>
                        {fmtBRL(totalMes)}
                        {temVariavel && !varPreenchido && (
                          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400, marginLeft: 4 }}>incompleto</span>
                        )}
                      </span>
                    </div>
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

                    {(() => {
                      const itemsMes = getItems(modal.inquilino.id, modal.mi)
                      if (!itemsMes.length) return null
                      return (
                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                            ⚠️ Inadimplência{itemsMes.length > 1 ? `s cadastradas neste mês (${itemsMes.length})` : ' cadastrada neste mês'}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {itemsMes.map(item => {
                              const st = STATUS_STYLE[item.status] || STATUS_STYLE.Pendente
                              return (
                                <div key={item.id} style={{ background: '#fff', border: `1px solid ${st.border}`, borderRadius: 8, padding: '8px 10px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{item.tipoDebito || 'Débito'}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 8, padding: '2px 8px', background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
                                      {st.icon} {item.status || 'Pendente'}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>
                                      {item.dataVencimento ? `Venc. ${new Date(item.dataVencimento).toLocaleDateString('pt-BR')}` : 'Sem vencimento'}
                                    </span>
                                    <strong style={{ fontSize: 13, color: '#1e293b' }}>{fmtBRL(item.valorTotal)}</strong>
                                  </div>
                                  {item.observacao && (
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>📝 {item.observacao}</div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )
            })()}
 
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
                    const { mesInicio: _modalMesInicio } = getMesRange(modal.inquilino)
                    const _aluguelCheio = Number(modal.inquilino.valorAluguel || modal.imovel.valorAluguel) || 0
                    const _aluguel     = '_aluguel' in varValues ? Number(varValues._aluguel) || 0 : (modal.key === _modalMesInicio ? _aluguelCheio * getFracaoEntrada(modal.inquilino) : _aluguelCheio)
                    const _allContas   = (modal.imovel.contasInclusas || modal.inquilino.contasInclusas || [])
                      .filter(k => !isContaPagaImobiliaria(modal.inquilino, k))
                      .filter(k => !isSeguroIncendioKey(k) || isMesDentroRange(modal.key, modal.inquilino.seguroIncendioMesInicio, modal.inquilino.seguroIncendioMesFim))
                      .map(k => ({
                        key: k, value: Number(modal.inquilino.contasValores?.[k]) || 0,
                      }))
                    const _despesas    = _allContas.reduce((s, { key, value }) =>
                      s + (key in varValues ? Number(varValues[key]) || 0 : value), 0)
                    const _seguro      = '_seguro'  in varValues ? Number(varValues._seguro)  || 0 : ((modal.inquilino.garantia === 'seguro' && isMesDentroRange(modal.key, modal.inquilino.seguroFiancaMesInicio, modal.inquilino.seguroFiancaMesFim)) ? Number(modal.inquilino.valorSeguro) || 0 : 0)
                    const _garagem     = '_garagem' in varValues ? Number(varValues._garagem) || 0 : (Number(modal.inquilino.vagas) || 0) * (Number(modal.inquilino.valorVaga) || 0)
                    const _garantia    = '_garantia' in varValues ? Number(varValues._garantia) || 0 : ((modal.inquilino.garantia === 'caucao' || modal.inquilino.garantia === 'adiantamento') && modal.key === _modalMesInicio ? Number(modal.inquilino.valorGarantia) || 0 : 0)
                    const _extrasTotal = extraContas.reduce((s, e) => s + (parseFloat(e.valor) || 0), 0)
                    const _parcelasTotal = getParcelasTotal(modal.inquilino.id, modal.key)
                    const _totalMes    = _aluguel + _despesas + _seguro + _garagem + _garantia + _extrasTotal + _parcelasTotal
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

      {modalParcela && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={closeModalParcela}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>🧾 Nova Cobrança Parcelada</h3>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '4px 10px' }} onClick={closeModalParcela}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <div style={{ position: 'relative' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>Inquilino *</div>
                <input
                  type="text"
                  value={inquilinoBusca}
                  onChange={e => {
                    setInquilinoBusca(e.target.value)
                    setInquilinoSugestoesAberta(true)
                    if (parcelaForm.inquilinoId) setParcelaForm(p => ({ ...p, inquilinoId: '' }))
                  }}
                  onFocus={() => setInquilinoSugestoesAberta(true)}
                  onBlur={() => setTimeout(() => setInquilinoSugestoesAberta(false), 150)}
                  placeholder="Digite o nome do inquilino..."
                  autoComplete="off"
                  style={{
                    width: '100%', padding: '6px 8px', boxSizing: 'border-box',
                    border: `1.5px solid ${parcelaForm.inquilinoId ? '#86efac' : '#e2e8f0'}`,
                    borderRadius: 6, fontSize: 13, outline: 'none',
                    background: parcelaForm.inquilinoId ? '#f0fdf4' : '#fff',
                  }}
                />
                {inquilinoSugestoesAberta && inquilinoBusca.trim() && (() => {
                  const termo = inquilinoBusca.toLowerCase()
                  const matches = rows.filter(({ inquilino }) => inquilino.nome?.toLowerCase().includes(termo))
                  return (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2,
                      background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 6,
                      boxShadow: '0 8px 20px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto', zIndex: 10,
                    }}>
                      {matches.length === 0 ? (
                        <div style={{ padding: '8px 10px', fontSize: 12, color: '#94a3b8' }}>Nenhum inquilino encontrado.</div>
                      ) : (
                        matches.map(({ imovel, inquilino }) => (
                          <div
                            key={inquilino.id}
                            onMouseDown={() => {
                              setParcelaForm(p => ({ ...p, inquilinoId: inquilino.id }))
                              setInquilinoBusca(`${inquilino.nome} (${imovel.codigo})`)
                              setInquilinoSugestoesAberta(false)
                            }}
                            style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                          >
                            <span>{inquilino.nome}</span>
                            <span style={{ color: '#94a3b8', fontSize: 11 }}>{imovel.codigo}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )
                })()}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>Descrição</div>
                <input
                  type="text"
                  value={parcelaForm.descricao}
                  onChange={e => setParcelaForm(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Ex: Reforma, débito parcelado..."
                  style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>Valor de cada parcela (R$) *</div>
                <input
                  type="number" step="0.01" min="0"
                  value={parcelaForm.valorParcela}
                  onChange={e => setParcelaForm(p => ({ ...p, valorParcela: e.target.value }))}
                  style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>1º mês de cobrança *</div>
                  <input
                    type="month"
                    value={parcelaForm.mesInicio}
                    onChange={e => setParcelaForm(p => ({ ...p, mesInicio: e.target.value }))}
                    style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }}>Último mês de cobrança *</div>
                  <input
                    type="month"
                    value={parcelaForm.mesFim}
                    onChange={e => setParcelaForm(p => ({ ...p, mesFim: e.target.value }))}
                    style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              {parcelaForm.mesInicio && parcelaForm.mesFim && parcelaForm.valorParcela && (
                <div style={{ fontSize: 12, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px' }}>
                  {parcelaForm.mesFim >= parcelaForm.mesInicio
                    ? `${fmtBRL(parcelaForm.valorParcela)} por mês, de ${parcelaForm.mesInicio} até ${parcelaForm.mesFim}.`
                    : '⚠️ O último mês deve ser igual ou posterior ao primeiro.'}
                </div>
              )}
              <button
                className="btn btn-primary"
                onClick={handleSaveParcela}
                disabled={parcelaSaving || !parcelaForm.inquilinoId || !parcelaForm.valorParcela || !parcelaForm.mesInicio || !parcelaForm.mesFim || parcelaForm.mesFim < parcelaForm.mesInicio}
              >
                {parcelaSaving ? 'Salvando...' : '💾 Cadastrar Cobrança'}
              </button>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Parcelamentos cadastrados</div>
              {cobrancasParceladas.length === 0 ? (
                <p style={{ fontSize: 12, color: '#94a3b8' }}>Nenhuma cobrança parcelada ainda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cobrancasParceladas.map(p => {
                    const inquilino = inquilinos.find(i => i.id === p.inquilinoId)
                    const imovel = imoveis.find(im => im.id === p.imovelId)
                    return (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px' }}>
                        <div>
                          <strong>{imovel?.codigo || '—'} — {inquilino?.nome || '—'}</strong>
                          <div style={{ color: '#64748b' }}>{p.descricao} · {fmtBRL(p.valorParcela)}/mês · {p.mesInicio} a {p.mesFim}</div>
                        </div>
                        <button onClick={() => handleRemoveParcela(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }} title="Remover">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
