import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import * as XLSX from 'xlsx'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Building2, KeyRound, CircleCheck, Wrench, Plus, Upload, RotateCcw, Search, Pencil, Trash2 } from 'lucide-react'

const modeloBadge = { MA: 'badge-green', ME: 'badge-blue', ML: 'badge-yellow' }
const MODELOS = ['MA', 'ME', 'ML']
const STATUS_LIST = ['Disponível', 'Ocupado', 'Em Manutenção', 'Indisponível']
const statusBadge = {
  'Disponível': 'badge-green',
  'Ocupado': 'badge-blue',
  'Em Manutenção': 'badge-yellow',
  'Indisponível': 'badge-red',
}

const DEFAULT_COLUMNS = [
  { key: 'codigo', label: 'Código' },
  { key: 'proprietario', label: 'Proprietário' },
  { key: 'modelo', label: 'Modelo' },
  { key: 'status', label: 'Status' },
  { key: 'cep', label: 'CEP' },
  { key: 'rua', label: 'Rua' },
  { key: 'numero', label: 'Número' },
  { key: 'complemento', label: 'Complemento' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'estado', label: 'Estado' },
  { key: 'ucEnergia', label: 'UC Energia' },
  { key: 'ucAgua', label: 'UC Água' },
  { key: 'contas', label: 'Contas Inclusas' },
  { key: 'observacao', label: 'Observação' },
]

const COLUMNS_BY_KEY = Object.fromEntries(DEFAULT_COLUMNS.map(c => [c.key, c]))
const DEFAULT_COLUMN_ORDER = DEFAULT_COLUMNS.map(c => c.key).filter(k => k !== 'codigo')
const COLUMN_ORDER_STORAGE_KEY = 'imoveis_column_order_v2'

const formatCEP = (v) =>
  String(v || '').replace(/\D/g, '').replace(/(\d{5})(\d{1,3})/, '$1-$2').substring(0, 9)

const loadColumnOrder = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMN_ORDER_STORAGE_KEY) || 'null')
    if (Array.isArray(saved)) {
      const filtered = saved.filter(k => COLUMNS_BY_KEY[k] && k !== 'codigo')
      const missing = DEFAULT_COLUMN_ORDER.filter(k => !filtered.includes(k))
      return [...filtered, ...missing]
    }
  } catch {}
  return DEFAULT_COLUMN_ORDER
}

