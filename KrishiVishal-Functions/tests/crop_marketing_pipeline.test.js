/**
 * Unit & Integration Tests: Crop Marketing & Agronomy Pipeline
 * Tests land unit normalization, days elapsed calculation, crop stage determination,
 * and CRM farmer query filtering.
 */

const assert = require("assert");
const {
  normalizeToAcres,
  calculateDaysElapsed,
  formatLandWithAcres
} = require("../agronomy/landUnitConverter");

const {
  getCropStageAndAction,
  evaluateFarmerCropAllocation,
  requireCrmOrAdminRole
} = require("../marketing/cropCycleMarketingEngine");

console.log("=== RUNNING CROP MARKETING & AGRONOMY PIPELINE TESTS ===");

// ---------------------------------------------------------------------------
// TEST 1: Land Unit Normalization (normalizeToAcres & formatLandWithAcres)
// ---------------------------------------------------------------------------
console.log("\n[TEST 1] Land Unit Normalization to Standard Acres...");

// 1.1 Katha conversions (1 Acre = 32 Katha, formula = value * 0.03125)
assert.strictEqual(normalizeToAcres(32, "Katha"), 1.0, "32 Katha must equal 1.0 Acre");
assert.strictEqual(normalizeToAcres(16, "Katha"), 0.5, "16 Katha must equal 0.5 Acre");
assert.strictEqual(normalizeToAcres(10, "kattha"), 0.3125, "10 kattha case-insensitive must equal 0.3125 Acre");

// 1.2 Bigha conversions (1 Bigha = 20 Katha = 0.625 Acre)
assert.strictEqual(normalizeToAcres(1, "Bigha"), 0.625, "1 Bigha must equal 0.625 Acre");
assert.strictEqual(normalizeToAcres(2, "bigha"), 1.25, "2 Bigha must equal 1.25 Acre");

// 1.3 Decimal / Dismil conversions (100 Decimal = 1 Acre)
assert.strictEqual(normalizeToAcres(100, "Decimal"), 1.0, "100 Decimal must equal 1.0 Acre");
assert.strictEqual(normalizeToAcres(50, "dismil"), 0.5, "50 Dismil must equal 0.5 Acre");

// 1.4 Direct Acre conversions
assert.strictEqual(normalizeToAcres(2.5, "Acre"), 2.5, "2.5 Acre must equal 2.5 Acre");

// 1.5 Edge cases & invalid inputs
assert.strictEqual(normalizeToAcres(0, "Katha"), 0.0, "0 Katha must return 0.0");
assert.strictEqual(normalizeToAcres(-5, "Bigha"), 0.0, "Negative values must return 0.0");
assert.strictEqual(normalizeToAcres("abc", "Acre"), 0.0, "Non-numeric input must return 0.0");

// 1.6 formatLandWithAcres
const formattedLand = formatLandWithAcres(15, "Katha");
assert.strictEqual(formattedLand, "15 Katha (~0.4688 Acre)", "Formatted string must include unit and acres");

console.log("✓ Land unit normalization tests PASSED.");

// ---------------------------------------------------------------------------
// TEST 2: Exact Days Elapsed Calculation (calculateDaysElapsed)
// ---------------------------------------------------------------------------
console.log("\n[TEST 2] Days Elapsed Calculation...");

const referenceNow = 1727884800000; // Fixed reference timestamp
const DAY_MS = 24 * 60 * 60 * 1000;

// 2.1 Exactly 32 days ago
const sowing32DaysAgo = referenceNow - (32 * DAY_MS);
assert.strictEqual(calculateDaysElapsed(sowing32DaysAgo, referenceNow), 32, "Must calculate 32 full days elapsed");

// 2.2 Exactly 10 days ago
const sowing10DaysAgo = referenceNow - (10 * DAY_MS);
assert.strictEqual(calculateDaysElapsed(sowing10DaysAgo, referenceNow), 10, "Must calculate 10 full days elapsed");

// 2.3 Today (0 days elapsed)
assert.strictEqual(calculateDaysElapsed(referenceNow, referenceNow), 0, "Same day sowing must return 0 days");

