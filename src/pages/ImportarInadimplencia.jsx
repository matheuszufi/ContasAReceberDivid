import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { ref, get, push, update, onValue } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

// Campos que o usuário pode mapear para colunas da planilha
const CAMPOS = [
  { key: 'inquilino', label: 'Nome do Inquilino', required: true },
  { key: 'valor',      label: 'Valor da Inadimplência', required: true },
  { key: 'mes',        label: 'Mês de Referência',       required: true },
  { key: 'status',     label: 'Status (Pago / Em Aberto)', required: false },
]

// Palavras-chave usadas para tentar adivinhar a coluna certa a partir do cabeçalho
const PALAVRAS_CHAVE = {
  inquilino: ['inquilino', 'morador', 'locatario', 'locatário', 'cliente', 'nome'],
  valor:     ['valor', 'debito', 'débito', 'divida', 'dívida', 'saldo'],
  mes:       ['mes', 'mês', 'referencia', 'referência', 'competencia', 'competência', 'vencimento'],
  status:    ['status', 'situacao', 'situação', 'pago'],
}

// Palavras que indicam que o débito já foi pago; qualquer outro valor é considerado em aberto
const PALAVRAS_PAGO = ['pago', 'quitado', 'liquidado']

const parseStatusPago = (v) => {
  const s = normalizar(v)
  if (!s) return 'Pendente'
  return PALAVRAS_PAGO.some(p => s.includes(p)) ? 'Pago' : 'Pendente'
}

const MESES_NOME = {
  jan: 1, janeiro: 1,
  fev: 2, fevereiro: 2,
  mar: 3, marco: 3, março: 3,
  abr: 4, abril: 4,
  mai: 5, maio: 5,
  jun: 6, junho: 6,
  jul: 7, julho: 7,
  ago: 8, agosto: 8,
  set: 9, setembro: 9,
  out: 10, outubro: 10,
  nov: 11, novembro: 11,
  dez: 12, dezembro: 12,
}

const normalizar = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

const padM = (n) => String(n).padStart(2, '0')

const parseValorMonetario = (v) => {
  if (v === undefined || v === null || v === '') return 0
  if (typeof v === 'number') return v
  const s = String(v).replace(/[^\d,.-]/g, '')
  const semMilhar = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  return parseFloat(semMilhar) || 0
}

