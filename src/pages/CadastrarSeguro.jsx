import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, push, onValue, remove } from 'firebase/database'
import { db } from '../firebase'
import Layout from '../components/Layout'

const TIPOS_SEGURO = ['Seguro Fiança', 'Seguro Incêndio']

const initialForm = {
  nome: '',
  tipo: 'Seguro Fiança',
}

export default function CadastrarSeguro() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [seguros, setSeguros] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    return onValue(ref(db, 'seguros'), snap => {
      const data = snap.val()
      const lista = data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : []
      lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
      setSeguros(lista)
    })
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nome.trim()) return
    setError(null)
    setSaving(true)
    try {
      await push(ref(db, 'seguros'), {
        nome: form.nome.trim(),
        tipo: form.tipo,
        criadoEm: new Date().toISOString(),
      })
      setForm(initialForm)
    } catch (err) {
      setError('Erro ao salvar. Verifique sua conexão e tente novamente.')
      console.error(err)
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja excluir este seguro cadastrado?')) return
    try {
      await remove(ref(db, `seguros/${id}`))
    } catch (err) {
      console.error('Erro ao excluir seguro:', err)
      alert('Não foi possível excluir o seguro.')
    }
  }

  return (
    <Layout title="Cadastrar Seguros" subtitle="Registre as seguradoras que poderão ser anexadas aos inquilinos">
      <form onSubmit={handleSubmit}>
        {error && <div className="error-msg">{error}</div>}

        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">🛡️</span>
            <h3>Novo Seguro</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid-2">
              <div className="form-group fg-full">
                <label>Nome da Seguradora *</label>
                <input name="nome" value={form.nome} onChange={handleChange} required placeholder="Ex: Credaluga, Credpago..." />
              </div>
              <div className="form-group">
                <label>Tipo *</label>
                <select name="tipo" value={form.tipo} onChange={handleChange} required>
                  {TIPOS_SEGURO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/inquilinos')}>Voltar</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !form.nome.trim()}>
            {saving ? 'Salvando...' : '💾 Adicionar Seguro'}
          </button>
        </div>
      </form>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3>Seguros Cadastrados ({seguros.length})</h3>
        </div>
        <div className="card-body">
          {seguros.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">🛡️</div>
              <h3>Nenhum seguro cadastrado</h3>
              <p>Adicione o primeiro seguro acima para poder anexá-lo aos inquilinos.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {seguros.map(seguro => (
                <div
                  key={seguro.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: 10, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
                    background: '#f8fafc',
                  }}
                >
                  <div>
                    <strong>{seguro.nome}</strong>
                    <span className={`badge ${seguro.tipo === 'Seguro Incêndio' ? 'badge-yellow' : 'badge-blue'}`} style={{ marginLeft: 8 }}>
                      {seguro.tipo}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: 'auto', color: '#b91c1c' }}
                    onClick={() => handleDelete(seguro.id)}
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
