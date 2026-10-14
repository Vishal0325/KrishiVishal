/**
 * KrishiVishal Test Runner Harness
 * Executes each test file in its own isolated Node.js child process.
 * Does not stop on failure; collects exit codes and produces a comprehensive status table.
 * 
 * Usage: node scripts/run_all_tests.js
 * Or:    firebase emulators:exec --only firestore "node scripts/run_all_tests.js"
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FUNCTIONS_ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.resolve(FUNCTIONS_ROOT, 'tests');

// 1. Core test suite from package.json
const PACKAGE_JSON_PATH = path.resolve(FUNCTIONS_ROOT, 'package.json');
let packageJsonTests = [];
try {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    const testScript = pkg.scripts && pkg.scripts.test ? pkg.scripts.test : '';
    packageJsonTests = testScript
        .split('&&')
        .map(s => s.trim())
        .filter(s => s.startsWith('node tests/'))
        .map(s => s.replace(/^node\s+tests\//, ''));
} catch (e) {
    packageJsonTests = [];
}

// 2. All files in tests/ directory
const allFilesInTestsDir = fs.readdirSync(TESTS_DIR)
    .filter(f => f.endsWith('.test.js') || f.endsWith('.js'))
    .sort();

// Deduplicate list: package.json chained tests first in order, followed by other tests in tests/
const testFilesToRun = Array.from(new Set([...packageJsonTests, ...allFilesInTestsDir]));

const isEmulatorActive = !!process.env.FIRESTORE_EMULATOR_HOST;

console.log("================================================================================");
console.log(`KRISHIVISHAL TEST HARNESS: Running ${testFilesToRun.length} test files independently`);
console.log(`Node: ${process.version} | Platform: ${process.platform}`);
console.log(`Firestore Emulator Host: ${process.env.FIRESTORE_EMULATOR_HOST || 'NOT_SET (In-memory/Unit Mode)'}`);
console.log("================================================================================\n");

const results = [];

// Helper to determine if a test requires the Firestore Emulator
function requiresEmulator(fileName) {
    return fileName.startsWith('emulator_') ||
           fileName.startsWith('workflow_') ||
           fileName === 'package1_ledger_pass_through.test.js';
}

for (let i = 0; i < testFilesToRun.length; i++) {
    const fileName = testFilesToRun[i];
    const filePath = path.join(TESTS_DIR, fileName);

    if (!fs.existsSync(filePath)) {
        results.push({
            index: i + 1,
            file: fileName,
            status: 'NOT RUN',
            exitCode: -1,
            duration: 0,
            note: 'File not found on disk'
        });
        continue;
    }

    if (!isEmulatorActive && requiresEmulator(fileName)) {
        results.push({
            index: i + 1,
            file: fileName,
            status: 'NOT RUN',
            exitCode: 0,
            duration: 0,
            note: 'Requires Firestore Emulator (FIRESTORE_EMULATOR_HOST not set)'
        });
        console.log(`${String(i + 1).padStart(2, ' ')}. ⏸️ [NOT RUN] ${fileName.padEnd(42)} (0ms) - Requires Firestore Emulator`);
        continue;
    }

    const startTime = Date.now();
    const env = { ...process.env };

    const child = spawnSync(process.execPath, [filePath], {
        cwd: FUNCTIONS_ROOT,
        env: env,
        timeout: 15000,
        encoding: 'utf8'
    });
    const duration = Date.now() - startTime;

    let status = 'PASS';
    let note = '';

    if (child.error) {
        if (child.error.code === 'ETIMEDOUT') {
            status = 'TIMEOUT';
            note = 'Execution exceeded 15s';
        } else {
            status = 'ERROR';
            note = child.error.message || child.error.code;
        }
    } else if (child.status !== 0) {
        status = 'FAIL';
        // Extract first error line
        const combinedOut = (child.stdout || '') + '\n' + (child.stderr || '');
        const errMatch = combinedOut.match(/AssertionError[^:\n]*:[^\n]*/i) ||
                         combinedOut.match(/Error:[^\n]*/i) ||
                         combinedOut.match(/FAIL:[^\n]*/i);
        if (errMatch) {
            note = errMatch[0].substring(0, 70);
        } else {
            note = `Exit code ${child.status}`;
        }
    }

    results.push({
        index: i + 1,
        file: fileName,
        status: status,
        exitCode: child.status !== null ? child.status : -1,
        duration: duration,
        note: note
    });

    const icon = status === 'PASS' ? '✅' : (status === 'NOT RUN' ? '⏸️' : '❌');
    console.log(`${String(i + 1).padStart(2, ' ')}. ${icon} [${status.padEnd(7)}] ${fileName.padEnd(42)} (${duration}ms) ${note ? '- ' + note : ''}`);
}

console.log("\n================================================================================");
console.log("SUMMARY TABLE");
console.log("================================================================================\n");

console.log("| # | Test File | Status | Exit Code | Duration | Note |");
console.log("|---|---|---|---|---|---|");
for (const r of results) {
    console.log(`| ${r.index} | \`${r.file}\` | ${r.status} | ${r.exitCode} | ${r.duration}ms | ${r.note.replace(/\|/g, '-')} |`);
}

const passedCount = results.filter(r => r.status === 'PASS').length;
const failedCount = results.filter(r => r.status === 'FAIL' || r.status === 'ERROR' || r.status === 'TIMEOUT').length;
const notRunCount = results.filter(r => r.status === 'NOT RUN').length;

console.log(`\nTOTAL: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount} | NOT RUN: ${notRunCount}\n`);

// Write JSON artifact of run for auditing
const outputPath = path.resolve(FUNCTIONS_ROOT, 'test_results_harness.json');
fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    emulatorActive: isEmulatorActive,
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    notRun: notRunCount,
    results: results
}, null, 2));

if (failedCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