// Aceita Date (célula formatada como data), serial do Excel, "YYYY-MM", "MM/YYYY" ou nome do mês por extenso
const parseMesReferencia = (v) => {
  if (v === undefined || v === null || v === '') return null

  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${padM(v.getMonth() + 1)}`
  }

  if (typeof v === 'number') {
    // Serial de data do Excel (dias desde 1899-12-30)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    if (!isNaN(d)) return `${d.getUTCFullYear()}-${padM(d.getUTCMonth() + 1)}`
    return null
  }

  const s = String(v).trim()

  let m = s.match(/^(\d{4})[-/](\d{1,2})$/)
  if (m) return `${m[1]}-${padM(m[2])}`

  m = s.match(/^(\d{1,2})[-/](\d{4})$/)
  if (m) return `${m[2]}-${padM(m[1])}`

  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) return `${m[3]}-${padM(m[2])}`

  const nomeMatch = normalizar(s).match(/([a-z]+)\D+(\d{4})/)
  if (nomeMatch && MESES_NOME[nomeMatch[1]]) {
    return `${nomeMatch[2]}-${padM(MESES_NOME[nomeMatch[1]])}`
  }

  return null
}

const formatMonthLabel = (ym) => {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  return new Date(+y, +m - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase())
}

export default function ImportarInadimplencia() {
  const navigate = useNavigate()
  const [inquilinos, setInquilinos] = useState([])
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [allRows, setAllRows] = useState([])
  const [linhaInicial, setLinhaInicial] = useState(1)
  const [linhaFinal, setLinhaFinal] = useState(50)
  const [mapping, setMapping] = useState({})
  const [overrides, setOverrides] = useState({})
  const [error, setError] = useState(null)
  const [importing, setImporting] = useState(false)
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    return onValue(ref(db, 'inquilinos'), snap => {
      const data = snap.val()
      setInquilinos(data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : [])
    })
  }, [])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResultado(null)
    setOverrides({})
    setFileName(file.name)
    try {
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array', cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      if (!json.length) {
        setError('Planilha vazia.')
        return
      }
      const hdrs = json[0].map((h, i) => String(h || `Coluna ${i + 1}`))
      setHeaders(hdrs)
      setAllRows(json)
      setLinhaInicial(1)
      setLinhaFinal(Math.min(50, json.length))

      const autoMap = {}
      CAMPOS.forEach(({ key }) => {
        const idx = hdrs.findIndex(h => PALAVRAS_CHAVE[key].some(p => normalizar(h).includes(p)))
        if (idx !== -1) autoMap[key] = idx
      })
      setMapping(autoMap)
    } catch (err) {
      console.error(err)
      setError('Não foi possível ler a planilha. Verifique se o arquivo é um .xlsx ou .csv válido.')
    }
  }

  const handleMappingChange = (campo, value) => {
    setMapping(prev => ({ ...prev, [campo]: value === '' ? undefined : Number(value) }))
  }

  const rows = useMemo(() => {
    if (!allRows.length) return []
    const start = Math.max(2, linhaInicial || 2)
    const end = Math.min(allRows.length, linhaFinal || allRows.length)
    if (end < start) return []
    return allRows.slice(start - 1, end).filter(r => r.some(c => String(c).trim() !== ''))
  }, [allRows, linhaInicial, linhaFinal])

  const camposFaltando = CAMPOS.filter(c => c.required && mapping[c.key] === undefined)

  // Tenta casar o nome informado na planilha com um inquilino já cadastrado
  const encontrarInquilino = (nome) => {
    const alvo = normalizar(nome)
    if (!alvo) return null
    let match = inquilinos.find(i => normalizar(i.nome) === alvo && i.status !== 'Inativo')
    if (!match) match = inquilinos.find(i => normalizar(i.nome) === alvo)
    if (!match) match = inquilinos.find(i => normalizar(i.nome).includes(alvo) || alvo.includes(normalizar(i.nome)))
    return match || null
  }

  const preview = useMemo(() => {
    if (camposFaltando.length > 0) return []
    return rows.map((row, i) => {
      const nomeInformado = String(row[mapping.inquilino] ?? '').trim()
      const valor = parseValorMonetario(row[mapping.valor])
      const mesReferencia = parseMesReferencia(row[mapping.mes])
      const status = mapping.status !== undefined ? parseStatusPago(row[mapping.status]) : 'Pendente'
      const autoMatch = encontrarInquilino(nomeInformado)
      const inquilinoId = overrides[i] !== undefined ? overrides[i] : (autoMatch?.id || '')
      const inquilino = inquilinos.find(inq => inq.id === inquilinoId) || null
      return { index: i, nomeInformado, valor, mesReferencia, status, inquilinoId, inquilino }
    })
  }, [rows, mapping, inquilinos, overrides, camposFaltando.length])

  const validos = preview.filter(p => p.inquilinoId && p.mesReferencia && p.valor > 0)
  const podeImportar = validos.length > 0 && !importing

  const handleOverride = (index, inquilinoId) => {
    setOverrides(prev => ({ ...prev, [index]: inquilinoId }))
  }

  const handleImportar = async () => {
    setImporting(true)
    setError(null)
    try {
      const existentesSnap = await get(ref(db, 'inadimplencias'))
      const existentesData = existentesSnap.val() || {}
      const existentes = Object.entries(existentesData).map(([id, v]) => ({ id, ...v }))
      const mapaExistentes = {}
      existentes.forEach(e => {
        if (e.inquilinoId && e.mesReferencia) mapaExistentes[`${e.inquilinoId}_${e.mesReferencia}`] = e.id
      })

      let criados = 0
      let atualizados = 0
      let ignorados = 0

      for (const p of preview) {
        if (!p.inquilinoId || !p.mesReferencia || !(p.valor > 0)) {
          ignorados++
          continue
        }
        const inquilino = p.inquilino
        const chave = `${p.inquilinoId}_${p.mesReferencia}`
        const existenteId = mapaExistentes[chave]

        const dataPagamento = p.status === 'Pago' ? new Date().toISOString().substring(0, 10) : ''

        if (existenteId) {
          await update(ref(db, `inadimplencias/${existenteId}`), {
            valorOriginal: p.valor,
            valorTotal:    p.valor,
            status:        p.status,
            dataPagamento,
            atualizadoEm:  new Date().toISOString(),
          })
          atualizados++
        } else {
          const novoRef = await push(ref(db, 'inadimplencias'), {
            inquilinoId:    p.inquilinoId,
            inquilinoNome:  inquilino?.nome || p.nomeInformado,
            imovelId:       inquilino?.imovelId    || '',
            codigoImovel:   inquilino?.codigoImovel || '',
            tipoDebito:     'Aluguel',
            mesReferencia:  p.mesReferencia,
            dataVencimento: `${p.mesReferencia}-01`,
            garantia:       inquilino?.garantia || '',
            seguro:         inquilino?.seguro   || '',
            valorOriginal:  p.valor,
            multa: 0,
            juros: 0,
            valorTotal:     p.valor,
            status:         p.status,
            dataPagamento,
            observacao:     '',
            criadoEm:       new Date().toISOString(),
          })
          mapaExistentes[chave] = novoRef.key
          criados++
        }
      }

      setResultado({ criados, atualizados, ignorados })
      setAllRows([])
      setHeaders([])
      setFileName('')
      setOverrides({})
    } catch (err) {
      console.error(err)
      setError('Erro ao importar. Verifique sua conexão e tente novamente.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Layout title="Importar Planilha de Inadimplência" subtitle="Registre ou atualize débitos em massa a partir de uma planilha">
      {error && <div className="error-msg">{error}</div>}

      {resultado && (
        <div className="form-section">
          <div className="form-section-body">
            <p>✅ Importação concluída:</p>
            <ul>
              <li>{resultado.criados} débito(s) criado(s)</li>
              <li>{resultado.atualizados} débito(s) atualizado(s)</li>
              {resultado.ignorados > 0 && <li>{resultado.ignorados} linha(s) ignorada(s) por falta de dados ou inquilino não encontrado</li>}
            </ul>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/inadimplentes')}>Ver Inadimplentes</button>
              <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setResultado(null)}>Importar outra planilha</button>
            </div>
          </div>
        </div>
      )}

      {!resultado && (
        <>
          <div className="form-section">
            <div className="form-section-header">
              <span className="form-section-icon">📥</span>
              <h3>1. Selecione o arquivo</h3>
            </div>
            <div className="form-section-body">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
              {fileName && <p style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>Arquivo: {fileName} — {allRows.length > 0 ? allRows.length - 1 : 0} linha(s) de dados na planilha</p>}
            </div>
          </div>

          {headers.length > 0 && (
            <div className="form-section">
              <div className="form-section-header">
                <span className="form-section-icon">🔢</span>
                <h3>2. Intervalo de linhas</h3>
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Começar na linha</label>
                    <input
                      type="number" min={1} max={allRows.length}
                      value={linhaInicial}
                      onChange={e => setLinhaInicial(Number(e.target.value) || 1)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Terminar na linha</label>
                    <input
                      type="number" min={linhaInicial} max={allRows.length}
                      value={linhaFinal}
                      onChange={e => setLinhaFinal(Number(e.target.value) || allRows.length)}
                    />
                  </div>
                </div>
                <p style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                  A linha 1 é o cabeçalho. {rows.length} linha(s) ser(ão) processada(s) com o intervalo atual.
                </p>
              </div>
            </div>
          )}

          {headers.length > 0 && (
            <div className="form-section">
              <div className="form-section-header">
                <span className="form-section-icon">🔗</span>
                <h3>3. Associe as colunas</h3>
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  {CAMPOS.map(campo => (
                    <div className="form-group" key={campo.key}>
                      <label>{campo.label}{campo.required ? ' *' : ''}</label>
                      <select
                        value={mapping[campo.key] ?? ''}
                        onChange={e => handleMappingChange(campo.key, e.target.value)}
                      >
                        <option value="">— Não usar —</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {preview.length > 0 && (
            <div className="form-section">
              <div className="form-section-header">
                <span className="form-section-icon">👁️</span>
                <h3>4. Pré-visualização ({validos.length} de {preview.length} linha(s) prontas para importar)</h3>
              </div>
              <div className="form-section-body">
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Nome na Planilha</th>
                        <th>Inquilino (sistema)</th>
                        <th>Valor</th>
                        <th>Mês Ref.</th>
                        <th>Situação</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map(p => (
                        <tr key={p.index}>
                          <td>{p.nomeInformado || '—'}</td>
                          <td>
                            <select
                              value={p.inquilinoId}
                              onChange={e => handleOverride(p.index, e.target.value)}
                              style={{ fontSize: 12, padding: '3px 6px' }}
                            >
                              <option value="">— Selecione —</option>
                              {inquilinos.map(inq => (
                                <option key={inq.id} value={inq.id}>{inq.nome}{inq.codigoImovel ? ` — ${inq.codigoImovel}` : ''}</option>
                              ))}
                            </select>
                          </td>
                          <td>{p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td>{formatMonthLabel(p.mesReferencia)}</td>
                          <td>
                            {p.status === 'Pago'
                              ? <span className="badge badge-green">✅ Pago</span>
                              : <span className="badge badge-yellow">⚠️ Em Aberto</span>}
                          </td>
                          <td>
                            {p.inquilinoId && p.mesReferencia && p.valor > 0
                              ? <span className="badge badge-green">✅ Pronto</span>
                              : <span className="badge badge-red">⚠️ Verificar</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
                  Linhas com o mesmo inquilino e mês de um débito já existente terão o valor atualizado em vez de duplicado.
                </p>

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!podeImportar} onClick={handleImportar}>
                    {importing ? 'Importando...' : `📥 Importar ${validos.length} linha(s)`}
                  </button>
                  <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => navigate('/inadimplentes')}>Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {camposFaltando.length > 0 && headers.length > 0 && (
            <p style={{ fontSize: 13, color: '#b45309' }}>
              Associe as colunas obrigatórias: {camposFaltando.map(c => c.label).join(', ')}
            </p>
          )}
        </>
      )}
    </Layout>
  )
}
