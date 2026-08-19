import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  TriangleAlert,
  Wallet,
  CircleCheck,
  CalendarClock,
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
]

const SEGURO_ACIONADO_OPCOES = [
  { value: 'nao_acionado',          label: 'Não Acionado',          bg: '#ff979786', color: '#a12525', border: '#8d1d1d' },
  { value: 'acionado',              label: 'Acionado',              bg: '#9fdaa788', color: '#01a001', border: '#04a119' },
  { value: 'aguardar_para_acionar', label: 'Aguardar para Acionar', bg: '#adadad8a', color: '#555555', border: '#585858' },
  { value: 'necessita_documentos',  label: 'Necessita Documentos',  bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  { value: 'pagamento_aprovado',    label: 'Pagamento Aprovado',    bg: '#f0fdf4', color: '#166534', border: '#86efac' },
  { value: 'pagamento_reprovado',   label: 'Pagamento Reprovado',   bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
]

const GARANTIA_LABELS = {
  seguro:       'S.F.',
  caucao:       'Caução',
  adiantamento: 'Adiantamento',
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
  { value: 'sem_garantia', label: 'Sem Garantia' },
]

const GARANTIA_STYLE = {
  seguro:       { bg: '#ede9fe', color: '#7c3aed', border: '#c4b5fd', icon: '🛡️' },
  caucao:       { bg: '#f0fdf4', color: '#166534', border: '#86efac', icon: '💰' },
  adiantamento: { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd', icon: '💵' },
  sem_garantia: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', icon: '🚫' },
}

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
  const pending = list.filter(d => d.status !== 'pago')
  const paid    = list.filter(d => d.status === 'pago')
  const uniqueInq = new Set(pending.map(d => d.inquilinoId).filter(Boolean))
  return {
    totalInadimplentes: uniqueInq.size || pending.length,
    valorAberto:    pending.reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0),
    valorRecuperado: paid.reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0),
    totalDebitos: list.length,
  }
}

// Por padrão o filtro de status mostra tudo, exceto os débitos já pagos
const DEFAULT_STATUS_FILTRO = STATUS_OPCOES.filter(o => o.value !== 'pago').map(o => o.value)

const isDefaultStatusFiltro = (arr) =>
  arr.length === DEFAULT_STATUS_FILTRO.length && DEFAULT_STATUS_FILTRO.every(v => arr.includes(v))

