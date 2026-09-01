import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { ref, get, push, update } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import './ImportarPlanilha.css'

// Campos que o usuário pode mapear para colunas da planilha
const CAMPOS = [
  { key: 'imovel',   label: 'Imóvel (nome/endereço)',    required: true },
  { key: 'codigo',   label: 'Código do Imóvel',           required: false },
  { key: 'morador',  label: 'Morador (Inquilino)',        required: true },
  { key: 'valor',    label: 'Valor do Pacote (Aluguel, opcional)', required: false },
  { key: 'quarto',   label: 'Quarto (opcional)',          required: false },
  { key: 'telefone', label: 'Telefone (opcional)',        required: false },
  { key: 'cpf',      label: 'CPF (opcional)',             required: false },
  { key: 'email',    label: 'E-mail (opcional)',          required: false },
  { key: 'status',   label: 'Status (importa só quem está "Ativo")', required: false },
]

// Palavras-chave usadas para tentar adivinhar a coluna certa a partir do cabeçalho
const PALAVRAS_CHAVE = {
  imovel:  ['imovel', 'imóvel', 'imovel/endereco', 'endereco', 'endereço', 'unidade'],
  codigo:  ['codigo', 'código', 'cod'],
  morador: ['morador', 'inquilino', 'locatario', 'locatário', 'nome'],
  valor:   ['pacote', 'aluguel', 'aluguél', 'valor'],
  quarto:  ['quarto', 'apto', 'apartamento'],
  telefone: ['telefone', 'celular', 'fone', 'whatsapp', 'contato'],
  cpf:      ['cpf'],
  email:    ['email', 'e-mail'],
  status:  ['status', 'situacao', 'situação', 'ativo'],
}

const normalizar = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

const parseValorMonetario = (v) => {
  if (v === undefined || v === null || v === '') return 0
  if (typeof v === 'number') return v
  const s = String(v).replace(/[^\d,.-]/g, '')
  // Formato brasileiro "1.234,56" → remove separador de milhar e troca vírgula por ponto
  const semMilhar = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  return parseFloat(semMilhar) || 0
}

const parseStatusAtivo = (v) => normalizar(v) === 'ativo'

