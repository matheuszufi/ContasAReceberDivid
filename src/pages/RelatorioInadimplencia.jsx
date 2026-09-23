import React, { useEffect, useMemo, useState } from 'react'
import { onValue, ref, runTransaction, update } from 'firebase/database'
import { CalendarDays, ChevronLeft, ChevronRight, FilePlus2, Loader2, X } from 'lucide-react'
import { db, auth } from '../firebase'
import Layout from '../components/Layout'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import './RelatorioInadimplencia.css'

const RECUPERADO = new Set(['pago', 'pago_caucao'])

const getCurrentMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const formatMonth = (month) => {
  if (!month) return '—'
  const [year, value] = month.split('-')
  return new Date(Number(year), Number(value) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^./, letter => letter.toUpperCase())
}

const formatMoney = value => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const toNumber = value => Number(value || 0)
const totalOf = debit => toNumber(debit.valorTotal || debit.valorOriginal)
const dashboardDebtValue = debit => {
  const received = Number.parseFloat(debit.valorRecebido)
  return received > 0 ? received : totalOf(debit)
}
const normalizedValue = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '_')
const isExposurePaid = debit => normalizedValue(debit.status) === 'pago'
const getGuaranteeKey = (debit, tenantMap) => tenantMap[debit.inquilinoId]?.garantia || debit.garantia || 'sem_garantia'
const recoveredOf = debit => {
  const total = totalOf(debit)
  const received = toNumber(debit.valorRecebido)
  if (received > 0) return Math.min(total, received)
  return RECUPERADO.has(debit.status) || debit.seguroAcionado === 'pago_pela_seguradora' ? total : 0
}
const openValueOf = debit => Math.max(0, totalOf(debit) - recoveredOf(debit))
const isOpen = debit => openValueOf(debit) > 0

const monthEndDate = month => {
  const [year, value] = month.split('-').map(Number)
  return new Date(year, value, 1)
}

const monthKeyFromDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const todayKey = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}
const previousMonthKey = month => {
  const [year, value] = month.split('-').map(Number)
  return monthKeyFromDate(new Date(year, value - 2, 1))
}

const isDashboardRecovered = debit => (
  debit.status === 'pago' ||
  debit.status === 'pago_caucao' ||
  debit.seguroAcionado === 'pago_pela_seguradora'
)

const buildBalance = (debits, months) => {
  const periodDebits = debits.filter(debit => months.includes(debit.mesReferencia))
  const total = periodDebits.reduce((sum, debit) => sum + dashboardDebtValue(debit), 0)
  const recovered = periodDebits
    .filter(isDashboardRecovered)
    .reduce((sum, debit) => sum + dashboardDebtValue(debit), 0)

  return { total, recovered, open: Math.max(0, total - recovered) }
}

const monthlyRevenue = tenants => tenants
  .filter(tenant => tenant.status === 'Ativo')
  .reduce((sum, tenant) => sum + toNumber(tenant.valorAluguel) + toNumber(tenant.valorVaga), 0)

const buildForecast = (debits, months, limit) => {
  const periodDebits = debits.filter(debit => months.includes(debit.mesReferencia))
  const paymentApproved = periodDebits
    .filter(debit => debit.seguroAcionado === 'pagamento_aprovado' || debit.seguroAcionado === 'pago_pela_seguradora')
    .filter(debit => normalizedValue(debit.status) !== 'pago')
    .filter(debit => debit.dataPagamento && debit.dataPagamento >= todayKey() && debit.dataPagamento <= limit)
  const agreements = periodDebits
    .filter(debit => normalizedValue(debit.status) === 'acordo')
    .filter(debit => debit.seguroAcionado !== 'pagamento_aprovado' && debit.seguroAcionado !== 'pago_pela_seguradora')
    .filter(debit => debit.ultimaCobranca && debit.ultimaCobranca <= limit)
  const sumValues = list => list.reduce((sum, debit) => sum + dashboardDebtValue(debit), 0)
  const items = list => list.map(debit => ({
    name: debit.inquilinoNome || debit.inquilinoId || 'Inquilino não informado',
    type: debit.tipoDebito || 'Débito',
    month: debit.mesReferencia,
    value: dashboardDebtValue(debit),
  }))

  return {
    paymentApproved: sumValues(paymentApproved),
    agreements: sumValues(agreements),
    total: sumValues(paymentApproved) + sumValues(agreements),
    paymentApprovedItems: items(paymentApproved),
    agreementItems: items(agreements),
  }
}

