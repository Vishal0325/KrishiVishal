import React, { useState } from "react";
import { ChevronDown, Package2, AlertCircle } from "lucide-react";
import { formatCurrency } from "../../utils/formatters";

const VariantSelector = ({ product, onVariantSelect, selectedVariant, showPrice = true }) => {
  const [isOpen, setIsOpen] = useState(false);

  // If no variants, show base product info
  if (!product.variants || product.variants.length === 0) {
    return (
      <div className="space-y-3">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Package2 size={16} className="text-green-600" />
            <span className="text-xs font-black text-green-600 uppercase tracking-widest">
              Standard Package
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-black text-gray-900">
                {product.quantity} {product.unit}
              </p>
              {showPrice && (
                <p className="text-[10px] text-gray-400 font-bold">
                  Stock: {product.stock}
                </p>
              )}
            </div>
            {showPrice && (
              <div className="text-right">
                <p className="font-black text-gray-900">
                  {formatCurrency(product.price)}
                </p>
                <p className="text-[10px] text-gray-400 line-through">
                  {formatCurrency(product.mrp)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleSelectVariant = (variant) => {
    if (onVariantSelect) {
      onVariantSelect(variant);
    }
    setIsOpen(false);
  };

  // Find selected variant or use first one
  const selected = selectedVariant || product.variants[0];
  const isOutOfStock = Number(selected.stock) === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2 mb-3">
        <Package2 size={14} className="text-primary-dark" />
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
          Select Size / Package
        </label>
      </div>

      {/* Main Dropdown Button */}
      <div
        className="relative"
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full px-4 py-3 rounded-2xl border-2 transition-all flex items-center justify-between font-black text-sm ${
            isOutOfStock
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-gray-50 border-gray-200 hover:border-primary text-gray-900"
          }`}
        >
          <div className="flex items-center space-x-3 flex-1">
            <div className="text-left">
              <p className="text-sm font-black">{selected.label}</p>
              <p className="text-[10px] text-gray-400 font-bold">
                {selected.quantity} {product.unit}
              </p>
            </div>
          </div>
          <ChevronDown
            size={18}
            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-2xl shadow-lg z-50 overflow-hidden animate-in slide-in-from-top-2 duration-200">
            <div className="max-h-72 overflow-y-auto">
              {product.variants.map((variant, idx) => {
                const variantOutOfStock = Number(variant.stock) === 0;
                const isSelected =
                  variant.label === selected.label &&
                  variant.quantity === selected.quantity;

                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectVariant(variant)}
                    disabled={variantOutOfStock}
                    className={`w-full px-4 py-3 flex items-center justify-between border-b border-gray-100 last:border-b-0 transition-all ${
                      isSelected
                        ? "bg-green-50 border-l-4 border-l-green-600"
                        : variantOutOfStock
                          ? "bg-red-50/30 opacity-50 cursor-not-allowed"
                          : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center space-x-3 flex-1">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                        isSelected
                          ? "bg-green-600 border-green-600"
                          : "border-gray-300"
                      }`}>
                        {isSelected && (
                          <span className="text-white text-xs font-black">✓</span>
                        )}
                      </div>
                      <div className="text-left">
                        <p className="font-black text-gray-900">
                          {variant.label}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {variant.quantity} {product.unit}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end space-y-1">
                      {showPrice && (
                        <>
                          <p className="font-black text-gray-900 text-sm">
                            {formatCurrency(variant.price)}
                          </p>
                          <p className="text-[10px] text-gray-400 line-through">
                            {formatCurrency(variant.mrp)}
                          </p>
                        </>
                      )}
                      <p
                        className={`text-[9px] font-black uppercase tracking-tighter ${
                          variantOutOfStock
                            ? "text-red-600"
                            : "text-gray-500"
                        }`}
                      >
                        {variantOutOfStock ? "Out of stock" : `${variant.stock} left`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Selected Variant Info Card */}
      <div
        className={`rounded-2xl p-4 border-2 transition-all ${
          isOutOfStock
            ? "bg-red-50 border-red-200"
            : "bg-green-50 border-green-200"
        }`}
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
              Size / Package
            </p>
            <p className="font-black text-gray-900 text-sm">
              {selected.label}
            </p>
            <p className="text-[9px] text-gray-500">
              {selected.quantity} {product.unit}
            </p>
          </div>
          {showPrice && (
            <div className="text-right">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                Pricing
              </p>
              <p className="font-black text-gray-900 text-sm">
                {formatCurrency(selected.price)}
              </p>
              <p className="text-[9px] text-gray-400 line-through">
                {formatCurrency(selected.mrp)}
              </p>
            </div>
          )}
        </div>

        {isOutOfStock && (
          <div className="flex items-center space-x-2 mt-3 pt-3 border-t border-red-200">
            <AlertCircle size={12} className="text-red-600 flex-shrink-0" />
            <p className="text-[9px] font-black text-red-600 uppercase tracking-tighter">
              This variant is currently out of stock
            </p>
          </div>
        )}
      </div>

      {/* Discount Badge */}
      {selected.price && selected.mrp && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-2">
          <p className="text-center text-sm font-black text-orange-700">
            {Math.round(100 - (Number(selected.price) / Number(selected.mrp)) * 100)}% OFF
          </p>
        </div>
      )}
    </div>
  );
};

export default VariantSelector;
