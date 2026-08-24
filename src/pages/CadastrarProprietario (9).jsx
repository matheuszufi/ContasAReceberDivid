import React, { useState, useEffect, useMemo } from 'react'
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

const INCIDENCIA_TAXA_ADM_LABELS = {
  aluguel: 'Aluguel',
  servicos: 'Serviços',
  iptu: 'IPTU',
  condominio: 'Condomínio',
}

const fmtMoney = (v) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const fmtMesAno = (ym) => {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return new Date(+y, +m - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase())
}

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
  const [inquilinos, setInquilinos] = useState([])
  const [contasCatalogo, setContasCatalogo] = useState([])
  const [valoresVariaveis, setValoresVariaveis] = useState({})
  const [imovelBusca, setImovelBusca] = useState('')
  const [imoveisVinculos, setImoveisVinculos] = useState({})
  const [loading, setLoading] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [error, setError] = useState(null)
  const [extratoMes, setExtratoMes] = useState(() => new Date().toISOString().slice(0, 7))

  // Todos os proprietários cadastrados (para o ranking de Taxa Adm + Taxa Contrato)
  const [proprietariosCatalogo, setProprietariosCatalogo] = useState([])
  const [showRankingModal, setShowRankingModal] = useState(false)

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
    return onValue(ref(db, 'inquilinos'), snap => {
      const data = snap.val()
      setInquilinos(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
  }, [])

  useEffect(() => {
    return onValue(ref(db, 'contas'), snap => {
      const data = snap.val()
      setContasCatalogo(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
  }, [])

  useEffect(() => {
    return onValue(ref(db, 'valoresVariaveis'), snap => {
      setValoresVariaveis(snap.val() || {})
    })
  }, [])

  // Carrega todos os proprietários (nome + vínculos já salvos) para calcular o ranking
  useEffect(() => {
    return onValue(ref(db, 'proprietarios'), snap => {
      const data = snap.val()
      setProprietariosCatalogo(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
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

  // Aceita o mês como parâmetro para poder ser reutilizada tanto no extrato do
  // proprietário em edição quanto no cálculo do ranking de todos os proprietários.
  const getInquilinoNoMes = (imovelId, mes) => {
    const encontrados = inquilinos.filter(inquilino => {
      if (inquilino.imovelId !== imovelId) return false
      const entrada = inquilino.dataEntrada?.substring(0, 7)
      const saida = inquilino.dataSaida?.substring(0, 7)
      return (!entrada || mes >= entrada) && (!saida || mes <= saida)
    })
    if (encontrados.length === 0) return null
    return encontrados.sort((a, b) => (b.dataEntrada || '').localeCompare(a.dataEntrada || ''))[0]
  }

  // Busca o valor de um componente (aluguel, serviços, iptu ou condomínio) para o inquilino no mês.
  // Para 'aluguel' usa o valor lançado no mês (ou o valor padrão do inquilino).
  // Para os demais, soma as contas do inquilino cujo NOME contenha o termo correspondente
  // ('serv' → serviços, 'iptu' → IPTU, 'condom' → condomínio).
  const getValorComponente = (inquilino, item, valoresLancados = {}) => {
    if (!inquilino) return 0
    if (item === 'aluguel') {
      return '_aluguel' in valoresLancados
        ? Number(valoresLancados._aluguel) || 0
        : Number(inquilino.valorAluguel) || 0
    }
    const termo = item === 'condominio' ? 'condom' : item === 'iptu' ? 'iptu' : 'serv'
    const contaIds = new Set([
      ...Object.keys(inquilino.contasValores || {}),
      ...Object.keys(valoresLancados).filter(key => !key.startsWith('_')),
    ])
    return [...contaIds].reduce((soma, contaId) => {
      const nomeConta = normalizeText(contasCatalogo.find(c => c.id === contaId)?.nome || contaId)
      const valor = contaId in valoresLancados
        ? Number(valoresLancados[contaId]) || 0
        : Number(inquilino.contasValores?.[contaId]) || 0
      return nomeConta.includes(termo) ? soma + valor : soma
    }, 0)
  }

  // Extrato financeiro genérico: recebe qualquer conjunto de vínculos (imoveisVinculos) e um mês,
  // e retorna, para cada imóvel, aluguel, base de incidência da taxa administrativa e repasse do mês.
  // Reutilizada tanto para o proprietário em edição (imoveisVinculos do state, ainda não salvo)
  // quanto para o ranking de todos os proprietários (vínculos já salvos no Firebase).
  //
  // A base da taxa administrativa (baseTotal) SÓ inclui os componentes marcados no checkbox
  // "Incidência da Taxa Adm" daquele imóvel (aluguel / serviços / iptu / condomínio). Se nenhum
  // item estiver marcado, a base é zero (sem fallback automático).
  //
  // A taxa de contrato só é descontada no mês em que o inquilino atual entrou (dataEntrada).
  const calcularExtratoPorImoveis = (vinculosObj, mes) => {
    return Object.entries(vinculosObj || {}).map(([imovelId, v]) => {
      const imovel = imoveis.find(im => im.id === imovelId)
      const inquilino = getInquilinoNoMes(imovelId, mes)
      const nomeImovel = v.nomeImovel || imovelLabel(imovel)

      const mesEntrada = inquilino?.dataEntrada ? inquilino.dataEntrada.substring(0, 7) : null
      const mesSaida = inquilino?.dataSaida ? inquilino.dataSaida.substring(0, 7) : null
      const dentroDoPeriodo = !!inquilino && (!mesEntrada || mes >= mesEntrada) && (!mesSaida || mes <= mesSaida)
      const primeiroMes = dentroDoPeriodo && mesEntrada === mes

      const valoresMes = inquilino ? valoresVariaveis[inquilino.id]?.[mes] || {} : {}
      const { extras = {}, _registrado = {}, _obs, ...valoresLancados } = valoresMes

      const aluguel = dentroDoPeriodo
        ? getValorComponente(inquilino, 'aluguel', valoresLancados)
        : 0

      const itensIncidencia = v.incidenciaTaxaAdm && v.incidenciaTaxaAdm.length > 0
        ? v.incidenciaTaxaAdm
        : []
      const baseComponentes = itensIncidencia.map(item => ({
        item,
        label: INCIDENCIA_TAXA_ADM_LABELS[item] || item,
        valor: dentroDoPeriodo ? getValorComponente(inquilino, item, valoresLancados) : 0,
      }))
      const baseTotal = baseComponentes.reduce((s, c) => s + c.valor, 0)

      const contaIds = new Set([
        ...Object.keys(inquilino?.contasValores || {}),
        ...Object.keys(valoresLancados).filter(key => !key.startsWith('_')),
        ...Object.keys(_registrado).filter(key => _registrado[key] && !key.startsWith('_')),
      ])
      const contasRegistradas = [...contaIds].map(contaId => {
        const valor = contaId in valoresLancados
          ? Number(valoresLancados[contaId]) || 0
          : Number(inquilino?.contasValores?.[contaId]) || 0
        const pagador = inquilino?.contasPagador?.[contaId] || (inquilino?.contasVariavel?.[contaId] ? 'imobiliaria' : 'inquilino')
        return {
          id: contaId,
          nome: contasCatalogo.find(conta => conta.id === contaId)?.nome || contaId,
          valorLiquido: pagador === 'imobiliaria' ? -valor : valor,
        }
      }).filter(conta => conta.valorLiquido !== 0)

      const contasEspeciais = [
        ['_seguro', 'Seguro Fiança'],
        ['_garagem', 'Garagem'],
        ['_garantia', inquilino?.garantia === 'caucao' ? 'Caução' : 'Adiantamento'],
      ].filter(([key]) => key in valoresLancados || _registrado[key])
        .map(([key, nome]) => ({ id: key, nome, valorLiquido: Number(valoresLancados[key]) || 0 }))
        .filter(conta => conta.valorLiquido !== 0)

      const contasExtras = Object.entries(extras).map(([extraId, extra]) => ({
        id: extraId,
        nome: extra.nome || contasCatalogo.find(conta => conta.id === extra.contaId)?.nome || 'Conta extra',
        valorLiquido: Number(extra.valor) || 0,
      })).filter(conta => conta.valorLiquido !== 0)

      const contasMes = [...contasRegistradas, ...contasEspeciais, ...contasExtras]
      const totalContas = contasMes.reduce((total, conta) => total + conta.valorLiquido, 0)

      const pctAdm = Number(v.taxaAdministracao) || 0
      const pctContrato = Number(v.taxaContrato) || 0
      const taxaAdmValor = baseTotal * (pctAdm / 100)
      const taxaContratoValor = primeiroMes ? aluguel * (pctContrato / 100) : 0

      // Repasse = Base Adm. − Taxa Adm. − Taxa Contrato (quando houver, só no 1º mês) + Contas do mês
      const repasse = baseTotal - taxaAdmValor - taxaContratoValor

      return {
        imovelId,
        nomeImovel,
        inquilino,
        dentroDoPeriodo,
        primeiroMes,
        aluguel,
        baseComponentes,
        baseTotal,
        pctAdm,
        pctContrato,
        taxaAdmValor,
        taxaContratoValor,
        contasMes,
        totalContas,
        repasse,
        geraDimob: !!v.geraDimob,
        geraNf: !!v.geraNf,
        repasseTipo: v.repasseTipo || 'nao_garantido',
        repasseMeses: v.repasseMeses,
      }
    })
  }

  const extratoImoveis = useMemo(
    () => calcularExtratoPorImoveis(imoveisVinculos, extratoMes),
    [imoveisVinculos, imoveis, inquilinos, contasCatalogo, valoresVariaveis, extratoMes]
  )

  const extratoAtivosNoMes = extratoImoveis.filter(e => e.dentroDoPeriodo)

  const extratoTotais = extratoAtivosNoMes.reduce((acc, e) => ({
    aluguel: acc.aluguel + e.aluguel,
    taxaAdm: acc.taxaAdm + e.taxaAdmValor,
    taxaContrato: acc.taxaContrato + e.taxaContratoValor,
    contas: acc.contas + e.totalContas,
    repasse: acc.repasse + e.repasse,
  }), { aluguel: 0, taxaAdm: 0, taxaContrato: 0, contas: 0, repasse: 0 })

  // Ranking de proprietários pelo total de Taxa Adm + Taxa Contrato no mês selecionado
  // (usa os vínculos já salvos de cada proprietário no Firebase).
  const rankingProprietarios = useMemo(() => {
    return proprietariosCatalogo
      .map(prop => {
        const extrato = calcularExtratoPorImoveis(prop.imoveisVinculos || {}, extratoMes)
        const ativos = extrato.filter(e => e.dentroDoPeriodo)
        const totalTaxaAdm = ativos.reduce((sum, e) => sum + e.taxaAdmValor, 0)
        const totalTaxaContrato = ativos.reduce((sum, e) => sum + e.taxaContratoValor, 0)
        return {
          id: prop.id,
          nome: prop.nome || 'Sem nome',
          totalTaxaAdm,
          totalTaxaContrato,
          total: totalTaxaAdm + totalTaxaContrato,
          qtdImoveis: ativos.length,
        }
      })
      .filter(p => p.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [proprietariosCatalogo, imoveis, inquilinos, contasCatalogo, valoresVariaveis, extratoMes])

  const topProprietarios = rankingProprietarios.slice(0, 5)

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

        {/* ── Ranking de Taxa Adm + Taxa Contrato ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">🏆</span>
            <h3>Top Proprietários por Taxa Adm + Taxa Contrato</h3>
            {rankingProprietarios.length > 0 && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtMesAno(extratoMes)}</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                  onClick={() => setShowRankingModal(true)}
                >
                  Ver ranking completo
                </button>
              </div>
            )}
          </div>

          <div className="form-section-body">
            {rankingProprietarios.length === 0 ? (
              <div className="info-banner">
                <p>Nenhum proprietário com Taxa Adm ou Taxa Contrato lançada em {fmtMesAno(extratoMes)}.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {topProprietarios.map((p, index) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
                      background: '#f8fafc',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span
                        className="badge badge-blue"
                        style={{
                          width: 24, height: 24, borderRadius: '50%', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12,
                        }}
                      >
                        {index === 0 ? '🏆' : `#${index + 1}`}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: 'block', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.nome}
                        </strong>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {p.qtdImoveis} imóve{p.qtdImoveis === 1 ? 'l' : 'is'} no mês
                        </span>
                      </div>
                    </div>
                    <strong style={{ fontSize: 13, color: '#166534', flexShrink: 0 }}>{fmtMoney(p.total)}</strong>
                  </div>
                ))}

                {rankingProprietarios.length > topProprietarios.length && (
                  <button
                    type="button"
                    className="link-btn"
                    style={{ alignSelf: 'flex-start', fontSize: 12, marginTop: 4 }}
                    onClick={() => setShowRankingModal(true)}
                  >
                    Ver todos os {rankingProprietarios.length} proprietários →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Extrato Financeiro dos Imóveis ── */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">🧾</span>
            <h3>Extrato Financeiro dos Imóveis</h3>
            {extratoImoveis.length > 0 && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <label htmlFor="extratoMes" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Mês:</label>
                <input
                  id="extratoMes"
                  type="month"
                  value={extratoMes}
                  onChange={e => setExtratoMes(e.target.value)}
                  style={{ padding: '4px 6px', fontSize: 12, height: 30 }}
                />
              </div>
            )}
          </div>

          <div className="form-section-body">
            {extratoImoveis.length === 0 ? (
              <div className="info-banner">
                <p>Vincule imóveis a este proprietário para ver o extrato de repasses e taxas.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
                  <div className="property-linked-rate" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1, minHeight: 44, padding: '6px 10px' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Aluguéis ({fmtMesAno(extratoMes)})</span>
                    <strong style={{ fontSize: 14 }}>{fmtMoney(extratoTotais.aluguel)}</strong>
                  </div>
                  <div className="property-linked-rate" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1, minHeight: 44, padding: '6px 10px' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Taxa Adm.</span>
                    <strong style={{ fontSize: 14, color: '#166534' }}>{fmtMoney(extratoTotais.taxaAdm)}</strong>
                  </div>
                  <div className="property-linked-rate" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1, minHeight: 44, padding: '6px 10px' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Taxa Contrato (1º aluguel)</span>
                    <strong style={{ fontSize: 14, color: '#b91c1c' }}>{fmtMoney(extratoTotais.taxaContrato)}</strong>
                  </div>
                  <div className="property-linked-rate" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1, minHeight: 44, padding: '6px 10px' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Contas do Mês</span>
                    <strong style={{ fontSize: 14, color: extratoTotais.contas < 0 ? '#b91c1c' : '#166534' }}>{fmtMoney(extratoTotais.contas)}</strong>
                  </div>
                  <div className="property-linked-rate" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1, minHeight: 44, padding: '6px 10px' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Repasse ao Proprietário</span>
                    <strong style={{ fontSize: 14, color: '#b91c1c' }}>{fmtMoney(extratoTotais.repasse)}</strong>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Imóvel</th>
                        <th>Inquilino</th>
                        <th>Aluguel</th>
                        <th>Base Adm.</th>
                        <th>Taxa Adm.</th>
                        <th>Taxa Contrato</th>
                        <th>Contas do Mês</th>
                        <th>Repasse</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extratoImoveis.map(e => (
                        <tr key={e.imovelId} style={!e.dentroDoPeriodo ? { opacity: 0.55 } : undefined}>
                          <td>{e.nomeImovel}</td>
                          <td>
                            {e.inquilino ? (
                              <>
                                {e.inquilino.nome}
                                {!e.dentroDoPeriodo && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>fora do período</span>}
                                {e.primeiroMes && <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 10 }}>1º aluguel</span>}
                              </>
                            ) : (
                              <span className="badge badge-gray">sem inquilino</span>
                            )}
                          </td>
                          <td>{fmtMoney(e.aluguel)}</td>
                          <td title={e.baseComponentes.map(c => c.label).join(', ')}>{fmtMoney(e.baseTotal)}</td>
                          <td style={{ color: '#166534' }}>{fmtMoney(e.taxaAdmValor)} <span style={{ color: 'var(--text-secondary)' }}>({e.pctAdm}%)</span></td>
                          <td style={{ color: '#b91c1c' }}>{e.primeiroMes ? `${fmtMoney(e.taxaContratoValor)} (${e.pctContrato}%)` : '—'}</td>
                          <td>
                            {e.contasMes.length === 0 ? '—' : e.contasMes.map(conta => (
                              <div key={conta.id} style={{ whiteSpace: 'nowrap', marginBottom: 2 }}>
                                {conta.nome}: <strong style={{ color: conta.valorLiquido < 0 ? '#b91c1c' : '#166534' }}>{fmtMoney(conta.valorLiquido)}</strong>
                              </div>
                            ))}
                          </td>
                          <td style={{ color: '#b91c1c', fontWeight: 600 }}>{fmtMoney(e.repasse)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p style={{ margin: '8px 0 0', fontSize: 10.5, color: 'var(--text-secondary)' }}>
                  A taxa de administração incide sobre os itens marcados em "Incidência da Taxa Adm" de cada imóvel e é descontada todo mês.
                  A taxa de contrato é calculada sobre o aluguel e descontada apenas no mês de entrada do inquilino atual (1º aluguel).
                  O repasse ao proprietário é: Base Adm. − Taxa Adm. − Taxa Contrato (quando houver) + Contas do mês (somadas ou descontadas conforme o responsável pelo pagamento).
                </p>
              </>
            )}
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

      {/* ── Modal: Ranking completo de Taxa Adm + Taxa Contrato ── */}
      {showRankingModal && (
        <div
          onClick={() => setShowRankingModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560,
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>Ranking de Taxa Adm + Taxa Contrato</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtMesAno(extratoMes)}</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                onClick={() => setShowRankingModal(false)}
              >
                Fechar
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: '12px 20px 20px' }}>
              {rankingProprietarios.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Nenhum proprietário com Taxa Adm ou Taxa Contrato lançada neste mês.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {rankingProprietarios.map((p, index) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 10, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
                        background: index < 3 ? '#f0fdf4' : '#f8fafc',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span
                          className="badge badge-blue"
                          style={{
                            width: 24, height: 24, borderRadius: '50%', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12,
                          }}
                        >
                          {index === 0 ? '🏆' : `#${index + 1}`}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ display: 'block', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.nome}
                          </strong>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            Adm: {fmtMoney(p.totalTaxaAdm)} · Contrato: {fmtMoney(p.totalTaxaContrato)} · {p.qtdImoveis} imóve{p.qtdImoveis === 1 ? 'l' : 'is'}
                          </span>
                        </div>
                      </div>
                      <strong style={{ fontSize: 13, color: '#166534', flexShrink: 0 }}>{fmtMoney(p.total)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