function EditableCell({ value, display, onSave, type = 'text', options = [], placeholder = '—', className = '' }) {
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

export default function Imoveis() {
  const navigate = useNavigate()
  const [imoveis, setImoveis] = useState([])
  const [proprietarios, setProprietarios] = useState([])
  const [contasCatalogo, setContasCatalogo] = useState([])
  const [contaDraft, setContaDraft] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [columnOrder, setColumnOrder] = useState(loadColumnOrder)
  const [draggingKey, setDraggingKey] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)

  useEffect(() => {
    const r = ref(db, 'imoveis')
    const unsub = onValue(r, snap => {
      const data = snap.val()
      setImoveis(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
      setLoading(false)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    return onValue(ref(db, 'proprietarios'), snap => {
      const data = snap.val()
      setProprietarios(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
  }, [])

  useEffect(() => {
    return onValue(ref(db, 'contas'), snap => {
      const data = snap.val()
      const lista = data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : []
      lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
      setContasCatalogo(lista)
    })
  }, [])

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

  const proprietariosById = Object.fromEntries(proprietarios.map(p => [p.id, p]))

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este imóvel?')) return
    await remove(ref(db, `imoveis/${id}`))
  }

  const handleModeloChange = async (id, modelo) => {
    await update(ref(db, `imoveis/${id}`), { modelo })
  }

  const handleStatusChange = async (id, status) => {
    await update(ref(db, `imoveis/${id}`), { status })
  }

  const handleCampoChange = async (id, campo, valor) => {
    await update(ref(db, `imoveis/${id}`), { [campo]: valor })
  }

  const handleAddContaImovel = async (im, contaId) => {
    if (!contaId || (im.contasInclusas || []).includes(contaId)) return
    await update(ref(db, `imoveis/${im.id}`), { contasInclusas: [...(im.contasInclusas || []), contaId] })
    setContaDraft(prev => ({ ...prev, [im.id]: '' }))
  }

  const handleRemoveContaImovel = async (im, contaId) => {
    const contasVariavel = { ...(im.contasVariavel || {}) }
    const contasCobradoBoleto = { ...(im.contasCobradoBoleto || {}) }
    delete contasVariavel[contaId]
    delete contasCobradoBoleto[contaId]
    await update(ref(db, `imoveis/${im.id}`), {
      contasInclusas: (im.contasInclusas || []).filter(v => v !== contaId),
      contasVariavel,
      contasCobradoBoleto,
    })
  }

  const handleToggleContaVariavel = async (im, contaId) => {
    await update(ref(db, `imoveis/${im.id}/contasVariavel`), { [contaId]: !im.contasVariavel?.[contaId] })
  }

  const handleToggleContaBoleto = async (im, contaId) => {
    await update(ref(db, `imoveis/${im.id}/contasCobradoBoleto`), { [contaId]: !im.contasCobradoBoleto?.[contaId] })
  }

  const handleEnderecoChange = async (id, campo, valor) => {
    const value = campo === 'cep' ? formatCEP(valor) : valor
    await update(ref(db, `imoveis/${id}/endereco`), { [campo]: value })
  }

  const handleProprietarioChange = async (im, novoProprietarioId) => {
    const novoProprietario = proprietarios.find(p => p.id === novoProprietarioId)
    await update(ref(db, `imoveis/${im.id}`), {
      proprietarioId: novoProprietarioId,
      proprietarioNome: novoProprietario?.nome || '',
    })
    await Promise.all(
      proprietarios
        .filter(p => (p.imoveisIds || []).includes(im.id) || p.id === novoProprietarioId)
        .map(p => {
          const tinha = (p.imoveisIds || []).includes(im.id)
          const deveTer = p.id === novoProprietarioId
          if (tinha === deveTer) return Promise.resolve()
          const novaLista = deveTer
            ? [...(p.imoveisIds || []), im.id]
            : (p.imoveisIds || []).filter(iid => iid !== im.id)
          return update(ref(db, `proprietarios/${p.id}`), { imoveisIds: novaLista })
        })
    )
  }

  const handleExport = () => {
    const dados = filtered.map(im => ({
      Código: im.codigo || '',
      Proprietário: proprietariosById[im.proprietarioId]?.nome || im.proprietarioNome || '',
      Modelo: im.modelo || '',
      Status: im.status || '',
      CEP: im.endereco?.cep || '',
      Rua: im.endereco?.rua || '',
      Número: im.endereco?.numero || '',
      Complemento: im.endereco?.complemento || '',
      Bairro: im.endereco?.bairro || '',
      Cidade: im.endereco?.cidade || '',
      Estado: im.endereco?.estado || '',
      'UC Energia': im.ucEnergia || '',
      'UC Água': im.ucAgua || '',
      'Contas Inclusas': (im.contasInclusas || [])
        .map(cid => contasCatalogo.find(c => c.id === cid)?.nome)
        .filter(Boolean)
        .join(', '),
      Observação: im.observacao || '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(dados)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Imoveis')
    const dataAtual = new Date().toISOString().split('T')[0]
    XLSX.writeFile(workbook, `imoveis_${dataAtual}.xlsx`)
  }

  const filtered = imoveis.filter(im =>
    im.codigo?.toLowerCase().includes(search.toLowerCase()) ||
    im.endereco?.rua?.toLowerCase().includes(search.toLowerCase()) ||
    (proprietariosById[im.proprietarioId]?.nome || im.proprietarioNome)?.toLowerCase().includes(search.toLowerCase())
  )

  const buildRowCells = (im) => {
    const cells = {
      codigo: (
        <EditableCell
          key="codigo"
          value={im.codigo || ''}
          display={<strong>{im.codigo || '—'}</strong>}
          onSave={v => handleCampoChange(im.id, 'codigo', v)}
          className="col-sticky-td"
        />
      ),
      proprietario: (
        <EditableCell
          key="proprietario"
          value={im.proprietarioId || ''}
          display={proprietariosById[im.proprietarioId]?.nome || im.proprietarioNome || '—'}
          type="select"
          options={proprietarios.map(p => ({ value: p.id, label: p.nome }))}
          onSave={v => handleProprietarioChange(im, v)}
        />
      ),
      modelo: (
        <td key="modelo">
          <select
            className={`badge-select ${modeloBadge[im.modelo] || 'badge-gray'}`}
            value={im.modelo || ''}
            onChange={e => handleModeloChange(im.id, e.target.value)}
          >
            <option value="">—</option>
            {MODELOS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </td>
      ),
      status: (
        <td key="status">
          <select
            className={`badge-select ${statusBadge[im.status] || 'badge-gray'}`}
            value={im.status || ''}
            onChange={e => handleStatusChange(im.id, e.target.value)}
          >
            <option value="">—</option>
            {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </td>
      ),
      cep: (
        <EditableCell
          key="cep"
          value={im.endereco?.cep || ''}
          onSave={v => handleEnderecoChange(im.id, 'cep', v)}
        />
      ),
      rua: (
        <EditableCell
          key="rua"
          value={im.endereco?.rua || ''}
          onSave={v => handleEnderecoChange(im.id, 'rua', v)}
        />
      ),
      numero: (
        <EditableCell
          key="numero"
          value={im.endereco?.numero || ''}
          onSave={v => handleEnderecoChange(im.id, 'numero', v)}
        />
      ),
      complemento: (
        <EditableCell
          key="complemento"
          value={im.endereco?.complemento || ''}
          onSave={v => handleEnderecoChange(im.id, 'complemento', v)}
        />
      ),
      bairro: (
        <EditableCell
          key="bairro"
          value={im.endereco?.bairro || ''}
          onSave={v => handleEnderecoChange(im.id, 'bairro', v)}
        />
      ),
      cidade: (
        <EditableCell
          key="cidade"
          value={im.endereco?.cidade || ''}
          onSave={v => handleEnderecoChange(im.id, 'cidade', v)}
        />
      ),
      estado: (
        <EditableCell
          key="estado"
          value={im.endereco?.estado || ''}
          onSave={v => handleEnderecoChange(im.id, 'estado', String(v).toUpperCase().substring(0, 2))}
        />
      ),
      ucEnergia: (
        <EditableCell
          key="ucEnergia"
          value={im.ucEnergia || ''}
          onSave={v => handleCampoChange(im.id, 'ucEnergia', v)}
        />
      ),
      ucAgua: (
        <EditableCell
          key="ucAgua"
          value={im.ucAgua || ''}
          onSave={v => handleCampoChange(im.id, 'ucAgua', v)}
        />
      ),
      contas: (
        <td key="contas" className="contas-cell">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
            {(im.contasInclusas || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(im.contasInclusas || []).map(contaId => {
                  const conta = contasCatalogo.find(c => c.id === contaId)
                  const isVariavel = !!im.contasVariavel?.[contaId]
                  const isBoleto = !!im.contasCobradoBoleto?.[contaId]
                  return (
                    <span
                      key={contaId}
                      title={conta?.nome || 'Conta removida'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12,
                        padding: '2px 6px', fontSize: 11, whiteSpace: 'nowrap',
                      }}
                    >
                      {conta?.icone || '📄'} {conta?.nome || 'removida'}
                      <button
                        type="button"
                        title={isVariavel ? 'Variável (clique para desativar)' : 'Marcar como variável'}
                        onClick={() => handleToggleContaVariavel(im, contaId)}
                        style={{
                          border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 9, fontWeight: 700,
                          padding: '0 4px', lineHeight: '14px',
                          background: isVariavel ? '#ede9fe' : '#f8fafc',
                          color: isVariavel ? '#6d28d9' : '#94a3b8',
                        }}
                      >V</button>
                      <button
                        type="button"
                        title={isBoleto ? 'Cobrado no boleto (clique para desativar)' : 'Marcar como cobrado no boleto'}
                        onClick={() => handleToggleContaBoleto(im, contaId)}
                        style={{
                          border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 9, fontWeight: 700,
                          padding: '0 4px', lineHeight: '14px',
                          background: isBoleto ? '#dbeafe' : '#f8fafc',
                          color: isBoleto ? '#1d4ed8' : '#94a3b8',
                        }}
                      >B</button>
                      <button
                        type="button"
                        title="Remover conta"
                        onClick={() => handleRemoveContaImovel(im, contaId)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 12, lineHeight: 1, padding: '0 2px' }}
                      >✕</button>
                    </span>
                  )
                })}
              </div>
            )}
            <select
              value={contaDraft[im.id] || ''}
              onChange={e => {
                const contaId = e.target.value
                setContaDraft(prev => ({ ...prev, [im.id]: contaId }))
                if (contaId) handleAddContaImovel(im, contaId)
              }}
              style={{ fontSize: 11, padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#64748b' }}
            >
              <option value="">+ adicionar conta...</option>
              {contasCatalogo
                .filter(c => !(im.contasInclusas || []).includes(c.id))
                .map(c => (
                  <option key={c.id} value={c.id}>{c.icone || '📄'} {c.nome}</option>
                ))}
            </select>
          </div>
        </td>
      ),
      observacao: (
        <EditableCell
          key="observacao"
          value={im.observacao || ''}
          display={<span className="table-cell-wrap">{im.observacao || '—'}</span>}
          onSave={v => handleCampoChange(im.id, 'observacao', v)}
        />
      )
    }

    return cells
  }

  return (
    <Layout title="Imóveis" subtitle="Lista e gerenciamento de todos os imóveis">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button onClick={() => navigate('/imoveis/cadastrar')}>
          <Plus /> Cadastrar Imóvel
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
            placeholder="Buscar por código, endereço ou proprietário..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <Building2 className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{imoveis.length}</p>
              <p className="truncate text-sm text-muted-foreground">Total de Imóveis</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
              <KeyRound className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{imoveis.filter(i => i.status === 'Disponível').length}</p>
              <p className="truncate text-sm text-muted-foreground">Disponíveis</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <CircleCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{imoveis.filter(i => i.status === 'Ocupado').length}</p>
              <p className="truncate text-sm text-muted-foreground">Ocupados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <Wrench className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{imoveis.filter(i => i.status === 'Em Manutenção').length}</p>
              <p className="truncate text-sm text-muted-foreground">Em Manutenção</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-lg">Todos os Imóveis ({filtered.length})</CardTitle>
          <CardDescription>Clique em qualquer célula para editar · arraste o cabeçalho para reordenar colunas</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
        <div className="table-container table-scroll-x inquilinos-scroll-area">
          {loading ? (
            <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
          ) : (
            <table className="inquilinos-table">
              <thead>
                <tr>
                  <th className="col-sticky-th">{COLUMNS_BY_KEY.codigo.label}</th>
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
                        <div className="es-icon">🏠</div>
                        <h3>Nenhum imóvel encontrado</h3>
                        <p>Cadastre um novo imóvel para começar.</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(im => {
                  const cells = buildRowCells(im)
                  return (
                    <tr key={im.id}>
                      {cells.codigo}
                      {columnOrder.map(key => cells[key])}
                      <td>
                        <div className="flex gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/imoveis/editar/${im.id}`)}>
                            <Pencil /> Editar
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(im.id)}>
                            <Trash2 /> Excluir
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
    </Layout>
  )
}

