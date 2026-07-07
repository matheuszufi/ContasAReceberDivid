import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ref, push, onValue, get, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const STATUS_IMOVEL = ['Disponível', 'Ocupado', 'Em Manutenção', 'Indisponível']
const CONTAS_OPCOES = [
  { value: 'agua',       label: 'Água' },
  { value: 'energia',    label: 'Energia' },
  { value: 'condominio', label: 'Condomínio' },
  { value: 'gas',        label: 'Gás' },
  { value: 'iptu',       label: 'IPTU' },
  { value: 'lixo',       label: 'Lixo' },
]

const formatCEP = (v) =>
  v.replace(/\D/g, '').replace(/(\d{5})(\d{1,3})/, '$1-$2').substring(0, 9)

const initialForm = {
  codigo: '', status: 'Disponível', modelo: '',
  proprietarioId: '',
  endereco: { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' },
  vagas: '',
  valorAluguel: '', valorCondominio: '', valorIPTU: '', valorGaragem: '',
  contasInclusas: [], contasValores: {},
  observacao: '',
}

export default function CadastrarImovel() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const [form, setForm] = useState(initialForm)
  const [proprietarios, setProprietarios] = useState([])
  const [loading, setLoading] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    return onValue(ref(db, 'proprietarios'), snap => {
      const data = snap.val()
      setProprietarios(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
  }, [])

  useEffect(() => {
    if (!isEdit) return
    get(ref(db, `imoveis/${id}`)).then(snap => {
      if (snap.exists()) {
        const data = snap.val()
        setForm({
          ...initialForm, ...data,
          endereco: { ...initialForm.endereco, ...(data.endereco || {}) },
          contasInclusas: data.contasInclusas || [],
          contasValores: data.contasValores || {},
        })
      }
    })
  }, [id, isEdit])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleEndereco = (e) => {
    const { name, value } = e.target
    if (name === 'cep') {
      const formatted = formatCEP(value)
      setForm(prev => ({ ...prev, endereco: { ...prev.endereco, cep: formatted } }))
      if (value.replace(/\D/g, '').length === 8) fetchCEP(value.replace(/\D/g, ''))
    } else {
      setForm(prev => ({ ...prev, endereco: { ...prev.endereco, [name]: value } }))
    }
  }

  const fetchCEP = async (cep) => {
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          endereco: {
            ...prev.endereco,
            rua: data.logradouro || '',
            bairro: data.bairro || '',
            cidade: data.localidade || '',
            estado: data.uf || '',
          },
        }))
      }
    } catch (e) { console.error('Erro ao buscar CEP:', e) }
    finally { setCepLoading(false) }
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

  const handleContaValor = (key, value) =>
    setForm(prev => ({ ...prev, contasValores: { ...prev.contasValores, [key]: value } }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const contasValoresParsed = Object.fromEntries(
        Object.entries(form.contasValores).map(([k, v]) => [k, parseFloat(v) || 0])
      )
      const proprietario = proprietarios.find(p => p.id === form.proprietarioId)
      const payload = {
        ...form,
        contasValores:    contasValoresParsed,
        proprietarioNome: proprietario?.nome || '',
        vagas:            parseInt(form.vagas) || 0,
        valorAluguel:     parseFloat(form.valorAluguel) || 0,
        valorCondominio:  parseFloat(form.valorCondominio) || 0,
        valorIPTU:        parseFloat(form.valorIPTU) || 0,
        valorGaragem:     parseFloat(form.valorGaragem) || 0,
      }
      if (isEdit) {
        await update(ref(db, `imoveis/${id}`), { ...payload, atualizadoEm: new Date().toISOString() })
      } else {
        await push(ref(db, 'imoveis'), { ...payload, criadoEm: new Date().toISOString() })
      }
      navigate('/imoveis')
    } catch (err) {
      setError('Erro ao salvar. Verifique sua conexão e tente novamente.')
      console.error(err)
    } finally { setLoading(false) }
  }

  return (
    <Layout title={isEdit ? 'Editar Imóvel' : 'Cadastrar Imóvel'} subtitle={isEdit ? 'Atualize os dados do imóvel' : 'Preencha os dados do novo imóvel'}>
      <form onSubmit={handleSubmit}>
        {error && <div className="error-msg">{error}</div>}

        {/* ── Identificação ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">🏠</span>
            <h3>Identificação</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group">
                <label>Código do Imóvel *</label>
                <input name="codigo" value={form.codigo} onChange={handleChange} required placeholder="Ex: IMO-001" />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select name="status" value={form.status} onChange={handleChange}>
                  {STATUS_IMOVEL.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '16px' }}>
              <label>Modelo *</label>
              <div className="radio-group">
                {[
                  { v: 'MA', desc: 'Média Administração' },
                  { v: 'ME', desc: 'Microempresa' },
                  { v: 'ML', desc: 'Médio/Longo Prazo' },
                ].map(({ v, desc }) => (
                  <label key={v} className="radio-item">
                    <input type="radio" name="modelo" value={v} checked={form.modelo === v} onChange={handleChange} required />
                    <span><strong>{v}</strong> — {desc}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Proprietário ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">👥</span>
            <h3>Proprietário</h3>
          </div>
          <div className="form-section-body">
            <div className="form-group">
              <label>Proprietário do Imóvel</label>
              <select name="proprietarioId" value={form.proprietarioId} onChange={handleChange}>
                <option value="">Selecione o proprietário...</option>
                {proprietarios.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}{p.cpf ? ` — ${p.cpf}` : ''}</option>
                ))}
              </select>
              {proprietarios.length === 0 && (
                <div className="info-banner" style={{ marginTop: '10px' }}>
                  <p style={{ margin: 0 }}>Nenhum proprietário cadastrado. <button type="button" className="link-btn" onClick={() => navigate('/proprietarios/cadastrar')}>Cadastrar agora</button></p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Localização ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">📍</span>
            <h3>Localização</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group">
                <label>
                  CEP {cepLoading && <span style={{ color: '#64748b', fontWeight: 400, textTransform: 'none' }}>buscando...</span>}
                </label>
                <input name="cep" value={form.endereco.cep} onChange={handleEndereco} placeholder="00000-000" maxLength={9} />
              </div>
              <div className="form-group fg-full">
                <label>Rua / Logradouro</label>
                <input name="rua" value={form.endereco.rua} onChange={handleEndereco} placeholder="Rua, Avenida..." />
              </div>
              <div className="form-group">
                <label>Número</label>
                <input name="numero" value={form.endereco.numero} onChange={handleEndereco} placeholder="Ex: 123" />
              </div>
              <div className="form-group">
                <label>Complemento</label>
                <input name="complemento" value={form.endereco.complemento} onChange={handleEndereco} placeholder="Apto, Bloco, Casa..." />
              </div>
              <div className="form-group">
                <label>Bairro</label>
                <input name="bairro" value={form.endereco.bairro} onChange={handleEndereco} placeholder="Bairro" />
              </div>
              <div className="form-group">
                <label>Cidade</label>
                <input name="cidade" value={form.endereco.cidade} onChange={handleEndereco} placeholder="Cidade" />
              </div>
              <div className="form-group">
                <label>Estado (UF)</label>
                <input name="estado" value={form.endereco.estado} onChange={handleEndereco} placeholder="SP" maxLength={2} style={{ textTransform: 'uppercase' }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Valores ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">💰</span>
            <h3>Valores</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group">
                <label>Valor do Aluguel (R$) *</label>
                <input name="valorAluguel" type="number" step="0.01" min="0" required value={form.valorAluguel} onChange={handleChange} placeholder="0,00" />
              </div>
              <div className="form-group">
                <label>Valor do Condomínio (R$)</label>
                <input name="valorCondominio" type="number" step="0.01" min="0" value={form.valorCondominio} onChange={handleChange} placeholder="0,00" />
              </div>
              <div className="form-group">
                <label>Valor IPTU mensal (R$)</label>
                <input name="valorIPTU" type="number" step="0.01" min="0" value={form.valorIPTU} onChange={handleChange} placeholder="0,00" />
              </div>
              <div className="form-group">
                <label>Valor Garagem (R$)</label>
                <input name="valorGaragem" type="number" step="0.01" min="0" value={form.valorGaragem} onChange={handleChange} placeholder="0,00" />
              </div>
              <div className="form-group">
                <label>Vagas de Garagem</label>
                <input name="vagas" type="number" min="0" value={form.vagas} onChange={handleChange} placeholder="0" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Contas Inclusas ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">💡</span>
            <h3>Contas Inclusas no Aluguel</h3>
          </div>
          <div className="form-section-body">
            <div className="form-group">
              <label>Selecione as contas e informe os valores estimados</label>
              <div className="checkbox-grid">
                {CONTAS_OPCOES.map(opt => {
                  const isActive = form.contasInclusas.includes(opt.value)
                  return (
                    <div key={opt.value} className={`conta-card${isActive ? ' active' : ''}`}>
                      <label className="conta-card-header">
                        <input type="checkbox" checked={isActive} onChange={() => handleCheckbox(opt.value)} />
                        <span>{opt.label}</span>
                      </label>
                      {isActive && (
                        <div className="conta-card-valor">
                          <input type="number" step="0.01" min="0" placeholder="R$ 0,00"
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
                placeholder="Informações adicionais sobre o imóvel..." rows={4} />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/imoveis')}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Salvando...' : '💾 Salvar Imóvel'}
          </button>
        </div>
      </form>
    </Layout>
  )
}
