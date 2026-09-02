import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { normalizeText } from '@/lib/utils'
import { Flame, CircleCheck, Wallet, Search, Pencil } from 'lucide-react'
import './SeguroIncendio.css'

const modeloBadge = { MA: 'badge-green', ME: 'badge-blue', ML: 'badge-yellow' }

const fmtMoney = (v) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

export default function SeguroIncendio() {
  const navigate = useNavigate()
  const [inquilinos, setInquilinos] = useState([])
  const [imoveis, setImoveis] = useState([])
  const [contasCatalogo, setContasCatalogo] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Filtros por coluna
  const [filtroNome, setFiltroNome] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroImovel, setFiltroImovel] = useState('')
  const [filtroModelo, setFiltroModelo] = useState('')
  const [filtroValor, setFiltroValor] = useState('') // '', 'fixo', 'variavel'
  const [filtroMesInicio, setFiltroMesInicio] = useState('')
  const [filtroMesFim, setFiltroMesFim] = useState('')

  useEffect(() => {
    const r1 = ref(db, 'inquilinos')
    const unsub1 = onValue(r1, snap => {
      const data = snap.val()
      setInquilinos(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
      setLoading(false)
    })
    const r2 = ref(db, 'imoveis')
    const unsub2 = onValue(r2, snap => {
      const data = snap.val()
      setImoveis(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
    const r3 = ref(db, 'contas')
    const unsub3 = onValue(r3, snap => {
      const data = snap.val()
      setContasCatalogo(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
    return () => { unsub1(); unsub2(); unsub3() }
  }, [])

  const imovelMap = useMemo(
    () => Object.fromEntries(imoveis.map(im => [im.id, im])),
    [imoveis]
  )

  // Identifica a conta "Seguro Incendio" tanto no formato antigo (chave fixa 'seguro_incendio')
  // quanto no catalogo novo (resolve pelo nome), igual as demais paginas do sistema.
  const isSeguroIncendioKey = useMemo(() => (k) => {
    if (k === 'seguro_incendio') return true
    const nome = (contasCatalogo.find(c => c.id === k)?.nome || '').toLowerCase()
    return nome.includes('incêndio') || nome.includes('incendio')
  }, [contasCatalogo])

  // Resolve, no imóvel do inquilino, qual conta do catálogo é a de Seguro Incêndio
  const findSeguroIncendioContaId = (imovel) =>
    (imovel?.contasInclusas || []).find(cid => isSeguroIncendioKey(cid)) || null

  // Agora considera que o imóvel tem seguro incêndio, e não mais o inquilino: a lista
  // passa a ser "todo inquilino cujo imóvel possui a conta Seguro Incêndio cadastrada".
  const comSeguroIncendio = useMemo(
    () => inquilinos.filter(i => !!findSeguroIncendioContaId(imovelMap[i.imovelId])),
    [inquilinos, imovelMap, isSeguroIncendioKey]
  )

  // Opções únicas para os selects (Status e Modelo), geradas a partir dos dados reais
  const statusOptions = useMemo(() => {
    const set = new Set(comSeguroIncendio.map(i => i.status).filter(Boolean))
    return Array.from(set).sort()
  }, [comSeguroIncendio])

  const modeloOptions = useMemo(() => {
    const set = new Set(
      comSeguroIncendio
        .map(i => imovelMap[i.imovelId]?.modelo)
        .filter(Boolean)
    )
    return Array.from(set).sort()
  }, [comSeguroIncendio, imovelMap])

  const filtered = useMemo(() => {
    const termoGeral = normalizeText(search)
    const termoNome = normalizeText(filtroNome)
    const termoImovel = normalizeText(filtroImovel)

    return comSeguroIncendio.filter(i => {
      const imovel = imovelMap[i.imovelId]
      const contaId = findSeguroIncendioContaId(imovel)
      const nome = normalizeText(i.nome)
      const locatario = normalizeText(i.locatario)
      const codigoImovel = normalizeText(imovel?.codigo || i.codigoImovel || '')
      const variavel = !!imovel?.contasVariavel?.[contaId]

      // Busca geral (mantida)
      const passaBuscaGeral =
        !termoGeral || nome.includes(termoGeral) || locatario.includes(termoGeral) || codigoImovel.includes(termoGeral)
      if (!passaBuscaGeral) return false

      // Nome
      if (termoNome && !nome.includes(termoNome) && !locatario.includes(termoNome)) return false

      // Status
      if (filtroStatus && i.status !== filtroStatus) return false

      // Imóvel
      if (termoImovel && !codigoImovel.includes(termoImovel)) return false

      // Modelo
      if (filtroModelo && imovel?.modelo !== filtroModelo) return false

      // Valor (fixo/variável)
      if (filtroValor === 'variavel' && !variavel) return false
      if (filtroValor === 'fixo' && variavel) return false

      // 1º Mês de Cobrança
      if (filtroMesInicio && (i.seguroIncendioMesInicio || '') !== filtroMesInicio) return false

      // Último Mês de Cobrança
      if (filtroMesFim && (i.seguroIncendioMesFim || '') !== filtroMesFim) return false

      return true
    })
  }, [
    comSeguroIncendio,
    imovelMap,
    search,
    filtroNome,
    filtroStatus,
    filtroImovel,
    filtroModelo,
    filtroValor,
    filtroMesInicio,
    filtroMesFim
  ])

  const ativos = comSeguroIncendio.filter(i => i.status === 'Ativo').length
  const totalMensal = comSeguroIncendio.reduce((s, i) => {
    const contaId = findSeguroIncendioContaId(imovelMap[i.imovelId])
    if (imovelMap[i.imovelId]?.contasVariavel?.[contaId]) return s
    return s + (Number(i.contasValores?.[contaId] ?? i.contasValores?.seguro_incendio) || 0)
  }, 0)

  const handleMesChange = (inquilinoId, campo, valor) => {
    update(ref(db, `inquilinos/${inquilinoId}`), { [campo]: valor })
  }

  const limparFiltros = () => {
    setFiltroNome('')
    setFiltroStatus('')
    setFiltroImovel('')
    setFiltroModelo('')
    setFiltroValor('')
    setFiltroMesInicio('')
    setFiltroMesFim('')
  }

  const temFiltroAtivo =
    filtroNome || filtroStatus || filtroImovel || filtroModelo || filtroValor || filtroMesInicio || filtroMesFim

  return (
    <Layout title="Seguro Incêndio" subtitle="Inquilinos com seguro incêndio incluído nas contas">
      <div className="mb-6">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por nome ou imóvel..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-2">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600">
              <Flame className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{comSeguroIncendio.length}</p>
              <p className="truncate text-sm text-muted-foreground">Com Seguro Incêndio</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <CircleCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{ativos}</p>
              <p className="truncate text-sm text-muted-foreground">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <Wallet className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold tracking-tight">{fmtMoney(totalMensal)}</p>
              <p className="truncate text-sm text-muted-foreground">Total Mensal (valores fixos)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 border-b pb-3">
          <CardTitle className="text-lg">Inquilinos ({filtered.length})</CardTitle>
          {temFiltroAtivo && (
            <Button variant="outline" size="sm" onClick={limparFiltros}>
              Limpar filtros
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-0">
        <div className="table-container">
          {loading ? (
            <div className="empty-state">Carregando...</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Status</th>
                  <th>Imóvel</th>
                  <th>Modelo</th>
                  <th>Valor</th>
                  <th>1º Mês de Cobrança</th>
                  <th>Último Mês de Cobrança</th>
                  <th>Ações</th>
                </tr>
                <tr className="filter-row">
                  <th>
                    <input
                      type="text"
                      placeholder="Filtrar nome..."
                      value={filtroNome}
                      onChange={e => setFiltroNome(e.target.value)}
                      className="search-input"
                      style={{ fontSize: 12, padding: '4px 8px' }}
                    />
                  </th>
                  <th>
                    <select
                      value={filtroStatus}
                      onChange={e => setFiltroStatus(e.target.value)}
                      style={{ fontSize: 12, padding: '4px 8px', width: '100%' }}
                    >
                      <option value="">Todos</option>
                      {statusOptions.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <input
                      type="text"
                      placeholder="Filtrar imóvel..."
                      value={filtroImovel}
                      onChange={e => setFiltroImovel(e.target.value)}
                      className="search-input"
                      style={{ fontSize: 12, padding: '4px 8px' }}
                    />
                  </th>
                  <th>
                    <select
                      value={filtroModelo}
                      onChange={e => setFiltroModelo(e.target.value)}
                      style={{ fontSize: 12, padding: '4px 8px', width: '100%' }}
                    >
                      <option value="">Todos</option>
                      {modeloOptions.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <select
                      value={filtroValor}
                      onChange={e => setFiltroValor(e.target.value)}
                      style={{ fontSize: 12, padding: '4px 8px', width: '100%' }}
                    >
                      <option value="">Todos</option>
                      <option value="fixo">Fixo</option>
                      <option value="variavel">Variável</option>
                    </select>
                  </th>
                  <th>
                    <input
                      type="month"
                      value={filtroMesInicio}
                      onChange={e => setFiltroMesInicio(e.target.value)}
                      style={{ fontSize: 12, padding: '4px 8px', width: '100%' }}
                    />
                  </th>
                  <th>
                    <input
                      type="month"
                      value={filtroMesFim}
                      onChange={e => setFiltroMesFim(e.target.value)}
                      style={{ fontSize: 12, padding: '4px 8px', width: '100%' }}
                    />
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state">Nenhum inquilino com seguro incêndio encontrado.</div></td></tr>
                ) : filtered.map(inq => {
                  const imovel = imovelMap[inq.imovelId]
                  const contaId = findSeguroIncendioContaId(imovel)
                  const variavel = !!imovel?.contasVariavel?.[contaId]
                  return (
                    <tr key={inq.id}>
                      <td>{inq.nome}</td>
                      <td>
                        <span className={`badge ${inq.status === 'Ativo' ? 'badge-green' : 'badge-gray'}`}>
                          {inq.status || '—'}
                        </span>
                      </td>
                      <td>{imovel?.codigo || inq.codigoImovel || '—'}</td>
                      <td>
                        {imovel?.modelo
                          ? <span className={`badge ${modeloBadge[imovel.modelo] || 'badge-gray'}`}>{imovel.modelo}</span>
                          : '—'}
                      </td>
                      <td>
                        {variavel
                          ? <span className="badge badge-yellow">Variável</span>
                          : fmtMoney(inq.contasValores?.[contaId] ?? inq.contasValores?.seguro_incendio)}
                      </td>
                      <td>
                        <input
                          type="month"
                          defaultValue={inq.seguroIncendioMesInicio || ''}
                          onBlur={e => handleMesChange(inq.id, 'seguroIncendioMesInicio', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="month"
                          defaultValue={inq.seguroIncendioMesFim || ''}
                          onBlur={e => handleMesChange(inq.id, 'seguroIncendioMesFim', e.target.value)}
                        />
                      </td>
                      <td>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/inquilinos/editar/${inq.id}`)}>
                          <Pencil /> Editar
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        </CardContent>
      </Card>
    </Layout>
  )
}