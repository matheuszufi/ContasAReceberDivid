import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, remove, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const STATUS_OPCOES = [
  { value: 'selecione',       label: 'Selecione',       bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  { value: 'seguro_aprovado', label: 'Seguro Aprovado', bg: '#f0fdf4', color: '#166534', border: '#86efac' },
  { value: 'nao_responde',    label: 'Não Responde',    bg: '#f7b5b5', color: '#6d1a17', border: '#86efac' },
  { value: 'acordo',          label: 'Acordo',          bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  { value: 'juridico',        label: 'Jurídico',        bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  { value: 'pago',            label: 'Pago',            bg: '#f0fdf4', color: '#166534', border: '#86efac' },
]

const SEGURO_ACIONADO_OPCOES = [
  { value: 'nao_acionado',          label: 'Não Acionado',          bg: '#f0fdf4', color: '#166534', border: '#86efac' },
  { value: 'acionado',              label: 'Acionado',              bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  { value: 'aguardar_para_acionar', label: 'Aguardar para Acionar', bg: '#eff6ff', color: '#555555', border: '#727272' },
  { value: 'necessita_documentos',  label: 'Necessita Documentos',  bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  { value: 'pagamento_aprovado',    label: 'Pagamento Aprovado',    bg: '#f0fdf4', color: '#166534', border: '#86efac' },
  { value: 'pagamento_reprovado',   label: 'Pagamento Reprovado',   bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
]

const GARANTIA_LABELS = {
  seguro:       'S.F.',
  caucao:       'Caução',
  adiantamento: 'Adiantamento',
  sem_garantia: 'Sem Garantia',
}

const SEGURO_LABELS = {
  credaluga: 'Credaluga',
  credpago:  'Credpago',
  lado_bom:  'Lado Bom',
}

const GARANTIA_STYLE = {
  seguro:       { bg: '#ede9fe', color: '#7c3aed', border: '#c4b5fd', icon: '🛡️' },
  caucao:       { bg: '#f0fdf4', color: '#166534', border: '#86efac', icon: '💰' },
  adiantamento: { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd', icon: '💵' },
  sem_garantia: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', icon: '🚫' },
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
  const pending = list.filter(d => d.status !== 'pago')
  const paid    = list.filter(d => d.status === 'pago')
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
  const [colFilters, setColFilters] = useState({
    inquilino: '',
    imovel: '',
    garantia: '',
    seguroAcionado: '',
    tipo: '',
    mesReferencia: '',
    status: '',
  })

  const setColFilter = (field, value) =>
    setColFilters(prev => ({ ...prev, [field]: value }))

  const limparColFilters = () =>
    setColFilters({
      inquilino: '', imovel: '', garantia: '', seguroAcionado: '',
      tipo: '', mesReferencia: '', status: '',
    })

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
    const g = d.garantia || inquilinos.find(i => i.id === d.inquilinoId)?.garantia || 'sem_garantia'
    const s = d.seguro   || inquilinos.find(i => i.id === d.inquilinoId)?.seguro
    const label = GARANTIA_LABELS[g] || g
    const fullLabel = (g === 'seguro' && s) ? `${label} | ${SEGURO_LABELS[s] || s}` : label
    return { key: g, label: fullLabel }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este débito?')) return
    await remove(ref(db, `inadimplencias/${id}`))
  }

  const handleSeguroAcionadoChange = async (id, value) => {
    await update(ref(db, `inadimplencias/${id}`), { seguroAcionado: value })
  }

  const handleStatusChange = async (id, value) => {
    await update(ref(db, `inadimplencias/${id}`), { status: value })
  }

  const handleUltimaCobrancaChange = async (id, value) => {
    await update(ref(db, `inadimplencias/${id}`), { ultimaCobranca: value })
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

  const pendentes    = debitos.filter(d => d.status !== 'pago')
  const totalAberto  = pendentes.reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0)
  const totalRecup   = debitos.filter(d => d.status === 'pago').reduce((s, d) => s + (d.valorTotal || d.valorOriginal || 0), 0)
  const vencidos30   = pendentes.filter(d => {
    if (!d.dataVencimento) return false
    return (Date.now() - new Date(d.dataVencimento).getTime()) / 86400000 > 30
  }).length

  const monthGroups = buildMonthGroups(debitos)

  const baseList = mesSelecionado
    ? debitos.filter(d => (getMonth(d) || 'sem-mes') === mesSelecionado)
    : debitos

  // Opções únicas para os selects de filtro (calculadas a partir da lista atual)
  const tipoOptions = [...new Set(baseList.map(d => d.tipoDebito).filter(Boolean))].sort()
  const mesRefOptions = [...new Set(baseList.map(d => d.mesReferencia).filter(Boolean))].sort((a, b) => b.localeCompare(a))
  const garantiaOptions = [...new Set(baseList.map(d => getGarantia(d).key))]

  const filtered = baseList
    .filter(d =>
      d.inquilinoNome?.toLowerCase().includes(search.toLowerCase()) ||
      d.codigoImovel?.toLowerCase().includes(search.toLowerCase()) ||
      d.tipoDebito?.toLowerCase().includes(search.toLowerCase())
    )
    .filter(d => !colFilters.inquilino || d.inquilinoNome?.toLowerCase().includes(colFilters.inquilino.toLowerCase()))
    .filter(d => !colFilters.imovel || d.codigoImovel?.toLowerCase().includes(colFilters.imovel.toLowerCase()))
    .filter(d => !colFilters.garantia || getGarantia(d).key === colFilters.garantia)
    .filter(d => !colFilters.seguroAcionado || (d.seguroAcionado || 'nao_acionado') === colFilters.seguroAcionado)
    .filter(d => !colFilters.tipo || d.tipoDebito === colFilters.tipo)
    .filter(d => !colFilters.mesReferencia || d.mesReferencia === colFilters.mesReferencia)
    .filter(d => !colFilters.status || d.status === colFilters.status)

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
          {Object.values(colFilters).some(v => v) && (
            <button className="btn btn-sm btn-secondary" onClick={limparColFilters}>
              Limpar filtros
            </button>
          )}
        </div>
        <div className="table-container">
          {loading ? (
            <div className="empty-state"><div className="es-icon">⏳</div><p>Carregando...</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Inquilino</th>
                  <th>Imóvel</th>
                  <th>Garantia</th>
                  <th>Seguro Acionado</th>
                  <th>Última Cobrança</th>
                  <th>Tipo</th>
                  <th>Mês Ref.</th>
                  <th>Total c/ Encargos</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
                <tr className="filter-row">
                  <th>
                    <input
                      type="text"
                      placeholder="Filtrar..."
                      value={colFilters.inquilino}
                      onChange={e => setColFilter('inquilino', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    />
                  </th>
                  <th>
                    <input
                      type="text"
                      placeholder="Filtrar..."
                      value={colFilters.imovel}
                      onChange={e => setColFilter('imovel', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    />
                  </th>
                  <th>
                    <select
                      value={colFilters.garantia}
                      onChange={e => setColFilter('garantia', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 4px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    >
                      <option value="">Todas</option>
                      {garantiaOptions.map(g => (
                        <option key={g} value={g}>{GARANTIA_LABELS[g] || g}</option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <select
                      value={colFilters.seguroAcionado}
                      onChange={e => setColFilter('seguroAcionado', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 4px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    >
                      <option value="">Todos</option>
                      {SEGURO_ACIONADO_OPCOES.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </th>
                  <th></th>
                  <th>
                    <select
                      value={colFilters.tipo}
                      onChange={e => setColFilter('tipo', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 4px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    >
                      <option value="">Todos</option>
                      {tipoOptions.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <select
                      value={colFilters.mesReferencia}
                      onChange={e => setColFilter('mesReferencia', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 4px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    >
                      <option value="">Todos</option>
                      {mesRefOptions.map(m => (
                        <option key={m} value={m}>{formatMonthLabel(m)}</option>
                      ))}
                    </select>
                  </th>
                  <th></th>
                  <th>
                    <select
                      value={colFilters.status}
                      onChange={e => setColFilter('status', e.target.value)}
                      style={{ width: '100%', fontSize: 11, padding: '3px 4px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                    >
                      <option value="">Todos</option>
                      {STATUS_OPCOES.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </th>
                  <th></th>
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
                    <td>{d.codigoImovel || '—'}</td>
                    <td>
                      {(() => {
                        const { key: gKey, label: g } = getGarantia(d)
                        const style = GARANTIA_STYLE[gKey] || GARANTIA_STYLE.sem_garantia
                        const isSeguro = gKey === 'seguro'
                        return (
                          <span style={{fontSize: 11, fontWeight: 600, borderRadius: 10, padding: '2px 8px', background: style.bg, whiteSpace: 'nowrap', color: style.color, border: `1px solid ${style.border}`,
                            cursor: isSeguro ? 'pointer' : 'default'}} onClick={() => {if (!isSeguro) return
                            const inquilino = inquilinos.find(i => i.id === d.inquilinoId)
                            if (!inquilino) return
                            if (inquilino.seguro === 'credpago') {
                              window.open(`https://credpago.com/imobiliaria/contratos/relatorio.php?search=${encodeURIComponent(inquilino.nome)}`,'_blank')
                            } else if (inquilino.seguro === 'credaluga') {
                              window.open('https://app.credaluga.com.br/dashboard','_blank')
                            }
                            }} >
                          {style.icon} {g}
                        </span>
                        )
                      })()}
                    </td>
                    <td>
                      {(() => {
                        const current = SEGURO_ACIONADO_OPCOES.find(o => o.value === d.seguroAcionado) || SEGURO_ACIONADO_OPCOES[0]
                        return (
                          <select
                            value={current.value}
                            onChange={e => handleSeguroAcionadoChange(d.id, e.target.value)}
                            style={{
                              fontSize: 11, fontWeight: 600, borderRadius: 10, padding: '2px 8px',
                              background: current.bg,
                              color: current.color,
                              border: `1px solid ${current.border}`,
                              cursor: 'pointer'
                            }}
                          >
                            {SEGURO_ACIONADO_OPCOES.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        )
                      })()}
                    </td>
                    <td>
                      <input
                        type="date"
                        value={d.ultimaCobranca || ''}
                        onChange={e => handleUltimaCobrancaChange(d.id, e.target.value)}
                        style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid #e2e8f0' }}
                      />
                    </td>
                    <td>{d.tipoDebito || '—'}</td>
                    <td>{d.mesReferencia ? formatMonthLabel(d.mesReferencia) : '—'}</td>
                    <td><strong>{fmtMoney(d.valorTotal)}</strong></td>
                    <td>
                      {(() => {
                        const current = STATUS_OPCOES.find(o => o.value === d.status) || STATUS_OPCOES[0]
                        return (
                          <select
                            value={current.value}
                            onChange={e => handleStatusChange(d.id, e.target.value)}
                            style={{
                              fontSize: 11, fontWeight: 600, borderRadius: 10, padding: '2px 8px',
                              background: current.bg,
                              color: current.color,
                              border: `1px solid ${current.border}`,
                              cursor: 'pointer'
                            }}
                          >
                            {STATUS_OPCOES.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        )
                      })()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-sm" style={{ background: '#25d365a9', color: '#fff', borderColor: '#178d42' }} onClick={() => abrirWhatsApp(d)}>WhatsApp</button>
                        <button className="btn btn-sm" onClick={() => navigate(`/inadimplentes/editar/${d.id}`)}>Editar</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(d.id)}>X</button>
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
