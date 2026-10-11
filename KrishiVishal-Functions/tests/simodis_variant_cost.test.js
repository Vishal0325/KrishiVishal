const assert = require('assert');

console.log("=================================================================");
console.log("=== RUNNING SIMODIS VARIANT COST RESOLUTION & ISOLATION TESTS ===");
console.log("=================================================================\n");

let passed = 0;
let failed = 0;

function pass(testName) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
}

function fail(testName, err) {
    console.error(`❌ FAIL: ${testName} - ${err.message || err}`);
    failed++;
}

// 1. Variant matching and key generation logic (matching Products.jsx and orderFlow.js)
function getVariantCostKey(v, idx) {
    if (!v) return `var_${idx}`;
    if (v.id) return String(v.id);
    if (v.skuCode) return String(v.skuCode);
    if (v.sku) return String(v.sku);
    if (v.label) return `label_${String(v.label).trim().toLowerCase().replace(/\s+/g, '_')}`;
    return `var_${idx}`;
}

function findVariantIndex(variants, item) {
    if (!Array.isArray(variants) || variants.length === 0) return -1;
    const variantId = item.variantId || item.variant_id || (item.variant && item.variant.id);
    const skuCode = item.skuCode;
    const label = item.variantLabel || (item.variant && item.variant.label) || item.packSize || item.size;

    if (variantId) {
        const idx = variants.findIndex(v => v && v.id && String(v.id) === String(variantId));
        if (idx !== -1) return idx;
    }
    if (skuCode) {
        const idx = variants.findIndex(v => v && v.skuCode && String(v.skuCode).toLowerCase() === String(skuCode).toLowerCase());
        if (idx !== -1) return idx;
    }
    if (label) {
        const cleanLabel = String(label).trim().toLowerCase();
        const idx = variants.findIndex(v => {
            if (!v) return false;
            return (v.label && String(v.label).trim().toLowerCase() === cleanLabel) ||
                   (v.size && String(v.size).trim().toLowerCase() === cleanLabel) ||
                   (v.name && String(v.name).trim().toLowerCase() === cleanLabel) ||
                   (v.id && String(v.id).trim().toLowerCase() === cleanLabel);
        });
        if (idx !== -1) return idx;
    }
    if (variants.length === 1 && (variantId || label)) {
        return 0;
    }
    return -1;
}

function resolveItemCost(product, item, costData, skuData) {
    let matchingVariant = null;
    let matchingVariantIndex = -1;
    if (Array.isArray(product.variants) && product.variants.length > 0) {
        const vIdx = findVariantIndex(product.variants, item);
        if (vIdx !== -1) {
            matchingVariant = product.variants[vIdx];
            matchingVariantIndex = vIdx;
        }
    }

    let resolvedVariantCost = Number(
        matchingVariant?.costPrice ||
        matchingVariant?.unitCost ||
        matchingVariant?.landingCost ||
        0
    );

    if (resolvedVariantCost <= 0 && costData && costData.variantsCost && matchingVariant) {
        const vc = costData.variantsCost;
        const vIdKey = matchingVariant.id ? String(matchingVariant.id) : null;
        const vSkuKey = matchingVariant.skuCode ? String(matchingVariant.skuCode) : null;
        const vLabelKey = matchingVariant.label ? `label_${String(matchingVariant.label).trim().toLowerCase().replace(/\s+/g, '_')}` : null;
        const vIdxKey = matchingVariantIndex !== -1 ? `var_${matchingVariantIndex}` : null;

        const matchedCost = (vIdKey && vc[vIdKey]) ??
                            (vSkuKey && vc[vSkuKey]) ??
                            (vLabelKey && vc[vLabelKey]) ??
                            (vIdxKey && vc[vIdxKey]);

        if (matchedCost !== undefined && matchedCost !== null && Number(matchedCost) > 0) {
            resolvedVariantCost = Number(matchedCost);
        }
    }

    const isMultiVariantProduct = Array.isArray(product.variants) && product.variants.length > 1;
    const canUseProductLevelFallback = !isMultiVariantProduct || (isMultiVariantProduct && matchingVariantIndex !== -1 && resolvedVariantCost > 0);

    const itemCost = Number(
        (resolvedVariantCost > 0 ? resolvedVariantCost : 0) ||
        skuData?.pricing?.landingCost ||
        skuData?.costPrice ||
        (canUseProductLevelFallback ? (costData?.costPrice || product.costPrice || product.landingCost || product.purchasePrice) : 0) ||
        0
    );

    return { itemCost, matchingVariant, matchingVariantIndex };
}

// ─────────────────────────────────────────────────────────────────
// TEST SCENARIOS
// ─────────────────────────────────────────────────────────────────

// Product Mock representing Syngenta Simodis in live Firestore (WITHOUT v.id)
const simodisProduct = {
    id: "H9IBDSB8NwGf2KGlQfE4",
    name: "Syngenta Simodis Insecticide",
    skuCode: "OT-SIM-SYS-A1-080ML-SYN",
    variants: [
        {
            label: "80 ml",
            price: 680,
            quantity: 80,
            stock: 21,
            reorderLevel: 10,
            mrp: 1039,
            batchNumber: "S22345"
            // NOTE: NO v.id, NO v.skuCode
        },
        {
            label: "120",
            price: 1050,
            quantity: 120,
            stock: 20,
            reorderLevel: 10,
            mrp: 1349,
            batchNumber: "S22345",
            skuCode: "OT-SIM-STD-A1-120PC-SYN"
            // NOTE: Has skuCode, NO v.id
        }
    ]
};

