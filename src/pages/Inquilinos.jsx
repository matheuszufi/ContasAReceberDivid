import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove, update, get } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import * as XLSX from 'xlsx'

const modeloBadge = { MA: 'badge-green', ME: 'badge-blue', ML: 'badge-yellow' }

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const CONTAS_OPCOES = [
  { value: 'agua',            label: 'Água' },
  { value: 'energia',         label: 'Energia' },
  { value: 'condominio',      label: 'Condomínio' },
  { value: 'gas',             label: 'Gás' },
  { value: 'iptu',            label: 'IPTU' },
  { value: 'lixo',            label: 'Lixo' },
  { value: 'seguro_incendio', label: 'Seguro Incêndio' },
  { value: 'fundo_reserva',   label: 'Fundo de Reserva' },
]

const CONTA_LABELS = Object.fromEntries(CONTAS_OPCOES.map(o => [o.value, o.label]))

const METODO_PAGAMENTO_OPCOES = [
  { value: 'pre_pago', label: 'Pré-pago' },
  { value: 'pos_pago', label: 'Pós-pago' },
]

const GARANTIA_OPCOES = [
  { value: 'seguro',       label: 'Seguro' },
  { value: 'caucao',       label: 'Caução' },
  { value: 'adiantamento', label: 'Adiantamento' },
  { value: 'sem_garantia', label: 'Sem Garantia' },
]

const SEGURO_OPCOES = [
  { value: 'credaluga', label: 'Credaluga' },
  { value: 'credpago',  label: 'Credpago' },
  { value: 'lado_bom',  label: 'Lado Bom Seguros' },
  { value: 'Avalyst',   label: 'Avalyst' },
]

// Definição das colunas reordenáveis da planilha. A coluna "Ações" fica sempre fixa no final.
// A coluna "Nome" fica sempre travada à esquerda e fora do conjunto reordenável;
// as demais colunas (mais "Ações", travada à direita) podem ser arrastadas livremente.
const DEFAULT_COLUMNS = [
  { key: 'nome',            label: 'Nome' },
  { key: 'locatario',       label: 'Locatário' },
  { key: 'status',          label: 'Status' },
  { key: 'email',           label: 'Email' },
  { key: 'cpf',             label: 'CPF' },
  { key: 'telefone',        label: 'Telefone' },
  { key: 'imovel',          label: 'Imóvel' },
  { key: 'modelo',          label: 'Modelo' },
  { key: 'quarto',          label: 'Quarto' },
  { key: 'codigoContrato',  label: 'Cód. Contrato' },
  { key: 'dataEntrada',     label: 'Data Entrada' },
  { key: 'dataSaida',       label: 'Data Saída' },
  { key: 'metodoPagamento', label: 'Método Pgto.' },
  ...CONTAS_OPCOES.map(o => ({ key: `conta_${o.value}`, label: o.label })),
  { key: 'valorAluguel', label: 'Valor Aluguel' },
  { key: 'vagas',        label: 'Vagas' },
  { key: 'valorVaga',    label: 'Valor Vaga' },
  { key: 'garantia',     label: 'Garantia' },
  { key: 'seguro',       label: 'Seguradora' },
  { key: 'valorSeguro',  label: 'Valor Seguro' },
  { key: 'observacao',   label: 'Observação' },
]

const COLUMNS_BY_KEY = Object.fromEntries(DEFAULT_COLUMNS.map(c => [c.key, c]))
// Ordem reordenável = todas as colunas, exceto "nome" (fixa à esquerda) e "acoes" (fixa à direita, nem faz parte de DEFAULT_COLUMNS)
const DEFAULT_COLUMN_ORDER = DEFAULT_COLUMNS.map(c => c.key).filter(k => k !== 'nome')
const COLUMN_ORDER_STORAGE_KEY = 'inquilinos_column_order_v2'

const formatCPF = (v) =>
  v.replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    .substring(0, 14)

