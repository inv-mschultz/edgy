/**
 * Finding Generator
 *
 * Converts unmet expectations into structured findings with
 * affected areas and severity levels.
 */

import type {
  UnmetExpectation,
  AnalysisFinding,
  FlowFinding,
  ExtractedScreen,
  ExtractedNode,
  Rule,
  ComponentSuggestion,
} from "./types.js";
import { loadRules } from "./rule-engine.js";

let findingCounter = 0;

export function resetFindingCounter() {
  findingCounter = 0;
}

/**
 * Generates per-screen findings from unmet expectations.
 */
export function generateFindings(
  unmetExpectations: UnmetExpectation[],
  screen: ExtractedScreen
): AnalysisFinding[] {
  return unmetExpectations.map((unmet) => {
    findingCounter++;
    const { rule, matchedNodes, reason } = unmet;

    // Calculate affected area from matched nodes
    const affectedArea = computeBoundingBox(matchedNodes);

    return {
      id: `f-${String(findingCounter).padStart(3, "0")}`,
      rule_id: `${rule.category}/${rule.id}`,
      category: rule.category,
      severity: rule.severity,
      annotation_target: rule.annotation_target,
      title: rule.name,
      description: `${rule.description} (${reason})`,
      affected_nodes: matchedNodes.map((n) => n.id),
      affected_area: affectedArea
        ? {
            x: affectedArea.x,
            y: affectedArea.y,
            width: affectedArea.width,
            height: affectedArea.height,
          }
        : undefined,
      recommendation: {
        message: rule.recommendation.message,
        components: rule.recommendation.components.map((c) => ({
          name: c.label,
          shadcn_id: c.shadcn_id,
          variant: c.variant,
          description: `${c.label} from shadcn/ui`,
        })),
      },
    };
  });
}

/**
 * Generates flow-level findings by checking cross-screen rules.
 */
export function generateFlowFindings(
  screens: ExtractedScreen[],
  rules: Rule[],
  knowledgeDir: string
): FlowFinding[] {
  const flowFindings: FlowFinding[] = [];
  let flowFindingCounter = 0;

  // Collect all nodes across all screens
  const allNodes = screens.flatMap((s) => flattenTree(s.node_tree));

  // Check for flow-level edge cases
  const flowChecks: {
    id: string;
    category: string;
    check: () => boolean;
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
    recommendation: { message: string; components: ComponentSuggestion[] };
  }[] = [
    {
      id: "connectivity/offline-handling",
      category: "connectivity",
      severity: "warning",
      title: "No offline/connectivity error state in flow",
      description:
        "This flow appears to involve data-dependent content but no screen handles connectivity loss or network errors.",
      check: () => {
        const hasDataContent = allNodes.some(
          (n) =>
            n.componentName?.toLowerCase().includes("table") ||
            n.componentName?.toLowerCase().includes("card") ||
            n.componentName?.toLowerCase().includes("list") ||
            n.name.toLowerCase().includes("data") ||
            n.name.toLowerCase().includes("feed")
        );
        const hasOfflineState = allNodes.some(
          (n) =>
            n.name.toLowerCase().includes("offline") ||
            n.name.toLowerCase().includes("no connection") ||
            n.name.toLowerCase().includes("network error") ||
            n.name.toLowerCase().includes("retry")
        );
        return hasDataContent && !hasOfflineState;
      },
      recommendation: {
        message:
          "Add a screen or overlay showing an offline/connectivity error state with a retry action.",
        components: [
          {
            name: "Alert (Destructive)",
            shadcn_id: "alert",
            variant: "destructive",
            description: "Connection error banner",
          },
          {
            name: "Button",
            shadcn_id: "button",
            description: "Retry action button",
          },
        ],
      },
    },
    {
      id: "permissions/no-unauthorized-state",
      category: "permissions",
      severity: "info",
      title: "No permission/unauthorized state in flow",
      description:
        "This flow may involve restricted actions but no screen shows a permission denied or unauthorized state.",
      check: () => {
        const hasRestrictedActions = allNodes.some(
          (n) =>
            n.name.toLowerCase().includes("admin") ||
            n.name.toLowerCase().includes("settings") ||
            n.name.toLowerCase().includes("edit") ||
            n.name.toLowerCase().includes("manage")
        );
        const hasPermissionState = allNodes.some(
          (n) =>
            n.name.toLowerCase().includes("unauthorized") ||
            n.name.toLowerCase().includes("forbidden") ||
            n.name.toLowerCase().includes("permission") ||
            n.name.toLowerCase().includes("access denied")
        );
        return hasRestrictedActions && !hasPermissionState;
      },
      recommendation: {
        message:
          "Consider adding a state for when users lack permission to perform certain actions.",
        components: [
          {
            name: "Alert",
            shadcn_id: "alert",
            description: "Permission denied message",
          },
          {
            name: "Button (Disabled)",
            shadcn_id: "button",
            variant: "disabled",
            description: "Disabled state for unauthorized actions",
          },
        ],
      },
    },
  ];

  for (const check of flowChecks) {
    if (check.check()) {
      flowFindingCounter++;
      flowFindings.push({
        id: `ff-${String(flowFindingCounter).padStart(3, "0")}`,
        rule_id: check.id,
        category: check.category,
        severity: check.severity,
        title: check.title,
        description: check.description,
        recommendation: check.recommendation,
      });
    }
  }

  return flowFindings;
}

/**
 * Computes a bounding box around a set of nodes.
 */
function computeBoundingBox(
  nodes: ExtractedNode[]
): { x: number; y: number; width: number; height: number } | null {
  if (nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
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
