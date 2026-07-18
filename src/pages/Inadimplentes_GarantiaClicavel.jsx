import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const statusBadge = {
  'Pendente':      'badge-yellow',
  'Pago':          'badge-green',
  'Em Negociação': 'badge-blue',
  'Protestado':    'badge-red',
  'Acordo':        'badge-blue',
}

const GARANTIA_LABELS = {
  seguro:       'Seguro Fiança',
  caucao:       'Caução',
  adiantamento: 'Adiantamento',
  sem_garantia: 'Sem Garantia',
}

const SEGURO_LABELS = {
  credaluga: 'Credaluga',
  credpago:  'Credpago',
  lado_bom:  'Lado Bom Seguros',
}

const fmtMoney = (v) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const getMonth = (d) =>
  d.mesReferencia || (d.dataVencimento ? d.dataVencimento.substring(0, 7) : null)

const formatMonthLabel = (ym) => {
  if (!ym) return 'Sem mês'
  const [y, m] = ym.split('-')
  return new Date(+y, +m - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase())
}

function buildMonthGroups(debitos) {
  const map = {}
  debitos.forEach(d => {
    const key = getMonth(d) || 'sem-mes'
    if (!map[key]) map[key] = []
    map[key].push(d)
  })
  return Object.entries(map).sort(([a], [b]) => b.localeCompare(a))
}

function monthStats(list) {
  const pending = list.filter(d => d.status !== 'Pago')
  const paid    = list.filter(d => d.status === 'Pago')
  const uniqueInq = new Set(pending.map(d => d.inquilinoId).filter(Boolean))
  return {
    totalInadimplentes: uniqueInq.size || pending.length,
    valorAberto:    pending.reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0),
    valorRecuperado: paid.reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0),
    totalDebitos: list.length,
  }
}

