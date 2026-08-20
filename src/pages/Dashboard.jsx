import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Building2,
  Users,
  TriangleAlert,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Trophy,
} from 'lucide-react'

const MONTH_LABELS = [
  'Jan', 'Fev', 'Mar', 'Abr',
  'Mai', 'Jun', 'Jul', 'Ago',
  'Set', 'Out', 'Nov', 'Dez',
]

const MONTH_FULL_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril',
  'Maio', 'Junho', 'Julho', 'Agosto',
  'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const GARANTIA_LABELS = {
  seguro:       'S.F.',
  caucao:       'Caução',
  adiantamento: 'Adiantamento',
  sem_garantia: 'Sem Garantia',
}

const MODELO_LABELS = {
  MA: 'MA',
  ME: 'ME',
  ML: 'ML',
}

const fmtMoney = (value) =>
  'R$ ' + Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const getMonthKey = (item) =>
  item.mesReferencia || (item.dataVencimento ? item.dataVencimento.substring(0, 7) : null)

const getMonthLabel = (monthKey) => {
  if (!monthKey) return 'Ano inteiro'
  const [year, month] = monthKey.split('-')
  return new Date(+year, +month - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase())
}

const DONUT_RADIUS = 40
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS

const buildMonthlyTotals = (items, year) => {
  const map = {}
  items.forEach(item => {
    const monthKey = getMonthKey(item)
    if (!monthKey?.startsWith(year)) return
    const value = parseFloat(item.valorTotal) || parseFloat(item.valorOriginal) || 0
    if (!map[monthKey]) {
      map[monthKey] = { inadimplente: 0, recuperado: 0, aprovadoSeguradora: 0, aguardarAcionar: 0 }
    }
    if (item.status === 'pago') {
      map[monthKey].recuperado += value
    } else if (item.seguroAcionado === 'pagamento_aprovado') {
      map[monthKey].aprovadoSeguradora += value
    } else if (item.seguroAcionado === 'aguardar_para_acionar') {
      map[monthKey].aguardarAcionar += value
    } else {
      map[monthKey].inadimplente += value
    }
  })
  return map
}

