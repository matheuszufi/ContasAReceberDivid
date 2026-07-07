import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyAmkhEzZBCHRFXZwioPU9Hd04U-qC0BCDw",
  authDomain: "contasareceberdivid.firebaseapp.com",
  databaseURL: "https://contasareceberdivid-default-rtdb.firebaseio.com",
  projectId: "contasareceberdivid",
  storageBucket: "contasareceberdivid.firebasestorage.app",
  messagingSenderId: "480780585710",
  appId: "1:480780585710:web:a53d5b64c3eebd55b641ff",
  measurementId: "G-GEBT0H3767"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

