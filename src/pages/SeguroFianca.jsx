import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Shield, CircleCheck, Wallet, Search, Pencil, Link as LinkIcon } from 'lucide-react'

const modeloBadge = { MA: 'badge-green', ME: 'badge-blue', ML: 'badge-yellow' }

const SEGURO_LABELS = {
  credaluga: 'Credaluga',
  credpago:  'Credpago',
  lado_bom:  'Lado Bom Seguros',
  Avalyst:   'Avalyst',
}

const fmtMoney = (v) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const credpagoUrl = (nome) =>
  `https://credpago.com/imobiliaria/contratos/relatorio.php?search=${encodeURIComponent(nome || '')}`

// A Credaluga guarda o filtro de busca ativo num JSON serializado duas vezes no hash da URL
const credalugaUrl = (nome) => {
  const nomeParam = String(nome || '').trim().replace(/\s+/g, '+')
  const state = {
    state: {
      filters: [{
        type: 'multi',
        field: 'search',
        value: nomeParam,
        includeFields: ['id', 'fullname', 'streetAddress', 'nationalId'],
        displayValue: nomeParam,
      }],
      sortConfig: { field: null, order: null, type: null },
      currentPage: 1,
    },
  }
  const encoded = encodeURIComponent(JSON.stringify(state))
  return `https://gestao.credaluga.com.br/contratos#${encoded}`
}

