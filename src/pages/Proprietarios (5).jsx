import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import dividLogo from '../assets/images/divid-logo.png'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Users, UserCheck, UserX, Plus, Upload, RotateCcw, Search, Pencil, Trash2, HandCoins, FileText, Percent, Eye, X, Trophy } from 'lucide-react'
import { normalizeText } from '@/lib/utils'

const DEFAULT_COLUMNS = [
  { key: 'nome', label: 'Nome' },
  { key: 'tipoDocumento', label: 'Tipo Doc.' },
  { key: 'cpfCnpj', label: 'CPF/CNPJ' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'email', label: 'Email' },
  { key: 'status', label: 'Status' },
  { key: 'banco', label: 'Banco' },
  { key: 'agencia', label: 'Agência' },
  { key: 'conta', label: 'Conta' },
  { key: 'tipoConta', label: 'Tipo Conta' },
  { key: 'pix', label: 'PIX' },
  { key: 'observacao', label: 'Observação' },
]

const COLUMNS_BY_KEY = Object.fromEntries(DEFAULT_COLUMNS.map(c => [c.key, c]))
const DEFAULT_COLUMN_ORDER = DEFAULT_COLUMNS.map(c => c.key).filter(k => k !== 'nome')
const COLUMN_ORDER_STORAGE_KEY = 'proprietarios_column_order_v2'

const formatMoney = value => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const formatCompetencia = value => {
  if (!value) return '—'
  const [ano, mes] = value.split('-')
  return new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
}

const loadImage = src => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = reject
  image.src = src
})

const safeFileName = value => normalizeText(value || 'proprietario')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '')

const formatDocumento = (v, tipo = 'cpf') => {
  const value = String(v || '').replace(/\D/g, '')
  if (tipo === 'cnpj') {
    return value
      .replace(/^\d{2}/, (match) => match)
      .replace(/^ (\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .substring(0, 18)
  }
  return value
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
    .substring(0, 14)
}

const formatPhone = (v) => {
  const d = String(v || '').replace(/\D/g, '').substring(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim()
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim()
}

const loadColumnOrder = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMN_ORDER_STORAGE_KEY) || 'null')
    if (Array.isArray(saved)) {
      const filtered = saved.filter(k => COLUMNS_BY_KEY[k] && k !== 'nome')
      const missing = DEFAULT_COLUMN_ORDER.filter(k => !filtered.includes(k))
      return [...filtered, ...missing]
    }
  } catch {}
  return DEFAULT_COLUMN_ORDER
}

function EditableCell({ value, display, onSave, type = 'text', options = [], inputType = 'text', placeholder = '—', className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current.select) inputRef.current.select()
    }
  }, [editing])

  const start = () => setEditing(true)
  const commit = () => {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }
  const cancel = () => {
    setEditing(false)
    setDraft(value ?? '')
  }

  if (!editing) {
    return (
      <td className={`editable-cell ${className}`} onClick={start} title="Clique para editar">
        {display !== undefined ? display : (value || <span className="cell-empty">{placeholder}</span>)}
      </td>
    )
  }

  if (type === 'select') {
    return (
      <td className={`editable-cell editing ${className}`}>
        <select
          ref={inputRef}
          className="cell-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
          }}
        >
          <option value="">—</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
    )
  }

  return (
    <td className={`editable-cell editing ${className}`}>
      <input
        ref={inputRef}
        type={inputType}
        className="cell-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') cancel()
        }}
      />
    </td>
  )
}

