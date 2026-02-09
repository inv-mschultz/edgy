/**
 * Flow Rule Loader
 *
 * Lazy-loads bundled flow rules from the virtual module.
 */

import type { FlowType } from "./types";

// --- Types ---

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
  triggers?: {
    any_of?: Array<{
      layer_name_patterns?: string[];
      component_names?: string[];
      with_patterns?: string[];
    }>;
  };
  expected_screens: ExpectedScreen[];
}

// Lazy-loaded cache
let cachedFlowRules: FlowRule[] | null = null;
let loadPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (cachedFlowRules) return;

  if (!loadPromise) {
    loadPromise = (async () => {
      const { flows: flowModules } = await import("virtual:edgy-knowledge");

      const rules: FlowRule[] = [];
      for (const [, parsed] of Object.entries(flowModules)) {
        if ((parsed as any)?.flow_type && (parsed as any)?.expected_screens) {
          rules.push({
            flow_type: (parsed as any).flow_type as FlowType,
            name: (parsed as any).name || "",
            description: (parsed as any).description || "",
            triggers: (parsed as any).triggers,
            expected_screens: ((parsed as any).expected_screens || []).map((screen: any) => ({
              id: screen.id || "",
              name: screen.name || "",
              description: screen.description || "",
              required: screen.required ?? false,
              severity: screen.severity,
              detection: screen.detection || {},
              components: screen.components || [],
            })),
          });
        }
      }
      cachedFlowRules = rules;
    })();
  }

  await loadPromise;
}

// --- Public API ---

/**
 * Returns all flow rules from the bundled knowledge base.
 * Lazy-loads on first access.
 */
export async function loadBundledFlowRules(): Promise<FlowRule[]> {
  await ensureLoaded();
  return cachedFlowRules!;
}
