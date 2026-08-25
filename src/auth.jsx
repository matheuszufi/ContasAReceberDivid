import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, secondaryAuth, firebaseError } from './firebase';
import { ref, onValue, set } from 'firebase/database';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut
} from 'firebase/auth';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      setLoading(false);
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user || !db) {
      setRole(null);
      return undefined;
    }
    return onValue(ref(db, `usuarios/${user.uid}`), snap => {
      const data = snap.val();
      setRole(data?.role || 'user');
      // usuários que fizeram login antes da criação deste registro ainda não têm perfil salvo
      if (!data) {
        set(ref(db, `usuarios/${user.uid}`), { email: user.email, role: 'user' }).catch(err => {
          console.error('Erro ao criar perfil do usuário:', err);
        });
      }
    });
  }, [user]);

  const login = (email, password) => {
    if (!auth) {
      return Promise.reject(firebaseError || new Error('Firebase indisponível.'));
    }
    return signInWithEmailAndPassword(auth, email, password);
  };

  // usado apenas pela tela de administração: cria a conta em um app Firebase
  // secundário para não substituir a sessão do administrador logado
  const createUser = async (email, password, newRole = 'user') => {
    if (!secondaryAuth) {
      return Promise.reject(firebaseError || new Error('Firebase indisponível.'));
    }
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await set(ref(db, `usuarios/${credential.user.uid}`), { email, role: newRole });
    await fbSignOut(secondaryAuth);
    return credential;
  };

  const signOut = () => {
    if (!auth) {
      return Promise.resolve();
    }
    return fbSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, role, isAdmin: role === 'admin', loading, login, createUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
