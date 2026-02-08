/**
 * Browser-side analysis orchestrator.
 *
 * Runs the Edgy analysis pipeline entirely in the plugin UI iframe,
 * replacing the GitHub submit → poll cycle.
 */

import { detectPatterns } from "@analysis/pattern-detector";
import { matchRules } from "@analysis/rule-engine";
import { checkExpectations } from "@analysis/expect-checker";
import {
  generateFindings,
  generateFlowFindings,
  resetFindingCounter,
} from "@analysis/finding-generator";
import {
  groupScreensByFlow,
  getFlowSiblings,
} from "@analysis/flow-grouper";
import { detectFlowTypes } from "@analysis/flow-type-detector";
import {
  generateMissingScreenFindings,
  resetMissingScreenCounter,
} from "@analysis/flow-finding-generator";
import { loadBundledRules, loadBundledMappings } from "./knowledge-loader";
import { loadBundledFlowRules } from "./flow-loader";
import type {
  AnalysisInput,
  AnalysisOutput,
  ScreenResult,
  AnalysisFinding,
  ComponentSuggestion,
  DetectedPattern,
  MissingScreenFinding,
} from "./types";

interface ComponentMapping {
  shadcn_id: string;
  variant?: string;
  usage: string;
}

interface MappingEntry {
  description: string;
  primary: ComponentMapping[];
  supporting?: ComponentMapping[];
}

/**
 * Runs the full Edgy analysis pipeline in-browser.
 */
export function runAnalysis(input: AnalysisInput): AnalysisOutput {
  resetFindingCounter();
  resetMissingScreenCounter();

  const rules = loadBundledRules();
  const mappings = loadBundledMappings();
  const flowRules = loadBundledFlowRules();

  // Group screens by flow (shared name prefix)
  const flowGroups = groupScreensByFlow(input.screens as any[]);

  const screenResults: ScreenResult[] = [];
  const allPatterns = new Map<string, DetectedPattern[]>();

  for (const screen of input.screens) {
    // Step 1: Detect UI patterns in the node tree
    const patterns = detectPatterns(screen.node_tree as any);
    allPatterns.set(screen.screen_id, patterns as DetectedPattern[]);

    // Step 2: Match rules against detected patterns
    const triggeredRules = matchRules(patterns, rules);

    // Step 3: Check expectations (with flow-aware 3-tier checking)
    const flowSiblings = getFlowSiblings(screen as any, flowGroups);
    const flowGroupTrees = flowSiblings.map((s) => s.node_tree);
    const unmetExpectations = checkExpectations(
      triggeredRules,
      screen.node_tree as any,
      input.screens.map((s) => s.node_tree as any),
      flowGroupTrees as any[]
    );

    // Step 4: Generate findings
    const findings = generateFindings(unmetExpectations, screen as any);

    // Step 5: Enrich with component recommendations
    const findingsWithComponents = mapComponentsInline(findings as any[], mappings);

    screenResults.push({
      screen_id: screen.screen_id,
      name: screen.name,
      findings: findingsWithComponents,
    });
  }

  // Deduplicate findings within flow groups
  deduplicateFindings(screenResults, flowGroups);

  // Flow-level findings (existing edge case checks)
  const flowFindings = generateFlowFindings(
    input.screens as any[],
    rules,
    ""
  );

  // NEW: Flow type detection and missing screen findings
  const detectedFlowTypes = detectFlowTypes(input.screens as any[], allPatterns as any);
  const missingScreenFindings = generateMissingScreenFindings(
    input.screens as any[],
    detectedFlowTypes,
    flowRules as any[]
  );

  const totalFindings =
    screenResults.reduce((sum, s) => sum + s.findings.length, 0) +
    flowFindings.length +
    missingScreenFindings.length;

  return {
    analysis_id: input.analysis_id,
    completed_at: new Date().toISOString(),
    summary: {
      screens_analyzed: input.screens.length,
      total_findings: totalFindings,
      critical: countBySeverityAll(screenResults, flowFindings, missingScreenFindings, "critical"),
      warning: countBySeverityAll(screenResults, flowFindings, missingScreenFindings, "warning"),
      info: countBySeverityAll(screenResults, flowFindings, missingScreenFindings, "info"),
    },
    screens: screenResults,
    flow_findings: flowFindings as any[],
    missing_screen_findings: missingScreenFindings,
  };
}

/**
 * Inline component mapping using pre-loaded mappings.
 * Browser-compatible version of component-mapper.ts mapComponents().
 */
function mapComponentsInline(
  findings: AnalysisFinding[],
  mappings: Map<string, MappingEntry>
): AnalysisFinding[] {
  return findings.map((finding) => {
    const mapping = mappings.get(finding.category);
    if (!mapping) return finding;

    const enrichedComponents: ComponentSuggestion[] = [
      ...mapping.primary.map((m) => ({
        name: `${m.shadcn_id}${m.variant ? ` (${m.variant})` : ""}`,
        shadcn_id: m.shadcn_id,
        variant: m.variant,
        description: m.usage,
      })),
      ...(mapping.supporting || []).map((m) => ({
        name: `${m.shadcn_id}${m.variant ? ` (${m.variant})` : ""}`,
        shadcn_id: m.shadcn_id,
        variant: m.variant,
        description: m.usage,
      })),
    ];

    const existingIds = new Set(
      finding.recommendation.components.map(
        (c) => `${c.shadcn_id}-${c.variant || ""}`
      )
    );

    return {
      ...finding,
      recommendation: {
        ...finding.recommendation,
        components: [
          ...finding.recommendation.components,
          ...enrichedComponents.filter(
            (c) => !existingIds.has(`${c.shadcn_id}-${c.variant || ""}`)
          ),
        ],
      },
    };
  });
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

function countBySeverityAll(
  screens: ScreenResult[],
  flowFindings: { severity: string }[],
  missingScreenFindings: MissingScreenFinding[],
  severity: string
): number {
  let count = countBySeverity(screens, flowFindings, severity);
  count += missingScreenFindings.filter((f) => f.severity === severity).length;
  return count;
}
