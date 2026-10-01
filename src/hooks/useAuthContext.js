import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState({});
  const [role, setRole] = useState(null);
  const [hubId, setHubId] = useState(null);
  const [hubAccess, setHubAccess] = useState(null);
  const [authError, setAuthError] = useState(null);

  const fetchClaimsAndProfile = useCallback(async (firebaseUser, forceRefresh = false) => {
    if (!firebaseUser) {
      setUser(null);
      setClaims({});
      setRole(null);
      setHubId(null);
      setHubAccess(null);
      setLoading(false);
      return;
    }

    try {
      // 1. Force refresh token if requested (e.g. after login or role update)
      const tokenResult = await firebaseUser.getIdTokenResult(forceRefresh);
      const userClaims = tokenResult.claims || {};
      setClaims(userClaims);

      // Extract claims: role, hubId, hubAccess, admin, isAdmin
      let userRole = userClaims.role;
      let userHubId = userClaims.hubId;
      let userHubAccess = userClaims.hubAccess;

      // Check Firestore users doc for profile verification & isActive check
      const userDocSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        if (userData.isActive === false) {
          await signOut(auth);
          setUser(null);
          setClaims({});
          setRole(null);
          setHubId(null);
          setHubAccess(null);
          setLoading(false);
          return;
        }

        if (!userRole) userRole = userData.role;
        if (!userHubId) userHubId = userData.hubId || userData.assignedWarehouse || userData.warehouseId;
        if (!userHubAccess) userHubAccess = userData.hubAccess;
      }

      // Default hubAccess logic if not present on legacy accounts
      if (!userHubAccess) {
        if (['SuperAdmin', 'FinanceAdmin', 'Viewer'].includes(userRole)) {
          userHubAccess = 'ALL';
        } else if (['HubManager', 'DepartmentManager'].includes(userRole)) {
          userHubAccess = 'SINGLE';
        } else {
          userHubAccess = userClaims.admin || userClaims.isAdmin ? 'ALL' : 'SINGLE';
        }
      }

      setUser(firebaseUser);
      setRole(userRole || (userClaims.isAdmin || userClaims.admin ? 'SuperAdmin' : 'Viewer'));
      setHubId(userHubId || null);
      setHubAccess(userHubAccess);
      setAuthError(null);
    } catch (err) {
      console.error("Auth context error:", err);
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      await fetchClaimsAndProfile(firebaseUser, true);
    });
    return unsubscribe;
  }, [fetchClaimsAndProfile]);

  const refreshAuth = useCallback(async () => {
    if (auth.currentUser) {
      setLoading(true);
      await fetchClaimsAndProfile(auth.currentUser, true);
    }
  }, [fetchClaimsAndProfile]);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Signout error:", err);
    }
  }, []);

  const isAdmin = !!claims.isAdmin || !!claims.admin || role === 'SuperAdmin' || role === 'Admin';
  const isSuperAdmin = role === 'SuperAdmin';
  const isFinanceAdmin = role === 'FinanceAdmin';
  const isHubManager = role === 'HubManager';
  const isDeptManager = role === 'DepartmentManager';
  const isViewer = role === 'Viewer';

  // Helper booleans
  const canViewFinance = isSuperAdmin || isFinanceAdmin;
  const canManageStaff = isSuperAdmin;
  const isHubScoped = hubAccess === 'SINGLE';

  const value = {
    user,
    role,
    hubId,
    hubAccess,
    admin: !!claims.admin,
    isAdmin,
    isSuperAdmin,
    isFinanceAdmin,
    isHubManager,
    isDeptManager,
    isViewer,
    canViewFinance,
    canManageStaff,
    isHubScoped,
    loading,
    authError,
    logout,
    refreshAuth
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: auth.currentUser,
      role: null,
      hubId: null,
      hubAccess: null,
      admin: false,
      isAdmin: false,
      isSuperAdmin: false,
      isFinanceAdmin: false,
      isHubManager: false,
      isDeptManager: false,
      isViewer: false,
      canViewFinance: false,
      canManageStaff: false,
      isHubScoped: false,
      loading: false,
      authError: null,
      logout: () => signOut(auth),
      refreshAuth: () => Promise.resolve()
    };
  }
  return context;
}

export default useAuthContext;
