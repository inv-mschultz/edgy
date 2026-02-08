/**
 * Edgy Analysis Engine — Entry Point
 *
 * Reads input.json from stdin or file argument, runs the rule-based
 * analysis pipeline, and outputs results as JSON.
 *
 * Usage:
 *   tsx src/index.ts < input.json > output.json
 *   tsx src/index.ts path/to/input.json path/to/output.json
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { detectPatterns } from "./pattern-detector.js";
import { loadRules, matchRules } from "./rule-engine.js";
import { checkExpectations } from "./expect-checker.js";
import { generateFindings, generateFlowFindings } from "./finding-generator.js";
import { mapComponents } from "./component-mapper.js";
import { groupScreensByFlow, getFlowSiblings } from "./flow-grouper.js";
import type { AnalysisInput, AnalysisOutput, ScreenResult } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = resolve(__dirname, "../../knowledge");

async function main() {
  // Read input
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  let inputJson: string;
  if (inputPath) {
    inputJson = readFileSync(inputPath, "utf-8");
  } else {
    // Read from stdin
    inputJson = readFileSync(0, "utf-8");
  }

  const input: AnalysisInput = JSON.parse(inputJson);
  console.error(`[edgy] Analyzing ${input.screens.length} screens...`);

  // Load rules
  const rules = await loadRules(KNOWLEDGE_DIR);
  console.error(`[edgy] Loaded ${rules.length} rules across ${new Set(rules.map(r => r.category)).size} categories`);

  // Group screens by flow (shared name prefix)
  const flowGroups = groupScreensByFlow(input.screens);
  console.error(`[edgy] Detected ${flowGroups.size} flow group(s): ${[...flowGroups.keys()].join(", ")}`);

  // Analyze each screen
  const screenResults: ScreenResult[] = [];

  for (const screen of input.screens) {
    console.error(`[edgy] Analyzing: ${screen.name}`);

    // Step 1: Detect UI patterns in the node tree
    const patterns = detectPatterns(screen.node_tree);
    console.error(`[edgy]   Found ${patterns.length} UI patterns`);

    // Step 2: Match rules against detected patterns
    const triggeredRules = matchRules(patterns, rules);
    console.error(`[edgy]   ${triggeredRules.length} rules triggered`);

    // Step 3: Check expectations (with flow-aware 3-tier checking)
    const flowSiblings = getFlowSiblings(screen, flowGroups);
    const flowGroupTrees = flowSiblings.map((s) => s.node_tree);
    const unmetExpectations = checkExpectations(
      triggeredRules,
      screen.node_tree,
      input.screens.map((s) => s.node_tree),
      flowGroupTrees
    );
    console.error(`[edgy]   ${unmetExpectations.length} unmet expectations`);

    // Step 4: Generate findings
    const findings = generateFindings(unmetExpectations, screen);

    // Step 5: Map to component recommendations
    const findingsWithComponents = mapComponents(findings, KNOWLEDGE_DIR);

    screenResults.push({
      screen_id: screen.screen_id,
      name: screen.name,
      findings: findingsWithComponents,
    });
  }

  // Deduplicate findings within each flow group
  deduplicateFindings(screenResults, flowGroups);

  // Generate flow-level findings
  const flowFindings = generateFlowFindings(input.screens, rules, KNOWLEDGE_DIR);

  // Build output
  const totalFindings = screenResults.reduce((sum, s) => sum + s.findings.length, 0) + flowFindings.length;
  const output: AnalysisOutput = {
    analysis_id: input.analysis_id,
    completed_at: new Date().toISOString(),
    summary: {
      screens_analyzed: input.screens.length,
      total_findings: totalFindings,
      critical: countBySeverity(screenResults, flowFindings, "critical"),
      warning: countBySeverity(screenResults, flowFindings, "warning"),
      info: countBySeverity(screenResults, flowFindings, "info"),
    },
    screens: screenResults,
    flow_findings: flowFindings,
    missing_screen_findings: [], // Flow-based detection only runs in plugin UI
  };

  // Write output
  const outputJson = JSON.stringify(output, null, 2);
  if (outputPath) {
    writeFileSync(outputPath, outputJson, "utf-8");
    console.error(`[edgy] Results written to ${outputPath}`);
  } else {
    process.stdout.write(outputJson);
  }

  console.error(`[edgy] Done. ${totalFindings} findings total.`);
}

/**
 * Deduplicates findings within flow groups: if the same rule_id
 * produced findings on multiple screens in a group, keep only the first.
 */
function deduplicateFindings(
  screenResults: ScreenResult[],
  flowGroups: Map<string, { screen_id: string }[]>
) {
  for (const [, screens] of flowGroups) {
    if (screens.length <= 1) continue;

    const screenIds = new Set(screens.map((s) => s.screen_id));
    const seenRuleIds = new Set<string>();

    for (const result of screenResults) {
      if (!screenIds.has(result.screen_id)) continue;

      result.findings = result.findings.filter((f) => {
        if (seenRuleIds.has(f.rule_id)) return false;
        seenRuleIds.add(f.rule_id);
        return true;
      });
    }
  }
}

function countBySeverity(
  screens: ScreenResult[],
  flowFindings: { severity: string }[],
  severity: string
): number {
  let count = 0;
  for (const screen of screens) {
    count += screen.findings.filter((f) => f.severity === severity).length;
  }
  count += flowFindings.filter((f) => f.severity === severity).length;
  return count;
}

main().catch((err) => {
  console.error("[edgy] Fatal error:", err);
  process.exit(1);
});
