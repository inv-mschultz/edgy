/**
 * Expect Checker
 *
 * For each triggered rule, checks whether the expected states
 * exist in the current screen or across the flow.
 */

import type {
  TriggeredRule,
  UnmetExpectation,
  ExtractedNode,
  ExpectCondition,
  Rule,
  VisualCueType,
} from "./types.js";
import {
  subtreeHasVisualCue,
  siblingHasNewVisualCue,
} from "./visual-cues.js";

/**
 * Checks expectations for triggered rules using three tiers:
 *
 * 1. in_screen — check the current screen's nodes
 * 2. in_flow (same group) — check sibling screens in the same flow
 *    group using the same in_screen conditions
 * 3. in_flow (all screens) — check ALL screens using in_flow conditions
 *
 * @param flowGroupTrees - node trees of screens in the same flow group
 *   (screens sharing a name prefix, e.g. "Login", "Login - Error").
 *   Falls back to allScreenTrees if not provided.
 */
export function checkExpectations(
  triggeredRules: TriggeredRule[],
  screenTree: ExtractedNode,
  allScreenTrees: ExtractedNode[],
  flowGroupTrees?: ExtractedNode[]
): UnmetExpectation[] {
  const unmet: UnmetExpectation[] = [];
  const siblingTrees = flowGroupTrees || allScreenTrees;

  for (const triggered of triggeredRules) {
    const { rule, matchedNodes } = triggered;
    let expectationMet = false;
    let reason = "";

    const hasInScreen =
      rule.expects.in_screen != null && rule.expects.in_screen.length > 0;
    const hasInFlow =
      rule.expects.in_flow != null && rule.expects.in_flow.length > 0;

    // Tier 1: Check in_screen expectations against current screen
    if (hasInScreen) {
      const screenNodes = flattenTree(screenTree);
      const screenMet = rule.expects.in_screen!.some((condition) =>
        checkCondition(condition, screenNodes)
      );

      if (screenMet) {
        expectationMet = true;
      } else {
        reason = "Missing in current screen";
      }
    }

    // Tier 2: Check in_screen expectations across flow group siblings
    if (!expectationMet && hasInScreen && siblingTrees.length > 1) {
      const siblingNodes = siblingTrees.flatMap((tree) => flattenTree(tree));
      const siblingMet = rule.expects.in_screen!.some((condition) =>
        checkCondition(condition, siblingNodes)
      );

      if (siblingMet) {
        expectationMet = true;
      }
      // reason stays as "Missing in current screen" — the finding still
      // applies to this screen even though a sibling satisfies it, but
      // deduplication in the orchestrator will handle this
    }

    // Tier 3: Check in_flow expectations across all screens
    if (!expectationMet && hasInFlow) {
      const allNodes = allScreenTrees.flatMap((tree) => flattenTree(tree));
      const flowMet = rule.expects.in_flow!.some((condition) =>
        checkCondition(condition, allNodes)
      );

      if (flowMet) {
        expectationMet = true;
      } else {
        reason = reason || "Missing across entire flow";
      }
    }

    // Tier 4 (implicit): Visual inference across flow siblings
    if (!expectationMet && (hasInScreen || hasInFlow)) {
      const visualMet = implicitVisualInference(
        rule,
        matchedNodes,
        screenTree,
        siblingTrees
      );
      if (visualMet) {
        expectationMet = true;
      }
    }

    // If no expectations defined, always flag (the trigger alone is the finding)
    if (!hasInScreen && !hasInFlow) {
      reason = "No matching state found";
    }

    if (!expectationMet) {
      unmet.push({ rule, matchedNodes, reason });
    }
  }

  return unmet;
}

/**
 * Checks if a single expect condition is met by any node in the list.
 */
function checkCondition(
  condition: ExpectCondition,
  nodes: ExtractedNode[]
): boolean {
  for (const node of nodes) {
    let matches = true;

    // Check component name match
    if (condition.component_names && condition.component_names.length > 0) {
      const nodeName = (node.componentName || "").toLowerCase();
      const nameMatch = condition.component_names.some(
        (name) => nodeName.includes(name.toLowerCase())
      );
      if (!nameMatch) matches = false;
    }

    // Check component properties
    if (matches && condition.with_properties) {
      if (!node.componentProperties) {
        matches = false;
      } else {
        for (const [key, expectedValue] of Object.entries(condition.with_properties)) {
          const prop = node.componentProperties[key];
          if (!prop || prop.value.toLowerCase() !== expectedValue.toLowerCase()) {
            matches = false;
            break;
          }
        }
      }
    }

    // Check layer name patterns
    if (condition.layer_name_patterns && condition.layer_name_patterns.length > 0) {
      const patternMatch = condition.layer_name_patterns.some((pattern) => {
        try {
          const regex = new RegExp(stripInlineFlags(pattern), "i");
          return (
            regex.test(node.name) ||
            (node.textContent ? regex.test(node.textContent) : false)
          );
        } catch {
          return false;
        }
      });

      // layer_name_patterns is an alternative check — if component_names didn't match
      // but layer names do, still consider it met
      if (patternMatch) return true;
      if (!condition.component_names) matches = false;
    }

    // Check visual cues (alternative check, like layer_name_patterns)
    if (condition.with_visual_cues && condition.with_visual_cues.length > 0) {
      const cueMatch = condition.with_visual_cues.some((cueType) =>
        subtreeHasVisualCue(node, cueType)
      );
      if (cueMatch) return true;
      if (!condition.component_names && !condition.layer_name_patterns) {
        matches = false;
      }
    }

    if (matches && condition.component_names && condition.component_names.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Implicit visual inference: for rules in certain categories,
 * automatically check if flow sibling screens show visual cues
 * that indicate the expected state exists.
 *
 * This compares the same component across screens — if a sibling screen
 * has a red stroke on an Input that the current screen lacks, that's
 * evidence of an error state being designed.
 */
const CATEGORY_TO_CUE: Record<string, VisualCueType> = {
  "error-states": "error",
  "loading-states": "warning",
  "connectivity": "warning",
};

function implicitVisualInference(
  rule: Rule,
  matchedNodes: ExtractedNode[],
  screenTree: ExtractedNode,
  siblingTrees: ExtractedNode[]
): boolean {
  const expectedCue = CATEGORY_TO_CUE[rule.category];
  if (!expectedCue) return false;
  if (siblingTrees.length <= 1) return false;

  const currentNodes = flattenTree(screenTree);

  // Get component names from matched trigger nodes to narrow the search
  const triggerComponentNames = matchedNodes
    .map((n) => n.componentName)
    .filter((name): name is string => name != null);

  for (const siblingTree of siblingTrees) {
    if (siblingTree === screenTree) continue;
    const siblingNodes = flattenTree(siblingTree);

    if (
      siblingHasNewVisualCue(
        currentNodes,
        siblingNodes,
        expectedCue,
        triggerComponentNames.length > 0 ? triggerComponentNames : undefined
      )
    ) {
      return true;
    }
  }

  return false;
}

function flattenTree(node: ExtractedNode): ExtractedNode[] {
  if (!node) return [];
  const result: ExtractedNode[] = [node];
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      result.push(...flattenTree(child));
    }
  }
  return result;
}

/**
 * Strips inline flag prefixes like (?i) from regex strings.
 * YAML rules use (?i) for case-insensitive matching, but JavaScript
 * doesn't support inline flags — we pass "i" to RegExp() instead.
 */
function stripInlineFlags(pattern: string): string {
  return pattern.replace(/^\(\?[gimsuy]+\)/, "");
}