// 2.4 Future date clamping (sowing tomorrow should clamp to 0)
const futureDate = referenceNow + (5 * DAY_MS);
assert.strictEqual(calculateDaysElapsed(futureDate, referenceNow), 0, "Future date must clamp to 0 days");

// 2.5 Null, undefined, empty inputs
assert.strictEqual(calculateDaysElapsed(null, referenceNow), 0, "Null sowing date must return 0");
assert.strictEqual(calculateDaysElapsed(undefined, referenceNow), 0, "Undefined sowing date must return 0");
assert.strictEqual(calculateDaysElapsed("invalid_date", referenceNow), 0, "Invalid string must return 0");

console.log("✓ Days elapsed calculation tests PASSED.");

// ---------------------------------------------------------------------------
// TEST 3: Crop Stage & Agronomy Pitch Determination
// ---------------------------------------------------------------------------
console.log("\n[TEST 3] Crop Stage & Recommended Agronomy Action Logic...");

// 3.1 Dhan (Paddy) stages
const dhanEarly = getCropStageAndAction("धान (Paddy)", 15);
assert.strictEqual(dhanEarly.currentStage, "EARLY_VEGETATIVE_WEED", "Dhan at 15 days must be EARLY_VEGETATIVE_WEED");
assert.ok(dhanEarly.recommendedAction.includes("weed") || dhanEarly.recommendedAction.includes("Pretilachlor"), "Dhan early stage must advise weed control");

const dhanTillering = getCropStageAndAction("धान (Paddy)", 32);
assert.strictEqual(dhanTillering.currentStage, "VEGETATIVE_TILLERING", "Dhan at 32 days must be VEGETATIVE_TILLERING");
assert.ok(dhanTillering.recommendedAction.includes("Urea"), "Dhan tillering stage must advise Urea top-dressing");
assert.ok(dhanTillering.recommendedAction.includes("stem borer"), "Dhan tillering stage must advise stem borer defense");

const dhanFlowering = getCropStageAndAction("धान (Paddy)", 60);
assert.strictEqual(dhanFlowering.currentStage, "FLOWERING_PANICLE", "Dhan at 60 days must be FLOWERING_PANICLE");

// 3.2 Makka (Maize) stages
const makkaKneeHigh = getCropStageAndAction("मक्का (Maize)", 30);
assert.strictEqual(makkaKneeHigh.currentStage, "VEGETATIVE_KNEE_HIGH", "Makka at 30 days must be VEGETATIVE_KNEE_HIGH");
assert.ok(makkaKneeHigh.recommendedAction.includes("FAW") || makkaKneeHigh.recommendedAction.includes("Emamectin"), "Makka knee-high stage must advise FAW defense");

console.log("✓ Crop stage & agronomy pitch tests PASSED.");

// ---------------------------------------------------------------------------
// TEST 4: evaluateFarmerCropAllocation (Query & Filter Pipeline)
// ---------------------------------------------------------------------------
console.log("\n[TEST 4] Farmer Crop Lifecycle Filtering Pipeline...");

const mockFarmer1 = {
  uid: "farmer_sam_01",
  name: "Ramesh Kumar",
  phone: "9876543210",
  village: "Ujiarpur",
  hubId: "hub_central_samastipur",
  totalLand: 15,
  landUnit: "Katha",
  cropAllocations: [
    {
      id: "crop_01",
      cropName: "धान (Paddy)",
      allocatedArea: 10,
      unit: "Katha",
      sowingDate: referenceNow - (32 * DAY_MS),
      plotName: "खेत 1 (उत्तर दिशा)",
      status: "GROWING"
    },
    {
      id: "crop_02",
      cropName: "मक्का (Maize)",
      allocatedArea: 5,
      unit: "Katha",
      sowingDate: referenceNow - (12 * DAY_MS),
      plotName: "खेत 2 (पोखर के पास)",
      status: "GROWING"
    }
  ]
};

// 4.1 Filter by Dhan in 21-45 days window
const matchDhanTillering = evaluateFarmerCropAllocation(mockFarmer1, "farmer_sam_01", {
  cropName: "धान",
  minDays: 21,
  maxDays: 45,
  nowReference: referenceNow
});

