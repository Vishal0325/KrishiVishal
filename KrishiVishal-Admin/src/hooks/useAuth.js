import { useState, useEffect } from 'react';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState(null);

  const isSuperAdmin = role === "SuperAdmin";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          // RBAC SINGLE SOURCE OF TRUTH: Firebase Auth Custom Claims
          const idTokenResult = await firebaseUser.getIdTokenResult();
          const claims = idTokenResult.claims;

          // Role claim is authoritative
          const userRole = claims.role || null;
          const isSystemAdmin = !!claims.admin; // Maps to legacy 'admin' claim

          // Check Firestore ONLY for isActive status (Operational, not Authorization)
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const userData = userDoc.exists() ? userDoc.data() : null;

          if (userData && userData.isActive === false) {
            await auth.signOut();
            setUser(null);
            setIsAdmin(false);
            setRole(null);
          } else {
            setRole(userRole);
            setIsAdmin(isSystemAdmin || ['SuperAdmin', 'CatalogManager', 'OrderManager', 'Viewer'].includes(userRole));
          }
        } catch (error) {
          console.error("Auth error:", error);
          setIsAdmin(false);
          setRole(null);
        }
      } else {
        setUser(null);
        setIsAdmin(false);
        setRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return { user, loading, isAdmin, role, isSuperAdmin };
}
