import React, { useEffect, useMemo, useState } from 'react'
import { ref, onValue, remove, update } from 'firebase/database'
import { useNavigate } from 'react-router-dom'
import { Clock, ArrowRight, X, Pencil, Check } from 'lucide-react'
import { db } from '../firebase'
import Layout from '../components/Layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

const HISTORICO_CAMPO_STYLE = {
  status:         { bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  seguroAcionado: { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
}

const fmtMoney = (value) =>
  'R$ ' + Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const fmtDataHora = (timestamp) => {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const toDatetimeLocal = (timestamp) => {
  const d = timestamp ? new Date(timestamp) : new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fromDatetimeLocal = (value) => {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

const formatDateToMonthKey = (value) => {
  if (!value) return null
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const fmtDataCurta = (ymd) => {
  if (!ymd) return null
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

const getMonthLabel = (monthKey) => {
  if (!monthKey) return 'Ano inteiro'
  const [year, month] = monthKey.split('-')
  return new Date(+year, +month - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase())
}

const normalizarHistoricoValor = (valor) => String(valor ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]/g, '')
  .toLowerCase()

const somenteDigitos = (valor) => String(valor ?? '').replace(/\D/g, '')

// Mesmo critério do card "Histórico de Alterações na Inadimplência" do Dashboard.
const isHistoricoAlteracaoVisivel = (item) => {
  if (item.origem === 'planilha_cobranca') return false
  if (item.campo === 'seguroAcionado') {
    const novo = normalizarHistoricoValor(item.valorNovoKey || item.valorNovoLabel)
    return ['acionado', 'pagamentoaprovado', 'pagamentoreprovado', 'pagopelaseguradora', 'juridico'].includes(novo)
  }
  if (item.campo === 'status') {
    const novo = normalizarHistoricoValor(item.valorNovoKey || item.valorNovoLabel)
    return novo === 'pago'
  }
  return false
}

export default function HistoricoAlteracoesInadimplencia() {
  const navigate = useNavigate()
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [historicoAlteracoes, setHistoricoAlteracoes] = useState([])
  const [inadimplencias, setInadimplencias] = useState([])
  const [historicoMesFiltro, setHistoricoMesFiltro] = useState(currentMonth)
  const [filtroInquilino, setFiltroInquilino] = useState('')
  const [filtroValorRecebido, setFiltroValorRecebido] = useState('')
  const [filtroDataPagamento, setFiltroDataPagamento] = useState('')
  const [editingDataId, setEditingDataId] = useState(null)
  const [dataDraft, setDataDraft] = useState('')

  useEffect(() => onValue(ref(db, 'historicoAlteracoes'), snap => {
    const data = snap.val()
    setHistoricoAlteracoes(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
  }), [])

  useEffect(() => onValue(ref(db, 'inadimplencias'), snap => {
    const data = snap.val()
    setInadimplencias(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
  }), [])

  const historicoOrdenado = useMemo(
    () => [...historicoAlteracoes].filter(isHistoricoAlteracaoVisivel).sort((a, b) => (b.data || 0) - (a.data || 0)),
    [historicoAlteracoes]
  )

  const getHistoricoMes = (item) => formatDateToMonthKey(item.data)

  const historicoMesesDisponiveis = useMemo(
    () => [...new Set(historicoAlteracoes.map(getHistoricoMes).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [historicoAlteracoes]
  )

  const inadimplenciaPorId = useMemo(
    () => Object.fromEntries(inadimplencias.map(d => [d.id, d])),
    [inadimplencias]
  )

  const getHistoricoValoresAtuais = (item) => {
    const live = inadimplenciaPorId[item.debitoId]
    if (!live) {
      return {
        valorTotal: item.valorTotal,
        valorRecebido: item.valorRecebido,
        mesReferencia: item.mesReferencia,
        dataPagamento: item.dataPagamento,
        dataSeguro: item.dataSeguro,
      }
    }
    return {
      valorTotal: live.valorTotal || live.valorOriginal || item.valorTotal,
      valorRecebido: live.valorRecebido ?? item.valorRecebido,
      mesReferencia: live.mesReferencia || item.mesReferencia,
      dataPagamento: live.dataPagamento || item.dataPagamento,
      dataSeguro: live.dataSeguro || item.dataSeguro,
    }
  }

  const historicoFiltrado = useMemo(() => {
    const porMes = historicoMesFiltro === 'todos'
      ? historicoOrdenado
      : historicoOrdenado.filter(item => getHistoricoMes(item) === historicoMesFiltro)

    const buscaInquilino = filtroInquilino.trim().toLowerCase()
    const buscaValor = somenteDigitos(filtroValorRecebido)
    const buscaData = filtroDataPagamento.trim()

    return porMes.filter(item => {
      const valoresAtuais = getHistoricoValoresAtuais(item)
      const okInquilino = !buscaInquilino || (item.inquilinoNome || '').toLowerCase().includes(buscaInquilino)
      const okValor = !buscaValor || somenteDigitos(valoresAtuais.valorRecebido).includes(buscaValor)
      const okData = !buscaData || valoresAtuais.dataPagamento === buscaData
      return okInquilino && okValor && okData
    })
  }, [historicoOrdenado, historicoMesFiltro, filtroInquilino, filtroValorRecebido, filtroDataPagamento, inadimplenciaPorId])

  const deveMostrarDataPagamento = (item) => {
    const novo = normalizarHistoricoValor(item.valorNovoKey || item.valorNovoLabel)
    const ehPagamentoAprovado = item.campo === 'seguroAcionado' && novo === 'pagamentoaprovado'
    const ehPagoPelaSeguradora = item.campo === 'seguroAcionado' && novo === 'pagopelaseguradora'
    const ehPago = item.campo === 'status' && novo === 'pago'
    return ehPagamentoAprovado || ehPagoPelaSeguradora || ehPago
  }

  const getHistoricoDataIndicada = (item) => {
    const mostrarPagamento = deveMostrarDataPagamento(item)
    const { dataPagamento, dataSeguro } = getHistoricoValoresAtuais(item)
    const value = dataPagamento || dataSeguro || null
    if (!value) return null
    return { label: mostrarPagamento ? 'Data Pagamento' : 'Data Seguro', value }
  }

  const handleAbrirHistoricoDebito = (debitoId) => {
    if (!debitoId) return
    navigate(`/inadimplentes?debitoId=${encodeURIComponent(debitoId)}`)
  }

  const handleExcluirHistorico = async (id) => {
    if (!window.confirm('Deseja excluir este registro do histórico?')) return
    await remove(ref(db, `historicoAlteracoes/${id}`))
  }

  const handleIniciarEdicaoData = (item) => {
    setEditingDataId(item.id)
    setDataDraft(toDatetimeLocal(item.data))
  }

  const handleCancelarEdicaoData = () => {
    setEditingDataId(null)
    setDataDraft('')
  }

  const handleSalvarData = async (id) => {
    const novaData = fromDatetimeLocal(dataDraft)
    if (!novaData) return
    await update(ref(db, `historicoAlteracoes/${id}`), { data: novaData })
    setEditingDataId(null)
  }

  return (
    <Layout title="Histórico de Alterações na Inadimplência" subtitle="Atualizações de Status e Seguro Acionado na planilha de inadimplentes.">
      <Card className="mb-3">
        <CardHeader className="flex w-full flex-col gap-3 border-b py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-sm">Histórico de Alterações na Inadimplência</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Mais recentes primeiro.
              </CardDescription>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
            <select
              value={historicoMesFiltro}
              onChange={e => setHistoricoMesFiltro(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-white px-2 text-xs shadow-sm sm:flex-none"
            >
              <option value={currentMonth}>{getMonthLabel(currentMonth)}</option>
              {historicoMesesDisponiveis.filter(m => m !== currentMonth).map(m => (
                <option key={m} value={m}>{getMonthLabel(m)}</option>
              ))}
              <option value="todos">Todos os meses</option>
            </select>
            <Badge variant="secondary" className="h-8 shrink-0 rounded-full px-2.5 text-xs font-semibold">
              {historicoFiltrado.length} registro{historicoFiltrado.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-2">
          <div className="flex flex-wrap items-center gap-2 border-b p-2">
            <Input
              value={filtroInquilino}
              onChange={e => setFiltroInquilino(e.target.value)}
              placeholder="Filtrar por inquilino..."
              className="h-8 w-full text-xs sm:w-56"
            />
            <Input
              value={filtroValorRecebido}
              onChange={e => setFiltroValorRecebido(e.target.value)}
              placeholder="Filtrar por valor recebido..."
              className="h-8 w-full text-xs sm:w-48"
            />
            <Input
              type="date"
              value={filtroDataPagamento}
              onChange={e => setFiltroDataPagamento(e.target.value)}
              className="h-8 w-full text-xs sm:w-40"
            />
            {(filtroInquilino || filtroValorRecebido || filtroDataPagamento) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setFiltroInquilino(''); setFiltroValorRecebido(''); setFiltroDataPagamento('') }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
          {historicoFiltrado.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {filtroInquilino || filtroValorRecebido || filtroDataPagamento
                ? 'Nenhuma alteração encontrada para os filtros selecionados.'
                : historicoMesFiltro === 'todos'
                  ? 'Nenhuma alteração de status ou seguro acionado registrada ainda.'
                  : `Nenhuma alteração registrada em ${getMonthLabel(historicoMesFiltro)}.`}
            </p>
          ) : (
            <div className="flex max-h-[70vh] flex-col divide-y overflow-y-auto">
              {historicoFiltrado.map(item => {
                const campoStyle = HISTORICO_CAMPO_STYLE[item.campo] || HISTORICO_CAMPO_STYLE.status
                const dataIndicada = getHistoricoDataIndicada(item)
                const valoresAtuais = getHistoricoValoresAtuais(item)
                return (
                  <div
                    key={item.id}
                    className="group flex cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-xs first:pt-0 last:pb-0 hover:bg-sky-50/40"
                    onClick={() => handleAbrirHistoricoDebito(item.debitoId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleAbrirHistoricoDebito(item.debitoId)
                      }
                    }}
                  >
                    <div className="flex min-w-0 flex-1 basis-56 items-center gap-2.5">
                      <span
                        className="shrink-0 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: campoStyle.bg, color: campoStyle.color, border: `1px solid ${campoStyle.border}` }}
                      >
                        {item.campoLabel || (item.campo === 'seguroAcionado' ? 'Seguro Acionado' : 'Status')}
                      </span>
                      <div className="min-w-0">
                        <p className="break-words font-medium">
                          {item.inquilinoNome || 'Sem nome'}
                          {item.codigoImovel ? ` (${item.codigoImovel})` : ''}
                        </p>
                        <p className="flex flex-wrap items-center gap-1 break-words text-muted-foreground">
                          <span className="break-words">{item.valorAnteriorLabel || '—'}</span>
                          <ArrowRight className="size-3 shrink-0" />
                          <span className="break-words font-medium text-foreground">{item.valorNovoLabel || '—'}</span>
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 break-words text-muted-foreground">
                          <span>Total c/ Encargos: {fmtMoney(valoresAtuais.valorTotal)}</span>
                          {valoresAtuais.valorRecebido > 0 && <span>Recebido: {fmtMoney(valoresAtuais.valorRecebido)}</span>}
                          {valoresAtuais.mesReferencia && <span>{getMonthLabel(valoresAtuais.mesReferencia)}</span>}
                          {dataIndicada && <span>{dataIndicada.label}: {fmtDataCurta(dataIndicada.value)}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {editingDataId === item.id ? (
                        <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                          <Input
                            type="datetime-local"
                            value={dataDraft}
                            onChange={e => setDataDraft(e.target.value)}
                            className="h-7 w-auto text-xs"
                          />
                          <Button variant="ghost" size="icon" className="size-6 shrink-0 text-emerald-600" onClick={() => handleSalvarData(item.id)} aria-label="Salvar data" title="Salvar data">
                            <Check className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground" onClick={handleCancelarEdicaoData} aria-label="Cancelar edição" title="Cancelar edição">
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="text-muted-foreground">{fmtDataHora(item.data)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleIniciarEdicaoData(item)
                            }}
                            aria-label="Editar data de registro"
                            title="Editar data de registro"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleExcluirHistorico(item.id)
                            }}
                            aria-label="Excluir registro do histórico"
                            title="Excluir registro do histórico"
                          >
                            <X className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </Layout>
  )
}
