import React, { useEffect, useMemo, useState } from 'react'
import { onValue, ref, runTransaction, update } from 'firebase/database'
import { CalendarDays, ChevronLeft, ChevronRight, FilePlus2, Loader2, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
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

const formatYearPeriod = month => {
  if (!month) return '—'
  const [year, value] = month.split('-').map(Number)
  const monthLabel = new Date(year, value - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
  return `Janeiro a ${monthLabel} de ${year}`
}

const formatMoney = value => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})
const formatSignedMoney = value => `${value >= 0 ? '+' : ''}${formatMoney(value)}`
const variationPercentage = (current, reference) => reference > 0 ? ((current - reference) / reference) * 100 : null

const toNumber = value => Number(value || 0)
const totalOf = debit => toNumber(debit.valorTotal || debit.valorOriginal)
const dashboardDebtValue = debit => {
  const received = Number.parseFloat(debit.valorRecebido)
  return received > 0 ? received : totalOf(debit)
}
const normalizedValue = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '_')
const guaranteeLabels = {
  sem_garantia: 'Sem garantia',
  caucao: 'Caução',
  adiantamento: 'Adiantamento',
  seguro: 'Seguro fiança',
  carta_fianca: 'Carta fiança',
}
const statusLabels = {
  pendente: 'Pendente',
  acordo: 'Acordo',
  pago: 'Pago',
  pago_caucao: 'Pago com caução',
  juridico: 'Jurídico',
  seguro_aprovado: 'Seguro aprovado',
  pagamento_aprovado: 'Pagamento aprovado',
  pagamento_reprovado: 'Pagamento reprovado',
  pago_pela_seguradora: 'Pago pela seguradora',
}
const seguroAcionadoLabels = {
  acionado: 'Seguro acionado',
  pagamento_aprovado: 'Pagamento aprovado pela seguradora',
  pago_pela_seguradora: 'Pago pela seguradora',
}
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
const isUnpaid = debit => (
  !RECUPERADO.has(normalizedValue(debit?.status)) &&
  debit?.seguroAcionado !== 'pago_pela_seguradora' &&
  openValueOf(debit) > 0
)
const daysBetween = (start, end) => {
  if (!start || !end) return null
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
  return Number.isFinite(days) && days >= 0 ? days : null
}

const monthEndDate = month => {
  const [year, value] = month.split('-').map(Number)
  return new Date(year, value, 1)
}

const monthKeyFromDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const todayKey = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}
const formatDateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const dateKeyAfterDays = days => {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return formatDateKey(date)
}
const dateKeyAfterOneMonth = value => {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  if (![year, month, day].every(Number.isFinite)) return ''
  const lastDayOfTargetMonth = new Date(year, month + 1, 0).getDate()
  return formatDateKey(new Date(year, month - 1 + 1, Math.min(day, lastDayOfTargetMonth)))
}
const formatDate = value => value
  ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')
  : 'Sem data'
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

const getAgreementDate = debit => Object.values(debit.timeline || {})
  .filter(event => event.tipo === 'Acordo realizado' && event.dataAcordada)
  .sort((a, b) => String(a.dataAcordada).localeCompare(String(b.dataAcordada)))
  .at(-1)?.dataAcordada || ''

