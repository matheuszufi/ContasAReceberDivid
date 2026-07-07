import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ref, push, onValue, get, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const TIPOS_DEBITO = [
  'Aluguel', 'Condomínio', 'Água', 'Energia', 'Gás',
  'IPTU', 'Lixo', 'Seguro Incêndio', 'Seguro Fiança', 'Outro',
]

const STATUS_OPCOES = [
  { value: 'Pendente',        badge: 'badge-yellow' },
  { value: 'Pago',            badge: 'badge-green'  },
  { value: 'Em Negociação',   badge: 'badge-blue'   },
  { value: 'Protestado',      badge: 'badge-red'    },
  { value: 'Acordo',          badge: 'badge-blue'   },
]

const initialForm = {
  inquilinoId:    '',
  inquilinoNome:  '',
  imovelId:       '',
  codigoImovel:   '',
  tipoDebito:     '',
  mesReferencia:  '',
  dataVencimento: '',
  valorOriginal:  '',
  multa:          '2',
  juros:          '1',
  status:         'Pendente',
  dataPagamento:  '',
  observacao:     '',
}

function calcTotal(original, multa, juros) {
  const v = parseFloat(original) || 0
  const m = parseFloat(multa)    || 0
  const j = parseFloat(juros)    || 0
  return v + (v * m / 100) + (v * j / 100)
}

export default function CadastrarInadimplencia() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [form, setForm] = useState(initialForm)
  const [inquilinos, setInquilinos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    return onValue(ref(db, 'inquilinos'), snap => {
      const data = snap.val()
      setInquilinos(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
  }, [])

  useEffect(() => {
    if (!isEdit) return
    get(ref(db, `inadimplencias/${id}`)).then(snap => {
      if (snap.exists()) setForm({ ...initialForm, ...snap.val() })
    })
  }, [id, isEdit])

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'status' && value !== 'Pago') {
      setForm(prev => ({ ...prev, status: value, dataPagamento: '' }))
    } else {
      setForm(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleInquilinoSelect = (e) => {
    const inquilinoId = e.target.value
    const inq = inquilinos.find(i => i.id === inquilinoId)
    setForm(prev => ({
      ...prev,
      inquilinoId,
      inquilinoNome:  inq?.nome        || '',
      imovelId:       inq?.imovelId    || '',
      codigoImovel:   inq?.codigoImovel || '',
    }))
  }

  const total = calcTotal(form.valorOriginal, form.multa, form.juros)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload = {
        ...form,
        valorOriginal: parseFloat(form.valorOriginal) || 0,
        multa:         parseFloat(form.multa)         || 0,
        juros:         parseFloat(form.juros)         || 0,
        valorTotal:    total,
      }
      if (isEdit) {
        await update(ref(db, `inadimplencias/${id}`), { ...payload, atualizadoEm: new Date().toISOString() })
      } else {
        const newRef = await push(ref(db, 'inadimplencias'), { ...payload, criadoEm: new Date().toISOString() })
        await push(ref(db, `inadimplencias/${newRef.key}/timeline`), {
          tipo: 'Registro',
          descricao: `Débito registrado: ${form.tipoDebito || 'N/A'} | Valor original: R$ ${(parseFloat(form.valorOriginal) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Total com encargos: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          criadoEm: new Date().toISOString(),
        })
      }
      navigate('/inadimplentes')
    } catch (err) {
      setError('Erro ao salvar. Verifique sua conexão e tente novamente.')
      console.error(err)
    } finally { setLoading(false) }
  }

  return (
    <Layout
      title={isEdit ? 'Editar Débito' : 'Registrar Débito'}
      subtitle={isEdit ? 'Atualize os dados do débito' : 'Registre um novo débito em atraso'}
    >
      <form onSubmit={handleSubmit}>
        {error && <div className="error-msg">{error}</div>}

        {/* ── Inquilino / Imóvel ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">👤</span>
            <h3>Inquilino e Imóvel</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group fg-full">
                <label>Inquilino *</label>
                {inquilinos.length === 0 ? (
                  <div className="info-banner">
                    <p style={{ margin: 0 }}>Nenhum inquilino cadastrado. <button type="button" className="link-btn" onClick={() => navigate('/inquilinos/cadastrar')}>Cadastrar agora</button></p>
                  </div>
                ) : (
                  <select value={form.inquilinoId} onChange={handleInquilinoSelect} required>
                    <option value="">Selecione o inquilino...</option>
                    {inquilinos.map(inq => (
                      <option key={inq.id} value={inq.id}>
                        {inq.nome}{inq.codigoImovel ? ` — ${inq.codigoImovel}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label>Imóvel (preenchido automaticamente)</label>
                <input
                  value={form.codigoImovel || (form.imovelId ? '(vinculado)' : '')}
                  readOnly
                  placeholder="Selecione o inquilino para preencher"
                  style={{ background: '#f8fafc', color: '#64748b' }}
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select name="status" value={form.status} onChange={handleChange}>
                  {STATUS_OPCOES.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ── Débito ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">📋</span>
            <h3>Dados do Débito</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group">
                <label>Tipo de Débito *</label>
                <select name="tipoDebito" value={form.tipoDebito} onChange={handleChange} required>
                  <option value="">Selecione...</option>
                  {TIPOS_DEBITO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Mês de Referência</label>
                <input name="mesReferencia" type="month" value={form.mesReferencia} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Data de Vencimento *</label>
                <input name="dataVencimento" type="date" value={form.dataVencimento} onChange={handleChange} required />
              </div>
              {form.status === 'Pago' && (
                <div className="form-group">
                  <label>Data de Pagamento</label>
                  <input name="dataPagamento" type="date" value={form.dataPagamento} onChange={handleChange} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Valores ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">💰</span>
            <h3>Valores e Encargos</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group">
                <label>Valor Original (R$) *</label>
                <input name="valorOriginal" type="number" step="0.01" min="0" required value={form.valorOriginal} onChange={handleChange} placeholder="0,00" />
              </div>
              <div className="form-group">
                <label>Multa (%)</label>
                <input name="multa" type="number" step="0.01" min="0" max="100" value={form.multa} onChange={handleChange} placeholder="2" />
              </div>
              <div className="form-group">
                <label>Juros (% ao mês)</label>
                <input name="juros" type="number" step="0.01" min="0" max="100" value={form.juros} onChange={handleChange} placeholder="1" />
              </div>
              <div className="form-group">
                <label>Valor Total com Encargos</label>
                <div className="valor-total-display">
                  R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Observação ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">📝</span>
            <h3>Observação</h3>
          </div>
          <div className="form-section-body">
            <div className="form-group">
              <textarea name="observacao" value={form.observacao} onChange={handleChange}
                placeholder="Informações adicionais sobre o débito..." rows={3} />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/inadimplentes')}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Salvando...' : '💾 Salvar Débito'}
          </button>
        </div>
      </form>
    </Layout>
  )
}
