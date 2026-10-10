/**
 * KrishiVishal Dynamic GST & HSN Tax Engine
 * Conforming to CGST / SGST / IGST Act, 2017 & Indian Agri-Input Tax Schedules.
 * 
 * Part of CA-Ready Financial Architecture (Sprint 2).
 */

const ORIGIN_STATE = "bihar";
const ORIGIN_STATE_CODE = "10";

// Canonical Agricultural HSN Code Tax Slabs
const HSN_TAX_SLABS = {
    // FERTILIZERS: 5% GST (CGST 2.5% + SGST 2.5% or IGST 5%)
    "3101": { rate: 0.05, category: "FERTILIZERS", description: "Animal or vegetable fertilizers" },
    "3102": { rate: 0.05, category: "FERTILIZERS", description: "Mineral or chemical fertilizers, nitrogenous" },
    "3103": { rate: 0.05, category: "FERTILIZERS", description: "Mineral or chemical fertilizers, phosphatic" },
    "3104": { rate: 0.05, category: "FERTILIZERS", description: "Mineral or chemical fertilizers, potassic" },
    "3105": { rate: 0.05, category: "FERTILIZERS", description: "Mineral or chemical fertilizers, NPK/DAP" },

    // PESTICIDES, INSECTICIDES, FUNGICIDES, HERBICIDES: 18% GST (CGST 9% + SGST 9% or IGST 18%)
    "3808": { rate: 0.18, category: "PESTICIDES_FUNGICIDES", description: "Insecticides, rodenticides, fungicides, herbicides" },

    // SEEDS: 0% GST (Exempt from GST under Notification No. 2/2017-Central Tax (Rate))
    "1209": { rate: 0.00, category: "SEEDS", description: "Seeds, fruit and spores, of a kind used for sowing" },

    // AGRICULTURAL HAND TOOLS: 0% GST (Exempt under Notification No. 2/2017-Central Tax (Rate), Entry 113)
    "8201": { rate: 0.00, category: "FARM_TOOLS", description: "Agricultural hand tools, spades, shovels, sickles, khurpi, kodali, mattocks, picks, hoes" }
};

const INDIAN_STATE_CODES = {
  "01": "jammu and kashmir", "02": "himachal pradesh",
  "03": "punjab", "04": "chandigarh", "05": "uttarakhand",
  "06": "haryana", "07": "delhi", "08": "rajasthan",
  "09": "uttar pradesh", "10": "bihar", "11": "sikkim",
  "12": "arunachal pradesh", "13": "nagaland", "14": "manipur",
  "15": "mizoram", "16": "tripura", "17": "meghalaya",
  "18": "assam", "19": "west bengal", "20": "jharkhand",
  "21": "odisha", "22": "chhattisgarh", "23": "madhya pradesh",
  "24": "gujarat", "25": "daman and diu", "26": "dadra and nagar haveli",
  "27": "maharashtra", "28": "andhra pradesh", "29": "karnataka",
  "30": "goa", "31": "lakshadweep", "32": "kerala",
  "33": "tamil nadu", "34": "puducherry", "35": "andaman and nicobar",
  "36": "telangana", "37": "andhra pradesh new", "38": "ladakh"
};

/**
 * Normalizes state name to check for intra-state vs inter-state supply.
 * @param {string} stateName 
 * @returns {boolean} true if Bihar (Intra-State)
 */
function isIntraStateSupply(stateName) {
    if (!stateName || typeof stateName !== "string") return true; // Default fallback to Intra-state
    let normalized = stateName.trim().toLowerCase();
    
    // Find if it's a valid state name or code
    let isValid = false;
    if (INDIAN_STATE_CODES[normalized]) {
        isValid = true;
    } else {
        // Remove state code prefix if present, e.g., "10 (bihar)" -> "bihar"
        const nameMatch = Object.values(INDIAN_STATE_CODES).find(name => normalized.includes(name));
        if (nameMatch) {
            normalized = nameMatch;
            isValid = true;
        }
    }

    if (!isValid) {
        const error = new Error(`INVALID_STATE_CODE: Unrecognized destination state '${stateName}'`);
        error.code = 'INVALID_STATE_CODE';
        throw error;
    }

    return normalized === "10" || normalized === "bihar" || normalized === "10 (bihar)";
}

/**
 * Resolves GST tax rate for a given HSN code or category fallback.
 * @param {string} hsnCode 
 * @param {string} [category]
 * @returns {{ rate: number, category: string, hsn: string }}
 */