function ForecastTooltip({ label, value, items }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="forecast-tooltip-trigger">
            {label}: <b>{formatMoney(value)}</b>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="forecast-tooltip-content">
          <div className="forecast-tooltip-list">
            <strong>{label}</strong>
            {items.length === 0 ? (
              <span>Nenhuma inadimplência</span>
            ) : items.map((item, index) => (
              <span key={`${item.name}-${item.type}-${index}`}>
                {item.name} · {item.type} · {formatMoney(item.value)}
              </span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function ListTooltip({ children, title, items, emptyLabel }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="forecast-tooltip-content">
          <div className="forecast-tooltip-list">
            <strong>{title}</strong>
            {items.length === 0 ? (
              <span>{emptyLabel}</span>
            ) : items.map((item, index) => (
              <span key={`${item.name}-${index}`}>
                {item.name} · {item.type} · {formatMoney(item.value)}
              </span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const normalizeHistoryValue = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]/g, '')
  .toLowerCase()

const historyValue = item => {
  const received = Number(item.valorRecebido || 0)
  return received > 0 ? received : Number(item.valorTotal || 0)
}

const historyCategory = item => {
  const next = normalizeHistoryValue(item.valorNovoKey || item.valorNovoLabel)
  if (item.campo === 'seguroAcionado') {
    if (next === 'acionado') return 'activated'
    if (next === 'pagamentoaprovado') return 'approved'
    if (next === 'pagopelaseguradora') return 'insurerPaid'
  }
  if (item.campo === 'status' && (next === 'pago' || next === 'pagocaucao')) return 'recovered'
  return null
}

const historyItem = item => ({
  name: item.inquilinoNome || 'Inquilino não informado',
  type: item.campoLabel || (item.campo === 'seguroAcionado' ? 'Seguro acionado' : 'Status'),
  value: historyValue(item),
  referenceMonth: item.mesReferencia || 'Sem mês',
})

const getHistoryDate = item => new Date(Number(item.data))

const getWeekLabel = (start, end) => {
  const formatDay = date => String(date.getDate()).padStart(2, '0')
  const month = String(end.getMonth() + 1).padStart(2, '0')
  return `${formatDay(start)} a ${formatDay(end)}/${month}`
}

const buildRecoveryMetrics = (history, month) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const monthStart = new Date(year, monthNumber - 1, 1)
  const monthEnd = new Date(year, monthNumber, 0)
  const monthHistory = history.filter(item => {
    const date = getHistoryDate(item)
    return !Number.isNaN(date.getTime()) && date >= monthStart && date <= new Date(year, monthNumber - 1, monthEnd.getDate(), 23, 59, 59, 999) && historyCategory(item)
  })
  const weeks = []
  let startDay = 1
  const firstDayOfWeek = monthStart.getDay()
  let endDay = Math.min(monthEnd.getDate(), 1 + (6 - firstDayOfWeek))
  while (startDay <= monthEnd.getDate()) {
    const start = new Date(year, monthNumber - 1, startDay)
    const end = new Date(year, monthNumber - 1, endDay)
    const weekHistory = monthHistory.filter(item => {
      const date = getHistoryDate(item)
      return date >= start && date <= new Date(year, monthNumber - 1, endDay, 23, 59, 59, 999)
    })
    const totals = { recovered: 0, activated: 0, approved: 0, insurerPaid: 0 }
    const items = { recovered: [], activated: [], approved: [], insurerPaid: [] }
    weekHistory.forEach(item => {
      const category = historyCategory(item)
      const value = historyValue(item)
      totals[category] += value
      items[category].push(historyItem(item))
    })
    weeks.push({ label: getWeekLabel(start, end), totals, items })
    startDay = endDay + 1
    endDay = Math.min(monthEnd.getDate(), startDay + 6)
  }

  const byReference = Object.values(monthHistory.reduce((groups, item) => {
    const referenceMonth = item.mesReferencia || 'sem_mes'
    if (!groups[referenceMonth]) groups[referenceMonth] = { referenceMonth, recovered: 0, activated: 0, approved: 0, insurerPaid: 0 }
    groups[referenceMonth][historyCategory(item)] += historyValue(item)
    return groups
  }, {})).sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth))

  return { weeks, byReference }
}

const calculateMetrics = (debits, tenants, month, percentage) => {
  const tenantMap = Object.fromEntries(tenants.map(tenant => [tenant.id, tenant]))
  const monthDebits = debits.filter(debit => debit.mesReferencia === month)
  const balance = buildBalance(debits, [month])
  const openBalance = balance.open
  const nextMonthStart = monthEndDate(month)
  const nextMonth = monthKeyFromDate(nextMonthStart)
  const nextMonthFirst = `${nextMonth}-01`
  const forecast = buildForecast(debits, [month], nextMonthFirst)
  const forecastWithPreviousMonth = buildForecast(debits, [month, previousMonthKey(month)], nextMonthFirst)
  const balanceWithPreviousMonth = buildBalance(debits, [month, previousMonthKey(month)])
  const revenue = monthlyRevenue(tenants)
  const unguaranteedDebits = monthDebits.filter(debit => normalizedValue(getGuaranteeKey(debit, tenantMap)) === 'sem_garantia')
  const activeTenants = tenants.filter(tenant => tenant.status === 'Ativo')
  const unguaranteedTenants = activeTenants.filter(tenant => normalizedValue(tenant.garantia || 'sem_garantia') === 'sem_garantia')
  const currentRate = revenue > 0 ? (balance.open / revenue) * 100 : 0
  const projectedRate = Number(percentage || 0)
  const projectedValue = revenue * (projectedRate / 100)
  const recoveryToProjected = Math.max(0, balance.open - projectedValue)
  const debitItem = debit => ({
    name: debit.inquilinoNome || debit.inquilinoId || 'Inquilino não informado',
    type: debit.tipoDebito || 'Débito',
    value: dashboardDebtValue(debit),
  })
  const unguaranteedOpen = unguaranteedDebits.reduce((sum, debit) => sum + openValueOf(debit), 0)
  const unguaranteedTotal = unguaranteedDebits.reduce((sum, debit) => sum + dashboardDebtValue(debit), 0)
  const unguaranteedRecovered = Math.max(0, unguaranteedTotal - unguaranteedOpen)
  const unguaranteedOpenItems = unguaranteedDebits
    .filter(debit => openValueOf(debit) > 0)
    .map(debit => ({ ...debitItem(debit), value: openValueOf(debit) }))
  const unguaranteedTotalItems = unguaranteedDebits.map(debitItem)
  const unguaranteedRecoveredItems = unguaranteedDebits
    .filter(debit => dashboardDebtValue(debit) - openValueOf(debit) > 0)
    .map(debit => ({ ...debitItem(debit), value: dashboardDebtValue(debit) - openValueOf(debit) }))
  const agreementEvents = monthDebits.flatMap(debit => Object.entries(debit.timeline || {}).map(([key, event]) => ({ key, debit, ...event })))
  const agreementMadeEvents = agreementEvents.filter(event => event.tipo === 'Acordo realizado')
  const agreementDetails = agreementMadeEvents.map(agreement => {
    const resolution = agreementEvents
      .filter(event => (
        event.acordoEventoId === agreement.key ||
        (!event.acordoEventoId && ['Acordo cumprido', 'Acordo não cumprido'].includes(event.tipo) && event.dataAcordada === agreement.dataAcordada && new Date(event.criadoEm) >= new Date(agreement.criadoEm))
      ))
      .sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm))
      .at(-1)
    let status = 'aberto'
    if (resolution?.statusAcordo === 'pago' || resolution?.tipo === 'Acordo cumprido') status = 'pago'
    else if (resolution?.statusAcordo === 'nao_cumprido' || resolution?.tipo === 'Acordo não cumprido') status = 'nao_cumprido'
    return { status, ...debitItem(agreement.debit) }
  })
  const agreementMadeCount = agreementDetails.length
  const agreementPaidItems = agreementDetails.filter(item => item.status === 'pago')
  const agreementBrokenItems = agreementDetails.filter(item => item.status === 'nao_cumprido')
  const agreementOpenItems = agreementDetails.filter(item => item.status === 'aberto')
  const agreementPaidCount = agreementPaidItems.length
  const agreementBrokenCount = agreementBrokenItems.length
  const agreementOpenCount = agreementOpenItems.length

  return {
    openBalance,
    forecast,
    forecastWithPreviousMonth,
    balance,
    balanceWithPreviousMonth,
    unguaranteedTotal,
    unguaranteedOpen,
    unguaranteedRecovered,
    unguaranteedOpenItems,
    unguaranteedTotalItems,
    unguaranteedRecoveredItems,
    unguaranteedExposureRate: revenue > 0 ? (unguaranteedOpen / revenue) * 100 : 0,
    unguaranteedTotalRate: revenue > 0 ? (unguaranteedTotal / revenue) * 100 : 0,
    unguaranteedTenantRate: activeTenants.length > 0 ? (unguaranteedTenants.length / activeTenants.length) * 100 : 0,
    currentRate,
    projectedRate,
    projectedValue,
    recoveryToProjected,
    revenue,
    agreementMadeCount,
    agreementPaidCount,
    agreementOpenCount,
    agreementBrokenCount,
    agreementPaidItems,
    agreementOpenItems,
    agreementBrokenItems,
    agreementBreakRate: agreementMadeCount > 0 ? (agreementBrokenCount / agreementMadeCount) * 100 : 0,
    count: monthDebits.length,
  }
}

export default function RelatorioInadimplencia() {
  const [reports, setReports] = useState([])
  const [debits, setDebits] = useState([])
  const [tenants, setTenants] = useState([])
  const [historicoAlteracoes, setHistoricoAlteracoes] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth)
  const [showCreate, setShowCreate] = useState(false)
  const [newMonth, setNewMonth] = useState(getCurrentMonth)
  const [percentageDraft, setPercentageDraft] = useState('0')
  const [editingPercentage, setEditingPercentage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPercentage, setSavingPercentage] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => onValue(ref(db, 'relatoriosInadimplencia'), snapshot => {
    const value = snapshot.val() || {}
    const loaded = Object.entries(value)
      .map(([month, report]) => ({ month, ...report }))
      .sort((a, b) => b.month.localeCompare(a.month))
    setReports(loaded)
    setLoading(false)
  }), [])

  useEffect(() => onValue(ref(db, 'inadimplencias'), snapshot => {
    const value = snapshot.val() || {}
    setDebits(Object.entries(value).map(([id, debit]) => ({ id, ...debit })))
  }), [])

  useEffect(() => onValue(ref(db, 'inquilinos'), snapshot => {
    const value = snapshot.val() || {}
    setTenants(Object.entries(value).map(([id, tenant]) => ({ id, ...tenant })))
  }), [])

  useEffect(() => onValue(ref(db, 'historicoAlteracoes'), snapshot => {
    const value = snapshot.val() || {}
    setHistoricoAlteracoes(Object.entries(value).map(([id, item]) => ({ id, ...item })))
  }), [])

  const selectedReport = reports.find(report => report.month === selectedMonth)
  const percentage = selectedReport?.projectedPercentage ?? 0
  const metrics = useMemo(
    () => calculateMetrics(debits, tenants, selectedMonth, percentage),
    [debits, tenants, selectedMonth, percentage]
  )
  const recoveryMetrics = useMemo(
    () => buildRecoveryMetrics(historicoAlteracoes, selectedMonth),
    [historicoAlteracoes, selectedMonth]
  )
  const reportMonths = reports.map(report => report.month)
  const selectedIndex = reportMonths.indexOf(selectedMonth)

  useEffect(() => {
    setPercentageDraft(String(selectedReport?.projectedPercentage ?? 0))
  }, [selectedReport?.month, selectedReport?.projectedPercentage])

  const navigateReport = direction => {
    if (selectedIndex < 0) return
    const next = reports[selectedIndex + direction]
    if (next) setSelectedMonth(next.month)
  }

  const createReport = async event => {
    event.preventDefault()
    setError('')
    if (!/^\d{4}-\d{2}$/.test(newMonth)) {
      setError('Informe um mês e ano válidos.')
      return
    }

    setSaving(true)
    try {
      const reportRef = ref(db, `relatoriosInadimplencia/${newMonth}`)
      const result = await runTransaction(reportRef, current => current || {
        month: newMonth,
        projectedPercentage: 0,
        createdAt: Date.now(),
        createdBy: auth?.currentUser?.uid || null,
      })
      if (!result.committed) {
        setError('Já existe um relatório para este mês.')
        setSelectedMonth(newMonth)
      } else {
        setSelectedMonth(newMonth)
        setShowCreate(false)
      }
    } catch (saveError) {
      console.error('Erro ao criar relatório de inadimplência:', saveError)
      setError('Não foi possível salvar o relatório. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const savePercentage = async () => {
    const value = Number(percentageDraft)
    if (!selectedReport || !Number.isFinite(value) || value < 0 || value > 100) {
      setError('Informe um percentual entre 0 e 100.')
      return
    }
    setSavingPercentage(true)
    setError('')
    try {
      await update(ref(db, `relatoriosInadimplencia/${selectedMonth}`), { projectedPercentage: value })
      setEditingPercentage(false)
    } catch (saveError) {
      console.error('Erro ao atualizar percentual do relatório:', saveError)
      setError('Não foi possível atualizar o percentual.')
    } finally {
      setSavingPercentage(false)
    }
  }

  const reportLabel = selectedReport ? formatMonth(selectedMonth) : 'Nenhum relatório criado'
  const nextMonth = monthKeyFromDate(monthEndDate(selectedMonth))

  return (
    <Layout title="Relatório de inadimplência" subtitle="Acompanhe os indicadores consolidados por mês">
      <div className="report-page">
        <div className="report-toolbar">
          <div>
            <p className="report-eyebrow">Relatório mensal</p>
            <h2>{reportLabel}</h2>
          </div>
          <Button onClick={() => { setNewMonth(getCurrentMonth()); setError(''); setShowCreate(true) }}>
            <FilePlus2 /> Criar relatório
          </Button>
        </div>

        {loading ? (
          <div className="report-empty"><Loader2 className="spin" /> Carregando relatórios...</div>
        ) : reports.length === 0 ? (
          <div className="report-empty">
            <CalendarDays />
            <h3>Comece pelo relatório deste mês</h3>
            <p>Crie o primeiro relatório para registrar o percentual projetado e acompanhar os indicadores.</p>
            <Button onClick={() => setShowCreate(true)}><FilePlus2 /> Criar relatório</Button>
          </div>
        ) : !selectedReport ? (
          <div className="report-empty">
            <CalendarDays />
            <h3>Relatório de {formatMonth(selectedMonth)} ainda não criado</h3>
            <p>Selecione um relatório existente acima ou crie o relatório deste mês para visualizar o painel resumo.</p>
            <Button onClick={() => { setNewMonth(selectedMonth); setShowCreate(true) }}><FilePlus2 /> Criar relatório</Button>
          </div>
        ) : (
          <>
            <div className="report-navigation">
              <Button variant="outline" size="icon" onClick={() => navigateReport(1)} disabled={selectedIndex < 0 || selectedIndex === reports.length - 1} aria-label="Relatório anterior">
                <ChevronLeft />
              </Button>
              <div className="report-month-list">
                {reports.map(report => (
                  <button
                    type="button"
                    key={report.month}
                    className={report.month === selectedMonth ? 'report-month active' : 'report-month'}
                    onClick={() => setSelectedMonth(report.month)}
                  >
                    {formatMonth(report.month)}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="icon" onClick={() => navigateReport(-1)} disabled={selectedIndex <= 0} aria-label="Próximo relatório">
                <ChevronRight />
              </Button>
            </div>

            <section className="summary-section">
              <div className="section-heading">
                <div><span className="section-kicker">01</span><div><h3>Painel resumo</h3><p>Visão consolidada das inadimplências de {formatMonth(selectedMonth)}.</p></div></div>
                <span className="debit-count">{metrics.count} {metrics.count === 1 ? 'inadimplência' : 'inadimplências'}</span>
              </div>
              <div className="summary-grid">
                <div className="summary-row summary-row-featured">
                  <article className="summary-card summary-card-featured accent-blue">
                    <span>Inadimplência projetada para o fechamento</span>
                    <div className="rate-summary">
                      <div className="rate-pair">
                        <span className="rate-item">Taxa atual <b>{metrics.currentRate.toFixed(2)}%</b></span>
                        {editingPercentage ? (
                          <div className="percentage-editor">
                            <Input autoFocus type="number" min="0" max="100" step="0.01" value={percentageDraft} onChange={event => setPercentageDraft(event.target.value)} aria-label="Taxa projetada" />
                            <span>%</span>
                            <Button type="button" size="sm" onClick={savePercentage} disabled={savingPercentage}>{savingPercentage ? 'Salvando' : 'Salvar'}</Button>
                          </div>
                        ) : (
                          <button type="button" className="rate-edit-button rate-item" onClick={() => setEditingPercentage(true)}>
                            Taxa projetada <b>{metrics.projectedRate.toFixed(2)}%</b>
                          </button>
                        )}
                      </div>
                      <div className="rate-breakdown">
                        <small>Valor da taxa projetada: <b>{formatMoney(metrics.projectedValue)}</b></small>
                        <small>Valor a recuperar para chegar na taxa: <b>{formatMoney(metrics.recoveryToProjected)}</b></small>
                      </div>
                    </div>
                  </article>
                </div>
                <div className="summary-row">
                  <article className="summary-card accent-amber">
                    <span>Saldo ({formatMonth(selectedMonth)})</span>
                    <div className="balance-breakdown">
                      <small>Total: <b>{formatMoney(metrics.balance.total)}</b></small>
                      <small>Recuperado: <b>{formatMoney(metrics.balance.recovered)}</b></small>
                      <small>Em aberto: <b>{formatMoney(metrics.balance.open)}</b></small>
                    </div>
                  </article>
                  <article className="summary-card accent-amber">
                    <span>Saldo ({formatMonth(selectedMonth)} + mês anterior)</span>
                    <div className="balance-breakdown">
                      <small>Total: <b>{formatMoney(metrics.balanceWithPreviousMonth.total)}</b></small>
                      <small>Recuperado: <b>{formatMoney(metrics.balanceWithPreviousMonth.recovered)}</b></small>
                      <small>Em aberto: <b>{formatMoney(metrics.balanceWithPreviousMonth.open)}</b></small>
                    </div>
                  </article>
                </div>
                <div className="summary-row">
                  <article className="summary-card accent-green">
                    <span>Previsto para receber até 01/{nextMonth.slice(5)}/{nextMonth.slice(0, 4)}</span>
                    <strong>{formatMoney(metrics.forecast.total)}</strong>
                    <div className="forecast-breakdown">
                      <ForecastTooltip label="Pagamento aprovado" value={metrics.forecast.paymentApproved} items={metrics.forecast.paymentApprovedItems} />
                      <ForecastTooltip label="Acordos" value={metrics.forecast.agreements} items={metrics.forecast.agreementItems} />
                    </div>
                    <small className="forecast-source">Somente inadimplências de {formatMonth(selectedMonth)}</small>
                  </article>
                  <article className="summary-card accent-green">
                    <span>Previsto até 01/{nextMonth.slice(5)}/{nextMonth.slice(0, 4)} com mês anterior</span>
                    <strong>{formatMoney(metrics.forecastWithPreviousMonth.total)}</strong>
                    <div className="forecast-breakdown">
                      <ForecastTooltip label="Pagamento aprovado" value={metrics.forecastWithPreviousMonth.paymentApproved} items={metrics.forecastWithPreviousMonth.paymentApprovedItems} />
                      <ForecastTooltip label="Acordos" value={metrics.forecastWithPreviousMonth.agreements} items={metrics.forecastWithPreviousMonth.agreementItems} />
                    </div>
                    <small className="forecast-source">Inadimplências de {formatMonth(selectedMonth)} + {formatMonth(previousMonthKey(selectedMonth))}</small>
                  </article>
                </div>
                <div className="summary-row">
                  <article className="summary-card accent-red">
                    <span>Carteira sem garantia</span>
                    <strong>{metrics.unguaranteedTenantRate.toFixed(2)}%</strong>
                    <small>Percentual de inquilinos ativos sem garantia</small>
                  </article>
                  <article className="summary-card accent-red">
                    <span>Exposição sem garantia</span>
                    <strong>{metrics.unguaranteedExposureRate.toFixed(2)}% do valor da carteira <small>({formatMoney(metrics.revenue)})</small></strong>
                    <div className="forecast-breakdown">
                      <ForecastTooltip label="Valor em aberto" value={metrics.unguaranteedOpen} items={metrics.unguaranteedOpenItems} />
                      <ForecastTooltip label={`Total (${metrics.unguaranteedTotalRate.toFixed(2)}% da carteira)`} value={metrics.unguaranteedTotal} items={metrics.unguaranteedTotalItems} />
                      <ForecastTooltip label="Recuperado" value={metrics.unguaranteedRecovered} items={metrics.unguaranteedRecoveredItems} />
                    </div>
                  </article>
                </div>
                <div className="agreement-breakdown">
                  <div className="agreement-heading">
                    <span>Acordos</span>
                    <small>{metrics.agreementMadeCount} registrado{metrics.agreementMadeCount === 1 ? '' : 's'}</small>
                    <strong>{metrics.agreementBreakRate.toFixed(2)}% de quebra</strong>
                  </div>
                  <div className="agreement-stats">
                    <ListTooltip title="Não cumpridos" items={metrics.agreementBrokenItems} emptyLabel="Nenhum acordo não cumprido">
                      <span className="agreement-stat agreement-stat-danger"><b>{metrics.agreementBrokenCount}</b> não cumprido{metrics.agreementBrokenCount === 1 ? '' : 's'}</span>
                    </ListTooltip>
                    <ListTooltip title="Em aberto" items={metrics.agreementOpenItems} emptyLabel="Nenhum acordo em aberto">
                      <span className="agreement-stat agreement-stat-warning"><b>{metrics.agreementOpenCount}</b> em aberto</span>
                    </ListTooltip>
                    <ListTooltip title="Pagos" items={metrics.agreementPaidItems} emptyLabel="Nenhum acordo pago">
                      <span className="agreement-stat agreement-stat-success"><b>{metrics.agreementPaidCount}</b> pago{metrics.agreementPaidCount === 1 ? '' : 's'}</span>
                    </ListTooltip>
                  </div>
                </div>
              </div>
            </section>
            <section className="recovery-section">
              <div className="section-heading">
                <div><span className="section-kicker recovery-kicker">02</span><div><h3>Recuperação por semana</h3><p>Atualizações registradas no Histórico de Alterações durante {formatMonth(selectedMonth)}.</p></div></div>
              </div>
              <div className="recovery-table-wrap">
                <table className="recovery-table">
                  <thead>
                    <tr>
                      <th>Semana</th>
                      <th>Recuperado</th>
                      <th>Seguros acionados</th>
                      <th>Seguros aprovados</th>
                      <th>Pago pela seguradora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recoveryMetrics.weeks.map(week => (
                      <tr key={week.label}>
                        <td className="recovery-week-label">{week.label}</td>
                        <td><ListTooltip title={`Recuperado · ${week.label}`} items={week.items.recovered} emptyLabel="Nenhuma recuperação"><span className="recovery-value recovery-value-green">{formatMoney(week.totals.recovered)}</span></ListTooltip></td>
                        <td><ListTooltip title={`Seguros acionados · ${week.label}`} items={week.items.activated} emptyLabel="Nenhum seguro acionado"><span className="recovery-value">{formatMoney(week.totals.activated)}</span></ListTooltip></td>
                        <td><ListTooltip title={`Seguros aprovados · ${week.label}`} items={week.items.approved} emptyLabel="Nenhum seguro aprovado"><span className="recovery-value">{formatMoney(week.totals.approved)}</span></ListTooltip></td>
                        <td><ListTooltip title={`Pago pela seguradora · ${week.label}`} items={week.items.insurerPaid} emptyLabel="Nenhum pagamento pela seguradora"><span className="recovery-value recovery-value-blue">{formatMoney(week.totals.insurerPaid)}</span></ListTooltip></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="reference-heading">
                <h4>Recuperado por mês de referência</h4>
                <span>Identifica a que mês pertence cada alteração.</span>
              </div>
              <div className="recovery-table-wrap">
                <table className="recovery-table reference-table">
                  <thead>
                    <tr>
                      <th>Mês de referência</th>
                      <th>Recuperado</th>
                      <th>Seguros acionados</th>
                      <th>Seguros aprovados</th>
                      <th>Pago pela seguradora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recoveryMetrics.byReference.length === 0 ? (
                      <tr><td colSpan="5" className="recovery-empty-cell">Nenhuma alteração de recuperação registrada neste mês.</td></tr>
                    ) : recoveryMetrics.byReference.map(reference => (
                      <tr key={reference.referenceMonth}>
                        <td className="recovery-week-label">{reference.referenceMonth === 'sem_mes' ? 'Sem mês informado' : formatMonth(reference.referenceMonth)}</td>
                        <td>{formatMoney(reference.recovered)}</td>
                        <td>{formatMoney(reference.activated)}</td>
                        <td>{formatMoney(reference.approved)}</td>
                        <td>{formatMoney(reference.insurerPaid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>

      {showCreate && (
        <div className="report-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setShowCreate(false)}>
          <form className="report-modal" onSubmit={createReport}>
            <div className="modal-heading"><div><span className="report-eyebrow">Novo registro</span><h3>Criar relatório mensal</h3></div><button type="button" className="modal-close" onClick={() => setShowCreate(false)} aria-label="Fechar"><X /></button></div>
            <label htmlFor="report-month">Mês e ano do relatório</label>
            <Input id="report-month" type="month" value={newMonth} onChange={event => setNewMonth(event.target.value)} required />
            {error && <p className="report-error">{error}</p>}
            <div className="modal-actions"><Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="spin" />}{saving ? 'Salvando...' : 'Criar relatório'}</Button></div>
          </form>
        </div>
      )}
    </Layout>
  )
}
