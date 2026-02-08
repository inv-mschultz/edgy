/**
 * Flow Type Detector
 *
 * Infers flow types from detected patterns and screen content.
 * Uses heuristic matching on layer names, component names, and patterns.
 */

import type {
  ExtractedScreen,
  ExtractedNode,
  DetectedPattern,
  FlowType,
  DetectedFlowType,
} from "./types.js";

// --- Flow Type Detection Rules ---

interface FlowTrigger {
  type: FlowType;
  name: string;
  layerPatterns?: RegExp[];
  componentNames?: string[];
  patternTypes?: string[];
  // If multiple conditions specified, they use OR logic
}

const FLOW_TRIGGERS: FlowTrigger[] = [
  {
    type: "authentication",
    name: "Authentication Flow",
    layerPatterns: [
      /\b(sign.?in|log.?in|login)\b/i,
      /\b(register|sign.?up|create.?account)\b/i,
      /\bpassword\b.*\b(input|field)\b/i,
      /\b(forgot|reset).*(password)\b/i,
    ],
    componentNames: ["Input", "Password"],
  },
  {
    type: "checkout",
    name: "Checkout Flow",
    layerPatterns: [
      /\b(checkout|cart|basket)\b/i,
      /\b(payment|pay.?now|credit.?card)\b/i,
      /\b(shipping|delivery)\b.*\b(form|address)\b/i,
      /\bplace.?order\b/i,
    ],
  },
  {
    type: "onboarding",
    name: "Onboarding Flow",
    layerPatterns: [
      /\b(welcome|get.?started|onboarding)\b/i,
      /\bstep.?[0-9]/i,
      /\b(first.?time|new.?user|tour)\b/i,
    ],
    componentNames: ["Stepper", "Step"],
  },
  {
    type: "crud",
    name: "CRUD Flow",
    layerPatterns: [
      /\b(create|add|new).*(item|record|entry)\b/i,
      /\b(edit|update|modify)\b/i,
      /\b(delete|remove)\b/i,
    ],
    patternTypes: ["list", "form", "destructive-action"],
  },
  {
    type: "search",
    name: "Search Flow",
    layerPatterns: [
      /\b(search|find|query)\b/i,
      /\b(filter|refine|results)\b/i,
    ],
    componentNames: ["Search", "SearchInput", "Command"],
    patternTypes: ["search"],
  },
  {
    type: "settings",
    name: "Settings Flow",
    layerPatterns: [
      /\b(settings|preferences|config)\b/i,
      /\b(account|profile).*(settings|edit)\b/i,
      /\b(notification|privacy|security).*(settings)\b/i,
    ],
  },
  {
    type: "upload",
    name: "Upload Flow",
    layerPatterns: [
      /\b(upload|import|attach)\b/i,
      /\b(drag.?drop|drop.?zone|file.?input)\b/i,
      /\b(select|choose|browse).*(file)\b/i,
    ],
  },
  {
    type: "subscription",
    name: "Subscription Flow",
    layerPatterns: [
      /\b(pricing|plans|subscription)\b/i,
      /\b(upgrade|downgrade|premium|pro)\b/i,
      /\b(billing|plan).*(select|choose)\b/i,
    ],
  },
  {
    type: "messaging",
    name: "Messaging Flow",
    layerPatterns: [
      /\b(inbox|messages|chat)\b/i,
      /\b(compose|new.?message|send)\b/i,
      /\b(thread|conversation|dm)\b/i,
    ],
  },
  {
    type: "booking",
    name: "Booking Flow",
    layerPatterns: [
      /\b(book|reserve|schedule)\b/i,
      /\b(date|time).*(select|pick)\b/i,
      /\b(appointment|reservation)\b/i,
    ],
    componentNames: ["Calendar", "DatePicker"],
  },
];

// --- Public API ---

/**
 * Detects flow types from analyzed screens and patterns.
 */
export function detectFlowTypes(
  screens: ExtractedScreen[],
  patterns: Map<string, DetectedPattern[]>
): DetectedFlowType[] {
  const detected: DetectedFlowType[] = [];
  const seenTypes = new Set<FlowType>();

  // Collect all nodes from all screens
  const allNodes: ExtractedNode[] = [];
  for (const screen of screens) {
    allNodes.push(...flattenTree(screen.node_tree));
  }

  // Collect all pattern types
  const allPatternTypes = new Set<string>();
  for (const [, screenPatterns] of patterns) {
    for (const p of screenPatterns) {
      allPatternTypes.add(p.type);
    }
  }

  for (const trigger of FLOW_TRIGGERS) {
    // Track which screens/patterns triggered this flow
    const triggerScreens: string[] = [];
    const triggerPatterns: string[] = [];

    // Check layer name patterns
    if (trigger.layerPatterns) {
      for (const screen of screens) {
        const screenNodes = flattenTree(screen.node_tree);
        for (const node of screenNodes) {
          for (const pattern of trigger.layerPatterns) {
            if (pattern.test(node.name) || (node.textContent && pattern.test(node.textContent))) {
              if (!triggerScreens.includes(screen.screen_id)) {
                triggerScreens.push(screen.screen_id);
              }
              triggerPatterns.push(`layer: ${node.name.slice(0, 30)}`);
              break; // Only need one match per node
            }
          }
        }
      }
    }

    // Check component names
    if (trigger.componentNames) {
      for (const screen of screens) {
        const screenNodes = flattenTree(screen.node_tree);
        for (const node of screenNodes) {
          if (node.componentName) {
            for (const compName of trigger.componentNames) {
              if (node.componentName.toLowerCase().includes(compName.toLowerCase())) {
                if (!triggerScreens.includes(screen.screen_id)) {
                  triggerScreens.push(screen.screen_id);
                }
                triggerPatterns.push(`component: ${node.componentName}`);
                break;
              }
            }
          }
        }
      }
    }

    // Check pattern types
    if (trigger.patternTypes) {
      for (const patternType of trigger.patternTypes) {
        if (allPatternTypes.has(patternType)) {
          triggerPatterns.push(`pattern: ${patternType}`);
          // Find which screens have this pattern
          for (const [screenId, screenPatterns] of patterns) {
            if (screenPatterns.some((p) => p.type === patternType)) {
              if (!triggerScreens.includes(screenId)) {
                triggerScreens.push(screenId);
              }
            }
          }
        }
      }
    }

    // Determine if flow type is detected and with what confidence
    if (triggerScreens.length > 0 || triggerPatterns.length > 0) {
      if (seenTypes.has(trigger.type)) continue;
      seenTypes.add(trigger.type);

      // Confidence based on number of triggers
      const uniquePatterns = [...new Set(triggerPatterns)];
      let confidence: "high" | "medium" | "low";
      if (triggerScreens.length >= 2 && uniquePatterns.length >= 3) {
        confidence = "high";
      } else if (triggerScreens.length >= 1 && uniquePatterns.length >= 2) {
        confidence = "medium";
      } else {
        confidence = "low";
      }

      detected.push({
        type: trigger.type,
        confidence,
        triggerScreens: [...new Set(triggerScreens)],
        triggerPatterns: uniquePatterns.slice(0, 5), // Limit to 5 for brevity
      });
    }
  }

  return detected;
}

// --- Helpers ---

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
