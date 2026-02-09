/**
 * Determinism & Regression Test Suite
 *
 * Tests that the heuristic analysis pipeline produces identical results
 * across multiple runs of the same input. Also validates that expected
 * findings are detected for known test fixtures.
 *
 * Run: npx tsx server/tests/determinism.test.ts
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { runAnalysis } from "../src/services/analyzer";
import { clearKnowledgeCache } from "../src/lib/knowledge";
import type { AnalysisInput, AnalysisOutput } from "../src/lib/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

// --- Types ---

interface TestFixture {
  name: string;
  description: string;
  input: AnalysisInput;
  expected_heuristic_findings: {
    min_total_findings: number;
    required_rule_ids: string[];
    required_flow_types: string[];
    required_missing_screens: string[];
  };
}

interface TestResult {
  fixture: string;
  passed: boolean;
  errors: string[];
  stabilityScore?: number;
  findings: string[];
}

// --- Test Helpers ---

function loadFixture(filename: string): TestFixture {
  const content = readFileSync(join(FIXTURES_DIR, filename), "utf-8");
  return JSON.parse(content);
}

/**
 * Extract a deterministic fingerprint of all findings from an analysis output.
 * This is used to compare runs for stability.
 */
function fingerprintOutput(output: AnalysisOutput): string {
  const parts: string[] = [];

  // Sort screen findings deterministically
  for (const screen of [...output.screens].sort((a, b) =>
    a.screen_id.localeCompare(b.screen_id)
  )) {
    for (const finding of [...screen.findings].sort((a, b) =>
      a.rule_id.localeCompare(b.rule_id)
    )) {
      parts.push(`${screen.screen_id}|${finding.rule_id}|${finding.severity}`);
    }
  }

  // Sort flow findings
  for (const f of [...output.flow_findings].sort((a, b) =>
    a.rule_id.localeCompare(b.rule_id)
  )) {
    parts.push(`flow|${f.rule_id}|${f.severity}`);
  }

  // Sort missing screen findings
  for (const f of [...output.missing_screen_findings].sort((a, b) =>
    a.id.localeCompare(b.id)
  )) {
    parts.push(`missing|${f.flow_type}|${f.missing_screen.id}|${f.severity}`);
  }

  return parts.join("\n");
}

// --- Test Runner ---

async function runFixtureTest(filename: string): Promise<TestResult> {
  const fixture = loadFixture(filename);
  const errors: string[] = [];

  // Run analysis N times to test determinism
  const N = 5;
  const fingerprints: string[] = [];
  let lastOutput: AnalysisOutput | null = null;

  for (let i = 0; i < N; i++) {
    clearKnowledgeCache(); // Clear cache between runs to test true determinism
    const output = await runAnalysis(fixture.input);
    fingerprints.push(fingerprintOutput(output));
    lastOutput = output;
  }

  if (!lastOutput) {
    return { fixture: fixture.name, passed: false, errors: ["No output"], findings: [] };
  }

  // Check determinism: all runs should produce identical fingerprints
  const uniqueFingerprints = new Set(fingerprints);
  const stabilityScore = 1 - (uniqueFingerprints.size - 1) / N;

  if (uniqueFingerprints.size > 1) {
    errors.push(
      `DETERMINISM FAILED: ${uniqueFingerprints.size} different results across ${N} runs (stability: ${(stabilityScore * 100).toFixed(0)}%)`
    );
  }

  // Check minimum findings
  if (lastOutput.summary.total_findings < fixture.expected_heuristic_findings.min_total_findings) {
    errors.push(
      `Expected at least ${fixture.expected_heuristic_findings.min_total_findings} findings, got ${lastOutput.summary.total_findings}`
    );
  }

  // Check required rule IDs are present
  const allRuleIds = new Set([
    ...lastOutput.screens.flatMap((s) => s.findings.map((f) => f.rule_id)),
    ...lastOutput.flow_findings.map((f) => f.rule_id),
  ]);

  for (const requiredId of fixture.expected_heuristic_findings.required_rule_ids) {
    if (!allRuleIds.has(requiredId)) {
      errors.push(`Missing required rule: ${requiredId}`);
    }
  }

  // Check required flow types
  const detectedFlowTypes = new Set(
    lastOutput.missing_screen_findings.map((f) => f.flow_type)
  );
  for (const requiredFlow of fixture.expected_heuristic_findings.required_flow_types) {
    if (!detectedFlowTypes.has(requiredFlow as any)) {
      errors.push(`Missing required flow type: ${requiredFlow}`);
    }
  }

  // Check required missing screens
  const missingScreenIds = new Set(
    lastOutput.missing_screen_findings.map((f) => f.missing_screen.id)
  );
  for (const requiredScreen of fixture.expected_heuristic_findings.required_missing_screens) {
    if (!missingScreenIds.has(requiredScreen)) {
      errors.push(`Missing required missing screen: ${requiredScreen}`);
    }
  }

  // Collect all findings for the report
  const findings = [
    ...lastOutput.screens.flatMap((s) =>
      s.findings.map((f) => `[${s.name}] ${f.severity}: ${f.title} (${f.rule_id})`)
    ),
    ...lastOutput.flow_findings.map(
      (f) => `[flow] ${f.severity}: ${f.title} (${f.rule_id})`
    ),
    ...lastOutput.missing_screen_findings.map(
      (f) => `[missing] ${f.severity}: ${f.missing_screen.name} (${f.flow_type})`
    ),
  ];

  return {
    fixture: fixture.name,
    passed: errors.length === 0,
    errors,
    stabilityScore,
    findings,
  };
}

// --- Main ---

async function main() {
  console.log("=== Edgy Determinism & Regression Test Suite ===\n");

  const fixtures = ["login-flow.json", "dashboard-flow.json"];
  const results: TestResult[] = [];

  for (const fixture of fixtures) {
    console.log(`Running: ${fixture}...`);
    try {
      const result = await runFixtureTest(fixture);
      results.push(result);

      if (result.passed) {
        console.log(`  PASS: ${result.fixture} (stability: ${((result.stabilityScore ?? 1) * 100).toFixed(0)}%)`);
      } else {
        console.log(`  FAIL: ${result.fixture}`);
        for (const error of result.errors) {
          console.log(`    - ${error}`);
        }
      }

      console.log(`  Findings (${result.findings.length}):`);
      for (const f of result.findings) {
        console.log(`    ${f}`);
      }
      console.log();
    } catch (error) {
      console.error(`  ERROR: ${fixture}:`, error);
      results.push({
        fixture,
        passed: false,
        errors: [String(error)],
        findings: [],
      });
    }
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const avgStability =
    results.reduce((sum, r) => sum + (r.stabilityScore ?? 0), 0) / total;

  console.log("=== Summary ===");
  console.log(`Tests: ${passed}/${total} passed`);
  console.log(`Average stability: ${(avgStability * 100).toFixed(0)}%`);
  console.log();

  if (passed < total) {
    process.exit(1);
  }
}

main().catch(console.error);
