import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import { normalizeText } from '@/lib/utils'
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
  Home,
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

const SEGURO_FIANCA_LABELS = {
  credaluga: 'Credaluga',
  credpago:  'Credpago',
  lado_bom:  'Lado Bom',
  Avalyst:   'Avalyst',
}

const MODELO_LABELS = {
  MA: 'MA',
  ME: 'ME',
  ML: 'ML',
}

// Cores usadas no gráfico de pizza do card "Garantias dos Inadimplentes"
const GARANTIA_CHART_COLORS = {
  seguro_credaluga: '#3b82f6',
  seguro_credpago:  '#06b6d4',
  seguro_lado_bom:  '#8b5cf6',
  seguro_Avalyst:   '#ec4899',
  seguro_outro:     '#a855f7',
  caucao:           '#22c55e',
  adiantamento:     '#eab308',
  sem_garantia:     '#64748b',
}

const fmtMoney = (value) =>
  'R$ ' + Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const fmtMoneyCompact = (value) => {
  const num = Number(value || 0)
  if (Math.abs(num) >= 1000) {
    return num.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
      maximumFractionDigits: 1,
    })
  }
  return fmtMoney(num)
}

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
  const [proprietarios, setProprietarios] = useState([])
  const [contasCatalogo, setContasCatalogo] = useState([])
  const [valoresVariaveis, setValoresVariaveis] = useState({})
  const [inadimplencias, setInadimplencias] = useState([])
  const [lucroAno, setLucroAno] = useState(currentYear)
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [topFilter, setTopFilter] = useState('valor')
  const [periodMode, setPeriodMode] = useState('month') // 'month' | 'ano' | 'h1' | 'h2'
  const [ocupacoesYear, setOcupacoesYear] = useState(currentYear)
  const [colFilters, setColFilters] = useState({
    modelo: '',
    garantia: '',
  })

  // Filtros do card "Garantias dos Inadimplentes"
  const [garantiaFilterMode, setGarantiaFilterMode] = useState('month') // 'month' | 'range'
  const [garantiaFilterMonth, setGarantiaFilterMonth] = useState(currentMonth)
  const [garantiaFilterStart, setGarantiaFilterStart] = useState('')
  const [garantiaFilterEnd, setGarantiaFilterEnd] = useState('')
  const [segurosCatalogo, setSegurosCatalogo] = useState([])

  const setColFilter = (field, value) =>
    setColFilters(prev => ({ ...prev, [field]: value }))

  const limparColFilters = () =>
    setColFilters({ modelo: '', garantia: '' })

  useEffect(() => {
    const imoveisRef = ref(db, 'imoveis')
    const inquilinosRef = ref(db, 'inquilinos')
    const proprietariosRef = ref(db, 'proprietarios')
    const contasRef = ref(db, 'contas')
    const valoresVariaveisRef = ref(db, 'valoresVariaveis')
    const inadimplenciasRef = ref(db, 'inadimplencias')
    const segurosRef = ref(db, 'seguros')

    const unsubImoveis = onValue(imoveisRef, snap => {
      const data = snap.val()
      setImoveis(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
    })

    const unsubInquilinos = onValue(inquilinosRef, snap => {
      const data = snap.val()
      setInquilinos(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
    })

    const unsubProprietarios = onValue(proprietariosRef, snap => {
      const data = snap.val()
      setProprietarios(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
    })

    const unsubContas = onValue(contasRef, snap => {
      const data = snap.val()
      setContasCatalogo(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
    })

    const unsubValoresVariaveis = onValue(valoresVariaveisRef, snap => {
      setValoresVariaveis(snap.val() || {})
    })

    const unsubInadimplencias = onValue(inadimplenciasRef, snap => {
      const data = snap.val()
      setInadimplencias(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
    })

    const unsubSeguros = onValue(segurosRef, snap => {
      const data = snap.val()
      setSegurosCatalogo(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
    })

    return () => {
      unsubImoveis()
      unsubInquilinos()
      unsubProprietarios()
      unsubContas()
      unsubValoresVariaveis()
      unsubInadimplencias()
      unsubSeguros()
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

  // Soma o lucro da imobiliária (Taxa Adm + Taxa Contrato) mês a mês para o ano selecionado.
  const lucroPorMes = useMemo(() => {
    const calcularLucroMes = (mes) => {
      return proprietarios.reduce((somaProprietario, proprietario) => {
        const lucroProprietario = Object.entries(proprietario?.imoveisVinculos || {}).reduce((somaImovel, [imovelId, vinculo]) => {
          const inquilino = inquilinos
            .filter(item => {
              if (item.imovelId !== imovelId) return false
              const entrada = item.dataEntrada?.slice(0, 7)
              const saida = item.dataSaida?.slice(0, 7)
              return (!entrada || mes >= entrada) && (!saida || mes <= saida)
            })
            .sort((a, b) => (b.dataEntrada || '').localeCompare(a.dataEntrada || ''))[0]

          if (!inquilino) return somaImovel

          const valoresMes = valoresVariaveis[inquilino.id]?.[mes] || {}
          const { _registrado = {}, _obs, extras = {}, ...valoresLancados } = valoresMes
          const aluguel = '_aluguel' in valoresLancados
            ? Number(valoresLancados._aluguel) || 0
            : Number(inquilino.valorAluguel) || 0

          const getValorConta = contaId => contaId in valoresLancados
            ? Number(valoresLancados[contaId]) || 0
            : Number(inquilino.contasValores?.[contaId]) || 0

          const incidencia = vinculo.incidenciaTaxaAdm?.length ? vinculo.incidenciaTaxaAdm : []
          const baseAdministrativa = incidencia.reduce((total, item) => {
            if (item === 'aluguel') return total + aluguel

            const termo = item === 'condominio' ? 'condom' : item === 'iptu' ? 'iptu' : 'serv'
            const contaIds = new Set([
              ...Object.keys(inquilino.contasValores || {}),
              ...Object.keys(valoresLancados).filter(key => !key.startsWith('_')),
            ])
            const valorContas = [...contaIds].reduce((somaContas, contaId) => {
              const nomeConta = normalizeText(contasCatalogo.find(conta => conta.id === contaId)?.nome || contaId)
              return nomeConta.includes(termo) ? somaContas + getValorConta(contaId) : somaContas
            }, 0)
            return total + valorContas
          }, 0)

          const taxaAdministrativa = baseAdministrativa * ((Number(vinculo.taxaAdministracao) || 0) / 100)
          const primeiroAluguel = inquilino.dataEntrada?.slice(0, 7) === mes
          const taxaContrato = primeiroAluguel
            ? aluguel * ((Number(vinculo.taxaContrato) || 0) / 100)
            : 0

          return somaImovel + taxaAdministrativa + taxaContrato
        }, 0)

        return somaProprietario + lucroProprietario
      }, 0)
    }

    return Array.from({ length: 12 }, (_, index) => {
      const mes = `${lucroAno}-${String(index + 1).padStart(2, '0')}`
      return { mes, total: calcularLucroMes(mes) }
    })
  }, [proprietarios, inquilinos, contasCatalogo, valoresVariaveis, lucroAno])

  const maxLucroValor = useMemo(
    () => Math.max(...lucroPorMes.map(m => m.total), 0),
    [lucroPorMes]
  )

  const maxLucroMes = useMemo(
    () => lucroPorMes.find(m => m.total === maxLucroValor) || null,
    [lucroPorMes, maxLucroValor]
  )

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

  // Conta quantas ocupações (entradas de inquilinos) ocorreram em cada mês do ano selecionado
  const ocupacoesPorMes = useMemo(() => {
    const counts = Array(12).fill(0)
    inquilinos.forEach(i => {
      if (!i.dataEntrada || !i.dataEntrada.startsWith(ocupacoesYear)) return
      const monthIndex = Number(i.dataEntrada.substring(5, 7)) - 1
      if (monthIndex >= 0 && monthIndex < 12) counts[monthIndex] += 1
    })
    return counts
  }, [inquilinos, ocupacoesYear])

  const desocupacoesPorMes = useMemo(() => {
    const counts = Array(12).fill(0)
    inquilinos.forEach(i => {
      if (!i.dataSaida || !i.dataSaida.startsWith(ocupacoesYear)) return
      const monthIndex = Number(i.dataSaida.substring(5, 7)) - 1
      if (monthIndex >= 0 && monthIndex < 12) counts[monthIndex] += 1
    })
    return counts
  }, [inquilinos, ocupacoesYear])

  const handleOcupacoesYearChange = (direction) => {
    setOcupacoesYear(prev => String(Number(prev) + direction))
  }

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

  const segurosExpirandoFianca = useMemo(
    () => inquilinos.filter(i => i.garantia === 'seguro' && i.seguroFiancaMesFim === currentMonth),
    [inquilinos]
  )

  const segurosExpirandoIncendio = useMemo(
    () => inquilinos.filter(i => i.seguroIncendioMesFim === currentMonth),
    [inquilinos]
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

  // ---- Card "Garantias dos Inadimplentes" ----

  // Filtra as inadimplências em aberto de acordo com o modo escolhido (mês único ou intervalo de datas)
  // Usa TODAS as inadimplências do período (inclusive as já pagas/recuperadas), não só as em aberto
  const garantiaFilteredDebts = useMemo(() => {
    return inadimplencias.filter(d => {
      if (garantiaFilterMode === 'month') {
        return getMonthKey(d) === garantiaFilterMonth
      }
      const dateStr = d.dataVencimento || (d.mesReferencia ? `${d.mesReferencia}-01` : null)
      if (!dateStr) return false
      if (garantiaFilterStart && dateStr < garantiaFilterStart) return false
      if (garantiaFilterEnd && dateStr > garantiaFilterEnd) return false
      return true
    })
  }, [inadimplencias, garantiaFilterMode, garantiaFilterMonth, garantiaFilterStart, garantiaFilterEnd])

  // Mapa nome da seguradora -> cor cadastrada na página "Cadastrar Seguros"
  const seguroCorPorNome = useMemo(
    () => Object.fromEntries(
      segurosCatalogo
        .filter(s => s.tipo === 'Seguro Fiança')
        .map(s => [s.nome, s.cor])
    ),
    [segurosCatalogo]
  )

  // Agrupa por tipo de garantia contando cada INQUILINO uma única vez, mesmo que ele tenha
  // vários débitos cadastrados no período (pagos e/ou em aberto)
  const garantiaBreakdown = useMemo(() => {
    const seen = new Map() // tenantKey -> { key, label, color }
    garantiaFilteredDebts.forEach(d => {
      const tenantKey = d.inquilinoId || d.inquilinoNome || d.id
      if (seen.has(tenantKey)) return

      const garantiaInfo = getGarantia(d)
      let key = garantiaInfo.key
      let label = garantiaInfo.label
      let color = null

      if (key === 'seguro') {
        const seguroTipo = inquilinoMap[d.inquilinoId]?.seguro || d.seguro
        const seguroLabel = SEGURO_FIANCA_LABELS[seguroTipo] || seguroTipo || 'Outro'
        key = `seguro_${seguroTipo || 'outro'}`
        label = `S.F. ${seguroLabel}`
        color = seguroCorPorNome[seguroTipo] || null
      }

      seen.set(tenantKey, { key, label, color })
    })

    const counts = {}
    seen.forEach(({ key, label, color }) => {
      if (!counts[key]) counts[key] = { key, label, color, count: 0 }
      counts[key].count += 1
    })

    const total = seen.size
    return Object.values(counts)
      .map(c => ({ ...c, percent: total > 0 ? Math.round((c.count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count)
  }, [garantiaFilteredDebts, inquilinoMap, seguroCorPorNome])

  const garantiaTotal = useMemo(
    () => garantiaBreakdown.reduce((sum, c) => sum + c.count, 0),
    [garantiaBreakdown]
  )

  // Calcula o ângulo inicial de cada fatia do donut; usa a cor cadastrada da seguradora
  // quando disponível, senão cai na cor fixa por tipo de garantia
  const garantiaSlices = useMemo(() => {
    let cumulative = 0
    return garantiaBreakdown.map(item => {
      const startPercent = cumulative
      cumulative += item.percent
      return { ...item, startPercent, color: item.color || GARANTIA_CHART_COLORS[item.key] || '#94a3b8' }
    })
  }, [garantiaBreakdown])

  const garantiaFilterLabel = useMemo(() => {
    if (garantiaFilterMode === 'month') return getMonthLabel(garantiaFilterMonth)
    if (garantiaFilterStart && garantiaFilterEnd) {
      return `${garantiaFilterStart.split('-').reverse().join('/')} até ${garantiaFilterEnd.split('-').reverse().join('/')}`
    }
    if (garantiaFilterStart) return `A partir de ${garantiaFilterStart.split('-').reverse().join('/')}`
    if (garantiaFilterEnd) return `Até ${garantiaFilterEnd.split('-').reverse().join('/')}`
    return 'Todo o período'
  }, [garantiaFilterMode, garantiaFilterMonth, garantiaFilterStart, garantiaFilterEnd])

  // Card "Garantias de Todos os Inquilinos"
  const garantiasInquilinosBreakdown = useMemo(() => {
    const counts = {}

    inquilinos.forEach(inquilino => {
      const garantia = inquilino.garantia || 'sem_garantia'
      let key = garantia
      let label = GARANTIA_LABELS[garantia] || garantia
      let color = null

      if (garantia === 'seguro') {
        const seguroTipo = inquilino.seguro
        const seguroLabel = SEGURO_FIANCA_LABELS[seguroTipo] || seguroTipo || 'Outro'
        key = `seguro_${seguroTipo || 'outro'}`
        label = `S.F. ${seguroLabel}`
        color = seguroCorPorNome[seguroTipo] || null
      }

      if (!counts[key]) {
        counts[key] = { key, label, color, count: 0 }
      }
      counts[key].count += 1
    })

    const total = inquilinos.length
    return Object.values(counts)
      .map(c => ({ ...c, percent: total > 0 ? Math.round((c.count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count)
  }, [inquilinos, seguroCorPorNome])

  const garantiaInquilinosTotal = inquilinos.length

  const garantiaInquilinosSlices = useMemo(() => {
    let cumulative = 0
    return garantiasInquilinosBreakdown.map(item => {
      const startPercent = cumulative
      cumulative += item.percent
      return { ...item, startPercent, color: item.color || GARANTIA_CHART_COLORS[item.key] || '#94a3b8' }
    })
  }, [garantiasInquilinosBreakdown])

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

      {(segurosExpirandoFianca.length > 0 || segurosExpirandoIncendio.length > 0) && (
        <div className="mb-6 flex flex-wrap gap-4">
          {segurosExpirandoFianca.length > 0 && (
            <Card className="flex-1 border-amber-300" style={{ background: '#fffbeb' }}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base" style={{ color: '#b45309' }}>
                  <TriangleAlert className="size-4" />
                  Seguro Fiança — Último mês de cobrança ({segurosExpirandoFianca.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1.5">
                  {segurosExpirandoFianca.map(i => (
                    <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{i.nome}</span>
                      <span className="text-muted-foreground">{SEGURO_FIANCA_LABELS[i.seguro] || i.seguro || '—'}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {segurosExpirandoIncendio.length > 0 && (
            <Card className="flex-1 border-orange-300" style={{ background: '#fff7ed' }}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base" style={{ color: '#c2410c' }}>
                  <TriangleAlert className="size-4" />
                  Seguro Incêndio — Último mês de cobrança ({segurosExpirandoIncendio.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1.5">
                  {segurosExpirandoIncendio.map(i => (
                    <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{i.nome}</span>
                      <span className="text-muted-foreground">Seguro Incêndio</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader className="flex w-full flex-row items-center justify-between gap-2 border-b py-2">
          <CardTitle className="text-base">Ocupações por Mês</CardTitle>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="icon" className="size-7" onClick={() => handleOcupacoesYearChange(-1)} aria-label="Ano anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <Badge variant="secondary" className="h-7 min-w-12 justify-center px-2 text-xs">{ocupacoesYear}</Badge>
            <Button variant="outline" size="icon" className="size-7" onClick={() => handleOcupacoesYearChange(1)} aria-label="Próximo ano">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 py-3">
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-12">
            {MONTH_LABELS.map((label, index) => (
              <div key={label} className="rounded-md border bg-muted/20 px-2 py-1.5">
                <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1" title="Ocupações no mês">
                    <Home className="size-3 text-muted-foreground" />
                    <strong className="text-sm leading-none">{ocupacoesPorMes[index]}</strong>
                  </div>
                  <div className="text-[10px] text-muted-foreground" title="Desocupações no mês">
                    <strong className="text-xs text-foreground">{desocupacoesPorMes[index]}</strong> D
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <CardTitle className="text-base">Lucro por Mês</CardTitle>
            <CardDescription>Total de Taxa Adm + Taxa de Contrato gerado em cada mês de {lucroAno}.</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="outline" size="icon" onClick={() => setLucroAno(String(Number(lucroAno) - 1))} aria-label="Ano anterior">
              <ChevronLeft />
            </Button>
            <Badge variant="secondary" className="h-8 min-w-14 justify-center text-sm">{lucroAno}</Badge>
            <Button variant="outline" size="icon" onClick={() => setLucroAno(String(Number(lucroAno) + 1))} aria-label="Próximo ano">
              <ChevronRight />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {maxLucroValor <= 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum lucro calculado para {lucroAno}.</p>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                <Trophy className="size-4 shrink-0 text-emerald-600" />
                <p className="text-sm">
                  <strong>{MONTH_LABELS[Number(maxLucroMes.mes.slice(-2)) - 1]} de {lucroAno}</strong> foi o mês com maior lucro da imobiliária:{' '}
                  <strong className="text-emerald-700">{fmtMoney(maxLucroMes.total)}</strong>
                </p>
              </div>

              <div className="flex items-end gap-1.5 sm:gap-2">
                {lucroPorMes.map((m, index) => {
                  const isMax = m.total > 0 && m.total === maxLucroValor
                  const alturaPercentual = m.total > 0 ? Math.max((m.total / maxLucroValor) * 100, 4) : 0
                  return (
                    <div
                      key={m.mes}
                      className="flex flex-1 flex-col items-center gap-1.5"
                      title={`${MONTH_LABELS[index]} de ${lucroAno}: ${fmtMoney(m.total)}`}
                    >
                      <span className="h-3.5 text-[10px] font-medium text-muted-foreground">
                        {m.total > 0 ? fmtMoneyCompact(m.total) : ''}
                      </span>
                      <div className="flex w-full items-end justify-center" style={{ height: 130 }}>
                        <div
                          className={`w-full rounded-t-sm transition-all ${isMax ? 'bg-emerald-500' : 'bg-blue-400/70'}`}
                          style={{ height: `${alturaPercentual}%` }}
                        />
                      </div>
                      <span className={`text-xs ${isMax ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}`}>
                        {MONTH_LABELS[index]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="flex w-full flex-row items-center justify-between gap-4 border-b pb-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <CardTitle className="shrink-0 text-lg">Inadimplência por Período</CardTitle>
            <CardDescription className="truncate text-xs text-muted-foreground">
              Navegue por ano e filtre por mês para ver valores e recuperação.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
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

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-4 border-b pb-4">
            <div>
              <CardTitle className="text-lg">Garantias dos Inadimplentes</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Cada inquilino é contado uma vez (inclui pagos e em aberto), com detalhamento por seguradora quando aplicável.
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Tabs value={garantiaFilterMode} onValueChange={setGarantiaFilterMode}>
                <TabsList>
                  <TabsTrigger value="month">Por mês</TabsTrigger>
                  <TabsTrigger value="range">Por período</TabsTrigger>
                </TabsList>
              </Tabs>
              {garantiaFilterMode === 'month' ? (
                <input
                  type="month"
                  value={garantiaFilterMonth}
                  onChange={e => setGarantiaFilterMonth(e.target.value)}
                  style={{ fontSize: 12, padding: '5px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={garantiaFilterStart}
                    onChange={e => setGarantiaFilterStart(e.target.value)}
                    style={{ fontSize: 12, padding: '5px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <input
                    type="date"
                    value={garantiaFilterEnd}
                    onChange={e => setGarantiaFilterEnd(e.target.value)}
                    style={{ fontSize: 12, padding: '5px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[0.6fr_1fr]">
              <div className="flex min-w-0 flex-col items-center justify-center rounded-lg border bg-card p-4">
                <p className="mb-3 text-xs text-muted-foreground">{garantiaFilterLabel}</p>
                <div className="donut-chart" aria-label="Gráfico de pizza de garantias dos inadimplentes">
                  <svg viewBox="0 0 120 120" className="donut-svg">
                    <circle cx="60" cy="60" r="40" fill="none" stroke="#e2e8f0" strokeWidth="24" />
                    {garantiaSlices.map(slice => slice.percent > 0 && (
                      <circle
                        key={slice.key}
                        cx="60"
                        cy="60"
                        r="40"
                        fill="none"
                        stroke={slice.color}
                        strokeWidth="24"
                        strokeDasharray={`${(slice.percent / 100) * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE - (slice.percent / 100) * DONUT_CIRCUMFERENCE}`}
                        strokeDashoffset="0"
                        transform={`rotate(${90 + (slice.startPercent / 100) * 360} 60 60)`}
                        strokeLinecap="butt"
                      />
                    ))}
                  </svg>
                  <div className="donut-center">
                    <strong>{garantiaTotal}</strong>
                    <span>inquilinos</span>
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 flex-col justify-center gap-2">
                {garantiaBreakdown.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum inadimplente no período selecionado.
                  </p>
                ) : (
                  garantiaSlices.map(item => (
                    <div key={item.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                        <span
                          className="shrink-0"
                          style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, display: 'inline-block' }}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="shrink-0 font-medium">{item.count} ({item.percent}%)</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-lg">Garantias de Todos os Inquilinos</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Distribuição atual das garantias cadastradas para todos os inquilinos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[0.6fr_1fr]">
              <div className="flex min-w-0 flex-col items-center justify-center rounded-lg border bg-card p-4">
                <p className="mb-3 text-xs text-muted-foreground">Base atual</p>
                <div className="donut-chart" aria-label="Gráfico de pizza de garantias de todos os inquilinos">
                  <svg viewBox="0 0 120 120" className="donut-svg">
                    <circle cx="60" cy="60" r="40" fill="none" stroke="#e2e8f0" strokeWidth="24" />
                    {garantiaInquilinosSlices.map(slice => slice.percent > 0 && (
                      <circle
                        key={slice.key}
                        cx="60"
                        cy="60"
                        r="40"
                        fill="none"
                        stroke={slice.color}
                        strokeWidth="24"
                        strokeDasharray={`${(slice.percent / 100) * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE - (slice.percent / 100) * DONUT_CIRCUMFERENCE}`}
                        strokeDashoffset="0"
                        transform={`rotate(${90 + (slice.startPercent / 100) * 360} 60 60)`}
                        strokeLinecap="butt"
                      />
                    ))}
                  </svg>
                  <div className="donut-center">
                    <strong>{garantiaInquilinosTotal}</strong>
                    <span>inquilinos</span>
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 flex-col justify-center gap-2">
                {garantiasInquilinosBreakdown.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum inquilino cadastrado.
                  </p>
                ) : (
                  garantiaInquilinosSlices.map(item => (
                    <div key={item.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                        <span
                          className="shrink-0"
                          style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, display: 'inline-block' }}
                        />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="shrink-0 font-medium">{item.count} ({item.percent}%)</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
