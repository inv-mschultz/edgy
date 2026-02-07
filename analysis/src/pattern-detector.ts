/**
 * Pattern Detector
 *
 * Walks a Figma node tree and identifies UI patterns:
 * forms, lists, buttons, data displays, etc.
 */

import type { ExtractedNode, DetectedPattern, PatternType } from "./types.js";

// Component names that indicate specific patterns (case-insensitive matching)
const FORM_FIELD_COMPONENTS = [
  "input", "textarea", "select", "combobox", "datepicker",
  "date-picker", "radiogroup", "radio-group", "checkbox",
  "switch", "slider", "toggle",
];

const BUTTON_COMPONENTS = ["button", "btn", "cta", "icon-button", "iconbutton"];

const LIST_INDICATORS = ["list", "grid", "table", "feed", "timeline", "cards"];

const DESTRUCTIVE_KEYWORDS = [
  "delete", "remove", "destroy", "clear", "reset", "revoke",
  "cancel", "unsubscribe", "deactivate", "disable", "archive",
];

const SEARCH_INDICATORS = ["search", "filter", "query", "find"];

const DATA_DISPLAY_COMPONENTS = [
  "card", "table", "avatar", "badge", "chart", "stat", "metric",
];

export function detectPatterns(rootNode: ExtractedNode): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const allNodes = flattenTree(rootNode);

  // Detect form fields
  const formFields = allNodes.filter((node) => isFormField(node));
  if (formFields.length > 0) {
    patterns.push({
      type: "form",
      nodes: formFields,
      confidence: formFields.some((n) => n.componentName) ? "high" : "medium",
      context: `Form with ${formFields.length} field(s): ${formFields.map(n => n.name).join(", ")}`,
    });

    // Also add individual form-field patterns
    for (const field of formFields) {
      patterns.push({
        type: "form-field",
        nodes: [field],
        confidence: field.componentName ? "high" : "medium",
        context: `Form field: ${field.name}`,
      });
    }
  }

  // Detect buttons
  const buttons = allNodes.filter((node) => isButton(node));
  for (const button of buttons) {
    patterns.push({
      type: "button",
      nodes: [button],
      confidence: button.componentName ? "high" : "medium",
      context: `Button: ${button.name}`,
    });

    // Check if destructive
    if (isDestructiveAction(button)) {
      patterns.push({
        type: "destructive-action",
        nodes: [button],
        confidence: "high",
        context: `Destructive action: ${button.name}`,
      });
    }
  }

  // Detect lists/repeating patterns
  const lists = detectLists(allNodes, rootNode);
  for (const list of lists) {
    patterns.push(list);
  }

  // Detect data displays
  const dataDisplays = allNodes.filter((node) => isDataDisplay(node));
  if (dataDisplays.length > 0) {
    patterns.push({
      type: "data-display",
      nodes: dataDisplays,
      confidence: dataDisplays.some((n) => n.componentName) ? "high" : "medium",
      context: `Data display with ${dataDisplays.length} element(s)`,
    });
  }

  // Detect search
  const searchNodes = allNodes.filter((node) =>
    SEARCH_INDICATORS.some((kw) => node.name.toLowerCase().includes(kw))
  );
  if (searchNodes.length > 0) {
    patterns.push({
      type: "search",
      nodes: searchNodes,
      confidence: "medium",
      context: `Search/filter: ${searchNodes.map(n => n.name).join(", ")}`,
    });
  }

  return patterns;
}

function flattenTree(node: ExtractedNode): ExtractedNode[] {
  const result: ExtractedNode[] = [node];
  for (const child of node.children) {
    result.push(...flattenTree(child));
  }
  return result;
}

function isFormField(node: ExtractedNode): boolean {
  // Check component name
  if (node.componentName) {
    return FORM_FIELD_COMPONENTS.some(
      (name) => node.componentName!.toLowerCase().includes(name)
    );
  }

  // Check layer name
  const lowerName = node.name.toLowerCase();
  return FORM_FIELD_COMPONENTS.some((name) => lowerName.includes(name)) ||
    /\b(field|form.?field|text.?input)\b/i.test(node.name);
}

function isButton(node: ExtractedNode): boolean {
  if (node.componentName) {
    return BUTTON_COMPONENTS.some(
      (name) => node.componentName!.toLowerCase().includes(name)
    );
  }

  const lowerName = node.name.toLowerCase();
  return BUTTON_COMPONENTS.some((name) => lowerName.includes(name)) ||
    /\b(submit|save|send|confirm|sign.?in|log.?in|register|sign.?up)\b/i.test(node.name);
}

function isDestructiveAction(node: ExtractedNode): boolean {
  const nameToCheck = (node.componentName || node.name).toLowerCase();
  const textToCheck = (node.textContent || "").toLowerCase();

  // Check for destructive variant property
  if (node.componentProperties) {
    for (const [, prop] of Object.entries(node.componentProperties)) {
      if (prop.value.toLowerCase() === "destructive") return true;
    }
  }

  return DESTRUCTIVE_KEYWORDS.some(
    (kw) => nameToCheck.includes(kw) || textToCheck.includes(kw)
  );
}

function isDataDisplay(node: ExtractedNode): boolean {
  if (node.componentName) {
    return DATA_DISPLAY_COMPONENTS.some(
      (name) => node.componentName!.toLowerCase().includes(name)
    );
  }
  return false;
}

function detectLists(allNodes: ExtractedNode[], rootNode: ExtractedNode): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Method 1: Look for nodes with list-like names
  const listNodes = allNodes.filter((node) =>
    LIST_INDICATORS.some((kw) => node.name.toLowerCase().includes(kw))
  );

  for (const listNode of listNodes) {
    patterns.push({
      type: "list",
      nodes: [listNode],
      confidence: "medium",
      context: `List/collection: ${listNode.name}`,
    });
  }

  // Method 2: Look for parent nodes with 3+ similar children (repeating pattern)
  for (const node of allNodes) {
    if (node.children.length >= 3) {
      const childTypes = node.children.map(
        (c) => c.componentName || c.type
      );
      const mostCommon = mode(childTypes);
      if (mostCommon && childTypes.filter((t) => t === mostCommon).length >= 3) {
        // Already detected by name check?
        if (!listNodes.includes(node)) {
          patterns.push({
            type: "list",
            nodes: [node],
            confidence: "low",
            context: `Repeating pattern (${mostCommon} x${childTypes.filter(t => t === mostCommon).length}): ${node.name}`,
          });
        }
      }
    }
  }

  return patterns;
}

function mode(arr: string[]): string | null {
  const counts = new Map<string, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  let maxCount = 0;
  let maxItem: string | null = null;
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxItem = item;
    }
  }
  return maxItem;
}