export default function ImportarPlanilha() {
  const navigate = useNavigate()
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [allRows, setAllRows] = useState([]) // todas as linhas da planilha, incluindo o cabeçalho (linha 1)
  const [linhaInicial, setLinhaInicial] = useState(1)
  const [linhaFinal, setLinhaFinal] = useState(50)
  const [mapping, setMapping] = useState({})
  const [error, setError] = useState(null)
  const [importing, setImporting] = useState(false)
  const [resultado, setResultado] = useState(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResultado(null)
    setFileName(file.name)
    try {
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array' })
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

      // Tenta adivinhar automaticamente o mapeamento pelas palavras-chave do cabeçalho
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

  // Linhas selecionadas pelo usuário (1-indexado, contando o cabeçalho como linha 1)
  const rows = useMemo(() => {
    if (!allRows.length) return []
    const start = Math.max(2, linhaInicial || 2)
    const end = Math.min(allRows.length, linhaFinal || allRows.length)
    if (end < start) return []
    return allRows.slice(start - 1, end).filter(r => r.some(c => String(c).trim() !== ''))
  }, [allRows, linhaInicial, linhaFinal])

  // Linhas que serão de fato importadas (exclui as marcadas como "Ignorado" pelo status)
  const linhasVisiveis = useMemo(() => {
    if (mapping.status === undefined) return rows
    return rows.filter(row => parseStatusAtivo(row[mapping.status]))
  }, [rows, mapping.status])

  const camposFaltando = CAMPOS.filter(c => c.required && mapping[c.key] === undefined)
  const podeImportar = rows.length > 0 && camposFaltando.length === 0 && !importing

  const handleImportar = async () => {
    setImporting(true)
    setError(null)
    try {
      const imoveisSnap = await get(ref(db, 'imoveis'))
      const imoveisData = imoveisSnap.val() || {}
      const imoveisExistentes = Object.entries(imoveisData).map(([id, v]) => ({ id, ...v }))

      let imoveisCriados = 0
      let inquilinosCriados = 0
      let ignorados = 0

      for (const row of rows) {
        const nomeImovel = String(row[mapping.imovel] ?? '').trim()
        const nomeMorador = String(row[mapping.morador] ?? '').trim()
        const valorAluguel = parseValorMonetario(row[mapping.valor])
        const codigo = mapping.codigo !== undefined ? String(row[mapping.codigo] ?? '').trim() : ''
        const numeroQuarto = mapping.quarto !== undefined ? String(row[mapping.quarto] ?? '').trim() : ''
        const telefone = mapping.telefone !== undefined ? String(row[mapping.telefone] ?? '').trim() : ''
        const cpf = mapping.cpf !== undefined ? String(row[mapping.cpf] ?? '').trim() : ''
        const email = mapping.email !== undefined ? String(row[mapping.email] ?? '').trim() : ''

        if (!nomeImovel || !nomeMorador) {
          ignorados++
          continue
        }

        if (mapping.status !== undefined && !parseStatusAtivo(row[mapping.status])) {
          ignorados++
          continue
        }

        // Imóveis cadastrados não têm campo "nome" — o vínculo precisa comparar
        // código e endereço, que é o que o restante do app usa para identificar o imóvel.
        const nomeImovelNorm = normalizar(nomeImovel)
        let imovel = imoveisExistentes.find(im => {
          if (codigo && im.codigo && normalizar(im.codigo) === normalizar(codigo)) return true
          if (im.codigo && normalizar(im.codigo) === nomeImovelNorm) return true
          const nomeTxt      = normalizar(im.nome || '')
          const enderecoTxt  = normalizar(`${im.endereco?.rua || ''} ${im.endereco?.numero || ''}`.trim())
          if (nomeTxt && nomeTxt === nomeImovelNorm) return true
          if (enderecoTxt && (enderecoTxt === nomeImovelNorm || enderecoTxt.includes(nomeImovelNorm) || nomeImovelNorm.includes(enderecoTxt))) return true
          return false
        })

        if (!imovel) {
          const novoImovel = {
            codigo: codigo || nomeImovel,
            nome: nomeImovel,
            status: 'Ocupado',
            modelo: '',
            proprietarioId: '',
            endereco: { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' },
            observacao: '',
            criadoEm: new Date().toISOString(),
          }
          const novoRef = await push(ref(db, 'imoveis'), novoImovel)
          imovel = { id: novoRef.key, ...novoImovel }
          imoveisExistentes.push(imovel)
          imoveisCriados++
        }

        if (imovel.status !== 'Ocupado') {
          await update(ref(db, `imoveis/${imovel.id}`), { status: 'Ocupado', atualizadoEm: new Date().toISOString() })
          imovel.status = 'Ocupado'
        }

        await push(ref(db, 'inquilinos'), {
          nome: nomeMorador,
          locatario: '',
          status: 'Ativo',
          email,
          cpf,
          telefone,
          dataEntrada: '',
          dataSaida: '',
          metodoPagamento: 'pre_pago',
          imovelId: imovel.id,
          codigoImovel: imovel.codigo || '',
          numeroQuarto,
          codigoContrato: '',
          contasInclusas: [],
          contasValores: {},
          contasVariavel: {},
          contasOrigem: {},
          contasPagador: {},
          valorAluguel,
          vagas: '',
          valorVaga: '',
          garantia: '',
          seguro: '',
          valorSeguro: '',
          observacao: '',
          criadoEm: new Date().toISOString(),
        })
        inquilinosCriados++
      }

      setResultado({ imoveisCriados, inquilinosCriados, ignorados })
      setAllRows([])
      setHeaders([])
      setFileName('')
    } catch (err) {
      console.error(err)
      setError('Erro ao importar. Verifique sua conexão e tente novamente.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Layout title="Importar Planilha" subtitle="Cadastre imóveis e inquilinos a partir de uma planilha">
      {error && <div className="error-msg">{error}</div>}

      {resultado && (
        <div className="form-section">
          <div className="form-section-body">
            <p>✅ Importação concluída:</p>
            <ul>
              <li>{resultado.imoveisCriados} imóvel(is) criado(s)</li>
              <li>{resultado.inquilinosCriados} inquilino(s) criado(s)</li>
              {resultado.ignorados > 0 && <li>{resultado.ignorados} linha(s) ignorada(s) por falta de dados</li>}
            </ul>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/inquilinos')}>Ver Inquilinos</button>
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
                  A linha 1 é o cabeçalho. {rows.length} linha(s) ser(ão) importada(s) com o intervalo atual.
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

          {rows.length > 0 && (
            <div className="form-section">
              <div className="form-section-header">
                <span className="form-section-icon">👁️</span>
                <h3>4. Pré-visualização ({linhasVisiveis.length} linha(s))</h3>
              </div>
              <div className="form-section-body">
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Imóvel</th>
                        <th>Morador</th>
                        <th>Valor do Pacote</th>
                        <th>Quarto</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhasVisiveis.map((row, i) => (
                        <tr key={i}>
                          <td>{mapping.imovel !== undefined ? String(row[mapping.imovel] ?? '') : '—'}</td>
                          <td>{mapping.morador !== undefined ? String(row[mapping.morador] ?? '') : '—'}</td>
                          <td>{mapping.valor !== undefined ? parseValorMonetario(row[mapping.valor]).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</td>
                          <td>{mapping.quarto !== undefined ? String(row[mapping.quarto] ?? '') : '—'}</td>
                          <td>✅ Importa</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {camposFaltando.length > 0 && (
                  <p style={{ marginTop: 12, fontSize: 13, color: '#b45309' }}>
                    Associe as colunas obrigatórias: {camposFaltando.map(c => c.label).join(', ')}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!podeImportar} onClick={handleImportar}>
                    {importing ? 'Importando...' : `📥 Importar ${rows.length} linha(s)`}
                  </button>
                  <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => navigate('/inquilinos')}>Cancelar</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
