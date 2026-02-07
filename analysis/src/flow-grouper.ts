/**
 * Flow Grouper
 *
 * Groups screens into flow groups by name prefix.
 * Screens named "Login", "Login - Error", "Login / Loading"
 * all share the prefix "login" and form one flow group.
 */

import type { ExtractedScreen } from "./types.js";

// Common Figma delimiters between the base screen name and its variant
const DELIMITER_PATTERN = /\s*(?:\s[-–—]\s|\s\/\s|\s>\s|\s\|\s|\s:\s|\s?\()/;

/**
 * Extracts the flow prefix from a screen name.
 *
 * "Login - Error"      → "login"
 * "Checkout / Step 1"  → "checkout"
 * "Dashboard (Empty)"  → "dashboard"
 * "Settings > Profile" → "settings"
 * "Login"              → "login"
 */
export function extractFlowPrefix(name: string): string {
  const match = name.match(DELIMITER_PATTERN);
  const prefix = match ? name.slice(0, match.index!) : name;
  return prefix.trim().toLowerCase();
}

/**
 * Groups screens by their flow prefix.
 * Returns a Map from prefix → screens in that group.
 */
export function groupScreensByFlow(
  screens: ExtractedScreen[]
): Map<string, ExtractedScreen[]> {
  const groups = new Map<string, ExtractedScreen[]>();

  for (const screen of screens) {
    const prefix = extractFlowPrefix(screen.name);
    if (!groups.has(prefix)) {
      groups.set(prefix, []);
    }
    groups.get(prefix)!.push(screen);
  }

  return groups;
}

/**
 * Returns all screens in the same flow group as the given screen.
 */
export function getFlowSiblings(
  screen: ExtractedScreen,
  flowGroups: Map<string, ExtractedScreen[]>
): ExtractedScreen[] {
  const prefix = extractFlowPrefix(screen.name);
  return flowGroups.get(prefix) || [screen];
}
