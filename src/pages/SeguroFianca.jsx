import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

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

  const filtered = useMemo(() => {
    const termo = search.toLowerCase()
    return seguradosFianca.filter(i => {
      const imovel = imovelMap[i.imovelId]
      const seguradora = SEGURO_LABELS[i.seguro] || i.seguro || ''
      return (
        (i.nome || '').toLowerCase().includes(termo) ||
        (imovel?.codigo || i.codigoImovel || '').toLowerCase().includes(termo) ||
        seguradora.toLowerCase().includes(termo)
      )
    })
  }, [seguradosFianca, imovelMap, search])

  const totalMensal = seguradosFianca.reduce((s, i) => s + (Number(i.valorSeguro) || 0), 0)
  const ativos = seguradosFianca.filter(i => i.status === 'Ativo').length

  const abrirPortal = (inquilino) => {
    if (inquilino.seguro === 'credpago') { window.open(credpagoUrl(inquilino.nome), '_blank'); return }
    if (inquilino.seguro === 'credaluga') { window.open(credalugaUrl(inquilino.nome), '_blank'); return }
    alert('Esta seguradora não possui portal integrado.')
  }

  const handleMesChange = (inquilinoId, campo, valor) => {
    update(ref(db, `inquilinos/${inquilinoId}`), { [campo]: valor })
  }

  return (
    <Layout title="Seguro Fiança" subtitle="Inquilinos com seguro fiança incluído nas contas">
      <div className="actions-bar">
        <input
          type="text"
          placeholder="Buscar por nome, imóvel ou seguradora..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon">🛡️</div>
          <div className="stat-value">{seguradosFianca.length}</div>
          <div className="stat-label">Com Seguro Fiança</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{ativos}</div>
          <div className="stat-label">Ativos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-value">{fmtMoney(totalMensal)}</div>
          <div className="stat-label">Total Mensal em Seguros</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Inquilinos ({filtered.length})</h3>
        </div>
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
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-secondary"
                            style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                            onClick={() => navigate(`/inquilinos/editar/${inq.id}`)}
                          >
                            Editar
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}
                            title="Abrir portal da seguradora"
                            onClick={() => abrirPortal(inq)}
                          >
                            🔗 Portal
                          </button>
                        </div>
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
