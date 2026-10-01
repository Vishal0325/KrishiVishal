/**
 * Unit Test Suite for Voice Search AI Intent Extraction
 * KrishiVishal-Functions
 */

const assert = require('assert');
const { extractVoiceIntent, extractWithRuleEngine } = require('../search/voiceIntentService');

console.log("=== RUNNING VOICE SEARCH AI INTENT EXTRACTION TEST SUITE ===\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`FAIL: ${name} - ${err.message || err}`);
    failed++;
}

async function runTests() {
    // ----------------------------------------------------
    // Scenario 1: Pest Query Extraction
    // ----------------------------------------------------
    try {
        const query = "makka me kida lag gaya dawa batao";
        const result = await extractVoiceIntent(query);

        assert.strictEqual(result.crop, "Maize", "Expected crop to be Maize");
        assert.strictEqual(result.problem, "pest", "Expected problem to be pest");
        assert.strictEqual(result.category, "Insecticide", "Expected category to be Insecticide");

        const requiredKeywords = ["maize", "makka", "kida", "insecticide"];
        for (const kw of requiredKeywords) {
            assert.ok(
                result.keywords.includes(kw),
                `Expected keywords to contain '${kw}'. Found: ${JSON.stringify(result.keywords)}`
            );
        }
        assert.ok(result.confidence >= 0.7, `Expected confidence >= 0.7, got ${result.confidence}`);

        pass("Scenario 1: Pest query ('makka me kida lag gaya dawa batao') correctly parsed");
    } catch (err) {
        fail("Scenario 1: Pest query failed", err);
    }

    // ----------------------------------------------------
    // Scenario 2: Weed Query Extraction
    // ----------------------------------------------------
    try {
        const query = "gehu me kharpatwar nashak";
        const result = await extractVoiceIntent(query);

        assert.strictEqual(result.crop, "Wheat", "Expected crop to be Wheat");
        assert.strictEqual(result.category, "Herbicide", "Expected category to be Herbicide");
        assert.strictEqual(result.problem, "weed", "Expected problem to be weed");
        assert.ok(result.keywords.includes("wheat") || result.keywords.includes("gehu"), "Expected crop keyword");
        assert.ok(result.keywords.includes("herbicide") || result.keywords.includes("kharpatwar"), "Expected herbicide/kharpatwar keyword");

        pass("Scenario 2: Weed query ('gehu me kharpatwar nashak') correctly parsed");
    } catch (err) {
        fail("Scenario 2: Weed query failed", err);
    }

    // ----------------------------------------------------
    // Scenario 3: Fungus / Disease Query Extraction
    // ----------------------------------------------------
    try {
        const query = "tamatar me jhulsa bimari";
        const result = await extractVoiceIntent(query);

        assert.strictEqual(result.crop, "Tomato", "Expected crop to be Tomato");
        assert.strictEqual(result.category, "Fungicide", "Expected category to be Fungicide");
        assert.strictEqual(result.problem, "fungus", "Expected problem to be fungus");
        assert.ok(result.keywords.includes("tamatar") || result.keywords.includes("tomato"), "Expected tomato keyword");
        assert.ok(result.keywords.includes("fungicide") || result.keywords.includes("jhulsa"), "Expected fungicide keyword");

        pass("Scenario 3: Fungus query ('tamatar me jhulsa bimari') correctly parsed");
    } catch (err) {
        fail("Scenario 3: Fungus query failed", err);
    }

    // ----------------------------------------------------
    // Scenario 4: Empty and Unknown Queries Handling
    // ----------------------------------------------------
    try {
        const emptyResult = await extractVoiceIntent("");
        assert.strictEqual(emptyResult.crop, null);
        assert.strictEqual(emptyResult.problem, null);
        assert.strictEqual(emptyResult.category, null);
        assert.deepStrictEqual(emptyResult.keywords, []);
        assert.strictEqual(emptyResult.confidence, 0.0);

        const nullResult = await extractVoiceIntent(null);
        assert.strictEqual(nullResult.crop, null);
        assert.deepStrictEqual(nullResult.keywords, []);

        const unknownResult = await extractVoiceIntent("namaste bhai ji kaise ho");
        assert.strictEqual(unknownResult.crop, null);
        assert.strictEqual(unknownResult.category, null);
        assert.ok(unknownResult.confidence <= 0.4, "Confidence for unknown non-agri query should be <= 0.4");

        pass("Scenario 4: Gracefully handles empty, null, and unknown non-agricultural queries");
    } catch (err) {
        fail("Scenario 4: Empty and unknown query handling failed", err);
    }

    // ----------------------------------------------------
    // Scenario 5: Fallback Engine Resilience (when Gemini API is unconfigured)
    // ----------------------------------------------------
    try {
        const origKey = process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_API_KEY;

        const fallbackResult = await extractVoiceIntent("dhaan me mahu laga hai");
        assert.strictEqual(fallbackResult.source, "rule_engine", "Expected source to be rule_engine");
        assert.strictEqual(fallbackResult.crop, "Paddy", "Expected crop to be Paddy");
        assert.strictEqual(fallbackResult.category, "Insecticide", "Expected category to be Insecticide");
        assert.strictEqual(fallbackResult.problem, "pest", "Expected problem to be pest");

        // Test direct rule-engine call
        const directResult = extractWithRuleEngine("sarso me khad konsa dale");
        assert.strictEqual(directResult.crop, "Mustard", "Expected crop to be Mustard");
        assert.strictEqual(directResult.category, "Fertilizer", "Expected category to be Fertilizer");
        assert.strictEqual(directResult.problem, "nutrition", "Expected problem to be nutrition");

        if (origKey) process.env.GEMINI_API_KEY = origKey;

        pass("Scenario 5: Fallback rule-engine operates reliably without Gemini API key");
    } catch (err) {
        fail("Scenario 5: Fallback engine resilience failed", err);
    }

    // ----------------------------------------------------
    // Scenario 6: Additional Regional Crop & Category Variants
    // ----------------------------------------------------
    try {
        const potatoTest = await extractVoiceIntent("aalu me galan rog");
        assert.strictEqual(potatoTest.crop, "Potato");
        assert.strictEqual(potatoTest.category, "Fungicide");

        const tonicTest = await extractVoiceIntent("mirchi me badhwar ke liye tonic");
        assert.strictEqual(tonicTest.crop, "Chilli");
        assert.strictEqual(tonicTest.category, "Growth Promoter");

        const seedTest = await extractVoiceIntent("makka ka beej chahiye");
        assert.strictEqual(seedTest.crop, "Maize");
        assert.strictEqual(seedTest.category, "Seeds");

        pass("Scenario 6: Regional crop aliases and diverse category mappings succeed");
    } catch (err) {
        fail("Scenario 6: Regional crop variants failed", err);
    }

    // ----------------------------------------------------
    // Summary
    // ----------------------------------------------------
    console.log(`\n========================================`);
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
