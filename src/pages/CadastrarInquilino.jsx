import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ref, push, onValue, get, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const GARANTIA_OPCOES = [
  { value: 'seguro',       label: 'Seguro' },
  { value: 'caucao',       label: 'Caução' },
  { value: 'adiantamento', label: 'Adiantamento' },
  { value: 'sem_garantia', label: 'Sem Garantia' },
]

const METODO_PAGAMENTO_OPCOES = [
  { value: 'pre_pago', label: 'Pré-pago', hint: 'Contas exibidas no mês de uso' },
  { value: 'pos_pago', label: 'Pós-pago', hint: 'Contas exibidas um mês após o uso' },
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
  locatario: '',
  status: 'Ativo',
  email: '',
  cpf: '',
  telefone: '',
  dataEntrada: '',
  dataSaida: '',
  metodoPagamento: 'pre_pago',
  imovelId: '',
  codigoImovel: '',
  numeroQuarto: '',
  codigoContrato: '',
  contasInclusas: [],
  contasValores: {},
  contasVariavel: {},
  contasOrigem: {},
  contasPagador: {},
  valorAluguel: '',
  vagas: '',
  valorVaga: '',
  garantia: '',
  seguro: '',
  valorSeguro: '',
  valorGarantia: '',
  seguroFiancaMesInicio: '',
  seguroFiancaMesFim: '',
  seguroIncendioMesInicio: '',
  seguroIncendioMesFim: '',
  observacao: '',
}

