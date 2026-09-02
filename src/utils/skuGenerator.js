/**
 * KrishiVishal SKU Nomenclature Generator & Validator
 * Format: CC-III-VVV-GG-SSSUU-BBB
 *
 * CC   = Category Code (2 letters)
 * III  = Item Code (3 alphanumeric)
 * VVV  = Variety Code (3 alphanumeric)
 * GG   = Grade Code (2 alphanumeric)
 * SSSUU = Pack Size (3 digits) + Unit (2 letters)
 * BBB  = Brand Code (3 alphanumeric)
 */

// Known valid category codes
export const VALID_CATEGORIES = [
  { code: 'FE', label: 'Fertilizers / Khad' },
  { code: 'PE', label: 'Pesticides / Keetnashak' },
  { code: 'SE', label: 'Seeds / Beej' },
  { code: 'EQ', label: 'Equipment / Tools' },
  { code: 'IR', label: 'Irrigation' },
  { code: 'OG', label: 'Organic / Bio' },
  { code: 'NT', label: 'Nutrients / Micronutrients' },
  { code: 'OT', label: 'Others' },
];

export const VALID_CATEGORY_CODES = new Set(VALID_CATEGORIES.map(c => c.code));

// Known valid units
export const VALID_UNITS = [
  { code: 'KG', label: 'Kilogram' },
  { code: 'GM', label: 'Gram' },
  { code: 'LT', label: 'Litre' },
  { code: 'ML', label: 'Millilitre' },
  { code: 'PC', label: 'Piece' },
  { code: 'MT', label: 'Metre' },
  { code: 'PK', label: 'Pack' },
  { code: 'DO', label: 'Dozen' },
  { code: 'BG', label: 'Bag' },
];

export const VALID_UNIT_CODES = new Set(VALID_UNITS.map(u => u.code));

// Full 6-segment SKU regex
export const SKU_REGEX = /^[A-Z]{2}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{2}-[A-Z0-9]{5}-[A-Z0-9]{3}$/;

/**
 * Generates a standard SKU code from segments.
 * @param {{ categoryCode: string, itemCode: string, varietyCode: string, gradeCode: string, size: string|number, unit: string, brandCode: string }} segments
 * @returns {string} Generated SKU code
 */
export function generateSkuCode({
  categoryCode,
  itemCode,
  varietyCode,
  gradeCode,
  size,
  unit,
  brandCode
}) {
  const cc = (categoryCode || 'XX').toUpperCase().padStart(2, 'X').slice(0, 2);
  const iii = (itemCode || 'XXX').toUpperCase().padStart(3, 'X').slice(0, 3);
  const vvv = (varietyCode || 'XXX').toUpperCase().padStart(3, 'X').slice(0, 3);
  const gg = (gradeCode || 'A1').toUpperCase().padStart(2, 'X').slice(0, 2);

  // Format Size/Unit: SSSUU (e.g., 500ML, 001KG)
  const sss = (size || '000').toString().padStart(3, '0').slice(0, 3);
  const uu = (unit || 'XX').toUpperCase().padStart(2, 'X').slice(0, 2);
  const sssuu = `${sss}${uu}`;

  const bbb = (brandCode || 'XXX').toUpperCase().padStart(3, 'X').slice(0, 3);

  return `${cc}-${iii}-${vvv}-${gg}-${sssuu}-${bbb}`;
}

/**
 * Validates SKU syntax and business rules.
 * @param {string} skuCode
 * @returns {{ isValid: boolean, error?: string, skuCode?: string, productId?: string, segments?: object }}
 */
export function validateSku(skuCode) {
  if (!skuCode || typeof skuCode !== 'string') {
    return { isValid: false, error: 'SKU code must be a non-empty string.' };
  }

  const upper = skuCode.trim().toUpperCase();

  if (!SKU_REGEX.test(upper)) {
    return {
      isValid: false,
      error: `Invalid SKU format '${upper}'. Must match CC-III-VVV-GG-SSSUU-BBB (e.g. FE-URE-GRN-46-050KG-IFF).`
    };
  }

  const [category, item, variety, grade, pack, brand] = upper.split('-');

  // Category check
  if (!VALID_CATEGORY_CODES.has(category)) {
    return {
      isValid: false,
      error: `Invalid category code '${category}'. Allowed: ${Array.from(VALID_CATEGORY_CODES).join(', ')}`
    };
  }

  // Pack parsing (3 digits + 2 letters unit, e.g. 050KG, 500ML)
  const sizeStr = pack.slice(0, 3);
  const unit = pack.slice(3);
  const sizeNum = parseInt(sizeStr, 10);

  if (isNaN(sizeNum) || sizeNum <= 0) {
    return { isValid: false, error: `Invalid pack size '${sizeStr}' in '${pack}'. Size must be > 0.` };
  }

  if (!VALID_UNIT_CODES.has(unit)) {
    return {
      isValid: false,
      error: `Invalid unit '${unit}' in pack '${pack}'. Allowed: ${Array.from(VALID_UNIT_CODES).join(', ')}`
    };
  }

  // Parent Product ID: Category-Item-Variety-Brand (CC-III-VVV-BBB)
  const productId = `${category}-${item}-${variety}-${brand}`;

  return {
    isValid: true,
    skuCode: upper,
    productId,
    segments: {
      category,
      item,
      variety,
      grade,
      pack,
      size: sizeNum,
      unit,
      brand
    }
  };
}

/**
 * Derives the parent product ID from a valid SKU code.
 * @param {string} skuCode
 * @returns {string|null}
 */
export function deriveProductId(skuCode) {
  const result = validateSku(skuCode);
  return result.isValid ? result.productId : null;
}
