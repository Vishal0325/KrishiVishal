import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyC3NgLBnS3JGRhztxXcPsAjIoagHCXdwQo",
  authDomain: "krishivishal-a9ed7.firebaseapp.com",
  databaseURL:
    "https://krishivishal-a9ed7-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "krishivishal-a9ed7",
  storageBucket: "krishivishal-a9ed7.firebasestorage.app",
  messagingSenderId: "409780110248",
  appId: "1:409780110248:web:b21086831ccca59d31139d",
  measurementId: "G-5P5DVC28CC",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
