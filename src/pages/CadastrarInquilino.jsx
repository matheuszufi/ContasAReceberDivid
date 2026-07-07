import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ref, push, onValue, get, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const CONTAS_OPCOES = [
  { value: 'agua',             label: 'Água' },
  { value: 'energia',          label: 'Energia' },
  { value: 'condominio',       label: 'Condomínio' },
  { value: 'gas',              label: 'Gás' },
  { value: 'iptu',             label: 'IPTU' },
  { value: 'lixo',             label: 'Lixo' },
  { value: 'seguro_incendio',  label: 'Seguro Incêndio' },
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
]

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

const initialForm = {
  nome: '',
  status: 'Ativo',
  email: '',
  cpf: '',
  telefone: '',
  dataEntrada: '',
  dataSaida: '',
  imovelId: '',
  codigoImovel: '',
  contasInclusas: [],
  contasValores: {},
  garantia: '',
  seguro: '',
  valorSeguro: '',
  observacao: '',
}

export default function CadastrarInquilino() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const [form, setForm] = useState(initialForm)
  const [imoveis, setImoveis] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    return onValue(ref(db, 'imoveis'), snap => {
      const data = snap.val()
      setImoveis(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
  }, [])

  useEffect(() => {
    if (!isEdit) return
    get(ref(db, `inquilinos/${id}`)).then(snap => {
      if (snap.exists()) {
        const data = snap.val()
        setForm({ ...initialForm, ...data, contasInclusas: data.contasInclusas || [], contasValores: data.contasValores || {} })
      }
    })
  }, [id, isEdit])

  const handleImovelSelect = (e) => {
    const id = e.target.value
    const imovel = imoveis.find(im => im.id === id)
    setForm(prev => ({
      ...prev,
      imovelId:     id,
      codigoImovel: imovel?.codigo || '',
    }))
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'cpf') {
      setForm(prev => ({ ...prev, cpf: formatCPF(value) }))
    } else if (name === 'telefone') {
      setForm(prev => ({ ...prev, telefone: formatPhone(value) }))
    } else if (name === 'garantia' && value !== 'seguro') {
      setForm(prev => ({ ...prev, garantia: value, seguro: '', valorSeguro: '' }))
    } else {
      setForm(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleCheckbox = (value) => {
    setForm(prev => {
      const isActive = prev.contasInclusas.includes(value)
      const newContasInclusas = isActive
        ? prev.contasInclusas.filter(v => v !== value)
        : [...prev.contasInclusas, value]
      const newContasValores = { ...prev.contasValores }
      if (isActive) delete newContasValores[value]
      return { ...prev, contasInclusas: newContasInclusas, contasValores: newContasValores }
    })
  }

  const handleContaValor = (key, value) => {
    setForm(prev => ({ ...prev, contasValores: { ...prev.contasValores, [key]: value } }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // parse numeric fields
      const contasValoresParsed = Object.fromEntries(
        Object.entries(form.contasValores).map(([k, v]) => [k, parseFloat(v) || 0])
      )
      const payload = {
        ...form,
        contasValores: contasValoresParsed,
        valorSeguro:   parseFloat(form.valorSeguro) || 0,
      }
      if (isEdit) {
        await update(ref(db, `inquilinos/${id}`), { ...payload, atualizadoEm: new Date().toISOString() })
      } else {
        await push(ref(db, 'inquilinos'), { ...payload, criadoEm: new Date().toISOString() })
      }
      navigate('/inquilinos')
    } catch (err) {
      setError('Erro ao salvar. Verifique sua conexão e tente novamente.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout title={isEdit ? 'Editar Inquilino' : 'Cadastrar Inquilino'} subtitle={isEdit ? 'Atualize os dados do inquilino' : 'Preencha os dados do novo inquilino'}>
      <form onSubmit={handleSubmit}>
        {error && <div className="error-msg">{error}</div>}

        {/* ── Dados Pessoais ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">👤</span>
            <h3>Dados Pessoais</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group fg-full">
                <label>Nome completo *</label>
                <input
                  name="nome" value={form.nome} onChange={handleChange}
                  required placeholder="Nome do inquilino"
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select name="status" value={form.status} onChange={handleChange}>
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  name="email" type="email" value={form.email} onChange={handleChange}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="form-group">
                <label>CPF</label>
                <input
                  name="cpf" value={form.cpf} onChange={handleChange}
                  placeholder="000.000.000-00" maxLength={14}
                />
              </div>
              <div className="form-group">
                <label>Telefone</label>
                <input
                  name="telefone" value={form.telefone} onChange={handleChange}
                  placeholder="(00) 00000-0000" maxLength={15}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Dados do Contrato ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">📋</span>
            <h3>Dados do Contrato</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group">
                <label>Data de Entrada</label>
                <input name="dataEntrada" type="date" value={form.dataEntrada} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Data de Saída</label>
                <input name="dataSaida" type="date" value={form.dataSaida} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Imóvel *</label>
                {imoveis.length === 0 ? (
                  <div className="info-banner" style={{ marginTop: 0 }}>
                    <p style={{ margin: 0 }}>Nenhum imóvel cadastrado. <button type="button" className="link-btn" onClick={() => navigate('/imoveis/cadastrar')}>Cadastrar imóvel</button></p>
                  </div>
                ) : (
                  <select value={form.imovelId} onChange={handleImovelSelect} required>
                    <option value="">Selecione o imóvel...</option>
                    {imoveis.map(im => (
                      <option key={im.id} value={im.id}>
                        {im.codigo ? `[${im.codigo}] ` : ''}
                        {im.endereco?.rua ? `${im.endereco.rua}, ${im.endereco.numero || 's/n'}` : im.id.substring(0, 8)}
                        {im.status ? ` — ${im.status}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Financeiro ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">💰</span>
            <h3>Financeiro</h3>
          </div>
          <div className="form-section-body">

            <div className="form-group">
              <label>Contas Inclusas</label>
              <div className="checkbox-grid">
                {CONTAS_OPCOES.map(opt => {
                  const isActive = form.contasInclusas.includes(opt.value)
                  return (
                    <div key={opt.value} className={`conta-card${isActive ? ' active' : ''}`}>
                      <label className="conta-card-header">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={() => handleCheckbox(opt.value)}
                        />
                        <span>{opt.label}</span>
                      </label>
                      {isActive && (
                        <div className="conta-card-valor">
                          <input
                            type="number" step="0.01" min="0"
                            placeholder="R$ 0,00"
                            value={form.contasValores[opt.value] || ''}
                            onChange={e => handleContaValor(opt.value, e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="form-group">
              <label>Garantia</label>
              <div className="radio-group">
                {GARANTIA_OPCOES.map(opt => (
                  <label key={opt.value} className="radio-item">
                    <input
                      type="radio" name="garantia"
                      value={opt.value} checked={form.garantia === opt.value}
                      onChange={handleChange}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {form.garantia === 'seguro' && (
              <div className="form-grid-2" style={{ marginBottom: '20px' }}>
                <div className="form-group">
                  <label>Seguradora *</label>
                  <select name="seguro" value={form.seguro} onChange={handleChange} required>
                    <option value="">Selecione a seguradora...</option>
                    {SEGURO_OPCOES.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Valor Mensal do Seguro (R$)</label>
                  <input
                    name="valorSeguro" type="number" step="0.01" min="0"
                    value={form.valorSeguro} onChange={handleChange}
                    placeholder="0,00"
                  />
                </div>
              </div>
            )}

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
              <textarea
                name="observacao" value={form.observacao} onChange={handleChange}
                placeholder="Informações adicionais sobre o inquilino ou contrato..."
                rows={4}
              />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/inquilinos')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Salvando...' : '💾 Salvar Inquilino'}
          </button>
        </div>
      </form>
    </Layout>
  )
}
