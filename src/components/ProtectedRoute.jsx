import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../hooks/useAuthContext';
import LoadingSpinner from './common/LoadingSpinner';

export const ProtectedRoute = ({ allowedRoles, children }) => {
  const { user, role, isSuperAdmin, loading } = useAuthContext();

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // SuperAdmin has access to all routes
  if (isSuperAdmin || role === 'SuperAdmin') {
    return children;
  }

  // Check if user's role is allowed
  if (allowedRoles && Array.isArray(allowedRoles) && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default ProtectedRoute;
