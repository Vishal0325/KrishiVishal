import { useState, useEffect } from 'react';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState(null);
  const [authError, setAuthError] = useState(null);

  const isSuperAdmin = role === "SuperAdmin";

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          // [PERF] Run both calls in PARALLEL instead of sequential — saves ~500ms on load
          const [idTokenResult, userDoc] = await Promise.all([
            firebaseUser.getIdTokenResult(),
            getDoc(doc(db, 'users', firebaseUser.uid))
          ]);

          // [FIXED] Point #154: Check unified 'isAdmin' claim
          const hasAdminClaim = !!idTokenResult.claims.isAdmin || !!idTokenResult.claims.admin;

          if (userDoc.exists()) {
            const data = userDoc.data();
            const isActive = data.isActive !== false;

            if (!isActive) {
              await auth.signOut();
              setUser(null);
              setIsAdmin(false);
              setRole(null);
            } else {
              // [FIXED] Point #78: Allow any valid admin panel role or explicit isAdmin flag
              const hasRole = !!data.role && data.role !== 'Rider' && data.role !== 'Customer';
              setIsAdmin(hasAdminClaim || data.isAdmin === true || hasRole);
              setRole(data.role || (hasAdminClaim ? "SuperAdmin" : "SuperAdmin"));
            }
          } else {
            // Document missing, but if they have the claim, allow access
            setIsAdmin(hasAdminClaim);
            setRole(hasAdminClaim ? "SuperAdmin" : null);
          }
        } catch (error) {
          console.error("Auth error:", error);
          setAuthError(error.message);
          setIsAdmin(false);
          setRole(null);
        }
      } else {
        setUser(null);
        setIsAdmin(false);
        setRole(null);
        setAuthError(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Signout error:", err);
    }
  };

  return { user, loading, isAdmin, role, isSuperAdmin, authError, logout };
}
