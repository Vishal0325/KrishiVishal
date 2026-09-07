import React from 'react';

const LoadingSkeleton = ({ rows = 5, type = "table" }) => {
  if (type === "card") {
    return (
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-3/4"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
      <div className="h-14 bg-gray-50 border-b border-gray-100 flex items-center px-6 gap-4">
        <div className="h-4 bg-gray-200 rounded w-1/6"></div>
        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/5"></div>
      </div>
      <div className="divide-y divide-gray-100">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="h-16 flex items-center px-6 gap-4">
            <div className="h-4 bg-gray-100 rounded w-1/6"></div>
            <div className="h-4 bg-gray-100 rounded w-1/4"></div>
            <div className="h-4 bg-gray-100 rounded w-1/5"></div>
            <div className="h-8 bg-gray-100 rounded-full w-16 ml-auto"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LoadingSkeleton;