assert.ok(matchDhanTillering !== null, "Farmer 1 must match Dhan in 21-45 days window");
assert.strictEqual(matchDhanTillering.farmerId, "farmer_sam_01");
assert.strictEqual(matchDhanTillering.name, "Ramesh Kumar");
assert.strictEqual(matchDhanTillering.matchedCrop.cropName, "धान (Paddy)");
assert.strictEqual(matchDhanTillering.matchedCrop.daysElapsed, 32);
assert.strictEqual(matchDhanTillering.matchedCrop.currentStage, "VEGETATIVE_TILLERING");
assert.strictEqual(matchDhanTillering.matchedCrop.plotName, "खेत 1 (उत्तर दिशा)");

// 4.2 Filter by Makka in 1-20 days window
const matchMakkaEarly = evaluateFarmerCropAllocation(mockFarmer1, "farmer_sam_01", {
  cropName: "मक्का",
  minDays: 1,
  maxDays: 20,
  nowReference: referenceNow
});

assert.ok(matchMakkaEarly !== null, "Farmer 1 must match Makka in 1-20 days window");
assert.strictEqual(matchMakkaEarly.matchedCrop.cropName, "मक्का (Maize)");
assert.strictEqual(matchMakkaEarly.matchedCrop.daysElapsed, 12);
assert.strictEqual(matchMakkaEarly.matchedCrop.currentStage, "SEEDLING_EMERGENCE");

// 4.3 Filter mismatch: Crop does not exist on farmer
const noWheatMatch = evaluateFarmerCropAllocation(mockFarmer1, "farmer_sam_01", {
  cropName: "गेहूं",
  minDays: 0,
  maxDays: 100,
  nowReference: referenceNow
});
assert.strictEqual(noWheatMatch, null, "Must return null when farmer has no matching crop");

// 4.4 Filter mismatch: Hub does not match
const hubMismatch = evaluateFarmerCropAllocation(mockFarmer1, "farmer_sam_01", {
  hubId: "hub_other_patna",
  nowReference: referenceNow
});
assert.strictEqual(hubMismatch, null, "Must return null when hubId does not match");

// 4.5 Filter mismatch: Days range out of bounds
const outOfRange = evaluateFarmerCropAllocation(mockFarmer1, "farmer_sam_01", {
  cropName: "धान",
  minDays: 50,
  maxDays: 90,
  nowReference: referenceNow
});
assert.strictEqual(outOfRange, null, "Must return null when crop days are outside requested window");

console.log("✓ Farmer crop allocation evaluation tests PASSED.");

// ---------------------------------------------------------------------------
// TEST 5: Role Guard & Security Checks
// ---------------------------------------------------------------------------
console.log("\n[TEST 5] Role Guarding & Permissions...");

// 5.1 Unauthenticated caller throws
assert.throws(() => {
  requireCrmOrAdminRole(null);
}, (err) => err.code === 'unauthenticated', "Unauthenticated caller must throw unauthenticated HttpsError");

// 5.2 Unauthorized role throws
assert.throws(() => {
  requireCrmOrAdminRole({ uid: "user_123", token: { role: "farmer" } });
}, (err) => err.code === 'permission-denied', "Regular farmer must be denied access to telecalling stage CRM");

// 5.3 Authorized roles pass
assert.doesNotThrow(() => {
  requireCrmOrAdminRole({ uid: "tc_01", token: { role: "telecaller" } });
}, "Telecaller role must be authorized");

assert.doesNotThrow(() => {
  requireCrmOrAdminRole({ uid: "admin_01", token: { admin: true } });
}, "Admin token must be authorized");

assert.doesNotThrow(() => {
  requireCrmOrAdminRole({ uid: "hub_mgr_01", token: { role: "hubmanager" } });
}, "Hub manager role must be authorized");

console.log("✓ Role guard & security checks PASSED.");

console.log("\n========================================================");
console.log("  ALL CROP MARKETING & AGRONOMY PIPELINE TESTS PASSED!");
console.log("========================================================\n");
