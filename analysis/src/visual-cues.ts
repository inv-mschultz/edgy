/**
 * Visual Cues
 *
 * Classifies colors into semantic cue types (error, warning, success, info)
 * and provides utilities for detecting visual state changes across screens.
 */

import type { ExtractedNode, VisualCueType } from "./types.js";

/**
 * Classifies an RGB color (0-1 range) into a semantic visual cue type.
 * Returns null for neutral/unclassifiable colors.
 */
export function classifyColor(
  r: number,
  g: number,
  b: number
): VisualCueType | null {
  // Red/error: high red, low green, low blue
  // Covers: #FF0000, #DC2626, #EF4444, #B91C1C, #E53E3E, etc.
  if (r > 0.6 && g < 0.35 && b < 0.35) return "error";

  // Red-orange error variants: #EA580C-ish, deeper oranges used as error
  if (r > 0.7 && g < 0.4 && b < 0.25) return "error";

  // Yellow/amber for warnings
  // Covers: #F59E0B, #EAB308, #D97706, #FFC107, etc.
  if (r > 0.7 && g > 0.5 && b < 0.3) return "warning";

  // Green for success
  // Covers: #22C55E, #16A34A, #10B981, #4ADE80, etc.
  if (g > 0.5 && r < 0.4 && b < 0.5) return "success";

  // Teal-green success variants
  if (g > 0.45 && r < 0.25 && b > 0.3 && b < 0.7) return "success";

  // Blue for info
  // Covers: #3B82F6, #2563EB, #0EA5E9, etc.
  if (b > 0.6 && r < 0.4 && g < 0.6) return "info";

  return null;
}

/**
 * Checks if a node carries a specific visual cue via its fills or strokes.
 */
export function nodeHasVisualCue(
  node: ExtractedNode,
  cueType: VisualCueType
): boolean {
  if (node.strokes) {
    for (const [r, g, b] of node.strokes) {
      if (classifyColor(r, g, b) === cueType) return true;
    }
  }

  if (node.fills) {
    for (const [r, g, b] of node.fills) {
      if (classifyColor(r, g, b) === cueType) return true;
    }
  }

  return false;
}

/**
 * Checks whether any node in a subtree carries a visual cue.
 * Searches the node and all its descendants.
 */
export function subtreeHasVisualCue(
  node: ExtractedNode,
  cueType: VisualCueType
): boolean {
  if (nodeHasVisualCue(node, cueType)) return true;
  for (const child of node.children) {
    if (subtreeHasVisualCue(child, cueType)) return true;
  }
  return false;
}

/**
 * Cross-screen comparison: checks if sibling screen nodes have a visual cue
 * that the base screen's corresponding components lack.
 *
 * For example: Screen 1 has Input with no red. Screen 2 has Input with a red
 * stroke. This returns true for cueType="error".
 *
 * @param baseScreenNodes - flattened nodes from the "normal" screen
 * @param siblingScreenNodes - flattened nodes from a sibling screen
 * @param cueType - the visual cue to look for
 * @param componentNames - optional filter to only compare certain components
 */
export function siblingHasNewVisualCue(
  baseScreenNodes: ExtractedNode[],
  siblingScreenNodes: ExtractedNode[],
  cueType: VisualCueType,
  componentNames?: string[]
): boolean {
  // Index base screen component instances by componentName
  const baseComponents = new Map<string, ExtractedNode[]>();
  for (const node of baseScreenNodes) {
    if (!node.componentName) continue;
    if (
      componentNames &&
      !componentNames.some((cn) =>
        node.componentName!.toLowerCase().includes(cn.toLowerCase())
      )
    )
      continue;
    const key = node.componentName.toLowerCase();
    if (!baseComponents.has(key)) baseComponents.set(key, []);
    baseComponents.get(key)!.push(node);
  }

  // For each matching component in the sibling screen, check for new visual cues
  for (const siblingNode of siblingScreenNodes) {
    if (!siblingNode.componentName) continue;

    if (
      componentNames &&
      !componentNames.some((cn) =>
        siblingNode.componentName!.toLowerCase().includes(cn.toLowerCase())
      )
    )
      continue;

    const key = siblingNode.componentName.toLowerCase();
    const baseMatches = baseComponents.get(key);

    // Does the sibling node (or its subtree) have the cue?
    if (!subtreeHasVisualCue(siblingNode, cueType)) continue;

    // If there are no base counterparts, the sibling has a component with
    // the cue that the base screen doesn't have at all — that counts
    if (!baseMatches) return true;

    // Do ALL base counterparts lack this cue?
    const baseLacksCue = baseMatches.every(
      (baseNode) => !subtreeHasVisualCue(baseNode, cueType)
    );

    if (baseLacksCue) return true;
  }

  // Also check non-component nodes: if sibling screen has text nodes with
  // the cue color that share a parent with a matching component, count it.
  // This catches red helper text below an Input.
  for (const siblingNode of siblingScreenNodes) {
    if (siblingNode.type !== "TEXT") continue;
    if (!nodeHasVisualCue(siblingNode, cueType)) continue;

    // Check if this text node is NOT present in the base screen
    // (by checking if any base text node has the same name and lacks the cue)
    const baseCounterpart = baseScreenNodes.find(
      (n) => n.type === "TEXT" && n.name === siblingNode.name
    );
    if (!baseCounterpart || !nodeHasVisualCue(baseCounterpart, cueType)) {
      return true;
    }
  }

  return false;
}
