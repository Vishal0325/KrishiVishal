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

/**
 * Normalizes state name to check for intra-state vs inter-state supply.
 * @param {string} stateName 
 * @returns {boolean} true if Bihar (Intra-State)
 */
function isIntraStateSupply(stateName) {
    if (!stateName || typeof stateName !== "string") return true; // Default fallback to Intra-state
    const normalized = stateName.trim().toLowerCase();
    return normalized === ORIGIN_STATE || normalized === "10" || normalized === "10 (bihar)";
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

    // Default standard rate for unspecified agricultural merchandise (18%)
    return { rate: 0.18, category: "STANDARD_AGRI", hsn: hsnCode || "3808" };
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
