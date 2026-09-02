/**
 * KrishiVishal SKU Validator & Master Data Rules
 * Standard: CC-III-VVV-GG-SSSUU-BBB
 */

const SKU_REGEX = /^[A-Z]{2}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{2}-[A-Z0-9]{5}-[A-Z0-9]{3}$/;

// Known valid category codes
const VALID_CATEGORIES = new Set([
    'FE', // Fertilizers / Khad
    'PE', // Pesticides / Keetnashak
    'SE', // Seeds / Beej
    'EQ', // Equipment / Tools
    'IR', // Irrigation
    'OG', // Organic / Bio
    'NT', // Nutrients / Micronutrients
    'OT'  // Others
]);

// Known valid units
const VALID_UNITS = new Set(['KG', 'GM', 'LT', 'ML', 'PC', 'MT', 'PK', 'DO', 'BG']);

/**
 * Validates SKU syntax and business rules
 * @param {string} skuCode 
 * @returns {{ isValid: boolean, error?: string, segments?: object, productId?: string }}
 */
function validateSku(skuCode) {
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
    if (!VALID_CATEGORIES.has(category)) {
        return {
            isValid: false,
            error: `Invalid category code '${category}'. Allowed: ${Array.from(VALID_CATEGORIES).join(', ')}`
        };
    }

    // Pack parsing (3 digits + 2 letters unit, e.g. 050KG, 500ML)
    const sizeStr = pack.slice(0, 3);
    const unit = pack.slice(3);
    const sizeNum = parseInt(sizeStr, 10);

    if (isNaN(sizeNum) || sizeNum <= 0) {
        return { isValid: false, error: `Invalid pack size '${sizeStr}' in '${pack}'. Size must be > 0.` };
    }

    if (!VALID_UNITS.has(unit)) {
        return {
            isValid: false,
            error: `Invalid unit '${unit}' in pack '${pack}'. Allowed: ${Array.from(VALID_UNITS).join(', ')}`
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
 * Generates standard SKU Code from segments
 */
function generateSkuCode({ category, item, variety, grade, size, unit, brand }) {
    const pad = (str, len) => (str || '').toString().trim().toUpperCase().padStart(len, '0').slice(-len);
    const code3 = (str) => (str || '').toString().trim().toUpperCase().padEnd(3, '0').slice(0, 3);
    const code2 = (str) => (str || '').toString().trim().toUpperCase().padEnd(2, '0').slice(0, 2);

    const catCode = code2(category);
    const itemCode = code3(item);
    const varCode = code3(variety);
    const gradeCode = code2(grade || '00');
    const packCode = `${pad(size, 3)}${code2(unit)}`;
    const brandCode = code3(brand);

    const sku = `${catCode}-${itemCode}-${varCode}-${gradeCode}-${packCode}-${brandCode}`;
    const validation = validateSku(sku);
    if (!validation.isValid) {
        throw new Error(`Generated invalid SKU '${sku}': ${validation.error}`);
    }
    return sku;
}

module.exports = {
    SKU_REGEX,
    VALID_CATEGORIES,
    VALID_UNITS,
    validateSku,
    generateSkuCode
};
