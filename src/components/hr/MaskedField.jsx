import React, { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

export const MaskedField = ({ value, label, maskChars = 4, className = "" }) => {
  const [revealed, setRevealed] = useState(false);

  if (!value) return <span className="text-gray-400 text-xs italic">Not Provided</span>;

  const strValue = String(value);
  const maskedValue = strValue.length > maskChars
    ? "•".repeat(strValue.length - maskChars) + strValue.slice(-maskChars)
    : "••••" + strValue.slice(-2);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="font-mono text-sm font-medium text-gray-800">
        {revealed ? strValue : maskedValue}
      </span>
      <button
        type="button"
        onClick={() => setRevealed(!revealed)}
        className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"
        title={revealed ? "Hide sensitive value" : "Reveal sensitive value"}
      >
        {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};

export default MaskedField;
