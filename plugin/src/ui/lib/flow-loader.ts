/**
 * Flow Rule Loader
 *
 * Loads bundled flow rules from the virtual module.
 */

import { flows as flowModules } from "virtual:edgy-knowledge";
import type { FlowType, ComponentSuggestion } from "./types";

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

// --- Public API ---

/**
 * Returns all flow rules from the bundled knowledge base.
 */
export function loadBundledFlowRules(): FlowRule[] {
  const rules: FlowRule[] = [];

  for (const [, parsed] of Object.entries(flowModules)) {
    if (parsed?.flow_type && parsed?.expected_screens) {
      rules.push({
        flow_type: parsed.flow_type as FlowType,
        name: parsed.name || "",
        description: parsed.description || "",
        triggers: parsed.triggers,
        expected_screens: (parsed.expected_screens || []).map((screen: any) => ({
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

  return rules;
}
