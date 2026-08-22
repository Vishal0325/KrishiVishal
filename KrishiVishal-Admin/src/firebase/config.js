import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

export const firebaseConfig = {
  apiKey: "AIzaSyC3NgLBnS3JGRhztxXcPsAjIoagHCXdwQo",
  authDomain: "krishivishal-a9ed7.firebaseapp.com",
  projectId: "krishivishal-a9ed7",
  storageBucket: "krishivishal-a9ed7.firebasestorage.app",
  messagingSenderId: "409780110248",
  appId: "1:409780110248:web:b21086831ccca59d31139d"
};

const app = initializeApp(firebaseConfig);

// Initialize App Check with reCAPTCHA Enterprise
if (typeof window !== "undefined") {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider("6LedsXMtAAAAACuRJBugHB610wgPZ9ILlD4BFUcl"),
    isTokenAutoRefreshEnabled: true
  });
}

export const auth = getAuth(app);

// ENABLE OFFLINE CACHE FOR FASTER READS (Task 5)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const storage = getStorage(app);
export const functions = getFunctions(app);
export default app;
