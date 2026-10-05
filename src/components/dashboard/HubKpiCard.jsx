import React, { useState, useEffect } from 'react';
import { HUBS } from '../../context/HubContext';
import { useAuthContext } from '../../hooks/useAuthContext';

export function HubKpiCard({ title, fetchData, renderValue }) {
  const { hubAccess, hubId: userHubId } = useAuthContext();
  const [cardHub, setCardHub] = useState(
    hubAccess === 'SINGLE' ? userHubId : 'ALL'
  );
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetchData(cardHub === 'ALL' ? null : cardHub)
      .then(res => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error(err);
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [cardHub, fetchData]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col justify-between h-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-gray-600">{title}</span>
        {hubAccess === 'ALL' && (
          <select
            value={cardHub}
            onChange={e => setCardHub(e.target.value)}
            className="text-[10px] font-bold border rounded px-1.5 py-1 bg-gray-50 text-gray-700 outline-none cursor-pointer"
          >
            {HUBS.map(h => (
              <option key={h.id} value={h.id}>{h.label}</option>
            ))}
          </select>
        )}
      </div>
      <div className="text-2xl font-black text-emerald-700 mt-2">
        {loading ? <span className="text-gray-300 text-lg">Loading...</span> : renderValue(data)}
      </div>
    </div>
  );
}