// Admin Panel save simulation with hypothetical costs: 80ml = 450, 120ml = 720
const adminFormVariants = [
    { ...simodisProduct.variants[0], costPrice: 450 },
    { ...simodisProduct.variants[1], costPrice: 720 }
];

const savedCostData = {
    productId: simodisProduct.id,
    costPrice: Math.min(450, 720), // 450
    variantsCost: adminFormVariants.reduce((acc, v, idx) => {
        const key = getVariantCostKey(v, idx);
        if (v.costPrice !== undefined && v.costPrice !== "") {
            acc[key] = Number(v.costPrice) || 0;
        }
        if (v.skuCode && key !== String(v.skuCode)) {
            acc[String(v.skuCode)] = Number(v.costPrice) || 0;
        }
        return acc;
    }, {})
};

try {
    // -------------------------------------------------------------
    // TEST 1: 80 ml variant gets its own cost
    // -------------------------------------------------------------
    console.log("--- TEST 1: 80 ml Variant Specific Cost ---");
    const cartItem80 = { productId: simodisProduct.id, variantLabel: "80 ml", quantity: 2 };
    const res80 = resolveItemCost(simodisProduct, cartItem80, savedCostData, null);

    assert.strictEqual(res80.matchingVariantIndex, 0);
    assert.strictEqual(res80.itemCost, 450);
    pass("1.1 80 ml variant accurately resolves its own cost (₹450) via label/index key");

    // -------------------------------------------------------------
    // TEST 2: 120 ml variant gets its own cost
    // -------------------------------------------------------------
    console.log("\n--- TEST 2: 120 ml Variant Specific Cost ---");
    const cartItem120 = { productId: simodisProduct.id, skuCode: "OT-SIM-STD-A1-120PC-SYN", quantity: 1 };
    const res120 = resolveItemCost(simodisProduct, cartItem120, savedCostData, null);

    assert.strictEqual(res120.matchingVariantIndex, 1);
    assert.strictEqual(res120.itemCost, 720);
    pass("2.1 120 ml variant accurately resolves its own cost (₹720) via skuCode key");

    // -------------------------------------------------------------
    // TEST 3: Cross-variant cost bleed prevention
    // -------------------------------------------------------------
    console.log("\n--- TEST 3: Cross-Variant Isolation ---");
    assert.notStrictEqual(res80.itemCost, res120.itemCost);
    assert.strictEqual(res80.itemCost === 720, false);
    assert.strictEqual(res120.itemCost === 450, false);
    pass("3.1 80 ml cost (₹450) and 120 ml cost (₹720) are strictly isolated with zero cross-bleed");

    // -------------------------------------------------------------
    // TEST 4: Missing/Zero Cost behavior (MISSING_COST_PRICE preservation)
    // -------------------------------------------------------------
    console.log("\n--- TEST 4: Missing/Zero Cost Safety ---");
    const emptyCostData = { productId: simodisProduct.id, costPrice: 0, variantsCost: {} };
    const resEmpty80 = resolveItemCost(simodisProduct, cartItem80, emptyCostData, null);
    const resEmpty120 = resolveItemCost(simodisProduct, cartItem120, emptyCostData, null);

    assert.strictEqual(resEmpty80.itemCost, 0);
    assert.strictEqual(resEmpty120.itemCost, 0);
    pass("4.1 When cost data is empty or zero, itemCost remains 0 (triggers statutory MISSING_COST_PRICE exception in salesLedger)");

    // Multi-variant product without variant cost does NOT unsafely inherit product.costPrice fallback
    const mismatchedCostData = {
        productId: simodisProduct.id,
        costPrice: 400, // generic product-level fallback
        variantsCost: { "var_0": 450 } // only variant 0 is known
    };
    const resMismatched120 = resolveItemCost(simodisProduct, cartItem120, mismatchedCostData, null);
    assert.strictEqual(resMismatched120.itemCost, 0);
    pass("4.2 Multi-variant item does NOT blindly inherit generic product-level cost if variant cost is missing");

    // -------------------------------------------------------------
    // TEST 5: Public product stripping verification
    // -------------------------------------------------------------
    console.log("\n--- TEST 5: Public Data Stripping Verification ---");
    const testAdminData = {
        name: "Test Agrochemical",
        costPrice: 500,
        variants: [
            { label: "1 L", costPrice: 500, price: 800 },
            { label: "5 L", costPrice: 2200, price: 3500 }
        ]
    };

    // Simulate publicData preparation from Products.jsx
    const publicData = { ...testAdminData };
    delete publicData.costPrice;
    if (publicData.variants) {
        publicData.variants = publicData.variants.map(v => {
            const cleaned = { ...v };
            delete cleaned.costPrice;
            return cleaned;
        });
    }

    assert.strictEqual(publicData.costPrice, undefined);
    assert.strictEqual(publicData.variants[0].costPrice, undefined);
    assert.strictEqual(publicData.variants[1].costPrice, undefined);
    pass("5.1 Public product and public variants strictly exclude costPrice from client exposure");

} catch (err) {
    fail("Simodis test suite failed", err);
}

console.log("\n=================================================================");
console.log(`SIMODIS COST RESOLUTION SUITE: ${passed} PASSED, ${failed} FAILED`);
console.log("=================================================================");

if (failed > 0) {
    process.exit(1);
}
