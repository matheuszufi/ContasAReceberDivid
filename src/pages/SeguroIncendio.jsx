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

  const filtered = useMemo(() => {
    const termo = search.toLowerCase()
    return comSeguroIncendio.filter(i => {
      const imovel = imovelMap[i.imovelId]
      return (
        (i.nome || '').toLowerCase().includes(termo) ||
        (imovel?.codigo || i.codigoImovel || '').toLowerCase().includes(termo)
      )
    })
  }, [comSeguroIncendio, imovelMap, search])

  const ativos = comSeguroIncendio.filter(i => i.status === 'Ativo').length
  const totalMensal = comSeguroIncendio.reduce((s, i) => {
    if (i.contasVariavel?.seguro_incendio) return s
    return s + (Number(i.contasValores?.seguro_incendio) || 0)
  }, 0)

  const handleMesChange = (inquilinoId, campo, valor) => {
    update(ref(db, `inquilinos/${inquilinoId}`), { [campo]: valor })
  }

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
                  <th>Quem Paga</th>
                  <th>1º Mês de Cobrança</th>
                  <th>Último Mês de Cobrança</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inq => {
                  const imovel = imovelMap[inq.imovelId]
                  const variavel = !!inq.contasVariavel?.seguro_incendio
                  const pagador = inq.contasPagador?.seguro_incendio || (variavel ? 'imobiliaria' : 'inquilino')
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
                        <span className={`badge ${pagador === 'inquilino' ? 'badge-blue' : 'badge-gray'}`}>
                          {pagador === 'inquilino' ? 'Inquilino' : 'Imobiliária'}
                        </span>
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
