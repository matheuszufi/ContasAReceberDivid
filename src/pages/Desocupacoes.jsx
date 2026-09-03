import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, onValue, update, remove, push } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Package, House, Search, Plus, Pencil, Trash2, X, Undo2, Repeat } from 'lucide-react'
import './Desocupacoes.css'

const GARANTIA_OPCOES = [
  { value: 'seguro',       label: 'Seguro' },
  { value: 'caucao',       label: 'Caução' },
  { value: 'adiantamento', label: 'Adiantamento' },
  { value: 'sem_garantia', label: 'Sem Garantia' },
]

const modeloBadge = { MA: 'badge-green', ME: 'badge-blue', ML: 'badge-yellow' }

const fmtMoney = (v) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

// Célula de status: exibe o badge; ao clicar, vira um select para trocar Ativo/Inativo
function StatusCell({ status, onChange }) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <td className="editable-cell editing">
        <select
          autoFocus
          value={status || 'Ativo'}
          onChange={e => { onChange(e.target.value); setEditing(false) }}
          onBlur={() => setEditing(false)}
        >
          <option value="Ativo">Ativo</option>
          <option value="Inativo">Inativo</option>
        </select>
      </td>
    )
  }

  return (
    <td className="editable-cell" onClick={() => setEditing(true)} title="Clique para alterar o status">
      <span className={`badge ${status === 'Inativo' ? 'badge-gray' : 'badge-green'}`}>
        {status || 'Ativo'}
      </span>
    </td>
  )
}

