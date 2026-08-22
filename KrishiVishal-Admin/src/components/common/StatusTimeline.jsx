import React from 'react';
import { CheckCircle2, Circle, Clock, Truck, Home, PackageCheck, Ban } from 'lucide-react';
import { formatDateTime } from '../../utils/formatters';

const StatusTimeline = ({ currentStatus, createdAt }) => {
  const steps = [
    { id: 'PLACED', label: 'Order Placed', icon: Clock },
    { id: 'CONFIRMED', label: 'Confirmed', icon: PackageCheck },
    { id: 'SHIPPED', label: 'Shipped', icon: Truck },
    { id: 'DELIVERED', label: 'Delivered', icon: Home },
  ];

  const getStatusIndex = (status) => steps.findIndex(s => s.id === status);
  const currentIndex = getStatusIndex(currentStatus);

  if (currentStatus === 'CANCELLED') {
    return (
      <div className="flex items-center space-x-3 bg-red-50 p-4 rounded-2xl border border-red-100">
        <div className="h-10 w-10 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-100">
          <Ban size={20} />
        </div>
        <div>
          <p className="text-xs font-black text-red-700 uppercase tracking-widest">Order Cancelled</p>
          <p className="text-[10px] text-red-500 font-bold italic uppercase">{formatDateTime(new Date())}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {steps.map((step, idx) => {
        const isCompleted = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        const isFuture = idx > currentIndex;

        return (
          <div key={step.id} className="flex items-start group">
            <div className="flex flex-col items-center mr-4 relative">
              <div className={`h-10 w-10 rounded-2xl flex items-center justify-center transition-all duration-500 z-10
                ${isCompleted ? 'bg-green-500 text-white shadow-lg shadow-green-100' :
                  isCurrent ? 'bg-primary text-white shadow-xl shadow-green-200 animate-pulse' :
                  'bg-gray-100 text-gray-300'}`}
              >
                <step.icon size={20} strokeWidth={isCurrent ? 3 : 2} />
              </div>
              {idx !== steps.length - 1 && (
                <div className={`w-0.5 h-10 -mb-2 ${isCompleted ? 'bg-green-500' : 'bg-gray-100'}`} />
              )}
            </div>
            <div className="pt-2">
              <p className={`text-xs font-black uppercase tracking-widest ${isFuture ? 'text-gray-300' : 'text-gray-900'}`}>
                {step.label}
              </p>
              {isCurrent && (
                <p className="text-[10px] text-primary font-bold uppercase tracking-tighter mt-0.5">Active Step</p>
              )}
              {isCompleted && (
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter mt-0.5">{idx === 0 ? formatDateTime(createdAt) : 'Step Completed'}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StatusTimeline;
