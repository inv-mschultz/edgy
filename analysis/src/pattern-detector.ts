/**
 * Pattern Detector
 *
 * Walks a Figma node tree and identifies UI patterns:
 * forms, lists, buttons, data displays, modals, navigation, etc.
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

const DATA_DISPLAY_LAYER_KEYWORDS = [
  "card", "widget", "panel", "stats", "data", "info", "metric",
  "stat", "chart", "graph", "kpi",
];

const MODAL_COMPONENTS = [
  "dialog", "modal", "alertdialog", "alert-dialog", "sheet",
  "drawer", "overlay", "popover", "dropdown-menu", "context-menu",
];

const MODAL_LAYER_KEYWORDS = [
  "modal", "dialog", "popup", "overlay", "drawer", "sheet",
  "bottom-sheet", "bottomsheet",
];

const NAV_COMPONENTS = [
  "tabs", "tab", "navbar", "nav-bar", "sidebar", "breadcrumb",
  "navigation", "menu", "menubar", "stepper", "step",
];

const NAV_LAYER_KEYWORDS = [
  "nav", "tabs", "tab-bar", "tabbar", "sidebar", "breadcrumb",
  "menu", "stepper", "navigation",
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

  // Detect modals/dialogs
  const modals = allNodes.filter((node) => isModal(node));
  for (const modal of modals) {
    patterns.push({
      type: "modal",
      nodes: [modal],
      confidence: modal.componentName ? "high" : "medium",
      context: `Modal/dialog: ${modal.name}`,
    });
  }

  // Detect navigation
  const navNodes = allNodes.filter((node) => isNavigation(node));
  if (navNodes.length > 0) {
    patterns.push({
      type: "navigation",
      nodes: navNodes,
      confidence: navNodes.some((n) => n.componentName) ? "high" : "medium",
      context: `Navigation: ${navNodes.map(n => n.name).join(", ")}`,
    });
  }

  // Detect search (check both layer name and component name)
  const searchNodes = allNodes.filter((node) =>
    SEARCH_INDICATORS.some((kw) => {
      const nameMatch = node.name.toLowerCase().includes(kw);
      const componentMatch = node.componentName
        ? node.componentName.toLowerCase().includes(kw)
        : false;
      return nameMatch || componentMatch;
    })
  );
  if (searchNodes.length > 0) {
    patterns.push({
      type: "search",
      nodes: searchNodes,
      confidence: searchNodes.some((n) => n.componentName) ? "high" : "medium",
      context: `Search/filter: ${searchNodes.map(n => n.name).join(", ")}`,
    });
  }

  return patterns;
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
  if (BUTTON_COMPONENTS.some((name) => lowerName.includes(name))) {
    return true;
  }

  // Only match action keywords on leaf-ish nodes (INSTANCE, TEXT, or small FRAME),
  // not top-level screen frames
  if (node.type === "FRAME" && node.children && node.children.length > 2) return false;

  return /\b(submit|save|send|confirm|sign.?in|log.?in|register|sign.?up|cancel|close|next|previous|back|continue|done|apply|add|create|update|edit|go|ok|accept|decline|reject)\b/i.test(node.name);
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

  // Layer name fallback
  const lowerName = node.name.toLowerCase();
  return DATA_DISPLAY_LAYER_KEYWORDS.some((kw) => lowerName.includes(kw));
}

function isModal(node: ExtractedNode): boolean {
  if (node.componentName) {
    return MODAL_COMPONENTS.some(
      (name) => node.componentName!.toLowerCase().includes(name)
    );
  }
  const lowerName = node.name.toLowerCase();
  return MODAL_LAYER_KEYWORDS.some((kw) => lowerName.includes(kw));
}

function isNavigation(node: ExtractedNode): boolean {
  if (node.componentName) {
    return NAV_COMPONENTS.some(
      (name) => node.componentName!.toLowerCase().includes(name)
    );
  }
  const lowerName = node.name.toLowerCase();
  return NAV_LAYER_KEYWORDS.some((kw) => lowerName.includes(kw));
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
    const children = node.children || [];
    if (children.length >= 3) {
      const childTypes = children.map(
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
