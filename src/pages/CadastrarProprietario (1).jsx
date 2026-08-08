import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ref, push, onValue, get, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const BANCOS = [
  'Banco do Brasil', 'Bradesco', 'Caixa Econômica Federal', 'Itaú', 'Santander',
  'Nubank', 'Inter', 'C6 Bank', 'BTG Pactual', 'Sicoob', 'Sicredi', 'Outro',
]

const formatDocumento = (v, tipo) => {
  const value = v.replace(/\D/g, '')

  if (tipo === 'cnpj') {
    return value
      .replace(/^(\d{2})(\d)/, '$1.$2')
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
  const d = v.replace(/\D/g, '').substring(0, 11)

  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim()
  }

  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim()
}

const formatCEP = (v) =>
  v.replace(/\D/g, '')
    .replace(/(\d{5})(\d{1,3})/, '$1-$2')
    .substring(0, 9)

const initialForm = {
  nome: '',
  status: 'Ativo',
  email: '',
  dataNascimento: '',

  tipoDocumento: 'cpf',
  cpfCnpj: '',

  telefone: '',

  endereco: {
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
  },

  banco: '',
  agencia: '',
  conta: '',
  tipoConta: 'Corrente',
  pix: '',

  observacao: '',
}

export default function CadastrarProprietario() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)

  const [form, setForm] = useState(initialForm)
  const [imoveis, setImoveis] = useState([])
  const [imoveisSelecionados, setImoveisSelecionados] = useState([])
  const [buscaImovel, setBuscaImovel] = useState('')
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
          ...initialForm,
          ...data,

          tipoDocumento: data.tipoDocumento || 'cpf',
          cpfCnpj: data.cpfCnpj || data.cpf || '',

          endereco: {
            ...initialForm.endereco,
            ...(data.endereco || {}),
          },
        })

        setImoveisSelecionados(data.imoveisIds || [])
      }
    })
  }, [id, isEdit])

  const handleChange = (e) => {
    const { name, value } = e.target

    if (name === 'cpfCnpj') {
      setForm(prev => ({
        ...prev,
        cpfCnpj: formatDocumento(value, prev.tipoDocumento),
      }))
      return
    }

    if (name === 'telefone') {
      setForm(prev => ({
        ...prev,
        telefone: formatPhone(value),
      }))
      return
    }

    setForm(prev => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleEndereco = (e) => {
    const { name, value } = e.target

    if (name === 'cep') {
      const formatted = formatCEP(value)

      setForm(prev => ({
        ...prev,
        endereco: {
          ...prev.endereco,
          cep: formatted,
        },
      }))

      if (value.replace(/\D/g, '').length === 8) {
        fetchCEP(value.replace(/\D/g, ''))
      }

      return
    }

    setForm(prev => ({
      ...prev,
      endereco: {
        ...prev.endereco,
        [name]: value,
      },
    }))
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
    } catch (e) {
      console.error('Erro ao buscar CEP:', e)
    } finally {
      setCepLoading(false)
    }
  }

  const adicionarImovel = (id) => {
    setImoveisSelecionados(prev => prev.includes(id) ? prev : [...prev, id])
    setBuscaImovel('')
  }

  const removerImovel = (id) => {
    setImoveisSelecionados(prev => prev.filter(i => i !== id))
  }

  const imoveisFiltrados = buscaImovel.trim()
    ? imoveis.filter(im => {
      if (imoveisSelecionados.includes(im.id)) return false
      const termo = buscaImovel.trim().toLowerCase()
      const codigo = (im.codigo || '').toLowerCase()
      const rua = (im.endereco?.rua || '').toLowerCase()
      const bairro = (im.endereco?.bairro || '').toLowerCase()
      return codigo.includes(termo) || rua.includes(termo) || bairro.includes(termo)
    }).slice(0, 6)
    : []

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const payload = {
        ...form,
        imoveisIds: imoveisSelecionados,
      }

      let proprietarioId = id
      if (isEdit) {
        await update(
          ref(db, `proprietarios/${id}`),
          {
            ...payload,
            atualizadoEm: new Date().toISOString(),
          }
        )
      } else {
        const novoRef = await push(
          ref(db, 'proprietarios'),
          {
            ...payload,
            criadoEm: new Date().toISOString(),
          }
        )
        proprietarioId = novoRef.key
      }

      // Mantém imoveis[].proprietarioId/proprietarioNome em sincronia com a seleção feita aqui
      await Promise.all(
        imoveis
          .filter(im => imoveisSelecionados.includes(im.id) || im.proprietarioId === proprietarioId)
          .map(im => {
            const deveTer = imoveisSelecionados.includes(im.id)
            if (deveTer === (im.proprietarioId === proprietarioId)) return Promise.resolve()
            return update(ref(db, `imoveis/${im.id}`), {
              proprietarioId: deveTer ? proprietarioId : '',
              proprietarioNome: deveTer ? (form.nome || '') : '',
            })
          })
      )

      navigate('/proprietarios')

    } catch (err) {
      setError('Erro ao salvar. Verifique sua conexão e tente novamente.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout
      title={isEdit ? 'Editar Proprietário' : 'Cadastrar Proprietário'}
      subtitle={isEdit ? 'Atualize os dados do proprietário' : 'Preencha os dados do novo proprietário'}
    >
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
                <input
                  name="nome"
                  value={form.nome}
                  onChange={handleChange}
                  required
                  placeholder="Nome do proprietário"
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
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="email@exemplo.com"
                />
              </div>

              <div className="form-group">
                <label>Data de Nascimento</label>
                <input
                  name="dataNascimento"
                  type="date"
                  value={form.dataNascimento}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label>Tipo de Documento</label>
                <select
                  name="tipoDocumento"
                  value={form.tipoDocumento}
                  onChange={handleChange}
                >
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                </select>
              </div>

              <div className="form-group">
                <label>{form.tipoDocumento === 'cpf' ? 'CPF' : 'CNPJ'}</label>
                <input
                  name="cpfCnpj"
                  value={form.cpfCnpj}
                  onChange={handleChange}
                  placeholder={
                    form.tipoDocumento === 'cpf'
                      ? '000.000.000-00'
                      : '00.000.000/0000-00'
                  }
                  maxLength={18}
                />
              </div>

              <div className="form-group">
                <label>Telefone Principal</label>
                <input
                  name="telefone"
                  value={form.telefone}
                  onChange={handleChange}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                />
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
                  CEP {cepLoading && (
                    <span style={{ color: '#64748b', fontWeight: 400, textTransform: 'none' }}>
                      buscando...
                    </span>
                  )}
                </label>
                <input
                  name="cep"
                  value={form.endereco.cep}
                  onChange={handleEndereco}
                  placeholder="00000-000"
                  maxLength={9}
                />
              </div>

              <div className="form-group fg-full">
                <label>Rua / Logradouro</label>
                <input
                  name="rua"
                  value={form.endereco.rua}
                  onChange={handleEndereco}
                  placeholder="Rua, Avenida..."
                />
              </div>

              <div className="form-group">
                <label>Número</label>
                <input
                  name="numero"
                  value={form.endereco.numero}
                  onChange={handleEndereco}
                  placeholder="Ex: 123"
                />
              </div>

              <div className="form-group">
                <label>Complemento</label>
                <input
                  name="complemento"
                  value={form.endereco.complemento}
                  onChange={handleEndereco}
                  placeholder="Apto, Casa..."
                />
              </div>

              <div className="form-group">
                <label>Bairro</label>
                <input
                  name="bairro"
                  value={form.endereco.bairro}
                  onChange={handleEndereco}
                  placeholder="Bairro"
                />
              </div>

              <div className="form-group">
                <label>Cidade</label>
                <input
                  name="cidade"
                  value={form.endereco.cidade}
                  onChange={handleEndereco}
                  placeholder="Cidade"
                />
              </div>

              <div className="form-group">
                <label>Estado (UF)</label>
                <input
                  name="estado"
                  value={form.endereco.estado}
                  onChange={handleEndereco}
                  placeholder="SP"
                  maxLength={2}
                  style={{ textTransform: 'uppercase' }}
                />
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
                <p>
                  Nenhum imóvel cadastrado ainda.{' '}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => navigate('/imoveis/cadastrar')}
                  >
                    Cadastrar imóvel
                  </button>
                </p>
              </div>
            ) : (
              <div className="form-group">

                <label>Imóveis deste proprietário</label>

                {imoveisSelecionados.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {imoveisSelecionados.map(selId => {
                      const im = imoveis.find(i => i.id === selId)
                      if (!im) return null
                      return (
                        <div
                          key={selId}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 10px', borderRadius: 20,
                            background: '#eff6ff', border: '1px solid #bfdbfe',
                            fontSize: 13,
                          }}
                        >
                          <strong>{im.codigo || im.id.substring(0, 8)}</strong>
                          {im.endereco?.rua && (
                            <span style={{ color: '#64748b' }}>
                              {im.endereco.rua}, {im.endereco.numero || 's/n'}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removerImovel(selId)}
                            aria-label="Remover imóvel"
                            style={{
                              border: 'none', background: 'transparent', cursor: 'pointer',
                              color: '#64748b', fontWeight: 700, fontSize: 14, lineHeight: 1,
                              padding: 0,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={buscaImovel}
                      onChange={(e) => setBuscaImovel(e.target.value)}
                      placeholder="Digite o código, rua ou bairro do imóvel..."
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={imoveisFiltrados.length === 0}
                      onClick={() => imoveisFiltrados[0] && adicionarImovel(imoveisFiltrados[0].id)}
                    >
                      + Adicionar
                    </button>
                  </div>

                  {buscaImovel.trim() && (
                    <div
                      style={{
                        marginTop: 6, border: '1px solid #e2e8f0', borderRadius: 8,
                        overflow: 'hidden', background: '#fff',
                      }}
                    >
                      {imoveisFiltrados.length === 0 ? (
                        <div style={{ padding: '10px 14px', fontSize: 13, color: '#64748b' }}>
                          Nenhum imóvel encontrado.
                        </div>
                      ) : (
                        imoveisFiltrados.map(im => (
                          <div
                            key={im.id}
                            onClick={() => adicionarImovel(im.id)}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              gap: 10, padding: '10px 14px', cursor: 'pointer',
                              borderTop: '1px solid #f1f5f9',
                            }}
                          >
                            <div>
                              <strong>{im.codigo || im.id.substring(0, 8)}</strong>
                              {im.endereco?.rua && (
                                <span style={{ marginLeft: 8, fontSize: 13, color: '#64748b' }}>
                                  {im.endereco.rua}, {im.endereco.numero || 's/n'}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="link-btn"
                              onClick={(e) => { e.stopPropagation(); adicionarImovel(im.id) }}
                            >
                              + Adicionar
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
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
                <select
                  name="banco"
                  value={form.banco}
                  onChange={handleChange}
                >
                  <option value="">Selecione...</option>

                  {BANCOS.map(b => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}

                </select>
              </div>


              <div className="form-group">
                <label>Tipo de Conta</label>
                <select
                  name="tipoConta"
                  value={form.tipoConta}
                  onChange={handleChange}
                >
                  <option value="Corrente">Corrente</option>
                  <option value="Poupança">Poupança</option>
                  <option value="Salário">Salário</option>
                </select>
              </div>


              <div className="form-group">
                <label>Agência</label>
                <input
                  name="agencia"
                  value={form.agencia}
                  onChange={handleChange}
                  placeholder="0000"
                />
              </div>


              <div className="form-group">
                <label>Conta</label>
                <input
                  name="conta"
                  value={form.conta}
                  onChange={handleChange}
                  placeholder="00000-0"
                />
              </div>


              <div className="form-group fg-full">
                <label>Chave PIX</label>
                <input
                  name="pix"
                  value={form.pix}
                  onChange={handleChange}
                  placeholder="CPF, email, telefone ou chave aleatória"
                />
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

              <textarea
                name="observacao"
                value={form.observacao}
                onChange={handleChange}
                placeholder="Informações adicionais sobre o proprietário..."
                rows={4}
              />

            </div>
          </div>
        </div>


        <div className="form-actions">

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/proprietarios')}
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Salvando...' : '💾 Salvar Proprietário'}
          </button>

        </div>

      </form>
    </Layout>
  )
}
