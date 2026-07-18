import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

// TODO: Replace with your actual Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyDVCaQ1Q2LQ8SZk3pxDjFkjTOwrQzqGBBg",
  authDomain: "krishivishal-a9ed7.firebaseapp.com",
  projectId: "krishivishal-a9ed7",
  storageBucket: "krishivishal-a9ed7.firebasestorage.app",
  messagingSenderId: "409780110248",
  appId: "1:409780110248:web:7d2e8b9c1a0f4e3d" // Standard pattern if not found
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);
const auth = getAuth(app);

export { db, storage, functions, auth };
