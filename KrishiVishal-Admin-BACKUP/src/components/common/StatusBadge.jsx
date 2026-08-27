import React from 'react';
import { ORDER_STATUS } from '../../utils/constants';

const StatusBadge = ({ status }) => {
  const config = ORDER_STATUS[status] || { label: status, color: '#757575' };

  return (
    <span
      className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center shadow-sm"
      style={{
        backgroundColor: `${config.color}15`,
        color: config.color,
        border: `1px solid ${config.color}30`
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: config.color }}></span>
      {config.label}
    </span>
  );
};

export default StatusBadge;
