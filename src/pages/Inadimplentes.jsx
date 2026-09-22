import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { ref, onValue, remove, update, push } from 'firebase/database'
import { db } from '../firebase'
import * as XLSX from 'xlsx'
import Layout from '../components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { normalizeText } from '@/lib/utils'
import './Inadimplentes.css'
import {
  TriangleAlert,
  Wallet,
  CircleCheck,
  Trophy,
  Plus,
  FileSpreadsheet,
  Search,
  MessageCircle,
  Pencil,
  X,
} from 'lucide-react'

const STATUS_OPCOES = [
  { value: 'selecione',       label: 'Selecione',         bg: '#eff6ff',   color: '#1d4ed8', border: '#93c5fd' },
  { value: 'seguro_aprovado', label: 'Seguro Aprovado',   bg: '#f0fdf4',   color: '#166534', border: '#86efac' },
  { value: 'cobranca_whats',  label: 'Cobrança WhatsApp', bg: '#8eec8a',   color: '#166534', border: '#86efac' },
  { value: 'nao_responde',    label: 'Não Responde',      bg: '#f7b5b5',   color: '#6d1a17', border: '#c73434' },
  { value: 'nao_quer_pagar',  label: 'Não Quer Pagar',    bg: '#e485859a', color: '#7e2020', border: '#d60909' },
  { value: 'acordo',          label: 'Acordo',            bg: '#fffbeb',   color: '#b45309', border: '#fde68a' },
  { value: 'juridico',        label: 'Jurídico',          bg: '#fef2f2',   color: '#b91c1c', border: '#fecaca' },
  { value: 'pago',            label: 'Pago',              bg: '#f0fdf4',   color: '#166534', border: '#86efac' },
  { value: 'pago_caucao',     label: 'Pago com caução',   bg: '#ecfdf5',   color: '#047857', border: '#6ee7b7' },
]

const SEGURO_ACIONADO_OPCOES = [
  { value: 'nao_acionado',          label: 'Não Acionado',          bg: '#ff979786', color: '#a12525', border: '#8d1d1d' },
  { value: 'acionado',              label: 'Acionado',              bg: '#9fdaa788', color: '#01a001', border: '#04a119' },
  { value: 'aguardar_para_acionar', label: 'Aguardar para Acionar', bg: '#adadad8a', color: '#555555', border: '#585858' },
  { value: 'necessita_documentos',  label: 'Necessita Documentos',  bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  { value: 'pagamento_aprovado',    label: 'Pagamento Aprovado',    bg: '#f0fdf4', color: '#166534', border: '#86efac' },
  { value: 'pago_pela_seguradora',  label: 'Pago pela seguradora',  bg: '#ecfeff', color: '#0e7490', border: '#67e8f9' },
  { value: 'pagamento_reprovado',   label: 'Pagamento Reprovado',   bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  { value: 'juridico',   label: 'Jurídico',   bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
]

const GARANTIA_LABELS = {
  seguro:       'S.F.',
  caucao:       'Caução',
  adiantamento: 'Adiantamento',
  carta_fianca: 'Carta Fiança',
  sem_garantia: 'Sem Garantia',
}

const SEGURO_LABELS = {
  credaluga: 'Credaluga',
  credpago:  'Credpago',
  lado_bom:  'Lado Bom',
}

const GARANTIA_OPCOES = [
  { value: 'seguro',       label: 'Seguro' },
  { value: 'caucao',       label: 'Caução' },
  { value: 'adiantamento', label: 'Adiantamento' },
  { value: 'carta_fianca', label: 'Carta Fiança' },
  { value: 'sem_garantia', label: 'Sem Garantia' },
]

const GARANTIA_STYLE = {
  seguro:       { bg: '#ede9fe', color: '#7c3aed', border: '#c4b5fd', icon: '🛡️' },
  caucao:       { bg: '#f0fdf4', color: '#166534', border: '#86efac', icon: '💰' },
  adiantamento: { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd', icon: '💵' },
  carta_fianca: { bg: '#fff7ed', color: '#c2410c', border: '#fdba74', icon: '📄' },
  sem_garantia: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', icon: '🚫' },
}

// Indica se a inadimplência em si está garantida (independente do tipo de garantia do contrato)
const GARANTIDA_OPCOES = [
  { value: 'garantida',     label: 'Garantida' },
  { value: 'nao_garantida', label: 'Não Garantida' },
]

const GARANTIDA_STYLE = {
  garantida:     { bg: '#f0fdf4', color: '#166534', border: '#86efac' },
  nao_garantida: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
}

const isStatusRecuperado = status => status === 'pago' || status === 'pago_caucao'
const isSeguroRecuperado = seguroAcionado => seguroAcionado === 'pago_pela_seguradora'
const podeInformarDataPagamento = d => d.status === 'pago' || d.status === 'pago_caucao' || d.seguroAcionado === 'pagamento_aprovado' || d.seguroAcionado === 'pago_pela_seguradora'

const fmtMoney = (v) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const credpagoUrl = (nome) => {
  const nomeParam = String(nome || '').trim().replace(/\s+/g, '+')
  return `https://credpago.com/imobiliaria/contratos/relatorio.php?search=${encodeURIComponent(nomeParam).replace(/%2B/g, '+')}`
}

// A Credaluga guarda o filtro de busca ativo num JSON serializado duas vezes no hash da URL
const credalugaUrl = (nome) => {
  const nomeParam = String(nome || '').trim().replace(/\s+/g, '+')
  const state = {
    state: {
      filters: [{
        type: 'multi',
        field: 'search',
        value: nomeParam,
        includeFields: ['id', 'fullname', 'streetAddress', 'nationalId'],
        displayValue: nomeParam,
      }],
      sortConfig: { field: null, order: null, type: null },
      currentPage: 1,
      totalPages: 1,
      totalItems: 0,
      itemsPerPage: 0,
    },
    version: 0,
  }
  const hash = encodeURIComponent(JSON.stringify(JSON.stringify(state))).replace(/%2B/g, '+')
  return `https://app.credaluga.com.br/contracts/active#activeContracts=${hash}`
}

const getMonth = (d) =>
  d.mesReferencia || (d.dataVencimento ? d.dataVencimento.substring(0, 7) : null)

const formatMonthLabel = (ym) => {
  if (!ym) return 'Sem mês'
  const [y, m] = ym.split('-')
  return new Date(+y, +m - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase())
}

const formatMonthShort = (ym) => {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return `${m}/${y.slice(2)}`
}

function buildMonthGroups(debitos) {
  const map = {}
  debitos.forEach(d => {
    const key = getMonth(d) || 'sem-mes'
    if (!map[key]) map[key] = []
    map[key].push(d)
  })
  return Object.entries(map).sort(([a], [b]) => b.localeCompare(a))
}

function monthStats(list) {
  const pending = list.filter(d => !isStatusRecuperado(d.status))
  const paid    = list.filter(d => isStatusRecuperado(d.status))
  const uniqueInq = new Set(pending.map(d => d.inquilinoId).filter(Boolean))
  return {
    totalInadimplentes: uniqueInq.size || pending.length,
    valorAberto:    pending.reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0),
    valorRecuperado: paid.reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0),
    totalDebitos: list.length,
  }
}

// Por padrão o filtro de status mostra tudo, exceto os débitos já pagos
const DEFAULT_STATUS_FILTRO = STATUS_OPCOES.filter(o => !isStatusRecuperado(o.value)).map(o => o.value)
const TODOS_STATUS_FILTRO = STATUS_OPCOES.map(o => o.value)

const isDefaultStatusFiltro = (arr) =>
  arr.length === DEFAULT_STATUS_FILTRO.length && DEFAULT_STATUS_FILTRO.every(v => arr.includes(v))

const isTodosStatusFiltro = (arr) =>
  arr.length === TODOS_STATUS_FILTRO.length && TODOS_STATUS_FILTRO.every(v => arr.includes(v))

// Guarda os filtros/ordenação da planilha do jeito que o usuário deixou, para restaurar na próxima visita
const FILTROS_STORAGE_KEY = 'inadimplentes_filtros_v2'

const DEFAULT_COL_FILTERS = {
  inquilino: '',
  imovel: '',
  modelo: '',
  totalMin: '',
  totalMax: '',
  valorRecebidoMin: '',
  valorRecebidoMax: '',
  mesReferencia: '',
  vencimento: '',
  pagamentoInicio: '',
  pagamentoFim: '',
  dataSeguro: '',
  ultimaCobranca: '',
  garantia: '',
  garantida: '',
  seguroAcionado: [],
  status: DEFAULT_STATUS_FILTRO,
}

const loadFiltrosSalvos = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTROS_STORAGE_KEY) || 'null')
    return saved && typeof saved === 'object' ? saved : {}
  } catch {
    return {}
  }
}