export default function Proprietarios() {
  const navigate = useNavigate()
  const [proprietarios, setProprietarios] = useState([])
  const [inquilinos, setInquilinos] = useState([])
  const [contasCatalogo, setContasCatalogo] = useState([])
  const [valoresVariaveis, setValoresVariaveis] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [columnOrder, setColumnOrder] = useState(loadColumnOrder)
  const [draggingKey, setDraggingKey] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)
  const [extratoProprietario, setExtratoProprietario] = useState(null)
  const [extratoMes, setExtratoMes] = useState(() => new Date().toISOString().slice(0, 7))

  // Ranking de proprietários por Taxa Adm + Taxa Contrato
  const [rankingMes, setRankingMes] = useState(() => new Date().toISOString().slice(0, 7))
  const [showRankingModal, setShowRankingModal] = useState(false)

  useEffect(() => {
    const r = ref(db, 'proprietarios')
    const unsub = onValue(r, snap => {
      const data = snap.val()
      setProprietarios(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
      setLoading(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => onValue(ref(db, 'inquilinos'), snap => {
    const data = snap.val()
    setInquilinos(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
  }), [])

  useEffect(() => onValue(ref(db, 'contas'), snap => {
    const data = snap.val()
    setContasCatalogo(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
  }), [])

  useEffect(() => onValue(ref(db, 'valoresVariaveis'), snap => {
    setValoresVariaveis(snap.val() || {})
  }), [])

  // Extrato financeiro: para cada imóvel vinculado ao proprietário, calcula aluguel, base de
  // incidência da taxa administrativa e o repasse do mês selecionado.
  //
  // A base da taxa administrativa (baseAdministrativa) SÓ inclui os componentes marcados no
  // checkbox "Incidência da Taxa Adm" daquele imóvel (aluguel / serviços / iptu / condomínio).
  // Se nenhum item estiver marcado, a base é zero (sem fallback automático) — mesmo
  // comportamento do extrato em CadastrarProprietario.jsx.
  //
  // A taxa de contrato só é descontada no mês em que o inquilino atual entrou (dataEntrada),
  // nunca nos meses seguintes, e é calculada sobre o aluguel (não sobre a base da taxa adm).
  //
  // O repasse ao proprietário é: Base Adm. − Taxa Adm. − Taxa Contrato (quando houver), igual
  // ao extrato de CadastrarProprietario.jsx. As contas do mês são calculadas e exibidas à
  // parte (informativo), mas não entram no valor de repasse.
  const calcularExtrato = (proprietario, mes) => {
    const itens = Object.entries(proprietario?.imoveisVinculos || {}).map(([imovelId, vinculo]) => {
      const inquilino = inquilinos
        .filter(item => {
          if (item.imovelId !== imovelId) return false
          const entrada = item.dataEntrada?.slice(0, 7)
          const saida = item.dataSaida?.slice(0, 7)
          return (!entrada || mes >= entrada) && (!saida || mes <= saida)
        })
        .sort((a, b) => (b.dataEntrada || '').localeCompare(a.dataEntrada || ''))[0]

      if (!inquilino) return null

      const valoresMes = valoresVariaveis[inquilino.id]?.[mes] || {}
      const { extras = {}, _registrado = {}, _obs, ...valoresLancados } = valoresMes
      const aluguel = '_aluguel' in valoresLancados
        ? Number(valoresLancados._aluguel) || 0
        : Number(inquilino.valorAluguel) || 0

      const getValorConta = contaId => contaId in valoresLancados
        ? Number(valoresLancados[contaId]) || 0
        : Number(inquilino.contasValores?.[contaId]) || 0

      // Só considera na base da taxa adm os itens explicitamente marcados em incidenciaTaxaAdm
      // deste imóvel. Se nada estiver marcado, a base é zero (sem fallback automático).
      const incidencia = vinculo.incidenciaTaxaAdm?.length ? vinculo.incidenciaTaxaAdm : []
      const baseAdministrativa = incidencia.reduce((total, item) => {
        if (item === 'aluguel') return total + aluguel

        const termo = item === 'condominio' ? 'condom' : item === 'iptu' ? 'iptu' : 'serv'
        const contaIds = new Set([
          ...Object.keys(inquilino.contasValores || {}),
          ...Object.keys(valoresLancados).filter(key => !key.startsWith('_')),
        ])
        const valorContas = [...contaIds].reduce((soma, contaId) => {
          const nomeConta = normalizeText(contasCatalogo.find(conta => conta.id === contaId)?.nome || contaId)
          return nomeConta.includes(termo) ? soma + getValorConta(contaId) : soma
        }, 0)
        return total + valorContas
      }, 0)

      // Inclui tanto contas já configuradas no cadastro do inquilino (contasValores) quanto as
      // lançadas especificamente neste mês, para que uma conta recém-adicionada ao inquilino
      // (ex.: condomínio) reflita no extrato imediatamente, sem precisar de lançamento manual no
      // mês — mesmo comportamento do extrato em CadastrarProprietario.jsx.
      const contaIdsRegistradas = new Set([
        ...Object.keys(inquilino.contasValores || {}),
        ...Object.keys(valoresLancados).filter(key => !key.startsWith('_')),
        ...Object.keys(_registrado).filter(key => _registrado[key] && !key.startsWith('_')),
      ])
      const contasMes = [...contaIdsRegistradas].map(contaId => {
        const valor = getValorConta(contaId)
        const pagador = inquilino.contasPagador?.[contaId] || (inquilino.contasVariavel?.[contaId] ? 'imobiliaria' : 'inquilino')
        const sinal = pagador === 'imobiliaria' ? -1 : 1
        return {
          id: contaId,
          nome: contasCatalogo.find(conta => conta.id === contaId)?.nome || contaId,
          valor,
          valorLiquido: valor * sinal,
          registrado: !!_registrado[contaId],
        }
      }).filter(conta => conta.valor !== 0)

      const contasEspeciais = [
        ['_seguro', 'Seguro Fiança'],
        ['_garagem', 'Garagem'],
        ['_garantia', inquilino.garantia === 'caucao' ? 'Caução' : 'Adiantamento'],
      ].filter(([key]) => key in valoresLancados || _registrado[key])
        .map(([key, nome]) => ({
          id: key,
          nome,
          valor: Number(valoresLancados[key]) || 0,
          valorLiquido: Number(valoresLancados[key]) || 0,
          registrado: !!_registrado[key],
        }))
        .filter(conta => conta.valor !== 0)

      const contasExtras = Object.entries(extras).map(([id, extra]) => ({
        id,
        nome: extra.nome || contasCatalogo.find(conta => conta.id === extra.contaId)?.nome || 'Conta extra',
        valor: Number(extra.valor) || 0,
        valorLiquido: Number(extra.valor) || 0,
        registrado: !!extra.registrado,
      })).filter(conta => conta.valor !== 0)

      const lancamentosMes = [...contasMes, ...contasEspeciais, ...contasExtras]
      const totalContas = lancamentosMes.reduce((total, conta) => total + conta.valorLiquido, 0)

      const taxaAdministrativa = baseAdministrativa * ((Number(vinculo.taxaAdministracao) || 0) / 100)
      const primeiroAluguel = inquilino.dataEntrada?.slice(0, 7) === mes
      const taxaContrato = primeiroAluguel
        ? aluguel * ((Number(vinculo.taxaContrato) || 0) / 100)
        : 0

      return {
        imovelId,
        imovel: vinculo.nomeImovel || imovelId,
        inquilino: inquilino.nome || '—',
        aluguel,
        baseAdministrativa,
        percentualAdministrativa: Number(vinculo.taxaAdministracao) || 0,
        taxaAdministrativa,
        percentualContrato: Number(vinculo.taxaContrato) || 0,
        taxaContrato,
        primeiroAluguel,
        lancamentosMes,
        totalContas,
        repasse: baseAdministrativa - taxaAdministrativa - taxaContrato,
      }
    }).filter(Boolean)

    const totais = itens.reduce((total, item) => ({
      aluguel: total.aluguel + item.aluguel,
      taxaAdministrativa: total.taxaAdministrativa + item.taxaAdministrativa,
      taxaContrato: total.taxaContrato + item.taxaContrato,
      contas: total.contas + item.totalContas,
      repasse: total.repasse + item.repasse,
    }), { aluguel: 0, taxaAdministrativa: 0, taxaContrato: 0, contas: 0, repasse: 0 })

    return { itens, totais }
  }

  const totaisFinanceiros = useMemo(() => {
    const mesAtual = new Date().toISOString().slice(0, 7)
    return proprietarios.reduce((total, proprietario) => {
      const extrato = calcularExtrato(proprietario, mesAtual).totais
      total.taxaAdministrativa += extrato.taxaAdministrativa
      total.taxaContrato += extrato.taxaContrato
      total.repasse += extrato.repasse
      return total
    }, { repasse: 0, taxaContrato: 0, taxaAdministrativa: 0 })
  }, [proprietarios, inquilinos, contasCatalogo, valoresVariaveis])

  // Ranking dos proprietários que mais geram Taxa Adm + Taxa Contrato no mês selecionado
  const rankingProprietarios = useMemo(() => {
    return proprietarios
      .map(proprietario => {
        const totais = calcularExtrato(proprietario, rankingMes).totais
        return {
          id: proprietario.id,
          nome: proprietario.nome || 'Sem nome',
          totalTaxaAdm: totais.taxaAdministrativa,
          totalTaxaContrato: totais.taxaContrato,
          total: totais.taxaAdministrativa + totais.taxaContrato,
        }
      })
      .filter(p => p.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [proprietarios, inquilinos, contasCatalogo, valoresVariaveis, rankingMes])

  const topRankingProprietarios = rankingProprietarios.slice(0, 5)

  const extratoSelecionado = useMemo(
    () => calcularExtrato(extratoProprietario, extratoMes),
    [extratoProprietario, extratoMes, inquilinos, contasCatalogo, valoresVariaveis]
  )

  const exportarExtratoExcel = () => {
    if (!extratoProprietario) return

    const linhas = [
      ['divid.'],
      ['Divid Compartilhamento de Imóveis LTDA'],
      ['Rodovia José Carlos Daux, 4570, Sala 24 - Saco Grande'],
      ['Florianópolis - SC, CEP 88032-005'],
      ['CNPJ 33.070.390/0001-25'],
      [],
      ['DEMONSTRATIVO DO PROPRIETÁRIO'],
      ['Proprietário', extratoProprietario.nome || '—'],
      ['Competência', formatCompetencia(extratoMes)],
      [],
      ['Imóvel', 'Inquilino', 'Receita Operacional', 'Contas do Mês', 'Taxa Administrativa', 'Taxa Contrato/Serviços', 'Valor de Repasse'],
      ...extratoSelecionado.itens.map(item => [
        item.imovel,
        item.inquilino,
        item.aluguel,
        item.lancamentosMes.map(conta => `${conta.nome}: ${formatMoney(conta.valorLiquido)}`).join(' | '),
        -item.taxaAdministrativa,
        item.primeiroAluguel ? -item.taxaContrato : 0,
        item.repasse,
      ]),
      [],
      ['TOTAIS', '', extratoSelecionado.totais.aluguel, extratoSelecionado.totais.contas, -extratoSelecionado.totais.taxaAdministrativa, -extratoSelecionado.totais.taxaContrato, extratoSelecionado.totais.repasse],
      [],
      ['Observação', 'A taxa de contrato é descontada somente no primeiro aluguel do inquilino.'],
    ]

    const worksheet = XLSX.utils.aoa_to_sheet(linhas)
    worksheet['!cols'] = [
      { wch: 28 }, { wch: 28 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 24 }, { wch: 20 },
    ]
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 6 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: 6 } },
      { s: { r: 6, c: 0 }, e: { r: 6, c: 6 } },
      { s: { r: linhas.length - 1, c: 1 }, e: { r: linhas.length - 1, c: 6 } },
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Extrato')
    XLSX.writeFile(workbook, `extrato_${safeFileName(extratoProprietario.nome)}_${extratoMes}.xlsx`)
  }

  const exportarExtratoPdf = async () => {
    if (!extratoProprietario) return

    const document = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageWidth = document.internal.pageSize.getWidth()
    const pageHeight = document.internal.pageSize.getHeight()
    const margin = 12
    const contentWidth = pageWidth - margin * 2
    let y = 0

    const drawHeader = async () => {
      document.setDrawColor(25)
      document.setLineWidth(0.35)
      document.rect(5, 5, pageWidth - 10, pageHeight - 10)

      try {
        const logo = await loadImage(dividLogo)
        document.addImage(logo, 'PNG', margin, 14, 42, 7)
      } catch {
        document.setFont('helvetica', 'bold')
        document.setFontSize(25)
        document.text('divid.', margin, 21)
      }

      document.setFont('helvetica', 'normal')
      document.setFontSize(9)
      document.text('Divid Compartilhamento de Imóveis LTDA', pageWidth - margin, 16, { align: 'right' })
      document.text('Rodovia José Carlos Daux, 4570, Sala 24 - Saco Grande', pageWidth - margin, 22, { align: 'right' })
      document.text('Florianópolis - SC, CEP 88032-005', pageWidth - margin, 28, { align: 'right' })
      document.text('CNPJ 33.070.390/0001-25', pageWidth - margin, 34, { align: 'right' })

      document.setFillColor(28, 28, 28)
      document.rect(margin, 40, contentWidth, 9, 'F')
      document.setTextColor(255)
      document.setFont('helvetica', 'bold')
      document.setFontSize(12)
      document.text('Demonstrativo do proprietário', margin + 2, 46.2)
      document.setTextColor(0)

      document.setFontSize(10)
      document.text('Proprietário', margin + 2, 57)
      document.text(extratoProprietario.nome || '—', 72, 57)
      document.text('Competência', margin + 2, 64)
      document.text(formatCompetencia(extratoMes), 72, 64)
      y = 74
    }

    const ensureSpace = async height => {
      if (y + height <= pageHeight - 18) return
      document.addPage()
      await drawHeader()
    }

    const drawValueRow = (label, value, options = {}) => {
      const { bold = false, gray = false, negative = false } = options
      if (gray) {
        document.setFillColor(220)
        document.rect(margin, y - 4.5, contentWidth, 7, 'F')
      }
      document.setFont('helvetica', bold ? 'bold' : 'normal')
      document.setFontSize(10)
      document.text(label, margin + 2, y)
      document.text(negative && value ? '-R$' : 'R$', 86, y)
      document.text(value ? Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—', pageWidth - margin - 2, y, { align: 'right' })
      y += 7
    }

    const drawConsolidado = title => {
      document.setFillColor(28, 28, 28)
      document.rect(margin, y - 5, contentWidth, 8, 'F')
      document.setTextColor(255)
      document.setFont('helvetica', 'bold')
      document.setFontSize(11)
      document.text(title, margin + 2, y)
      document.setTextColor(0)
      y += 10
      drawValueRow('Total Receita Operacional', extratoSelecionado.totais.aluguel, { bold: true })
      drawValueRow('Total Taxa de Administração', extratoSelecionado.totais.taxaAdministrativa, { negative: true })
      drawValueRow('Total Taxa de Contrato/Serviços', extratoSelecionado.totais.taxaContrato, { negative: true })
      drawValueRow('Total de Contas do Mês', Math.abs(extratoSelecionado.totais.contas), { negative: extratoSelecionado.totais.contas < 0 })
      drawValueRow('Valor Total de Repasse', extratoSelecionado.totais.repasse, { bold: true, gray: true })
    }

    await drawHeader()

    const possuiMultiplosImoveis = extratoSelecionado.itens.length > 1
    if (possuiMultiplosImoveis) {
      drawConsolidado(`Consolidado geral — ${extratoSelecionado.itens.length} imóveis`)
      y += 8
      document.setFont('helvetica', 'normal')
      document.setFontSize(9)
      document.text('Esta página apresenta o total de todos os imóveis do proprietário na competência selecionada.', margin + 2, y)
      document.addPage()
      await drawHeader()
    }

    if (extratoSelecionado.itens.length === 0) {
      document.setFont('helvetica', 'normal')
      document.setFontSize(10)
      document.text('Nenhum imóvel ocupado nesta competência.', margin + 2, y)
      y += 12
    } else {
      for (const item of extratoSelecionado.itens) {
        await ensureSpace(55 + item.lancamentosMes.length * 7)
        document.setFillColor(220)
        document.rect(margin, y - 4.5, contentWidth, 7, 'F')
        document.setFont('helvetica', 'bold')
        document.setFontSize(10)
        document.text(item.imovel, margin + 2, y)
        document.text(item.inquilino, pageWidth - margin - 2, y, { align: 'right' })
        y += 8

        drawValueRow('Receita Operacional', item.aluguel, { bold: true })
        drawValueRow(`Taxa de Administração (${item.percentualAdministrativa}%)`, item.taxaAdministrativa, { negative: true })
        drawValueRow(`Taxa de Contrato/Serviços (${item.percentualContrato}%)`, item.taxaContrato, { negative: item.primeiroAluguel })
        item.lancamentosMes.forEach(conta => {
          drawValueRow(conta.nome, Math.abs(conta.valorLiquido), { negative: conta.valorLiquido < 0 })
        })
        drawValueRow('Resultado Líquido', item.repasse, { bold: true, gray: true })
        y += 4
      }
    }

    if (!possuiMultiplosImoveis) {
      await ensureSpace(44)
      drawConsolidado('Consolidado do proprietário')
    }

    await ensureSpace(25)
    document.setLineDashPattern([1, 1], 0)
    document.rect(margin, y, contentWidth, 15)
    document.setLineDashPattern([], 0)
    document.setFont('helvetica', 'normal')
    document.setFontSize(8.5)
    document.text('A taxa de administração incide sobre a base configurada para cada imóvel.', margin + 2, y + 5)
    document.text('A taxa de contrato é descontada somente no primeiro aluguel do inquilino.', margin + 2, y + 10)

    const today = new Date().toLocaleDateString('pt-BR')
    const pageCount = document.getNumberOfPages()
    for (let page = 1; page <= pageCount; page += 1) {
      document.setPage(page)
      document.setFont('helvetica', 'bold')
      document.setFontSize(9)
      document.text('Florianópolis', margin + 2, pageHeight - 11)
      document.text(today, pageWidth - margin - 2, pageHeight - 11, { align: 'right' })
      if (pageCount > 1) document.text(`${page}/${pageCount}`, pageWidth / 2, pageHeight - 11, { align: 'center' })
    }

    document.save(`extrato_${safeFileName(extratoProprietario.nome)}_${extratoMes}.pdf`)
  }

  const persistColumnOrder = (order) => {
    try { localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(order)) } catch {}
  }

  const handleDragHandlePointerDown = (key) => (e) => {
    e.preventDefault()
    setDraggingKey(key)
    setDragOverKey(key)
  }

  useEffect(() => {
    if (!draggingKey) return

    const findColKey = (clientX, clientY) => {
      const el = document.elementFromPoint(clientX, clientY)
      const th = el && el.closest ? el.closest('th[data-col-key]') : null
      return th ? th.getAttribute('data-col-key') : null
    }

    const handlePointerMove = (e) => {
      const key = findColKey(e.clientX, e.clientY)
      if (key) setDragOverKey(prev => (prev !== key ? key : prev))
    }

    const handlePointerUp = (e) => {
      const targetKey = findColKey(e.clientX, e.clientY)
      if (targetKey && targetKey !== draggingKey) {
        setColumnOrder(prev => {
          const next = [...prev]
          const fromIdx = next.indexOf(draggingKey)
          const toIdx = next.indexOf(targetKey)
          if (fromIdx === -1 || toIdx === -1) return prev
          next.splice(fromIdx, 1)
          next.splice(toIdx, 0, draggingKey)
          persistColumnOrder(next)
          return next
        })
      }
      setDraggingKey(null)
      setDragOverKey(null)
    }

    document.body.classList.add('col-dragging')
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      document.body.classList.remove('col-dragging')
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [draggingKey])

  const handleResetColumnOrder = () => {
    setColumnOrder(DEFAULT_COLUMN_ORDER)
    try { localStorage.removeItem(COLUMN_ORDER_STORAGE_KEY) } catch {}
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este proprietário?')) return
    await remove(ref(db, `proprietarios/${id}`))
  }

  const handleCampoChange = async (id, campo, valor) => {
    await update(ref(db, `proprietarios/${id}`), { [campo]: valor })
  }

  const handleTelefoneChange = async (id, valor) => {
    await update(ref(db, `proprietarios/${id}`), { telefone: formatPhone(valor) })
  }

  const handleDocumentoChange = async (id, tipo, valor) => {
    await update(ref(db, `proprietarios/${id}`), {
      tipoDocumento: tipo,
      cpfCnpj: formatDocumento(valor, tipo),
    })
  }

  const handleSelectChange = async (id, campo, valor) => {
    await update(ref(db, `proprietarios/${id}`), { [campo]: valor })
  }

  const handleExport = () => {
    const dados = filtered.map(p => ({
      Nome: p.nome || '',
      'Tipo Doc.': p.tipoDocumento === 'cnpj' ? 'CNPJ' : 'CPF',
      'CPF/CNPJ': p.cpfCnpj || p.cpf || '',
      Telefone: p.telefone || '',
      Email: p.email || '',
      Status: p.status || 'Ativo',
      Banco: p.banco || '',
      Agência: p.agencia || '',
      Conta: p.conta || '',
      'Tipo Conta': p.tipoConta || '',
      PIX: p.pix || '',
      Observação: p.observacao || '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(dados)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Proprietarios')
    const dataAtual = new Date().toISOString().split('T')[0]
    XLSX.writeFile(workbook, `proprietarios_${dataAtual}.xlsx`)
  }

  const filtered = proprietarios.filter(p =>
    p.nome?.toLowerCase().includes(search.toLowerCase()) ||
    (p.cpfCnpj || p.cpf || '')?.includes(search) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  )

  const buildRowCells = (p) => {
    const cells = {
      nome: (
        <EditableCell
          key="nome"
          value={p.nome || ''}
          display={<strong>{p.nome || '—'}</strong>}
          onSave={v => handleCampoChange(p.id, 'nome', v)}
          className="col-sticky-td"
        />
      ),
      tipoDocumento: (
        <EditableCell
          key="tipoDocumento"
          value={p.tipoDocumento || 'cpf'}
          display={p.tipoDocumento === 'cnpj' ? 'CNPJ' : 'CPF'}
          type="select"
          options={[{ value: 'cpf', label: 'CPF' }, { value: 'cnpj', label: 'CNPJ' }]}
          onSave={v => handleDocumentoChange(p.id, v || 'cpf', p.cpfCnpj || '')}
        />
      ),
      cpfCnpj: (
        <EditableCell
          key="cpfCnpj"
          value={p.cpfCnpj || p.cpf || ''}
          onSave={v => handleDocumentoChange(p.id, p.tipoDocumento || 'cpf', v)}
        />
      ),
      telefone: (
        <EditableCell
          key="telefone"
          value={p.telefone || ''}
          onSave={v => handleTelefoneChange(p.id, v)}
        />
      ),
      email: (
        <EditableCell
          key="email"
          value={p.email || ''}
          onSave={v => handleCampoChange(p.id, 'email', v)}
        />
      ),
      status: (
        <td key="status">
          <select
            className={`badge-select ${p.status === 'Ativo' ? 'badge-green' : 'badge-gray'}`}
            value={p.status || 'Ativo'}
            onClick={e => e.stopPropagation()}
            onChange={e => handleSelectChange(p.id, 'status', e.target.value)}
          >
            <option value="Ativo">Ativo</option>
            <option value="Inativo">Inativo</option>
          </select>
        </td>
      ),
      banco: (
        <EditableCell
          key="banco"
          value={p.banco || ''}
          onSave={v => handleCampoChange(p.id, 'banco', v)}
        />
      ),
      agencia: (
        <EditableCell
          key="agencia"
          value={p.agencia || ''}
          onSave={v => handleCampoChange(p.id, 'agencia', v)}
        />
      ),
      conta: (
        <EditableCell
          key="conta"
          value={p.conta || ''}
          onSave={v => handleCampoChange(p.id, 'conta', v)}
        />
      ),
      tipoConta: (
        <EditableCell
          key="tipoConta"
          value={p.tipoConta || ''}
          display={p.tipoConta || '—'}
          type="select"
          options={[{ value: 'Corrente', label: 'Corrente' }, { value: 'Poupança', label: 'Poupança' }, { value: 'Salário', label: 'Salário' }]}
          onSave={v => handleCampoChange(p.id, 'tipoConta', v)}
        />
      ),
      pix: (
        <EditableCell
          key="pix"
          value={p.pix || ''}
          onSave={v => handleCampoChange(p.id, 'pix', v)}
        />
      ),
      observacao: (
        <EditableCell
          key="observacao"
          value={p.observacao || ''}
          display={<span className="table-cell-wrap">{p.observacao || '—'}</span>}
          onSave={v => handleCampoChange(p.id, 'observacao', v)}
        />
      )
    }

    return cells
  }

  return (
    <Layout title="Proprietários" subtitle="Gestão de proprietários de imóveis">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button onClick={() => navigate('/proprietarios/cadastrar')}>
          <Plus /> Cadastrar Proprietário
        </Button>
        <Button variant="outline" onClick={handleExport}>
          <Upload /> Exportar Planilha
        </Button>
        <Button variant="outline" onClick={handleResetColumnOrder} title="Restaura a ordem original das colunas">
          <RotateCcw /> Restaurar Ordem das Colunas
        </Button>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por nome, CPF/CNPJ ou email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <Users className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{proprietarios.length}</p>
              <p className="truncate text-sm text-muted-foreground">Total de Proprietários</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <UserCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{proprietarios.filter(p => p.status === 'Ativo').length}</p>
              <p className="truncate text-sm text-muted-foreground">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600">
              <UserX className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{proprietarios.filter(p => p.status === 'Inativo').length}</p>
              <p className="truncate text-sm text-muted-foreground">Inativos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <HandCoins className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{formatMoney(totaisFinanceiros.repasse)}</p>
              <p className="truncate text-sm text-muted-foreground">Total de Repasse (mês atual)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{formatMoney(totaisFinanceiros.taxaContrato)}</p>
              <p className="truncate text-sm text-muted-foreground">Total Taxa de Contrato (mês atual)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600">
              <Percent className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{formatMoney(totaisFinanceiros.taxaAdministrativa)}</p>
              <p className="truncate text-sm text-muted-foreground">Total Taxa Administrativa (mês atual)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Top Proprietários por Taxa Adm + Taxa Contrato ── */}
      <Card className="mb-6">
        <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <CardTitle className="text-lg">Top Proprietários por Taxa Adm + Taxa Contrato</CardTitle>
            <CardDescription>Quem mais gera receita de taxas administrativas e de contrato no mês.</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Input
              type="month"
              value={rankingMes}
              onChange={e => setRankingMes(e.target.value)}
              className="h-9 w-auto"
            />
            {rankingProprietarios.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowRankingModal(true)}>
                Ver ranking completo
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {rankingProprietarios.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum proprietário com Taxa Adm ou Taxa Contrato em {formatCompetencia(rankingMes)}.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {topRankingProprietarios.map((p, index) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Badge variant={index === 0 ? 'default' : 'secondary'} className="h-6 w-6 justify-center rounded-full p-0">
                      {index === 0 ? <Trophy className="size-3.5" /> : `#${index + 1}`}
                    </Badge>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        Adm: {formatMoney(p.totalTaxaAdm)} · Contrato: {formatMoney(p.totalTaxaContrato)}
                      </p>
                    </div>
                  </div>
                  <strong className="shrink-0 text-sm text-emerald-700">{formatMoney(p.total)}</strong>
                </div>
              ))}

              {rankingProprietarios.length > topRankingProprietarios.length && (
                <button
                  type="button"
                  className="link-btn"
                  style={{ alignSelf: 'flex-start', fontSize: 12, marginTop: 4 }}
                  onClick={() => setShowRankingModal(true)}
                >
                  Ver todos os {rankingProprietarios.length} proprietários →
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-lg">Todos os Proprietários ({filtered.length})</CardTitle>
          <CardDescription>Clique em qualquer célula para editar · arraste o cabeçalho para reordenar colunas</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
        <div className="table-container table-scroll-x inquilinos-scroll-area">
          {loading ? (
            <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
          ) : (
            <table className="inquilinos-table proprietarios-table">
              <thead>
                <tr>
                  <th className="col-sticky-th">{COLUMNS_BY_KEY.nome.label}</th>
                  {columnOrder.map(key => (
                    <th
                      key={key}
                      data-col-key={key}
                      className={`th-draggable ${draggingKey === key ? 'th-dragging' : ''} ${dragOverKey === key && draggingKey && draggingKey !== key ? 'th-drag-over' : ''}`}
                    >
                      <span
                        className="th-drag-handle"
                        onPointerDown={handleDragHandlePointerDown(key)}
                        title="Arraste para reordenar a coluna"
                      >⠿</span>
                      {COLUMNS_BY_KEY[key].label}
                    </th>
                  ))}
                  <th className="col-actions-sticky">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={columnOrder.length + 2}>
                      <div className="empty-state">
                        <div className="es-icon">👥</div>
                        <h3>Nenhum proprietário encontrado</h3>
                        <p>Cadastre um novo proprietário para começar.</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(p => {
                  const cells = buildRowCells(p)
                  return (
                    <tr key={p.id}>
                      {cells.nome}
                      {columnOrder.map(key => cells[key])}
                      <td className="col-actions-sticky">
                        <div className="flex gap-1.5">
                          <Button variant="outline" size="icon-sm" onClick={() => setExtratoProprietario(p)} title="Visualizar extrato mensal" aria-label="Visualizar extrato mensal">
                            <Eye />
                          </Button>
                          <Button variant="outline" size="icon-sm" onClick={() => navigate(`/proprietarios/editar/${p.id}`)} title="Editar proprietário" aria-label="Editar proprietário">
                            <Pencil />
                          </Button>
                          <Button variant="destructive" size="icon-sm" onClick={() => handleDelete(p.id)} title="Excluir proprietário" aria-label="Excluir proprietário">
                            <Trash2 />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        </CardContent>
      </Card>

      {extratoProprietario && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="extrato-proprietario-titulo"
          onMouseDown={e => e.target === e.currentTarget && setExtratoProprietario(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15, 23, 42, 0.55)' }}
        >
          <div style={{ width: 'min(1400px, 96vw)', maxHeight: '90vh', overflow: 'auto', borderRadius: 8, background: '#fff', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
              <div style={{ minWidth: 0 }}>
                <h2 id="extrato-proprietario-titulo" style={{ margin: 0, fontSize: 18 }}>Extrato de {extratoProprietario.nome}</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>Contabilidade mensal dos imóveis vinculados</p>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <label htmlFor="mesExtratoProprietario" style={{ fontSize: 12, fontWeight: 600 }}>Mês</label>
                <Input
                  id="mesExtratoProprietario"
                  type="month"
                  value={extratoMes}
                  onChange={e => setExtratoMes(e.target.value)}
                  className="h-9 w-auto"
                />
                <Button variant="outline" size="sm" onClick={exportarExtratoExcel} title="Exportar extrato em Excel">
                  <FileText /> Excel
                </Button>
                <Button variant="outline" size="sm" onClick={exportarExtratoPdf} title="Exportar extrato em PDF">
                  <FileText /> PDF
                </Button>
                <Button variant="outline" size="icon" onClick={() => setExtratoProprietario(null)} title="Fechar extrato">
                  <X />
                </Button>
              </div>
            </div>

            <div style={{ padding: 18 }}>
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Aluguéis</p><strong>{formatMoney(extratoSelecionado.totais.aluguel)}</strong></div>
                <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Taxa Administrativa</p><strong className="text-red-700">{formatMoney(extratoSelecionado.totais.taxaAdministrativa)}</strong></div>
                <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Taxa de Contrato</p><strong className="text-red-700">{formatMoney(extratoSelecionado.totais.taxaContrato)}</strong></div>
                <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Contas do Mês</p><strong>{formatMoney(extratoSelecionado.totais.contas)}</strong></div>
                <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Repasse</p><strong className="text-emerald-700">{formatMoney(extratoSelecionado.totais.repasse)}</strong></div>
              </div>

              <div className="table-container">
                <table className="inquilinos-table" style={{ width: '100%', minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th>Imóvel</th>
                      <th>Inquilino</th>
                      <th>Aluguel</th>
                      <th>Base Adm.</th>
                      <th>Taxa Adm.</th>
                      <th>Taxa Contrato</th>
                      <th>Contas do Mês</th>
                      <th>Repasse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extratoSelecionado.itens.length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 28 }}>Nenhum imóvel ocupado neste mês.</td></tr>
                    ) : extratoSelecionado.itens.map(item => (
                      <tr key={item.imovelId}>
                        <td><strong>{item.imovel}</strong></td>
                        <td>{item.inquilino}</td>
                        <td>{formatMoney(item.aluguel)}</td>
                        <td>{formatMoney(item.baseAdministrativa)}</td>
                        <td>{formatMoney(item.taxaAdministrativa)} <span className="text-muted-foreground">({item.percentualAdministrativa}%)</span></td>
                        <td>{item.primeiroAluguel ? <>{formatMoney(item.taxaContrato)} <span className="text-muted-foreground">({item.percentualContrato}%)</span></> : '—'}</td>
                        <td>
                          {item.lancamentosMes.length === 0 ? '—' : item.lancamentosMes.map(conta => (
                            <div key={conta.id} style={{ whiteSpace: 'normal' }}>
                              {conta.nome}: <strong style={{ color: conta.valorLiquido < 0 ? '#b91c1c' : '#166534' }}>{formatMoney(conta.valorLiquido)}</strong>
                            </div>
                          ))}
                        </td>
                        <td><strong className="text-emerald-700">{formatMoney(item.repasse)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>A taxa de contrato é descontada somente no mês de entrada do inquilino, correspondente ao primeiro aluguel.</p>
            </div>
          </div>
        </div>
      )}

      {showRankingModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ranking-proprietarios-titulo"
          onMouseDown={e => e.target === e.currentTarget && setShowRankingModal(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15, 23, 42, 0.55)' }}
        >
          <div style={{ width: 'min(560px, 96vw)', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRadius: 8, background: '#fff', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 id="ranking-proprietarios-titulo" style={{ margin: 0, fontSize: 16 }}>Ranking de Taxa Adm + Taxa Contrato</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{formatCompetencia(rankingMes)}</p>
              </div>
              <Button variant="outline" size="icon" onClick={() => setShowRankingModal(false)} title="Fechar ranking">
                <X />
              </Button>
            </div>

            <div style={{ overflowY: 'auto', padding: '12px 18px 18px' }}>
              {rankingProprietarios.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum proprietário com Taxa Adm ou Taxa Contrato neste mês.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {rankingProprietarios.map((p, index) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-2"
                      style={{ background: index < 3 ? '#f0fdf4' : 'transparent' }}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Badge variant={index === 0 ? 'default' : 'secondary'} className="h-6 w-6 justify-center rounded-full p-0">
                          {index === 0 ? <Trophy className="size-3.5" /> : `#${index + 1}`}
                        </Badge>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            Adm: {formatMoney(p.totalTaxaAdm)} · Contrato: {formatMoney(p.totalTaxaContrato)}
                          </p>
                        </div>
                      </div>
                      <strong className="shrink-0 text-sm text-emerald-700">{formatMoney(p.total)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
