import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, update, remove } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import { normalizeText } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import './Dashboard.css'
import {
  Building2,
  Users,
  TriangleAlert,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Home,
  TrendingUp,
  MapPin,
  Search,
  X,
  Clock,
  ArrowRight,
} from 'lucide-react'

// --- Mapa de imóveis (Leaflet + OpenStreetMap) ---
import { MapaImoveis, buildEnderecoQuery, geocodeEndereco } from '../components/MapaImoveis'

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

// Cores usadas no card "Recuperação de Inadimplência" (donut + tooltips + cards mensais)
const RECOVERY_COLORS = {
  recuperado: '#22c55e9f',
  aprovadoSeguradora: '#54ec2686',
  aguardarAcionar: '#64748b',
  juridico: '#ef4444a6',
  acionado: '#3b83f68f',
}

// Ícones de indicação por campo alterado, usados no card "Histórico de Alterações"
const HISTORICO_CAMPO_STYLE = {
  status:         { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  seguroAcionado: { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
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

// Formata valor + porcentagem lado a lado, ex: "R$ 1.200,00 (35%)"
const fmtMoneyWithPercent = (value, percent) =>
  `${fmtMoney(value)} (${percent}%)`

// Formata data + hora de uma alteração do histórico, ex: "31/08/2026 14:32"
const fmtDataHora = (timestamp) => {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Formata uma data "YYYY-MM-DD" para "DD/MM/YYYY"
const fmtDataCurta = (ymd) => {
  if (!ymd) return null
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
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

// Formata uma chave de mês (YYYY-MM) de forma curta, ex: "Jan/2026"
const formatMonthKeyShort = (monthKey) => {
  if (!monthKey) return ''
  const [year, month] = monthKey.split('-')
  return `${MONTH_LABELS[Number(month) - 1]}/${year}`
}

const DONUT_RADIUS = 40
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS

// Classifica um débito nas categorias do card de recuperação. Mantida como função única para
// que a mesma regra seja usada nos totais mensais e no detalhamento (tooltips) dos cards.
const classifyDebt = (item) => {
  if (item.status === 'pago') return 'recuperado'
  if (item.status === 'juridico' || item.seguroAcionado === 'juridico') return 'juridico'
  if (item.seguroAcionado === 'acionado') return 'acionado'
  if (item.seguroAcionado === 'pagamento_aprovado') return 'aprovadoSeguradora'
  if (item.seguroAcionado === 'aguardar_para_acionar') return 'aguardarAcionar'
  return 'inadimplente'
}

const emptyMonthTotals = () => ({
  inadimplente: 0,
  recuperado: 0,
  aprovadoSeguradora: 0,
  aguardarAcionar: 0,
  juridico: 0,
  acionado: 0,
})

// Se houver valor recebido registrado no débito, contabiliza-o no lugar do "Total c/ Encargos"
const getDebtValue = (item) => {
  const recebido = parseFloat(item.valorRecebido)
  if (recebido > 0) return recebido
  return parseFloat(item.valorTotal) || parseFloat(item.valorOriginal) || 0
}

const buildMonthlyTotals = (items, year) => {
  const map = {}
  items.forEach(item => {
    const monthKey = getMonthKey(item)
    if (!monthKey?.startsWith(year)) return
    const value = getDebtValue(item)
    if (!map[monthKey]) {
      map[monthKey] = emptyMonthTotals()
    }
    map[monthKey][classifyDebt(item)] += value
  })
  return map
}

const getPieSegments = (inadimplente, recuperado, aprovadoSeguradora, aguardarAcionar, juridico, acionado) => {
  const total = inadimplente + recuperado + aprovadoSeguradora + aguardarAcionar + juridico + acionado
  const recoveredPercent = total > 0 ? Math.round((recuperado / total) * 100) : 0
  const approvedPercent = total > 0 ? Math.round((aprovadoSeguradora / total) * 100) : 0
  const waitingPercent = total > 0 ? Math.round((aguardarAcionar / total) * 100) : 0
  const juridicoPercent = total > 0 ? Math.round((juridico / total) * 100) : 0
  const acionadoPercent = total > 0 ? Math.round((acionado / total) * 100) : 0
  const inadimplentePercent = total > 0 ? Math.round((inadimplente / total) * 100) : 0
  return {
    recoveredPercent,
    approvedPercent,
    waitingPercent,
    juridicoPercent,
    acionadoPercent,
    inadimplentePercent,
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
  const [historicoAlteracoes, setHistoricoAlteracoes] = useState([])
  const [historicoMesFiltro, setHistoricoMesFiltro] = useState(currentMonth)
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

  // Filtros do card "Mapa de Imóveis": quais imóveis aparecem no mapa
  const [mapaFiltroOcupacao, setMapaFiltroOcupacao] = useState('todos') // 'todos' | 'ocupados' | 'desocupados'
  const [mapaFiltroTexto, setMapaFiltroTexto] = useState('') // busca por código/nome do imóvel

  // Filtros do card "Garantias dos Inadimplentes"
  const [garantiaFilterMode, setGarantiaFilterMode] = useState('month') // 'month' | 'range'
  const [garantiaFilterMonth, setGarantiaFilterMonth] = useState(currentMonth)
  const [garantiaFilterStart, setGarantiaFilterStart] = useState('')
  const [garantiaFilterEnd, setGarantiaFilterEnd] = useState('')
  const [segurosCatalogo, setSegurosCatalogo] = useState([])

  // Filtros do card "Garantias de Todos os Inquilinos"
  const [garantiaInquilinosStatusFilter, setGarantiaInquilinosStatusFilter] = useState('ativos') // 'ativos' | 'todos'
  const [garantiaInquilinosPeriodStart, setGarantiaInquilinosPeriodStart] = useState('') // YYYY-MM
  const [garantiaInquilinosPeriodEnd, setGarantiaInquilinosPeriodEnd] = useState('')     // YYYY-MM

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
    const historicoRef = ref(db, 'historicoAlteracoes')

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

    const unsubHistorico = onValue(historicoRef, snap => {
      const data = snap.val()
      setHistoricoAlteracoes(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
    })

    return () => {
      unsubImoveis()
      unsubInquilinos()
      unsubProprietarios()
      unsubContas()
      unsubValoresVariaveis()
      unsubInadimplencias()
      unsubSeguros()
      unsubHistorico()
    }
  }, [])

  // Geocodifica em segundo plano os imóveis que ainda não têm coordenadas salvas (im.geo),
  // gravando o resultado em `imoveis/{id}/geo` para não precisar geocodificar de novo depois.
  // Processa um endereço por vez, respeitando o limite de 1 requisição/segundo da Nominatim.
  const geocodingAttemptedRef = useRef(new Set())

  useEffect(() => {
    let cancelled = false

    const processarFila = async () => {
      const pendentes = imoveis.filter(im =>
        !im.geo &&
        !geocodingAttemptedRef.current.has(im.id) &&
        im.endereco && (im.endereco.rua || im.endereco.cep)
      )

      for (const im of pendentes) {
        if (cancelled) return
        geocodingAttemptedRef.current.add(im.id)
        const query = buildEnderecoQuery(im.endereco)
        if (!query) continue

        try {
          const coords = await geocodeEndereco(query)
          if (cancelled) return
          if (coords) {
            await update(ref(db, `imoveis/${im.id}/geo`), { lat: coords.lat, lng: coords.lng, atualizadoEm: Date.now() })
          } else {
            await update(ref(db, `imoveis/${im.id}/geo`), { lat: null, lng: null, erro: true })
          }
        } catch (err) {
          console.error('Erro ao geocodificar imóvel', im.id, err)
        }

        // respeita o limite de uso justo da API pública do Nominatim (1 req/s)
        await new Promise(resolve => setTimeout(resolve, 1100))
      }
    }

    processarFila()
    return () => { cancelled = true }
  }, [imoveis])

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

  const valorMedioAluguel = useMemo(() => {
    const ativos = inquilinos.filter(i => i.status === 'Ativo' && (parseFloat(i.valorAluguel) || 0) > 0)
    if (ativos.length === 0) return 0
    const soma = ativos.reduce((sum, i) => sum + (parseFloat(i.valorAluguel) || 0), 0)
    return soma / ativos.length
  }, [inquilinos])

  const imoveisComGeoCount = useMemo(
    () => imoveis.filter(im => im.geo?.lat && im.geo?.lng).length,
    [imoveis]
  )

  // ---- Filtro de ocupação/texto do card "Mapa de Imóveis" ----

  // Conjunto de imovelIds que possuem um inquilino ATIVO vinculado (= imóvel ocupado)
  const imovelIdsOcupados = useMemo(
    () => new Set(
      inquilinos
        .filter(i => i.status === 'Ativo' && i.imovelId)
        .map(i => i.imovelId)
    ),
    [inquilinos]
  )

  // Texto normalizado (sem acento, minúsculo) usado para buscar por código, nome ou endereço
  const buildImovelBusca = (im) => normalizeText([
    im.codigo,
    im.nome,
    im.endereco?.rua,
    im.endereco?.bairro,
    im.endereco?.cidade,
  ].filter(Boolean).join(' '))

  // Lista de imóveis já com a flag `ocupado` calculada e filtrada conforme a seleção do usuário
  // (ocupação + busca por nome/código do imóvel)
  const imoveisMapaFiltrados = useMemo(() => {
    const comFlag = imoveis.map(im => ({ ...im, ocupado: imovelIdsOcupados.has(im.id) }))
    let resultado = comFlag
    if (mapaFiltroOcupacao === 'ocupados') resultado = resultado.filter(im => im.ocupado)
    if (mapaFiltroOcupacao === 'desocupados') resultado = resultado.filter(im => !im.ocupado)

    const termoBusca = normalizeText(mapaFiltroTexto.trim())
    if (termoBusca) {
      resultado = resultado.filter(im => buildImovelBusca(im).includes(termoBusca))
    }

    return resultado
  }, [imoveis, imovelIdsOcupados, mapaFiltroOcupacao, mapaFiltroTexto])

  const imoveisMapaComGeoCount = useMemo(
    () => imoveisMapaFiltrados.filter(im => im.geo?.lat && im.geo?.lng).length,
    [imoveisMapaFiltrados]
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
    const totals = yearMonthTotals[key] || emptyMonthTotals()
    const total = totals.inadimplente + totals.recuperado + totals.aprovadoSeguradora + totals.aguardarAcionar + totals.juridico + totals.acionado
    const recoveredPercent = total > 0 ? Math.round((totals.recuperado / total) * 100) : 0
    const approvedPercent = total > 0 ? Math.round((totals.aprovadoSeguradora / total) * 100) : 0
    const waitingPercent = total > 0 ? Math.round((totals.aguardarAcionar / total) * 100) : 0
    const juridicoPercent = total > 0 ? Math.round((totals.juridico / total) * 100) : 0
    const acionadoPercent = total > 0 ? Math.round((totals.acionado / total) * 100) : 0
    const abertoValue = totals.inadimplente + totals.aprovadoSeguradora + totals.aguardarAcionar + totals.juridico + totals.acionado
    const abertoPercent = total > 0 ? Math.round((abertoValue / total) * 100) : 0
    return {
      key,
      label,
      inadimplente: totals.inadimplente,
      recuperado: totals.recuperado,
      aprovadoSeguradora: totals.aprovadoSeguradora,
      aguardarAcionar: totals.aguardarAcionar,
      juridico: totals.juridico,
      acionado: totals.acionado,
      recoveredPercent,
      approvedPercent,
      waitingPercent,
      juridicoPercent,
      acionadoPercent,
      abertoPercent,
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
    () => periodDebts.reduce((sum, d) => sum + getDebtValue(d), 0),
    [periodDebts]
  )

  const recoveredValue = useMemo(
    () => periodPagas.reduce((sum, d) => sum + getDebtValue(d), 0),
    [periodPagas]
  )

  const selectedMonthTotals = useMemo(() => {
    return periodMonthKeys.reduce((acc, key) => {
      const totals = yearMonthTotals[key] || emptyMonthTotals()
      return {
        inadimplente: acc.inadimplente + totals.inadimplente,
        recuperado: acc.recuperado + totals.recuperado,
        aprovadoSeguradora: acc.aprovadoSeguradora + (totals.aprovadoSeguradora || 0),
        aguardarAcionar: acc.aguardarAcionar + (totals.aguardarAcionar || 0),
        juridico: acc.juridico + (totals.juridico || 0),
        acionado: acc.acionado + (totals.acionado || 0),
      }
    }, emptyMonthTotals())
  }, [periodMonthKeys, yearMonthTotals])

  const topInadimplentes = useMemo(() => {
    const map = {}
    periodDebts.forEach(debt => {
      const key = debt.inquilinoId || debt.inquilinoNome || 'desconhecido'
      const name = inquilinoMap[debt.inquilinoId]?.nome || debt.inquilinoNome || 'Desconhecido'
      const value = getDebtValue(debt)
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
      .slice(0, 10)
  }, [periodDebts, inquilinoMap, topFilter])

  const pie = getPieSegments(
    selectedMonthTotals.inadimplente,
    selectedMonthTotals.recuperado,
    selectedMonthTotals.aprovadoSeguradora,
    selectedMonthTotals.aguardarAcionar,
    selectedMonthTotals.juridico,
    selectedMonthTotals.acionado
  )

  const segurosExpirandoFianca = useMemo(
    () => inquilinos.filter(i => i.garantia === 'seguro' && i.seguroFiancaMesFim === currentMonth),
    [inquilinos]
  )

  const segurosExpirandoIncendio = useMemo(
    () => inquilinos.filter(i => i.seguroIncendioMesFim === currentMonth),
    [inquilinos]
  )

  // Detalha, por débito, quem compõe cada uma das categorias do card de recuperação (para os tooltips)
  const categoryBreakdown = useMemo(() => {
    const acc = { recuperado: [], aprovadoSeguradora: [], aguardarAcionar: [], juridico: [], acionado: [], inadimplente: [] }
    periodDebts.forEach(d => {
      const value = getDebtValue(d)
      const name = inquilinoMap[d.inquilinoId]?.nome || d.inquilinoNome || 'Sem nome'
      const imovel = getCodigoImovel(d)
      const entry = { name, imovel, value }
      acc[classifyDebt(d)].push(entry)
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

  // Filtra as inadimplências em aberto de acordo com o modo escolhido (mês único ou intervalo de meses)
  // Usa TODAS as inadimplências do período (inclusive as já pagas/recuperadas), não só as em aberto
  const garantiaFilteredDebts = useMemo(() => {
    return inadimplencias.filter(d => {
      const monthKey = getMonthKey(d)
      if (garantiaFilterMode === 'month') {
        return monthKey === garantiaFilterMonth
      }
      if (!monthKey) return false
      if (garantiaFilterStart && monthKey < garantiaFilterStart) return false
      if (garantiaFilterEnd && monthKey > garantiaFilterEnd) return false
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
      return `${formatMonthKeyShort(garantiaFilterStart)} até ${formatMonthKeyShort(garantiaFilterEnd)}`
    }
    if (garantiaFilterStart) return `A partir de ${formatMonthKeyShort(garantiaFilterStart)}`
    if (garantiaFilterEnd) return `Até ${formatMonthKeyShort(garantiaFilterEnd)}`
    return 'Todo o período'
  }, [garantiaFilterMode, garantiaFilterMonth, garantiaFilterStart, garantiaFilterEnd])

  // ---- Card "Garantias de Todos os Inquilinos" ----

  // Aplica o filtro de status (ativos / ativos + inativos) e o filtro de período (mês inicial e
  // final) considerando a vigência do contrato (dataEntrada/dataSaida) sobreposta ao intervalo
  const garantiaInquilinosFilteredList = useMemo(() => {
    return inquilinos.filter(i => {
      if (garantiaInquilinosStatusFilter === 'ativos' && i.status !== 'Ativo') return false

      if (garantiaInquilinosPeriodStart || garantiaInquilinosPeriodEnd) {
        const entrada = i.dataEntrada?.slice(0, 7)
        const saida = i.dataSaida?.slice(0, 7)
        if (garantiaInquilinosPeriodStart && saida && saida < garantiaInquilinosPeriodStart) return false
        if (garantiaInquilinosPeriodEnd && entrada && entrada > garantiaInquilinosPeriodEnd) return false
      }

      return true
    })
  }, [inquilinos, garantiaInquilinosStatusFilter, garantiaInquilinosPeriodStart, garantiaInquilinosPeriodEnd])

  const garantiasInquilinosBreakdown = useMemo(() => {
    const counts = {}

    garantiaInquilinosFilteredList.forEach(inquilino => {
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

    const total = garantiaInquilinosFilteredList.length
    return Object.values(counts)
      .map(c => ({ ...c, percent: total > 0 ? Math.round((c.count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count)
  }, [garantiaInquilinosFilteredList, seguroCorPorNome])

  const garantiaInquilinosTotal = garantiaInquilinosFilteredList.length

  const garantiaInquilinosSlices = useMemo(() => {
    let cumulative = 0
    return garantiasInquilinosBreakdown.map(item => {
      const startPercent = cumulative
      cumulative += item.percent
      return { ...item, startPercent, color: item.color || GARANTIA_CHART_COLORS[item.key] || '#94a3b8' }
    })
  }, [garantiasInquilinosBreakdown])

  const garantiaInquilinosFilterLabel = useMemo(() => {
    const statusLabel = garantiaInquilinosStatusFilter === 'ativos' ? 'Inquilinos ativos' : 'Ativos + inativos'
    let periodoLabel = 'todo o período'
    if (garantiaInquilinosPeriodStart && garantiaInquilinosPeriodEnd) {
      periodoLabel = `${formatMonthKeyShort(garantiaInquilinosPeriodStart)} até ${formatMonthKeyShort(garantiaInquilinosPeriodEnd)}`
    } else if (garantiaInquilinosPeriodStart) {
      periodoLabel = `a partir de ${formatMonthKeyShort(garantiaInquilinosPeriodStart)}`
    } else if (garantiaInquilinosPeriodEnd) {
      periodoLabel = `até ${formatMonthKeyShort(garantiaInquilinosPeriodEnd)}`
    }
    return `${statusLabel} · ${periodoLabel}`
  }, [garantiaInquilinosStatusFilter, garantiaInquilinosPeriodStart, garantiaInquilinosPeriodEnd])

  const limparFiltroGarantiaInquilinosPeriodo = () => {
    setGarantiaInquilinosPeriodStart('')
    setGarantiaInquilinosPeriodEnd('')
  }

  // ---- Card "Histórico de Alterações" ----

  // Ordena as alterações de status/seguro acionado da mais recente para a mais antiga
  const historicoOrdenado = useMemo(
    () => [...historicoAlteracoes].sort((a, b) => (b.data || 0) - (a.data || 0)),
    [historicoAlteracoes]
  )

  // Meses com pelo menos um registro, do mais recente para o mais antigo, para popular o filtro
  const historicoMesesDisponiveis = useMemo(
    () => [...new Set(historicoAlteracoes.map(item => item.mesReferencia).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [historicoAlteracoes]
  )

  const historicoFiltrado = useMemo(
    () => historicoMesFiltro === 'todos'
      ? historicoOrdenado
      : historicoOrdenado.filter(item => item.mesReferencia === historicoMesFiltro),
    [historicoOrdenado, historicoMesFiltro]
  )

  const handleExcluirHistorico = async (id) => {
    if (!window.confirm('Deseja excluir este registro do histórico?')) return
    await remove(ref(db, `historicoAlteracoes/${id}`))
  }

  return (
    <Layout title="Dashboard" subtitle="Visão geral do sistema de gestão">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-4">
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center  bg-blue-500/10 text-blue-600">
              <Building2 className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-semibold tracking-tight">{totalImoveis}</p>
              <p className="truncate text-xs text-muted-foreground">Total de Imóveis</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center bg-emerald-500/10 text-emerald-600">
              <Users className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-semibold tracking-tight">{totalInquilinosAtivos}</p>
              <p className="truncate text-xs text-muted-foreground">Inquilinos Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center bg-amber-500/10 text-amber-600">
              <TriangleAlert className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-semibold tracking-tight">{uniqueInadimplentes}</p>
              <p className="truncate text-xs text-muted-foreground">Inadimplentes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center bg-violet-500/10 text-violet-600">
              <Wallet className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold tracking-tight">{fmtMoney(receitaMensal)}</p>
              <p className="truncate text-xs text-muted-foreground">Receita Mensal</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center bg-cyan-500/10 text-cyan-600">
              <TrendingUp className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold tracking-tight">{fmtMoney(valorMedioAluguel)}</p>
              <p className="truncate text-xs text-muted-foreground">Valor Médio dos Aluguéis</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader className="flex w-full flex-col flex-wrap gap-2 border-b py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Mapa de Imóveis</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                {imoveisMapaComGeoCount} de {imoveisMapaFiltrados.length} imóveis localizados no mapa a partir do endereço cadastrado.
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={mapaFiltroTexto}
                onChange={e => setMapaFiltroTexto(e.target.value)}
                placeholder="Buscar por código ou nome do imóvel..."
                className="h-8 w-56 pl-7 pr-7 text-xs"
              />
              {mapaFiltroTexto && (
                <button
                  type="button"
                  onClick={() => setMapaFiltroTexto('')}
                  aria-label="Limpar busca"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Tabs value={mapaFiltroOcupacao} onValueChange={setMapaFiltroOcupacao}>
              <TabsList>
                <TabsTrigger value="todos">Todos</TabsTrigger>
                <TabsTrigger value="ocupados">Ocupados</TabsTrigger>
                <TabsTrigger value="desocupados">Desocupados</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          <MapaImoveis imoveis={imoveisMapaFiltrados} />
        </CardContent>
      </Card>

      {(segurosExpirandoFianca.length > 0 || segurosExpirandoIncendio.length > 0) && (
        <div className="mb-4 flex flex-wrap gap-3">
          {segurosExpirandoFianca.length > 0 && (
            <Card className="flex-1 border-amber-300" style={{ background: '#fffbeb' }}>
              <CardHeader className="">
                <CardTitle className="flex items-center gap-2 text-sm" style={{ color: '#b45309' }}>
                  <TriangleAlert className="size-4" />
                  Seguro Fiança — Último mês de cobrança ({segurosExpirandoFianca.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="">
                <div className="flex flex-col gap-1">
                  {segurosExpirandoFianca.map(i => (
                    <div key={i.id} className="flex items-center justify-between gap-2 text-xs">
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
              <CardHeader className="">
                <CardTitle className="flex items-center gap-2 text-sm" style={{ color: '#c2410c' }}>
                  <TriangleAlert className="size-4" />
                  Seguro Incêndio — Último mês de cobrança ({segurosExpirandoIncendio.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="">
                <div className="flex flex-col gap-1">
                  {segurosExpirandoIncendio.map(i => (
                    <div key={i.id} className="flex items-center justify-between gap-2 text-xs">
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

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex w-full flex-row items-center justify-between gap-2 border-b py-2">
            <CardTitle className="text-sm">Ocupações por Mês</CardTitle>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="outline" size="icon" className="size-6" onClick={() => handleOcupacoesYearChange(-1)} aria-label="Ano anterior">
                <ChevronLeft className="size-3.5" />
              </Button>
              <Badge variant="secondary" className="h-6 min-w-11 justify-center px-2 text-xs">{ocupacoesYear}</Badge>
              <Button variant="outline" size="icon" className="size-6" onClick={() => handleOcupacoesYearChange(1)} aria-label="Próximo ano">
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-3 py-2">
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6">
              {MONTH_LABELS.map((label, index) => (
                <div key={label} className=" border bg-muted/20 px-1.5 py-1">
                  <p className="text-[9px] font-medium text-muted-foreground">{label}</p>
                  <div className="mt-0.5 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1" title="Ocupações no mês">
                      <Home className="size-3 text-muted-foreground" />
                      <strong className="text-xs leading-none">{ocupacoesPorMes[index]}</strong>
                    </div>
                    <div className="text-[9px] text-muted-foreground" title="Desocupações no mês">
                      <strong className="text-[11px] text-foreground">{desocupacoesPorMes[index]}</strong> D
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-2 border-b py-2">
            <div>
              <CardTitle className="text-sm">Lucro por Mês</CardTitle>
              <CardDescription className="text-[11px]">Taxa Adm + Taxa de Contrato em {lucroAno}.</CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="outline" size="icon" className="size-6" onClick={() => setLucroAno(String(Number(lucroAno) - 1))} aria-label="Ano anterior">
                <ChevronLeft className="size-3.5" />
              </Button>
              <Badge variant="secondary" className="h-6 min-w-11 justify-center px-2 text-xs">{lucroAno}</Badge>
              <Button variant="outline" size="icon" className="size-6" onClick={() => setLucroAno(String(Number(lucroAno) + 1))} aria-label="Próximo ano">
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-3 py-2">
            {maxLucroValor <= 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Nenhum lucro calculado para {lucroAno}.</p>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                  <Trophy className="size-3.5 shrink-0 text-emerald-600" />
                  <p className="text-xs">
                    <strong>{MONTH_LABELS[Number(maxLucroMes.mes.slice(-2)) - 1]}/{lucroAno}</strong> maior lucro:{' '}
                    <strong className="text-emerald-700">{fmtMoney(maxLucroMes.total)}</strong>
                  </p>
                </div>

                <div className="flex items-end gap-1">
                  {lucroPorMes.map((m, index) => {
                    const isMax = m.total > 0 && m.total === maxLucroValor
                    const alturaPercentual = m.total > 0 ? Math.max((m.total / maxLucroValor) * 100, 4) : 0
                    return (
                      <div
                        key={m.mes}
                        className="flex flex-1 flex-col items-center gap-1"
                        title={`${MONTH_LABELS[index]} de ${lucroAno}: ${fmtMoney(m.total)}`}
                      >
                        <span className="h-3 text-[9px] font-medium text-muted-foreground">
                          {m.total > 0 ? fmtMoneyCompact(m.total) : ''}
                        </span>
                        <div className="flex w-full items-end justify-center" style={{ height: 80 }}>
                          <div
                            className={`w-full rounded-t-sm transition-all ${isMax ? 'bg-emerald-500' : 'bg-blue-400/70'}`}
                            style={{ height: `${alturaPercentual}%` }}
                          />
                        </div>
                        <span className={`text-[10px] ${isMax ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}`}>
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
      </div>

      <Card className="mb-4">
        <CardHeader className="flex w-full flex-row items-center justify-between gap-4 border-b py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <CardTitle className="shrink-0 text-base">Inadimplência por Período</CardTitle>
            <CardDescription className="truncate text-xs text-muted-foreground">
              Navegue por ano e filtre por mês para ver valores e recuperação.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="outline" size="icon" className="size-7" onClick={() => handleYearChange(-1)} aria-label="Ano anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <Badge variant="secondary" className="h-7 min-w-12 justify-center text-xs">{selectedYear}</Badge>
            <Button variant="outline" size="icon" className="size-7" onClick={() => handleYearChange(1)} aria-label="Próximo ano">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <select
            value={colFilters.modelo}
            onChange={e => setColFilter('modelo', e.target.value)}
            style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
          >
            <option value="">Modelo: Todos</option>
            {modeloOptions.map(m => (
              <option key={m} value={m}>{MODELO_LABELS[m] || m}</option>
            ))}
          </select>
          <select
            value={colFilters.garantia}
            onChange={e => setColFilter('garantia', e.target.value)}
            style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
          >
            <option value="">Garantia: Todas</option>
            {garantiaOptions.map(g => (
              <option key={g} value={g}>{GARANTIA_LABELS[g] || g}</option>
            ))}
          </select>
          {(colFilters.modelo || colFilters.garantia) && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={limparColFilters}>
              Limpar filtros
            </Button>
          )}
        </div>
        <CardContent className="p-3">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[0.5fr_0.8fr_300px]">
            <div className="flex min-w-0 flex-col border bg-card p-3">
              <div className="mb-2">
                <h4 className="text-sm font-medium">Recuperação de Inadimplência</h4>
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
                    stroke={RECOVERY_COLORS.recuperado}
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
                    stroke={RECOVERY_COLORS.aprovadoSeguradora}
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
                    stroke={RECOVERY_COLORS.aguardarAcionar}
                    strokeWidth="24"
                    strokeDasharray={`${(pie.waitingPercent / 100) * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE - (pie.waitingPercent / 100) * DONUT_CIRCUMFERENCE}`}
                    strokeDashoffset="0"
                    transform={`rotate(${90 + ((pie.recoveredPercent + pie.approvedPercent) / 100) * 360} 60 60)`}
                    strokeLinecap="butt"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="40"
                    fill="none"
                    stroke={RECOVERY_COLORS.juridico}
                    strokeWidth="24"
                    strokeDasharray={`${(pie.juridicoPercent / 100) * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE - (pie.juridicoPercent / 100) * DONUT_CIRCUMFERENCE}`}
                    strokeDashoffset="0"
                    transform={`rotate(${90 + ((pie.recoveredPercent + pie.approvedPercent + pie.waitingPercent) / 100) * 360} 60 60)`}
                    strokeLinecap="butt"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="40"
                    fill="none"
                    stroke={RECOVERY_COLORS.acionado}
                    strokeWidth="24"
                    strokeDasharray={`${(pie.acionadoPercent / 100) * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE - (pie.acionadoPercent / 100) * DONUT_CIRCUMFERENCE}`}
                    strokeDashoffset="0"
                    transform={`rotate(${90 + ((pie.recoveredPercent + pie.approvedPercent + pie.waitingPercent + pie.juridicoPercent) / 100) * 360} 60 60)`}
                    strokeLinecap="butt"
                  />
                </svg>
                <div className="donut-center">
                  <strong>{pie.percentage}%</strong>
                  <span>recuperado</span>
                </div>
              </div>
              <TooltipProvider>
                <div className="mt-2 space-y-1.5 text-xs">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-default items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <span className="dot dot-paid shrink-0"></span>
                          <span className="truncate">Recuperado</span>
                        </span>
                        <span className="shrink-0 font-medium">
                          {fmtMoneyWithPercent(selectedMonthTotals.recuperado, pie.recoveredPercent)}
                        </span>
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
                        <span className="shrink-0 font-medium">
                          {fmtMoneyWithPercent(selectedMonthTotals.aprovadoSeguradora, pie.approvedPercent)}
                        </span>
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
                        <span className="shrink-0 font-medium">
                          {fmtMoneyWithPercent(selectedMonthTotals.aguardarAcionar, pie.waitingPercent)}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-none">{renderBreakdownTooltip(categoryBreakdown.aguardarAcionar)}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-default items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <span
                            className="shrink-0"
                            style={{ width: 8, height: 8, borderRadius: '9999px', display: 'inline-block', background: RECOVERY_COLORS.acionado }}
                          ></span>
                          <span className="truncate">Acionado</span>
                        </span>
                        <span className="shrink-0 font-medium">
                          {fmtMoneyWithPercent(selectedMonthTotals.acionado, pie.acionadoPercent)}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-none">{renderBreakdownTooltip(categoryBreakdown.acionado)}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-default items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <span
                            className="shrink-0"
                            style={{ width: 8, height: 8, borderRadius: '9999px', display: 'inline-block', background: RECOVERY_COLORS.juridico }}
                          ></span>
                          <span className="truncate">Jurídico</span>
                        </span>
                        <span className="shrink-0 font-medium">
                          {fmtMoneyWithPercent(selectedMonthTotals.juridico, pie.juridicoPercent)}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-none">{renderBreakdownTooltip(categoryBreakdown.juridico)}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-default items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <span className="dot dot-pending shrink-0"></span>
                          <span className="truncate">Aberto</span>
                        </span>
                        <span className="shrink-0 font-medium">
                          {fmtMoneyWithPercent(selectedMonthTotals.inadimplente, pie.inadimplentePercent)}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-none">{renderBreakdownTooltip(categoryBreakdown.inadimplente)}</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>

              <Separator className="my-2" />
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Total</span>
                <strong className="shrink-0">
                  {fmtMoney(
                    selectedMonthTotals.recuperado +
                    selectedMonthTotals.aprovadoSeguradora +
                    selectedMonthTotals.aguardarAcionar +
                    selectedMonthTotals.juridico +
                    selectedMonthTotals.acionado +
                    selectedMonthTotals.inadimplente
                  )}
                </strong>
              </div>
            </div>

            <div className="flex min-w-0 flex-col border bg-card p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-medium">Pagamentos por mês</h4>
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
                  >
                    <div className="mc-top-row">
                      <span>{MONTH_LABELS[Number(card.key.slice(-2)) - 1]}</span>
                      <strong>
                        {fmtMoney(
                          card.inadimplente + card.recuperado + card.aprovadoSeguradora +
                          card.aguardarAcionar + card.juridico + card.acionado
                        )}
                      </strong>
                    </div>
                    <div className="mc-values-row">
                      <div className="mc-value-group">
                        <span className="mc-value-label">Recuperado</span>
                        <strong>
                          {fmtMoney(card.recuperado)}{' '}
                          <span className="text-muted-foreground font-normal">({card.recoveredPercent}%)</span>
                        </strong>
                      </div>
                      <div className="mc-value-group">
                        <span className="mc-value-label">Em aberto</span>
                        {/* "Em aberto" aqui é todo débito não pago, incluindo os que já
                            estão com seguradora acionada ou em processo jurídico */}
                        <strong>
                          {fmtMoney(
                            card.inadimplente + card.aprovadoSeguradora +
                            card.aguardarAcionar + card.juridico + card.acionado
                          )}{' '}
                          <span className="text-muted-foreground font-normal">({card.abertoPercent}%)</span>
                        </strong>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-col border bg-card p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-medium">Maiores inadimplentes</h4>
                  <p className="text-xs text-muted-foreground">{selectedPeriodLabel}</p>
                </div>
                <Tabs value={topFilter} onValueChange={setTopFilter}>
                  <TabsList>
                    <TabsTrigger value="valor">Maior valor</TabsTrigger>
                    <TabsTrigger value="quantidade">Mais inadimplências</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
                {topInadimplentes.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Nenhum inadimplente no período.</p>
                ) : (
                  topInadimplentes.map((item, index) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge variant={index === 0 ? 'default' : 'secondary'} className="h-5 w-5 justify-center rounded-full p-0 text-[10px]">
                          {index === 0 ? <Trophy className="size-3" /> : `#${index + 1}`}
                        </Badge>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{item.name}</p>
                          <p className="text-[11px] text-muted-foreground">{item.count} inadimplência{item.count === 1 ? '' : 's'}</p>
                        </div>
                      </div>
                      <strong className="shrink-0 text-xs">{fmtMoney(item.total)}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Histórico de Alterações (Status / Seguro Acionado) ── */}
      <Card className="mb-4">
        <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-2 border-b py-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Histórico de Alterações</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Atualizações de Status e Seguro Acionado na planilha de inadimplentes, mais recentes primeiro.
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <select
              value={historicoMesFiltro}
              onChange={e => setHistoricoMesFiltro(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value={currentMonth}>{getMonthLabel(currentMonth)}</option>
              {historicoMesesDisponiveis.filter(m => m !== currentMonth).map(m => (
                <option key={m} value={m}>{getMonthLabel(m)}</option>
              ))}
              <option value="todos">Todos os meses</option>
            </select>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {historicoFiltrado.length} registro{historicoFiltrado.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {historicoFiltrado.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {historicoMesFiltro === 'todos'
                ? 'Nenhuma alteração de status ou seguro acionado registrada ainda.'
                : `Nenhuma alteração registrada em ${getMonthLabel(historicoMesFiltro)}.`}
            </p>
          ) : (
            <div className="flex max-h-96 flex-col divide-y overflow-y-auto">
              {historicoFiltrado.map(item => {
                const campoStyle = HISTORICO_CAMPO_STYLE[item.campo] || HISTORICO_CAMPO_STYLE.status
                return (
                  <div key={item.id} className="group flex items-center justify-between gap-3 py-2 text-xs first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="shrink-0 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: campoStyle.bg, color: campoStyle.color, border: `1px solid ${campoStyle.border}` }}
                      >
                        {item.campoLabel || (item.campo === 'seguroAcionado' ? 'Seguro Acionado' : 'Status')}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {item.inquilinoNome || 'Sem nome'}
                          {item.codigoImovel ? ` (${item.codigoImovel})` : ''}
                        </p>
                        <p className="flex min-w-0 items-center gap-1 truncate text-muted-foreground">
                          <span className="truncate">{item.valorAnteriorLabel || '—'}</span>
                          <ArrowRight className="size-3 shrink-0" />
                          <span className="truncate font-medium text-foreground">{item.valorNovoLabel || '—'}</span>
                        </p>
                        <p className="flex min-w-0 items-center gap-1 truncate text-muted-foreground">
                          <span className="truncate">Total c/ Encargos: {fmtMoney(item.valorTotal)}</span>
                          {item.valorRecebido > 0 && <span className="truncate">· Recebido: {fmtMoney(item.valorRecebido)}</span>}
                          {item.mesReferencia && <span className="truncate">· {getMonthLabel(item.mesReferencia)}</span>}
                          {item.dataSeguro && <span className="truncate">· Data Seguro: {fmtDataCurta(item.dataSeguro)}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground">{fmtDataHora(item.data)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        onClick={() => handleExcluirHistorico(item.id)}
                        aria-label="Excluir registro do histórico"
                        title="Excluir registro do histórico"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-3 border-b py-3">
            <div>
              <CardTitle className="text-base">Garantias dos Inadimplentes</CardTitle>
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
                  style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="month"
                    value={garantiaFilterStart}
                    onChange={e => setGarantiaFilterStart(e.target.value)}
                    style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <input
                    type="month"
                    value={garantiaFilterEnd}
                    onChange={e => setGarantiaFilterEnd(e.target.value)}
                    style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[0.6fr_1fr]">
              <div className="flex min-w-0 flex-col items-center justify-center border bg-card p-3">
                <p className="mb-2 text-xs text-muted-foreground">{garantiaFilterLabel}</p>
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
              <div className="flex min-w-0 flex-col justify-center gap-1.5">
                {garantiaBreakdown.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Nenhum inadimplente no período selecionado.
                  </p>
                ) : (
                  garantiaSlices.map(item => (
                    <div key={item.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                        <span
                          className="shrink-0"
                          style={{ width: 9, height: 9, borderRadius: '50%', background: item.color, display: 'inline-block' }}
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
          <CardHeader className="flex w-full flex-col flex-wrap gap-2 border-b py-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">Garantias de Todos os Inquilinos</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Distribuição das garantias cadastradas, filtrável por status e por período de vigência do contrato.
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Tabs value={garantiaInquilinosStatusFilter} onValueChange={setGarantiaInquilinosStatusFilter}>
                <TabsList>
                  <TabsTrigger value="ativos">Ativos</TabsTrigger>
                  <TabsTrigger value="todos">Ativos + Inativos</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-1.5">
                <input
                  type="month"
                  value={garantiaInquilinosPeriodStart}
                  onChange={e => setGarantiaInquilinosPeriodStart(e.target.value)}
                  style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                />
                <span className="text-xs text-muted-foreground">até</span>
                <input
                  type="month"
                  value={garantiaInquilinosPeriodEnd}
                  onChange={e => setGarantiaInquilinosPeriodEnd(e.target.value)}
                  style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                />
                {(garantiaInquilinosPeriodStart || garantiaInquilinosPeriodEnd) && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={limparFiltroGarantiaInquilinosPeriodo}>
                    Limpar
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[0.6fr_1fr]">
              <div className="flex min-w-0 flex-col items-center justify-center border bg-card p-3">
                <p className="mb-2 text-center text-xs text-muted-foreground">{garantiaInquilinosFilterLabel}</p>
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
              <div className="flex min-w-0 flex-col justify-center gap-1.5">
                {garantiasInquilinosBreakdown.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Nenhum inquilino encontrado para os filtros selecionados.
                  </p>
                ) : (
                  garantiaInquilinosSlices.map(item => (
                    <div key={item.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                        <span
                          className="shrink-0"
                          style={{ width: 9, height: 9, borderRadius: '50%', background: item.color, display: 'inline-block' }}
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
