/**
 * Unit and Integration Test for Feature 2: Automated Crop Stage Advisory Engine
 * Validates crop recognition, stage calculation, personalized advisories, and notification generation.
 */

const assert = require("assert");
const {
    calculateCropStage,
    normalizeCropKey,
    generatePersonalizedAdvisory,
    CROP_ADVISORY_KNOWLEDGE_BASE
} = require("../messaging/cropAdvisory");

console.log("=== RUNNING CROP STAGE ADVISORY ENGINE TESTS ===");

// 1. TEST CROP KEY NORMALIZATION
console.log("\n[TEST 1] Crop Name Normalization...");
const normalizationCases = [
    { input: "धान (Paddy)", expected: "DHAN" },
    { input: "paddy", expected: "DHAN" },
    { input: "Rice", expected: "DHAN" },
    { input: "फूलगोभी (Gobhi)", expected: "GOBHI" },
    { input: "Cauliflower", expected: "GOBHI" },
    { input: "कद्दू (Kaddu)", expected: "KADDU" },
    { input: "lauki", expected: "KADDU" },
    { input: "मक्का (Maize)", expected: "MAKKA" },
    { input: "corn", expected: "MAKKA" },
    { input: "आलू (Potato)", expected: "ALOO" },
    { input: "सरसों (Sarson)", expected: "SARSON" },
    { input: "mustard", expected: "SARSON" }
];

normalizationCases.forEach(({ input, expected }) => {
    const key = normalizeCropKey(input);
    assert.strictEqual(key, expected, `Failed normalization for input "${input}". Expected ${expected}, got ${key}`);
});
console.log("✓ All crop normalization test cases PASSED.");

// 2. TEST CROP STAGE CALCULATION & AGRONOMY RULES
console.log("\n[TEST 2] Crop Stage Evaluation (Stages 1, 2, 3)...");

// Simulated date: September (Month index 8)
const evalDateSep = new Date(2026, 8, 15); // September 15

// Case A: Dhan (Paddy) sown in August (1 month elapsed) -> Stage 1 (Vegetative / Khad)
const dhanStage1 = calculateCropStage("धान (Paddy)", "August", evalDateSep);
assert.strictEqual(dhanStage1.stage, 1, `Dhan August sowing should be Stage 1, got ${dhanStage1.stage}`);
assert.ok(dhanStage1.stageInfo.summaryHindi.includes("यूरिया"), "Stage 1 advisory must mention Urea/Khad");
assert.ok(dhanStage1.stageInfo.recommendedProducts.some(p => p.includes("Zinc")), "Stage 1 must recommend Zinc");

// Case B: Dhan sown in July (2 months elapsed) -> Stage 2 (Pest Prevention: BPH / Stem Borer / Teela)
const dhanStage2 = calculateCropStage("धान", "July", evalDateSep);
assert.strictEqual(dhanStage2.stage, 2, `Dhan July sowing should be Stage 2, got ${dhanStage2.stage}`);
assert.ok(dhanStage2.stageInfo.titleHindi.includes("कीट सुरक्षा"), "Stage 2 advisory title must mention Pest Protection");
assert.ok(dhanStage2.stageInfo.recommendedProducts.some(p => p.includes("Chlorantraniliprole") || p.includes("Coragen")), "Stage 2 must recommend insecticide");

// Case C: Dhan sown in May/June (3+ months elapsed) -> Stage 3 (Pre-Harvest / Irrigation Stop)
const dhanStage3 = calculateCropStage("धान (Paddy)", "May", evalDateSep);
assert.strictEqual(dhanStage3.stage, 3, `Dhan May sowing should be Stage 3, got ${dhanStage3.stage}`);
assert.ok(dhanStage3.stageInfo.summaryHindi.includes("पानी") || dhanStage3.stageInfo.summaryHindi.includes("सिंचाई"), "Stage 3 must advise irrigation cessation / pre-harvest care");

