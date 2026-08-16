import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const modeloBadge = { MA: 'badge-green', ME: 'badge-blue', ML: 'badge-yellow' }

const fmtMoney = (v) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

export default function SeguroIncendio() {
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
    return () => { unsub1(); unsub2() }
  }, [])

  const imovelMap = useMemo(
    () => Object.fromEntries(imoveis.map(im => [im.id, im])),
    [imoveis]
  )

  // Só entram aqui inquilinos com a conta "seguro_incendio" marcada como incluída
  const comSeguroIncendio = useMemo(
    () => inquilinos.filter(i => (i.contasInclusas || []).includes('seguro_incendio')),
    [inquilinos]
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
    const termoGeral = search.toLowerCase()
    const termoNome = filtroNome.toLowerCase()
    const termoImovel = filtroImovel.toLowerCase()

    return comSeguroIncendio.filter(i => {
      const imovel = imovelMap[i.imovelId]
      const nome = (i.nome || '').toLowerCase()
      const codigoImovel = (imovel?.codigo || i.codigoImovel || '').toLowerCase()
      const variavel = !!i.contasVariavel?.seguro_incendio

      // Busca geral (mantida)
      const passaBuscaGeral =
        !termoGeral || nome.includes(termoGeral) || codigoImovel.includes(termoGeral)
      if (!passaBuscaGeral) return false

      // Nome
      if (termoNome && !nome.includes(termoNome)) return false

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
    if (i.contasVariavel?.seguro_incendio) return s
    return s + (Number(i.contasValores?.seguro_incendio) || 0)
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
      <div className="actions-bar">
        <input
          type="text"
          placeholder="Buscar por nome ou imóvel..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon">🔥</div>
          <div className="stat-value">{comSeguroIncendio.length}</div>
          <div className="stat-label">Com Seguro Incêndio</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{ativos}</div>
          <div className="stat-label">Ativos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-value">{fmtMoney(totalMensal)}</div>
          <div className="stat-label">Total Mensal (valores fixos)</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Inquilinos ({filtered.length})</h3>
          {temFiltroAtivo && (
            <button
              className="btn btn-secondary"
              style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
              onClick={limparFiltros}
            >
              Limpar filtros
            </button>
          )}
        </div>
        <div className="table-container">
          {loading ? (
            <div className="empty-state">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">Nenhum inquilino com seguro incêndio encontrado.</div>
          ) : (
            <table>
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
                {filtered.map(inq => {
                  const imovel = imovelMap[inq.imovelId]
                  const variavel = !!inq.contasVariavel?.seguro_incendio
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
                          : fmtMoney(inq.contasValores?.seguro_incendio)}
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
                        <button
                          className="btn btn-secondary"
                          style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                          onClick={() => navigate(`/inquilinos/editar/${inq.id}`)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  )
}