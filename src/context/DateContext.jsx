import React, { createContext, useContext, useState, useMemo } from 'react';

const DateContext = createContext(null);

export const DATE_PRESETS = [
  { id: 'ALL', label: '🌐 All Time (Sabhi Data)' },
  { id: 'TODAY', label: '📅 Today (Aaj)' },
  { id: 'YESTERDAY', label: '⏮️ Yesterday (Kal)' },
  { id: 'LAST_7_DAYS', label: '📊 Last 7 Days (Pichle 7 Din)' },
  { id: 'THIS_MONTH', label: '🗓️ This Month (Is Mahine)' },
  { id: 'CUSTOM', label: '🎯 Custom Date (Koyi Khaas Taarikh)' }
];

export function DateProvider({ children }) {
  const [dateMode, setDateMode] = useState('ALL'); // Default to ALL so existing lifetime view is preserved unless changed
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  const { start, end, label } = useMemo(() => {
    const now = new Date();
    if (dateMode === 'TODAY') {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const str = s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      return { start: s, end: e, label: `Today (${str})` };
    }
    if (dateMode === 'YESTERDAY') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const s = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
      const e = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
      const str = s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      return { start: s, end: e, label: `Yesterday (${str})` };
    }
    if (dateMode === 'LAST_7_DAYS') {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      s.setHours(0, 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { start: s, end: e, label: 'Last 7 Days' };
    }
    if (dateMode === 'THIS_MONTH') {
      const s = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start: s, end: e, label: now.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) };
    }
    if (dateMode === 'CUSTOM' && customDate) {
      const [year, month, day] = customDate.split('-').map(Number);
      const s = new Date(year, month - 1, day, 0, 0, 0, 0);
      const e = new Date(year, month - 1, day, 23, 59, 59, 999);
      const str = s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      return { start: s, end: e, label: str };
    }
    // Default: ALL
    const todayFormatted = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return { start: null, end: null, label: `All Time (${todayFormatted})` };
  }, [dateMode, customDate]);

  // Helper filter function for items with createdAt
  const filterByDate = (items, dateField = 'createdAt') => {
    if (!items || !Array.isArray(items)) return [];
    if (!start || !end) return items; // ALL

    return items.filter(item => {
      const rawVal = item[dateField];
      if (!rawVal) return false;
      const itemDate = rawVal?.toDate ? rawVal.toDate() : new Date(rawVal);
      if (isNaN(itemDate.getTime())) return false;
      return itemDate >= start && itemDate <= end;
    });
  };

  return (
    <DateContext.Provider value={{
      dateMode,
      setDateMode,
      customDate,
      setCustomDate,
      startDate: start,
      endDate: end,
      dateLabel: label,
      filterByDate,
      DATE_PRESETS
    }}>
      {children}
    </DateContext.Provider>
  );
}

export const useDateContext = () => useContext(DateContext);
export default useDateContext;