export default function Inadimplentes() {
  const navigate = useNavigate()
  const [debitos, setDebitos] = useState([])
  const [inquilinos, setInquilinos] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [mesSelecionado, setMesSelecionado] = useState(null)

  useEffect(() => {
    const r1 = ref(db, 'inadimplencias')
    const unsub1 = onValue(r1, snap => {
      const data = snap.val()
      setDebitos(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
      setLoading(false)
    })
    const r2 = ref(db, 'inquilinos')
    const unsub2 = onValue(r2, snap => {
      const data = snap.val()
      setInquilinos(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
    return () => { unsub1(); unsub2() }
  }, [])

  const getGarantia = (d) => {
    const g = d.garantia || inquilinos.find(i => i.id === d.inquilinoId)?.garantia
    const s = d.seguro   || inquilinos.find(i => i.id === d.inquilinoId)?.seguro
    if (!g) return null
    const label = GARANTIA_LABELS[g] || g
    if (g === 'seguro' && s) return `${label} — ${SEGURO_LABELS[s] || s}`
    return label
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este débito?')) return
    await remove(ref(db, `inadimplencias/${id}`))
  }

  const abrirWhatsApp = (d) => {
    const inquilino = inquilinos.find(i => i.id === d.inquilinoId)

    if (!inquilino?.telefone) {
      alert('Este inquilino não possui telefone cadastrado.')
      return
    }

    const telefone = inquilino.telefone.replace(/\D/g, '')
    const mensagem = encodeURIComponent(
      `Olá, ${inquilino.nome}! Tudo bem? Sou Matheus, da equipe financeira da Divid. Estou entrando em contato sobre um débito em aberto.`
    )

    window.open(`https://wa.me/55${telefone}?text=${mensagem}`, '_blank')
  }



  const abrirGarantia = (d) => {
    const inquilino = inquilinos.find(i => i.id === d.inquilinoId)
    if (!inquilino) return alert('Inquilino não encontrado.')
    if (inquilino.garantia === 'seguro' && inquilino.seguro === 'credpago') {
      const nome = encodeURIComponent(inquilino.nome)
      window.open(`https://credpago.com/imobiliaria/contratos/relatorio.php?search=${nome}`,'_blank')
      return
    }
    if (inquilino.garantia === 'seguro' && inquilino.seguro === 'credaluga') {
      window.open('https://app.credaluga.com.br/dashboard','_blank')
      return
    }
    alert('Este inquilino não possui Seguro Fiança.')
  }

  const pendentes    = debitos.filter(d => d.status !== 'Pago')
  const totalAberto  = pendentes.reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0)
  const totalRecup   = debitos.filter(d => d.status === 'Pago').reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0)
  const vencidos30   = pendentes.filter(d => {
    if (!d.dataVencimento) return false
    return (Date.now() - new Date(d.dataVencimento).getTime()) / 86400000 > 30
  }).length

  const monthGroups = buildMonthGroups(debitos)

  const baseList = mesSelecionado
    ? debitos.filter(d => (getMonth(d) || 'sem-mes') === mesSelecionado)
    : debitos

  const filtered = baseList.filter(d =>
    d.inquilinoNome?.toLowerCase().includes(search.toLowerCase()) ||
    d.codigoImovel?.toLowerCase().includes(search.toLowerCase()) ||
    d.tipoDebito?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Layout title="⚠️ Inadimplentes" subtitle="Controle de clientes com débitos pendentes">
      <div className="actions-bar">
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/inadimplentes/cadastrar')}>
          ➕ Registrar Débito
        </button>
        <input
          type="text"
          placeholder="Buscar por inquilino, imóvel ou tipo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
      </div>

      {/* ── Resumo Geral ── */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon">⚠️</div>
          <div className="stat-value">{pendentes.length}</div>
          <div className="stat-label">Débitos em Aberto</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💸</div>
          <div className="stat-value" style={{ fontSize: '16px' }}>{fmtMoney(totalAberto)}</div>
          <div className="stat-label">Total em Aberto</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value" style={{ fontSize: '16px' }}>{fmtMoney(totalRecup)}</div>
          <div className="stat-label">Total Recuperado</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <div className="stat-value">{vencidos30}</div>
          <div className="stat-label">Vencidos há +30 dias</div>
        </div>
      </div>

      {/* ── Resumo por Mês ── */}
      {monthGroups.length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h3>📆 Inadimplência por Mês</h3>
            {mesSelecionado && (
              <button className="btn btn-sm btn-secondary" onClick={() => setMesSelecionado(null)}>
                Limpar filtro
              </button>
            )}
          </div>
          <div className="card-body" style={{ paddingTop: '12px' }}>
            <div className="month-group-grid">
              {monthGroups.map(([ym, list]) => {
                const s = monthStats(list)
                const active = mesSelecionado === ym
                return (
                  <button
                    key={ym}
                    className={`month-card${active ? ' active' : ''}`}
                    onClick={() => setMesSelecionado(active ? null : ym)}
                    type="button"
                  >
                    <div className="mc-month">{formatMonthLabel(ym)}</div>
                    <div className="mc-stats">
                      <div className="mc-stat">
                        <span className="mc-stat-icon">👤</span>
                        <div>
                          <div className="mc-stat-value">{s.totalInadimplentes}</div>
                          <div className="mc-stat-label">Inadimplentes</div>
                        </div>
                      </div>
                      <div className="mc-stat">
                        <span className="mc-stat-icon">💸</span>
                        <div>
                          <div className="mc-stat-value" style={{ fontSize: '12px' }}>{fmtMoney(s.valorAberto)}</div>
                          <div className="mc-stat-label">Em Aberto</div>
                        </div>
                      </div>
                      <div className="mc-stat">
                        <span className="mc-stat-icon">✅</span>
                        <div>
                          <div className="mc-stat-value" style={{ fontSize: '12px' }}>{fmtMoney(s.valorRecuperado)}</div>
                          <div className="mc-stat-label">Recuperado</div>
                        </div>
                      </div>
                    </div>
                    <div className="mc-total">{s.totalDebitos} débito{s.totalDebitos !== 1 ? 's' : ''}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Tabela ── */}
      <div className="card">
        <div className="card-header">
          <h3>
            {mesSelecionado
              ? `Débitos — ${formatMonthLabel(mesSelecionado)} (${filtered.length})`
              : `Todos os Débitos (${filtered.length})`}
          </h3>
        </div>
        <div className="table-container">
          {loading ? (
            <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Inquilino</th>                  <th>Garantia</th>                  <th>Imóvel</th>
                  <th>Tipo</th>
                  <th>Mês Ref.</th>
                  <th>Vencimento</th>
                  <th>Valor Original</th>
                  <th>Total c/ Encargos</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-state">
                        <div className="es-icon">✅</div>
                        <h3>Nenhum débito encontrado</h3>
                        <p>Todos os pagamentos estão em dia.</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(d => (
                  <tr key={d.id}>
                    <td><strong>{d.inquilinoNome || '—'}</strong></td>
                    <td>
                      {(() => {
                        const g = getGarantia(d)
                        if (!g) return <span style={{ color: '#cbd5e1' }}>—</span>
                        const isSeguro = (d.garantia || inquilinos.find(i => i.id === d.inquilinoId)?.garantia) === 'seguro'
                        return (
                          <span
                          style={{
                            fontSize: 11, fontWeight: 600, borderRadius: 10, padding: '2px 8px',
                            background: isSeguro ? '#ede9fe' : '#f0fdf4',
                            color: isSeguro ? '#7c3aed' : '#166534',
                            border: `1px solid ${isSeguro ? '#c4b5fd' : '#86efac'}`,
                            cursor: isSeguro ? 'pointer' : 'default'
                          }}
                          onClick={() => {
                            if (!isSeguro) return
                            const inquilino = inquilinos.find(i => i.id === d.inquilinoId)
                            if (!inquilino) return
                            if (inquilino.seguro === 'credpago') {
                              window.open(`https://credpago.com/imobiliaria/contratos/relatorio.php?search=${encodeURIComponent(inquilino.nome)}`,'_blank')
                            } else if (inquilino.seguro === 'credaluga') {
                              window.open('https://app.credaluga.com.br/dashboard','_blank')
                            }
                          }}
                        >
                          {isSeguro ? '🛡️' : '💰'} {g}
                        </span>
                        )
                      })()}
                    </td>
                    <td>{d.codigoImovel || '—'}</td>
                    <td>{d.tipoDebito || '—'}</td>
                    <td>{d.mesReferencia ? formatMonthLabel(d.mesReferencia) : '—'}</td>
                    <td>{d.dataVencimento ? new Date(d.dataVencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                    <td>{fmtMoney(d.valorOriginal)}</td>
                    <td><strong>{fmtMoney(d.valorTotal)}</strong></td>
                    <td>
                      <span className={`badge ${statusBadge[d.status] || 'badge-gray'}`}>{d.status || 'Pendente'}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', borderColor: '#25D366' }} onClick={() => abrirWhatsApp(d)}>💬 WhatsApp</button>
                        <button className="btn btn-sm" onClick={() => navigate(`/inadimplentes/editar/${d.id}`)}>Editar</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(d.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  )
}

