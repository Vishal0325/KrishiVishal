import React, { useState, useEffect } from 'react';
import { generateSkuCode } from '../../utils/skuGenerator';
import { Trash2, Link } from 'lucide-react';

const SKUBuilderRow = ({
    variant,
    index,
    onUpdate,
    onRemove,
    masterData
}) => {
    const { categories = [], items = [], varieties = [], grades = [], packs = [], brands = [] } = masterData;

    // Internal state for segments to generate SKU
    const [segments, setSegments] = useState({
        categoryCode: variant.segments?.category || '',
        itemCode: variant.segments?.item || '',
        varietyCode: variant.segments?.variety || '',
        gradeCode: variant.segments?.grade || 'A1', // Default to A1
        size: variant.segments?.size || '',
        unit: variant.segments?.unit || '',
        brandCode: variant.segments?.brand || ''
    });

    useEffect(() => {
        // Generate SKU even if some segments are missing (uses padding)
        const sku = generateSkuCode({
            categoryCode: segments.categoryCode || 'XX',
            itemCode: segments.itemCode || 'XXX',
            varietyCode: segments.varietyCode || 'XXX',
            gradeCode: segments.gradeCode || 'XX',
            size: segments.size || '000',
            unit: segments.unit || 'XX',
            brandCode: segments.brandCode || 'XXX'
        });
        onUpdate(index, 'skuCode', sku);
        onUpdate(index, 'segments', segments);
    }, [segments]);

    const handleChange = (field, value) => {
        setSegments(prev => ({ ...prev, [field]: value }));
    };

    return (
        <tr className="hover:bg-green-50/30 transition-colors">
            <td className="px-2 py-3">
                <select
                    value={segments.categoryCode}
                    onChange={(e) => handleChange('categoryCode', e.target.value)}
                    className={`w-full bg-white border rounded-xl px-2 py-2 text-[10px] font-black ${!segments.categoryCode ? 'border-red-200 text-red-400' : 'border-gray-100'}`}
                >
                    <option value="">CAT</option>
                    {categories.map(c => <option key={c.id} value={c.code || ''}>{c.name} {!(c.code) ? '(No Code!)' : ''}</option>)}
                </select>
            </td>
            <td className="px-2 py-3">
                <select
                    value={segments.itemCode}
                    onChange={(e) => handleChange('itemCode', e.target.value)}
                    className={`w-full bg-white border rounded-xl px-2 py-2 text-[10px] font-black ${!segments.itemCode ? 'border-red-200 text-red-400' : 'border-gray-100'}`}
                >
                    <option value="">ITEM</option>
                    {items.filter(i => i.parentCode === segments.categoryCode).map(i => <option key={i.id} value={i.code || ''}>{i.name}</option>)}
                </select>
            </td>
            <td className="px-2 py-3">
                <select
                    value={segments.varietyCode}
                    onChange={(e) => handleChange('varietyCode', e.target.value)}
                    className={`w-full bg-white border rounded-xl px-2 py-2 text-[10px] font-black ${!segments.varietyCode ? 'border-red-200 text-red-400' : 'border-gray-100'}`}
                >
                    <option value="">VAR</option>
                    {varieties.filter(v => v.parentCode === segments.itemCode).map(v => <option key={v.id} value={v.code || ''}>{v.name}</option>)}
                </select>
            </td>
            <td className="px-2 py-3">
                <select
                    value={segments.gradeCode}
                    onChange={(e) => handleChange('gradeCode', e.target.value)}
                    className="w-full bg-white border border-gray-100 rounded-xl px-2 py-2 text-[10px] font-black"
                >
                    {grades.length > 0 ? grades.map(g => <option key={g.id} value={g.code}>{g.name}</option>) : <option value="A1">A1 (Default)</option>}
                </select>
            </td>
            <td className="px-2 py-3">
                <select
                    value={segments.brandCode}
                    onChange={(e) => handleChange('brandCode', e.target.value)}
                    className={`w-full bg-white border rounded-xl px-2 py-2 text-[10px] font-black ${!segments.brandCode ? 'border-red-200 text-red-400' : 'border-gray-100'}`}
                >
                    <option value="">BRAND</option>
                    {brands.map(b => <option key={b.id} value={b.code || ''}>{b.name} {!(b.code) ? '(No Code!)' : ''}</option>)}
                </select>
            </td>
            <td className="px-2 py-3 w-32">
                <div className="flex gap-1">
                    <input
                        type="number"
                        placeholder="Size"
                        value={segments.size}
                        onChange={(e) => handleChange('size', e.target.value)}
                        className="w-1/2 bg-white border border-gray-100 rounded-xl px-2 py-2 text-[10px] font-black"
                    />
                    <select
                        value={segments.unit}
                        onChange={(e) => handleChange('unit', e.target.value)}
                        className="w-1/2 bg-white border border-gray-100 rounded-xl px-2 py-2 text-[10px] font-black"
                    >
                        <option value="">U</option>
                        {packs.map(p => <option key={p.unit} value={p.unit}>{p.unit}</option>)}
                    </select>
                </div>
            </td>
            <td className="px-2 py-3">
                <div className="bg-gray-100 px-3 py-2 rounded-xl font-mono text-[9px] font-black text-gray-500 break-all">
                    {variant.skuCode || 'GEN-ERATING...'}
                </div>
            </td>
            <td className="px-2 py-3">
                <input
                    type="number"
                    value={variant.price}
                    onChange={(e) => onUpdate(index, 'price', e.target.value)}
                    className="w-full bg-green-50/50 border border-green-100 rounded-xl px-2 py-2 text-xs font-black text-primary-dark"
                    placeholder="Price"
                />
            </td>
            <td className="px-2 py-3 text-center">
                <button onClick={() => onRemove(index)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg">
                    <Trash2 size={14} />
                </button>
            </td>
        </tr>
    );
};

export default SKUBuilderRow;
