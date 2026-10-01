import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

const Unauthorized = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-100">
        <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-amber-50 mb-6 border border-amber-200">
          <ShieldAlert className="h-10 w-10 text-amber-600" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600 font-medium mb-2">
          Aapke paas is page ka access nahi hai.
        </p>
        <p className="text-gray-400 text-xs mb-8">
          You do not have the required permissions to view this screen. Please contact your Super Administrator if you need access.
        </p>
        <button
          onClick={() => navigate('/')}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 px-4 bg-[#1b5e20] text-sm font-bold text-white hover:bg-[#2e7d32] transition-colors shadow-md"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default Unauthorized;
