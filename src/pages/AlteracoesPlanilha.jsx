import React, { useEffect, useMemo, useState } from 'react'
import { ref, onValue, remove } from 'firebase/database'
import { History, ArrowRight, X } from 'lucide-react'
import { db } from '../firebase'
import { useAuth } from '../auth'
import Layout from '../components/Layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

// Formata data + hora de uma alteração do histórico, ex: "31/08/2026 14:32"
const fmtDataHora = (timestamp) => {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getMonthLabel = (monthKey) => {
  if (!monthKey) return 'Ano inteiro'
  const [year, month] = monthKey.split('-')
  return new Date(+year, +month - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase())
}

export default function AlteracoesPlanilha() {
  const { isAdmin } = useAuth()
  const [historicoAlteracoes, setHistoricoAlteracoes] = useState([])
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [filtroInquilino, setFiltroInquilino] = useState('')

  useEffect(() => {
    return onValue(ref(db, 'historicoAlteracoes'), snap => {
      const data = snap.val()
      setHistoricoAlteracoes(data ? Object.entries(data).map(([id, value]) => ({ id, ...value })) : [])
    })
  }, [])

  const historicoOrdenado = useMemo(
    () => [...historicoAlteracoes].filter(item => item.origem === 'planilha_cobranca').sort((a, b) => (b.data || 0) - (a.data || 0)),
    [historicoAlteracoes]
  )

  const historicoFiltrado = useMemo(() => {
    const buscaUsuario = filtroUsuario.trim().toLowerCase()
    const buscaInquilino = filtroInquilino.trim().toLowerCase()
    return historicoOrdenado.filter(item => {
      const okUsuario = !buscaUsuario || (item.usuario || '').toLowerCase().includes(buscaUsuario)
      const okInquilino = !buscaInquilino || (item.inquilinoNome || '').toLowerCase().includes(buscaInquilino)
      return okUsuario && okInquilino
    })
  }, [historicoOrdenado, filtroUsuario, filtroInquilino])

  const handleExcluirHistorico = async (id) => {
    if (!window.confirm('Deseja cancelar este registro do histórico?')) return
    await remove(ref(db, `historicoAlteracoes/${id}`))
  }

  return (
    <Layout title="Alterações na Planilha de Cobrança" subtitle="Valores de contas alterados na Planilha de Cobrança, com o usuário responsável.">
      <Card className="mb-3">
        <CardHeader className="flex w-full flex-row flex-wrap items-center justify-between gap-2 border-b py-2">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-sm">Alterações na Planilha de Cobrança</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Mais recentes primeiro.
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {historicoFiltrado.length} registro{historicoFiltrado.length === 1 ? '' : 's'}
          </Badge>
        </CardHeader>
        <CardContent className="p-2">
          <div className="flex flex-wrap items-center gap-2 border-b p-2">
            <Input
              value={filtroUsuario}
              onChange={e => setFiltroUsuario(e.target.value)}
              placeholder="Filtrar por usuário..."
              className="h-8 w-full text-xs sm:w-56"
            />
            <Input
              value={filtroInquilino}
              onChange={e => setFiltroInquilino(e.target.value)}
              placeholder="Filtrar por inquilino..."
              className="h-8 w-full text-xs sm:w-56"
            />
            {(filtroUsuario || filtroInquilino) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => { setFiltroUsuario(''); setFiltroInquilino('') }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
          {historicoFiltrado.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {historicoOrdenado.length === 0
                ? 'Nenhuma alteração registrada na Planilha de Cobrança ainda.'
                : 'Nenhuma alteração encontrada para os filtros selecionados.'}
            </p>
          ) : (
            <div className="flex max-h-[70vh] flex-col divide-y overflow-y-auto">
              {historicoFiltrado.map(item => (
                <div key={item.id} className="group flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-xs first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-1 basis-56 items-center gap-2.5">
                    <span
                      className="shrink-0 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}
                    >
                      {item.campoLabel || item.campo}
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
                      <p className="flex flex-wrap items-center gap-1 break-words text-muted-foreground">
                        {item.mesReferenciaPlanilha && <span className="break-words">{getMonthLabel(item.mesReferenciaPlanilha)}</span>}
                        <span className="break-words">· Alterado por: {item.usuario || 'Desconhecido'}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground">{fmtDataHora(item.data)}</span>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                        onClick={() => handleExcluirHistorico(item.id)}
                        aria-label="Cancelar registro do histórico"
                        title="Cancelar registro do histórico"
                      >
                        <X className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Layout>
  )
}