export default function Desocupacoes() {
  const navigate = useNavigate()
  const [inquilinos, setInquilinos] = useState([])
  const [imoveis, setImoveis] = useState([])
  const [contasCatalogo, setContasCatalogo] = useState([])
  const [valoresVariaveis, setValoresVariaveis] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [novoInquilinoId, setNovoInquilinoId] = useState('')
  const [addingExtraFor, setAddingExtraFor] = useState(null)
  const [novaContaNome, setNovaContaNome] = useState('')
  const [novaContaValor, setNovaContaValor] = useState('')
  const [trocaModal, setTrocaModal] = useState(null)
  const [trocaForm, setTrocaForm] = useState({ imovelId: '', valorAluguel: '', garantia: '', valorGarantia: '', valorSeguro: '' })
  const [trocaSaving, setTrocaSaving] = useState(false)

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
    const r4 = ref(db, 'valoresVariaveis')
    const unsub4 = onValue(r4, snap => {
      setValoresVariaveis(snap.val() || {})
    })
    return () => { unsub1(); unsub2(); unsub3(); unsub4() }
  }, [])

  const imovelMap = useMemo(
    () => Object.fromEntries(imoveis.map(im => [im.id, im])),
    [imoveis]
  )

  // Resolve nome/icone de uma conta pelo catalogo novo (Firebase) ou pelo esquema antigo
  const getContaMeta = (k) => {
    const catalogConta = contasCatalogo.find(c => c.id === k)
    if (catalogConta) return { label: catalogConta.nome, icone: catalogConta.icone || '📄' }
    return { label: k, icone: '📄' }
  }

  // Monta a lista de contas cobradas no mes de saida do inquilino: parte dos valores do
  // contrato (aluguel, contas do imovel, seguro fianca, garagem) e sobrescreve com o que
  // estiver salvo em valoresVariaveis para aquele mes, incluindo contas extras lancadas nele.
  const getContasMes = (inq) => {
    if (!inq.dataSaida) return []
    const imovel = imovelMap[inq.imovelId]
    const monthKey = inq.dataSaida.substring(0, 7)
    const saved = valoresVariaveis[inq.id]?.[monthKey] || {}
    const { extras, _obs, ...savedVals } = saved
    const itens = []

    const aluguel = savedVals._aluguel !== undefined ? Number(savedVals._aluguel) : (Number(inq.valorAluguel) || 0)
    if (aluguel) itens.push({ key: '_aluguel', icone: '🏠', label: 'Aluguel', valor: aluguel })

    ;(imovel?.contasInclusas || []).forEach(contaId => {
      if (imovel.contasVariavel?.[contaId] && savedVals[contaId] === undefined) return
      const { label, icone } = getContaMeta(contaId)
      const valor = savedVals[contaId] !== undefined ? Number(savedVals[contaId]) : (Number(inq.contasValores?.[contaId]) || 0)
      if (valor) itens.push({ key: contaId, icone, label, valor })
    })

    if (inq.garantia === 'seguro') {
      const valor = savedVals._seguro !== undefined ? Number(savedVals._seguro) : (Number(inq.valorSeguro) || 0)
      if (valor) itens.push({ key: '_seguro', icone: '🛡️', label: 'Seguro Fiança', valor })
    }

    const garagemPadrao = (Number(inq.vagas) || 0) * (Number(inq.valorVaga) || 0)
    const garagemValor = savedVals._garagem !== undefined ? Number(savedVals._garagem) : garagemPadrao
    if (garagemValor) itens.push({ key: '_garagem', icone: '🚗', label: 'Garagem', valor: garagemValor })

    if (extras) {
      Object.entries(extras).forEach(([id, e]) => {
        if (e?.nome) itens.push({ key: `extra_${id}`, icone: '📋', label: e.nome, valor: Number(e.valor) || 0 })
      })
    }

    return itens
  }

  // Entram aqui os inquilinos com data de saída registrada (mesmo campo usado em
  // Inquilinos.jsx e no modal de Desocupação) ou marcados manualmente pelo flag;
  // inquilinos inativos somem da planilha assim que o status é alterado
  const desocupando = useMemo(
    () => inquilinos.filter(i => (i.dataSaida || i.desocupando) && i.status !== 'Inativo'),
    [inquilinos]
  )

  // Já desocuparam: inquilinos inativados (assim que o status vira Inativo, saem da
  // planilha "Desocupando" acima e entram aqui, mantendo o histórico de data/contas)
  const jaDesocuparam = useMemo(
    () => inquilinos
      .filter(i => i.status === 'Inativo' && (i.dataSaida || i.desocupando))
      .sort((a, b) => (b.dataSaida || '').localeCompare(a.dataSaida || '')),
    [inquilinos]
  )

  const disponiveisParaAdicionar = useMemo(
    () => inquilinos
      .filter(i => !i.dataSaida && !i.desocupando)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '')),
    [inquilinos]
  )

  const filtered = useMemo(() => {
    const termo = search.toLowerCase()
    return desocupando.filter(i => {
      const imovel = imovelMap[i.imovelId]
      return (
        (i.nome || '').toLowerCase().includes(termo) ||
        (imovel?.codigo || i.codigoImovel || '').toLowerCase().includes(termo)
      )
    })
  }, [desocupando, imovelMap, search])

  const filteredDesocupados = useMemo(() => {
    const termo = search.toLowerCase()
    return jaDesocuparam.filter(i => {
      const imovel = imovelMap[i.imovelId]
      return (
        (i.nome || '').toLowerCase().includes(termo) ||
        (imovel?.codigo || i.codigoImovel || '').toLowerCase().includes(termo)
      )
    })
  }, [jaDesocuparam, imovelMap, search])

  const imoveisEnvolvidos = useMemo(
    () => new Set(desocupando.map(i => i.imovelId).filter(Boolean)).size,
    [desocupando]
  )

  // Imóveis livres para receber um inquilino em troca de unidade (exclui o imóvel atual dele)
  const imoveisDisponiveisParaTroca = useMemo(
    () => imoveis
      .filter(im => im.status === 'Disponível' && im.id !== trocaModal?.imovelId)
      .sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '')),
    [imoveis, trocaModal]
  )

  const abrirTrocaModal = (inq) => {
    setTrocaModal(inq)
    setTrocaForm({
      imovelId: '',
      valorAluguel: inq.valorAluguel ? String(inq.valorAluguel) : '',
      garantia: inq.garantia || '',
      valorGarantia: inq.valorGarantia ? String(inq.valorGarantia) : '',
      valorSeguro: inq.valorSeguro ? String(inq.valorSeguro) : '',
    })
  }

  const cancelarTrocaModal = () => {
    if (trocaSaving) return
    setTrocaModal(null)
  }

  const handleTrocaFormChange = (campo, valor) => {
    setTrocaForm(prev => ({ ...prev, [campo]: valor }))
  }

  // Registra a troca de unidade: grava o imóvel antigo no histórico do inquilino (com data de
  // entrada/saída), libera o imóvel antigo, ocupa o novo, e atualiza o inquilino para continuar
  // ativo no novo imóvel (some da lista de desocupações, já que dataSaida/desocupando são limpos).
  const handleConfirmarTroca = async () => {
    if (!trocaModal || !trocaForm.imovelId) return
    setTrocaSaving(true)
    try {
      const inq = trocaModal
      const imovelAntigo = imovelMap[inq.imovelId]
      const imovelNovo = imovelMap[trocaForm.imovelId]
      const hoje = new Date().toISOString().substring(0, 10)

      await push(ref(db, `inquilinos/${inq.id}/historicoImoveis`), {
        imovelId: inq.imovelId || null,
        codigoImovel: imovelAntigo?.codigo || inq.codigoImovel || null,
        dataEntrada: inq.dataEntrada || null,
        dataSaida: inq.dataSaida || hoje,
      })

      if (inq.imovelId) {
        await update(ref(db, `imoveis/${inq.imovelId}`), { status: 'Disponível' })
      }
      await update(ref(db, `imoveis/${trocaForm.imovelId}`), { status: 'Ocupado' })

      await update(ref(db, `inquilinos/${inq.id}`), {
        imovelId: trocaForm.imovelId,
        codigoImovel: imovelNovo?.codigo || '',
        valorAluguel: parseFloat(trocaForm.valorAluguel) || 0,
        garantia: trocaForm.garantia,
        valorGarantia: (trocaForm.garantia === 'caucao' || trocaForm.garantia === 'adiantamento') ? (parseFloat(trocaForm.valorGarantia) || 0) : 0,
        valorSeguro: trocaForm.garantia === 'seguro' ? (parseFloat(trocaForm.valorSeguro) || 0) : 0,
        dataEntrada: hoje,
        dataSaida: '',
        desocupando: false,
      })

      setTrocaModal(null)
    } catch (err) {
      console.error('Erro ao trocar de imóvel:', err)
      window.alert(`Falha ao trocar de imóvel:\n${err.message}`)
    } finally {
      setTrocaSaving(false)
    }
  }

  const handleCampoChange = (inquilinoId, campo, valor) => {
    update(ref(db, `inquilinos/${inquilinoId}`), { [campo]: valor })
  }

  const handleStatusChange = (inq, status) => {
    const updates = { status }
    // ao inativar, o inquilino sai do imóvel e o imóvel volta a ficar disponível
    if (status === 'Inativo' && inq.imovelId) {
      updates.imovelId = null
      update(ref(db, `imoveis/${inq.imovelId}`), { status: 'Disponível' })
    }
    update(ref(db, `inquilinos/${inq.id}`), updates)
  }

  const handleAdicionar = (e) => {
    e.preventDefault()
    if (!novoInquilinoId) return
    update(ref(db, `inquilinos/${novoInquilinoId}`), { desocupando: true })
    setNovoInquilinoId('')
  }

  const handleRemover = (inquilinoId) => {
    if (!window.confirm('Remover este inquilino da lista de desocupações?')) return
    update(ref(db, `inquilinos/${inquilinoId}`), { desocupando: false, dataSaida: '' })
  }

  // Reverte um inquilino já desocupado de volta para "Ativo", caso tenha sido
  // inativado por engano ou precise voltar a aparecer como inquilino corrente
  const handleReativar = (inquilinoId) => {
    if (!window.confirm('Reativar este inquilino?')) return
    update(ref(db, `inquilinos/${inquilinoId}`), { status: 'Ativo' })
  }

  const abrirAdicionarConta = (inq) => {
    setAddingExtraFor(inq.id)
    setNovaContaNome('')
    setNovaContaValor('')
  }

  const cancelarAdicionarConta = () => {
    setAddingExtraFor(null)
    setNovaContaNome('')
    setNovaContaValor('')
  }

  // Salva a conta extra em valoresVariaveis/{inquilino}/{mês}/extras, o mesmo nó lido pela
  // planilha de Imóveis Todos, então a conta aparece automaticamente lá também.
  const handleAdicionarConta = async (inq) => {
    const nome = novaContaNome.trim()
    const valor = parseFloat(novaContaValor)
    if (!nome || isNaN(valor) || !inq.dataSaida) return
    const monthKey = inq.dataSaida.substring(0, 7)
    const extraId = `extra_${Date.now()}`
    await update(ref(db, `valoresVariaveis/${inq.id}/${monthKey}/extras/${extraId}`), { nome, valor })
    cancelarAdicionarConta()
  }

  const handleRemoverConta = (inq, item) => {
    if (!item.key.startsWith('extra_') || !inq.dataSaida) return
    const monthKey = inq.dataSaida.substring(0, 7)
    remove(ref(db, `valoresVariaveis/${inq.id}/${monthKey}/extras/${item.key}`))
  }

  // Renderiza a lista de badges de contas (reaproveitada pelas duas tabelas)
  const renderContasMes = (inq, itens, editable) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, maxWidth: 340 }}>
      {itens.map(item => (
        <span
          key={item.key}
          title={item.label}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12,
            padding: '2px 6px', fontSize: 11, whiteSpace: 'nowrap',
          }}
        >
          {item.icone} {item.label}: {fmtMoney(item.valor)}
          {editable && item.key.startsWith('extra_') && (
            <X
              className="size-3 cursor-pointer text-muted-foreground hover:text-destructive"
              onClick={() => handleRemoverConta(inq, item)}
            />
          )}
        </span>
      ))}
      {editable && inq.dataSaida && (
        addingExtraFor === inq.id ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <input
              autoFocus
              type="text"
              placeholder="Nome"
              value={novaContaNome}
              onChange={e => setNovaContaNome(e.target.value)}
              style={{ width: 90, fontSize: 11, padding: '2px 4px' }}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Valor"
              value={novaContaValor}
              onChange={e => setNovaContaValor(e.target.value)}
              style={{ width: 70, fontSize: 11, padding: '2px 4px' }}
            />
            <Button size="sm" className="h-6 px-2" onClick={() => handleAdicionarConta(inq)}>OK</Button>
            <Button size="sm" variant="outline" className="h-6 px-2" onClick={cancelarAdicionarConta}>✕</Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => abrirAdicionarConta(inq)}
            title="Adicionar conta"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              border: '1px dashed #cbd5e1', borderRadius: 12, background: 'transparent',
              padding: '2px 6px', fontSize: 11, cursor: 'pointer', color: '#64748b',
            }}
          >
            <Plus className="size-3" /> conta
          </button>
        )
      )}
    </div>
  )

  return (
    <Layout title="Desocupações" subtitle="Controle de inquilinos em processo de desocupação">
      <div className="mb-6 flex flex-wrap items-center gap-2">
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
        <form onSubmit={handleAdicionar} className="ml-auto flex items-center gap-2">
          <select
            value={novoInquilinoId}
            onChange={e => setNovoInquilinoId(e.target.value)}
            className="h-9 min-w-[240px] rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">Selecione um inquilino...</option>
            {disponiveisParaAdicionar.map(i => (
              <option key={i.id} value={i.id}>{i.nome}</option>
            ))}
          </select>
          <Button type="submit">
            <Plus /> Adicionar
          </Button>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-2">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <Package className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{desocupando.length}</p>
              <p className="truncate text-sm text-muted-foreground">Desocupando</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <House className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{imoveisEnvolvidos}</p>
              <p className="truncate text-sm text-muted-foreground">Imóveis Envolvidos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-slate-500/10 text-slate-600">
              <Trash2 className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight">{jaDesocuparam.length}</p>
              <p className="truncate text-sm text-muted-foreground">Já Desocuparam</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-lg">Inquilinos Desocupando ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
        <div className="table-container">
          {loading ? (
            <div className="empty-state">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">Nenhum inquilino em processo de desocupação.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Inquilino</th>
                  <th>Imóvel</th>
                  <th>Modelo</th>
                  <th>Data de Saída</th>
                  <th>Contas do Mês de Desocupação</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inq => {
                  const imovel = imovelMap[inq.imovelId]
                  const contasMes = getContasMes(inq)
                  return (
                    <tr key={inq.id}>
                      <td>{inq.nome}</td>
                      <td>{imovel?.codigo || inq.codigoImovel || '—'}</td>
                      <td>
                        {imovel?.modelo
                          ? <span className={`badge ${modeloBadge[imovel.modelo] || 'badge-gray'}`}>{imovel.modelo}</span>
                          : '—'}
                      </td>
                      <td>
                        <input
                          type="date"
                          defaultValue={inq.dataSaida || ''}
                          onBlur={e => handleCampoChange(inq.id, 'dataSaida', e.target.value)}
                        />
                      </td>
                      <td>{renderContasMes(inq, contasMes, true)}</td>
                      <td>
                        <StatusCell status={inq.status} onChange={v => handleStatusChange(inq, v)} />
                      </td>
                      <td className="flex gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/inquilinos/editar/${inq.id}`)}>
                          <Pencil /> Editar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => abrirTrocaModal(inq)}>
                          <Repeat /> Trocar de Imóvel
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleRemover(inq.id)}>
                          <Trash2 /> Remover
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

      <Card>
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-lg">Inquilinos que já Desocuparam ({filteredDesocupados.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
        <div className="table-container">
          {loading ? (
            <div className="empty-state">Carregando...</div>
          ) : filteredDesocupados.length === 0 ? (
            <div className="empty-state">Nenhum inquilino desocupou ainda.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Inquilino</th>
                  <th>Imóvel</th>
                  <th>Modelo</th>
                  <th>Data de Saída</th>
                  <th>Contas do Mês de Desocupação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredDesocupados.map(inq => {
                  const imovel = imovelMap[inq.imovelId]
                  const contasMes = getContasMes(inq)
                  return (
                    <tr key={inq.id}>
                      <td>{inq.nome}</td>
                      <td>{imovel?.codigo || inq.codigoImovel || '—'}</td>
                      <td>
                        {imovel?.modelo
                          ? <span className={`badge ${modeloBadge[imovel.modelo] || 'badge-gray'}`}>{imovel.modelo}</span>
                          : '—'}
                      </td>
                      <td>{inq.dataSaida ? new Date(inq.dataSaida + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                      <td>{renderContasMes(inq, contasMes, false)}</td>
                      <td className="flex gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/inquilinos/editar/${inq.id}`)}>
                          <Pencil /> Editar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleReativar(inq.id)}>
                          <Undo2 /> Reativar
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

      {trocaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 420 }}>
            <h3 style={{ margin: '0 0 4px' }}>Trocar de Imóvel</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
              {trocaModal.nome} sairá de {imovelMap[trocaModal.imovelId]?.codigo || trocaModal.codigoImovel || 'imóvel atual'} e passará a ocupar o novo imóvel selecionado.
              O imóvel atual entra no histórico do inquilino com a data de saída de hoje.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Novo Imóvel *</label>
                <select
                  value={trocaForm.imovelId}
                  onChange={e => handleTrocaFormChange('imovelId', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                >
                  <option value="">Selecione um imóvel disponível...</option>
                  {imoveisDisponiveisParaTroca.map(im => (
                    <option key={im.id} value={im.id}>{im.codigo} — {im.endereco?.rua || ''} {im.endereco?.numero || ''}</option>
                  ))}
                </select>
                {imoveisDisponiveisParaTroca.length === 0 && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#b45309' }}>Nenhum imóvel disponível no momento.</p>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Valor do Aluguel (R$) *</label>
                <input
                  type="number" step="0.01" min="0"
                  value={trocaForm.valorAluguel}
                  onChange={e => handleTrocaFormChange('valorAluguel', e.target.value)}
                  placeholder="0,00"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Garantia</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {GARANTIA_OPCOES.map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="trocaGarantia"
                        value={opt.value}
                        checked={trocaForm.garantia === opt.value}
                        onChange={e => handleTrocaFormChange('garantia', e.target.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              {(trocaForm.garantia === 'caucao' || trocaForm.garantia === 'adiantamento') && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {`Valor d${trocaForm.garantia === 'caucao' ? 'a Caução' : 'o Adiantamento'} (R$)`}
                  </label>
                  <input
                    type="number" step="0.01" min="0"
                    value={trocaForm.valorGarantia}
                    onChange={e => handleTrocaFormChange('valorGarantia', e.target.value)}
                    placeholder="0,00"
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              )}
              {trocaForm.garantia === 'seguro' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Valor do Seguro Fiança (R$)</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={trocaForm.valorSeguro}
                    onChange={e => handleTrocaFormChange('valorSeguro', e.target.value)}
                    placeholder="0,00"
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="outline" onClick={cancelarTrocaModal} disabled={trocaSaving}>Cancelar</Button>
              <Button onClick={handleConfirmarTroca} disabled={trocaSaving || !trocaForm.imovelId}>
                {trocaSaving ? 'Salvando...' : 'Confirmar Troca'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
