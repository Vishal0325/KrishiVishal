import React from 'react';

const PageHeader = ({ title, subtitle, description, actions, action, children }) => {
  const subText = subtitle || description;
  const headerActions = actions || action;

  const renderAction = (act, idx) => {
    if (!act) return null;
    if (React.isValidElement(act)) {
      return <React.Fragment key={idx}>{act}</React.Fragment>;
    }
    if (typeof act === 'object') {
      const {
        label,
        icon: Icon,
        onClick,
        variant = 'primary',
        disabled = false,
        className = '',
        title: actionTitle
      } = act;

      let variantClasses = 'bg-[#0B4D31] text-white hover:bg-[#083a25] shadow-sm';
      if (variant === 'secondary' || variant === 'outline') {
        variantClasses = 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm';
      } else if (variant === 'danger') {
        variantClasses = 'bg-red-600 text-white hover:bg-red-700 shadow-sm';
      }

      return (
        <button
          key={idx}
          onClick={onClick}
          disabled={disabled}
          title={actionTitle}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses} ${className}`}
        >
          {Icon && (
            typeof Icon === 'function' || typeof Icon === 'object' ? (
              React.isValidElement(Icon) ? Icon : <Icon size={16} />
            ) : null
          )}
          {label && <span>{label}</span>}
        </button>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">{title}</h1>
        {subText && (
          <p className="text-xs text-gray-500 font-medium mt-1">{subText}</p>
        )}
      </div>
      <div className="flex items-center flex-wrap gap-3">
        {children}
        {headerActions && (
          <div className="flex items-center flex-wrap gap-2">
            {Array.isArray(headerActions)
              ? headerActions.map(renderAction)
              : renderAction(headerActions, 'single-action')}
          </div>
        )}
      </div>
    </div>
  );
};

export default PageHeader;

