import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, push, onValue, remove } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'
import './CadastrarConta.css'

const initialForm = {
  nome: '',
  icone: '📄',
  permiteValorNegativo: false,
}

const ICONE_OPCOES = [
  '💧', '⚡', '🏢', '🔥', '🏛️', '🗑️', '🧯', '💰',
  '📶', '🚗', '🔒', '📄', '📋', '🛠️', '🧹', '📦',
]

export default function CadastrarConta() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [contas, setContas] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    return onValue(ref(db, 'contas'), snap => {
      const data = snap.val()
      const lista = data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : []
      lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
      setContas(lista)
    })
  }, [])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleIconeSelect = (icone) => {
    setForm(prev => ({ ...prev, icone }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nome.trim()) return
    setError(null)
    setSaving(true)
    try {
      await push(ref(db, 'contas'), {
        nome: form.nome.trim(),
        icone: form.icone || '📄',
        permiteValorNegativo: form.permiteValorNegativo,
        criadoEm: new Date().toISOString(),
      })
      setForm(initialForm)
    } catch (err) {
      setError('Erro ao salvar. Verifique sua conexão e tente novamente.')
      console.error(err)
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir esta conta cadastrada?')) return
    try {
      await remove(ref(db, `contas/${id}`))
    } catch (err) {
      console.error('Erro ao excluir conta:', err)
      alert('Não foi possível excluir a conta.')
    }
  }

  return (
    <Layout title="Cadastrar Contas" subtitle="Registre os tipos de conta que poderão ser anexados aos imóveis">
      <form onSubmit={handleSubmit}>
        {error && <div className="error-msg">{error}</div>}

        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">📋</span>
            <h3>Nova Conta</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group fg-full">
                <label>Nome da Conta *</label>
                <input name="nome" value={form.nome} onChange={handleChange} required placeholder="Ex: Água, Energia, Condomínio..." />
              </div>
              <div className="form-group fg-full">
                <label>Ícone</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ICONE_OPCOES.map(ic => (
                    <button
                      type="button"
                      key={ic}
                      onClick={() => handleIconeSelect(ic)}
                      title={ic}
                      style={{
                        width: 36, height: 36, fontSize: 18, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: form.icone === ic ? '2px solid var(--accent, #3b82f6)' : '1px solid #e2e8f0',
                        borderRadius: 8, background: form.icone === ic ? '#eff6ff' : '#fff',
                      }}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="conta-variavel-toggle" style={{ marginTop: 8 }}>
                  <input
                    type="checkbox"
                    name="permiteValorNegativo"
                    checked={form.permiteValorNegativo}
                    onChange={handleChange}
                  />
                  <span>Permite valor negativo (ex: fundo de reserva)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/imoveis')}>Voltar</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !form.nome.trim()}>
            {saving ? 'Salvando...' : '💾 Adicionar Conta'}
          </button>
        </div>
      </form>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3>Contas Cadastradas ({contas.length})</h3>
        </div>
        <div className="card-body">
          {contas.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">📋</div>
              <h3>Nenhuma conta cadastrada</h3>
              <p>Adicione a primeira conta acima para poder anexá-la aos imóveis.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {contas.map(conta => (
                <div
                  key={conta.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: 10, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
                    background: '#f8fafc',
                  }}
                >
                  <div>
                    <strong>{conta.icone || '📄'} {conta.nome}</strong>
                    {conta.permiteValorNegativo && (
                      <span className="badge badge-blue" style={{ marginLeft: 8 }}>permite valor negativo</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: 'auto', color: '#b91c1c' }}
                    onClick={() => handleDelete(conta.id)}
                  >
                    🗑️ Excluir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
