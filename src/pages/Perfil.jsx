import React, { useEffect, useState } from 'react'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase'
import { useAuth } from '../auth'
import Layout from '../components/Layout'

const novoUsuarioInicial = { email: '', password: '', role: 'user' }

export default function Perfil() {
  const { user, isAdmin, createUser } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [hasAdmin, setHasAdmin] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [novoUsuario, setNovoUsuario] = useState(novoUsuarioInicial)
  const [criandoUsuario, setCriandoUsuario] = useState(false)
  const [criarErro, setCriarErro] = useState(null)

  useEffect(() => {
    return onValue(ref(db, 'usuariosMeta/hasAdmin'), snap => setHasAdmin(snap.val() === true))
  }, [])

  useEffect(() => {
    return onValue(ref(db, 'usuarios'), snap => {
      const data = snap.val()
      const lista = data ? Object.entries(data).map(([id, v]) => ({ id, ...v })) : []
      lista.sort((a, b) => (a.email || '').localeCompare(b.email || ''))
      setUsuarios(lista)
    })
  }, [])

  const handleTornarAdmin = async () => {
    if (!user) return
    setError(null)
    setSaving(true)
    try {
      // atualização atômica: promove o usuário e marca o bootstrap como concluído
      await update(ref(db), {
        [`usuarios/${user.uid}/role`]: 'admin',
        'usuariosMeta/hasAdmin': true,
      })
    } catch (err) {
      console.error('Erro ao tornar administrador:', err)
      setError('Não foi possível conceder acesso de administrador.')
    } finally {
      setSaving(false)
    }
  }

  const handleAlterarRole = async (uid, novoRole) => {
    try {
      await update(ref(db, `usuarios/${uid}`), { role: novoRole })
    } catch (err) {
      console.error('Erro ao alterar permissão:', err)
      alert('Não foi possível alterar a permissão deste usuário.')
    }
  }

  const handleNovoUsuarioChange = (e) => {
    const { name, value } = e.target
    setNovoUsuario(prev => ({ ...prev, [name]: value }))
  }

  const handleCriarUsuario = async (e) => {
    e.preventDefault()
    if (!novoUsuario.email.trim() || novoUsuario.password.length < 6) {
      setCriarErro('Informe um e-mail válido e uma senha com pelo menos 6 caracteres.')
      return
    }
    setCriarErro(null)
    setCriandoUsuario(true)
    try {
      await createUser(novoUsuario.email.trim(), novoUsuario.password, novoUsuario.role)
      setNovoUsuario(novoUsuarioInicial)
    } catch (err) {
      console.error('Erro ao cadastrar usuário:', err)
      setCriarErro(err.message || 'Não foi possível cadastrar o usuário.')
    } finally {
      setCriandoUsuario(false)
    }
  }

  return (
    <Layout title="Meu Perfil" subtitle="Gerencie seus dados de acesso">
      {error && <div className="error-msg">{error}</div>}

      <div className="form-section">
        <div className="form-section-header">
          <span className="form-section-icon">👤</span>
          <h3>Dados da conta</h3>
        </div>
        <div className="form-section-body">
          <p><strong>E-mail:</strong> {user?.email}</p>
          <p><strong>Permissão atual:</strong> {isAdmin ? 'Administrador' : 'Usuário'}</p>

          {!isAdmin && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || hasAdmin}
              onClick={handleTornarAdmin}
              title={hasAdmin ? 'Já existe um administrador; peça a ele para promover você.' : ''}
            >
              {hasAdmin ? 'Já existe um administrador no sistema' : 'Tornar-se Administrador'}
            </button>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="form-section">
          <div className="form-section-header">
            <span className="form-section-icon">➕</span>
            <h3>Cadastrar novo usuário</h3>
          </div>
          <div className="form-section-body">
            {criarErro && <div className="error-msg">{criarErro}</div>}
            <form onSubmit={handleCriarUsuario}>
              <div className="form-group">
                <label>Email</label>
                <input
                  name="email"
                  type="email"
                  required
                  value={novoUsuario.email}
                  onChange={handleNovoUsuarioChange}
                  placeholder="novo.usuario@email.com"
                />
              </div>
              <div className="form-group">
                <label>Senha</label>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  value={novoUsuario.password}
                  onChange={handleNovoUsuarioChange}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div className="form-group">
                <label>Permissão</label>
                <select name="role" value={novoUsuario.role} onChange={handleNovoUsuarioChange}>
                  <option value="user">Usuário</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary" disabled={criandoUsuario}>
                {criandoUsuario ? 'Cadastrando...' : 'Cadastrar usuário'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="form-section">
        <div className="form-section-header">
          <span className="form-section-icon">🛡️</span>
          <h3>Usuários cadastrados</h3>
        </div>
        <div className="form-section-body table-container">
          <table className="imoveis-table">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Permissão</th>
                {isAdmin && <th>Ação</th>}
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.role === 'admin' ? 'Administrador' : 'Usuário'}</td>
                  {isAdmin && (
                    <td>
                      {u.role === 'admin' ? (
                        <button type="button" className="btn btn-secondary" onClick={() => handleAlterarRole(u.id, 'user')}>
                          Remover admin
                        </button>
                      ) : (
                        <button type="button" className="btn btn-primary" onClick={() => handleAlterarRole(u.id, 'admin')}>
                          Tornar admin
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}
