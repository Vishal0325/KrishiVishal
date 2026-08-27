import React from 'react';
import LoadingSpinner from './LoadingSpinner';

const DataTable = ({ columns, data, loading, onRowClick }) => {
  if (loading) return <LoadingSpinner />;

  return (
    <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-100">
      <table className="w-full text-left border-collapse">
        <thead className="bg-gray-50/50 border-b border-gray-100">
          <tr>
            {columns.map((col, i) => (
              <th key={i} className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.length > 0 ? (
            data.map((row, rowIndex) => (
              <tr
                key={row.id || row._id || rowIndex}
                onClick={() => onRowClick && onRowClick(row)}
                className={`group transition-colors ${onRowClick ? 'cursor-pointer hover:bg-green-50/30' : 'hover:bg-gray-50/50'}`}
              >
                {columns.map((col, colIndex) => (
                  <td key={colIndex} className="px-6 py-4 text-sm text-gray-700">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-6 py-12 text-center text-gray-400 font-medium italic">
                No records found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