const buildReceivablesForecast = (debits, months) => {
  const today = todayKey()
  const items = debits
    .filter(debit => months.includes(debit.mesReferencia))
    .filter(debit => (
      normalizedValue(debit.status) !== 'pago' &&
      (
        normalizedValue(debit.status) === 'acordo' ||
        debit.seguroAcionado === 'pagamento_aprovado' ||
        debit.seguroAcionado === 'acionado'
      )
    ))
    .map(debit => {
      let expectedDate = ''
      let source = ''
      if (debit.seguroAcionado === 'pagamento_aprovado' && debit.dataPagamento) {
        expectedDate = debit.dataPagamento
        source = 'Seguro aprovado · data de pagamento'
      } else if (debit.seguroAcionado === 'acionado' && debit.dataSeguro) {
        expectedDate = dateKeyAfterOneMonth(debit.dataSeguro)
        source = 'Seguro acionado · 1 mês após acionamento'
      } else if (normalizedValue(debit.status) === 'acordo') {
        expectedDate = getAgreementDate(debit)
        source = 'Acordo · data acordada'
      }
      if (!expectedDate || expectedDate < today) return null
      return {
        id: debit.id,
        name: debit.inquilinoNome || debit.inquilinoId || 'Inquilino não informado',
        expectedDate,
        source,
        receivedValue: totalOf(debit),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))

  const horizons = [10, 20, 30, 60].map(days => ({
    days,
    total: items
      .filter(item => item.expectedDate <= dateKeyAfterDays(days))
      .reduce((sum, item) => sum + item.receivedValue, 0),
    items: items.filter(item => item.expectedDate <= dateKeyAfterDays(days)),
  }))

  return { items, horizons }
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

function ReceivingTimeTooltip({ items }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="recovery-value recovery-value-green">{items.length} recebido{items.length === 1 ? '' : 's'}</button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="forecast-tooltip-content">
          <div className="forecast-tooltip-list">
            <strong>Tempo por inadimplência</strong>
            {items.length === 0 ? <span>Nenhuma inadimplência paga no mês</span> : items.map((item, index) => (
              <span key={`${item.name}-${index}`}>{item.name} · {item.days} dia{item.days === 1 ? '' : 's'} para pagar</span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const scenarioColors = ['#2563eb', '#7c3aed', '#0f766e', '#d97706', '#be123c', '#475569']

const guaranteeStatusColors = {
  inadimplente: '#f97316', juridico: '#ef4444', acionado: '#3b82f6',
  aguardarAcionar: '#64748b', reprovado: '#dc2626', aprovadoSeguradora: '#54ec26',
  utilizacaoCaucao: '#0f766e', pagoSeguradora: '#0891b2', recuperado: '#22c55e',
}
const guaranteeStatusLabels = {
  inadimplente: 'Aberto', juridico: 'Jurídico', acionado: 'Acionado',
  aguardarAcionar: 'Aguardar para acionar', reprovado: 'Pagamento reprovado',
  aprovadoSeguradora: 'Aprovado pela seguradora', utilizacaoCaucao: 'Utilizado caução',
  pagoSeguradora: 'Pago pela seguradora', recuperado: 'Recuperado',
}
const classifyGuaranteeStatus = debit => {
  const status = normalizedValue(debit.status)
  const insuranceStatus = normalizedValue(debit.seguroAcionado)
  if (insuranceStatus === 'pago_pela_seguradora') return 'pagoSeguradora'
  if (status === 'pago_caucao') return 'utilizacaoCaucao'
  if (status === 'pago') return 'recuperado'
  if (status === 'juridico' || insuranceStatus === 'juridico') return 'juridico'
  if (insuranceStatus === 'acionado') return 'acionado'
  if (insuranceStatus === 'pagamento_aprovado') return 'aprovadoSeguradora'
  if (insuranceStatus === 'pagamento_reprovado') return 'reprovado'
  if (insuranceStatus === 'aguardar_para_acionar') return 'aguardarAcionar'
  return 'inadimplente'
}

function ScenarioChart({ title, data }) {
  const chartData = data.map(item => ({
    ...item,
    percentageLabel: `${item.percentage.toFixed(1)}%`,
  }))

  return (
    <div className="scenario-chart">
      <h4>{title}</h4>
      {chartData.length === 0 ? (
        <div className="scenario-chart-empty">Nenhuma inadimplência aberta.</div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(150, chartData.length * 48)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 42, left: 4, bottom: 4 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="label" width={92} tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
            <RechartsTooltip
              formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Participação']}
              labelFormatter={label => title.replace('Participação ', '') + ` · ${label}`}
              contentStyle={{ border: '1px solid #dbe3ef', borderRadius: 8, fontSize: 11 }}
            />
            <Bar dataKey="percentage" radius={[0, 4, 4, 0]} barSize={22}>
              {chartData.map((item, index) => <Cell key={item.key} fill={scenarioColors[index % scenarioColors.length]} />)}
              <LabelList dataKey="percentageLabel" position="right" fill="#334155" fontSize={11} fontWeight={700} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function GuaranteeValueChart({ data, total, statusKeys }) {
  return (
    <div className="scenario-guarantee-chart">
      <div className="scenario-guarantee-heading">
        <div><h4>Valores por tipo de garantia</h4><p>Distribuição dos débitos de todo o mês selecionado.</p></div>
        <strong>{formatMoney(total)}</strong>
      </div>
      {data.length === 0 || total === 0 ? <div className="scenario-chart-empty">Nenhuma inadimplência registrada no mês.</div> : (
        <>
          <div className="scenario-guarantee-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 12, right: 8, left: 4, bottom: 8 }}>
                <CartesianGrid vertical={false} stroke="#dbe5f0" strokeDasharray="4 4" />
                <XAxis dataKey="garantia" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }} interval={0} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#64748b' }} width={58} tickFormatter={formatMoney} />
                <RechartsTooltip
                  cursor={{ fill: 'rgba(14, 165, 233, 0.08)' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const guaranteeTotal = payload.reduce((sum, item) => sum + Number(item.value || 0), 0)
                    return <div className="scenario-guarantee-tooltip"><p>Garantia: {label}</p>{payload.map(item => <span key={item.dataKey} style={{ color: item.color }}>{guaranteeStatusLabels[item.dataKey] || item.name}: {formatMoney(item.value)}</span>)}<strong>Total: {formatMoney(guaranteeTotal)}</strong></div>
                  }}
                />
                {statusKeys.map((status, index) => <Bar key={status} dataKey={status} name={guaranteeStatusLabels[status]} stackId="status" fill={guaranteeStatusColors[status]} radius={index === statusKeys.length - 1 ? [4, 4, 0, 0] : undefined} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="scenario-guarantee-legend" aria-label="Legenda dos status">
            {statusKeys.map(status => <span key={status}><i style={{ background: guaranteeStatusColors[status] }} />{guaranteeStatusLabels[status]}</span>)}
          </div>
        </>
      )}
    </div>
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
    const category = historyCategory(item)
    if (!groups[referenceMonth]) {
      groups[referenceMonth] = {
        referenceMonth,
        recovered: 0,
        activated: 0,
        approved: 0,
        insurerPaid: 0,
        items: { recovered: [], activated: [], approved: [], insurerPaid: [] },
      }
    }
    groups[referenceMonth][category] += historyValue(item)
    groups[referenceMonth].items[category].push(historyItem(item))
    return groups
  }, {})).sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth))

  return { weeks, byReference }
}

const calculateMetrics = (debits, tenants, properties, month, percentage) => {
  const tenantMap = Object.fromEntries(tenants.map(tenant => [tenant.id, tenant]))
  const propertyMap = Object.fromEntries(properties.map(property => [property.id, property]))
  const monthDebits = debits.filter(debit => debit.mesReferencia === month)
  const balance = buildBalance(debits, [month])
  const previousMonth = previousMonthKey(month)
  const previousBalance = buildBalance(debits, [previousMonth])
  const [selectedYear, selectedMonthNumber] = month.split('-').map(Number)
  const yearMonths = Array.from({ length: selectedMonthNumber }, (_, index) => `${selectedYear}-${String(index + 1).padStart(2, '0')}`)
  const yearBalance = buildBalance(debits, yearMonths)
  const pastYearMonths = Array.from({ length: Math.max(0, selectedMonthNumber - 1) }, (_, index) => `${selectedYear}-${String(index + 1).padStart(2, '0')}`)
  const pastYearTotals = pastYearMonths.map(pastMonth => buildBalance(debits, [pastMonth]).total)
  const pastYearAverage = pastYearTotals.length > 0 ? pastYearTotals.reduce((sum, total) => sum + total, 0) / pastYearTotals.length : 0
  const openBalance = balance.open
  const nextMonthStart = monthEndDate(month)
  const nextMonth = monthKeyFromDate(nextMonthStart)
  const nextMonthFirst = `${nextMonth}-01`
  const forecast = buildForecast(debits, [month], nextMonthFirst)
  const forecastWithPreviousMonth = buildForecast(debits, [month, previousMonthKey(month)], nextMonthFirst)
  const receivablesForecast = buildReceivablesForecast(debits, [month, previousMonthKey(month)])
  const balanceWithPreviousMonth = buildBalance(debits, [month, previousMonthKey(month)])
  const revenue = monthlyRevenue(tenants)
  const unguaranteedDebits = monthDebits.filter(debit => normalizedValue(getGuaranteeKey(debit, tenantMap)) === 'sem_garantia')
  const activeTenants = tenants.filter(tenant => tenant.status === 'Ativo')
  const unguaranteedTenants = activeTenants.filter(tenant => normalizedValue(tenant.garantia || 'sem_garantia') === 'sem_garantia')
  const currentRate = revenue > 0 ? (balance.open / revenue) * 100 : 0
  const projectedRate = Number(percentage || 0)
  const projectedValue = revenue * (projectedRate / 100)
  const recoveryToProjected = Math.max(0, balance.open - projectedValue)
  const getPropertyLabel = debit => {
    const tenant = tenantMap[debit.inquilinoId]
    const property = propertyMap[tenant?.imovelId || debit.imovelId]
    return property?.codigo || debit.codigoImovel || 'Imóvel não informado'
  }
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
    return {
      status,
      debit: agreement.debit,
      tenantKey: agreement.debit.inquilinoId || agreement.debit.inquilinoNome || 'sem_inquilino',
      ...debitItem(agreement.debit),
    }
  })
  const agreementMadeCount = agreementDetails.length
  const agreementPaidItems = agreementDetails.filter(item => item.status === 'pago')
  const agreementBrokenItems = agreementDetails.filter(item => item.status === 'nao_cumprido')
  const agreementOpenItems = agreementDetails.filter(item => item.status === 'aberto')
  const agreementPaidCount = agreementPaidItems.length
  const agreementBrokenCount = agreementBrokenItems.length
  const agreementOpenCount = agreementOpenItems.length
  const buildReceivingTimeItems = items => items
    .filter(debit => isDashboardRecovered(debit) && debit.dataVencimento && debit.dataPagamento)
    .map(debit => ({
      name: debit.inquilinoNome || tenantMap[debit.inquilinoId]?.nome || 'Inquilino não informado',
      days: daysBetween(debit.dataVencimento, debit.dataPagamento),
    }))
    .filter(item => item.days !== null)
  const receivingTimeItems = buildReceivingTimeItems(monthDebits)
  const receivingTimeItemsWithPreviousMonth = buildReceivingTimeItems(debits.filter(debit => [month, previousMonth].includes(debit.mesReferencia)))
  const getModel = debit => {
    if (debit.modelo) return debit.modelo
    const tenant = tenantMap[debit.inquilinoId]
    const property = propertyMap[tenant?.imovelId || debit.imovelId]
    if (property?.modelo) return property.modelo
    const propertyByCode = properties.find(item => item.codigo && item.codigo === debit.codigoImovel)
    return propertyByCode?.modelo || 'Sem modelo'
  }
  const scenarioGroups = (items, getKey, labels) => Object.entries(items.reduce((groups, debit) => {
    const key = getKey(debit)
    if (!groups[key]) groups[key] = { total: 0, open: 0, items: [] }
    groups[key].total += dashboardDebtValue(debit)
    groups[key].open += openValueOf(debit)
    if (openValueOf(debit) > 0) groups[key].items.push({ ...debitItem(debit), value: openValueOf(debit) })
    return groups
  }, {})).map(([key, values]) => ({
    key,
    label: labels[key] || key,
    total: values.total,
    open: values.open,
    items: values.items,
    percentage: balance.open > 0 ? (values.open / balance.open) * 100 : 0,
  }))
  const modelScenario = scenarioGroups(monthDebits, getModel, { MA: 'MA', ML: 'ML', ME: 'ME' })
  const guaranteeScenario = scenarioGroups(monthDebits, debit => normalizedValue(getGuaranteeKey(debit, tenantMap)), {
    ...guaranteeLabels,
  })
  const guaranteeStatusKeys = Object.keys(guaranteeStatusLabels)
  const guaranteeValueData = Object.entries(monthDebits.reduce((groups, debit) => {
    const guaranteeKey = normalizedValue(getGuaranteeKey(debit, tenantMap))
    if (!groups[guaranteeKey]) {
      groups[guaranteeKey] = { garantia: guaranteeLabels[guaranteeKey] || guaranteeKey, ...Object.fromEntries(guaranteeStatusKeys.map(status => [status, 0])) }
    }
    groups[guaranteeKey][classifyGuaranteeStatus(debit)] += dashboardDebtValue(debit)
    return groups
  }, {})).map(([, values]) => values)
  const guaranteeValueTotal = guaranteeValueData.reduce((sum, item) => sum + guaranteeStatusKeys.reduce((itemTotal, status) => itemTotal + item[status], 0), 0)
  const openMonthDebits = monthDebits.filter(isUnpaid)
  const tenantCaseItems = Object.values(openMonthDebits.reduce((groups, debit) => {
    const tenantKey = debit.inquilinoId || debit.inquilinoNome || 'sem_inquilino'
    if (!groups[tenantKey]) {
      const guaranteeKey = normalizedValue(getGuaranteeKey(debit, tenantMap))
      const insuranceName = tenantMap[debit.inquilinoId]?.seguro || debit.seguro
      groups[tenantKey] = {
        key: tenantKey,
        name: debit.inquilinoNome || tenantMap[debit.inquilinoId]?.nome || 'Inquilino não informado',
        property: getPropertyLabel(debit),
        guarantee: guaranteeKey === 'seguro'
          ? `Seguro fiança${insuranceName ? `: ${insuranceName}` : ''}`
          : guaranteeLabels[guaranteeKey] || getGuaranteeKey(debit, tenantMap),
        recordCount: 0,
        totalValue: 0,
        agreementCount: 0,
        agreementPaidCount: 0,
        agreementBrokenCount: 0,
        paymentStatus: '',
      }
    }
    groups[tenantKey].recordCount += 1
    groups[tenantKey].totalValue += dashboardDebtValue(debit)
    return groups
  }, {})).map(item => {
    const tenantDebits = openMonthDebits.filter(debit => (debit.inquilinoId || debit.inquilinoNome || 'sem_inquilino') === item.key)
    const agreements = agreementDetails.filter(agreement => agreement.tenantKey === item.key && openValueOf(agreement.debit) > 0)
    const openStatuses = [...new Set(tenantDebits
      .filter(debit => openValueOf(debit) > 0)
      .map(debit => seguroAcionadoLabels[normalizedValue(debit.seguroAcionado)] || statusLabels[normalizedValue(debit.status)] || debit.status || 'Em aberto'))]
    const contactEvents = tenantDebits.flatMap(debit => Object.values(debit.timeline || {}).filter(event => event.tipo === 'Contato realizado'))
    
    
    return {
      ...item,
      agreementCount: agreements.length,
      agreementPaidCount: agreements.filter(agreement => agreement.status === 'pago').length,
      agreementBrokenCount: agreements.filter(agreement => agreement.status === 'nao_cumprido').length,
      contactCount: contactEvents.length,
      contactResponseCount: contactEvents.filter(event => event.respostaContato === 'sim').length,
      contactNoResponseCount: contactEvents.filter(event => event.respostaContato === 'nao').length,
      paymentStatus: openStatuses.length > 0 ? openStatuses.join(', ') : 'Pago',
    }
  })
  const activeTenantIds = new Set(tenants.filter(tenant => tenant.status === 'Ativo').map(tenant => tenant.id))
  const blacklistItems = Object.values(debits.filter(debit => debit.inquilinoId && activeTenantIds.has(debit.inquilinoId) && openValueOf(debit) > 0).reduce((groups, debit) => {
    const tenant = tenantMap[debit.inquilinoId]
    const tenantKey = debit.inquilinoId
    if (!groups[tenantKey]) {
      groups[tenantKey] = {
        key: tenantKey,
        name: debit.inquilinoNome || tenant?.nome || 'Inquilino não informado',
        value: 0,
        recordCount: 0,
        referenceMonthValue: 0,
      }
    }
    groups[tenantKey].value += openValueOf(debit)
    groups[tenantKey].recordCount += 1
    if (debit.mesReferencia === month) groups[tenantKey].referenceMonthValue += 1
    return groups
  }, {})).filter(item => item.referenceMonthValue > 0).sort((a, b) => b.recordCount - a.recordCount || b.value - a.value).slice(0, 10)
  const [reportYear, reportMonth] = month.split('-').map(Number)
  const anniversaryMonths = [0, 1, 2].map(offset => {
    const date = new Date(reportYear, reportMonth - 1 + offset, 1)
    return { key: monthKeyFromDate(date), year: date.getFullYear(), month: date.getMonth() }
  })
  const contractAnniversaryItems = tenants.filter(tenant => tenant.status === 'Ativo').map(tenant => {
    const entryDate = tenant.dataEntrada
    const parsedEntryDate = entryDate ? new Date(`${entryDate}T00:00:00`) : null
    const tenantDebits = debits.filter(debit => debit.inquilinoId === tenant.id)
    if (!parsedEntryDate || Number.isNaN(parsedEntryDate.getTime()) || tenantDebits.length === 0) return null
    const anniversaryMonth = anniversaryMonths.find(item => item.month === parsedEntryDate.getMonth())
    if (!anniversaryMonth) return null
    const anniversary = new Date(anniversaryMonth.year, anniversaryMonth.month, parsedEntryDate.getDate())
    const years = anniversary.getFullYear() - parsedEntryDate.getFullYear()
    if (years < 1) return null
    return {
      key: tenant.id,
      name: tenant.nome || 'Inquilino não informado',
      entryDate,
      anniversaryMonth: anniversaryMonth.key,
      years,
      debtCount: tenantDebits.length,
    }
  }).filter(Boolean).sort((a, b) => b.years - a.years || b.debtCount - a.debtCount)

  return {
    openBalance,
    forecast,
    forecastWithPreviousMonth,
    receivablesForecast,
    balance,
    yearBalance,
    totalVariation: {
      previousMonth: {
        total: previousBalance.total,
        delta: balance.total - previousBalance.total,
        percentage: variationPercentage(balance.total, previousBalance.total),
      },
      pastYearAverage: {
        total: pastYearAverage,
        delta: balance.total - pastYearAverage,
        percentage: variationPercentage(balance.total, pastYearAverage),
      },
    },
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
    receivingTimeItems,
    averageReceivingDays: receivingTimeItems.length > 0 ? receivingTimeItems.reduce((sum, item) => sum + item.days, 0) / receivingTimeItems.length : 0,
    receivingTimeItemsWithPreviousMonth,
    averageReceivingDaysWithPreviousMonth: receivingTimeItemsWithPreviousMonth.length > 0
      ? receivingTimeItemsWithPreviousMonth.reduce((sum, item) => sum + item.days, 0) / receivingTimeItemsWithPreviousMonth.length
      : 0,
    modelScenario,
    guaranteeScenario,
    guaranteeStatusKeys,
    guaranteeValueData,
    guaranteeValueTotal,
    monthDebits,
    tenantCaseItems,
    blacklistItems,
    contractAnniversaryItems,
    count: monthDebits.length,
  }
}

export default function RelatorioInadimplencia() {
  const [reports, setReports] = useState([])
  const [debits, setDebits] = useState([])
  const [tenants, setTenants] = useState([])
  const [properties, setProperties] = useState([])
  const [historicoAlteracoes, setHistoricoAlteracoes] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth)
  const [showCreate, setShowCreate] = useState(false)
  const [newMonth, setNewMonth] = useState(getCurrentMonth)
  const [percentageDraft, setPercentageDraft] = useState('0')
  const [editingPercentage, setEditingPercentage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPercentage, setSavingPercentage] = useState(false)
  const [commentDrafts, setCommentDrafts] = useState({})
  const [savingComment, setSavingComment] = useState('')
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

  useEffect(() => onValue(ref(db, 'imoveis'), snapshot => {
    const value = snapshot.val() || {}
    setProperties(Object.entries(value).map(([id, property]) => ({ id, ...property })))
  }), [])

  useEffect(() => onValue(ref(db, 'historicoAlteracoes'), snapshot => {
    const value = snapshot.val() || {}
    setHistoricoAlteracoes(Object.entries(value).map(([id, item]) => ({ id, ...item })))
  }), [])

  const selectedReport = reports.find(report => report.month === selectedMonth)
  const percentage = selectedReport?.projectedPercentage ?? 0
  const metrics = useMemo(
    () => calculateMetrics(debits, tenants, properties, selectedMonth, percentage),
    [debits, tenants, properties, selectedMonth, percentage]
  )
  const recoveryMetrics = useMemo(
    () => buildRecoveryMetrics(historicoAlteracoes, selectedMonth),
    [historicoAlteracoes, selectedMonth]
  )
  const reportMonths = reports.map(report => report.month)
  const selectedIndex = reportMonths.indexOf(selectedMonth)

  useEffect(() => {
    setPercentageDraft(String(selectedReport?.projectedPercentage ?? 0))
    setCommentDrafts(selectedReport?.comments || {})
  }, [selectedReport?.month, selectedReport?.projectedPercentage, selectedReport?.comments])

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

  const saveComment = async debitId => {
    if (!selectedReport) return
    setSavingComment(debitId)
    try {
      await update(ref(db, `relatoriosInadimplencia/${selectedMonth}/comments`), {
        [debitId]: commentDrafts[debitId] || '',
      })
    } finally {
      setSavingComment('')
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
                <div><span className="section-kicker">01</span><div><h3>Painel resumo</h3><p>Visão consolidada do mês e do acumulado de {selectedMonth.slice(0, 4)}.</p></div></div>
                <span className="debit-count">{metrics.count} {metrics.count === 1 ? 'inadimplência' : 'inadimplências'}</span>
              </div>
              <div className="annual-summary" aria-label={`Acumulado anual de ${selectedMonth.slice(0, 4)}`}>
                <div className="annual-summary-heading">
                  <div><span className="annual-summary-kicker">Acumulado do ano</span><strong>{selectedMonth.slice(0, 4)}</strong></div>
                  <span>{formatYearPeriod(selectedMonth)}</span>
                </div>
                <div className="annual-summary-grid">
                  <div className="annual-metric annual-metric-total"><span>Total de inadimplência</span><strong>{formatMoney(metrics.yearBalance.total)}</strong><small>Valor registrado no período</small></div>
                  <div className="annual-metric annual-metric-recovered"><span>Recuperado no ano</span><strong>{formatMoney(metrics.yearBalance.recovered)}</strong><small>Valores já recuperados</small></div>
                  <div className="annual-metric annual-metric-open"><span>Em aberto no ano</span><strong>{formatMoney(metrics.yearBalance.open)}</strong><small>Saldo ainda pendente</small></div>
                </div>
              </div>
              <div className="summary-grid">
                <div className="summary-row summary-row-featured">
                  <article className="summary-card summary-card-featured accent-blue">
                    <div className="projected-card-heading">
                      <span>Meta de inadimplencia</span>
                      {editingPercentage ? (
                        <div className="percentage-editor">
                          <Input autoFocus type="number" min="0" max="100" step="0.01" value={percentageDraft} onChange={event => setPercentageDraft(event.target.value)} aria-label="Taxa projetada" />
                          <span>%</span>
                          <Button type="button" size="sm" onClick={savePercentage} disabled={savingPercentage}>{savingPercentage ? 'Salvando' : 'Salvar'}</Button>
                        </div>
                      ) : (
                        <button type="button" className="rate-edit-button projected-rate-control" onClick={() => setEditingPercentage(true)}>
                          <span>Taxa projetada</span> <b>{metrics.projectedRate.toFixed(2)}%</b>
                        </button>
                      )}
                    </div>
                    <div className="projected-revenue">
                      <span>Faturamento do mês</span>
                      <strong>{formatMoney(metrics.revenue)}</strong>
                    </div>
                    <div className="rate-summary">
                      <span className="rate-item">Taxa atual de inadimplência <b>{metrics.currentRate.toFixed(2)}%</b></span>
                      <div className="rate-breakdown">
                        <small>Valor da taxa meta: <b>{formatMoney(metrics.projectedValue)}</b></small>
                        <small>Valor a recuperar para chegar na meta: <b>{formatMoney(metrics.recoveryToProjected)}</b></small>
                      </div>
                    </div>
                  </article>
                  <div className="summary-card summary-variation-panel accent-blue">
                    <div className="summary-variation">
                      <span>Variação vs mês anterior</span>
                      <strong className={metrics.totalVariation.previousMonth.delta > 0 ? 'variation-up' : metrics.totalVariation.previousMonth.delta < 0 ? 'variation-down' : 'variation-neutral'}>
                        {formatSignedMoney(metrics.totalVariation.previousMonth.delta)}{metrics.totalVariation.previousMonth.percentage === null ? '' : ` (${metrics.totalVariation.previousMonth.percentage >= 0 ? '+' : ''}${metrics.totalVariation.previousMonth.percentage.toFixed(2)}%)`}
                      </strong>
                    </div>
                    <div className="summary-variation">
                      <span>Variação vs média dos meses anteriores</span>
                      <strong className={metrics.totalVariation.pastYearAverage.delta > 0 ? 'variation-up' : metrics.totalVariation.pastYearAverage.delta < 0 ? 'variation-down' : 'variation-neutral'}>
                        {formatSignedMoney(metrics.totalVariation.pastYearAverage.delta)}{metrics.totalVariation.pastYearAverage.percentage === null ? '' : ` (${metrics.totalVariation.pastYearAverage.percentage >= 0 ? '+' : ''}${metrics.totalVariation.pastYearAverage.percentage.toFixed(2)}%)`}
                      </strong>
                    </div>
                  </div>
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
                <div className="receiving-time-card">
                  <div>
                    <span>Tempo para Receber Inadimplências</span>
                    <small>Média entre vencimento e pagamento no mês de {formatMonth(selectedMonth)}</small>
                  </div>
                  <strong>{metrics.averageReceivingDays.toFixed(1).replace('.', ',')} dias</strong>
                  <ReceivingTimeTooltip items={metrics.receivingTimeItems} />
                </div>
                <div className="receiving-time-card receiving-time-card-previous">
                  <div>
                    <span>Tempo para Receber Inadimplências com mês anterior</span>
                    <small>Média entre vencimento e pagamento de {formatMonth(selectedMonth)} e {formatMonth(previousMonthKey(selectedMonth))}</small>
                  </div>
                  <strong>{metrics.averageReceivingDaysWithPreviousMonth.toFixed(1).replace('.', ',')} dias</strong>
                  <ReceivingTimeTooltip items={metrics.receivingTimeItemsWithPreviousMonth} />
                </div>
              </div>
            </section>
            <section className="receivables-forecast-section">
              <div className="section-heading">
                <div><span className="section-kicker receivables-forecast-kicker">02</span><div><h3>Previsão de recebimentos</h3><p>Valores previstos para inadimplências de {formatMonth(selectedMonth)} e {formatMonth(previousMonthKey(selectedMonth))}.</p></div></div>
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
              <div className="receivables-horizon-grid">
                {metrics.receivablesForecast.horizons.map(horizon => (
                  <ForecastTooltip
                    key={horizon.days}
                    label={`Até ${horizon.days} dias`}
                    value={horizon.total}
                    items={horizon.items.map(item => ({ ...item, type: item.source, value: item.receivedValue }))}
                  />
                ))}
              </div>
              <div className="receivables-forecast-list">
                {metrics.receivablesForecast.items.length === 0 ? <div className="recovery-empty-cell">Nenhuma previsão com data válida encontrada.</div> : metrics.receivablesForecast.items.map(item => (
                  <div className="receivable-forecast-item" key={item.id}>
                    <div><strong>{item.name}</strong><span>{item.source}</span></div>
                    <b>{formatDate(item.expectedDate)}</b>
                    <strong>{formatMoney(item.receivedValue)}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="recovery-section">
              <div className="section-heading">
                <div><span className="section-kicker recovery-kicker">03</span><div><h3>Recuperação por semana</h3><p>Atualizações registradas no Histórico de Alterações durante {formatMonth(selectedMonth)}.</p></div></div>
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
                      <th>Total recuperado</th>
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
                        <td><span className="recovery-value recovery-value-green">{formatMoney(week.totals.recovered + week.totals.insurerPaid)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="recovery-week-label">Total geral</td>
                      <td colSpan="4"></td>
                      <td className="recovery-total-cell">{formatMoney(recoveryMetrics.weeks.reduce((sum, week) => sum + week.totals.recovered + week.totals.insurerPaid, 0))}</td>
                    </tr>
                  </tfoot>
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
                      <th>Total recuperado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recoveryMetrics.byReference.length === 0 ? (
                      <tr><td colSpan="6" className="recovery-empty-cell">Nenhuma alteração de recuperação registrada neste mês.</td></tr>
                    ) : recoveryMetrics.byReference.map(reference => (
                      <tr key={reference.referenceMonth}>
                        <td className="recovery-week-label">{reference.referenceMonth === 'sem_mes' ? 'Sem mês informado' : formatMonth(reference.referenceMonth)}</td>
                        <td><ListTooltip title={`Recuperado · ${reference.referenceMonth === 'sem_mes' ? 'Sem mês informado' : formatMonth(reference.referenceMonth)}`} items={reference.items.recovered} emptyLabel="Nenhuma recuperação"><span className="recovery-value recovery-value-green">{formatMoney(reference.recovered)}</span></ListTooltip></td>
                        <td><ListTooltip title={`Seguros acionados · ${reference.referenceMonth === 'sem_mes' ? 'Sem mês informado' : formatMonth(reference.referenceMonth)}`} items={reference.items.activated} emptyLabel="Nenhum seguro acionado"><span className="recovery-value">{formatMoney(reference.activated)}</span></ListTooltip></td>
                        <td><ListTooltip title={`Seguros aprovados · ${reference.referenceMonth === 'sem_mes' ? 'Sem mês informado' : formatMonth(reference.referenceMonth)}`} items={reference.items.approved} emptyLabel="Nenhum seguro aprovado"><span className="recovery-value">{formatMoney(reference.approved)}</span></ListTooltip></td>
                        <td><ListTooltip title={`Pago pela seguradora · ${reference.referenceMonth === 'sem_mes' ? 'Sem mês informado' : formatMonth(reference.referenceMonth)}`} items={reference.items.insurerPaid} emptyLabel="Nenhum pagamento pela seguradora"><span className="recovery-value recovery-value-blue">{formatMoney(reference.insurerPaid)}</span></ListTooltip></td>
                        <td><span className="recovery-value recovery-value-green">{formatMoney(reference.recovered + reference.insurerPaid)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="recovery-week-label">Total geral</td>
                      <td colSpan="4"></td>
                      <td className="recovery-total-cell">{formatMoney(recoveryMetrics.byReference.reduce((sum, reference) => sum + reference.recovered + reference.insurerPaid, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
            <section className="scenario-section">
              <div className="section-heading">
                <div><span className="section-kicker scenario-kicker">04</span><div><h3>Cenário do mês vigente</h3><p>Inadimplência aberta de {formatMonth(selectedMonth)} por modelo e garantia.</p></div></div>
              </div>
              <div className="scenario-grid">
                <ScenarioChart title="Participação por modelo" data={metrics.modelScenario} />
                <ScenarioChart title="Participação por garantia" data={metrics.guaranteeScenario} />
                <div className="scenario-group">
                  <h4>Por modelo</h4>
                  <div className="scenario-items">
                    {metrics.modelScenario.length === 0 ? <small>Nenhuma inadimplência aberta.</small> : metrics.modelScenario.map(item => (
                      <ListTooltip key={item.key} title={`Modelo · ${item.label}`} items={item.items} emptyLabel="Nenhuma inadimplência aberta">
                        <div className="scenario-item"><span>{item.label}</span><b>Total: {formatMoney(item.total)} · Aberto: {formatMoney(item.open)} · {item.percentage.toFixed(2)}%</b></div>
                      </ListTooltip>
                    ))}
                  </div>
                </div>
                <div className="scenario-group">
                  <h4>Por garantia</h4>
                  <div className="scenario-items">
                    {metrics.guaranteeScenario.length === 0 ? <small>Nenhuma inadimplência aberta.</small> : metrics.guaranteeScenario.map(item => (
                      <ListTooltip key={item.key} title={`Garantia · ${item.label}`} items={item.items} emptyLabel="Nenhuma inadimplência aberta">
                        <div className="scenario-item"><span>{item.label}</span><b>Total: {formatMoney(item.total)} · Aberto: {formatMoney(item.open)} · {item.percentage.toFixed(2)}%</b></div>
                      </ListTooltip>
                    ))}
                  </div>
                </div>
                <GuaranteeValueChart data={metrics.guaranteeValueData} total={metrics.guaranteeValueTotal} statusKeys={metrics.guaranteeStatusKeys} />
              </div>
            </section>
            <section className="blacklist-section">
              <div className="section-heading">
                <div><span className="section-kicker blacklist-kicker">05</span><div><h3>BlackList</h3><p>10 inquilinos ativos com mais registros de inadimplência e ocorrência em {formatMonth(selectedMonth)}.</p></div></div>
              </div>
              <div className="blacklist-list">
                {metrics.blacklistItems.length === 0 ? <div className="recovery-empty-cell">Nenhum inquilino ativo possui registro de inadimplência neste mês.</div> : metrics.blacklistItems.map(item => (
                  <div className="blacklist-item" key={item.key}>
                    <strong>{item.name}</strong>
                    <span>{item.recordCount} inadimplência{item.recordCount === 1 ? '' : 's'} registrada{item.recordCount === 1 ? '' : 's'}</span>
                    <small className={item.referenceMonthValue > 0 ? 'blacklist-reference-yes' : 'blacklist-reference-no'}>Mês referente: {item.referenceMonthValue > 0 ? `${item.referenceMonthValue} registro${item.referenceMonthValue === 1 ? '' : 's'}` : 'Não'}</small>
                  </div>
                ))}
              </div>
              <div className="contract-anniversary-block">
                <div className="blacklist-subheading"><strong>Contratos completando 1 ou mais anos</strong><span>Inquilinos ativos com inadimplências registradas e aniversário contratual entre {formatMonth(selectedMonth)} e os próximos 2 meses</span></div>
                <div className="contract-anniversary-list">
                  {metrics.contractAnniversaryItems.length === 0 ? <div className="recovery-empty-cell">Nenhum contrato com inadimplência completa aniversário neste mês.</div> : metrics.contractAnniversaryItems.map(item => (
                    <div className="contract-anniversary-item" key={item.key}>
                      <strong>{item.name}</strong>
                      <span>{item.years} ano{item.years === 1 ? '' : 's'} em {formatMonth(item.anniversaryMonth)}</span>
                      <b>{item.debtCount} inadimplência{item.debtCount === 1 ? '' : 's'} registrada{item.debtCount === 1 ? '' : 's'}</b>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <section className="case-section">
              <div className="section-heading">
                <div><span className="section-kicker case-kicker">06</span><div><h3>Caso a caso</h3><p>Comentários individuais das inadimplências de {formatMonth(selectedMonth)}.</p></div></div>
              </div>
                <div className="case-list">
                {metrics.tenantCaseItems?.length === 0 ? <div className="recovery-empty-cell">Nenhuma inadimplência neste mês.</div> : metrics.tenantCaseItems?.map(item => (
                  <div className="case-item" key={item.key}>
                    <div className="case-info"><strong>{item.name}</strong><span className="case-property">Imóvel: {item.property}</span><div className="case-meta"><span className="case-guarantee">Garantia: {item.guarantee}</span><span className="case-total">{formatMoney(item.totalValue)}</span></div><small className={['Pago', 'Seguro acionado', 'Pagamento aprovado pela seguradora'].includes(item.paymentStatus) ? 'case-paid' : 'case-open'}>{item.paymentStatus === 'Pago' ? 'Inadimplência paga' : `Status: ${item.paymentStatus}`}</small></div>
                    <div className="case-stats">
                      <div className="case-stat-row"><span><b>{item.recordCount}</b> inadimplência{item.recordCount === 1 ? '' : 's'}</span><span><b>{item.agreementCount}</b> acordo{item.agreementCount === 1 ? '' : 's'}</span></div>
                      <div className="case-stat-row"><span><b>{item.agreementPaidCount}</b> cumprido{item.agreementPaidCount === 1 ? '' : 's'}</span><span><b>{item.agreementBrokenCount}</b> não cumprido{item.agreementBrokenCount === 1 ? '' : 's'}</span></div>
                      <div className="case-stat-row case-contact-row"><span>Contatos: <b>{item.contactCount}</b></span><span>Com retorno: <b>{item.contactResponseCount}</b></span><span>Sem retorno: <b>{item.contactNoResponseCount}</b></span></div>
                    </div>
                    <div className="case-comment"><Input value={commentDrafts[item.key] || ''} onChange={event => setCommentDrafts(prev => ({ ...prev, [item.key]: event.target.value }))} placeholder="Adicionar comentário..." /><Button type="button" size="sm" onClick={() => saveComment(item.key)} disabled={savingComment === item.key}>{savingComment === item.key ? 'Salvando' : 'Salvar'}</Button></div>
                  </div>
                ))}
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
