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

export const formatAddress = (addr, fallback = 'Bihar') => {
  if (!addr) return fallback;
  if (typeof addr === 'string') return addr.trim() || fallback;
  if (typeof addr === 'object') {
    if (typeof addr.address === 'string' && addr.address.trim()) {
      return addr.address.trim();
    }
    const parts = [
      addr.line1,
      addr.line2,
      addr.landmark ? `Near ${addr.landmark}` : null,
      addr.village,
      addr.street,
      addr.city || addr.district,
      addr.state,
      addr.pincode ? `PIN: ${addr.pincode}` : (addr.pin ? `PIN: ${addr.pin}` : null)
    ].filter(Boolean).map(p => String(p).trim()).filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : fallback;
  }
  return String(addr) || fallback;
};

