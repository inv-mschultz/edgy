/**
 * Component Library Client
 *
 * Fetches component library information from the plugin.
 */

import type { DiscoveredComponentInfo } from "./types";

export interface ComponentLibraryData {
  serialized: string;
  components: DiscoveredComponentInfo[];
  stats: {
    total: number;
    buttons: number;
    inputs: number;
    cards: number;
    checkboxes: number;
  };
  componentKeys: Map<string, string>; // name -> key mapping
}

let cachedLibrary: ComponentLibraryData | null = null;

/**
 * Fetches the component library from the plugin.
 * Caches the result for subsequent calls.
 */
export async function getComponentLibrary(): Promise<ComponentLibraryData> {
  if (cachedLibrary) {
    return cachedLibrary;
  }

  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "component-library-result") {
        window.removeEventListener("message", handler);

        // Build name -> key mapping
        const componentKeys = new Map<string, string>();
        for (const comp of msg.components) {
          // Add by name
          componentKeys.set(comp.name, comp.key);
          // Also add by componentSetName if different
          if (comp.componentSetName && comp.componentSetName !== comp.name) {
            // For component sets, the set name maps to the first variant
            if (!componentKeys.has(comp.componentSetName)) {
              componentKeys.set(comp.componentSetName, comp.key);
            }
          }
        }

        cachedLibrary = {
          serialized: msg.serialized,
          components: msg.components,
          stats: msg.stats,
          componentKeys,
        };

        resolve(cachedLibrary);
      }
    };

    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "get-component-library" } }, "*");
  });
}

/**
 * Clears the cached component library.
 * Call this when the user might have added new components.
 */
export function clearComponentLibraryCache(): void {
  cachedLibrary = null;
}

/**
 * Finds a component key by name (supports partial matching).
 */
export function findComponentKey(
  library: ComponentLibraryData,
  name: string
): string | undefined {
  // Try exact match first
  const exact = library.componentKeys.get(name);
  if (exact) return exact;

  // Try case-insensitive match
  const nameLower = name.toLowerCase();
  for (const [compName, key] of library.componentKeys) {
    if (compName.toLowerCase() === nameLower) {
      return key;
    }
  }

  // Try partial match
  for (const [compName, key] of library.componentKeys) {
    if (compName.toLowerCase().includes(nameLower) || nameLower.includes(compName.toLowerCase())) {
      return key;
    }
  }

  return undefined;
}
