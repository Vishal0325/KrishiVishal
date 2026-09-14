import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

const Unauthorized = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
        <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-red-100 mb-6">
          <ShieldAlert className="h-10 w-10 text-red-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-500 mb-8">
          You do not have the required permissions to view this page. If you believe this is an error, please contact the Super Admin.
        </p>
        <button
          onClick={() => navigate(-1)}
          className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:text-sm"
        >
          Go Back
        </button>
      </div>
    </div>
  );
};

export default Unauthorized;
