import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import * as XLSX from 'xlsx'

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
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [columnOrder, setColumnOrder] = useState(loadColumnOrder)
  const [draggingKey, setDraggingKey] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)

  useEffect(() => {
    const r = ref(db, 'proprietarios')
    const unsub = onValue(r, snap => {
      const data = snap.val()
      setProprietarios(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
      setLoading(false)
    })
    return () => unsub()
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
      <div className="actions-bar">
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/proprietarios/cadastrar')}>
          <b>+</b> Cadastrar Proprietário
        </button>
        <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={handleExport}>
          📤 Exportar Planilha
        </button>
        <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={handleResetColumnOrder} title="Restaura a ordem original das colunas">
          ↺ Restaurar Ordem das Colunas
        </button>
        <input
          type="text"
          placeholder="Buscar por nome, CPF/CNPJ ou email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-value">{proprietarios.length}</div>
          <div className="stat-label">Total de Proprietários</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{proprietarios.filter(p => p.status === 'Ativo').length}</div>
          <div className="stat-label">Ativos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">❌</div>
          <div className="stat-value">{proprietarios.filter(p => p.status === 'Inativo').length}</div>
          <div className="stat-label">Inativos</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Todos os Proprietários ({filtered.length})</h3>
          <span className="hint-text">Clique em qualquer célula para editar · arraste o cabeçalho para reordenar colunas</span>
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
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-sm" onClick={() => navigate(`/proprietarios/editar/${p.id}`)}>Editar</button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Excluir</button>
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
    </Layout>
  )
}

