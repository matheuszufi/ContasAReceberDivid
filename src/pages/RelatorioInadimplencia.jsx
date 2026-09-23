import React, { useEffect, useMemo, useState } from 'react'
import { onValue, ref, runTransaction, update } from 'firebase/database'
import { CalendarDays, ChevronLeft, ChevronRight, FilePlus2, Loader2, X } from 'lucide-react'
import { db, auth } from '../firebase'
import Layout from '../components/Layout'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
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

  return {
    paymentApproved: sumValues(paymentApproved),
    agreements: sumValues(agreements),
    total: sumValues(paymentApproved) + sumValues(agreements),
  }
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
  const unguaranteedDebits = monthDebits.filter(debit => normalizedValue(getGuaranteeKey(debit, tenantMap)) === 'sem_garantia')

  return {
    openBalance,
    forecast,
    forecastWithPreviousMonth,
    balance,
    balanceWithPreviousMonth,
    unguaranteedTotal: unguaranteedDebits.reduce((sum, debit) => sum + dashboardDebtValue(debit), 0),
    unguaranteedOpen: unguaranteedDebits
      .filter(debit => !isExposurePaid(debit))
      .reduce((sum, debit) => sum + dashboardDebtValue(debit), 0),
    unguaranteedRecovered: unguaranteedDebits
      .filter(isExposurePaid)
      .reduce((sum, debit) => sum + dashboardDebtValue(debit), 0),
    projected: openBalance * (Number(percentage || 0) / 100),
    count: monthDebits.length,
  }
}

export default function RelatorioInadimplencia() {
  const [reports, setReports] = useState([])
  const [debits, setDebits] = useState([])
  const [tenants, setTenants] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth)
  const [showCreate, setShowCreate] = useState(false)
  const [newMonth, setNewMonth] = useState(getCurrentMonth)
  const [percentageDraft, setPercentageDraft] = useState('0')
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

  const selectedReport = reports.find(report => report.month === selectedMonth)
  const percentage = selectedReport?.projectedPercentage ?? 0
  const metrics = useMemo(
    () => calculateMetrics(debits, tenants, selectedMonth, percentage),
    [debits, tenants, selectedMonth, percentage]
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
                <div className="summary-row summary-row-single">
                  <article className="summary-card accent-blue">
                    <span>Inadimplência projetada para o fechamento</span>
                    <strong>{percentage}%</strong>
                    <div className="percentage-editor">
                      <Input type="number" min="0" max="100" step="0.01" value={percentageDraft} onChange={event => setPercentageDraft(event.target.value)} aria-label="Percentual projetado" />
                      <span>%</span>
                      <Button type="button" size="sm" onClick={savePercentage} disabled={savingPercentage}>{savingPercentage ? 'Salvando' : 'Salvar'}</Button>
                    </div>
                    <small>Projeção de {formatMoney(metrics.projected)} sobre o saldo aberto</small>
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
                      <small>Pagamento aprovado: <b>{formatMoney(metrics.forecast.paymentApproved)}</b></small>
                      <small>Acordos: <b>{formatMoney(metrics.forecast.agreements)}</b></small>
                    </div>
                    <small className="forecast-source">Somente inadimplências de {formatMonth(selectedMonth)}</small>
                  </article>
                  <article className="summary-card accent-green">
                    <span>Previsto até 01/{nextMonth.slice(5)}/{nextMonth.slice(0, 4)} com mês anterior</span>
                    <strong>{formatMoney(metrics.forecastWithPreviousMonth.total)}</strong>
                    <div className="forecast-breakdown">
                      <small>Pagamento aprovado: <b>{formatMoney(metrics.forecastWithPreviousMonth.paymentApproved)}</b></small>
                      <small>Acordos: <b>{formatMoney(metrics.forecastWithPreviousMonth.agreements)}</b></small>
                    </div>
                    <small className="forecast-source">Inadimplências de {formatMonth(selectedMonth)} + {formatMonth(previousMonthKey(selectedMonth))}</small>
                  </article>
                </div>
                <div className="summary-row summary-row-single">
                  <article className="summary-card accent-red">
                    <span>Exposição líquida</span>
                    <strong>{formatMoney(metrics.unguaranteedOpen)}</strong>
                    <small>Total: {formatMoney(metrics.unguaranteedTotal)} <br /> Recuperado: {formatMoney(metrics.unguaranteedRecovered)}</small>
                  </article>
                </div>
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