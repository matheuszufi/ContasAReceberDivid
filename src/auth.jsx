import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, firebaseError } from './firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut
} from 'firebase/auth';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
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

  const login = (email, password) => {
    if (!auth) {
      return Promise.reject(firebaseError || new Error('Firebase indisponível.'));
    }
    return signInWithEmailAndPassword(auth, email, password);
  };

  const register = (email, password) => {
    if (!auth) {
      return Promise.reject(firebaseError || new Error('Firebase indisponível.'));
    }
    return createUserWithEmailAndPassword(auth, email, password);
  };

  const signOut = () => {
    if (!auth) {
      return Promise.resolve();
    }
    return fbSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