const formatPhone = (v) => {
  const d = v.replace(/\D/g, '').substring(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim()
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim()
}

// Monta o link do WhatsApp a partir do telefone, assumindo DDI 55 quando ausente
const whatsappLink = (telefone) => {
  const digits = String(telefone || '').replace(/\D/g, '')
  if (!digits) return null
  const withCountry = digits.length <= 11 ? `55${digits}` : digits
  return `https://wa.me/${withCountry}`
}

// Lê a ordem de colunas salva no navegador, filtrando chaves inválidas ou a coluna
// fixa "nome" (que nunca faz parte do conjunto reordenável), e acrescentando ao
// final qualquer coluna nova que ainda não estava salva.
const loadColumnOrder = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMN_ORDER_STORAGE_KEY) || 'null')
    if (Array.isArray(saved)) {
      const filtered = saved.filter(k => COLUMNS_BY_KEY[k] && k !== 'nome')
      const missing = DEFAULT_COLUMN_ORDER.filter(k => !filtered.includes(k))
      return [...filtered, ...missing]
    }
  } catch {
    // ignora localStorage inválido e cai no padrão
  }
  return DEFAULT_COLUMN_ORDER
}

// Célula genérica: exibe o valor; ao clicar, vira input/select/date/number editável
function EditableCell({ value, display, onSave, type = 'text', inputType = 'text', options = [], placeholder = '—', width, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current.select) inputRef.current.select()
    }
  }, [editing])

  const start = () => {
    setDraft(value ?? '')
    setEditing(true)
  }

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
      <td className={`editable-cell ${className}`} onClick={start} title="Clique para editar" style={width ? { minWidth: width } : undefined}>
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
        step={inputType === 'number' ? '0.01' : undefined}
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

// Igual à EditableCell, mas sem o wrapper <td> — usada dentro de células que já têm outro conteúdo (ex.: checkbox + valor)
function EditableValue({ value, display, onSave, inputType = 'text', placeholder = '—' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current.select) inputRef.current.select()
    }
  }, [editing])

  const start = (e) => {
    e.stopPropagation()
    setDraft(value ?? '')
    setEditing(true)
  }

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
      <span className="editable-value" onClick={start} title="Clique para editar">
        {display !== undefined ? display : (value || <span className="cell-empty">{placeholder}</span>)}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      type={inputType}
      step={inputType === 'number' ? '0.01' : undefined}
      className="cell-input"
      value={draft}
      onClick={e => e.stopPropagation()}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') cancel()
      }}
    />
  )
}