export default function SeguroFianca() {
  const navigate = useNavigate()
  const [inquilinos, setInquilinos] = useState([])
  const [imoveis, setImoveis] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Filtros por coluna
  const [filtroNome, setFiltroNome] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroImovel, setFiltroImovel] = useState('')
  const [filtroModelo, setFiltroModelo] = useState('')
  const [filtroSeguradora, setFiltroSeguradora] = useState('')
  const [filtroValorMin, setFiltroValorMin] = useState('')
  const [filtroValorMax, setFiltroValorMax] = useState('')
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
    return () => { unsub1(); unsub2() }
  }, [])

  const imovelMap = useMemo(
    () => Object.fromEntries(imoveis.map(im => [im.id, im])),
    [imoveis]
  )

  // Só entram aqui inquilinos cuja garantia contratual é o seguro fiança (conta incluída no aluguel)
  const seguradosFianca = useMemo(
    () => inquilinos.filter(i => i.garantia === 'seguro'),
    [inquilinos]
  )

  // Opções únicas para os selects (Status, Modelo e Seguradora), geradas a partir dos dados reais
  const statusOptions = useMemo(() => {
    const set = new Set(seguradosFianca.map(i => i.status).filter(Boolean))
    return Array.from(set).sort()
  }, [seguradosFianca])

  const modeloOptions = useMemo(() => {
    const set = new Set(
      seguradosFianca
        .map(i => imovelMap[i.imovelId]?.modelo)
        .filter(Boolean)
    )
    return Array.from(set).sort()
  }, [seguradosFianca, imovelMap])

  const seguradoraOptions = useMemo(() => {
    const set = new Set(seguradosFianca.map(i => i.seguro).filter(Boolean))
    return Array.from(set).sort((a, b) =>
      (SEGURO_LABELS[a] || a).localeCompare(SEGURO_LABELS[b] || b)
    )
  }, [seguradosFianca])

  const filtered = useMemo(() => {
    const termoGeral = search.toLowerCase()
    const termoNome = filtroNome.toLowerCase()
    const termoImovel = filtroImovel.toLowerCase()
    const valorMin = filtroValorMin !== '' ? Number(filtroValorMin) : null
    const valorMax = filtroValorMax !== '' ? Number(filtroValorMax) : null

    return seguradosFianca.filter(i => {
      const imovel = imovelMap[i.imovelId]
      const nome = (i.nome || '').toLowerCase()
      const codigoImovel = (imovel?.codigo || i.codigoImovel || '').toLowerCase()
      const seguradora = (SEGURO_LABELS[i.seguro] || i.seguro || '').toLowerCase()
      const valor = Number(i.valorSeguro) || 0

      // Busca geral (mantida)
      const passaBuscaGeral =
        !termoGeral ||
        nome.includes(termoGeral) ||
        codigoImovel.includes(termoGeral) ||
        seguradora.includes(termoGeral)
      if (!passaBuscaGeral) return false

      // Nome
      if (termoNome && !nome.includes(termoNome)) return false

      // Status
      if (filtroStatus && i.status !== filtroStatus) return false

      // Imóvel
      if (termoImovel && !codigoImovel.includes(termoImovel)) return false

      // Modelo
      if (filtroModelo && imovel?.modelo !== filtroModelo) return false

      // Seguradora
      if (filtroSeguradora && i.seguro !== filtroSeguradora) return false

      // Valor do Seguro (faixa min/max)
      if (valorMin !== null && valor < valorMin) return false
      if (valorMax !== null && valor > valorMax) return false

      // 1º Mês de Cobrança
      if (filtroMesInicio && (i.seguroFiancaMesInicio || '') !== filtroMesInicio) return false

      // Último Mês de Cobrança
      if (filtroMesFim && (i.seguroFiancaMesFim || '') !== filtroMesFim) return false

      return true
    })
  }, [
    seguradosFianca,
    imovelMap,
    search,
    filtroNome,
    filtroStatus,
    filtroImovel,
    filtroModelo,
    filtroSeguradora,
    filtroValorMin,
    filtroValorMax,
    filtroMesInicio,
    filtroMesFim
  ])

  const totalMensal = seguradosFianca.reduce((s, i) => s + (Number(i.valorSeguro) || 0), 0)
  const ativos = seguradosFianca.filter(i => i.status === 'Ativo').length

  const abrirPortal = (inquilino) => {
    const nomeSeguro = String(inquilino.seguro || '').toLowerCase()
    if (nomeSeguro.includes('credpago')) { window.open(credpagoUrl(inquilino.nome), '_blank'); return }
    if (nomeSeguro.includes('credaluga')) { window.open(credalugaUrl(inquilino.nome), '_blank'); return }
    alert('Esta seguradora não possui portal integrado.')
  }

  const handleMesChange = (inquilinoId, campo, valor) => {
    update(ref(db, `inquilinos/${inquilinoId}`), { [campo]: valor })
  }

  const limparFiltros = () => {
    setFiltroNome('')
    setFiltroStatus('')
    setFiltroImovel('')
    setFiltroModelo('')
    setFiltroSeguradora('')
    setFiltroValorMin('')
    setFiltroValorMax('')
    setFiltroMesInicio('')
    setFiltroMesFim('')
  }

  const temFiltroAtivo =
    filtroNome || filtroStatus || filtroImovel || filtroModelo || filtroSeguradora ||
    filtroValorMin || filtroValorMax || filtroMesInicio || filtroMesFim

  return (
    <Layout title="Seguro Fiança" subtitle="Inquilinos com seguro fiança incluído nas contas">
      <div className="mb-6">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por nome, imóvel ou seguradora..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
              <Shield className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{seguradosFianca.length}</p>
              <p className="truncate text-sm text-muted-foreground">Com Seguro Fiança</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
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
          <CardContent className="flex items-center gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <Wallet className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold tracking-tight">{fmtMoney(totalMensal)}</p>
              <p className="truncate text-sm text-muted-foreground">Total Mensal em Seguros</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 border-b pb-4">
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
          ) : filtered.length === 0 ? (
            <div className="empty-state">Nenhum inquilino com seguro fiança encontrado.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Status</th>
                  <th>Imóvel</th>
                  <th>Modelo</th>
                  <th>Seguradora</th>
                  <th>Valor do Seguro</th>
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
                      value={filtroSeguradora}
                      onChange={e => setFiltroSeguradora(e.target.value)}
                      style={{ fontSize: 12, padding: '4px 8px', width: '100%' }}
                    >
                      <option value="">Todas</option>
                      {seguradoraOptions.map(s => (
                        <option key={s} value={s}>{SEGURO_LABELS[s] || s}</option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="number"
                        placeholder="Mín."
                        value={filtroValorMin}
                        onChange={e => setFiltroValorMin(e.target.value)}
                        style={{ fontSize: 12, padding: '4px 6px', width: '50%' }}
                      />
                      <input
                        type="number"
                        placeholder="Máx."
                        value={filtroValorMax}
                        onChange={e => setFiltroValorMax(e.target.value)}
                        style={{ fontSize: 12, padding: '4px 6px', width: '50%' }}
                      />
                    </div>
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
                {filtered.map(inq => {
                  const imovel = imovelMap[inq.imovelId]
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
                      <td>{SEGURO_LABELS[inq.seguro] || inq.seguro || '—'}</td>
                      <td>{fmtMoney(inq.valorSeguro)}</td>
                      <td>
                        <input
                          type="month"
                          defaultValue={inq.seguroFiancaMesInicio || ''}
                          onBlur={e => handleMesChange(inq.id, 'seguroFiancaMesInicio', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="month"
                          defaultValue={inq.seguroFiancaMesFim || ''}
                          onBlur={e => handleMesChange(inq.id, 'seguroFiancaMesFim', e.target.value)}
                        />
                      </td>
                      <td>
                        <div className="flex gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/inquilinos/editar/${inq.id}`)}>
                            <Pencil /> Editar
                          </Button>
                          <Button variant="outline" size="sm" title="Abrir portal da seguradora" onClick={() => abrirPortal(inq)}>
                            <LinkIcon /> Portal
                          </Button>
                        </div>
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
