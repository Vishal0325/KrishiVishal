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

// Common Category Name to 2-letter Code Mapping
export const CATEGORY_NAME_TO_CODE = {
  fertilizer: 'FE',
  fertilizers: 'FE',
  khad: 'FE',
  urea: 'FE',
  dap: 'FE',
  pesticide: 'PE',
  pesticides: 'PE',
  insecticide: 'PE',
  insecticides: 'PE',
  fungicide: 'PE',
  fungicides: 'PE',
  herbicide: 'PE',
  herbicides: 'PE',
  keetnashak: 'PE',
  seed: 'SE',
  seeds: 'SE',
  beej: 'SE',
  equipment: 'EQ',
  equipments: 'EQ',
  tools: 'EQ',
  machinery: 'EQ',
  irrigation: 'IR',
  drip: 'IR',
  sprinkler: 'IR',
  pipe: 'IR',
  organic: 'OG',
  bio: 'OG',
  vermicompost: 'OG',
  nutrient: 'NT',
  nutrients: 'NT',
  micronutrient: 'NT',
  micronutrients: 'NT',
  other: 'OT',
  others: 'OT'
};

// Unit standardizer mapping
export const UNIT_NAME_TO_CODE = {
  kg: 'KG',
  kgs: 'KG',
  kilogram: 'KG',
  kilograms: 'KG',
  gm: 'GM',
  gms: 'GM',
  g: 'GM',
  gram: 'GM',
  grams: 'GM',
  lt: 'LT',
  ltr: 'LT',
  ltrs: 'LT',
  l: 'LT',
  liter: 'LT',
  litre: 'LT',
  litres: 'LT',
  ml: 'ML',
  milli: 'ML',
  millilitre: 'ML',
  pc: 'PC',
  pcs: 'PC',
  piece: 'PC',
  pieces: 'PC',
  mt: 'MT',
  meter: 'MT',
  metre: 'MT',
  meters: 'MT',
  pk: 'PK',
  pack: 'PK',
  packet: 'PK',
  do: 'DO',
  dozen: 'DO',
  bg: 'BG',
  bag: 'BG',
  bags: 'BG',
  sl: 'LT',
  ec: 'ML',
  sc: 'ML',
  wp: 'GM',
  wg: 'GM',
  gr: 'KG',
  sp: 'GM'
};

// Full 6-segment SKU regex
export const SKU_REGEX = /^[A-Z]{2}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{2}-[A-Z0-9]{5}-[A-Z0-9]{3}$/;

/**
 * Returns smart default HSN and GST rate for a given category.
 * @param {string} categoryNameOrCode
 * @returns {{ hsnCode: string, gstRate: number }}
 */
export function getCategoryTaxDefaults(categoryNameOrCode = '') {
  const clean = categoryNameOrCode.toString().trim().toLowerCase();
  const code = CATEGORY_NAME_TO_CODE[clean] || categoryNameOrCode.toString().trim().toUpperCase();

  switch (code) {
    case 'FE':
      return { hsnCode: '31021010', gstRate: 5 };
    case 'PE':
      return { hsnCode: '38089190', gstRate: 18 };
    case 'SE':
      return { hsnCode: '12099990', gstRate: 0 };
    case 'EQ':
      return { hsnCode: '84329090', gstRate: 18 };
    case 'IR':
      return { hsnCode: '84248200', gstRate: 12 };
    case 'OG':
      return { hsnCode: '31059090', gstRate: 5 };
    case 'NT':
      return { hsnCode: '31052000', gstRate: 12 };
    default:
      return { hsnCode: '31021010', gstRate: 5 };
  }
}

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
  const cc = (categoryCode || 'OT').toUpperCase().padStart(2, 'X').slice(0, 2);
  const iii = (itemCode || 'GEN').toUpperCase().padStart(3, 'X').slice(0, 3);
  const vvv = (varietyCode || 'STD').toUpperCase().padStart(3, 'X').slice(0, 3);
  const gg = (gradeCode || 'A1').toUpperCase().padStart(2, 'X').slice(0, 2);

  // Format Size/Unit: SSSUU (e.g., 500ML, 001KG)
  const sizeNum = parseInt(size, 10) || 1;
  const sss = sizeNum.toString().padStart(3, '0').slice(-3);
  const uu = (unit || 'PC').toUpperCase().padStart(2, 'X').slice(0, 2);
  const sssuu = `${sss}${uu}`;

  const bbb = (brandCode || 'GEN').toUpperCase().padStart(3, 'X').slice(0, 3);

  return `${cc}-${iii}-${vvv}-${gg}-${sssuu}-${bbb}`;
}

/**
 * Smart Auto-Deriver: Creates a standardized 6-segment SKU directly from product fields.
 * No manual coding required by user.
 * @param {object} product
 * @returns {string} Fully validated SKU code
 */
export function autoDeriveSkuFromProduct(product = {}) {
  if (!product) return 'OT-GEN-STD-A1-001PC-GEN';

  // 1. If explicit valid SKU provided, use it
  if (product.skuCode && SKU_REGEX.test(product.skuCode.trim().toUpperCase())) {
    return product.skuCode.trim().toUpperCase();
  }

  // 2. Derive Category Code (CC)
  const catRaw = (product.categoryCode || product.category || '').toString().trim().toLowerCase();
  let cc = CATEGORY_NAME_TO_CODE[catRaw] || (product.categoryCode || '').toUpperCase().slice(0, 2);
  if (!VALID_CATEGORY_CODES.has(cc)) cc = 'OT';

  // 3. Derive Brand Code (BBB)
  const brandRaw = (product.brandCode || product.brand || 'GEN').toString().trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const bbb = brandRaw.length >= 3 ? brandRaw.slice(0, 3) : brandRaw.padEnd(3, '0');

  // 4. Derive Item Code (III) from Name or Item
  const nameClean = (product.name || product.item || 'GEN').toString().trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const iii = nameClean.length >= 3 ? nameClean.slice(0, 3) : nameClean.padEnd(3, '0');

  // 5. Derive Variety Code (VVV) from subcategory / variety
  const varClean = (product.variety || product.subCategory || 'STD').toString().trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const vvv = varClean.length >= 3 ? varClean.slice(0, 3) : varClean.padEnd(3, '0');

  // 6. Grade (GG)
  const gg = (product.grade || 'A1').toString().trim().toUpperCase().slice(0, 2).padEnd(2, '1');

  // 7. Parse Size & Unit (SSSUU)
  let size = 1;
  let unit = 'PC';

  if (product.quantity) {
    const qStr = product.quantity.toString().trim();
    const numMatch = qStr.match(/\d+/);
    if (numMatch) size = parseInt(numMatch[0], 10);
    const unitMatch = qStr.match(/[a-zA-Z]+/);
    if (unitMatch) {
      const uRaw = unitMatch[0].toLowerCase();
      unit = UNIT_NAME_TO_CODE[uRaw] || 'PC';
    }
  }

  if (product.unit) {
    const uRaw = product.unit.toString().trim().toLowerCase();
    unit = UNIT_NAME_TO_CODE[uRaw] || unit;
  }

  if (product.size) {
    const sNum = parseInt(product.size, 10);
    if (!isNaN(sNum) && sNum > 0) size = sNum;
  }

  if (!VALID_UNIT_CODES.has(unit)) unit = 'PC';

  return generateSkuCode({
    categoryCode: cc,
    itemCode: iii,
    varietyCode: vvv,
    gradeCode: gg,
    size,
    unit,
    brandCode: bbb
  });
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
