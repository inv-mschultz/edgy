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
import { loadBundledRules, loadBundledMappings } from "./knowledge-loader";
import type {
  AnalysisInput,
  AnalysisOutput,
  ScreenResult,
  AnalysisFinding,
  ComponentSuggestion,
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

  const rules = loadBundledRules();
  const mappings = loadBundledMappings();

  const screenResults: ScreenResult[] = [];

  for (const screen of input.screens) {
    // Step 1: Detect UI patterns in the node tree
    const patterns = detectPatterns(screen.node_tree as any);

    // Step 2: Match rules against detected patterns
    const triggeredRules = matchRules(patterns, rules);

    // Step 3: Check expectations
    const unmetExpectations = checkExpectations(
      triggeredRules,
      screen.node_tree as any,
      input.screens.map((s) => s.node_tree as any)
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

  // Flow-level findings
  const flowFindings = generateFlowFindings(
    input.screens as any[],
    rules,
    ""
  );

  const totalFindings =
    screenResults.reduce((sum, s) => sum + s.findings.length, 0) +
    flowFindings.length;

  return {
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
    flow_findings: flowFindings as any[],
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
