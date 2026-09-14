// [FIXED] Point #97: Global utility to extract numbers from strings (e.g. "500gm" -> 500)
export const parseNumber = (val) => {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
};

export const formatCurrency = (amount) => {
  const validAmount = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(validAmount);
};

export const formatDate = (date) => {
  if (!date) return '';
  const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const formatDateTime = (date) => {
  if (!date) return '';
  const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata' // [FIXED] Point #104: Enforced IST timezone for all display dates
  });
};
