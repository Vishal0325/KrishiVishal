/**
 * KrishiVishal Statutory TDS Deduction Engine
 * Conforming to Indian Income Tax Act, 1961 (Sections 194C, 194H, 194Q, 206AA).
 * 
 * Part of CA-Ready Financial Architecture (Sprint 3).
 */

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

/**
 * Validates format of Indian Permanent Account Number (PAN).
 * @param {string} pan
 * @returns {boolean}
 */
function isValidPan(pan) {
    if (!pan || typeof pan !== "string") return false;
    return PAN_REGEX.test(pan.trim().toUpperCase());
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
 * Canonical TDS Section Configurations
 */
const TDS_SECTIONS = {
    // Section 194C: Payment to Contractors, Sub-contractors, Transporters, Delivery Fleets
    SEC_194C: {
        code: "194C",
        name: "Payments to Contractors / Transporters",
        singleInvoiceThreshold: 30000,
        aggregateFyThreshold: 100000,
        rateIndividualHuf: 0.01, // 1.0%
        rateCompanyOthers: 0.02, // 2.0%
        accountCode: "2050_TDS_PAYABLE_194C"
    },
    // Section 194H: Commission or Brokerage (VLE / Kisan Mitra, Field Sales Agents)
    SEC_194H: {
        code: "194H",
        name: "Commission or Brokerage",
        aggregateFyThreshold: 15000,
        rate: 0.05, // 5.0%
        accountCode: "2050_TDS_PAYABLE_194H"
    },
    // Section 194Q: Purchase of Goods (High-Value Procurement > ₹50 Lakhs)
    SEC_194Q: {
        code: "194Q",
        name: "TDS on Purchase of Goods exceeding ₹50L",
        fyThreshold: 5000000,
        rate: 0.001, // 0.1%
        accountCode: "2050_TDS_PAYABLE_194Q"
    },
    // Section 206AA: Higher rate of TDS in case of non-furnishing or invalid PAN
    SEC_206AA: {
        code: "206AA",
        name: "Penalty TDS for Missing/Invalid PAN",
        rate: 0.20 // 20.0%
    }
};

/**
 * Calculates statutory TDS deduction based on section, amount, entity type, and PAN status.
 * 
 * @param {object} param0
 * @param {string} param0.section "194C" | "SEC_194C" | "194H" | "SEC_194H" | "194Q" | "SEC_194Q"
 * @param {number} param0.amount Current invoice/payment gross taxable value
 * @param {string} [param0.entityType] "INDIVIDUAL" | "HUF" | "COMPANY" | "PARTNERSHIP" | "LLP"
 * @param {string} [param0.pan] 10-character PAN string
 * @param {number} [param0.fyCumulativeAmount] Cumulative prior payments to same vendor/person in current FY
 * @returns {object}
 */
function calculateTdsDeduction({
    section,
    amount,
    entityType = "COMPANY",
    pan = null,
    fyCumulativeAmount = 0
}) {
    const grossAmount = roundCurrency(Number(amount || 0));
    if (grossAmount <= 0) {
        return {
            section,
            grossAmount: 0,
            applicableRate: 0,
            tdsAmount: 0,
            netPayable: 0,
            isPanMissingPenalty: false,
            reason: "ZERO_OR_NEGATIVE_AMOUNT"
        };
    }

    const secKey = String(section || "").toUpperCase().replace(/^SEC_/, "");
    const cleanPan = pan ? String(pan).trim().toUpperCase() : null;
    const hasValidPan = isValidPan(cleanPan);

    // Section 206AA Guard: If PAN is missing or invalid, statutory TDS is flat 20.0%
    if (!hasValidPan) {
        const penaltyRate = TDS_SECTIONS.SEC_206AA.rate; // 0.20
        const tdsAmount = roundCurrency(grossAmount * penaltyRate);
        const netPayable = roundCurrency(grossAmount - tdsAmount);

        return {
            section: `SEC_${secKey}`,
            grossAmount,
            applicableRate: penaltyRate,
            tdsAmount,
            netPayable,
            isPanMissingPenalty: true,
            accountCode: secKey === "194H" ? "2050_TDS_PAYABLE_194H" : (secKey === "194Q" ? "2050_TDS_PAYABLE_194Q" : "2050_TDS_PAYABLE_194C"),
            reason: "INVALID_OR_MISSING_PAN_SECTION_206AA"
        };
    }

    const priorTotal = Number(fyCumulativeAmount || 0);
    const newTotal = priorTotal + grossAmount;

    let applicableRate = 0;
    let tdsApplicable = false;
    let accountCode = "2050_TDS_PAYABLE_194C";

    if (secKey === "194C") {
        accountCode = TDS_SECTIONS.SEC_194C.accountCode;
        const isIndividualOrHuf = ["INDIVIDUAL", "HUF"].includes(String(entityType).toUpperCase());
        applicableRate = isIndividualOrHuf ? TDS_SECTIONS.SEC_194C.rateIndividualHuf : TDS_SECTIONS.SEC_194C.rateCompanyOthers;

        // Threshold check: Single invoice > ₹30,000 OR Aggregate in FY > ₹1,00,000
        if (grossAmount > TDS_SECTIONS.SEC_194C.singleInvoiceThreshold || newTotal > TDS_SECTIONS.SEC_194C.aggregateFyThreshold) {
            tdsApplicable = true;
        }
    } else if (secKey === "194H") {
        accountCode = TDS_SECTIONS.SEC_194H.accountCode;
        applicableRate = TDS_SECTIONS.SEC_194H.rate; // 0.05

        // Threshold check: Aggregate in FY > ₹15,000
        if (newTotal > TDS_SECTIONS.SEC_194H.aggregateFyThreshold) {
            tdsApplicable = true;
        }
    } else if (secKey === "194Q") {
        accountCode = TDS_SECTIONS.SEC_194Q.accountCode;
        applicableRate = TDS_SECTIONS.SEC_194Q.rate; // 0.001 (0.1%)

        // Threshold check: Applies to amount exceeding ₹50,00,000 in FY
        const threshold = TDS_SECTIONS.SEC_194Q.fyThreshold;
        if (newTotal > threshold) {
            tdsApplicable = true;
        }
    } else {
        throw new Error(`UNSUPPORTED_TDS_SECTION: Section '${section}' is not supported by statutory engine.`);
    }

    if (!tdsApplicable) {
        return {
            section: `SEC_${secKey}`,
            grossAmount,
            applicableRate: 0,
            tdsAmount: 0,
            netPayable: grossAmount,
            isPanMissingPenalty: false,
            accountCode,
            reason: "BELOW_STATUTORY_THRESHOLD"
        };
    }

    let tdsAmount = 0;
    if (secKey === "194Q") {
        const threshold = TDS_SECTIONS.SEC_194Q.fyThreshold;
        // TDS 194Q is only charged on the portion that exceeds ₹50 Lakhs
        const taxablePortion = Math.min(grossAmount, Math.max(0, newTotal - threshold));
        tdsAmount = roundCurrency(taxablePortion * applicableRate);
    } else {
        tdsAmount = roundCurrency(grossAmount * applicableRate);
    }

    const netPayable = roundCurrency(grossAmount - tdsAmount);

    return {
        section: `SEC_${secKey}`,
        grossAmount,
        applicableRate,
        tdsAmount,
        netPayable,
        isPanMissingPenalty: false,
        accountCode
    };
}

module.exports = {
    PAN_REGEX,
    isValidPan,
    roundCurrency,
    TDS_SECTIONS,
    calculateTdsDeduction
};