export default function CadastrarInquilino() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const [form, setForm] = useState(initialForm)
  const [imoveis, setImoveis] = useState([])
  const [segurosCatalogo, setSegurosCatalogo] = useState([])
  const [contasCatalogo, setContasCatalogo] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [buscaImovel, setBuscaImovel] = useState('')

  useEffect(() => {
    return onValue(ref(db, 'imoveis'), snap => {
      const data = snap.val()
      setImoveis(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
  }, [])

  useEffect(() => {
    return onValue(ref(db, 'seguros'), snap => {
      const data = snap.val()
      const lista = data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : []
      setSegurosCatalogo(lista.filter(s => s.tipo === 'Seguro Fiança').sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')))
    })
  }, [])

  useEffect(() => {
    return onValue(ref(db, 'contas'), snap => {
      const data = snap.val()
      setContasCatalogo(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
  }, [])

  useEffect(() => {
    if (!isEdit) return
    get(ref(db, `inquilinos/${id}`)).then(snap => {
      if (snap.exists()) {
        const data = snap.val()
        setForm({
          ...initialForm, ...data,
          contasInclusas: data.contasInclusas || [],
          contasValores:  data.contasValores  || {},
          contasVariavel: data.contasVariavel || {},
          contasOrigem:   data.contasOrigem   || {},
          contasPagador:  data.contasPagador  || {},
        })
      }
    })
  }, [id, isEdit])

  const imoveisFiltrados = imoveis.filter(im=>{
    const t=`${im.codigo||''} ${im.endereco?.rua||''} ${im.endereco?.numero||''}`.toLowerCase()
    return t.includes(buscaImovel.toLowerCase())
  })

  // Sempre recalculado a partir dos dados atuais do imóvel, nunca de um texto salvo
  const imovelSelecionado = imoveis.find(im => im.id === form.imovelId)

  // Contas disponíveis para este inquilino: as mesmas cadastradas no imóvel que ele ocupa.
  // "Variável" e "cobrado no boleto" são decididos no cadastro do imóvel, aqui só se herdam.
  const contasDoImovel = (imovelSelecionado?.contasInclusas || []).map(contaId => {
    const catalogConta = contasCatalogo.find(c => c.id === contaId)
    const nome = catalogConta?.nome || 'Conta removida'
    return {
      id: contaId,
      nome,
      icone: catalogConta?.icone || '📄',
      permiteValorNegativo: !!catalogConta?.permiteValorNegativo,
      isVariavel: !!imovelSelecionado?.contasVariavel?.[contaId],
      cobradoBoleto: !!imovelSelecionado?.contasCobradoBoleto?.[contaId],
      isSeguroIncendio: nome.toLowerCase().includes('incêndio') || nome.toLowerCase().includes('incendio'),
    }
  })

  const handleImovelSelect = (id) => {
    const imovel = imoveis.find(im => im.id === id)
    setBuscaImovel('')
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
    } else if (name === 'garantia') {
      setForm(prev => ({
        ...prev,
        garantia: value,
        seguro: value === 'seguro' ? prev.seguro : '',
        valorSeguro: value === 'seguro' ? prev.valorSeguro : '',
        valorGarantia: (value === 'caucao' || value === 'adiantamento') ? prev.valorGarantia : '',
      }))
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
      const newContasValores  = { ...prev.contasValores }
      const newContasVariavel = { ...prev.contasVariavel }
      const newContasOrigem   = { ...prev.contasOrigem }
      const newContasPagador  = { ...prev.contasPagador }
      if (isActive) {
        delete newContasValores[value]
        delete newContasVariavel[value]
        delete newContasOrigem[value]
        delete newContasPagador[value]
      } else {
        // Variável e boleto vêm do cadastro do imóvel, não são escolhidos aqui
        newContasVariavel[value] = !!imovelSelecionado?.contasVariavel?.[value]
        newContasPagador[value]  = imovelSelecionado?.contasCobradoBoleto?.[value] ? 'inquilino' : 'imobiliaria'
      }
      return { ...prev, contasInclusas: newContasInclusas, contasValores: newContasValores, contasVariavel: newContasVariavel, contasOrigem: newContasOrigem, contasPagador: newContasPagador }
    })
  }

  const handleContaValor = (key, value) => {
    setForm(prev => ({ ...prev, contasValores: { ...prev.contasValores, [key]: value } }))
  }

  const handleContaOrigem = (key, value) => {
    setForm(prev => ({ ...prev, contasOrigem: { ...prev.contasOrigem, [key]: value } }))
  }

  const handleSubmit = async (e) => {
  e.preventDefault()
  setError(null)
  setLoading(true)

  try {
    // Verifica se existia imóvel antes da edição
    let imovelAntigoId = null

    if (isEdit) {
      const inquilinoAtual = await get(ref(db, `inquilinos/${id}`))

      if (inquilinoAtual.exists()) {
        imovelAntigoId = inquilinoAtual.val().imovelId || null
      }
    }


    const contasValoresParsed = Object.fromEntries(
      Object.entries(form.contasValores).map(([k, v]) => [k, parseFloat(v) || 0])
    )

    // Variável e "cobrado no boleto" sempre refletem o cadastro atual do imóvel
    const contasVariavelFinal = {}
    const contasPagadorFinal  = {}
    form.contasInclusas.forEach(contaId => {
      contasVariavelFinal[contaId] = !!imovelSelecionado?.contasVariavel?.[contaId]
      contasPagadorFinal[contaId]  = imovelSelecionado?.contasCobradoBoleto?.[contaId] ? 'inquilino' : 'imobiliaria'
    })

    const payload = {
      ...form,
      contasValores: contasValoresParsed,
      contasVariavel: contasVariavelFinal,
      contasPagador: contasPagadorFinal,
      valorAluguel: parseFloat(form.valorAluguel) || 0,
      vagas: parseInt(form.vagas) || 0,
      valorVaga: parseFloat(form.valorVaga) || 0,
      valorSeguro: parseFloat(form.valorSeguro) || 0,
      valorGarantia: parseFloat(form.valorGarantia) || 0,
    }


    let inquilinoId = id


    // Salva o inquilino
    if (isEdit) {

      await update(
        ref(db, `inquilinos/${id}`),
        {
          ...payload,
          atualizadoEm: new Date().toISOString()
        }
      )

    } else {

      const novo = await push(
        ref(db, 'inquilinos'),
        {
          ...payload,
          criadoEm: new Date().toISOString()
        }
      )

      inquilinoId = novo.key
    }



    // ================================
    // ATUALIZA STATUS DO IMÓVEL
    // ================================


    // Caso tenha trocado de imóvel na edição
    if (
      imovelAntigoId &&
      imovelAntigoId !== form.imovelId
    ) {

      await update(
        ref(db, `imoveis/${imovelAntigoId}`),
        {
          status: 'Disponível',
          atualizadoEm: new Date().toISOString()
        }
      )

    }


    // Novo imóvel ocupado
    if (form.imovelId) {

      await update(
        ref(db, `imoveis/${form.imovelId}`),
        {
          status: 'Ocupado',
          atualizadoEm: new Date().toISOString()
        }
      )

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
              <div className="form-group fg-full">
                <label>Locatário (se houver)</label>
                <input
                  name="locatario" value={form.locatario} onChange={handleChange}
                  placeholder="Nome do locatário, caso diferente do inquilino"
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
                <label>Código do Contrato</label>
                <input
                  name="codigoContrato" value={form.codigoContrato} onChange={handleChange}
                  placeholder="Ex: CT-2026-001"
                />
              </div>
              <div className="form-group">
                <label>Data de Entrada</label>
                <input name="dataEntrada" type="date" value={form.dataEntrada} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Data de Saída</label>
                <input name="dataSaida" type="date" value={form.dataSaida} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Método de Pagamento</label>
                <div className="radio-group">
                  {METODO_PAGAMENTO_OPCOES.map(opt => (
                    <label key={opt.value} className="radio-item" title={opt.hint}>
                      <input
                        type="radio" name="metodoPagamento"
                        value={opt.value} checked={form.metodoPagamento === opt.value}
                        onChange={handleChange}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Imóvel *</label>
                {imoveis.length === 0 ? (
                  <div className="info-banner" style={{ marginTop: 0 }}>
                    <p style={{ margin: 0 }}>Nenhum imóvel cadastrado. <button type="button" className="link-btn" onClick={() => navigate('/imoveis/cadastrar')}>Cadastrar imóvel</button></p>
                  </div>
                ) : form.imovelId ? (
                  <div style={{position:'relative',display:'flex',alignItems:'center',justifyContent:'space-between',border:'1px solid #ddd',borderRadius:6,padding:'10px 12px'}}>
                    <span>
                      <strong>{imovelSelecionado?.codigo || '—'}</strong>
                      {imovelSelecionado?.endereco?.rua ? ` — ${imovelSelecionado.endereco.rua}${imovelSelecionado.endereco?.numero ? `, ${imovelSelecionado.endereco.numero}` : ''}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={()=>{setBuscaImovel('');setForm(f=>({...f,imovelId:'',codigoImovel:''}))}}
                      style={{border:'none',background:'transparent',cursor:'pointer',fontSize:18}}
                    >✕</button>
                  </div>
                ) : (
                  <div style={{position:'relative'}}>
<input
value={buscaImovel}
placeholder="Pesquisar imóvel..."
onChange={e=>setBuscaImovel(e.target.value)}
required
/>
{buscaImovel && <div style={{position:'absolute',background:'#fff',border:'1px solid #ddd',left:0,right:0,maxHeight:250,overflow:'auto',zIndex:99}}>
{imoveisFiltrados.map(im=><div key={im.id} onClick={()=>handleImovelSelect(im.id)} style={{padding:10,cursor:'pointer'}}>
<strong>{im.codigo}</strong><br/>{im.endereco?.rua} {im.endereco?.numero}
</div>)}
</div>}
</div>
                )}
              </div>
              <div className="form-group">
                <label>Número do Quarto</label>
                <input
                  name="numeroQuarto" value={form.numeroQuarto} onChange={handleChange}
                  placeholder="Ex: 101, A, 2B..."
                />
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

            <div className="form-grid-2" style={{ marginBottom: '20px' }}>
              <div className="form-group">
                <label>Valor do Aluguel (R$) *</label>
                <input
                  name="valorAluguel" type="number" step="0.01" min="0" required
                  value={form.valorAluguel} onChange={handleChange} placeholder="0,00"
                />
              </div>
              <div className="form-group">
                <label>Vagas de Garagem</label>
                <input
                  name="vagas" type="number" min="0"
                  value={form.vagas} onChange={handleChange} placeholder="0"
                />
              </div>
              {Number(form.vagas) > 0 && (
                <div className="form-group">
                  <label>Valor por Vaga (R$)</label>
                  <input
                    name="valorVaga" type="number" step="0.01" min="0"
                    value={form.valorVaga} onChange={handleChange} placeholder="0,00"
                  />
                </div>
              )}
            </div>

      <div className="form-group">
  <label>Contas Inclusas</label>
  {!form.imovelId ? (
    <div className="info-banner">
      <p style={{ margin: 0 }}>Selecione um imóvel para ver as contas cadastradas nele.</p>
    </div>
  ) : contasDoImovel.length === 0 ? (
    <div className="info-banner">
      <p style={{ margin: 0 }}>Este imóvel não possui contas cadastradas.</p>
    </div>
  ) : (
  <div className="checkbox-grid">
    {contasDoImovel.map(conta => {
      const isActive = form.contasInclusas.includes(conta.id)

      return (
        <div
          key={conta.id}
          className={`conta-card${isActive ? ' active' : ''}${conta.isVariavel ? ' variavel' : ''}`}
        >
          <label className="conta-card-header">
            <input
              type="checkbox"
              checked={isActive}
              onChange={() => handleCheckbox(conta.id)}
            />
            <span>{conta.icone} {conta.nome}</span>
            {conta.isVariavel && (
              <span className="conta-variavel-badge">variável</span>
            )}
          </label>

          {isActive && (
            <div className="conta-card-body">
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                {conta.isVariavel ? 'Conta variável' : 'Conta fixa'} · cobrada {conta.cobradoBoleto ? 'no boleto do inquilino' : 'pela imobiliária'}
              </div>

              {conta.isSeguroIncendio && (
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Primeiro mês de cobrança</label>
                    <input
                      type="month"
                      name="seguroIncendioMesInicio"
                      value={form.seguroIncendioMesInicio}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>Último mês de cobrança</label>
                    <input
                      type="month"
                      name="seguroIncendioMesFim"
                      value={form.seguroIncendioMesFim}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              )}

              {!conta.isVariavel && (
                <div className="conta-card-valor">
                  <input
                    type="number"
                    step="0.01"
                    min={conta.permiteValorNegativo ? undefined : 0}
                    placeholder={
                      conta.permiteValorNegativo
                        ? "Ex.: -50,00"
                        : "R$ 0,00"
                    }
                    value={form.contasValores[conta.id] || ''}
                    onChange={e =>
                      handleContaValor(conta.id, e.target.value)
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )
    })}
  </div>
  )}

  {form.contasInclusas.filter(v => form.contasVariavel[v]).length > 0 && (
    <div className="contas-variaveis-origem">
      {form.contasInclusas
        .filter(v => form.contasVariavel[v])
        .map(v => {
          const conta = contasDoImovel.find(c => c.id === v)
          return (
            <div className="form-group" key={v}>
              <label>{`Onde encontrar conta variável ${conta?.nome || v}`}</label>
              <input
                type="text"
                placeholder="Descreva onde encontrar o valor..."
                value={form.contasOrigem[v] || ''}
                onChange={e => handleContaOrigem(v, e.target.value)}
              />
            </div>
          )
        })}
    </div>
  )}
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
                    {segurosCatalogo.map(opt => (
                      <option key={opt.id} value={opt.nome}>{opt.nome}</option>
                    ))}
                  </select>
                  {segurosCatalogo.length === 0 && (
                    <div className="info-banner" style={{ marginTop: '10px' }}>
                      <p style={{ margin: 0 }}>Nenhuma seguradora cadastrada. <button type="button" className="link-btn" onClick={() => navigate('/seguros/cadastrar')}>Cadastrar agora</button></p>
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label>Valor Mensal do Seguro (R$)</label>
                  <input
                    name="valorSeguro" type="number" step="0.01" min="0"
                    value={form.valorSeguro} onChange={handleChange}
                    placeholder="0,00"
                  />
                </div>
                <div className="form-group">
                  <label>Primeiro mês de cobrança</label>
                  <input
                    type="month"
                    name="seguroFiancaMesInicio"
                    value={form.seguroFiancaMesInicio}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label>Último mês de cobrança</label>
                  <input
                    type="month"
                    name="seguroFiancaMesFim"
                    value={form.seguroFiancaMesFim}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}

            {(form.garantia === 'caucao' || form.garantia === 'adiantamento') && (
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label>{`Valor d${form.garantia === 'caucao' ? 'a Caução' : 'o Adiantamento'} (R$)`}</label>
                <input
                  name="valorGarantia" type="number" step="0.01" min="0"
                  value={form.valorGarantia} onChange={handleChange}
                  placeholder="0,00"
                />
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
