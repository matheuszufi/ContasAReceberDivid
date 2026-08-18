import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ref, push, onValue, get, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const STATUS_IMOVEL = ['Disponível', 'Ocupado', 'Em Manutenção', 'Indisponível']

const formatCEP = (v) =>
  v.replace(/\D/g, '').replace(/(\d{5})(\d{1,3})/, '$1-$2').substring(0, 9)

const initialForm = {
  codigo: '', status: 'Disponível', modelo: '',
  proprietarioId: '',
  ucEnergia: '', ucAgua: '',
  endereco: { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' },
  contasInclusas: [],
  contasVariavel: {},
  contasCobradoBoleto: {},
  observacao: '',
}

export default function CadastrarImovel() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const [form, setForm] = useState(initialForm)
  const [proprietarios, setProprietarios] = useState([])
  const [inquilinos, setInquilinos] = useState([])
  const [contasCatalogo, setContasCatalogo] = useState([])
  const [contaParaAdicionar, setContaParaAdicionar] = useState('')
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
    return onValue(ref(db, 'contas'), snap => {
      const data = snap.val()
      const lista = data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : []
      lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
      setContasCatalogo(lista)
    })
  }, [])

  useEffect(() => {
    if (!isEdit) return
    return onValue(ref(db, 'inquilinos'), snap => {
      const data = snap.val()
      const lista = data ? Object.entries(data).map(([iid, v]) => ({ id: iid, ...v })) : []
      setInquilinos(lista.filter(inq => inq.imovelId === id))
    })
  }, [id, isEdit])

  const inquilinosAtivos = inquilinos.filter(inq => inq.status === 'Ativo')
  const inquilinosInativos = inquilinos.filter(inq => inq.status !== 'Ativo')

  useEffect(() => {
    if (!isEdit) return
    get(ref(db, `imoveis/${id}`)).then(snap => {
      if (snap.exists()) {
        const data = snap.val()
        setForm({
          ...initialForm, ...data,
          endereco: { ...initialForm.endereco, ...(data.endereco || {}) },
          contasInclusas: data.contasInclusas || [],
          contasVariavel: data.contasVariavel || {},
          contasCobradoBoleto: data.contasCobradoBoleto || {},
        })
      }
    })
  }, [id, isEdit])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleAddConta = () => {
    if (!contaParaAdicionar) return
    setForm(prev => prev.contasInclusas.includes(contaParaAdicionar)
      ? prev
      : { ...prev, contasInclusas: [...prev.contasInclusas, contaParaAdicionar] })
    setContaParaAdicionar('')
  }

  const handleRemoveConta = (contaId) => {
    setForm(prev => {
      const contasVariavel = { ...prev.contasVariavel }
      const contasCobradoBoleto = { ...prev.contasCobradoBoleto }
      delete contasVariavel[contaId]
      delete contasCobradoBoleto[contaId]
      return {
        ...prev,
        contasInclusas: prev.contasInclusas.filter(v => v !== contaId),
        contasVariavel,
        contasCobradoBoleto,
      }
    })
  }

  const handleContaVariavelToggle = (contaId, checked) => {
    setForm(prev => ({ ...prev, contasVariavel: { ...prev.contasVariavel, [contaId]: checked } }))
  }

  const handleContaBoletoToggle = (contaId, checked) => {
    setForm(prev => ({ ...prev, contasCobradoBoleto: { ...prev.contasCobradoBoleto, [contaId]: checked } }))
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const proprietario = proprietarios.find(p => p.id === form.proprietarioId)
      const payload = {
        ...form,
        proprietarioNome: proprietario?.nome || '',
      }
      let imovelId = id
      if (isEdit) {
        await update(ref(db, `imoveis/${id}`), { ...payload, atualizadoEm: new Date().toISOString() })
        // Propaga o novo código do imóvel para os inquilinos vinculados
        await Promise.all(
          inquilinos
            .filter(inq => inq.codigoImovel !== form.codigo)
            .map(inq => update(ref(db, `inquilinos/${inq.id}`), { codigoImovel: form.codigo }))
        )
      } else {
        const novoRef = await push(ref(db, 'imoveis'), { ...payload, criadoEm: new Date().toISOString() })
        imovelId = novoRef.key
      }
      // Mantém proprietarios[].imoveisIds em sincronia com o proprietário escolhido aqui
      await Promise.all(
        proprietarios
          .filter(p => (p.imoveisIds || []).includes(imovelId) || p.id === form.proprietarioId)
          .map(p => {
            const tinha = (p.imoveisIds || []).includes(imovelId)
            const deveTer = p.id === form.proprietarioId
            if (tinha === deveTer) return Promise.resolve()
            const novaLista = deveTer
              ? [...(p.imoveisIds || []), imovelId]
              : (p.imoveisIds || []).filter(iid => iid !== imovelId)
            return update(ref(db, `proprietarios/${p.id}`), { imoveisIds: novaLista })
          })
      )
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
                  { v: 'MA', desc: 'Omie' },
                  { v: 'ME', desc: 'Properfy' },
                  { v: 'ML', desc: 'Omie' },
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

        {/* ── Unidades Consumidoras ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">🔌</span>
            <h3>Unidades Consumidoras</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group">
                <label>UC de Energia</label>
                <input name="ucEnergia" value={form.ucEnergia} onChange={handleChange} placeholder="Número da UC de energia" />
              </div>
              <div className="form-group">
                <label>UC de Água</label>
                <input name="ucAgua" value={form.ucAgua} onChange={handleChange} placeholder="Número da UC de água" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Contas do Imóvel ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">📋</span>
            <h3>Contas do Imóvel</h3>
          </div>
          <div className="form-section-body">
            {contasCatalogo.length === 0 ? (
              <div className="info-banner">
                <p style={{ margin: 0 }}>Nenhuma conta cadastrada. <button type="button" className="link-btn" onClick={() => navigate('/contas/cadastrar')}>Cadastrar agora</button></p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '12px' }}>
                  <select
                    value={contaParaAdicionar}
                    onChange={e => setContaParaAdicionar(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">Selecione uma conta para adicionar...</option>
                    {contasCatalogo
                      .filter(conta => !form.contasInclusas.includes(conta.id))
                      .map(conta => (
                        <option key={conta.id} value={conta.id}>{conta.icone || '📄'} {conta.nome}</option>
                      ))}
                  </select>
                  <button type="button" className="btn btn-secondary" style={{ width: 'auto', whiteSpace: 'nowrap' }} disabled={!contaParaAdicionar} onClick={handleAddConta}>
                    + Adicionar
                  </button>
                </div>

                {form.contasInclusas.length === 0 ? (
                  <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Nenhuma conta adicionada a este imóvel.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {form.contasInclusas.map(contaId => {
                      const conta = contasCatalogo.find(c => c.id === contaId)
                      return (
                        <div
                          key={contaId}
                          style={{
                            display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center',
                            padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc',
                          }}
                        >
                          <strong style={{ fontSize: 13, minWidth: 110 }}>{conta?.icone || '📄'} {conta?.nome || 'Conta removida'}</strong>
                          <label className="conta-variavel-toggle" style={{ fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={!!form.contasVariavel[contaId]}
                              onChange={e => handleContaVariavelToggle(contaId, e.target.checked)}
                            />
                            <span>Variável</span>
                          </label>
                          <label className="conta-variavel-toggle" style={{ fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={!!form.contasCobradoBoleto[contaId]}
                              onChange={e => handleContaBoletoToggle(contaId, e.target.checked)}
                            />
                            <span>Boleto do inquilino</span>
                          </label>
                          <button
                            type="button"
                            title="Remover conta"
                            onClick={() => handleRemoveConta(contaId)}
                            style={{
                              marginLeft: 'auto', border: 'none', background: 'transparent',
                              color: '#b91c1c', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 4,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Inquilinos ── */}
        {isEdit && (
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-icon">👤</span>
              <h3>Inquilinos Morando Neste Imóvel</h3>
            </div>
            <div className="form-section-body">
              {inquilinosAtivos.length === 0 ? (
                <p style={{ margin: 0, color: '#64748b' }}>Nenhum inquilino vinculado a este imóvel.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {inquilinosAtivos.map(inq => (
                    <div
                      key={inq.id}
                      onClick={() => navigate(`/inquilinos/editar/${inq.id}`)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        gap: 10, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
                        cursor: 'pointer', background: '#f8fafc',
                      }}
                    >
                      <div>
                        <strong>{inq.nome || '—'}</strong>
                        {inq.numeroQuarto && (
                          <span style={{ marginLeft: 8, fontSize: 12, color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, padding: '1px 7px' }}>
                            Quarto {inq.numeroQuarto}
                          </span>
                        )}
                      </div>
                      <span className={`badge ${inq.status === 'Ativo' ? 'badge-green' : 'badge-gray'}`}>{inq.status || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Antigos Inquilinos ── */}
        {isEdit && inquilinosInativos.length > 0 && (
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-icon">🕒</span>
              <h3>Antigos Inquilinos do Imóvel</h3>
            </div>
            <div className="form-section-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inquilinosInativos.map(inq => (
                  <div
                    key={inq.id}
                    onClick={() => navigate(`/inquilinos/editar/${inq.id}`)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      gap: 10, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
                      cursor: 'pointer', background: '#f8fafc',
                    }}
                  >
                    <div>
                      <strong>{inq.nome || '—'}</strong>
                      {inq.numeroQuarto && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: '#475569', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, padding: '1px 7px' }}>
                          Quarto {inq.numeroQuarto}
                        </span>
                      )}
                    </div>
                    <span className="badge badge-gray">{inq.status || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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
