import React from 'react';

const LoadingSpinner = ({ fullScreen = false }) => {
  const spinner = (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-dark"></div>
      <p className="text-gray-500 font-medium">KrishiVishal Loading...</p>
    </div>
  );

  if (fullScreen) {
    return <div className="h-screen w-screen flex items-center justify-center bg-gray-50">{spinner}</div>;
  }

  return <div className="flex items-center justify-center p-8">{spinner}</div>;
};

export default LoadingSpinner;
