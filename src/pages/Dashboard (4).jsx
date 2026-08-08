import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

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
      map[monthKey] = { inadimplente: 0, recuperado: 0 }
    }
    if (item.status === 'pago') {
      map[monthKey].recuperado += value
    } else {
      map[monthKey].inadimplente += value
    }
  })
  return map
}

const getPieSegments = (value, recovered) => {
  const total = Math.max(value, recovered)
  const recoveredValue = Math.max(0, recovered)
  const remaining = Math.max(0, total - recoveredValue)
  return {
    recovered: recoveredValue,
    remaining,
    percentage: total > 0 ? Math.round((recoveredValue / total) * 100) : 0,
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

  const yearMonthTotals = useMemo(() => buildMonthlyTotals(inadimplencias, selectedYear), [inadimplencias, selectedYear])

  const inquilinoMap = useMemo(
    () => Object.fromEntries(inquilinos.map(i => [i.id, i])),
    [inquilinos]
  )

  const monthCards = useMemo(() => MONTH_FULL_LABELS.map((label, index) => {
    const key = `${selectedYear}-${String(index + 1).padStart(2, '0')}`
    const totals = yearMonthTotals[key] || { inadimplente: 0, recuperado: 0 }
    const total = totals.inadimplente + totals.recuperado
    const recoveredPercent = total > 0 ? Math.round((totals.recuperado / total) * 100) : 0
    return {
      key,
      label,
      inadimplente: totals.inadimplente,
      recuperado: totals.recuperado,
      recoveredPercent,
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
    return inadimplencias.filter(d => keys.has(getMonthKey(d)))
  }, [inadimplencias, periodMonthKeys])

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
      const totals = yearMonthTotals[key] || { inadimplente: 0, recuperado: 0 }
      return {
        inadimplente: acc.inadimplente + totals.inadimplente,
        recuperado: acc.recuperado + totals.recuperado,
      }
    }, { inadimplente: 0, recuperado: 0 })
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
    selectedMonthTotals.inadimplente + selectedMonthTotals.recuperado,
    selectedMonthTotals.recuperado
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
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon">🏠</div>
          <div className="stat-value">{totalImoveis}</div>
          <div className="stat-label">Total de Imóveis</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👤</div>
          <div className="stat-value">{totalInquilinosAtivos}</div>
          <div className="stat-label">Inquilinos Ativos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⚠️</div>
          <div className="stat-value">{uniqueInadimplentes}</div>
          <div className="stat-label">Inadimplentes</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-value">{fmtMoney(receitaMensal)}</div>
          <div className="stat-label">Receita Mensal</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header" style={{ alignItems: 'center' }}>
          <div>
            <h3>Inadimplência por Período</h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              Navegue por ano e filtre por mês para ver valores e recuperação.
            </p>
          </div>
          <div className="year-controls">
            <button className="year-btn" type="button" onClick={() => handleYearChange(-1)}>{'←'}</button>
            <span className="year-label">{selectedYear}</span>
            <button className="year-btn" type="button" onClick={() => handleYearChange(1)}>{'→'}</button>
          </div>
        </div>
        <div className="card-body">
          <div className="chart-row">
            <div className="chart-card">
              <div className="chart-card-header">
                <h4>Recuperação de Inadimplência</h4>
                <small>{selectedPeriodLabel}</small>
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
                    strokeDasharray={`${(pie.percentage / 100) * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE - (pie.percentage / 100) * DONUT_CIRCUMFERENCE}`}
                    strokeDashoffset="0"
                    transform="rotate(90 60 60)"
                    strokeLinecap="butt"
                  />
                </svg>
                <div className="donut-center">
                  <strong>{pie.percentage}%</strong>
                  <span>recuperado</span>
                </div>
              </div>
              <div className="donut-legend">
                <div>
                  <span className="dot dot-paid"></span>
                  Recuperado: {fmtMoney(selectedMonthTotals.recuperado)}
                </div>
                <div>
                  <span className="dot dot-pending"></span>
                  Aberto: {fmtMoney(selectedMonthTotals.inadimplente)}
                </div>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-card-header chart-card-header-right">
                <div>
                  <h4>Pagamentos por mês</h4>
                  <small>Ano {selectedYear}</small>
                </div>
                <div className="top-filter-group">
                  <button
                    type="button"
                    className={`top-filter-btn ${periodMode === 'ano' ? 'active' : ''}`}
                    onClick={() => setPeriodMode('ano')}
                  >
                    Ano todo
                  </button>
                  <button
                    type="button"
                    className={`top-filter-btn ${periodMode === 'h1' ? 'active' : ''}`}
                    onClick={() => setPeriodMode('h1')}
                  >
                    1º semestre
                  </button>
                  <button
                    type="button"
                    className={`top-filter-btn ${periodMode === 'h2' ? 'active' : ''}`}
                    onClick={() => setPeriodMode('h2')}
                  >
                    2º semestre
                  </button>
                </div>
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
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div className="mc-top-row">
                        <span>{MONTH_LABELS[Number(card.key.slice(-2)) - 1]}</span>
                        <strong>{fmtMoney(card.inadimplente + card.recuperado)}</strong>
                      </div>
                      <div className="mc-values-row">
                        <div className="mc-value-group">
                          <span className="mc-value-label">Recuperado</span>
                          <strong>{fmtMoney(card.recuperado)}</strong>
                        </div>
                        <div className="mc-value-group">
                          <span className="mc-value-label">Em aberto</span>
                          <strong>{fmtMoney(card.inadimplente)}</strong>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="chart-card chart-card-right">
              <div className="chart-card-header chart-card-header-right">
                <div>
                  <h4>Maiores inadimplentes</h4>
                  <small>{selectedPeriodLabel}</small>
                </div>
                <div className="top-filter-group">
                  <button
                    type="button"
                    className={`top-filter-btn ${topFilter === 'valor' ? 'active' : ''}`}
                    onClick={() => setTopFilter('valor')}
                  >
                    Maior valor
                  </button>
                  <button
                    type="button"
                    className={`top-filter-btn ${topFilter === 'quantidade' ? 'active' : ''}`}
                    onClick={() => setTopFilter('quantidade')}
                  >
                    Mais inadimplências
                  </button>
                </div>
              </div>
              <div className="top-list">
                {topInadimplentes.length === 0 ? (
                  <div className="empty-state">Nenhum inadimplente no período.</div>
                ) : (
                  topInadimplentes.map((item, index) => (
                    <div key={item.id} className="top-list-item">
                      <div>
                        <span className="top-list-rank">#{index + 1}</span>
                        <strong>{item.name}</strong>
                        <span className="top-list-count">{item.count} inadimplência{item.count === 1 ? '' : 's'}</span>
                      </div>
                      <strong>{fmtMoney(item.total)}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
