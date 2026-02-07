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
} from "./types.js";

/**
 * Checks expectations for triggered rules.
 * Returns only the rules whose expectations are NOT met.
 */
export function checkExpectations(
  triggeredRules: TriggeredRule[],
  screenTree: ExtractedNode,
  allScreenTrees: ExtractedNode[]
): UnmetExpectation[] {
  const unmet: UnmetExpectation[] = [];

  for (const triggered of triggeredRules) {
    const { rule, matchedNodes } = triggered;
    let expectationMet = false;
    let reason = "";

    // Check in_screen expectations
    if (rule.expects.in_screen && rule.expects.in_screen.length > 0) {
      const screenNodes = flattenTree(screenTree);
      const screenMet = rule.expects.in_screen.some((condition) =>
        checkCondition(condition, screenNodes)
      );

      if (screenMet) {
        expectationMet = true;
      } else {
        reason = "Missing in current screen";
      }
    }

    // Check in_flow expectations (if in_screen wasn't met or doesn't exist)
    if (!expectationMet && rule.expects.in_flow && rule.expects.in_flow.length > 0) {
      const allNodes = allScreenTrees.flatMap((tree) => flattenTree(tree));
      const flowMet = rule.expects.in_flow.some((condition) =>
        checkCondition(condition, allNodes)
      );

      if (flowMet) {
        expectationMet = true;
      } else {
        reason = reason || "Missing across entire flow";
      }
    }

    // If no expectations defined, always flag (the trigger alone is the finding)
    if (
      (!rule.expects.in_screen || rule.expects.in_screen.length === 0) &&
      (!rule.expects.in_flow || rule.expects.in_flow.length === 0)
    ) {
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
          const regex = new RegExp(pattern, "i");
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

    if (matches && condition.component_names && condition.component_names.length > 0) {
      return true;
    }
  }

  return false;
}

function flattenTree(node: ExtractedNode): ExtractedNode[] {
  const result: ExtractedNode[] = [node];
  for (const child of node.children) {
    result.push(...flattenTree(child));
  }
  return result;
}