// Case D: Aloo (Potato) sown in September (0 month elapsed) -> Stage 1
const alooStage1 = calculateCropStage("आलू (Potato)", "September", evalDateSep);
assert.strictEqual(alooStage1.stage, 1, "Aloo sown in same month should be Stage 1");
assert.ok(alooStage1.stageInfo.recommendedProducts.some(p => p.includes("Potash") || p.includes("MOP")), "Aloo Stage 1 must recommend Potash");

// Case E: Aloo sown in August (1 month elapsed) -> Stage 2 (Late Blight / झुलसा)
const alooStage2 = calculateCropStage("आलू (Potato)", "August", evalDateSep);
assert.strictEqual(alooStage2.stage, 2, "Aloo sown 1 month ago should be Stage 2");
assert.ok(alooStage2.stageInfo.summaryHindi.includes("झुलसा"), "Aloo Stage 2 must address Late Blight / झुलसा");

// Case F: Sarson (Mustard)
const sarsonStage1 = calculateCropStage("सरसों (Sarson)", "September", evalDateSep);
assert.strictEqual(sarsonStage1.stage, 1, "Sarson Stage 1");
assert.ok(sarsonStage1.stageInfo.summaryHindi.includes("सल्फर"), "Sarson Stage 1 must advise Sulphur");

const sarsonStage2 = calculateCropStage("सरसों (Sarson)", "July", evalDateSep);
assert.strictEqual(sarsonStage2.stage, 2, "Sarson Stage 2");
assert.ok(sarsonStage2.stageInfo.summaryHindi.includes("माहू") || sarsonStage2.stageInfo.summaryHindi.includes("चेपा"), "Sarson Stage 2 must advise aphid/chepa/teela control");

console.log("✓ Crop stage calculation & agronomic guidance rules PASSED.");

// 3. TEST PERSONALIZED ADVISORY GENERATION
console.log("\n[TEST 3] Personalization with Farm Name & Farmer Details...");

const mockFarmer = {
    name: "रामेश्वर प्रसाद",
    farmName: "राधे श्याम ऑर्गेनिक फार्म",
    fcmToken: "sample_fcm_token_123"
};

const mockCrop = {
    id: "crop_dhan_01",
    cropName: "धान (Paddy)",
    allocatedArea: 10,
    unit: "Katha",
    sowingMonth: "July"
};

const advisory = generatePersonalizedAdvisory(mockFarmer, mockCrop, dhanStage2);
assert.strictEqual(advisory.stage, 2);
assert.strictEqual(advisory.farmerName, "रामेश्वर प्रसाद");
assert.strictEqual(advisory.farmName, "राधे श्याम ऑर्गेनिक फार्म");
assert.ok(advisory.body.includes("रामेश्वर प्रसाद"), "Body must contain farmer name");
assert.ok(advisory.body.includes("राधे श्याम ऑर्गेनिक फार्म"), "Body must contain personalized farm name");
assert.ok(advisory.body.includes("10 Katha"), "Body must include crop allocated area");
assert.ok(advisory.recommendedProducts.length > 0, "Must contain product recommendations");

console.log("✓ Personalized advisory payload generation PASSED.");

// 4. TEST DEFAULT FARM NAME FALLBACK
console.log("\n[TEST 4] Farm Name Fallback...");
const mockFarmerWithoutFarmName = {
    name: "सुरेश यादव"
};
const fallbackAdvisory = generatePersonalizedAdvisory(mockFarmerWithoutFarmName, mockCrop, dhanStage1);
assert.ok(fallbackAdvisory.farmName.includes("सुरेश यादव का खेत"), "Fallback farm name should use farmer name");
console.log("✓ Fallback farm name generation PASSED.");

console.log("\n==========================================");
console.log("ALL FEATURE 2 ADVISORY ENGINE TESTS PASSED!");
console.log("==========================================");
