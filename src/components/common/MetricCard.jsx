import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

const MetricCard = ({ title, value, change, icon: Icon, color, onClick }) => {
  const isPositive = change?.startsWith('+');

  const colorMap = {
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 group ${onClick ? 'cursor-pointer active:scale-95' : ''}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl transition-colors duration-300 ${colorMap[color] || colorMap.green}`}>
          <Icon size={24} />
        </div>
        {change && (
          <div className={`flex items-center text-xs font-bold px-2 py-1 rounded-lg ${isPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
            {isPositive ? <ArrowUpRight size={14} className="mr-1" /> : <ArrowDownRight size={14} className="mr-1" />}
            {change}
          </div>
        )}
      </div>
      <div>
        <p className="text-gray-500 text-sm font-medium mb-1 group-hover:text-gray-700 transition-colors">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900 tracking-tight">{value}</h3>
      </div>
    </div>
  );
};

export default MetricCard;
