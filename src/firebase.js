import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const fallbackFirebaseConfig = {
  apiKey: 'AIzaSyAmkhEzZBCHRFXZwioPU9Hd04U-qC0BCDw',
  authDomain: 'contasareceberdivid.firebaseapp.com',
  databaseURL: 'https://contasareceberdivid-default-rtdb.firebaseio.com',
  projectId: 'contasareceberdivid',
  storageBucket: 'contasareceberdivid.firebasestorage.app',
  messagingSenderId: '480780585710',
  appId: '1:480780585710:web:a53d5b64c3eebd55b641ff',
  measurementId: 'G-GEBT0H3767'
};

const requiredEnvKeys = [
  ['VITE_FIREBASE_API_KEY', 'apiKey'],
  ['VITE_FIREBASE_AUTH_DOMAIN', 'authDomain'],
  ['VITE_FIREBASE_DATABASE_URL', 'databaseURL'],
  ['VITE_FIREBASE_PROJECT_ID', 'projectId'],
  ['VITE_FIREBASE_STORAGE_BUCKET', 'storageBucket'],
  ['VITE_FIREBASE_MESSAGING_SENDER_ID', 'messagingSenderId'],
  ['VITE_FIREBASE_APP_ID', 'appId']
];

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || fallbackFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || fallbackFirebaseConfig.authDomain,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || fallbackFirebaseConfig.databaseURL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || fallbackFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || fallbackFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || fallbackFirebaseConfig.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || fallbackFirebaseConfig.measurementId
};

const missingKeys = requiredEnvKeys.filter(([envKey, configKey]) => {
  const value = import.meta.env[envKey] || firebaseConfig[configKey];
  return !value || !String(value).trim();
});

let app = null;
let auth = null;
let db = null;
let firebaseError = null;

if (missingKeys.length > 0) {
  firebaseError = new Error(
    `Configuração do Firebase incompleta. Variáveis ausentes: ${missingKeys.map(([envKey]) => envKey).join(', ')}`
  );
  console.error('Firebase configuration missing:', missingKeys.map(([envKey]) => envKey));
} else {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
  } catch (error) {
    firebaseError = error;
    console.error('Firebase initialization failed:', error);
  }
}

export { firebaseError, auth, db };

