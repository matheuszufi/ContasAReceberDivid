import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ref, push, onValue, get, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import { normalizeText } from '@/lib/utils'

const BANCOS = [
  'Banco do Brasil', 'Bradesco', 'Caixa Econômica Federal', 'Itaú', 'Santander',
  'Nubank', 'Inter', 'C6 Bank', 'BTG Pactual', 'Sicoob', 'Sicredi', 'Outro',
]

const INCIDENCIA_TAXA_ADM_OPCOES = ['aluguel', 'servicos', 'iptu', 'condominio']

const REPASSE_OPCOES = [
  { value: 'garantido', label: 'Garantido' },
  { value: 'garantido_meses', label: 'Garantido por alguns meses' },
  { value: 'nao_garantido', label: 'Não garantido' },
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
  const [imovelBusca, setImovelBusca] = useState('')
  const [imoveisVinculos, setImoveisVinculos] = useState({})
  const [loading, setLoading] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [error, setError] = useState(null)

  const imovelLabel = (im) => {
    if (!im) return ''
    const endereco = im.endereco?.rua ? `${im.endereco.rua}, ${im.endereco.numero || 's/n'}` : ''
    return [im.codigo, endereco].filter(Boolean).join(' - ') || im.id
  }

  const buildVinculoDefault = (im) => ({
    nomeImovel: imovelLabel(im),
    taxaContrato: '',
    taxaAdministracao: '',
    geraDimob: false,
    geraNf: false,
    repasseTipo: 'nao_garantido',
    repasseMeses: '',
    incidenciaTaxaAdm: [],
  })

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

        const vinculosSalvos = data.imoveisVinculos || {}
        const ids = data.imoveisIds || Object.keys(vinculosSalvos)
        const vinculos = {}
        ids.forEach(imovelId => {
          const salvo = vinculosSalvos[imovelId] || {}
          vinculos[imovelId] = {
            nomeImovel: salvo.nomeImovel || '',
            taxaContrato: salvo.taxaContrato ?? '',
            taxaAdministracao: salvo.taxaAdministracao ?? '',
            geraDimob: !!salvo.geraDimob,
            geraNf: !!salvo.geraNf,
            repasseTipo: salvo.repasseTipo || 'nao_garantido',
            repasseMeses: salvo.repasseMeses ?? '',
            incidenciaTaxaAdm: Array.isArray(salvo.incidenciaTaxaAdm) ? salvo.incidenciaTaxaAdm : [],
          }
        })
        setImoveisVinculos(vinculos)
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

  const updateVinculo = (imovelId, campo, valor) => {
    setImoveisVinculos(prev => ({
      ...prev,
      [imovelId]: {
        ...prev[imovelId],
        [campo]: valor,
      },
    }))
  }

  const toggleIncidencia = (imovelId, item) => {
    setImoveisVinculos(prev => {
      const atual = prev[imovelId]?.incidenciaTaxaAdm || []
      const proxima = atual.includes(item)
        ? atual.filter(v => v !== item)
        : [...atual, item]
      return {
        ...prev,
        [imovelId]: {
          ...prev[imovelId],
          incidenciaTaxaAdm: proxima,
        },
      }
    })
  }

  const adicionarImovel = (im) => {
    setImoveisVinculos(prev => {
      if (prev[im.id]) return prev
      return {
        ...prev,
        [im.id]: buildVinculoDefault(im),
      }
    })
    setImovelBusca('')
  }

  const removerImovel = (imovelId) => {
    setImoveisVinculos(prev => {
      const next = { ...prev }
      delete next[imovelId]
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const imoveisSelecionados = Object.keys(imoveisVinculos)
      const imoveisVinculosParsed = Object.fromEntries(
        Object.entries(imoveisVinculos).map(([imovelId, v]) => [
          imovelId,
          {
            ...v,
            taxaContrato: v.taxaContrato === '' ? '' : Number(v.taxaContrato) || 0,
            taxaAdministracao: v.taxaAdministracao === '' ? '' : Number(v.taxaAdministracao) || 0,
            repasseMeses: v.repasseTipo === 'garantido_meses'
              ? (v.repasseMeses === '' ? '' : Number(v.repasseMeses) || 0)
              : '',
          },
        ])
      )

      const payload = {
        ...form,
        imoveisIds: imoveisSelecionados,
        imoveisVinculos: imoveisVinculosParsed,
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>

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

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
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
              <>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>Buscar e adicionar imóveis</label>
                  <input
                    value={imovelBusca}
                    onChange={e => setImovelBusca(e.target.value)}
                    placeholder="Digite código, rua ou tipo do imóvel"
                  />
                  {imovelBusca.trim() && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {imoveis
                        .filter(im => !imoveisVinculos[im.id])
                        .filter(im => normalizeText(imovelLabel(im)).includes(normalizeText(imovelBusca)))
                        .slice(0, 12)
                        .map(im => (
                          <button
                            key={im.id}
                            type="button"
                            className="btn btn-secondary"
                            style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                            onClick={() => adicionarImovel(im)}
                          >
                            + {imovelLabel(im)}
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {Object.keys(imoveisVinculos).length === 0 ? (
                  <div className="info-banner">
                    <p>Nenhum imóvel vinculado ainda. Busque pelo nome/código acima para adicionar.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Imóvel</th>
                          <th>Taxa Contrato (%)</th>
                          <th>Taxa Adm (%)</th>
                          <th>DIMOB</th>
                          <th>NF</th>
                          <th>Repasse</th>
                          <th>Meses</th>
                          <th>Incidência da Taxa Adm</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(imoveisVinculos).map(([imovelId, v]) => {
                          const imovel = imoveis.find(im => im.id === imovelId)
                          const nomeImovel = v.nomeImovel || imovelLabel(imovel)
                          return (
                            <tr key={imovelId}>
                              <td style={{ minWidth: 180 }}>
                                <input
                                  value={nomeImovel}
                                  onChange={e => updateVinculo(imovelId, 'nomeImovel', e.target.value)}
                                  placeholder="Nome do imóvel"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={v.taxaContrato}
                                  onChange={e => updateVinculo(imovelId, 'taxaContrato', e.target.value)}
                                  placeholder="0,00"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={v.taxaAdministracao}
                                  onChange={e => updateVinculo(imovelId, 'taxaAdministracao', e.target.value)}
                                  placeholder="0,00"
                                />
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={!!v.geraDimob}
                                  onChange={e => updateVinculo(imovelId, 'geraDimob', e.target.checked)}
                                />
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={!!v.geraNf}
                                  onChange={e => updateVinculo(imovelId, 'geraNf', e.target.checked)}
                                />
                              </td>
                              <td>
                                <select
                                  value={v.repasseTipo || 'nao_garantido'}
                                  onChange={e => updateVinculo(imovelId, 'repasseTipo', e.target.value)}
                                >
                                  {REPASSE_OPCOES.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  disabled={v.repasseTipo !== 'garantido_meses'}
                                  value={v.repasseMeses}
                                  onChange={e => updateVinculo(imovelId, 'repasseMeses', e.target.value)}
                                  placeholder="0"
                                />
                              </td>
                              <td style={{ minWidth: 210 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {INCIDENCIA_TAXA_ADM_OPCOES.map(item => (
                                    <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                      <input
                                        type="checkbox"
                                        checked={(v.incidenciaTaxaAdm || []).includes(item)}
                                        onChange={() => toggleIncidencia(imovelId, item)}
                                      />
                                      {item.toUpperCase()}
                                    </label>
                                  ))}
                                </div>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ width: 'auto', color: '#b91c1c', padding: '4px 8px', fontSize: 12 }}
                                  onClick={() => removerImovel(imovelId)}
                                >
                                  Remover
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>

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
                rows={3}
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