export default function Inadimplentes() {
  const navigate = useNavigate()
  const location = useLocation()
  // Lido uma vez por montagem (não no carregamento do módulo), para refletir o que foi salvo
  // mesmo ao voltar para esta página por navegação interna (sem recarregar o app)
  const [filtrosIniciais] = useState(loadFiltrosSalvos)
  const debitoIdFiltro = useMemo(() => new URLSearchParams(location.search).get('debitoId'), [location.search])
  const [debitos, setDebitos] = useState([])
  const [inquilinos, setInquilinos] = useState([])
  const [imoveis, setImoveis] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(() => filtrosIniciais.search || '')
  const [mesSelecionado, setMesSelecionado] = useState(() => filtrosIniciais.mesSelecionado ?? null)
  const [showRankingModal, setShowRankingModal] = useState(false)
  const [showHistoricoContatos, setShowHistoricoContatos] = useState(false)
  const [buscaHistoricoContatos, setBuscaHistoricoContatos] = useState('')
  const [editingGarantiaId, setEditingGarantiaId] = useState(null)
  const [cardsDataInicio, setCardsDataInicio] = useState(() => filtrosIniciais.cardsDataInicio || '')
  const [cardsDataFim, setCardsDataFim] = useState(() => filtrosIniciais.cardsDataFim || '')
  const [segurosCatalogo, setSegurosCatalogo] = useState([])
  const [statusFilterOpen, setStatusFilterOpen] = useState(false)
  const statusFilterRef = useRef(null)
  const statusFilterPanelRef = useRef(null)
  const [statusFilterRect, setStatusFilterRect] = useState(null)
  const [seguroAcionadoFilterOpen, setSeguroAcionadoFilterOpen] = useState(false)
  const seguroAcionadoFilterRef = useRef(null)
  const seguroAcionadoFilterPanelRef = useRef(null)
  const [seguroAcionadoFilterRect, setSeguroAcionadoFilterRect] = useState(null)
  const [sortBy, setSortBy] = useState(() => filtrosIniciais.sortBy ?? null)
  const [sortDir, setSortDir] = useState(() => filtrosIniciais.sortDir || 'asc')
  const [colFilters, setColFilters] = useState(() => {
    const saved = filtrosIniciais.colFilters || {}
    return {
      ...DEFAULT_COL_FILTERS,
      ...saved,
      status: Array.isArray(saved.status) ? saved.status : DEFAULT_STATUS_FILTRO,
      seguroAcionado: Array.isArray(saved.seguroAcionado)
        ? saved.seguroAcionado
        : saved.seguroAcionado ? [saved.seguroAcionado] : [],
      pagamentoInicio: saved.pagamentoInicio ?? saved.pagamento ?? '',
      pagamentoFim: saved.pagamentoFim ?? saved.pagamento ?? '',
    }
  })

  // Persiste os filtros/ordenação assim que o usuário os altera, para restaurar na próxima visita
  useEffect(() => {
    try {
      localStorage.setItem(FILTROS_STORAGE_KEY, JSON.stringify({
        search, mesSelecionado, cardsDataInicio, cardsDataFim, sortBy, sortDir, colFilters,
      }))
    } catch {}
  }, [search, mesSelecionado, cardsDataInicio, cardsDataFim, sortBy, sortDir, colFilters])

  const setColFilter = (field, value) =>
    setColFilters(prev => ({ ...prev, [field]: value }))

  const toggleStatusFiltro = (value) =>
    setColFilters(prev => ({
      ...prev,
      status: prev.status.includes(value) ? prev.status.filter(v => v !== value) : [...prev.status, value],
    }))

  const toggleSeguroAcionadoFiltro = (value) =>
    setColFilters(prev => ({
      ...prev,
      seguroAcionado: prev.seguroAcionado.includes(value)
        ? prev.seguroAcionado.filter(v => v !== value)
        : [...prev.seguroAcionado, value],
    }))

  const limparColFilters = () => {
    setSearch('')
    setMesSelecionado(null)
    setCardsDataInicio('')
    setCardsDataFim('')
    setSortBy(null)
    setSortDir('asc')
    setColFilters({
      ...DEFAULT_COL_FILTERS,
      seguroAcionado: [],
      status: TODOS_STATUS_FILTRO,
    })
    setStatusFilterOpen(false)
    setSeguroAcionadoFilterOpen(false)
    try {
      localStorage.removeItem(FILTROS_STORAGE_KEY)
      localStorage.removeItem('inadimplentes_filtros_v1')
    } catch {}
  }

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir(dir => dir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  const sortArrow = (field) => sortBy === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  useEffect(() => {
    if (!statusFilterOpen) return
    const handler = (e) => {
      if (statusFilterRef.current?.contains(e.target)) return
      if (statusFilterPanelRef.current?.contains(e.target)) return
      setStatusFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [statusFilterOpen])

  useEffect(() => {
    if (!seguroAcionadoFilterOpen) return
    const handler = (e) => {
      if (seguroAcionadoFilterRef.current?.contains(e.target)) return
      if (seguroAcionadoFilterPanelRef.current?.contains(e.target)) return
      setSeguroAcionadoFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [seguroAcionadoFilterOpen])

  // Dropdown é renderizado via portal (fora do .table-container, que tem overflow) para não ser cortado
  useEffect(() => {
    if (!statusFilterOpen) return
    const updateRect = () => {
      if (!statusFilterRef.current) return
      const r = statusFilterRef.current.getBoundingClientRect()
      setStatusFilterRect({ top: r.bottom + 4, left: r.left })
    }
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [statusFilterOpen])

  useEffect(() => {
    if (!seguroAcionadoFilterOpen) return
    const updateRect = () => {
      if (!seguroAcionadoFilterRef.current) return
      const r = seguroAcionadoFilterRef.current.getBoundingClientRect()
      setSeguroAcionadoFilterRect({ top: r.bottom + 4, left: r.left })
    }
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [seguroAcionadoFilterOpen])

  useEffect(() => {
    const r1 = ref(db, 'inadimplencias')
    const unsub1 = onValue(r1, snap => {
      const data = snap.val()
      setDebitos(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
      setLoading(false)
    })
    const r2 = ref(db, 'inquilinos')
    const unsub2 = onValue(r2, snap => {
      const data = snap.val()
      setInquilinos(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
    const r3 = ref(db, 'imoveis')
    const unsub3 = onValue(r3, snap => {
      const data = snap.val()
      setImoveis(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
    const r4 = ref(db, 'seguros')
    const unsub4 = onValue(r4, snap => {
      const data = snap.val()
      const lista = data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : []
      setSegurosCatalogo(lista.filter(s => s.tipo === 'Seguro Fiança').sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')))
    })
    return () => { unsub1(); unsub2(); unsub3(); unsub4() }
  }, [])

  const getGarantia = (d) => {
    const inquilino = inquilinos.find(i => i.id === d.inquilinoId)
    const g = inquilino?.garantia || d.garantia || 'sem_garantia'
    const s = inquilino?.seguro   || d.seguro
    const label = GARANTIA_LABELS[g] || g
    const fullLabel = (g === 'seguro' && s) ? `${label} | ${SEGURO_LABELS[s] || s}` : label
    return { key: g, label: fullLabel, seguro: s }
  }

  // Se ainda não foi definido manualmente para este débito, assume garantida por padrão
  const getGarantida = (d) => d.garantida === 'nao_garantida' ? 'nao_garantida' : 'garantida'

  // O cadastro do inquilino e do imóvel são as fontes vivas; as cópias gravadas no débito
  // (inquilinoNome/codigoImovel) podem ficar desatualizadas, então só servem de fallback.
  const getInquilinoNome = (d) =>
    inquilinos.find(i => i.id === d.inquilinoId)?.nome || d.inquilinoNome || 'Sem nome'

  const getCodigoImovel = (d) => {
    const inquilino = inquilinos.find(i => i.id === d.inquilinoId)
    const imovel = imoveis.find(im => im.id === inquilino?.imovelId)
    return imovel?.codigo || inquilino?.codigoImovel || d.codigoImovel || ''
  }

  const getModeloImovel = (d) => {
    const inquilino = inquilinos.find(i => i.id === d.inquilinoId)
    const imovelPorId = imoveis.find(im => im.id === (inquilino?.imovelId || d.imovelId))
    if (imovelPorId?.modelo) return imovelPorId.modelo
    // Inquilinos inativos têm o imovelId limpo no cadastro (ver Desocupacoes.jsx), então
    // cai para o mesmo código usado pela coluna "Imóvel" para achar o imóvel correto.
    const codigo = getCodigoImovel(d)
    return (codigo && imoveis.find(im => im.codigo === codigo)?.modelo) || ''
  }

  const getImovelId = (d) => inquilinos.find(i => i.id === d.inquilinoId)?.imovelId || ''

  const openHashRoute = (route) => {
    const url = new URL(window.location.href)
    url.hash = `#${route}`
    window.open(url.toString(), '_blank', 'noopener,noreferrer')
  }

  const goInquilino = (d) => {
    if (!d.inquilinoId) return
    openHashRoute(`/inquilinos/editar/${d.inquilinoId}`)
  }

  const goImovel = (d) => {
    const imovelId = getImovelId(d)
    if (!imovelId) return
    openHashRoute(`/imoveis/editar/${imovelId}`)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este débito?')) return
    await remove(ref(db, `inadimplencias/${id}`))
  }

  // Grava uma entrada no histórico de alterações (usado pelo card "Histórico de Alterações"
  // no Dashboard). Guarda o rótulo (não só a chave) para exibição direta, sem precisar
  // duplicar os mapas de labels em outras telas.
  const registrarHistorico = async (d, campo, campoLabel, valorAnteriorKey, valorAnteriorLabel, valorNovoKey, valorNovoLabel) => {
    try {
      await push(ref(db, 'historicoAlteracoes'), {
        debitoId: d.id,
        inquilinoId: d.inquilinoId || null,
        inquilinoNome: getInquilinoNome(d),
        codigoImovel: getCodigoImovel(d) || null,
        campo,
        campoLabel,
        valorAnteriorKey: valorAnteriorKey || null,
        valorAnteriorLabel: valorAnteriorLabel || '—',
        valorNovoKey: valorNovoKey || null,
        valorNovoLabel: valorNovoLabel || '—',
        // Snapshot do valor, mês de referência do débito e data do seguro no momento da alteração
        // (o Dashboard usa o timestamp "data" abaixo, não este campo, para decidir em que mês exibir o registro)
        valorTotal: d.valorTotal || d.valorOriginal || 0,
        valorRecebido: d.valorRecebido || null,
        mesReferencia: d.mesReferencia || null,
        dataSeguro: d.dataSeguro || null,
        data: Date.now(),
      })
    } catch (err) {
      console.error('Erro ao registrar histórico de alteração', err)
    }
  }

  const handleSeguroAcionadoChange = async (d, value) => {
    const anterior = SEGURO_ACIONADO_OPCOES.find(o => o.value === (d.seguroAcionado || 'nao_acionado')) || SEGURO_ACIONADO_OPCOES[0]
    const novo = SEGURO_ACIONADO_OPCOES.find(o => o.value === value) || SEGURO_ACIONADO_OPCOES[0]
    await update(ref(db, `inadimplencias/${d.id}`), { seguroAcionado: value })
    if (anterior.value !== novo.value) {
      await registrarHistorico(d, 'seguroAcionado', 'Seguro Acionado', anterior.value, anterior.label, novo.value, novo.label)
    }
  }

  const handleStatusChange = async (d, value) => {
    if (value === 'pago_caucao') {
      const garantia = getGarantia(d).key
      if (garantia !== 'caucao' && garantia !== 'adiantamento') {
        alert('O status Pago com caução só pode ser usado para caução ou adiantamento.')
        return
      }
    }
    const anterior = STATUS_OPCOES.find(o => o.value === d.status) || STATUS_OPCOES[0]
    const novo = STATUS_OPCOES.find(o => o.value === value) || STATUS_OPCOES[0]
    await update(ref(db, `inadimplencias/${d.id}`), { status: value })

    if (d.inquilinoId && anterior.value !== novo.value) {
      const inquilino = inquilinos.find(item => item.id === d.inquilinoId)
      const valorDebito = Number(d.valorTotal || d.valorOriginal || 0)
      const totalGarantia = Number(inquilino?.valorGarantia || 0)
      const utilizadoAtual = Number(inquilino?.valorGarantiaUtilizado || 0)
      const variacao = novo.value === 'pago_caucao'
        ? valorDebito
        : anterior.value === 'pago_caucao'
          ? -valorDebito
          : 0

      if (variacao !== 0) {
        const utilizadoNovo = Math.max(0, Math.min(totalGarantia, utilizadoAtual + variacao))
        await update(ref(db, `inquilinos/${d.inquilinoId}`), {
          valorGarantiaUtilizado: utilizadoNovo,
          valorGarantiaRestante: Math.max(0, totalGarantia - utilizadoNovo),
        })
      }
    }
    if (anterior.value !== novo.value) {
      await registrarHistorico(d, 'status', 'Status', anterior.value, anterior.label, novo.value, novo.label)
    }
  }

  const handleUltimaCobrancaChange = async (id, value) => {
    await update(ref(db, `inadimplencias/${id}`), { ultimaCobranca: value })
  }

  const handleGarantidaChange = async (id, value) => {
    await update(ref(db, `inadimplencias/${id}`), { garantida: value })
  }

  const handleValorRecebidoChange = async (id, value) => {
    await update(ref(db, `inadimplencias/${id}`), { valorRecebido: value === '' ? null : Number(value) })
  }

  const handleDataSeguroChange = async (id, value) => {
    await update(ref(db, `inadimplencias/${id}`), { dataSeguro: value })
  }

  const handleDataVencimentoChange = async (id, value) => {
    await update(ref(db, `inadimplencias/${id}`), { dataVencimento: value })
  }

  const handleDataPagamentoChange = async (id, value) => {
    await update(ref(db, `inadimplencias/${id}`), { dataPagamento: value })
  }

  // Altera a garantia/seguro no cadastro do inquilino (fonte oficial) e, se o débito
  // guardar uma cópia própria desses campos, mantém essa cópia sincronizada também.
  const handleGarantiaChange = async (d, novaGarantia) => {
    const inquilinoUpdates = { garantia: novaGarantia }
    if (novaGarantia !== 'seguro') { inquilinoUpdates.seguro = ''; inquilinoUpdates.valorSeguro = '' }
    if (d.inquilinoId) await update(ref(db, `inquilinos/${d.inquilinoId}`), inquilinoUpdates)
    if (d.garantia !== undefined) {
      const debitoUpdates = { garantia: novaGarantia }
      if (novaGarantia !== 'seguro') debitoUpdates.seguro = ''
      await update(ref(db, `inadimplencias/${d.id}`), debitoUpdates)
    }
  }

  const handleSeguroProviderChange = async (d, novoSeguro) => {
    if (d.inquilinoId) await update(ref(db, `inquilinos/${d.inquilinoId}`), { seguro: novoSeguro })
    if (d.seguro !== undefined) await update(ref(db, `inadimplencias/${d.id}`), { seguro: novoSeguro })
  }

  const abrirWhatsApp = (d) => {
    const inquilino = inquilinos.find(i => i.id === d.inquilinoId)

    if (!inquilino?.telefone) {
      alert('Este inquilino não possui telefone cadastrado.')
      return
    }

    const telefone = inquilino.telefone.replace(/\D/g, '')
    const mensagem = encodeURIComponent(
      `Olá, ${inquilino.nome}! Tudo bem? Sou Matheus, da equipe financeira da Divid. Estou entrando em contato sobre um débito em aberto.`
    )

    window.open(`https://wa.me/55${telefone}?text=${mensagem}`, '_blank')
  }



  const abrirGarantia = (d) => {
    const inquilino = inquilinos.find(i => i.id === d.inquilinoId)
    if (!inquilino) return alert('Inquilino não encontrado.')
    const seguroNome = String(inquilino.seguro || '').toLowerCase()
    if (inquilino.garantia === 'seguro' && seguroNome === 'credpago') {
      window.open(credpagoUrl(inquilino.nome), '_blank')
      return
    }
    if (inquilino.garantia === 'seguro' && seguroNome === 'credaluga') {
      window.open(credalugaUrl(inquilino.nome), '_blank')
      return
    }
    alert('Este inquilino não possui Seguro Fiança.')
  }

  const getDateForCardFilter = (d) => {
    if (d.dataVencimento) return d.dataVencimento
    if (d.mesReferencia) return `${d.mesReferencia}-01`
    return ''
  }

  // Base filtrada pelos filtros da planilha (busca + filtros de coluna), sem considerar o mês selecionado.
  // Os cards de resumo usam a base sem filtro de status para que "Total Recuperado" contabilize os pagos.
  const baseSemStatus = useMemo(() => debitos
    .filter(d =>
      normalizeText(getInquilinoNome(d)).includes(normalizeText(search)) ||
      normalizeText(getCodigoImovel(d)).includes(normalizeText(search)) ||
      normalizeText(d.tipoDebito).includes(normalizeText(search))
    )
    .filter(d => !colFilters.inquilino || normalizeText(getInquilinoNome(d)).includes(normalizeText(colFilters.inquilino)))
    .filter(d => !colFilters.imovel || normalizeText(getCodigoImovel(d)).includes(normalizeText(colFilters.imovel)))
    .filter(d => !colFilters.modelo || getModeloImovel(d) === colFilters.modelo)
    .filter(d => !colFilters.garantia || getGarantia(d).key === colFilters.garantia)
    .filter(d => !colFilters.garantida || getGarantida(d) === colFilters.garantida)
    .filter(d => colFilters.seguroAcionado.length === 0 || colFilters.seguroAcionado.includes(d.seguroAcionado || 'nao_acionado'))
    .filter(d => !colFilters.mesReferencia || d.mesReferencia === colFilters.mesReferencia)
    .filter(d => !colFilters.vencimento || (d.dataVencimento || '') === colFilters.vencimento)
    .filter(d => {
      const pagamento = d.dataPagamento || ''
      if (colFilters.pagamentoInicio && (!pagamento || pagamento < colFilters.pagamentoInicio)) return false
      if (colFilters.pagamentoFim && (!pagamento || pagamento > colFilters.pagamentoFim)) return false
      return true
    })
    .filter(d => !colFilters.dataSeguro || (d.dataSeguro || '') === colFilters.dataSeguro)
    .filter(d => !colFilters.ultimaCobranca || (d.ultimaCobranca || '') === colFilters.ultimaCobranca)
    .filter(d => {
      const total = Number(d.valorTotal || d.valorOriginal || 0)
      if (colFilters.totalMin && total < Number(colFilters.totalMin)) return false
      if (colFilters.totalMax && total > Number(colFilters.totalMax)) return false
      return true
    })
    .filter(d => {
      const recebido = Number(d.valorRecebido || 0)
      if (colFilters.valorRecebidoMin && recebido < Number(colFilters.valorRecebidoMin)) return false
      if (colFilters.valorRecebidoMax && recebido > Number(colFilters.valorRecebidoMax)) return false
      return true
    })
    .filter(d => {
      const dataRef = getDateForCardFilter(d)
      if (!cardsDataInicio && !cardsDataFim) return true
      if (!dataRef) return false
      if (cardsDataInicio && dataRef < cardsDataInicio) return false
      if (cardsDataFim && dataRef > cardsDataFim) return false
      return true
    }),
  [debitos, inquilinos, imoveis, search, colFilters.inquilino, colFilters.imovel, colFilters.modelo, colFilters.garantia, colFilters.garantida, colFilters.seguroAcionado, colFilters.mesReferencia, colFilters.vencimento, colFilters.pagamentoInicio, colFilters.pagamentoFim, colFilters.dataSeguro, colFilters.ultimaCobranca, colFilters.totalMin, colFilters.totalMax, colFilters.valorRecebidoMin, colFilters.valorRecebidoMax, cardsDataInicio, cardsDataFim])

  // Filtro de status continua sendo aplicado na tabela.
  const filteredBase = useMemo(() => baseSemStatus
    .filter(d => colFilters.status.includes(STATUS_OPCOES.find(o => o.value === d.status)?.value || 'selecione')),
  [baseSemStatus, colFilters.status])

  const pendentes    = baseSemStatus.filter(d => !isStatusRecuperado(d.status) && !isSeguroRecuperado(d.seguroAcionado))
  const totalAberto  = pendentes.reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0)
  const totalRecup   = baseSemStatus.filter(d => isStatusRecuperado(d.status) || isSeguroRecuperado(d.seguroAcionado)).reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0)

  // Ranking dos inquilinos ativos com mais inadimplências cadastradas (histórico completo, não só em aberto)
  const rankingInadimplentes = (() => {
    const counts = {}
    baseSemStatus.forEach(d => {
      const key = d.inquilinoId || d.inquilinoNome
      if (!key) return
      const inquilino = inquilinos.find(i => i.id === d.inquilinoId)
      if (inquilino && inquilino.status === 'Inativo') return
      if (!counts[key]) {
        counts[key] = {
          nome: getInquilinoNome(d),
          total: 0,
        }
      }
      counts[key].total += 1
    })
    return Object.values(counts).sort((a, b) => b.total - a.total)
  })()

  const valorMedioAluguelInadimplentes = useMemo(() => {
    const inquilinoIds = new Set(baseSemStatus.map(d => d.inquilinoId).filter(Boolean))
    const valores = [...inquilinoIds]
      .map(id => Number(inquilinos.find(inquilino => inquilino.id === id)?.valorAluguel) || 0)
      .filter(valor => valor > 0)
    return valores.length > 0
      ? valores.reduce((total, valor) => total + valor, 0) / valores.length
      : 0
  }, [baseSemStatus, inquilinos])

  const monthGroups = buildMonthGroups(debitos)

  const filtered = useMemo(() => {
    let resultado = filteredBase

    if (debitoIdFiltro) {
      resultado = debitos.filter(d => d.id === debitoIdFiltro)
    }

    if (mesSelecionado && !debitoIdFiltro) {
      resultado = resultado.filter(d => (getMonth(d) || 'sem-mes') === mesSelecionado)
    }

    return resultado
  }, [debitos, debitoIdFiltro, filteredBase, mesSelecionado])

  const sortedFiltered = [...filtered].sort((a, b) => {
    if (!sortBy) return 0

    const garantiaA = getGarantia(a)
    const garantiaB = getGarantia(b)
    const garantidaA = GARANTIDA_OPCOES.find(o => o.value === getGarantida(a))?.label || 'Garantida'
    const garantidaB = GARANTIDA_OPCOES.find(o => o.value === getGarantida(b))?.label || 'Garantida'
    const statusA = STATUS_OPCOES.find(o => o.value === a.status)?.label || 'Selecione'
    const statusB = STATUS_OPCOES.find(o => o.value === b.status)?.label || 'Selecione'
    const seguroA = SEGURO_ACIONADO_OPCOES.find(o => o.value === (a.seguroAcionado || 'nao_acionado'))?.label || 'Não Acionado'
    const seguroB = SEGURO_ACIONADO_OPCOES.find(o => o.value === (b.seguroAcionado || 'nao_acionado'))?.label || 'Não Acionado'
    const values = {
      inquilino: [getInquilinoNome(a), getInquilinoNome(b)],
      imovel: [getCodigoImovel(a), getCodigoImovel(b)],
      modelo: [getModeloImovel(a), getModeloImovel(b)],
      total: [Number(a.valorTotal || a.valorOriginal || 0), Number(b.valorTotal || b.valorOriginal || 0)],
      recebido: [Number(a.valorRecebido || 0), Number(b.valorRecebido || 0)],
      mesReferencia: [a.mesReferencia || '', b.mesReferencia || ''],
      vencimento: [a.dataVencimento || '', b.dataVencimento || ''],
      pagamento: [a.dataPagamento || '', b.dataPagamento || ''],
      garantia: [garantiaA.label, garantiaB.label],
      garantida: [garantidaA, garantidaB],
      seguroAcionado: [seguroA, seguroB],
      dataSeguro: [a.dataSeguro || '', b.dataSeguro || ''],
      status: [statusA, statusB],
      ultimaCobranca: [a.ultimaCobranca || '', b.ultimaCobranca || ''],
    }[sortBy]

    if (!values) return 0
    const [valueA, valueB] = values
    const comparison = typeof valueA === 'number'
      ? valueA - valueB
      : String(valueA).localeCompare(String(valueB), 'pt-BR', { sensitivity: 'base', numeric: true })
    return sortDir === 'asc' ? comparison : -comparison
  })

  const historicoContatos = useMemo(() => {
    const termo = normalizeText(buscaHistoricoContatos)
    return debitos
      .flatMap(d => Object.entries(d.timeline || {})
        .filter(([, evento]) => evento.tipo === 'Contato realizado')
        .map(([eventoId, evento]) => ({
          id: `${d.id}_${eventoId}`,
          inquilinoNome: getInquilinoNome(d),
          codigoImovel: getCodigoImovel(d),
          tipoDebito: d.tipoDebito || '—',
          mesReferencia: d.mesReferencia || '—',
          descricao: evento.descricao || '',
          criadoEm: evento.criadoEm || '',
        }))
      )
      .filter(item => !termo || normalizeText(item.inquilinoNome).includes(termo))
      .sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0))
  }, [debitos, inquilinos, imoveis, buscaHistoricoContatos])

  // As opções dos filtros vêm da base completa. A seleção continua sendo combinada
  // na tabela, mas um filtro ativo não remove opções dos demais filtros.
  const mesRefOptions = useMemo(
    () => [...new Set(debitos.map(d => d.mesReferencia).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [debitos]
  )
  const garantiaOptions = useMemo(
    () => [...new Set(debitos.map(d => getGarantia(d).key).filter(Boolean))].sort((a, b) =>
      (GARANTIA_LABELS[a] || a).localeCompare(GARANTIA_LABELS[b] || b, 'pt-BR')
    ),
    [debitos, inquilinos]
  )
  const modeloOptions = useMemo(
    () => [...new Set(debitos.map(d => getModeloImovel(d)).filter(Boolean))].sort(),
    [debitos, inquilinos, imoveis]
  )

  const handleExport = () => {
    const dados = sortedFiltered.map(d => ({
      'Inquilino': getInquilinoNome(d),
      'Imóvel': getCodigoImovel(d),
      'Modelo': getModeloImovel(d),
      'Total c/ Encargos': Number(d.valorTotal || d.valorOriginal || 0),
      'Valor Recebido': Number(d.valorRecebido || 0),
      'Mês Ref.': d.mesReferencia || '',
      'Vencimento Boleto': d.dataVencimento || '',
      'Data Pagamento': d.dataPagamento || '',
      'Garantia': getGarantia(d).label,
      'Garantida': GARANTIDA_OPCOES.find(o => o.value === getGarantida(d))?.label || 'Garantida',
      'Seguro Acionado': SEGURO_ACIONADO_OPCOES.find(o => o.value === (d.seguroAcionado || 'nao_acionado'))?.label || 'Não Acionado',
      'Data Seguro': d.dataSeguro || '',
      'Status': STATUS_OPCOES.find(o => o.value === d.status)?.label || 'Selecione',
      'Última Cobrança': d.ultimaCobranca || '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(dados)
    worksheet['!cols'] = [
      { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 16 },
      { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 24 }, { wch: 16 },
      { wch: 24 }, { wch: 14 }, { wch: 20 }, { wch: 18 },
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inadimplentes')
    const dataAtual = new Date().toISOString().split('T')[0]
    XLSX.writeFile(workbook, `inadimplentes_${dataAtual}.xlsx`)
  }

  return (
    <Layout title="Inadimplentes" subtitle="Controle de clientes com débitos pendentes">
      <div className="inadimplentes-page">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button onClick={() => navigate('/inadimplentes/cadastrar')}>
          <Plus /> Registrar Débito
        </Button>
        <Button variant="outline" onClick={() => navigate('/inadimplentes/importar')}>
          <FileSpreadsheet /> Importar Planilha
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={sortedFiltered.length === 0}>
          <FileSpreadsheet /> Exportar planilha
        </Button>
        <Button variant="outline" onClick={() => setShowHistoricoContatos(true)}>
          <MessageCircle /> Histórico de contatos
        </Button>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por inquilino, imóvel ou tipo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {showHistoricoContatos && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15, 23, 42, 0.45)' }}
          onClick={() => setShowHistoricoContatos(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="historico-contatos-titulo"
            style={{ width: '100%', maxWidth: 760, maxHeight: '85vh', overflow: 'hidden', borderRadius: 12, background: '#fff', boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)' }}
            onClick={event => event.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h2 id="historico-contatos-titulo" style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Histórico de contatos</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Eventos “Contato realizado” registrados nas timelines.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowHistoricoContatos(false)} aria-label="Fechar histórico de contatos" title="Fechar">
                <X />
              </Button>
            </div>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <Input
                type="search"
                placeholder="Buscar pelo nome do inquilino..."
                value={buscaHistoricoContatos}
                onChange={event => setBuscaHistoricoContatos(event.target.value)}
                aria-label="Buscar histórico pelo nome do inquilino"
              />
            </div>
            <div style={{ maxHeight: 'calc(85vh - 145px)', overflowY: 'auto', padding: 20 }}>
              {historicoContatos.length === 0 ? (
                <div className="empty-state">
                  <div className="es-icon">📞</div>
                  <h3>{buscaHistoricoContatos ? 'Nenhum contato encontrado' : 'Nenhum contato registrado'}</h3>
                  <p>{buscaHistoricoContatos ? 'Tente buscar por outro inquilino.' : 'Registre eventos “Contato realizado” na timeline de um débito.'}</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {historicoContatos.map(item => (
                    <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#f8fafc' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <strong style={{ color: '#0f172a' }}>{item.inquilinoNome}</strong>
                        <span style={{ flexShrink: 0, fontSize: 11, color: '#64748b' }}>
                          {item.criadoEm ? new Date(item.criadoEm).toLocaleString('pt-BR') : 'Data não informada'}
                        </span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
                        Imóvel: {item.codigoImovel || '—'} · {item.tipoDebito} · Referência: {item.mesReferencia}
                      </div>
                      {item.descricao && <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', color: '#334155' }}>{item.descricao}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Resumo Geral ── */}
      <div className="mb-6 flex flex-wrap items-stretch gap-2">
        <div className="grid flex-[1_1_480px] grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-2">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <TriangleAlert className="size-5" />
              </div>
              <div className="min-w-0">
                <p className=" font-semibold tracking-tight">{pendentes.length}</p>
                <p className="truncate text-sm text-muted-foreground">Débitos em Aberto</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-2">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600">
                <Wallet className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold tracking-tight">{fmtMoney(totalAberto)}</p>
                <p className="truncate text-sm text-muted-foreground">Total em Aberto</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-2">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <CircleCheck className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold tracking-tight">{fmtMoney(totalRecup)}</p>
                <p className="truncate text-sm text-muted-foreground">Total Recuperado</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="flex-[1_1_260px] max-w-[360px]">
          <CardContent className="flex items-center gap-2">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <Wallet className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold tracking-tight">
                {valorMedioAluguelInadimplentes > 0 ? fmtMoney(valorMedioAluguelInadimplentes) : '—'}
              </p>
              <p className="truncate text-sm text-muted-foreground">Aluguel médio dos inadimplentes</p>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-[1_1_260px] max-w-[360px]">
          <CardHeader className="flex min-w-0 flex-row items-center justify-between gap-2">
            <CardTitle className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
              <Trophy className="size-4" /> Ranking de Inadimplentes
            </CardTitle>
            {rankingInadimplentes.length > 0 ? (
              <Button variant="outline" size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setShowRankingModal(true)}>
                Ver lista completa
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Sem registros</span>
            )}
          </CardHeader>
        </Card>
      </div>

      {/* ── Tabela ── */}
      <Card className="spreadsheet-full-width">
        <CardHeader className="flex flex-col gap-2 border-b pb-3 md:flex-row md:items-end md:justify-between">
          <CardTitle className="text-lg md:flex-1">
            {mesSelecionado
              ? `Débitos — ${formatMonthLabel(mesSelecionado)} (${filtered.length})`
              : `Todos os Débitos (${filtered.length})`}
          </CardTitle>
          <div className="flex w-full flex-wrap items-end justify-end gap-2 md:ml-auto md:w-auto">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Data inicial (cards)</label>
              <input
                type="date"
                value={cardsDataInicio}
                onChange={e => setCardsDataInicio(e.target.value)}
                style={{ fontSize: 12, padding: '5px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Data final (cards)</label>
              <input
                type="date"
                value={cardsDataFim}
                onChange={e => setCardsDataFim(e.target.value)}
                style={{ fontSize: 12, padding: '5px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
              />
            </div>
            {(cardsDataInicio || cardsDataFim) && (
              <Button variant="outline" size="sm" onClick={() => { setCardsDataInicio(''); setCardsDataFim('') }}>
                Limpar período dos cards
              </Button>
            )}
            {(colFilters.inquilino || colFilters.imovel || colFilters.modelo || colFilters.garantia || colFilters.garantida || colFilters.seguroAcionado.length > 0 || colFilters.mesReferencia || colFilters.vencimento || colFilters.pagamentoInicio || colFilters.pagamentoFim || colFilters.dataSeguro || colFilters.ultimaCobranca || colFilters.totalMin || colFilters.totalMax || colFilters.valorRecebidoMin || colFilters.valorRecebidoMax || (!isDefaultStatusFiltro(colFilters.status) && !isTodosStatusFiltro(colFilters.status))) && (
              <Button variant="outline" size="sm" onClick={limparColFilters}>
                Limpar filtros
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0">
        <div className="table-container">
          {loading ? (
            <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
          ) : (
            <table className="inadimplentes-table">
              <thead>
                <tr>
                  {[
                    ['inquilino', 'Inquilino'],
                    ['imovel', 'Imóvel'],
                    ['modelo', 'Modelo'],
                    ['total', 'Total c/ Encargos'],
                    ['recebido', 'Valor Recebido'],
                    ['mesReferencia', 'Mês Ref.'],
                    ['vencimento', 'Vencimento Boleto'],
                    ['pagamento', 'Data Pagamento'],
                    ['garantia', 'Garantia'],
                    ['garantida', 'Garantida'],
                    ['seguroAcionado', 'Seguro Acionado'],
                    ['dataSeguro', 'Data Seguro'],
                    ['status', 'Status'],
                    ['ultimaCobranca', 'Última Cobrança'],
                  ].map(([field, label]) => (
                    <th key={field}>
                      <button
                        type="button"
                        className="sortable-header"
                        onClick={() => toggleSort(field)}
                        aria-label={`Ordenar por ${label}`}
                      >
                        {label}<span aria-hidden="true">{sortArrow(field)}</span>
                      </button>
                    </th>
                  ))}
                  <th>Ações</th>
                </tr>
                <tr className="filter-row">
                  <th>
                    <input
                      type="text"
                      placeholder="Filtrar..."
                      value={colFilters.inquilino}
                      onChange={e => setColFilter('inquilino', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    />
                  </th>
                  <th>
                    <input
                      type="text"
                      placeholder="Filtrar..."
                      value={colFilters.imovel}
                      onChange={e => setColFilter('imovel', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    />
                  </th>
                  <th>
                    <select
                      value={colFilters.modelo}
                      onChange={e => setColFilter('modelo', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 4px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    >
                      <option value="">Todos</option>
                      {modeloOptions.map(modelo => (
                        <option key={modelo} value={modelo}>{modelo}</option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Min"
                        value={colFilters.totalMin}
                        onChange={e => setColFilter('totalMin', e.target.value)}
                        style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Max"
                        value={colFilters.totalMax}
                        onChange={e => setColFilter('totalMax', e.target.value)}
                        style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                      />
                    </div>
                  </th>
                  <th>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Min"
                        value={colFilters.valorRecebidoMin}
                        onChange={e => setColFilter('valorRecebidoMin', e.target.value)}
                        style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Max"
                        value={colFilters.valorRecebidoMax}
                        onChange={e => setColFilter('valorRecebidoMax', e.target.value)}
                        style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                      />
                    </div>
                  </th>
                  <th>
                    <select
                      value={colFilters.mesReferencia}
                      onChange={e => setColFilter('mesReferencia', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 4px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    >
                      <option value="">Todos</option>
                      {mesRefOptions.map(m => (
                        <option key={m} value={m}>{formatMonthShort(m)}</option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <input
                      type="date"
                      value={colFilters.vencimento}
                      onChange={e => setColFilter('vencimento', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    />
                  </th>
                  <th>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <input
                        type="date"
                        value={colFilters.pagamentoInicio}
                        onChange={e => setColFilter('pagamentoInicio', e.target.value)}
                        aria-label="Data inicial do pagamento"
                        style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                      />
                      <input
                        type="date"
                        value={colFilters.pagamentoFim}
                        onChange={e => setColFilter('pagamentoFim', e.target.value)}
                        aria-label="Data final do pagamento"
                        style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                      />
                    </div>
                  </th>
                  <th>
                    <select
                      value={colFilters.garantia}
                      onChange={e => setColFilter('garantia', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 4px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    >
                      <option value="">Todas</option>
                      {garantiaOptions.map(g => (
                        <option key={g} value={g}>{GARANTIA_LABELS[g] || g}</option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <select
                      value={colFilters.garantida}
                      onChange={e => setColFilter('garantida', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 4px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    >
                      <option value="">Todas</option>
                      {GARANTIDA_OPCOES.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </th>
                  <th ref={seguroAcionadoFilterRef}>
                    <button
                      type="button"
                      onClick={() => setSeguroAcionadoFilterOpen(o => !o)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', textAlign: 'left', cursor: 'pointer' }}
                    >
                      {colFilters.seguroAcionado.length === 0
                        ? 'Todos'
                        : colFilters.seguroAcionado.length === SEGURO_ACIONADO_OPCOES.length
                        ? 'Todos'
                        : `${colFilters.seguroAcionado.length} selecionado(s)`} ▾
                    </button>
                    {seguroAcionadoFilterOpen && seguroAcionadoFilterRect && createPortal(
                      <div ref={seguroAcionadoFilterPanelRef} style={{ position: 'fixed', top: seguroAcionadoFilterRect.top, left: seguroAcionadoFilterRect.left, zIndex: 9999, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: 8, minWidth: 210 }}>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setColFilter('seguroAcionado', SEGURO_ACIONADO_OPCOES.map(o => o.value))}>Todos</button>
                          <button type="button" className="btn btn-sm btn-secondary" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setColFilter('seguroAcionado', [])}>Nenhum</button>
                        </div>
                        {SEGURO_ACIONADO_OPCOES.map(o => (
                          <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 2px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input
                              type="checkbox"
                              checked={colFilters.seguroAcionado.includes(o.value)}
                              onChange={() => toggleSeguroAcionadoFiltro(o.value)}
                            />
                            {o.label}
                          </label>
                        ))}
                      </div>,
                      document.body
                    )}
                  </th>
                  <th>
                    <input
                      type="date"
                      value={colFilters.dataSeguro}
                      onChange={e => setColFilter('dataSeguro', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    />
                  </th>
                  <th ref={statusFilterRef}>
                    <button
                      type="button"
                      onClick={() => setStatusFilterOpen(o => !o)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', textAlign: 'left', cursor: 'pointer' }}
                    >
                      {colFilters.status.length === 0
                        ? 'Nenhum'
                        : colFilters.status.length === STATUS_OPCOES.length
                        ? 'Todos'
                        : `${colFilters.status.length} selecionado(s)`} ▾
                    </button>
                    {statusFilterOpen && statusFilterRect && createPortal(
                      <div ref={statusFilterPanelRef} style={{ position: 'fixed', top: statusFilterRect.top, left: statusFilterRect.left, zIndex: 9999, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: 8, minWidth: 190 }}>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setColFilter('status', STATUS_OPCOES.map(o => o.value))}>Todos</button>
                          <button type="button" className="btn btn-sm btn-secondary" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setColFilter('status', [])}>Nenhum</button>
                        </div>
                        {STATUS_OPCOES.map(o => (
                          <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 2px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input
                              type="checkbox"
                              checked={colFilters.status.includes(o.value)}
                              onChange={() => toggleStatusFiltro(o.value)}
                            />
                            {o.label}
                          </label>
                        ))}
                      </div>,
                      document.body
                    )}
                  </th>
                  <th>
                    <input
                      type="date"
                      value={colFilters.ultimaCobranca}
                      onChange={e => setColFilter('ultimaCobranca', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    />
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={15}>
                      <div className="empty-state">
                        <div className="es-icon">✅</div>
                        <h3>Nenhum débito encontrado</h3>
                        <p>Todos os pagamentos estão em dia.</p>
                      </div>
                    </td>
                  </tr>
                ) : sortedFiltered.map(d => (
                  <tr key={d.id}>
                    <td>
                      <strong
                        className="link-btn"
                        style={{ cursor: 'pointer' }}
                        onClick={() => goInquilino(d)}
                        title="Abrir cadastro do inquilino"
                      >
                        {getInquilinoNome(d)}
                      </strong>
                    </td>
                    <td>
                      {getCodigoImovel(d) ? (
                        <span
                          className="link-btn"
                          style={{ cursor: 'pointer' }}
                          onClick={() => goImovel(d)}
                          title="Abrir cadastro do imóvel"
                        >
                          {getCodigoImovel(d)}
                        </span>
                      ) : '—'}
                    </td>
                    <td>{getModeloImovel(d) || '—'}</td>
                    <td><strong>{fmtMoney(d.valorTotal)}</strong></td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        value={d.valorRecebido ?? ''}
                        onChange={e => handleValorRecebidoChange(d.id, e.target.value)}
                        style={{ width: 100, fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                      />
                    </td>
                    <td>{d.mesReferencia ? formatMonthShort(d.mesReferencia) : '—'}</td>
                    <td>
                      <input
                        type="date"
                        value={d.dataVencimento || ''}
                        onChange={e => handleDataVencimentoChange(d.id, e.target.value)}
                        aria-label={`Data de vencimento do boleto de ${getInquilinoNome(d)}`}
                        style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                      />
                    </td>
                    <td>
                      {podeInformarDataPagamento(d) ? (
                        <input
                          type="date"
                          value={d.dataPagamento || ''}
                          onChange={e => handleDataPagamentoChange(d.id, e.target.value)}
                          aria-label={`Data de pagamento de ${getInquilinoNome(d)}`}
                          style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                        />
                      ) : (
                        <span style={{ color: '#64748b', fontSize: 12 }}>{d.dataPagamento ? d.dataPagamento : '—'}</span>
                      )}
                    </td>
                    <td>
                      {(() => {
                        const { key: gKey, label: g, seguro: seguroNome } = getGarantia(d)
                        const seguroCor = gKey === 'seguro' ? segurosCatalogo.find(sc => sc.nome === seguroNome)?.cor : null
                        const style = seguroCor
                          ? { bg: `${seguroCor}22`, color: seguroCor, border: seguroCor, icon: GARANTIA_STYLE.seguro.icon }
                          : (GARANTIA_STYLE[gKey] || GARANTIA_STYLE.sem_garantia)
                        const isEditing = editingGarantiaId === d.id

                        if (isEditing) {
                          const inquilino = inquilinos.find(i => i.id === d.inquilinoId)
                          const seguroAtual = inquilino?.seguro || d.seguro || ''
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
                              <select
                                autoFocus
                                value={gKey}
                                onChange={e => handleGarantiaChange(d, e.target.value)}
                                style={{ fontSize: 11, padding: '2px 4px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                              >
                                {GARANTIA_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                              {gKey === 'seguro' && (
                                <select
                                  value={seguroAtual}
                                  onChange={e => handleSeguroProviderChange(d, e.target.value)}
                                  style={{ fontSize: 11, padding: '2px 4px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                                >
                                  <option value="">Seguradora...</option>
                                  {segurosCatalogo.map(o => <option key={o.id} value={o.nome}>{o.nome}</option>)}
                                </select>
                              )}
                              <button type="button" className="btn btn-sm btn-secondary" style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => setEditingGarantiaId(null)}>Fechar</button>
                            </div>
                          )
                        }

                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span
                              style={{fontSize: 11, fontWeight: 600, borderRadius: 0, padding: '2px 8px', background: style.bg, whiteSpace: 'nowrap', color: style.color, border: `1px solid ${style.border}`, cursor: 'pointer'}}
                              title="Clique para alterar a garantia"
                              onClick={() => setEditingGarantiaId(d.id)}
                            >
                            {style.icon} {g}
                          </span>
                            {gKey === 'seguro' && (
                              <button
                                type="button"
                                title="Abrir portal da seguradora"
                                onClick={() => abrirGarantia(d)}
                                style={{ fontSize: 11, lineHeight: 1, padding: '3px 5px', borderRadius: 0, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
                              >
                                🔗
                              </button>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                    <td>
                      {(() => {
                        const gd = getGarantida(d)
                        const style = GARANTIDA_STYLE[gd]
                        const label = GARANTIDA_OPCOES.find(o => o.value === gd)?.label
                        return (
                          <span
                            style={{ fontSize: 11, fontWeight: 600, borderRadius: 0, padding: '2px 8px', background: style.bg, whiteSpace: 'nowrap', color: style.color, border: `1px solid ${style.border}`, cursor: 'pointer' }}
                            title="Clique para alternar"
                            onClick={() => handleGarantidaChange(d.id, gd === 'garantida' ? 'nao_garantida' : 'garantida')}
                          >
                            {label}
                          </span>
                        )
                      })()}
                    </td>
                    <td>
                      {getGarantia(d).key === 'seguro' && (() => {
                        const current = SEGURO_ACIONADO_OPCOES.find(o => o.value === d.seguroAcionado) || SEGURO_ACIONADO_OPCOES[0]
                        return (
                          <select
                            value={current.value}
                            onChange={e => handleSeguroAcionadoChange(d, e.target.value)}
                            style={{
                              fontSize: 11, fontWeight: 600, borderRadius: 0, padding: '2px 8px',
                              background: current.bg,
                              color: current.color,
                              border: `1px solid ${current.border}`,
                              cursor: 'pointer'
                            }}
                          >
                            {SEGURO_ACIONADO_OPCOES.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        )
                      })()}
                    </td>
                    <td>
                      <input
                        type="date"
                        value={d.dataSeguro || ''}
                        onChange={e => handleDataSeguroChange(d.id, e.target.value)}
                        style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                      />
                    </td>
                    <td>
                      {(() => {
                        const current = STATUS_OPCOES.find(o => o.value === d.status) || STATUS_OPCOES[0]
                        return (
                          <select
                            value={current.value}
                            onChange={e => handleStatusChange(d, e.target.value)}
                            style={{
                              fontSize: 11, fontWeight: 600, borderRadius: 0, padding: '2px 8px',
                              background: current.bg,
                              color: current.color,
                              border: `1px solid ${current.border}`,
                              cursor: 'pointer'
                            }}
                          >
                            {STATUS_OPCOES.filter(o => o.value !== 'pago_caucao' || ['caucao', 'adiantamento'].includes(getGarantia(d).key)).map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        )
                      })()}
                    </td>
                    <td>
                      <input
                        type="date"
                        value={d.ultimaCobranca || ''}
                        onChange={e => handleUltimaCobrancaChange(d.id, e.target.value)}
                        style={{ fontSize: 12, padding: '2px 6px', borderRadius: 0, border: '1px solid #e2e8f0' }}
                      />
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <Button size="sm" className="bg-[#25d366] text-white hover:bg-[#1fb057]" onClick={() => abrirWhatsApp(d)}>
                          <MessageCircle /> 
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/inadimplentes/editar/${d.id}`)}>
                          <Pencil />
                        </Button>
                        <Button variant="destructive" size="icon" className="size-8" onClick={() => handleDelete(d.id)}>
                          <X />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </CardContent>
      </Card>

      {/* ── Modal: ranking completo de inadimplentes ── */}
      {showRankingModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowRankingModal(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>🔝 Ranking de Inadimplentes</h3>
              <Button variant="outline" size="icon" className="size-8" onClick={() => setShowRankingModal(false)}><X /></Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rankingInadimplentes.map((t, i) => (
                <div key={t.nome + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', width: 24 }}>{i + 1}º</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t.nome}</span>
                  <span className="badge badge-red" style={{ flexShrink: 0 }}>{t.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </Layout>
  )
}
