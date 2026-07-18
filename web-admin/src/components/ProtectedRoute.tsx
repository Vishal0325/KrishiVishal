import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AlertCircle } from 'lucide-react';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, isAdmin, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-color"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6">
        <div className="bg-slate-900 p-8 rounded-2xl border border-red-500/30 flex flex-col items-center max-w-md text-center">
          <AlertCircle size={64} className="text-red-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-slate-400 mb-6">
            Your account does not have administrator privileges. Please contact the technical team to grant access.
          </p>
          <button
            onClick={() => logout()}
            className="btn btn-primary w-full"
          >
            Logout and Try Another Account
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
