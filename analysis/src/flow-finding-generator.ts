/**
 * Flow Finding Generator
 *
 * Generates missing screen findings by comparing detected flow types
 * against expected screens from flow rules.
 */

import type {
  ExtractedScreen,
  ExtractedNode,
  DetectedFlowType,
  MissingScreenFinding,
  ComponentSuggestion,
  FlowType,
} from "./types.js";

// --- Flow Rule Types ---

export interface ExpectedScreen {
  id: string;
  name: string;
  description: string;
  required: boolean;
  severity?: "critical" | "warning" | "info";
  detection: {
    layer_name_patterns?: string[];
    component_names?: string[];
  };
  components: {
    shadcn_id: string;
    variant?: string;
    label: string;
  }[];
}

export interface FlowRule {
  flow_type: FlowType;
  name: string;
  description: string;
  triggers: {
    any_of: Array<{
      layer_name_patterns?: string[];
      component_names?: string[];
      with_patterns?: string[];
    }>;
  };
  expected_screens: ExpectedScreen[];
}

// --- Counter ---

let missingScreenCounter = 0;

export function resetMissingScreenCounter() {
  missingScreenCounter = 0;
}

// --- Public API ---

/**
 * Generates missing screen findings for detected flow types.
 */
export function generateMissingScreenFindings(
  screens: ExtractedScreen[],
  detectedFlowTypes: DetectedFlowType[],
  flowRules: FlowRule[]
): MissingScreenFinding[] {
  const findings: MissingScreenFinding[] = [];

  // Get template dimensions from first screen
  const templateWidth = screens[0]?.width || 375;
  const templateHeight = screens[0]?.height || 812;

  for (const detected of detectedFlowTypes) {
    const rule = flowRules.find((r) => r.flow_type === detected.type);
    if (!rule) continue;

    for (const expectedScreen of rule.expected_screens) {
      const exists = checkScreenExists(screens, expectedScreen);

      if (!exists) {
        missingScreenCounter++;

        const components: ComponentSuggestion[] = expectedScreen.components.map((c) => ({
          name: `${c.shadcn_id}${c.variant ? ` (${c.variant})` : ""}`,
          shadcn_id: c.shadcn_id,
          variant: c.variant,
          description: c.label,
        }));

        findings.push({
          id: `mf-${String(missingScreenCounter).padStart(3, "0")}`,
          flow_type: detected.type,
          flow_name: rule.name,
          severity: expectedScreen.severity || (expectedScreen.required ? "warning" : "info"),
          missing_screen: {
            id: expectedScreen.id,
            name: expectedScreen.name,
            description: expectedScreen.description,
          },
          recommendation: {
            message: `Add a "${expectedScreen.name}" screen to complete your ${rule.name}.`,
            components,
          },
          placeholder: {
            suggested_name: expectedScreen.name,
            width: templateWidth,
            height: templateHeight,
          },
        });
      }
    }
  }

  return findings;
}

// --- Helpers ---

/**
 * Checks if a screen matching the expected screen detection criteria exists.
 */
function checkScreenExists(
  screens: ExtractedScreen[],
  expectedScreen: ExpectedScreen
): boolean {
  const detection = expectedScreen.detection;

  for (const screen of screens) {
    const allNodes = flattenTree(screen.node_tree);

    // Check screen name first
    if (detection.layer_name_patterns) {
      for (const patternStr of detection.layer_name_patterns) {
        try {
          // Strip inline flags like (?i) since we use "i" flag in RegExp
          const cleanPattern = patternStr.replace(/^\(\?[gimsuy]+\)/, "");
          const regex = new RegExp(cleanPattern, "i");

          // Check screen name
          if (regex.test(screen.name)) {
            return true;
          }

          // Check nodes within screen
          for (const node of allNodes) {
            if (regex.test(node.name)) {
              return true;
            }
            if (node.textContent && regex.test(node.textContent)) {
              return true;
            }
          }
        } catch {
          // Invalid regex, skip
        }
      }
    }

    // Check component names
    if (detection.component_names) {
      for (const compName of detection.component_names) {
        for (const node of allNodes) {
          if (node.componentName?.toLowerCase().includes(compName.toLowerCase())) {
            return true;
          }
        }
      }
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
