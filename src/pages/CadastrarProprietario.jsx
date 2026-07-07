import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ref, push, onValue, get, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const BANCOS = [
  'Banco do Brasil', 'Bradesco', 'Caixa Econômica Federal', 'Itaú', 'Santander',
  'Nubank', 'Inter', 'C6 Bank', 'BTG Pactual', 'Sicoob', 'Sicredi', 'Outro',
]

const formatCPF = (v) =>
  v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2').substring(0, 14)

const formatPhone = (v) => {
  const d = v.replace(/\D/g, '').substring(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim()
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim()
}

const formatCEP = (v) =>
  v.replace(/\D/g, '').replace(/(\d{5})(\d{1,3})/, '$1-$2').substring(0, 9)

const initialForm = {
  nome: '', status: 'Ativo', email: '', cpf: '', rg: '',
  dataNascimento: '', telefone: '', telefoneSecundario: '',
  endereco: { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' },
  banco: '', agencia: '', conta: '', tipoConta: 'Corrente', pix: '',
  observacao: '',
}

export default function CadastrarProprietario() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const [form, setForm] = useState(initialForm)
  const [imoveis, setImoveis] = useState([])
  const [imoveisSelecionados, setImoveisSelecionados] = useState([])
  const [loading, setLoading] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    return onValue(ref(db, 'imoveis'), snap => {
      const data = snap.val()
      setImoveis(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
  }, [])

  useEffect(() => {
    if (!isEdit) return
    get(ref(db, `proprietarios/${id}`)).then(snap => {
      if (snap.exists()) {
        const data = snap.val()
        setForm({
          ...initialForm, ...data,
          endereco: { ...initialForm.endereco, ...(data.endereco || {}) },
        })
        setImoveisSelecionados(data.imoveisIds || [])
      }
    })
  }, [id, isEdit])

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'cpf')               setForm(prev => ({ ...prev, cpf: formatCPF(value) }))
    else if (name === 'telefone')     setForm(prev => ({ ...prev, telefone: formatPhone(value) }))
    else if (name === 'telefoneSecundario') setForm(prev => ({ ...prev, telefoneSecundario: formatPhone(value) }))
    else setForm(prev => ({ ...prev, [name]: value }))
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

  const toggleImovel = (id) =>
    setImoveisSelecionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload = { ...form, imoveisIds: imoveisSelecionados }
      if (isEdit) {
        await update(ref(db, `proprietarios/${id}`), { ...payload, atualizadoEm: new Date().toISOString() })
      } else {
        await push(ref(db, 'proprietarios'), { ...payload, criadoEm: new Date().toISOString() })
      }
      navigate('/proprietarios')
    } catch (err) {
      setError('Erro ao salvar. Verifique sua conexão e tente novamente.')
      console.error(err)
    } finally { setLoading(false) }
  }

  return (
    <Layout title={isEdit ? 'Editar Proprietário' : 'Cadastrar Proprietário'} subtitle={isEdit ? 'Atualize os dados do proprietário' : 'Preencha os dados do novo proprietário'}>
      <form onSubmit={handleSubmit}>
        {error && <div className="error-msg">{error}</div>}

        {/* ── Dados Pessoais ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">👥</span>
            <h3>Dados Pessoais</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group fg-full">
                <label>Nome completo *</label>
                <input name="nome" value={form.nome} onChange={handleChange} required placeholder="Nome do proprietário" />
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
                <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="email@exemplo.com" />
              </div>
              <div className="form-group">
                <label>CPF</label>
                <input name="cpf" value={form.cpf} onChange={handleChange} placeholder="000.000.000-00" maxLength={14} />
              </div>
              <div className="form-group">
                <label>RG</label>
                <input name="rg" value={form.rg} onChange={handleChange} placeholder="00.000.000-0" />
              </div>
              <div className="form-group">
                <label>Data de Nascimento</label>
                <input name="dataNascimento" type="date" value={form.dataNascimento} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Telefone Principal</label>
                <input name="telefone" value={form.telefone} onChange={handleChange} placeholder="(00) 00000-0000" maxLength={15} />
              </div>
              <div className="form-group">
                <label>Telefone Secundário</label>
                <input name="telefoneSecundario" value={form.telefoneSecundario} onChange={handleChange} placeholder="(00) 00000-0000" maxLength={15} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Endereço ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">📍</span>
            <h3>Endereço</h3>
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
                <input name="complemento" value={form.endereco.complemento} onChange={handleEndereco} placeholder="Apto, Casa..." />
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

        {/* ── Imóveis Vinculados ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">🏠</span>
            <h3>Imóveis Vinculados</h3>
          </div>
          <div className="form-section-body">
            {imoveis.length === 0 ? (
              <div className="info-banner">
                <p>Nenhum imóvel cadastrado ainda. <button type="button" className="link-btn" onClick={() => navigate('/imoveis/cadastrar')}>Cadastrar imóvel</button></p>
              </div>
            ) : (
              <div className="form-group">
                <label>Selecione os imóveis deste proprietário</label>
                <div className="imovel-select-grid">
                  {imoveis.map(im => {
                    const selected = imoveisSelecionados.includes(im.id)
                    return (
                      <div key={im.id} className={`imovel-select-card${selected ? ' selected' : ''}`} onClick={() => toggleImovel(im.id)}>
                        <div className="isc-code">{im.codigo || im.id.substring(0, 8)}</div>
                        <div className="isc-address">
                          {im.endereco?.rua
                            ? `${im.endereco.rua}, ${im.endereco.numero || 's/n'}`
                            : im.tipo || 'Endereço não informado'}
                        </div>
                        <div className="isc-meta">
                          {im.modelo && (
                            <span className={`badge ${im.modelo === 'MA' ? 'badge-green' : im.modelo === 'ME' ? 'badge-blue' : 'badge-yellow'}`}>{im.modelo}</span>
                          )}
                          {im.status && (
                            <span className={`badge ${im.status === 'Disponível' ? 'badge-green' : im.status === 'Ocupado' ? 'badge-blue' : 'badge-gray'}`}>{im.status}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Dados Bancários ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">🏦</span>
            <h3>Dados Bancários</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group">
                <label>Banco</label>
                <select name="banco" value={form.banco} onChange={handleChange}>
                  <option value="">Selecione...</option>
                  {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Tipo de Conta</label>
                <select name="tipoConta" value={form.tipoConta} onChange={handleChange}>
                  <option value="Corrente">Corrente</option>
                  <option value="Poupança">Poupança</option>
                  <option value="Salário">Salário</option>
                </select>
              </div>
              <div className="form-group">
                <label>Agência</label>
                <input name="agencia" value={form.agencia} onChange={handleChange} placeholder="0000" />
              </div>
              <div className="form-group">
                <label>Conta</label>
                <input name="conta" value={form.conta} onChange={handleChange} placeholder="00000-0" />
              </div>
              <div className="form-group fg-full">
                <label>Chave PIX</label>
                <input name="pix" value={form.pix} onChange={handleChange} placeholder="CPF, email, telefone ou chave aleatória" />
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
                placeholder="Informações adicionais sobre o proprietário..." rows={4} />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/proprietarios')}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Salvando...' : '💾 Salvar Proprietário'}
          </button>
        </div>
      </form>
    </Layout>
  )
}
