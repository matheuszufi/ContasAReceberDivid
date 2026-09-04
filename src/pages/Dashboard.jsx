import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, update, remove } from 'firebase/database'
import { jsPDF } from 'jspdf'
import { gsap } from 'gsap'
import { db } from '../firebase'
import Layout from '../components/Layout'
import { normalizeText } from '@/lib/utils'
import dividLogo from '../assets/images/divid-logo.png'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import './Dashboard.css'

// Carrega uma imagem para uso com doc.addImage do jsPDF
const loadImage = src => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = reject
  image.src = src
})

// Desenha a logo da Divid no canto superior direito do relatório, sem interromper a geração se falhar
const desenharLogoRelatorio = async (doc, pageWidth, margin) => {
  try {
    const logo = await loadImage(dividLogo)
    const largura = 32
    const altura = (logo.height / logo.width) * largura
    doc.addImage(logo, 'PNG', pageWidth - margin - largura, 8, largura, altura)
  } catch {
    // Sem logo disponível, segue a geração normalmente
  }
}
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
  History,
  ArrowRight,
  FileText,
  BarChart3,
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
  reprovado: '#dc262690',
  aguardarAcionar: '#64748b',
  juridico: '#ef4444a6',
  acionado: '#3b83f68f',
}

// Ícones de indicação por campo alterado, usados no card "Histórico de Alterações"
const HISTORICO_CAMPO_STYLE = {
  status:         { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  seguroAcionado: { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
}

// Cores por tipo de evento, usadas no card "Histórico de Eventos da Timeline" (mesmos tipos de CadastrarInadimplencia.jsx)
const EVENTO_TIPO_STYLE = {
  'Observação':              { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
  'Contato realizado':       { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  'Documentação solicitada': { bg: '#fefce8', color: '#a16207', border: '#fde68a' },
  'Notificação enviada':     { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  'Acordo realizado':        { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
  'Pagamento parcial':       { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  'Encaminhado jurídico':    { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  'Seguro acionado':         { bg: '#ecfeff', color: '#0e7490', border: '#a5f3fc' },
  'Seguro aprovado':         { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  'Quitado':                 { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  'Registro':                { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
  'Outros':                  { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
}

// Status de acompanhamento de cada evento da timeline, editável direto no card do Dashboard
const EVENTO_STATUS_OPCOES = [
  { value: 'sem_movimento',      label: 'Sem movimento' },
  { value: 'aguardando_retorno', label: 'Aguardando retorno do proprietário' },
  { value: 'enviado_plataforma', label: 'Já enviado na plataforma' },
]
const EVENTO_STATUS_DEFAULT = EVENTO_STATUS_OPCOES[0].value

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

// Converte um timestamp/data (número ou ISO) para "YYYY-MM" em horário local, usado para agrupar
// registros de histórico pelo mês em que realmente ocorreram (não pelo mês de referência da conta)
const formatDateToMonthKey = (value) => {
  if (!value) return null
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

// Gera um PDF simples e paginado a partir de uma lista de itens, usado pelos relatórios de
// "Histórico de Alterações" e "Histórico Seguradoras". `formatarItem` retorna um array de linhas de
// texto por item, onde a primeira linha é destacada em negrito. `resumoStatus`, se informado, é uma
// lista de { label, valor, color } exibida ao final como totais + gráfico de barras.
const gerarRelatorioHistoricoPDF = async (titulo, periodoLabel, itens, formatarItem, resumoStatus, opcoesGrafico = {}) => {
  const { tipo: tipoGrafico = 'barra', posicao: posicaoGrafico = 'fim' } = opcoesGrafico
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const contentWidth = pageWidth - margin * 2
  let y = margin

  await desenharLogoRelatorio(doc, pageWidth, margin)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(titulo, margin, y)
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(periodoLabel, margin, y)
  doc.setTextColor(0)
  y += 5
  doc.setDrawColor(200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 7

  const graficoNoInicio = posicaoGrafico === 'inicio'
  if (graficoNoInicio && resumoStatus && resumoStatus.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Resumo por Status', margin, y)
    y += 8
    y = tipoGrafico === 'pizza'
      ? desenharResumoPizza(doc, margin, y, contentWidth, resumoStatus)
      : desenharResumoBarras(doc, margin, y, contentWidth, pageHeight, resumoStatus)
    doc.setDrawColor(200)
    doc.line(margin, y, pageWidth - margin, y)
    y += 7
  }

  if (itens.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('Nenhum registro encontrado no período selecionado.', margin, y)
  }

  itens.forEach((item, idx) => {
    const linhas = formatarItem(item)
    if (y > pageHeight - margin - 10) {
      doc.addPage()
      y = margin
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.splitTextToSize(linhas[0], contentWidth).forEach(w => {
      if (y > pageHeight - margin) { doc.addPage(); y = margin }
      doc.text(w, margin, y)
      y += 5
    })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    linhas.slice(1).forEach(linha => {
      doc.splitTextToSize(linha, contentWidth).forEach(w => {
        if (y > pageHeight - margin) { doc.addPage(); y = margin }
        doc.text(w, margin, y)
        y += 5
      })
    })
    y += 3
    if (idx < itens.length - 1) {
      doc.setDrawColor(230)
      doc.line(margin, y - 1.5, pageWidth - margin, y - 1.5)
    }
  })

  if (!graficoNoInicio && resumoStatus && resumoStatus.length > 0) {
    const alturaResumo = 20 + resumoStatus.length * 10
    if (y > pageHeight - margin - alturaResumo) {
      doc.addPage()
      y = margin
    }
    y += 4
    doc.setDrawColor(180)
    doc.line(margin, y, pageWidth - margin, y)
    y += 9
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Resumo por Status', margin, y)
    y += 9
    y = desenharResumoBarras(doc, margin, y, contentWidth, pageHeight, resumoStatus)
  }

  return doc
}

// Desenha uma fatia de pizza preenchida (ângulos em radianos, sentido horário a partir do topo)
const desenharFatiaPizza = (doc, cx, cy, r, anguloInicial, anguloFinal, color) => {
  const passos = Math.max(2, Math.ceil(48 * ((anguloFinal - anguloInicial) / (Math.PI * 2))))
  const pontos = []
  for (let i = 0; i <= passos; i++) {
    const a = anguloInicial + ((anguloFinal - anguloInicial) * i) / passos
    pontos.push([cx + r * Math.sin(a), cy - r * Math.cos(a)])
  }
  const linhas = []
  let anterior = [cx, cy]
  ;[...pontos, [cx, cy]].forEach(p => {
    linhas.push([p[0] - anterior[0], p[1] - anterior[1]])
    anterior = p
  })
  doc.setFillColor(...hexToRgb(color))
  doc.lines(linhas, cx, cy, [1, 1], 'F', true)
}

// Desenha o gráfico de pizza + legenda do resumo por status, retornando o novo "y" após o desenho
const desenharResumoPizza = (doc, margin, y, contentWidth, resumoStatus) => {
  const raio = 24
  const cx = margin + raio + 4
  const cy = y + raio
  const total = resumoStatus.reduce((s, r) => s + r.valor, 0) || 1

  let anguloAtual = 0
  resumoStatus.filter(r => r.valor > 0).forEach(r => {
    const fatia = (r.valor / total) * Math.PI * 2
    desenharFatiaPizza(doc, cx, cy, raio, anguloAtual, anguloAtual + fatia, r.color)
    anguloAtual += fatia
  })
  doc.setDrawColor(255)
  doc.circle(cx, cy, raio, 'S')

  const legendaX = margin + raio * 2 + 16
  let legendaY = y + 3
  doc.setFontSize(9)
  resumoStatus.forEach(r => {
    doc.setFillColor(...hexToRgb(r.color))
    doc.rect(legendaX, legendaY - 3, 4, 4, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0)
    const percentual = Math.round((r.valor / total) * 100)
    doc.text(`${r.label}: ${fmtNumeroPdf(r.valor)} (${percentual}%)`, legendaX + 6, legendaY)
    legendaY += 6
  })

  return y + Math.max(raio * 2 + 6, legendaY - y + 4)
}

// Desenha o gráfico de barras do resumo por status e retorna o novo "y" após o desenho
const desenharResumoBarras = (doc, margin, y, contentWidth, pageHeight, resumoStatus) => {
  const totalGeral = resumoStatus.reduce((s, r) => s + r.valor, 0) || 1
  const labelWidth = 44
  const valueWidth = 30
  const barWidth = contentWidth - labelWidth - valueWidth
  const barHeight = 6

  resumoStatus.forEach(r => {
    if (y > pageHeight - margin - 12) { doc.addPage(); y = margin }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(r.label, margin, y + 4.2)
    const largura = Math.max(1.5, (r.valor / totalGeral) * barWidth)
    doc.setFillColor(...hexToRgb(r.color))
    doc.rect(margin + labelWidth, y, largura, barHeight, 'F')
    doc.setDrawColor(210)
    doc.rect(margin + labelWidth, y, barWidth, barHeight)
    doc.setFont('helvetica', 'bold')
    doc.text(`${fmtNumeroPdf(r.valor)} (${Math.round((r.valor / totalGeral) * 100)}%)`, margin + labelWidth + barWidth + 4, y + 4.2)
    y += barHeight + 6
  })

  return y
}

// Desenha um gráfico de barras cronológico (um valor por mês), usado no relatório anual
const desenharGraficoMensal = (doc, margin, y, contentWidth, dadosMensais) => {
  const alturaGrafico = 45
  const gap = 2
  const barWidth = (contentWidth - gap * (dadosMensais.length - 1)) / dadosMensais.length
  const maxValor = Math.max(1, ...dadosMensais.map(d => d.valor))
  const baseY = y + alturaGrafico

  doc.setDrawColor(220)
  doc.line(margin, baseY, margin + contentWidth, baseY)

  dadosMensais.forEach((d, i) => {
    const x = margin + i * (barWidth + gap)
    const alturaBarra = (d.valor / maxValor) * alturaGrafico
    doc.setFillColor(59, 130, 246)
    if (alturaBarra > 0) doc.rect(x, baseY - alturaBarra, barWidth, alturaBarra, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(0)
    doc.text(d.label, x + barWidth / 2, baseY + 4, { align: 'center' })
  })

  return baseY + 8
}

// Desenha a tabela de detalhamento mensal (total / recuperado / em aberto), usada no relatório anual
const desenharTabelaMensal = (doc, margin, y, contentWidth, pageHeight, dadosMensais) => {
  const colMes = 26
  const colValor = (contentWidth - colMes) / 3

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Mês', margin, y)
  doc.text('Total', margin + colMes, y)
  doc.text('Recuperado', margin + colMes + colValor, y)
  doc.text('Em aberto', margin + colMes + colValor * 2, y)
  y += 3
  doc.setDrawColor(200)
  doc.line(margin, y, margin + contentWidth, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  dadosMensais.forEach(d => {
    if (y > pageHeight - margin - 8) { doc.addPage(); y = margin }
    doc.text(d.label, margin, y)
    doc.text(fmtMoney(d.valor), margin + colMes, y)
    doc.text(fmtMoney(d.recuperado), margin + colMes + colValor, y)
    doc.text(fmtMoney(d.aberto), margin + colMes + colValor * 2, y)
    y += 6
  })

  return y
}

// Monta o PDF do relatório anual: pizza com os percentuais do ano + gráfico cronológico por mês
const gerarRelatorioAnualPDF = async (titulo, periodoLabel, resumoStatus, dadosMensais) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const contentWidth = pageWidth - margin * 2
  let y = margin

  await desenharLogoRelatorio(doc, pageWidth, margin)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(titulo, margin, y)
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(periodoLabel, margin, y)
  doc.setTextColor(0)
  y += 5
  doc.setDrawColor(200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 9

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Resumo por Status', margin, y)
  y += 8
  y = desenharResumoPizza(doc, margin, y, contentWidth, resumoStatus)
  y += 6

  doc.setDrawColor(200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 9

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Evolução Mensal', margin, y)
  y += 8
  y = desenharGraficoMensal(doc, margin, y, contentWidth, dadosMensais)
  y += 6

  doc.setDrawColor(200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 9

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Detalhamento Mensal', margin, y)
  y += 8
  desenharTabelaMensal(doc, margin, y, contentWidth, pageHeight, dadosMensais)

  return doc
}

// Converte uma cor hex (#rrggbb) para [r, g, b] numérico, usado ao desenhar as barras do resumo
const hexToRgb = (hex) => {
  const v = parseInt(hex.replace('#', ''), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

// Formata um número com separador de milhar e 2 casas decimais (ex: 1.000.000,00), usado nos gráficos do PDF
const fmtNumeroPdf = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatFaixaAluguel = (inicio, fim) =>
  `${fmtMoney(inicio)} - ${fmtMoney(fim)}`

// Formata uma chave de mês (YYYY-MM) de forma curta, ex: "Jan/2026"
const formatMonthKeyShort = (monthKey) => {
  if (!monthKey) return ''
  const [year, month] = monthKey.split('-')
  return `${MONTH_LABELS[Number(month) - 1]}/${year}`
}

// Formata um objeto Date para "YYYY-MM-DD" (valor usado por <input type="date">)
const toYmd = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const calcularDiasEntreDatas = (dataInicial, dataFinal) => {
  if (!dataInicial || !dataFinal) return null
  const inicio = new Date(`${dataInicial}T00:00:00`)
  const fim = new Date(`${dataFinal}T00:00:00`)
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return null
  return Math.round((fim - inicio) / (1000 * 60 * 60 * 24))
}

const formatarDataCurta = (value) => {
  if (!value) return '—'
  const [year, month, day] = value.split('-')
  return day && month && year ? `${day}/${month}/${year}` : value
}

// Monta a série mensal do total de inquilinos ativos entre duas datas (contrato vigente
// em algum momento do mês, considerando dataEntrada/dataSaida), usada no gráfico cronológico
const buildInquilinosAtivosChronData = (inquilinos, startDate, endDate) => {
  if (!startDate || !endDate) return []
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []

  const data = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1)
  // limite de segurança para nunca gerar uma série absurdamente longa
  let guard = 0
  while (cursor <= endCursor && guard < 600) {
    const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    const monthStart = `${monthKey}-01`
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const monthEnd = `${monthKey}-${String(lastDay).padStart(2, '0')}`
    const count = inquilinos.filter(i => {
      if (!i.dataEntrada || i.dataEntrada > monthEnd) return false
      if (i.dataSaida && i.dataSaida < monthStart) return false
      return true
    }).length
    data.push({ monthKey, label: formatMonthKeyShort(monthKey), count })
    cursor.setMonth(cursor.getMonth() + 1)
    guard += 1
  }
  return data
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
  if (item.seguroAcionado === 'pagamento_reprovado') return 'reprovado'
  if (item.seguroAcionado === 'aguardar_para_acionar') return 'aguardarAcionar'
  return 'inadimplente'
}

const emptyMonthTotals = () => ({
  inadimplente: 0,
  recuperado: 0,
  aprovadoSeguradora: 0,
  reprovado: 0,
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

const getPieSegments = (inadimplente, recuperado, aprovadoSeguradora, aguardarAcionar, juridico, acionado, reprovado = 0) => {
  const total = inadimplente + recuperado + aprovadoSeguradora + aguardarAcionar + juridico + acionado + reprovado
  const recoveredPercent = total > 0 ? Math.round((recuperado / total) * 100) : 0
  const approvedPercent = total > 0 ? Math.round((aprovadoSeguradora / total) * 100) : 0
  const reprovadoPercent = total > 0 ? Math.round((reprovado / total) * 100) : 0
  const waitingPercent = total > 0 ? Math.round((aguardarAcionar / total) * 100) : 0
  const juridicoPercent = total > 0 ? Math.round((juridico / total) * 100) : 0
  const acionadoPercent = total > 0 ? Math.round((acionado / total) * 100) : 0
  const inadimplentePercent = total > 0 ? Math.round((inadimplente / total) * 100) : 0
  return {
    recoveredPercent,
    approvedPercent,
    reprovadoPercent,
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
  const [inquilinosCarregado, setInquilinosCarregado] = useState(false)
  const [historicoAlteracoes, setHistoricoAlteracoes] = useState([])
  const [historicoMesFiltro, setHistoricoMesFiltro] = useState(currentMonth)
  const [lucroAno, setLucroAno] = useState(currentYear)
  const [rankingMes, setRankingMes] = useState(currentMonth)
  const [faixaAluguelStatus, setFaixaAluguelStatus] = useState('ativos')
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

  // Filtro de período do card "Inquilinos Ativos ao Longo do Tempo" (padrão: últimos 12 meses)
  const [inquilinosAtivosPeriodStart, setInquilinosAtivosPeriodStart] = useState(
    () => toYmd(new Date(now.getFullYear(), now.getMonth() - 11, 1))
  )
  const [inquilinosAtivosPeriodEnd, setInquilinosAtivosPeriodEnd] = useState(() => toYmd(now))

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
      setInquilinosCarregado(true)
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

  // Animação de entrada com GSAP: as seções sobem/desaparecem em cascata e os cartões
  // de indicadores da primeira linha entram com um leve "bounce" logo em seguida.
  const dashboardPageRef = useRef(null)

  useEffect(() => {
    const container = dashboardPageRef.current
    if (!container) return undefined

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const sections = Array.from(container.children)
    const statCards = Array.from(sections[0]?.children || [])

    if (prefersReducedMotion) {
      gsap.set([sections, statCards], { clearProps: 'all' })
      return undefined
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.set(sections, { opacity: 0, y: 56, scale: 0.96 })
        .set(statCards, { opacity: 0, y: 22, scale: 0.82 })
        .to(sections, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.85,
          stagger: 0.13,
          clearProps: 'transform',
        })
        .to(statCards, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.55,
          stagger: 0.09,
          ease: 'back.out(1.8)',
          clearProps: 'transform',
        }, '-=0.85')
    }, container)

    return () => ctx.revert()
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

  const valorMedioAluguel = useMemo(() => {
    const ativos = inquilinos.filter(i => i.status === 'Ativo' && (parseFloat(i.valorAluguel) || 0) > 0)
    if (ativos.length === 0) return 0
    const soma = ativos.reduce((sum, i) => sum + (parseFloat(i.valorAluguel) || 0), 0)
    return soma / ativos.length
  }, [inquilinos])

  const faixasAluguel = useMemo(() => {
    const lista = inquilinos.filter(inquilino => {
      if (faixaAluguelStatus === 'ativos') return inquilino.status === 'Ativo'
      if (faixaAluguelStatus === 'inativos') return inquilino.status === 'Inativo'
      return true
    }).map(inquilino => Number(inquilino.valorAluguel) || 0).filter(valor => valor > 0)

    if (lista.length === 0) return []

    const passo = 500
    const maiorFaixa = Math.floor(Math.max(...lista) / passo)
    return Array.from({ length: maiorFaixa + 1 }, (_, indice) => {
      const inicio = indice * passo
      const fim = inicio + passo - 0.01
      return {
        inicio,
        fim,
        quantidade: lista.filter(valor => valor >= inicio && valor < inicio + passo).length,
      }
    }).filter(faixa => faixa.quantidade > 0)
  }, [inquilinos, faixaAluguelStatus])

  const maiorQuantidadeFaixaAluguel = Math.max(...faixasAluguel.map(faixa => faixa.quantidade), 0)

  const inadimplenciasRecebidas = useMemo(() => inadimplencias
    .filter(debito => debito.status === 'pago' && debito.dataVencimento && debito.dataPagamento)
    .map(debito => ({
      ...debito,
      diasAtePagamento: calcularDiasEntreDatas(debito.dataVencimento, debito.dataPagamento),
    }))
    .filter(debito => debito.diasAtePagamento !== null && debito.diasAtePagamento >= 0)
    .sort((a, b) => b.dataPagamento.localeCompare(a.dataPagamento)),
  [inadimplencias])

  const mediaDiasAtePagamento = useMemo(() => {
    if (inadimplenciasRecebidas.length === 0) return 0
    const totalDias = inadimplenciasRecebidas.reduce((total, debito) => total + debito.diasAtePagamento, 0)
    return totalDias / inadimplenciasRecebidas.length
  }, [inadimplenciasRecebidas])

  const maiorDiasAtePagamento = useMemo(
    () => Math.max(...inadimplenciasRecebidas.map(debito => debito.diasAtePagamento), 0),
    [inadimplenciasRecebidas]
  )

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

  const getNomeImovel = (d) => {
    const inquilino = inquilinoMap[d.inquilinoId]
    const imovel = imovelMap[inquilino?.imovelId]
    return imovel?.nome || d.codigoImovel || ''
  }

  const calcularLucroProprietario = (proprietario, mes) => {
    return Object.entries(proprietario?.imoveisVinculos || {}).reduce((somaImovel, [imovelId, vinculo]) => {
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
        return total + [...contaIds].reduce((somaContas, contaId) => {
          const nomeConta = normalizeText(contasCatalogo.find(conta => conta.id === contaId)?.nome || contaId)
          return nomeConta.includes(termo) ? somaContas + getValorConta(contaId) : somaContas
        }, 0)
      }, 0)

      const taxaAdministrativa = baseAdministrativa * ((Number(vinculo.taxaAdministracao) || 0) / 100)
      const taxaContrato = inquilino.dataEntrada?.slice(0, 7) === mes
        ? aluguel * ((Number(vinculo.taxaContrato) || 0) / 100)
        : 0

      return somaImovel + taxaAdministrativa + taxaContrato
    }, 0)
  }

  const rankingProprietarios = useMemo(() => proprietarios
    .map(proprietario => {
      const total = calcularLucroProprietario(proprietario, rankingMes)
      return { id: proprietario.id, nome: proprietario.nome || 'Sem nome', total }
    })
    .filter(proprietario => proprietario.total > 0)
    .sort((a, b) => b.total - a.total),
  [proprietarios, inquilinos, contasCatalogo, valoresVariaveis, rankingMes])

  // Soma o lucro da imobiliária (Taxa Adm + Taxa Contrato) mês a mês para o ano selecionado.
  const lucroPorMes = useMemo(() => {
    const calcularLucroMes = (mes) => {
      return proprietarios.reduce((total, proprietario) => total + calcularLucroProprietario(proprietario, mes), 0)
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

  // Série mensal de inquilinos ativos no período filtrado, para o gráfico cronológico
  const inquilinosAtivosChronData = useMemo(
    () => buildInquilinosAtivosChronData(inquilinos, inquilinosAtivosPeriodStart, inquilinosAtivosPeriodEnd),
    [inquilinos, inquilinosAtivosPeriodStart, inquilinosAtivosPeriodEnd]
  )

  const chronMaxCount = useMemo(
    () => Math.max(1, ...inquilinosAtivosChronData.map(d => d.count)),
    [inquilinosAtivosChronData]
  )

  const chronPointX = (index) => {
    const n = inquilinosAtivosChronData.length
    return n <= 1 ? 150 : (index / (n - 1)) * 300
  }

  const chronPointY = (count) => 96 - (count / chronMaxCount) * 88

  const chronLinePoints = useMemo(
    () => inquilinosAtivosChronData
      .map((item, index) => `${chronPointX(index)},${chronPointY(item.count)}`)
      .join(' '),
    [inquilinosAtivosChronData, chronMaxCount]
  )

  const chronAreaPoints = useMemo(() => {
    if (!chronLinePoints) return ''
    const lastX = inquilinosAtivosChronData.length <= 1 ? 150 : 300
    return `0,96 ${chronLinePoints} ${lastX},96`
  }, [chronLinePoints, inquilinosAtivosChronData])

  const limparFiltroInquilinosAtivosPeriodo = () => {
    setInquilinosAtivosPeriodStart(toYmd(new Date(now.getFullYear(), now.getMonth() - 11, 1)))
    setInquilinosAtivosPeriodEnd(toYmd(now))
  }

  const monthCards = useMemo(() => MONTH_FULL_LABELS.map((label, index) => {
    const key = `${selectedYear}-${String(index + 1).padStart(2, '0')}`
    const totals = yearMonthTotals[key] || emptyMonthTotals()
    const total = totals.inadimplente + totals.recuperado + totals.aprovadoSeguradora + totals.aguardarAcionar + totals.juridico + totals.acionado + totals.reprovado
    const recoveredPercent = total > 0 ? Math.round((totals.recuperado / total) * 100) : 0
    const approvedPercent = total > 0 ? Math.round((totals.aprovadoSeguradora / total) * 100) : 0
    const reprovadoPercent = total > 0 ? Math.round((totals.reprovado / total) * 100) : 0
    const waitingPercent = total > 0 ? Math.round((totals.aguardarAcionar / total) * 100) : 0
    const juridicoPercent = total > 0 ? Math.round((totals.juridico / total) * 100) : 0
    const acionadoPercent = total > 0 ? Math.round((totals.acionado / total) * 100) : 0
    const abertoValue = totals.inadimplente + totals.aprovadoSeguradora + totals.aguardarAcionar + totals.juridico + totals.acionado + totals.reprovado
    const abertoPercent = total > 0 ? Math.round((abertoValue / total) * 100) : 0
    return {
      key,
      label,
      inadimplente: totals.inadimplente,
      recuperado: totals.recuperado,
      aprovadoSeguradora: totals.aprovadoSeguradora,
      reprovado: totals.reprovado,
      aguardarAcionar: totals.aguardarAcionar,
      juridico: totals.juridico,
      acionado: totals.acionado,
      recoveredPercent,
      approvedPercent,
      reprovadoPercent,
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

  const getInquilinoRegistroKey = (debito) => {
    if (debito.inquilinoId) return `id:${debito.inquilinoId}`
    if (debito.inquilinoNome) return `nome:${normalizeText(debito.inquilinoNome)}`
    return null
  }

  const inquilinosAtivosNoPeriodo = useMemo(() => {
    const inicioPeriodo = periodMonthKeys[0]
    const fimPeriodo = periodMonthKeys[periodMonthKeys.length - 1]
    if (!inicioPeriodo || !fimPeriodo) return []

    return inquilinos.filter(inquilino => {
      const entrada = inquilino.dataEntrada?.slice(0, 7)
      const saida = inquilino.dataSaida?.slice(0, 7)
      if (entrada && entrada > fimPeriodo) return false
      if (saida && saida < inicioPeriodo) return false
      return true
    })
  }, [inquilinos, periodMonthKeys])

  const inquilinoKeysAtivosNoPeriodo = useMemo(() => new Set(
    inquilinosAtivosNoPeriodo.flatMap(inquilino => [
      `id:${inquilino.id}`,
      ...(inquilino.nome ? [`nome:${normalizeText(inquilino.nome)}`] : []),
    ])
  ), [inquilinosAtivosNoPeriodo])

  const periodDebtsDeInquilinosAtivos = useMemo(
    () => periodDebts.filter(debito => inquilinoKeysAtivosNoPeriodo.has(getInquilinoRegistroKey(debito))),
    [periodDebts, inquilinoKeysAtivosNoPeriodo]
  )

  const inquilinosInadimplentesNoPeriodo = useMemo(() => {
    const ids = new Set()
    periodDebtsDeInquilinosAtivos
      .filter(debito => debito.status !== 'pago')
      .forEach(debito => {
        const key = getInquilinoRegistroKey(debito)
        if (key) ids.add(key)
      })
    return ids.size
  }, [periodDebtsDeInquilinosAtivos])

  const totalInquilinos = inquilinosAtivosNoPeriodo.length
  const percentualInquilinosInadimplentes = totalInquilinos > 0
    ? Math.round((inquilinosInadimplentesNoPeriodo / totalInquilinos) * 100)
    : 0
  const percentualInquilinosSemInadimplencia = Math.max(0, 100 - percentualInquilinosInadimplentes)

  const inquilinosComRegistroNoPeriodo = useMemo(() => {
    const ids = new Set()
    periodDebtsDeInquilinosAtivos.forEach(debito => {
      const key = getInquilinoRegistroKey(debito)
      if (key) ids.add(key)
    })
    return ids.size
  }, [periodDebtsDeInquilinosAtivos])

  const percentualInquilinosComRegistro = totalInquilinos > 0
    ? Math.round((inquilinosComRegistroNoPeriodo / totalInquilinos) * 100)
    : 0
  const percentualInquilinosSemRegistro = Math.max(0, 100 - percentualInquilinosComRegistro)

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
        reprovado: acc.reprovado + (totals.reprovado || 0),
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
    selectedMonthTotals.acionado,
    selectedMonthTotals.reprovado
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
    const acc = { recuperado: [], aprovadoSeguradora: [], reprovado: [], aguardarAcionar: [], juridico: [], acionado: [], inadimplente: [] }
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
          <div key={i} className="flex items-center justify-between gap-2">
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
  // (exclui as alterações de conta feitas na Planilha de Cobrança, exibidas em seu próprio card)
  const historicoOrdenado = useMemo(
    () => [...historicoAlteracoes].filter(item => item.origem !== 'planilha_cobranca').sort((a, b) => (b.data || 0) - (a.data || 0)),
    [historicoAlteracoes]
  )

  // Mês em que a alteração foi de fato feita, derivado do timestamp "data" (não do mesReferencia do
  // débito), para que o registro sempre apareça no mês em que ocorreu, independente do mês da conta
  const getHistoricoMes = (item) => formatDateToMonthKey(item.data)

  // Meses com pelo menos um registro, do mais recente para o mais antigo, para popular o filtro
  const historicoMesesDisponiveis = useMemo(
    () => [...new Set(historicoAlteracoes.map(getHistoricoMes).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [historicoAlteracoes]
  )

  const historicoFiltrado = useMemo(
    () => historicoMesFiltro === 'todos'
      ? historicoOrdenado
      : historicoOrdenado.filter(item => getHistoricoMes(item) === historicoMesFiltro),
    [historicoOrdenado, historicoMesFiltro]
  )

  const handleExcluirHistorico = async (id) => {
    if (!window.confirm('Deseja excluir este registro do histórico?')) return
    await remove(ref(db, `historicoAlteracoes/${id}`))
  }

  // ---- Card "Histórico de Eventos da Timeline" ----

  // Achata a timeline de todos os débitos (aninhada dentro de cada inadimplência) em uma única lista
  const eventosTimelineOrdenados = useMemo(() => {
    const lista = []
    inadimplencias.forEach(d => {
      if (!d.timeline) return
      Object.entries(d.timeline).forEach(([eventoKey, evento]) => {
        lista.push({
          id: `${d.id}_${eventoKey}`,
          debitoId: d.id,
          eventoKey,
          inquilinoNome: d.inquilinoNome || 'Sem nome',
          nomeImovel: getNomeImovel(d) || null,
          tipo: evento.tipo || 'Outros',
          descricao: evento.descricao || '',
          documentos: evento.documentos || [],
          criadoEm: evento.criadoEm || null,
          statusEvento: evento.statusEvento || EVENTO_STATUS_DEFAULT,
          mesReferencia: evento.criadoEm ? formatDateToMonthKey(evento.criadoEm) : null,
        })
      })
    })
    return lista.sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0))
  }, [inadimplencias])

  const [eventosMesFiltro, setEventosMesFiltro] = useState(currentMonth)

  // Meses com pelo menos um evento, do mais recente para o mais antigo, para popular o filtro
  const eventosMesesDisponiveis = useMemo(
    () => [...new Set(eventosTimelineOrdenados.map(item => item.mesReferencia).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [eventosTimelineOrdenados]
  )

  const eventosFiltrados = useMemo(
    () => eventosMesFiltro === 'todos'
      ? eventosTimelineOrdenados
      : eventosTimelineOrdenados.filter(item => item.mesReferencia === eventosMesFiltro),
    [eventosTimelineOrdenados, eventosMesFiltro]
  )

  const handleExcluirEventoTimeline = async (debitoId, eventoKey) => {
    if (!window.confirm('Deseja excluir este evento do histórico?')) return
    await remove(ref(db, `inadimplencias/${debitoId}/timeline/${eventoKey}`))
  }

  const handleStatusEventoChange = async (debitoId, eventoKey, value) => {
    await update(ref(db, `inadimplencias/${debitoId}/timeline/${eventoKey}`), { statusEvento: value })
  }

  // ---- Relatório em PDF (Histórico de Alterações / Histórico Seguradoras / Inadimplência por Período) ----
  const [relatorioTipo, setRelatorioTipo] = useState(null) // 'alteracoes' | 'seguradoras' | 'periodo' | null
  const [relatorioInicio, setRelatorioInicio] = useState('')
  const [relatorioFim, setRelatorioFim] = useState('')
  const [relatorioMes, setRelatorioMes] = useState('')
  const [relatorioModoPeriodo, setRelatorioModoPeriodo] = useState('mes') // 'mes' | 'ano', só usado no tipo 'periodo'
  const [relatorioAno, setRelatorioAno] = useState('')

  const abrirRelatorioModal = (tipo) => {
    setRelatorioTipo(tipo)
    setRelatorioInicio('')
    setRelatorioFim('')
    setRelatorioMes(selectedMonth || currentMonth)
    setRelatorioModoPeriodo('mes')
    setRelatorioAno(selectedYear)
  }

  const handleGerarRelatorio = async () => {
    const inicio = relatorioInicio ? new Date(`${relatorioInicio}T00:00:00`) : null
    const fim = relatorioFim ? new Date(`${relatorioFim}T23:59:59`) : null
    const dentroDoPeriodo = (timestamp) => {
      if (!timestamp) return false
      const d = new Date(timestamp)
      if (inicio && d < inicio) return false
      if (fim && d > fim) return false
      return true
    }
    const periodoLabel = (relatorioInicio || relatorioFim)
      ? `Período: ${relatorioInicio ? fmtDataCurta(relatorioInicio) : 'início'} até ${relatorioFim ? fmtDataCurta(relatorioFim) : 'hoje'}`
      : 'Período: todos os registros'

    if (relatorioTipo === 'alteracoes') {
      const itens = historicoOrdenado.filter(item => dentroDoPeriodo(item.data))
      const classificarStatus = (item) => {
        const key = item.valorNovoKey
        if (item.campo === 'status') {
          if (key === 'pago') return 'Pago'
          if (key === 'juridico') return 'Jurídico'
          if (key === 'seguro_aprovado') return 'Aprovado'
          return 'Aberto'
        }
        if (item.campo === 'seguroAcionado') {
          if (key === 'pagamento_aprovado') return 'Aprovado'
          if (key === 'aguardar_para_acionar') return 'Aguardar para acionar'
          if (key === 'acionado') return 'Acionado'
          if (key === 'juridico') return 'Jurídico'
          return 'Aberto'
        }
        return 'Aberto'
      }
      const contagemStatus = itens.reduce((acc, item) => {
        const rotulo = classificarStatus(item)
        acc[rotulo] = (acc[rotulo] || 0) + 1
        return acc
      }, {})
      const resumoStatus = [
        { label: 'Pago', valor: contagemStatus['Pago'] || 0, color: '#16a34a' },
        { label: 'Aprovado', valor: contagemStatus['Aprovado'] || 0, color: '#22c55e' },
        { label: 'Aguardar para acionar', valor: contagemStatus['Aguardar para acionar'] || 0, color: '#64748b' },
        { label: 'Acionado', valor: contagemStatus['Acionado'] || 0, color: '#3b82f6' },
        { label: 'Jurídico', valor: contagemStatus['Jurídico'] || 0, color: '#ef4444' },
        { label: 'Aberto', valor: contagemStatus['Aberto'] || 0, color: '#eab308' },
      ]
      const doc = await gerarRelatorioHistoricoPDF('Histórico de Alterações', periodoLabel, itens, item => [
        `${item.inquilinoNome || 'Sem nome'}${item.codigoImovel ? ` (${item.codigoImovel})` : ''} — ${fmtDataHora(item.data)}`,
        `${item.campoLabel || (item.campo === 'seguroAcionado' ? 'Seguro Acionado' : 'Status')}: ${item.valorAnteriorLabel || '—'} -> ${item.valorNovoLabel || '—'}`,
        `Total c/ Encargos: ${fmtMoney(item.valorTotal)}` +
          (item.valorRecebido > 0 ? ` · Recebido: ${fmtMoney(item.valorRecebido)}` : '') +
          (item.mesReferencia ? ` · ${getMonthLabel(item.mesReferencia)}` : '') +
          (item.dataSeguro ? ` · Data Seguro: ${fmtDataCurta(item.dataSeguro)}` : ''),
      ], resumoStatus, { posicao: 'inicio' })
      doc.save(`historico-alteracoes_${relatorioInicio || 'inicio'}_${relatorioFim || 'fim'}.pdf`)
    } else if (relatorioTipo === 'seguradoras') {
      const itens = eventosTimelineOrdenados.filter(item => dentroDoPeriodo(item.criadoEm))
      const doc = await gerarRelatorioHistoricoPDF('Histórico Seguradoras', periodoLabel, itens, item => [
        `${item.inquilinoNome}${item.nomeImovel ? ` (${item.nomeImovel})` : ''} — ${fmtDataHora(item.criadoEm)}`,
        `Tipo: ${item.tipo}${(EVENTO_STATUS_OPCOES.find(o => o.value === item.statusEvento)?.label) ? ` · Status: ${EVENTO_STATUS_OPCOES.find(o => o.value === item.statusEvento).label}` : ''}`,
        ...(item.descricao ? [item.descricao] : []),
        ...(item.documentos?.length ? [`Documentos: ${item.documentos.join(', ')}`] : []),
      ])
      doc.save(`historico-seguradoras_${relatorioInicio || 'inicio'}_${relatorioFim || 'fim'}.pdf`)
    } else if (relatorioTipo === 'periodo') {
      const categoriaLabel = {
        recuperado: 'Pago',
        aprovadoSeguradora: 'Aprovado seguradora',
        reprovado: 'Pagamento reprovado',
        aguardarAcionar: 'Aguardar para acionar',
        juridico: 'Jurídico',
        acionado: 'Acionado',
        inadimplente: 'Aberto',
      }
      const montarResumoStatus = (itens) => {
        const contagemStatus = itens.reduce((acc, item) => {
          const categoria = classifyDebt(item)
          acc[categoria] = (acc[categoria] || 0) + getDebtValue(item)
          return acc
        }, {})
        return [
          { label: 'Pago', valor: contagemStatus.recuperado || 0, color: RECOVERY_COLORS.recuperado },
          { label: 'Aprovado seguradora', valor: contagemStatus.aprovadoSeguradora || 0, color: RECOVERY_COLORS.aprovadoSeguradora },
          { label: 'Pagamento reprovado', valor: contagemStatus.reprovado || 0, color: RECOVERY_COLORS.reprovado },
          { label: 'Aguardar para acionar', valor: contagemStatus.aguardarAcionar || 0, color: RECOVERY_COLORS.aguardarAcionar },
          { label: 'Jurídico', valor: contagemStatus.juridico || 0, color: RECOVERY_COLORS.juridico },
          { label: 'Acionado', valor: contagemStatus.acionado || 0, color: RECOVERY_COLORS.acionado },
          { label: 'Aberto', valor: contagemStatus.inadimplente || 0, color: '#f97316' },
        ]
      }

      if (relatorioModoPeriodo === 'ano') {
        const itens = inadimplencias.filter(d => getMonthKey(d)?.startsWith(relatorioAno))
        const resumoStatus = montarResumoStatus(itens)
        const totaisMensais = buildMonthlyTotals(inadimplencias, relatorioAno)
        const dadosMensais = MONTH_FULL_LABELS.map((_, i) => {
          const key = `${relatorioAno}-${String(i + 1).padStart(2, '0')}`
          const t = totaisMensais[key] || emptyMonthTotals()
          const total = t.inadimplente + t.recuperado + t.aprovadoSeguradora + t.aguardarAcionar + t.juridico + t.acionado + t.reprovado
          return { label: MONTH_LABELS[i], valor: total, recuperado: t.recuperado, aberto: total - t.recuperado }
        })
        const doc = await gerarRelatorioAnualPDF('Inadimplência por Período', `Ano ${relatorioAno}`, resumoStatus, dadosMensais)
        doc.save(`inadimplencia-anual_${relatorioAno || 'ano'}.pdf`)
      } else {
        const itens = inadimplencias.filter(d => getMonthKey(d) === relatorioMes)
        const resumoStatus = montarResumoStatus(itens)
        const doc = await gerarRelatorioHistoricoPDF('Inadimplência por Período', getMonthLabel(relatorioMes), itens, item => [
          `${inquilinoMap[item.inquilinoId]?.nome || item.inquilinoNome || 'Sem nome'}${getCodigoImovel(item) ? ` (${getCodigoImovel(item)})` : ''} — ${categoriaLabel[classifyDebt(item)]}`,
          `Total c/ Encargos: ${fmtMoney(getDebtValue(item))}` +
            (item.valorRecebido > 0 ? ` · Recebido: ${fmtMoney(item.valorRecebido)}` : ''),
        ], resumoStatus, { tipo: 'pizza', posicao: 'inicio' })
        doc.save(`inadimplencia-periodo_${relatorioMes || 'mes'}.pdf`)
      }
    }
    setRelatorioTipo(null)
  }

  return (
    <Layout title="Dashboard" subtitle="Visão geral do sistema de gestão">
      <div className="dashboard-page" ref={dashboardPageRef}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-3">
        <Card className="min-w-0">
          <CardContent className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center  bg-blue-500/10 text-blue-600">
              <Building2 className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-tight">{totalImoveis}</p>
              <p className="truncate text-xs text-muted-foreground">Total de Imóveis</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center bg-emerald-500/10 text-emerald-600">
              <Users className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-tight">{totalInquilinosAtivos}</p>
              <p className="truncate text-xs text-muted-foreground">Inquilinos Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center bg-amber-500/10 text-amber-600">
              <TriangleAlert className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-tight">{uniqueInadimplentes}</p>
              <p className="truncate text-xs text-muted-foreground">Inadimplentes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center bg-violet-500/10 text-violet-600">
              <Wallet className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold tracking-tight">{fmtMoney(receitaMensal)}</p>
              <p className="truncate text-xs text-muted-foreground">Receita Mensal</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center bg-cyan-500/10 text-cyan-600">
              <TrendingUp className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold tracking-tight">{fmtMoney(valorMedioAluguel)}</p>
              <p className="truncate text-xs text-muted-foreground">Valor Médio dos Aluguéis</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {!inquilinosCarregado && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Card className="flex-1 border-amber-300" style={{ background: '#fffbeb' }}>
            <CardHeader className="">
              <CardTitle className="flex items-center gap-2 text-sm" style={{ color: '#b45309' }}>
                <div className="h-4 w-4 animate-pulse rounded bg-amber-300/60" />
                <div className="h-4 w-56 animate-pulse rounded bg-amber-300/60" />
              </CardTitle>
            </CardHeader>
            <CardContent className="">
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="h-3 w-28 animate-pulse rounded bg-amber-200/70" />
                    <div className="h-3 w-16 animate-pulse rounded bg-amber-200/70" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 border-orange-300" style={{ background: '#fff7ed' }}>
            <CardHeader className="">
              <CardTitle className="flex items-center gap-2 text-sm" style={{ color: '#c2410c' }}>
                <div className="h-4 w-4 animate-pulse rounded bg-orange-300/60" />
                <div className="h-4 w-56 animate-pulse rounded bg-orange-300/60" />
              </CardTitle>
            </CardHeader>
            <CardContent className="">
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="h-3 w-28 animate-pulse rounded bg-orange-200/70" />
                    <div className="h-3 w-16 animate-pulse rounded bg-orange-200/70" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {inquilinosCarregado && (segurosExpirandoFianca.length > 0 || segurosExpirandoIncendio.length > 0) && (
        <div className="mb-3 flex flex-wrap gap-2">
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
                      <span className="font-small">{i.nome}</span>
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
                      <span className="font-small">{i.nome}</span>
                      <span className="text-muted-foreground">Seguro Incêndio</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card className="mb-3">
        <CardHeader className="flex w-full flex-col flex-wrap gap-2 border-b py-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-sm">Mapa de Imóveis</CardTitle>
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
        <CardContent className="p-2">
          <MapaImoveis imoveis={imoveisMapaFiltrados} />
        </CardContent>
      </Card>

      <Card className="mb-3">
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
        <CardContent className="px-2">
          <div className="flex gap-1 overflow-x-auto">
            {MONTH_LABELS.map((label, index) => (
              <div key={label} className="min-w-[72px] flex-1 border bg-muted/20 px-1.5 py-1">
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

      <div className="mb-3 grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex w-full flex-col flex-wrap gap-2 border-b py-2">
            <CardTitle className="text-sm">Inquilinos Ativos ao Longo do Tempo</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                value={inquilinosAtivosPeriodStart}
                max={inquilinosAtivosPeriodEnd || undefined}
                onChange={e => setInquilinosAtivosPeriodStart(e.target.value)}
                className="h-7 rounded-md border px-1.5 text-[11px]"
                aria-label="Data inicial"
              />
              <span className="text-[11px] text-muted-foreground">até</span>
              <input
                type="date"
                value={inquilinosAtivosPeriodEnd}
                min={inquilinosAtivosPeriodStart || undefined}
                onChange={e => setInquilinosAtivosPeriodEnd(e.target.value)}
                className="h-7 rounded-md border px-1.5 text-[11px]"
                aria-label="Data final"
              />
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={limparFiltroInquilinosAtivosPeriodo}>
                Limpar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-2 py-2">
            {inquilinosAtivosChronData.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Selecione um período válido.</p>
            ) : (
              <>
                <svg viewBox="0 0 300 100" className="h-32 w-full" preserveAspectRatio="none" aria-label="Gráfico de inquilinos ativos ao longo do tempo">
                  <line x1="0" y1="96" x2="300" y2="96" stroke="var(--border)" strokeWidth="1" />
                  {chronAreaPoints && <polygon points={chronAreaPoints} fill="#2563eb1a" />}
                  <polyline
                    points={chronLinePoints}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {inquilinosAtivosChronData.map((item, index) => (
                    <circle key={item.monthKey} cx={chronPointX(index)} cy={chronPointY(item.count)} r="2.2" fill="#2563eb">
                      <title>{`${item.label}: ${item.count} inquilino(s) ativo(s)`}</title>
                    </circle>
                  ))}
                </svg>
                <div className="mt-1 flex text-[9px] text-muted-foreground">
                  {inquilinosAtivosChronData.map((item, index, arr) => {
                    // evita labels amontoados quando o período abrange muitos meses
                    const step = Math.max(1, Math.ceil(arr.length / 8))
                    const showLabel = index % step === 0 || index === arr.length - 1
                    return (
                      <span key={item.monthKey} className="flex-1 truncate text-center" title={item.label}>
                        {showLabel ? item.label : ''}
                      </span>
                    )
                  })}
                </div>
                <p className="mt-1 text-center text-[11px] text-muted-foreground">
                  Pico no período: <strong className="text-foreground">{chronMaxCount}</strong> inquilino(s) ativo(s)
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
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
          <CardContent className="min-w-0 px-2 py-2">
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

                <div className="flex min-w-0 items-end gap-1">
                  {lucroPorMes.map((m, index) => {
                    const isMax = m.total > 0 && m.total === maxLucroValor
                    const alturaPercentual = m.total > 0 ? Math.max((m.total / maxLucroValor) * 100, 4) : 0
                    return (
                      <div
                        key={m.mes}
                        className="flex min-w-0 flex-1 flex-col items-center gap-1"
                        title={`${MONTH_LABELS[index]} de ${lucroAno}: ${fmtMoney(m.total)}`}
                      >
                        <span className="h-3 max-w-full truncate text-[9px] font-medium text-muted-foreground">
                          {m.total > 0 ? fmtMoneyCompact(m.total) : ''}
                        </span>
                        <div className="flex w-full items-end justify-center" style={{ height: 80 }}>
                          <div
                            className={`w-full rounded-t-sm transition-all ${isMax ? 'bg-emerald-500' : 'bg-blue-400/70'}`}
                            style={{ height: `${alturaPercentual}%` }}
                          />
                        </div>
                        <span className={`max-w-full truncate text-[10px] ${isMax ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}`}>
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

        <Card className="min-h-0">
          <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-2 border-b py-2">
            <div>
              <CardTitle className="text-sm">Top Proprietários</CardTitle>
              <CardDescription className="text-[11px]">Taxa Adm + Taxa de Contrato no mês</CardDescription>
            </div>
            <input
              type="month"
              value={rankingMes}
              onChange={e => setRankingMes(e.target.value)}
              className="h-7 min-w-0 rounded-md border px-1.5 text-[11px]"
              aria-label="Mês do ranking de proprietários"
            />
          </CardHeader>
          <CardContent className="min-h-0 px-2 py-2">
            {rankingProprietarios.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nenhum proprietário com lucro em {formatMonthKeyShort(rankingMes)}.
              </p>
            ) : (
              <div className="flex max-h-[190px] flex-col gap-1 overflow-y-auto pr-1">
                {rankingProprietarios.map((proprietario, index) => (
                  <div key={proprietario.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-muted/50">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant={index === 0 ? 'default' : 'secondary'} className="h-5 w-5 shrink-0 justify-center rounded-full p-0 text-[10px]">
                        {index === 0 ? <Trophy className="size-3" /> : `#${index + 1}`}
                      </Badge>
                      <p className="truncate text-xs font-medium">{proprietario.nome}</p>
                    </div>
                    <strong className="shrink-0 text-xs text-emerald-700">{fmtMoney(proprietario.total)}</strong>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-3">
        <CardHeader className="flex w-full flex-row items-center justify-between gap-3 border-b py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <CardTitle className="shrink-0 text-sm">Inadimplência por Período</CardTitle>
            <CardDescription className="truncate text-xs text-muted-foreground">
              Navegue por ano e filtre por mês para ver valores e recuperação.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => abrirRelatorioModal('periodo')}>
              <FileText className="size-3.5" /> Gerar Relatório
            </Button>
            <Button variant="outline" size="icon" className="size-7" onClick={() => handleYearChange(-1)} aria-label="Ano anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <Badge variant="secondary" className="h-7 min-w-12 justify-center text-xs">{selectedYear}</Badge>
            <Button variant="outline" size="icon" className="size-7" onClick={() => handleYearChange(1)} aria-label="Próximo ano">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-2 border-b px-2 py-2">
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
        <CardContent className="p-2">
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-[0.5fr_0.8fr_300px]">
            <div className="flex min-w-0 flex-col border bg-card p-2">
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
                    stroke={RECOVERY_COLORS.reprovado}
                    strokeWidth="24"
                    strokeDasharray={`${(pie.reprovadoPercent / 100) * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE - (pie.reprovadoPercent / 100) * DONUT_CIRCUMFERENCE}`}
                    strokeDashoffset="0"
                    transform={`rotate(${90 + ((pie.recoveredPercent + pie.approvedPercent) / 100) * 360} 60 60)`}
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
                    transform={`rotate(${90 + ((pie.recoveredPercent + pie.approvedPercent + pie.reprovadoPercent) / 100) * 360} 60 60)`}
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
                    transform={`rotate(${90 + ((pie.recoveredPercent + pie.approvedPercent + pie.reprovadoPercent + pie.waitingPercent) / 100) * 360} 60 60)`}
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
                    transform={`rotate(${90 + ((pie.recoveredPercent + pie.approvedPercent + pie.reprovadoPercent + pie.waitingPercent + pie.juridicoPercent) / 100) * 360} 60 60)`}
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
                          <span
                            className="shrink-0"
                            style={{ width: 8, height: 8, borderRadius: '9999px', display: 'inline-block', background: RECOVERY_COLORS.reprovado }}
                          ></span>
                          <span className="truncate">Pagamento reprovado</span>
                        </span>
                        <span className="shrink-0 font-medium">
                          {fmtMoneyWithPercent(selectedMonthTotals.reprovado, pie.reprovadoPercent)}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-none">{renderBreakdownTooltip(categoryBreakdown.reprovado)}</TooltipContent>
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
                    selectedMonthTotals.reprovado +
                    selectedMonthTotals.aguardarAcionar +
                    selectedMonthTotals.juridico +
                    selectedMonthTotals.acionado +
                    selectedMonthTotals.inadimplente
                  )}
                </strong>
              </div>
            </div>

            <div className="flex min-w-0 flex-col border bg-card p-2">
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
                {monthCards.map(card => {
                  const totalCard = card.inadimplente + card.recuperado + card.aprovadoSeguradora +
                    card.aguardarAcionar + card.juridico + card.acionado + card.reprovado
                  const segmentos = [
                    { key: 'recuperado', label: 'Recuperado', valor: card.recuperado, color: RECOVERY_COLORS.recuperado },
                    { key: 'aprovadoSeguradora', label: 'Aprovado seguradora', valor: card.aprovadoSeguradora, color: RECOVERY_COLORS.aprovadoSeguradora },
                    { key: 'reprovado', label: 'Pagamento reprovado', valor: card.reprovado, color: RECOVERY_COLORS.reprovado },
                    { key: 'aguardarAcionar', label: 'Aguardar para acionar', valor: card.aguardarAcionar, color: RECOVERY_COLORS.aguardarAcionar },
                    { key: 'acionado', label: 'Acionado', valor: card.acionado, color: RECOVERY_COLORS.acionado },
                    { key: 'juridico', label: 'Jurídico', valor: card.juridico, color: RECOVERY_COLORS.juridico },
                    { key: 'inadimplente', label: 'Aberto', valor: card.inadimplente, color: '#f97316' },
                  ].filter(s => s.valor > 0)
                  return (
                    <div key={card.key} className="mc-wrapper">
                      <button
                        type="button"
                        className={`month-card compact ${card.active ? 'active' : ''}`}
                        onClick={() => handleSelectMonth(card.key)}
                      >
                        <div className="mc-top-row">
                          <span>{MONTH_LABELS[Number(card.key.slice(-2)) - 1]}</span>
                          <strong>{fmtMoney(totalCard)}</strong>
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
                                card.inadimplente + card.aprovadoSeguradora + card.reprovado +
                                card.aguardarAcionar + card.juridico + card.acionado
                              )}{' '}
                              <span className="text-muted-foreground font-normal">({card.abertoPercent}%)</span>
                            </strong>
                          </div>
                        </div>
                      </button>
                      <div className="mc-progress" title="Proporção por status">
                        {segmentos.map(s => (
                          <div
                            key={s.key}
                            style={{ height: `${(s.valor / totalCard) * 100}%`, background: s.color }}
                            title={`${s.label}: ${fmtMoney(s.valor)}`}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-col border bg-card p-2">
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
                    <div key={item.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
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

      <Card className="mb-3">
        <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-2 border-b py-2">
          <div>
            <CardTitle className="text-sm">Percentual de Inquilinos Inadimplentes</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Comparação entre inquilinos inadimplentes e o total de inquilinos em {selectedPeriodLabel.toLowerCase()}.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <label className="sr-only" htmlFor="percentual-ano">Ano de referência</label>
            <input
              id="percentual-ano"
              type="number"
              value={selectedYear}
              onChange={e => {
                const year = e.target.value
                setSelectedYear(year)
                if (selectedMonth) setSelectedMonth(`${year}-${selectedMonth.slice(-2)}`)
              }}
              className="h-7 w-20 rounded-md border px-1.5 text-xs"
              aria-label="Ano de referência"
            />
            <label className="sr-only" htmlFor="percentual-mes">Mês de referência</label>
            <select
              id="percentual-mes"
              value={periodMode === 'month' ? selectedMonth || '' : ''}
              onChange={e => {
                if (!e.target.value) {
                  setSelectedMonth(null)
                  setPeriodMode('ano')
                  return
                }
                setSelectedMonth(e.target.value)
                setPeriodMode('month')
              }}
              className="h-7 rounded-md border px-1.5 text-xs"
              aria-label="Mês de referência"
            >
              <option value="">Todos os meses</option>
              {MONTH_FULL_LABELS.map((label, index) => {
                const monthKey = `${selectedYear}-${String(index + 1).padStart(2, '0')}`
                return <option key={monthKey} value={monthKey}>{label}</option>
              })}
            </select>
            <Badge variant="secondary" className="shrink-0 text-xs">{totalInquilinos} inquilino{totalInquilinos === 1 ? '' : 's'}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-3 xl:grid-cols-2">
          {totalInquilinos === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nenhum inquilino cadastrado para calcular o percentual.
            </p>
          ) : (
            <>
            <div className="min-w-0 rounded-md border bg-muted/10 p-2">
              <div className="mb-2">
                <h4 className="text-sm font-medium">Inadimplência em Aberto</h4>
                <p className="text-xs text-muted-foreground">Inquilinos com débitos ainda não pagos no período.</p>
              </div>
              <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[180px_1fr]">
              <div className="relative mx-auto size-40" aria-label={`Gráfico de ${percentualInquilinosInadimplentes}% de inquilinos inadimplentes`}>
                <svg viewBox="0 0 120 120" className="size-full -rotate-90">
                  <circle cx="60" cy="60" r="40" fill="none" stroke="#e2e8f0" strokeWidth="22" />
                  <circle
                    cx="60"
                    cy="60"
                    r="40"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="22"
                    strokeDasharray={`${(percentualInquilinosInadimplentes / 100) * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE - (percentualInquilinosInadimplentes / 100) * DONUT_CIRCUMFERENCE}`}
                    strokeLinecap="butt"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <strong className="text-2xl font-bold">{percentualInquilinosInadimplentes}%</strong>
                  <span className="text-[11px] text-muted-foreground">inadimplentes</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2.5 shrink-0 rounded-full bg-orange-500" />
                    Inquilinos inadimplentes
                  </span>
                  <strong>{inquilinosInadimplentesNoPeriodo} ({percentualInquilinosInadimplentes}%)</strong>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2.5 shrink-0 rounded-full bg-slate-200" />
                    Sem inadimplência no período
                  </span>
                  <strong>{totalInquilinos - inquilinosInadimplentesNoPeriodo} ({percentualInquilinosSemInadimplencia}%)</strong>
                </div>
              </div>
              </div>
            </div>
            <div className="flex min-w-0 flex-col justify-center rounded-md border bg-muted/10 p-2">
              <div className="mb-2">
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <h4 className="truncate text-sm font-medium">Histórico de Inadimplência</h4>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    Total de inquilinos: <strong className="text-foreground">{totalInquilinos}</strong>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Inquilinos com qualquer registro no período, pago ou em aberto.</p>
              </div>
              <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[180px_1fr]">
                <div className="relative mx-auto size-40" aria-label={`Gráfico de ${percentualInquilinosComRegistro}% de inquilinos com registro de inadimplência`}>
                  <svg viewBox="0 0 120 120" className="size-full -rotate-90">
                    <circle cx="60" cy="60" r="40" fill="none" stroke="#e2e8f0" strokeWidth="22" />
                    <circle
                      cx="60"
                      cy="60"
                      r="40"
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="22"
                      strokeDasharray={`${(percentualInquilinosComRegistro / 100) * DONUT_CIRCUMFERENCE} ${DONUT_CIRCUMFERENCE - (percentualInquilinosComRegistro / 100) * DONUT_CIRCUMFERENCE}`}
                      strokeLinecap="butt"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <strong className="text-2xl font-bold">{percentualInquilinosComRegistro}%</strong>
                    <span className="text-[11px] text-muted-foreground">com registro</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2.5 shrink-0 rounded-full bg-blue-600" />
                      Com registro de inadimplência
                    </span>
                    <strong>{inquilinosComRegistroNoPeriodo} ({percentualInquilinosComRegistro}%)</strong>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2.5 shrink-0 rounded-full bg-slate-200" />
                      Sem registro de inadimplência
                    </span>
                    <strong>{totalInquilinos - inquilinosComRegistroNoPeriodo} ({percentualInquilinosSemRegistro}%)</strong>
                  </div>
                </div>
              </div>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Histórico de Alterações e Histórico Seguradoras, lado a lado ── */}
      <div className="mb-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
      <Card>
        <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-2 border-b py-2">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-sm">Histórico de Alterações</CardTitle>
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
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => abrirRelatorioModal('alteracoes')}>
              <FileText className="size-3.5" /> Gerar Relatório
            </Button>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {historicoFiltrado.length} registro{historicoFiltrado.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-2">
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
                  <div key={item.id} className="group flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-xs first:pt-0 last:pb-0">
                    <div className="flex min-w-0 flex-1 basis-56 items-center gap-2.5">
                      <span
                        className="shrink-0 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: campoStyle.bg, color: campoStyle.color, border: `1px solid ${campoStyle.border}` }}
                      >
                        {item.campoLabel || (item.campo === 'seguroAcionado' ? 'Seguro Acionado' : 'Status')}
                      </span>
                      <div className="min-w-0">
                        <p className="break-words font-medium">
                          {item.inquilinoNome || 'Sem nome'}
                          {item.codigoImovel ? ` (${item.codigoImovel})` : ''}
                        </p>
                        <p className="flex flex-wrap items-center gap-1 break-words text-muted-foreground">
                          <span className="break-words">{item.valorAnteriorLabel || '—'}</span>
                          <ArrowRight className="size-3 shrink-0" />
                          <span className="break-words font-medium text-foreground">{item.valorNovoLabel || '—'}</span>
                        </p>
                        <p className="flex flex-wrap items-center gap-1 break-words text-muted-foreground">
                          <span className="break-words">Total c/ Encargos: {fmtMoney(item.valorTotal)}</span>
                          {item.valorRecebido > 0 && <span className="break-words">· Recebido: {fmtMoney(item.valorRecebido)}</span>}
                          {item.mesReferencia && <span className="break-words">· {getMonthLabel(item.mesReferencia)}</span>}
                          {item.dataSeguro && <span className="break-words">· Data Seguro: {fmtDataCurta(item.dataSeguro)}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground">{fmtDataHora(item.data)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
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

      {/* ── Histórico de Eventos da Timeline ── */}
      <Card>
        <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-2 border-b py-2">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-sm">Histórico Seguradoras</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Eventos registrados na timeline das inadimplências, mais recentes primeiro.
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <select
              value={eventosMesFiltro}
              onChange={e => setEventosMesFiltro(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value={currentMonth}>{getMonthLabel(currentMonth)}</option>
              {eventosMesesDisponiveis.filter(m => m !== currentMonth).map(m => (
                <option key={m} value={m}>{getMonthLabel(m)}</option>
              ))}
              <option value="todos">Todos os meses</option>
            </select>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => abrirRelatorioModal('seguradoras')}>
              <FileText className="size-3.5" /> Gerar Relatório
            </Button>
            <Badge variant="secondary" className="shrink-0 text-xs">
              {eventosFiltrados.length} evento{eventosFiltrados.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-2">
          {eventosFiltrados.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {eventosMesFiltro === 'todos'
                ? 'Nenhum evento registrado na timeline ainda.'
                : `Nenhum evento registrado em ${getMonthLabel(eventosMesFiltro)}.`}
            </p>
          ) : (
            <div className="flex max-h-96 flex-col divide-y overflow-y-auto">
              {eventosFiltrados.map(item => {
                const tipoStyle = EVENTO_TIPO_STYLE[item.tipo] || EVENTO_TIPO_STYLE.Outros
                return (
                  <div key={item.id} className="group flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2 text-xs first:pt-0 last:pb-0">
                    <div className="flex min-w-0 flex-1 basis-56 items-start gap-2.5">
                      <span
                        className="shrink-0 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: tipoStyle.bg, color: tipoStyle.color, border: `1px solid ${tipoStyle.border}` }}
                      >
                        {item.tipo}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {item.inquilinoNome}
                          {item.nomeImovel ? ` (${item.nomeImovel})` : ''}
                        </p>
                        {item.descricao && (
                          <p className="whitespace-pre-line break-words text-muted-foreground">{item.descricao}</p>
                        )}
                        {item.documentos?.length > 0 && (
                          <p className="break-words text-muted-foreground"><strong className="text-foreground">Documentos:</strong> {item.documentos.join(', ')}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <select
                        value={item.statusEvento}
                        onChange={e => handleStatusEventoChange(item.debitoId, item.eventoKey, e.target.value)}
                        className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px]"
                        onClick={e => e.stopPropagation()}
                      >
                        {EVENTO_STATUS_OPCOES.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <span className="text-muted-foreground">{fmtDataHora(item.criadoEm)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                        onClick={() => handleExcluirEventoTimeline(item.debitoId, item.eventoKey)}
                        aria-label="Excluir evento do histórico"
                        title="Excluir evento do histórico"
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
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-2 border-b py-2">
            <div>
              <CardTitle className="text-sm">Garantias dos Inadimplentes</CardTitle>
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
          <CardContent className="p-2">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[0.6fr_1fr]">
              <div className="flex min-w-0 flex-col items-center justify-center border bg-card p-2">
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
          <CardHeader className="flex w-full flex-col flex-wrap gap-2 border-b py-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-sm">Garantias de Todos os Inquilinos</CardTitle>
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
          <CardContent className="p-2">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[0.6fr_1fr]">
              <div className="flex min-w-0 flex-col items-center justify-center border bg-card p-2">
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

      <Card className="mb-3">
        <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-2 border-b py-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-blue-600" />
            <div>
              <CardTitle className="text-sm">Quantidade de Aluguéis por Faixa de Preço</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Distribuição dos inquilinos conforme o valor cadastrado do aluguel.
              </CardDescription>
            </div>
          </div>
          <Tabs value={faixaAluguelStatus} onValueChange={setFaixaAluguelStatus}>
            <TabsList>
              <TabsTrigger value="ativos">Ativos</TabsTrigger>
              <TabsTrigger value="inativos">Inativos</TabsTrigger>
              <TabsTrigger value="todos">Ativos + Inativos</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="p-3">
          {faixasAluguel.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nenhum inquilino com valor de aluguel cadastrado para o filtro selecionado.
            </p>
          ) : (
            <div className="flex flex-col gap-2" aria-label="Gráfico de quantidade de aluguéis por faixa de preço">
              {faixasAluguel.map(faixa => (
                <div key={faixa.inicio} className="grid grid-cols-[minmax(110px,150px)_1fr_44px] items-center gap-2 text-xs">
                  <span className="truncate text-muted-foreground" title={formatFaixaAluguel(faixa.inicio, faixa.fim)}>
                    {formatFaixaAluguel(faixa.inicio, faixa.fim)}
                  </span>
                  <div className="h-5 overflow-hidden rounded-sm bg-muted" role="img" aria-label={`${faixa.quantidade} aluguel(is)`}>
                    <div
                      className="h-full rounded-sm bg-blue-500 transition-all"
                      style={{ width: `${(faixa.quantidade / maiorQuantidadeFaixaAluguel) * 100}%` }}
                    />
                  </div>
                  <strong className="text-right text-foreground">{faixa.quantidade}</strong>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-2 border-b py-2">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-emerald-600" />
            <div>
              <CardTitle className="text-sm">Tempo para Receber Inadimplências</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Dias corridos entre o vencimento do boleto e a data de pagamento informada na planilha.
              </CardDescription>
            </div>
          </div>
          {inadimplenciasRecebidas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">
                Média: {mediaDiasAtePagamento.toFixed(1).replace('.', ',')} dias
              </Badge>
              <Badge variant="secondary">
                Maior prazo: {maiorDiasAtePagamento} dias
              </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-2">
          {inadimplenciasRecebidas.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nenhuma inadimplência paga com vencimento e data de pagamento informados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[620px] divide-y">
                <div className="grid grid-cols-[minmax(180px,1fr)_120px_120px_100px] gap-2 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
                  <span>Inquilino</span>
                  <span>Vencimento</span>
                  <span>Pagamento</span>
                  <span className="text-right">Tempo</span>
                </div>
                {inadimplenciasRecebidas.map(debito => (
                  <div
                    key={debito.id}
                    className="grid grid-cols-[minmax(180px,1fr)_120px_120px_100px] items-center gap-2 px-2 py-2 text-xs"
                  >
                    <span className="truncate font-medium" title={debito.inquilinoNome || 'Sem nome'}>
                      {debito.inquilinoNome || 'Sem nome'}
                    </span>
                    <span className="text-muted-foreground">{formatarDataCurta(debito.dataVencimento)}</span>
                    <span className="text-muted-foreground">{formatarDataCurta(debito.dataPagamento)}</span>
                    <strong className="text-right text-emerald-700">
                      {debito.diasAtePagamento} {debito.diasAtePagamento === 1 ? 'dia' : 'dias'}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {relatorioTipo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 380 }}>
            <h3 style={{ margin: '0 0 4px' }}>Gerar Relatório</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
              {relatorioTipo === 'alteracoes' && 'Histórico de Alterações — selecione o período (deixe em branco para incluir todos os registros).'}
              {relatorioTipo === 'seguradoras' && 'Histórico Seguradoras — selecione o período (deixe em branco para incluir todos os registros).'}
              {relatorioTipo === 'periodo' && 'Inadimplência por Período — selecione o mês ou o ano desejado.'}
            </p>
            {relatorioTipo === 'periodo' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    type="button"
                    variant={relatorioModoPeriodo === 'mes' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    onClick={() => setRelatorioModoPeriodo('mes')}
                  >
                    Mês
                  </Button>
                  <Button
                    type="button"
                    variant={relatorioModoPeriodo === 'ano' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    onClick={() => setRelatorioModoPeriodo('ano')}
                  >
                    Ano
                  </Button>
                </div>
                {relatorioModoPeriodo === 'ano' ? (
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                    Ano
                    <input
                      type="number"
                      value={relatorioAno}
                      onChange={e => setRelatorioAno(e.target.value)}
                      style={{ width: '100%', marginTop: 4, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </label>
                ) : (
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                    Mês
                    <input
                      type="month"
                      value={relatorioMes}
                      onChange={e => setRelatorioMes(e.target.value)}
                      style={{ width: '100%', marginTop: 4, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </label>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                  Data inicial
                  <input
                    type="date"
                    value={relatorioInicio}
                    onChange={e => setRelatorioInicio(e.target.value)}
                    style={{ width: '100%', marginTop: 4, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                  Data final
                  <input
                    type="date"
                    value={relatorioFim}
                    onChange={e => setRelatorioFim(e.target.value)}
                    style={{ width: '100%', marginTop: 4, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </label>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="outline" size="sm" onClick={() => setRelatorioTipo(null)}>Cancelar</Button>
              <Button size="sm" onClick={handleGerarRelatorio}>
                <FileText className="size-3.5" /> Gerar PDF
              </Button>
            </div>
          </div>
        </div>
      )}
      </div>
    </Layout>
  )
}