export default function Inadimplentes() {
  const navigate = useNavigate()
  const [debitos, setDebitos] = useState([])
  const [inquilinos, setInquilinos] = useState([])
  const [imoveis, setImoveis] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [mesSelecionado, setMesSelecionado] = useState(null)
  const [showRankingModal, setShowRankingModal] = useState(false)
  const [editingGarantiaId, setEditingGarantiaId] = useState(null)
  const [segurosCatalogo, setSegurosCatalogo] = useState([])
  const [statusFilterOpen, setStatusFilterOpen] = useState(false)
  const statusFilterRef = useRef(null)
  const [colFilters, setColFilters] = useState({
    inquilino: '',
    imovel: '',
    garantia: '',
    seguroAcionado: '',
    mesReferencia: '',
    status: DEFAULT_STATUS_FILTRO,
  })

  const setColFilter = (field, value) =>
    setColFilters(prev => ({ ...prev, [field]: value }))

  const toggleStatusFiltro = (value) =>
    setColFilters(prev => ({
      ...prev,
      status: prev.status.includes(value) ? prev.status.filter(v => v !== value) : [...prev.status, value],
    }))

  const limparColFilters = () =>
    setColFilters({
      inquilino: '', imovel: '', garantia: '', seguroAcionado: '',
      mesReferencia: '', status: DEFAULT_STATUS_FILTRO,
    })

  useEffect(() => {
    if (!statusFilterOpen) return
    const handler = (e) => {
      if (statusFilterRef.current && !statusFilterRef.current.contains(e.target)) setStatusFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [statusFilterOpen])

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
    const g = d.garantia || inquilinos.find(i => i.id === d.inquilinoId)?.garantia || 'sem_garantia'
    const s = d.seguro   || inquilinos.find(i => i.id === d.inquilinoId)?.seguro
    const label = GARANTIA_LABELS[g] || g
    const fullLabel = (g === 'seguro' && s) ? `${label} | ${SEGURO_LABELS[s] || s}` : label
    return { key: g, label: fullLabel }
  }

  // O cadastro do inquilino e do imóvel são as fontes vivas; as cópias gravadas no débito
  // (inquilinoNome/codigoImovel) podem ficar desatualizadas, então só servem de fallback.
  const getInquilinoNome = (d) =>
    inquilinos.find(i => i.id === d.inquilinoId)?.nome || d.inquilinoNome || 'Sem nome'

  const getCodigoImovel = (d) => {
    const inquilino = inquilinos.find(i => i.id === d.inquilinoId)
    const imovel = imoveis.find(im => im.id === inquilino?.imovelId)
    return imovel?.codigo || inquilino?.codigoImovel || d.codigoImovel || ''
  }

  const getImovelId = (d) => inquilinos.find(i => i.id === d.inquilinoId)?.imovelId || ''

  const goInquilino = (d) => d.inquilinoId && navigate(`/inquilinos/editar/${d.inquilinoId}`)
  const goImovel = (d) => { const imovelId = getImovelId(d); if (imovelId) navigate(`/imoveis/editar/${imovelId}`) }

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este débito?')) return
    await remove(ref(db, `inadimplencias/${id}`))
  }

  const handleSeguroAcionadoChange = async (id, value) => {
    await update(ref(db, `inadimplencias/${id}`), { seguroAcionado: value })
  }

  const handleStatusChange = async (id, value) => {
    await update(ref(db, `inadimplencias/${id}`), { status: value })
  }

  const handleUltimaCobrancaChange = async (id, value) => {
    await update(ref(db, `inadimplencias/${id}`), { ultimaCobranca: value })
  }

  const handleDataSeguroChange = async (id, value) => {
    await update(ref(db, `inadimplencias/${id}`), { dataSeguro: value })
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

  const pendentes    = debitos.filter(d => d.status !== 'pago')
  const totalAberto  = pendentes.reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0)
  const totalRecup   = debitos.filter(d => d.status === 'pago').reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0)
  const vencidos30   = pendentes.filter(d => {
    if (!d.dataVencimento) return false
    return (Date.now() - new Date(d.dataVencimento).getTime()) / 86400000 > 30
  }).length

  // Ranking dos inquilinos ativos com mais inadimplências cadastradas (histórico completo, não só em aberto)
  const rankingInadimplentes = (() => {
    const counts = {}
    debitos.forEach(d => {
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
  const topInadimplentes = rankingInadimplentes.slice(0, 5)

  const monthGroups = buildMonthGroups(debitos)

  const baseList = mesSelecionado
    ? debitos.filter(d => (getMonth(d) || 'sem-mes') === mesSelecionado)
    : debitos

  // Opções únicas para os selects de filtro (calculadas a partir da lista atual)
  const mesRefOptions = [...new Set(baseList.map(d => d.mesReferencia).filter(Boolean))].sort((a, b) => b.localeCompare(a))
  const garantiaOptions = [...new Set(baseList.map(d => getGarantia(d).key))]

  const filtered = baseList
    .filter(d =>
      getInquilinoNome(d).toLowerCase().includes(search.toLowerCase()) ||
      getCodigoImovel(d).toLowerCase().includes(search.toLowerCase()) ||
      d.tipoDebito?.toLowerCase().includes(search.toLowerCase())
    )
    .filter(d => !colFilters.inquilino || getInquilinoNome(d).toLowerCase().includes(colFilters.inquilino.toLowerCase()))
    .filter(d => !colFilters.imovel || getCodigoImovel(d).toLowerCase().includes(colFilters.imovel.toLowerCase()))
    .filter(d => !colFilters.garantia || getGarantia(d).key === colFilters.garantia)
    .filter(d => !colFilters.seguroAcionado || (d.seguroAcionado || 'nao_acionado') === colFilters.seguroAcionado)
    .filter(d => !colFilters.mesReferencia || d.mesReferencia === colFilters.mesReferencia)
    .filter(d => colFilters.status.includes(STATUS_OPCOES.find(o => o.value === d.status)?.value || 'selecione'))

  return (
    <Layout title="Inadimplentes" subtitle="Controle de clientes com débitos pendentes">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button onClick={() => navigate('/inadimplentes/cadastrar')}>
          <Plus /> Registrar Débito
        </Button>
        <Button variant="outline" onClick={() => navigate('/inadimplentes/importar')}>
          <FileSpreadsheet /> Importar Planilha
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

      {/* ── Resumo Geral ── */}
      <div className="mb-6 flex flex-wrap items-stretch gap-4">
        <div className="grid flex-[1_1_480px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <TriangleAlert className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold tracking-tight">{pendentes.length}</p>
                <p className="truncate text-sm text-muted-foreground">Débitos em Aberto</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600">
                <Wallet className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold tracking-tight">{fmtMoney(totalAberto)}</p>
                <p className="truncate text-sm text-muted-foreground">Total em Aberto</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <CircleCheck className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold tracking-tight">{fmtMoney(totalRecup)}</p>
                <p className="truncate text-sm text-muted-foreground">Total Recuperado</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
                <CalendarClock className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold tracking-tight">{vencidos30}</p>
                <p className="truncate text-sm text-muted-foreground">Vencidos há +30 dias</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="flex-[1_1_400px] max-w-[700px] flex-row items-stretch">
          <CardHeader className="flex w-48 shrink-0 flex-col items-start justify-center gap-2 border-r border-b-0 pr-4 pb-0">
            <CardTitle className="flex items-center gap-1.5 text-base">
              <Trophy className="size-4" /> Top 5 Inadimplentes
            </CardTitle>
            {rankingInadimplentes.length > 5 && (
              <Button variant="outline" size="sm" onClick={() => setShowRankingModal(true)}>
                Ver lista completa
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex-1">
            {topInadimplentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum débito cadastrado.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {topInadimplentes.map((t, i) => (
                  <div key={t.nome + i} className="flex items-center gap-2.5">
                    <span className="w-4 text-xs font-bold text-muted-foreground">{i + 1}º</span>
                    <span className="flex-1 truncate text-sm font-semibold">{t.nome}</span>
                    <Badge variant="destructive" className="shrink-0">{t.total}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Resumo por Mês ── */}
      {monthGroups.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="flex-row items-center justify-between gap-2 border-b pb-4">
            <CardTitle className="text-lg">Inadimplência por Mês</CardTitle>
            {mesSelecionado && (
              <Button variant="outline" size="sm" onClick={() => setMesSelecionado(null)}>
                Limpar filtro
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="month-group-grid">
              {monthGroups.map(([ym, list]) => {
                const s = monthStats(list)
                const active = mesSelecionado === ym
                return (
                  <button
                    key={ym}
                    className={`month-card${active ? ' active' : ''}`}
                    onClick={() => setMesSelecionado(active ? null : ym)}
                    type="button"
                  >
                    <div className="mc-month">{formatMonthLabel(ym)}</div>
                    <div className="mc-stats">
                      <div className="mc-stat">
                        <span className="mc-stat-label"><span className="mc-stat-icon">👤</span> Inadimplentes</span>
                        <span className="mc-stat-value">{s.totalInadimplentes}</span>
                      </div>
                      <div className="mc-stat">
                        <span className="mc-stat-label"><span className="mc-stat-icon">💸</span> Em Aberto</span>
                        <span className="mc-stat-value">{fmtMoney(s.valorAberto)}</span>
                      </div>
                      <div className="mc-stat">
                        <span className="mc-stat-label"><span className="mc-stat-icon">✅</span> Recuperado</span>
                        <span className="mc-stat-value">{fmtMoney(s.valorRecuperado)}</span>
                      </div>
                    </div>
                    <div className="mc-total">{s.totalDebitos} débito{s.totalDebitos !== 1 ? 's' : ''}</div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tabela ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 border-b pb-4">
          <CardTitle className="text-lg">
            {mesSelecionado
              ? `Débitos — ${formatMonthLabel(mesSelecionado)} (${filtered.length})`
              : `Todos os Débitos (${filtered.length})`}
          </CardTitle>
          {(colFilters.inquilino || colFilters.imovel || colFilters.garantia || colFilters.seguroAcionado || colFilters.mesReferencia || !isDefaultStatusFiltro(colFilters.status)) && (
            <Button variant="outline" size="sm" onClick={limparColFilters}>
              Limpar filtros
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-0">
        <div className="table-container">
          {loading ? (
            <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Inquilino</th>
                  <th>Imóvel</th>
                  <th>Total c/ Encargos</th>
                  <th>Mês Ref.</th>
                  <th>Garantia</th>
                  <th>Seguro Acionado</th>
                  <th>Data Seguro</th>
                  <th>Status</th>
                  <th>Última Cobrança</th>
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
                  <th></th>
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
                      value={colFilters.seguroAcionado}
                      onChange={e => setColFilter('seguroAcionado', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 4px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    >
                      <option value="">Todos</option>
                      {SEGURO_ACIONADO_OPCOES.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </th>
                  <th></th>
                  <th ref={statusFilterRef} style={{ position: 'relative' }}>
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
                    {statusFilterOpen && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: 8, minWidth: 190, marginTop: 4 }}>
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
                      </div>
                    )}
                  </th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-state">
                        <div className="es-icon">✅</div>
                        <h3>Nenhum débito encontrado</h3>
                        <p>Todos os pagamentos estão em dia.</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(d => (
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
                    <td><strong>{fmtMoney(d.valorTotal)}</strong></td>
                    <td>{d.mesReferencia ? formatMonthShort(d.mesReferencia) : '—'}</td>
                    <td>
                      {(() => {
                        const { key: gKey, label: g } = getGarantia(d)
                        const style = GARANTIA_STYLE[gKey] || GARANTIA_STYLE.sem_garantia
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
                              style={{fontSize: 11, fontWeight: 600, borderRadius: 10, padding: '2px 8px', background: style.bg, whiteSpace: 'nowrap', color: style.color, border: `1px solid ${style.border}`, cursor: 'pointer'}}
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
                                style={{ fontSize: 11, lineHeight: 1, padding: '3px 5px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
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
                        const current = SEGURO_ACIONADO_OPCOES.find(o => o.value === d.seguroAcionado) || SEGURO_ACIONADO_OPCOES[0]
                        return (
                          <select
                            value={current.value}
                            onChange={e => handleSeguroAcionadoChange(d.id, e.target.value)}
                            style={{
                              fontSize: 11, fontWeight: 600, borderRadius: 10, padding: '2px 8px',
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
                            onChange={e => handleStatusChange(d.id, e.target.value)}
                            style={{
                              fontSize: 11, fontWeight: 600, borderRadius: 10, padding: '2px 8px',
                              background: current.bg,
                              color: current.color,
                              border: `1px solid ${current.border}`,
                              cursor: 'pointer'
                            }}
                          >
                            {STATUS_OPCOES.map(o => (
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
                        style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                      />
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <Button size="sm" className="bg-[#25d366] text-white hover:bg-[#1fb057]" onClick={() => abrirWhatsApp(d)}>
                          <MessageCircle /> WhatsApp
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/inadimplentes/editar/${d.id}`)}>
                          <Pencil /> Editar
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
    </Layout>
  )
}