function resolveHsnRate(hsnCode, category = null) {
    if (hsnCode) {
        const cleanHsn = String(hsnCode).trim().slice(0, 4);
        if (HSN_TAX_SLABS[cleanHsn]) {
            return {
                rate: HSN_TAX_SLABS[cleanHsn].rate,
                category: HSN_TAX_SLABS[cleanHsn].category,
                hsn: String(hsnCode)
            };
        }
    }

    if (category) {
        const catKey = String(category).toUpperCase();
        if (catKey.includes("SEED")) return { rate: 0.00, category: "SEEDS", hsn: "1209" };
        if (catKey.includes("FERT")) return { rate: 0.05, category: "FERTILIZERS", hsn: "3105" };
        if (catKey.includes("PEST") || catKey.includes("FUNG") || catKey.includes("CHEM") || catKey.includes("HERB")) {
            return { rate: 0.18, category: "PESTICIDES_FUNGICIDES", hsn: "3808" };
        }
        if (catKey.includes("TOOL") || catKey.includes("EQUIP")) {
            return { rate: 0.00, category: "FARM_TOOLS", hsn: "8201" };
        }
    }

    throw new Error(
        `GST_RULE_46_VIOLATION: Unknown HSN "${hsnCode}" and category "${category}". ` +
        `Add to HSN_TAX_SLABS in gstEngine.js before processing this product.`
    );
}

/**
 * Rounds monetary amounts cleanly to 2 decimal places with half-up rounding.
 * @param {number} num 
 * @returns {number}
 */
function roundCurrency(num) {
    return Math.round((Number(num || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates dynamic GST breakdown for an order.
 * 
 * @param {object} param0
 * @param {string} param0.shippingState e.g. "Bihar", "Uttar Pradesh", "Jharkhand"
 * @param {Array<object>} param0.items List of items: { taxablePrice, unitPrice, quantity, hsn, category }
 * @returns {object} Tax breakdown object
 */
function calculateTaxForOrder({ shippingState = "Bihar", items = [] }) {
    if (!Array.isArray(items)) {
        throw new Error("INVALID_ITEMS: items must be an array");
    }

    const isIntraState = isIntraStateSupply(shippingState);

    let totalTaxableAmount = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const itemBreakdown = items.map((item, index) => {
        const qty = Number(item.quantity || 1);
        const unitTaxable = Number(item.taxablePrice !== undefined ? item.taxablePrice : (item.unitPrice || item.price || 0));
        const lineTaxable = roundCurrency(unitTaxable * qty);

        const taxConfig = resolveHsnRate(item.hsn || item.hsnCode, item.category);
        const rate = taxConfig.rate;

        let cgstRate = 0;
        let sgstRate = 0;
        let igstRate = 0;
        let cgstAmount = 0;
        let sgstAmount = 0;
        let igstAmount = 0;

        if (rate > 0) {
            if (isIntraState) {
                cgstRate = rate / 2;
                sgstRate = rate / 2;
                cgstAmount = roundCurrency(lineTaxable * cgstRate);
                sgstAmount = roundCurrency(lineTaxable * sgstRate);
            } else {
                igstRate = rate;
                igstAmount = roundCurrency(lineTaxable * igstRate);
            }
        }

        const lineTax = roundCurrency(cgstAmount + sgstAmount + igstAmount);
        const lineTotal = roundCurrency(lineTaxable + lineTax);

        totalTaxableAmount += lineTaxable;
        totalCgst += cgstAmount;
        totalSgst += sgstAmount;
        totalIgst += igstAmount;

        return {
            itemIndex: index,
            skuId: item.skuId || item.id || null,
            name: item.name || item.title || "",
            hsn: taxConfig.hsn,
            category: taxConfig.category,
            taxRate: rate,
            taxableAmount: lineTaxable,
            cgstRate,
            cgstAmount,
            sgstRate,
            sgstAmount,
            igstRate,
            igstAmount,
            lineTax,
            lineTotal
        };
    });

    const roundedTaxable = roundCurrency(totalTaxableAmount);
    const roundedCgst = roundCurrency(totalCgst);
    const roundedSgst = roundCurrency(totalSgst);
    const roundedIgst = roundCurrency(totalIgst);
    const totalTax = roundCurrency(roundedCgst + roundedSgst + roundedIgst);
    const grandTotal = roundCurrency(roundedTaxable + totalTax);

    return {
        supplyType: isIntraState ? "INTRA_STATE" : "INTER_STATE",
        originState: "Bihar",
        originStateCode: ORIGIN_STATE_CODE,
        shippingState: shippingState || "Bihar",
        taxableAmount: roundedTaxable,
        cgstAmount: roundedCgst,
        sgstAmount: roundedSgst,
        igstAmount: roundedIgst,
        totalTax: totalTax,
        grandTotal: grandTotal,
        items: itemBreakdown
    };
}

module.exports = {
    ORIGIN_STATE,
    ORIGIN_STATE_CODE,
    HSN_TAX_SLABS,
    isIntraStateSupply,
    resolveHsnRate,
    roundCurrency,
    calculateTaxForOrder
};
