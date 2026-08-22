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
          // Check Custom Claims first (Most secure)
          const idTokenResult = await firebaseUser.getIdTokenResult();
          const hasAdminClaim = !!idTokenResult.claims.admin;

          // Check Firestore document for role details
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

          if (userDoc.exists()) {
            const data = userDoc.data();
            const isActive = data.isActive !== false;

            if (!isActive) {
              await auth.signOut();
              setUser(null);
              setIsAdmin(false);
              setRole(null);
            } else {
              // Admin if they have the claim OR the flag in DB (for backward compatibility)
              setIsAdmin(hasAdminClaim || data.isAdmin === true || String(data.isAdmin).toLowerCase() === "true");
              setRole(data.role || (hasAdminClaim ? "SuperAdmin" : "Viewer"));
            }
          } else {
            // Document missing, but if they have the claim, allow access
            setIsAdmin(hasAdminClaim);
            setRole(hasAdminClaim ? "SuperAdmin" : null);
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