export default function Inquilinos() {
  const navigate = useNavigate()
  const [inquilinos, setInquilinos] = useState([])
  const [imoveis, setImoveis] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [desocModal, setDesocModal] = useState(null)
  const [desocDate, setDesocDate] = useState('')
  const [desocValues, setDesocValues] = useState({})
  const [desocExtras, setDesocExtras] = useState([])
  const [desocSaving, setDesocSaving] = useState(false)

  // Ordem das colunas da planilha (arrastável) — persistida no navegador do usuário
  const [columnOrder, setColumnOrder] = useState(loadColumnOrder)
  const [draggingKey, setDraggingKey] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)

  useEffect(() => {
    const inquilinosRef = ref(db, 'inquilinos')
    const unsubscribe = onValue(inquilinosRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const list = Object.entries(data).map(([id, val]) => ({ id, ...val }))
        setInquilinos(list)
      } else {
        setInquilinos([])
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    return onValue(ref(db, 'imoveis'), snap => {
      const data = snap.val()
      setImoveis(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
  }, [])

  const imoveisById = Object.fromEntries(imoveis.map(im => [im.id, im]))

  // ---------- Reordenação de colunas (arrastar para a coluna desejada) ----------
  // Usa Pointer Events (em vez do drag-and-drop nativo do HTML, que costuma falhar
  // dentro de <th> em vários navegadores) para funcionar de forma confiável com
  // mouse ou toque: pressiona no "⠿", arrasta até a coluna alvo e solta.
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

  const getDefaultDesocValues = (inq) => {
    const vals = {}
    if (inq.valorAluguel !== undefined && inq.valorAluguel !== '')
      vals._aluguel = String(inq.valorAluguel)
    ;(inq.contasInclusas || []).forEach(k => {
      if (!inq.contasVariavel?.[k] && inq.contasValores?.[k] !== undefined)
        vals[k] = String(inq.contasValores[k])
    })
    if (inq.garantia === 'seguro' && inq.valorSeguro)
      vals._seguro = String(inq.valorSeguro)
    const garagemVal = (Number(inq.vagas) || 0) * (Number(inq.valorVaga) || 0)
    if (garagemVal > 0) vals._garagem = String(garagemVal)
    return vals
  }

  const loadDesocData = (inq, monthKey) => {
    const defaults = getDefaultDesocValues(inq)
    get(ref(db, `valoresVariaveis/${inq.id}/${monthKey}`)).then(snap => {
      if (snap.exists()) {
        const { extras, _obs, ...savedVals } = snap.val()
        const savedStr = Object.fromEntries(Object.entries(savedVals).map(([k, v]) => [k, String(v)]))
        setDesocValues({ ...defaults, ...savedStr })
        setDesocExtras(extras
          ? Object.entries(extras).map(([id, v]) => ({ id, nome: v.nome, valor: String(v.valor) }))
          : [])
      } else {
        setDesocValues(defaults)
        setDesocExtras([])
      }
    })
  }

  const closeDesocModal = () => {
    setDesocModal(null)
    setDesocDate('')
    setDesocValues({})
    setDesocExtras([])
  }

  const openDesocModal = (inq) => {
    const defaults = getDefaultDesocValues(inq)
    setDesocModal(inq)
    setDesocDate(inq.dataSaida || '')
    setDesocValues(defaults)
    setDesocExtras([])
    if (inq.dataSaida) loadDesocData(inq, inq.dataSaida.substring(0, 7))
  }

  const handleDesocDateChange = (date) => {
    setDesocDate(date)
    if (date && desocModal) {
      loadDesocData(desocModal, date.substring(0, 7))
    } else if (desocModal) {
      setDesocValues(getDefaultDesocValues(desocModal))
      setDesocExtras([])
    }
  }

  const handleDesocAddExtra = () => {
    setDesocExtras(prev => [...prev, { id: null, nome: '', valor: '' }])
  }

  const handleDesocExtraChange = (idx, field, value) => {
    setDesocExtras(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  const handleDesocRemoveExtra = (idx) => {
    setDesocExtras(prev => prev.filter((_, i) => i !== idx))
  }

  const handleDesocSave = async () => {
    if (!desocModal || !desocDate || desocSaving) return
    setDesocSaving(true)
    try {
      await update(ref(db, `inquilinos/${desocModal.id}`), { dataSaida: desocDate, desocupacaoRegistrada: true })
      const monthKey = desocDate.substring(0, 7)
      const toSave = {}
      Object.entries(desocValues).forEach(([k, v]) => {
        const n = parseFloat(v)
        if (!isNaN(n)) toSave[k] = n
      })
      const extrasObj = {}
      desocExtras.forEach((e, i) => {
        const n = parseFloat(e.valor)
        if (e.nome.trim() && !isNaN(n)) {
          extrasObj[e.id || `extra_${i}`] = { nome: e.nome.trim(), valor: n }
        }
      })
      if (Object.keys(extrasObj).length > 0) toSave.extras = extrasObj
      if (Object.keys(toSave).length > 0) {
        await update(ref(db, `valoresVariaveis/${desocModal.id}/${monthKey}`), toSave)
      }
      closeDesocModal()
    } finally {
      setDesocSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este inquilino?')) return
    await remove(ref(db, `inquilinos/${id}`))
  }

  const handleStatusChange = async (id, status) => {
    await update(ref(db, `inquilinos/${id}`), { status })
  }

  // Atualização genérica de um campo simples (texto) do inquilino
  const handleCampoChange = async (id, campo, valor) => {
    await update(ref(db, `inquilinos/${id}`), { [campo]: valor })
  }

  const handleCpfChange = async (id, valor) => {
    await update(ref(db, `inquilinos/${id}`), { cpf: formatCPF(valor) })
  }

  const handleTelefoneChange = async (id, valor) => {
    await update(ref(db, `inquilinos/${id}`), { telefone: formatPhone(valor) })
  }

  const handleNumeroChange = async (id, campo, valor, isInt = false) => {
    const n = isInt ? parseInt(valor, 10) : parseFloat(valor)
    await update(ref(db, `inquilinos/${id}`), { [campo]: isNaN(n) ? 0 : n })
  }

  // Marca/desmarca se uma conta está inclusa no aluguel, direto na planilha.
  // Ao desmarcar, limpa os dados auxiliares dessa conta (valor, variável, origem, pagador, cobrar no boleto).
  const handleToggleConta = async (inq, key) => {
    const contasInclusas = inq.contasInclusas || []
    const isActive = contasInclusas.includes(key)
    const novaLista = isActive ? contasInclusas.filter(k => k !== key) : [...contasInclusas, key]
    const updates = { contasInclusas: novaLista }
    if (isActive) {
      updates[`contasValores/${key}`]       = null
      updates[`contasVariavel/${key}`]      = null
      updates[`contasOrigem/${key}`]        = null
      updates[`contasPagador/${key}`]       = null
    }
    await update(ref(db, `inquilinos/${inq.id}`), updates)
  }

  // Edita o valor de uma conta inclusa (não variável) direto na planilha
  const handleContaValorChange = async (inq, key, valor) => {
    const n = parseFloat(valor)
    await update(ref(db, `inquilinos/${inq.id}/contasValores`), { [key]: isNaN(n) ? 0 : n })
  }

  // Marca/desmarca se a conta é variável, direto na planilha.
  // Ao marcar como variável, limpa o valor fixo, já que passa a ser lançado manualmente todo mês.
  const handleToggleContaVariavel = async (inq, key) => {
    const novo = !inq.contasVariavel?.[key]
    const updates = { [`contasVariavel/${key}`]: novo }
    if (novo) updates[`contasValores/${key}`] = null
    await update(ref(db, `inquilinos/${inq.id}`), updates)
  }

  // Marca/desmarca quem paga a conta: "cobrar no boleto" = o inquilino paga (contasPagador = 'inquilino');
  // desmarcado = a imobiliária paga (contasPagador = 'imobiliaria'). Mesmo campo usado no cadastro do inquilino.
  const handleToggleContaPagador = async (inq, key, variavel) => {
    const atual = inq.contasPagador?.[key] || (variavel ? 'imobiliaria' : 'inquilino')
    const novo = atual === 'inquilino' ? 'imobiliaria' : 'inquilino'
    await update(ref(db, `inquilinos/${inq.id}/contasPagador`), { [key]: novo })
  }

  // Troca de imóvel direto na planilha: atualiza vínculo e status Ocupado/Disponível dos imóveis envolvidos
  const handleImovelChange = async (inq, novoImovelId) => {
    const novoImovel = imoveis.find(im => im.id === novoImovelId)
    await update(ref(db, `inquilinos/${inq.id}`), {
      imovelId: novoImovelId,
      codigoImovel: novoImovel?.codigo || '',
    })
    if (inq.imovelId && inq.imovelId !== novoImovelId) {
      await update(ref(db, `imoveis/${inq.imovelId}`), { status: 'Disponível' })
    }
    if (novoImovelId) {
      await update(ref(db, `imoveis/${novoImovelId}`), { status: 'Ocupado' })
    }
  }

  // Exporta os inquilinos filtrados (respeita a busca ativa) para uma planilha .xlsx
  const handleExport = () => {
    const dados = filtered.map(inq => ({
      'Nome': inq.nome || '',
      'Locatário': inq.locatario || '',
      'Status': inq.status || 'Ativo',
      'Email': inq.email || '',
      'CPF': inq.cpf || '',
      'Telefone': inq.telefone || '',
      'Imóvel': imoveisById[inq.imovelId]?.codigo || inq.codigoImovel || '',
      'Modelo': imoveisById[inq.imovelId]?.modelo || '',
      'Quarto': inq.numeroQuarto || '',
      'Código Contrato': inq.codigoContrato || '',
      'Data Entrada': inq.dataEntrada || '',
      'Data Saída': inq.dataSaida || '',
      'Método Pagamento': METODO_PAGAMENTO_OPCOES.find(o => o.value === inq.metodoPagamento)?.label || '',
      ...Object.fromEntries(CONTAS_OPCOES.map(opt => {
        const incluida = (inq.contasInclusas || []).includes(opt.value)
        const variavel = !!inq.contasVariavel?.[opt.value]
        const valor = inq.contasValores?.[opt.value]
        const pagador = inq.contasPagador?.[opt.value] || (variavel ? 'imobiliaria' : 'inquilino')
        let texto = 'Não'
        if (incluida) {
          texto = variavel ? 'Sim (variável)' : `Sim — R$ ${Number(valor || 0).toFixed(2)}`
          texto += pagador === 'inquilino' ? ' [Cobrar no boleto]' : ' [Imobiliária paga]'
        }
        return [opt.label, texto]
      })),
      'Valor do Aluguel': Number(inq.valorAluguel || 0),
      'Vagas': Number(inq.vagas || 0),
      'Valor da Vaga': Number(inq.valorVaga || 0),
      'Garantia': GARANTIA_OPCOES.find(o => o.value === inq.garantia)?.label || '',
      'Seguradora': SEGURO_OPCOES.find(o => o.value === inq.seguro)?.label || '',
      'Valor do Seguro': Number(inq.valorSeguro || 0),
      'Observação': inq.observacao || '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(dados)

    worksheet['!cols'] = [
      { wch: 28 }, { wch: 22 }, { wch: 10 }, { wch: 26 }, { wch: 16 },
      { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 },
      { wch: 13 }, { wch: 13 }, { wch: 16 },
      ...CONTAS_OPCOES.map(() => ({ wch: 22 })),
      { wch: 16 }, { wch: 8 },  { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 },
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inquilinos')

    const dataAtual = new Date().toISOString().split('T')[0]
    XLSX.writeFile(workbook, `inquilinos_${dataAtual}.xlsx`)
  }

  const filtered = inquilinos.filter(i =>
    i.nome?.toLowerCase().includes(search.toLowerCase()) ||
    i.cpf?.includes(search) ||
    (imoveisById[i.imovelId]?.codigo || i.codigoImovel)?.toLowerCase().includes(search.toLowerCase())
  )

  const ativos   = inquilinos.filter(i => i.status === 'Ativo').length
  const inativos = inquilinos.filter(i => i.status === 'Inativo').length

  // Monta, para uma linha (inquilino), o conteúdo de cada coluna possível.
  // O objeto é indexado pela mesma "key" usada em DEFAULT_COLUMNS/columnOrder.
  const buildRowCells = (inq) => {
    const imovel = imoveisById[inq.imovelId]

    const cells = {
      nome: (
        <EditableCell
          key="nome"
          value={inq.nome || ''}
          display={<strong>{inq.nome || '—'}</strong>}
          onSave={v => handleCampoChange(inq.id, 'nome', v)}
          className="col-sticky-td"
        />
      ),
      locatario: (
        <EditableCell
          key="locatario"
          value={inq.locatario || ''}
          onSave={v => handleCampoChange(inq.id, 'locatario', v)}
        />
      ),
      status: (
        <td key="status">
          <select
            className={`badge-select ${inq.status === 'Ativo' ? 'badge-green' : 'badge-gray'}`}
            value={inq.status || 'Ativo'}
            onClick={e => e.stopPropagation()}
            onChange={e => handleStatusChange(inq.id, e.target.value)}
          >
            <option value="Ativo">Ativo</option>
            <option value="Inativo">Inativo</option>
          </select>
        </td>
      ),
      email: (
        <EditableCell
          key="email"
          value={inq.email || ''}
          onSave={v => handleCampoChange(inq.id, 'email', v)}
        />
      ),
      cpf: (
        <EditableCell
          key="cpf"
          value={inq.cpf || ''}
          onSave={v => handleCpfChange(inq.id, v)}
        />
      ),
      telefone: (
        <EditableCell
          key="telefone"
          value={inq.telefone || ''}
          display={
            whatsappLink(inq.telefone) ? (
              <a
                href={whatsappLink(inq.telefone)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                title="Abrir conversa no WhatsApp"
                style={{ color: '#16a34a', fontWeight: 600, textDecoration: 'none' }}
              >
                💬 {inq.telefone}
              </a>
            ) : undefined
          }
          onSave={v => handleTelefoneChange(inq.id, v)}
        />
      ),
      imovel: (
        <EditableCell
          key="imovel"
          value={inq.imovelId || ''}
          display={imovel?.codigo || inq.codigoImovel || '—'}
          type="select"
          options={imoveis.map(im => ({
            value: im.id,
            label: `${im.codigo}${im.endereco?.rua ? ` — ${im.endereco.rua}` : ''}`,
          }))}
          onSave={v => handleImovelChange(inq, v)}
        />
      ),
      modelo: (
        <td key="modelo">
          {imovel?.modelo
            ? <span className={`badge ${modeloBadge[imovel.modelo] || 'badge-gray'}`}>{imovel.modelo}</span>
            : '—'}
        </td>
      ),
      quarto: (
        <EditableCell
          key="quarto"
          value={inq.numeroQuarto || ''}
          onSave={v => handleCampoChange(inq.id, 'numeroQuarto', v)}
        />
      ),
      codigoContrato: (
        <EditableCell
          key="codigoContrato"
          value={inq.codigoContrato || ''}
          onSave={v => handleCampoChange(inq.id, 'codigoContrato', v)}
        />
      ),
      dataEntrada: (
        <EditableCell
          key="dataEntrada"
          value={inq.dataEntrada || ''}
          inputType="date"
          onSave={v => handleCampoChange(inq.id, 'dataEntrada', v)}
        />
      ),
      dataSaida: (
        <EditableCell
          key="dataSaida"
          value={inq.dataSaida || ''}
          inputType="date"
          onSave={v => handleCampoChange(inq.id, 'dataSaida', v)}
        />
      ),
      metodoPagamento: (
        <EditableCell
          key="metodoPagamento"
          value={inq.metodoPagamento || ''}
          display={METODO_PAGAMENTO_OPCOES.find(o => o.value === inq.metodoPagamento)?.label || '—'}
          type="select"
          options={METODO_PAGAMENTO_OPCOES}
          onSave={v => handleCampoChange(inq.id, 'metodoPagamento', v)}
        />
      ),
      valorAluguel: (
        <EditableCell
          key="valorAluguel"
          value={inq.valorAluguel ?? ''}
          display={inq.valorAluguel ? `R$ ${Number(inq.valorAluguel).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined}
          inputType="number"
          onSave={v => handleNumeroChange(inq.id, 'valorAluguel', v)}
        />
      ),
      vagas: (
        <EditableCell
          key="vagas"
          value={inq.vagas ?? ''}
          inputType="number"
          onSave={v => handleNumeroChange(inq.id, 'vagas', v, true)}
        />
      ),
      valorVaga: (
        <EditableCell
          key="valorVaga"
          value={inq.valorVaga ?? ''}
          display={inq.valorVaga ? `R$ ${Number(inq.valorVaga).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined}
          inputType="number"
          onSave={v => handleNumeroChange(inq.id, 'valorVaga', v)}
        />
      ),
      garantia: (
        <EditableCell
          key="garantia"
          value={inq.garantia || ''}
          display={GARANTIA_OPCOES.find(o => o.value === inq.garantia)?.label || '—'}
          type="select"
          options={GARANTIA_OPCOES}
          onSave={v => handleCampoChange(inq.id, 'garantia', v)}
        />
      ),
      seguro: (
        <EditableCell
          key="seguro"
          value={inq.seguro || ''}
          display={SEGURO_OPCOES.find(o => o.value === inq.seguro)?.label || '—'}
          type="select"
          options={SEGURO_OPCOES}
          onSave={v => handleCampoChange(inq.id, 'seguro', v)}
        />
      ),
      valorSeguro: (
        <EditableCell
          key="valorSeguro"
          value={inq.valorSeguro ?? ''}
          display={inq.valorSeguro ? `R$ ${Number(inq.valorSeguro).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined}
          inputType="number"
          onSave={v => handleNumeroChange(inq.id, 'valorSeguro', v)}
        />
      ),
      observacao: (
        <EditableCell
          key="observacao"
          value={inq.observacao || ''}
          display={<span className="table-cell-wrap">{inq.observacao || '—'}</span>}
          onSave={v => handleCampoChange(inq.id, 'observacao', v)}
        />
      ),
    }

    // Colunas das contas (Água, Energia, etc.) — checkbox "Sim/Não" da conta inclusa
    // + checkbox "Cobrar no boleto" (= contasPagador: 'inquilino' paga / 'imobiliaria' paga)
    // + checkbox "Variável" (alterna contasVariavel, limpando o valor fixo quando marcado)
    // + valor, quando a conta não é variável.
    CONTAS_OPCOES.forEach(opt => {
      const incluida = (inq.contasInclusas || []).includes(opt.value)
      const variavel = !!inq.contasVariavel?.[opt.value]
      const valor = inq.contasValores?.[opt.value]
      const pagador = inq.contasPagador?.[opt.value] || (variavel ? 'imobiliaria' : 'inquilino')
      const cobraNoBoleto = pagador === 'inquilino'

      cells[`conta_${opt.value}`] = (
        <td key={`conta_${opt.value}`} className="conta-cell">
          <label className="conta-cell-check" title={incluida ? 'Clique para remover' : 'Clique para incluir'}>
            <input
              type="checkbox"
              checked={incluida}
              onChange={() => handleToggleConta(inq, opt.value)}
            />
            <span>{incluida ? 'Sim' : 'Não'}</span>
          </label>

          {incluida && (
            <label
              className={`conta-cell-boleto ${cobraNoBoleto ? 'checked' : ''}`}
              title="Marcado = inquilino paga (cobrar no boleto). Desmarcado = imobiliária paga."
            >
              <input
                type="checkbox"
                checked={cobraNoBoleto}
                onChange={() => handleToggleContaPagador(inq, opt.value, variavel)}
              />
              <span>Cobrar no boleto</span>
            </label>
          )}

          {incluida && (
            <label
              className={`conta-cell-variavel ${variavel ? 'checked' : ''}`}
              title="Marcar como conta variável (valor lançado manualmente todo mês)"
            >
              <input
                type="checkbox"
                checked={variavel}
                onChange={() => handleToggleContaVariavel(inq, opt.value)}
              />
              <span>Variável</span>
            </label>
          )}

          {incluida && !variavel && (
            <EditableValue
              value={valor ?? ''}
              display={valor ? `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined}
              inputType="number"
              placeholder="R$ 0,00"
              onSave={v => handleContaValorChange(inq, opt.value, v)}
            />
          )}
        </td>
      )
    })

    return cells
  }

  return (
    <Layout title="Inquilinos" subtitle="Gestão de inquilinos cadastrados">
      <div className="actions-bar">
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/inquilinos/cadastrar')}>
          <b>+</b> Cadastrar Inquilino
        </button>
        <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => navigate('/inquilinos/importar')}>
          📥 Importar Planilha
        </button>
        <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={handleExport}>
          📤 Exportar Planilha
        </button>
        <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={handleResetColumnOrder} title="Restaura a ordem original das colunas">
          ↺ Restaurar Ordem das Colunas
        </button>
        <input
          type="text"
          placeholder="Buscar por nome, CPF ou imóvel..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon">👤</div>
          <div className="stat-value">{inquilinos.length}</div>
          <div className="stat-label">Total de Inquilinos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{ativos}</div>
          <div className="stat-label">Ativos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">❌</div>
          <div className="stat-value">{inativos}</div>
          <div className="stat-label">Inativos</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Todos os Inquilinos ({filtered.length})</h3>
          <span className="hint-text">Clique em qualquer célula para editar · arraste o cabeçalho para reordenar colunas · "Nome" fica sempre travada</span>
        </div>
        <div className="table-container table-scroll-x inquilinos-scroll-area">
          {loading ? (
            <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
          ) : (
            <table className="inquilinos-table">
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
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={columnOrder.length + 2}>
                      <div className="empty-state">
                        <div className="es-icon">👤</div>
                        <h3>Nenhum inquilino encontrado</h3>
                        <p>Tente ajustar os filtros ou cadastre um novo inquilino.</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(inq => {
                  const cells = buildRowCells(inq)
                  return (
                    <tr key={inq.id}>
                      {cells.nome}
                      {columnOrder.map(key => cells[key])}
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-sm" onClick={() => navigate(`/inquilinos/editar/${inq.id}`)}>Editar</button>
                          <button className="btn btn-sm" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }} onClick={() => openDesocModal(inq)}>Desocupação</button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(inq.id)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {desocModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={closeDesocModal}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0 }}>🚪 Cadastrar Desocupação</h3>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{desocModal.nome}</p>
              </div>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '4px 10px', flexShrink: 0 }} onClick={closeDesocModal}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 6 }}>Data de Desocupação *</label>
              <input
                type="date"
                value={desocDate}
                onChange={e => handleDesocDateChange(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            {desocDate && (() => {
              const defVals = getDefaultDesocValues(desocModal)
              const border = (key) => {
                const cur = parseFloat(desocValues[key])
                const def = parseFloat(defVals[key])
                return !isNaN(cur) && !isNaN(def) && cur !== def ? '#f59e0b' : '#fca5a5'
              }
              return (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: '#991b1b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Valores do Mês de Desocupação — {MESES[parseInt(desocDate.substring(5, 7), 10) - 1]}/{desocDate.substring(0, 4)}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>Pré-preenchido com o contrato. Borda amarela indica valor alterado.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#374151' }}>🏠 Aluguel</span>
                    <input
                      type="number" step="0.01" min="0" placeholder="0,00"
                      value={desocValues._aluguel ?? ''}
                      onChange={e => setDesocValues(p => ({ ...p, _aluguel: e.target.value }))}
                      style={{ width: 120, padding: '4px 8px', border: `1.5px solid ${border('_aluguel')}`, borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }}
                    />
                  </div>
                  {(desocModal.contasInclusas || []).map(k => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#374151' }}>📄 {CONTA_LABELS[k] || k}</span>
                      <input
                        type="number" step="0.01" min="0" placeholder="0,00"
                        value={desocValues[k] ?? ''}
                        onChange={e => setDesocValues(p => ({ ...p, [k]: e.target.value }))}
                        style={{ width: 120, padding: '4px 8px', border: `1.5px solid ${border(k)}`, borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }}
                      />
                    </div>
                  ))}
                  {desocModal.garantia === 'seguro' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#374151' }}>🛡️ Seguro Fiança</span>
                      <input
                        type="number" step="0.01" min="0" placeholder="0,00"
                        value={desocValues._seguro ?? ''}
                        onChange={e => setDesocValues(p => ({ ...p, _seguro: e.target.value }))}
                        style={{ width: 120, padding: '4px 8px', border: `1.5px solid ${border('_seguro')}`, borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }}
                      />
                    </div>
                  )}
                  {Number(desocModal.vagas) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#374151' }}>🚗 Garagem ({desocModal.vagas} vaga{Number(desocModal.vagas) > 1 ? 's' : ''})</span>
                      <input
                        type="number" step="0.01" min="0" placeholder="0,00"
                        value={desocValues._garagem ?? ''}
                        onChange={e => setDesocValues(p => ({ ...p, _garagem: e.target.value }))}
                        style={{ width: 120, padding: '4px 8px', border: `1.5px solid ${border('_garagem')}`, borderRadius: 6, fontSize: 13, textAlign: 'right', outline: 'none' }}
                      />
                    </div>
                  )}
                  {/* Contas extras */}
                  {desocExtras.map((extra, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ color: '#94a3b8', fontSize: 13, flexShrink: 0 }}>📋</span>
                      <input
                        type="text"
                        placeholder="Nome da conta"
                        value={extra.nome}
                        onChange={e => handleDesocExtraChange(idx, 'nome', e.target.value)}
                        style={{ flex: 1, padding: '4px 8px', minWidth: 0, border: '1.5px solid #fca5a5', borderRadius: 6, fontSize: 12, outline: 'none', background: '#fff' }}
                      />
                      <input
                        type="number" step="0.01"
                        placeholder="0,00"
                        value={extra.valor}
                        onChange={e => handleDesocExtraChange(idx, 'valor', e.target.value)}
                        style={{ width: 90, padding: '4px 8px', flexShrink: 0, border: '1.5px solid #fca5a5', borderRadius: 6, fontSize: 12, textAlign: 'right', outline: 'none', background: '#fff' }}
                      />
                      <button
                        onClick={() => handleDesocRemoveExtra(idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 18, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
                        title="Remover"
                      >×</button>
                    </div>
                  ))}
                  <button
                    onClick={handleDesocAddExtra}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'none', border: '1.5px dashed #fca5a5', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: '#991b1b', width: '100%', marginTop: 4 }}
                  >
                    ＋ Nova conta
                  </button>
                </div>
              </div>
              )
            })()}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={closeDesocModal}>Cancelar</button>
              <button
                className="btn btn-primary"
                style={{ width: 'auto', background: '#ef4444', borderColor: '#ef4444' }}
                onClick={handleDesocSave}
                disabled={desocSaving || !desocDate}
              >
                {desocSaving ? 'Salvando...' : '🚪 Salvar Desocupação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
