import React, { useEffect, useState } from 'react'
import { ref, onValue, update } from 'firebase/database'
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth'
import { db } from '../firebase'
import { useAuth } from '../auth'
import Layout from '../components/Layout'
import './Perfil.css'

const novoUsuarioInicial = { email: '', password: '', role: 'user' }
const senhaFormInicial = { senhaAtual: '', novaSenha: '', confirmarSenha: '' }

export default function Perfil() {
  const { user, isAdmin, createUser } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [hasAdmin, setHasAdmin] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [novoUsuario, setNovoUsuario] = useState(novoUsuarioInicial)
  const [criandoUsuario, setCriandoUsuario] = useState(false)
  const [criarErro, setCriarErro] = useState(null)

  const [senhaForm, setSenhaForm] = useState(senhaFormInicial)
  const [alterandoSenha, setAlterandoSenha] = useState(false)
  const [senhaErro, setSenhaErro] = useState(null)
  const [senhaSucesso, setSenhaSucesso] = useState(false)

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

  const handleSenhaFormChange = (e) => {
    const { name, value } = e.target
    setSenhaForm(prev => ({ ...prev, [name]: value }))
  }

  const traduzirErroSenha = (err) => {
    switch (err?.code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Senha atual incorreta.'
      case 'auth/weak-password':
        return 'A nova senha é muito fraca. Use pelo menos 6 caracteres.'
      case 'auth/requires-recent-login':
        return 'Por segurança, faça login novamente antes de alterar sua senha.'
      case 'auth/too-many-requests':
        return 'Muitas tentativas. Aguarde alguns instantes e tente novamente.'
      default:
        return err?.message || 'Não foi possível alterar sua senha.'
    }
  }

  const handleAlterarSenha = async (e) => {
    e.preventDefault()
    setSenhaErro(null)
    setSenhaSucesso(false)

    const { senhaAtual, novaSenha, confirmarSenha } = senhaForm

    if (!senhaAtual) {
      setSenhaErro('Informe sua senha atual.')
      return
    }
    if (novaSenha.length < 6) {
      setSenhaErro('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (novaSenha !== confirmarSenha) {
      setSenhaErro('A confirmação não corresponde à nova senha.')
      return
    }
    if (novaSenha === senhaAtual) {
      setSenhaErro('A nova senha deve ser diferente da senha atual.')
      return
    }

    setAlterandoSenha(true)
    try {
      // reautentica o usuário antes de trocar a senha (exigência do Firebase Auth)
      const credential = EmailAuthProvider.credential(user.email, senhaAtual)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, novaSenha)

      setSenhaSucesso(true)
      setSenhaForm(senhaFormInicial)
    } catch (err) {
      console.error('Erro ao alterar senha:', err)
      setSenhaErro(traduzirErroSenha(err))
    } finally {
      setAlterandoSenha(false)
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

      <div className="perfil-form-grid">
      <div className="form-section perfil-panel">
        <div className="form-section-header">
          <span className="form-section-icon">🔒</span>
          <h3>Alterar senha</h3>
        </div>
        <div className="form-section-body">
          {senhaErro && <div className="error-msg">{senhaErro}</div>}
          {senhaSucesso && <div className="success-msg">Senha alterada com sucesso.</div>}
          <form onSubmit={handleAlterarSenha}>
            <div className="form-group">
              <label>Senha atual</label>
              <input
                name="senhaAtual"
                type="password"
                required
                autoComplete="current-password"
                value={senhaForm.senhaAtual}
                onChange={handleSenhaFormChange}
                placeholder="Digite sua senha atual"
              />
            </div>
            <div className="form-group">
              <label>Nova senha</label>
              <input
                name="novaSenha"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={senhaForm.novaSenha}
                onChange={handleSenhaFormChange}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="form-group">
              <label>Confirmar nova senha</label>
              <input
                name="confirmarSenha"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={senhaForm.confirmarSenha}
                onChange={handleSenhaFormChange}
                placeholder="Repita a nova senha"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={alterandoSenha}>
              {alterandoSenha ? 'Alterando...' : 'Alterar senha'}
            </button>
          </form>
        </div>
      </div>

      {isAdmin && (
        <div className="form-section perfil-panel">
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
      </div>

      <div className="form-section usuarios-panel">
        <div className="form-section-header">
          <span className="form-section-icon">🛡️</span>
          <div>
            <h3>Usuários cadastrados</h3>
            <p className="section-caption">Contas com acesso ao sistema</p>
          </div>
        </div>
        <div className="form-section-body table-container">
          <table className="imoveis-table usuarios-table">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Permissão</th>
                {isAdmin && <th>Ação</th>}
              </tr>
            </thead>
            <tbody>
              {usuarios.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 3 : 2} className="usuarios-empty">Nenhum usuário encontrado.</td>
                </tr>
              ) : usuarios.map(u => (
                <tr key={u.id}>
                  <td className="usuario-email-cell">
                    <span className="usuario-avatar">{(u.email || '?').charAt(0).toUpperCase()}</span>
                    <span>{u.email}</span>
                  </td>
                  <td>
                    <span className={`role-badge ${u.role === 'admin' ? 'role-admin' : 'role-user'}`}>
                      <span className="role-dot" />
                      {u.role === 'admin' ? 'Administrador' : 'Usuário'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="usuario-action-cell">
                      {u.role === 'admin' ? (
                        <button type="button" className="btn btn-secondary btn-table-action" onClick={() => handleAlterarRole(u.id, 'user')}>
                          Remover admin
                        </button>
                      ) : (
                        <button type="button" className="btn btn-primary btn-table-action" onClick={() => handleAlterarRole(u.id, 'admin')}>
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