const getPieSegments = (inadimplente, recuperado, aprovadoSeguradora, aguardarAcionar) => {
  const total = inadimplente + recuperado + aprovadoSeguradora + aguardarAcionar
  const recoveredPercent = total > 0 ? Math.round((recuperado / total) * 100) : 0
  const approvedPercent = total > 0 ? Math.round((aprovadoSeguradora / total) * 100) : 0
  const waitingPercent = total > 0 ? Math.round((aguardarAcionar / total) * 100) : 0
  return {
    recoveredPercent,
    approvedPercent,
    waitingPercent,
    percentage: recoveredPercent,
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const now = new Date()
  const currentYear = String(now.getFullYear())
  const currentMonth = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [imoveis, setImoveis] = useState([])
  const [inquilinos, setInquilinos] = useState([])
  const [inadimplencias, setInadimplencias] = useState([])
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [topFilter, setTopFilter] = useState('valor')
  const [periodMode, setPeriodMode] = useState('month') // 'month' | 'ano' | 'h1' | 'h2'
  const [colFilters, setColFilters] = useState({
    modelo: '',
    garantia: '',
  })

  const setColFilter = (field, value) =>
    setColFilters(prev => ({ ...prev, [field]: value }))

  const limparColFilters = () =>
    setColFilters({ modelo: '', garantia: '' })

  useEffect(() => {
    const imoveisRef = ref(db, 'imoveis')
    const inquilinosRef = ref(db, 'inquilinos')
    const inadimplenciasRef = ref(db, 'inadimplencias')

    const unsubImoveis = onValue(imoveisRef, snap => {
      const data = snap.val()
      setImoveis(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
    })

    const unsubInquilinos = onValue(inquilinosRef, snap => {
      const data = snap.val()
      setInquilinos(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
    })

    const unsubInadimplencias = onValue(inadimplenciasRef, snap => {
      const data = snap.val()
      setInadimplencias(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
    })

    return () => {
      unsubImoveis()
      unsubInquilinos()
      unsubInadimplencias()
    }
  }, [])

  const totalImoveis = imoveis.length
  const totalInquilinosAtivos = useMemo(
    () => inquilinos.filter(i => i.status === 'Ativo').length,
    [inquilinos]
  )

  const receitaMensal = useMemo(
    () => inquilinos
      .filter(i => i.status === 'Ativo')
      .reduce((sum, inquilino) => sum + (parseFloat(inquilino.valorAluguel) || 0) + (parseFloat(inquilino.valorVaga) || 0), 0),
    [inquilinos]
  )

  const pendentes = useMemo(
    () => inadimplencias.filter(d => d.status !== 'pago'),
    [inadimplencias]
  )

  const uniqueInadimplentes = useMemo(() => {
    const ids = new Set()
    pendentes.forEach(d => {
      if (d.inquilinoId) ids.add(d.inquilinoId)
      else if (d.inquilinoNome) ids.add(d.inquilinoNome)
    })
    return ids.size
  }, [pendentes])

  const inquilinoMap = useMemo(
    () => Object.fromEntries(inquilinos.map(i => [i.id, i])),
    [inquilinos]
  )

  const imovelMap = useMemo(
    () => Object.fromEntries(imoveis.map(im => [im.id, im])),
    [imoveis]
  )

  const getGarantia = (d) => {
    const g = inquilinoMap[d.inquilinoId]?.garantia || d.garantia || 'sem_garantia'
    return { key: g, label: GARANTIA_LABELS[g] || g }
  }

  const getModeloImovel = (d) => {
    const inquilino = inquilinoMap[d.inquilinoId]
    const imovel = imovelMap[inquilino?.imovelId]
    return imovel?.modelo || ''
  }

  const getCodigoImovel = (d) => {
    const inquilino = inquilinoMap[d.inquilinoId]
    const imovel = imovelMap[inquilino?.imovelId]
    return imovel?.codigo || inquilino?.codigoImovel || d.codigoImovel || ''
  }

  // Opções dos selects de filtro, calculadas a partir de toda a base (independente do período selecionado)
  const garantiaOptions = useMemo(
    () => [...new Set(inadimplencias.map(d => getGarantia(d).key))],
    [inadimplencias, inquilinoMap]
  )
  const modeloOptions = useMemo(
    () => [...new Set(inadimplencias.map(d => getModeloImovel(d)).filter(Boolean))],
    [inadimplencias, inquilinoMap, imovelMap]
  )

  const filteredInadimplencias = useMemo(() => inadimplencias
    .filter(d => !colFilters.modelo || getModeloImovel(d) === colFilters.modelo)
    .filter(d => !colFilters.garantia || getGarantia(d).key === colFilters.garantia),
    [inadimplencias, colFilters, inquilinoMap, imovelMap]
  )

  const yearMonthTotals = useMemo(() => buildMonthlyTotals(filteredInadimplencias, selectedYear), [filteredInadimplencias, selectedYear])

  const monthCards = useMemo(() => MONTH_FULL_LABELS.map((label, index) => {
    const key = `${selectedYear}-${String(index + 1).padStart(2, '0')}`
    const totals = yearMonthTotals[key] || { inadimplente: 0, recuperado: 0, aprovadoSeguradora: 0, aguardarAcionar: 0 }
    const total = totals.inadimplente + totals.recuperado + totals.aprovadoSeguradora + totals.aguardarAcionar
    const recoveredPercent = total > 0 ? Math.round((totals.recuperado / total) * 100) : 0
    const approvedPercent = total > 0 ? Math.round((totals.aprovadoSeguradora / total) * 100) : 0
    const waitingPercent = total > 0 ? Math.round((totals.aguardarAcionar / total) * 100) : 0
    return {
      key,
      label,
      inadimplente: totals.inadimplente,
      recuperado: totals.recuperado,
      aprovadoSeguradora: totals.aprovadoSeguradora,
      aguardarAcionar: totals.aguardarAcionar,
      recoveredPercent,
      approvedPercent,
      waitingPercent,
      active: periodMode === 'month' && selectedMonth === key,
    }
  }), [selectedYear, selectedMonth, yearMonthTotals, periodMode])

  // Lista de mesKeys (YYYY-MM) que compõem o período atualmente selecionado
  const periodMonthKeys = useMemo(() => {
    const allMonths = MONTH_FULL_LABELS.map((_, i) => `${selectedYear}-${String(i + 1).padStart(2, '0')}`)
    if (periodMode === 'month' && selectedMonth) return [selectedMonth]
    if (periodMode === 'h1') return allMonths.slice(0, 6)
    if (periodMode === 'h2') return allMonths.slice(6)
    return allMonths // 'ano'
  }, [periodMode, selectedMonth, selectedYear])

  const selectedPeriodLabel = useMemo(() => {
    if (periodMode === 'month' && selectedMonth) return getMonthLabel(selectedMonth)
    if (periodMode === 'h1') return `1º semestre de ${selectedYear}`
    if (periodMode === 'h2') return `2º semestre de ${selectedYear}`
    return `Ano ${selectedYear}`
  }, [periodMode, selectedMonth, selectedYear])

  const periodDebts = useMemo(() => {
    const keys = new Set(periodMonthKeys)
    return filteredInadimplencias.filter(d => keys.has(getMonthKey(d)))
  }, [filteredInadimplencias, periodMonthKeys])

  const periodPagas = useMemo(
    () => periodDebts.filter(d => d.status === 'pago'),
    [periodDebts]
  )

  const totalPeriodValue = useMemo(
    () => periodDebts.reduce((sum, d) => sum + (parseFloat(d.valorTotal) || parseFloat(d.valorOriginal) || 0), 0),
    [periodDebts]
  )

  const recoveredValue = useMemo(
    () => periodPagas.reduce((sum, d) => sum + (parseFloat(d.valorTotal) || parseFloat(d.valorOriginal) || 0), 0),
    [periodPagas]
  )

  const selectedMonthTotals = useMemo(() => {
    return periodMonthKeys.reduce((acc, key) => {
      const totals = yearMonthTotals[key] || { inadimplente: 0, recuperado: 0, aprovadoSeguradora: 0, aguardarAcionar: 0 }
      return {
        inadimplente: acc.inadimplente + totals.inadimplente,
        recuperado: acc.recuperado + totals.recuperado,
        aprovadoSeguradora: acc.aprovadoSeguradora + (totals.aprovadoSeguradora || 0),
        aguardarAcionar: acc.aguardarAcionar + (totals.aguardarAcionar || 0),
      }
    }, { inadimplente: 0, recuperado: 0, aprovadoSeguradora: 0, aguardarAcionar: 0 })
  }, [periodMonthKeys, yearMonthTotals])

  const topInadimplentes = useMemo(() => {
    const map = {}
    periodDebts.forEach(debt => {
      const key = debt.inquilinoId || debt.inquilinoNome || 'desconhecido'
      const name = inquilinoMap[debt.inquilinoId]?.nome || debt.inquilinoNome || 'Desconhecido'
      const value = parseFloat(debt.valorTotal) || parseFloat(debt.valorOriginal) || 0
      if (!map[key]) {
        map[key] = { id: key, name, total: 0, count: 0 }
      }
      map[key].total += value
      map[key].count += 1
    })

    return Object.values(map)
      .sort((a, b) => {
        if (topFilter === 'quantidade') return b.count - a.count
        return b.total - a.total
      })
      .slice(0, 5)
  }, [periodDebts, inquilinoMap, topFilter])

  const pie = getPieSegments(
    selectedMonthTotals.inadimplente,
    selectedMonthTotals.recuperado,
    selectedMonthTotals.aprovadoSeguradora,
    selectedMonthTotals.aguardarAcionar
  )

  // Detalha, por débito, quem compõe cada uma das 4 categorias do card de recuperação (para os tooltips)
  const categoryBreakdown = useMemo(() => {
    const acc = { recuperado: [], aprovadoSeguradora: [], aguardarAcionar: [], inadimplente: [] }
    periodDebts.forEach(d => {
      const value = parseFloat(d.valorTotal) || parseFloat(d.valorOriginal) || 0
      const name = inquilinoMap[d.inquilinoId]?.nome || d.inquilinoNome || 'Sem nome'
      const imovel = getCodigoImovel(d)
      const entry = { name, imovel, value }
      if (d.status === 'pago') acc.recuperado.push(entry)
      else if (d.seguroAcionado === 'pagamento_aprovado') acc.aprovadoSeguradora.push(entry)
      else if (d.seguroAcionado === 'aguardar_para_acionar') acc.aguardarAcionar.push(entry)
      else acc.inadimplente.push(entry)
    })
    Object.values(acc).forEach(list => list.sort((a, b) => b.value - a.value))
    return acc
  }, [periodDebts, inquilinoMap, imovelMap])

  const renderBreakdownTooltip = (list) => (
    list.length === 0 ? (
      <span>Nenhuma inadimplência nesta categoria</span>
    ) : (
      <div className="flex max-h-60 flex-col gap-1 overflow-y-auto">
        {list.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <span className="truncate">{item.name}{item.imovel ? ` (${item.imovel})` : ''}</span>
            <span className="shrink-0 font-medium">{fmtMoney(item.value)}</span>
          </div>
        ))}
      </div>
    )
  )

  const handleYearChange = (direction) => {
    setSelectedYear(prev => {
      const year = String(Number(prev) + direction)
      return year
    })
    setSelectedMonth(prev => prev ? `${String(Number(prev.split('-')[0]) + direction)}-${prev.split('-')[1]}` : null)
  }

  const handleSelectMonth = (monthKey) => {
    setSelectedMonth(monthKey)
    setPeriodMode('month')
  }

  const handleSelectYear = () => {
    setSelectedMonth(null)
  }

  return (
    <Layout title="Dashboard" subtitle="Visão geral do sistema de gestão">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <Building2 className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{totalImoveis}</p>
              <p className="truncate text-sm text-muted-foreground">Total de Imóveis</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <Users className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{totalInquilinosAtivos}</p>
              <p className="truncate text-sm text-muted-foreground">Inquilinos Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <TriangleAlert className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{uniqueInadimplentes}</p>
              <p className="truncate text-sm text-muted-foreground">Inadimplentes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
              <Wallet className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-2xl font-semibold tracking-tight">{fmtMoney(receitaMensal)}</p>
              <p className="truncate text-sm text-muted-foreground">Receita Mensal</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between gap-4 border-b pb-4">
          <div>
            <CardTitle className="text-lg">Inadimplência por Período</CardTitle>
            <CardDescription>
              Navegue por ano e filtre por mês para ver valores e recuperação.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" onClick={() => handleYearChange(-1)} aria-label="Ano anterior">
              <ChevronLeft />
            </Button>
            <Badge variant="secondary" className="h-8 min-w-14 justify-center text-sm">{selectedYear}</Badge>
            <Button variant="outline" size="icon" onClick={() => handleYearChange(1)} aria-label="Próximo ano">
              <ChevronRight />
            </Button>
          </div>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <select
            value={colFilters.modelo}
            onChange={e => setColFilter('modelo', e.target.value)}
            style={{ fontSize: 12, padding: '5px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
          >
            <option value="">Modelo: Todos</option>
            {modeloOptions.map(m => (
              <option key={m} value={m}>{MODELO_LABELS[m] || m}</option>
            ))}
          </select>
          <select
            value={colFilters.garantia}
            onChange={e => setColFilter('garantia', e.target.value)}
            style={{ fontSize: 12, padding: '5px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
          >
            <option value="">Garantia: Todas</option>
            {garantiaOptions.map(g => (
              <option key={g} value={g}>{GARANTIA_LABELS[g] || g}</option>
            ))}
          </select>
          {(colFilters.modelo || colFilters.garantia) && (
            <Button variant="outline" size="sm" onClick={limparColFilters}>
              Limpar filtros
            </Button>
          )}
        </div>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.5fr_0.8fr_300px]">
            <div className="flex min-w-0 flex-col rounded-lg border bg-card p-4">
              <div className="mb-3">
                <h4 className="font-medium">Recuperação de Inadimplência</h4>
                <p className="text-xs text-muted-foreground">{selectedPeriodLabel}</p>
              </div>
              <div className="donut-chart" aria-label="Gráfico de pizza de recuperação">
                <svg viewBox="0 0 120 120" className="donut-svg">
                  <circle cx="60" cy="60" r="40" fill="none" stroke="#e2e8f0" strokeWidth="24" />
                  <circle
                    cx="60"
                    cy="60"
                    r="40"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="24"
                    strokeDasharray={`${(pie.recoveredPercent / 100) * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE - (pie.recoveredPercent / 100) * DONUT_CIRCUMFERENCE}`}
                    strokeDashoffset="0"
                    transform="rotate(90 60 60)"
                    strokeLinecap="butt"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="40"
                    fill="none"
                    stroke="#eab308"
                    strokeWidth="24"
                    strokeDasharray={`${(pie.approvedPercent / 100) * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE - (pie.approvedPercent / 100) * DONUT_CIRCUMFERENCE}`}
                    strokeDashoffset="0"
                    transform={`rotate(${90 + (pie.recoveredPercent / 100) * 360} 60 60)`}
                    strokeLinecap="butt"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="40"
                    fill="none"
                    stroke="#64748b"
                    strokeWidth="24"
                    strokeDasharray={`${(pie.waitingPercent / 100) * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE - (pie.waitingPercent / 100) * DONUT_CIRCUMFERENCE}`}
                    strokeDashoffset="0"
                    transform={`rotate(${90 + ((pie.recoveredPercent + pie.approvedPercent) / 100) * 360} 60 60)`}
                    strokeLinecap="butt"
                  />
                </svg>
                <div className="donut-center">
                  <strong>{pie.percentage}%</strong>
                  <span>recuperado</span>
                </div>
              </div>
              <TooltipProvider>
                <div className="mt-3 space-y-2 text-sm">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-default items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <span className="dot dot-paid shrink-0"></span>
                          <span className="truncate">Recuperado</span>
                        </span>
                        <span className="shrink-0 font-medium">{fmtMoney(selectedMonthTotals.recuperado)}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-none">{renderBreakdownTooltip(categoryBreakdown.recuperado)}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-default items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <span className="dot dot-approved shrink-0"></span>
                          <span className="truncate">Aprovado seguradora</span>
                        </span>
                        <span className="shrink-0 font-medium">{fmtMoney(selectedMonthTotals.aprovadoSeguradora)}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-none">{renderBreakdownTooltip(categoryBreakdown.aprovadoSeguradora)}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-default items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <span className="dot dot-waiting shrink-0"></span>
                          <span className="truncate">Aguardar para acionar</span>
                        </span>
                        <span className="shrink-0 font-medium">{fmtMoney(selectedMonthTotals.aguardarAcionar)}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-none">{renderBreakdownTooltip(categoryBreakdown.aguardarAcionar)}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-default items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <span className="dot dot-pending shrink-0"></span>
                          <span className="truncate">Aberto</span>
                        </span>
                        <span className="shrink-0 font-medium">{fmtMoney(selectedMonthTotals.inadimplente)}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-none">{renderBreakdownTooltip(categoryBreakdown.inadimplente)}</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>

              <Separator className="my-3" />
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Total</span>
                <strong className="shrink-0">
                  {fmtMoney(
                    selectedMonthTotals.recuperado +
                    selectedMonthTotals.aprovadoSeguradora +
                    selectedMonthTotals.aguardarAcionar +
                    selectedMonthTotals.inadimplente
                  )}
                </strong>
              </div>
            </div>

            <div className="flex min-w-0 flex-col rounded-lg border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-medium">Pagamentos por mês</h4>
                  <p className="text-xs text-muted-foreground">Ano {selectedYear}</p>
                </div>
                <Tabs value={periodMode === 'month' ? '' : periodMode} onValueChange={setPeriodMode}>
                  <TabsList>
                    <TabsTrigger value="ano">Ano todo</TabsTrigger>
                    <TabsTrigger value="h1">1º semestre</TabsTrigger>
                    <TabsTrigger value="h2">2º semestre</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="month-grid month-grid-compact">
                {monthCards.map(card => (
                  <button
                    key={card.key}
                    type="button"
                    className={`month-card compact ${card.active ? 'active' : ''}`}
                    onClick={() => handleSelectMonth(card.key)}
                    style={{ position: 'relative', overflow: 'hidden' }}
                  >
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: `${card.recoveredPercent}%`,
                        background: 'rgba(34, 197, 94, 0.25)',
                        borderTop: card.recoveredPercent > 0 ? '2px solid #22c55e' : 'none',
                        transition: 'height 0.3s ease',
                        pointerEvents: 'none',
                        zIndex: 0,
                      }}
                    />
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: `${card.recoveredPercent}%`,
                        height: `${card.approvedPercent}%`,
                        background: 'rgba(234, 179, 8, 0.3)',
                        borderTop: card.approvedPercent > 0 ? '2px solid #eab308' : 'none',
                        transition: 'height 0.3s ease, bottom 0.3s ease',
                        pointerEvents: 'none',
                        zIndex: 0,
                      }}
                    />
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: `${card.recoveredPercent + card.approvedPercent}%`,
                        height: `${card.waitingPercent}%`,
                        background: 'rgba(100, 116, 139, 0.3)',
                        borderTop: card.waitingPercent > 0 ? '2px solid #64748b' : 'none',
                        transition: 'height 0.3s ease, bottom 0.3s ease',
                        pointerEvents: 'none',
                        zIndex: 0,
                      }}
                    />
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div className="mc-top-row">
                        <span>{MONTH_LABELS[Number(card.key.slice(-2)) - 1]}</span>
                        <strong>{fmtMoney(card.inadimplente + card.recuperado + card.aprovadoSeguradora + card.aguardarAcionar)}</strong>
                      </div>
                      <div className="mc-values-row">
                        <div className="mc-value-group">
                          <span className="mc-value-label">Recuperado</span>
                          <strong>{fmtMoney(card.recuperado)}</strong>
                        </div>
                        <div className="mc-value-group">
                          <span className="mc-value-label">Em aberto</span>
                          {/* "Em aberto" aqui é todo débito não pago, igual à definição usada em Inadimplentes */}
                          <strong>{fmtMoney(card.inadimplente + card.aprovadoSeguradora + card.aguardarAcionar)}</strong>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex min-w-0 flex-col rounded-lg border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-medium">Maiores inadimplentes</h4>
                  <p className="text-xs text-muted-foreground">{selectedPeriodLabel}</p>
                </div>
                <Tabs value={topFilter} onValueChange={setTopFilter}>
                  <TabsList>
                    <TabsTrigger value="valor">Maior valor</TabsTrigger>
                    <TabsTrigger value="quantidade">Mais inadimplências</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="flex flex-col gap-1">
                {topInadimplentes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nenhum inadimplente no período.</p>
                ) : (
                  topInadimplentes.map((item, index) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Badge variant={index === 0 ? 'default' : 'secondary'} className="h-6 w-6 justify-center rounded-full p-0">
                          {index === 0 ? <Trophy className="size-3.5" /> : `#${index + 1}`}
                        </Badge>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.count} inadimplência{item.count === 1 ? '' : 's'}</p>
                        </div>
                      </div>
                      <strong className="shrink-0 text-sm">{fmtMoney(item.total)}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Layout>
  )
}
