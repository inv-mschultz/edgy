/**
 * Knowledge Base Loader
 *
 * Loads rules, component mappings, and flow rules from YAML files.
 */

import { readFileSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { parse as parseYaml } from "yaml";
import type { FlowType } from "./types";

// Types for knowledge base entries

interface ComponentMapping {
  shadcn_id: string;
  variant?: string;
  usage: string;
}

export interface MappingEntry {
  description: string;
  primary: ComponentMapping[];
  supporting?: ComponentMapping[];
}

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

export interface Rule {
  id: string;
  category: string;
  name: string;
  severity: "critical" | "warning" | "info";
  annotation_target?: "element" | "screen";
  description: string;
  triggers: {
    component_names?: string[];
    layer_name_patterns?: string[];
    pattern_types?: string[];
  };
  /** Conditions that prevent this rule from triggering (reduces false positives) */
  exclude?: {
    /** Don't trigger if matched node's parent name matches these patterns */
    parent_name_patterns?: string[];
    /** Don't trigger if matched node's component name matches these */
    parent_component_names?: string[];
    /** Don't trigger if screen name matches these patterns */
    screen_name_patterns?: string[];
    /** Don't trigger if these element types are ancestors of the matched node */
    ancestor_element_types?: string[];
  };
  expects: {
    in_screen?: ExpectCondition[];
    in_flow?: ExpectCondition[];
  };
  /** Confidence weight multipliers for multi-signal scoring */
  confidence_signals?: {
    /** Base confidence when only name matches (default 0.5) */
    name_match?: number;
    /** Boost when component type also matches (default 0.3) */
    component_match?: number;
    /** Boost when visual characteristics match (default 0.2) */
    visual_match?: number;
    /** Minimum confidence threshold to generate a finding (default 0.4) */
    threshold?: number;
  };
  /** Structured finding template with variable interpolation */
  finding_template?: {
    title: string;
    description: string;
    recommendation: string;
  };
  recommendation: {
    message: string;
    components: { shadcn_id: string; variant?: string; label: string }[];
  };
}

interface ExpectCondition {
  component_names?: string[];
  with_properties?: Record<string, string>;
  layer_name_patterns?: string[];
  with_visual_cues?: string[];
}

// Resolve knowledge directory path
const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = resolve(__dirname, "../../../knowledge");

// --- Enriched Research Rules ---

export interface EnrichedRuleFinding {
  id: string;
  severity: "critical" | "warning" | "info";
  condition: string;
  title: string;
  evidence: string;
  recommendation: string;
}

export interface EnrichedRule {
  trigger: {
    flow_type?: string;
    pattern_types?: string[];
    screen_contains?: string[];
  };
  findings: EnrichedRuleFinding[];
}

export interface EnrichedRuleSet {
  source: string;
  topic: string;
  rules: EnrichedRule[];
}

// Caches
let rulesCache: Rule[] | null = null;
let mappingsCache: Map<string, MappingEntry> | null = null;
let flowRulesCache: FlowRule[] | null = null;
let enrichedRulesCache: EnrichedRuleSet[] | null = null;

/**
 * Load all rules from the knowledge base
 */
export function loadRules(): Rule[] {
  if (rulesCache) return rulesCache;

  const rulesDir = join(KNOWLEDGE_DIR, "rules");
  const rules: Rule[] = [];

  try {
    const files = readdirSync(rulesDir).filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml")
    );

    for (const file of files) {
      const content = readFileSync(join(rulesDir, file), "utf-8");
      const parsed = parseYaml(content);

      if (parsed?.rules && Array.isArray(parsed.rules)) {
        const category =
          parsed.name?.toLowerCase().replace(/\s+/g, "-") ||
          file.replace(/\.ya?ml$/, "");

        for (const rule of parsed.rules) {
          rules.push({
            ...rule,
            category: rule.category || category,
          });
        }
      }
    }
  } catch (error) {
    console.error("[knowledge] Error loading rules:", error);
  }

  rulesCache = rules;
  return rules;
}

/**
 * Load component mappings from the knowledge base
 */
export function loadMappings(): Map<string, MappingEntry> {
  if (mappingsCache) return mappingsCache;

  const mappingsPath = join(KNOWLEDGE_DIR, "components", "component-mappings.yml");
  const mappings = new Map<string, MappingEntry>();

  try {
    const content = readFileSync(mappingsPath, "utf-8");
    const parsed = parseYaml(content);

    if (parsed?.mappings) {
      for (const [category, entry] of Object.entries(parsed.mappings)) {
        mappings.set(category, entry as MappingEntry);
      }
    }
  } catch (error) {
    console.error("[knowledge] Error loading mappings:", error);
  }

  mappingsCache = mappings;
  return mappings;
}

/**
 * Load flow rules from the knowledge base
 */
export function loadFlowRules(): FlowRule[] {
  if (flowRulesCache) return flowRulesCache;

  const flowsDir = join(KNOWLEDGE_DIR, "flows");
  const rules: FlowRule[] = [];

  try {
    const files = readdirSync(flowsDir).filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml")
    );

    for (const file of files) {
      const content = readFileSync(join(flowsDir, file), "utf-8");
      const parsed = parseYaml(content);

      if (parsed?.flow_type && parsed?.expected_screens) {
        rules.push({
          flow_type: parsed.flow_type as FlowType,
          name: parsed.name || "",
          description: parsed.description || "",
          triggers: parsed.triggers,
          expected_screens: (parsed.expected_screens || []).map(
            (screen: any) => ({
              id: screen.id || "",
              name: screen.name || "",
              description: screen.description || "",
              required: screen.required ?? false,
              severity: screen.severity,
              detection: screen.detection || {},
              components: screen.components || [],
            })
          ),
        });
      }
    }
  } catch (error) {
    console.error("[knowledge] Error loading flow rules:", error);
  }

  flowRulesCache = rules;
  return rules;
}

/**
 * Load enriched research rules from structured YAML files
 */
export function loadEnrichedRules(): EnrichedRuleSet[] {
  if (enrichedRulesCache) return enrichedRulesCache;

  const enrichedDir = join(KNOWLEDGE_DIR, "enriched-rules");
  const ruleSets: EnrichedRuleSet[] = [];

  try {
    const files = readdirSync(enrichedDir).filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml")
    );

    for (const file of files) {
      const content = readFileSync(join(enrichedDir, file), "utf-8");
      const parsed = parseYaml(content);

      if (parsed?.rules && Array.isArray(parsed.rules)) {
        ruleSets.push({
          source: parsed.source || file,
          topic: parsed.topic || "",
          rules: parsed.rules.map((r: any) => ({
            trigger: r.trigger || {},
            findings: (r.findings || []).map((f: any) => ({
              id: f.id || "",
              severity: f.severity || "info",
              condition: f.condition || "",
              title: f.title || "",
              evidence: f.evidence || "",
              recommendation: f.recommendation || "",
            })),
          })),
        });
      }
    }
  } catch (error) {
    console.error("[knowledge] Error loading enriched rules:", error);
  }

  enrichedRulesCache = ruleSets;
  return ruleSets;
}

/**
 * Get enriched research findings relevant to a specific flow type and pattern set
 */
export function getEnrichedFindings(
  flowType?: string,
  patternTypes?: string[]
): Array<EnrichedRuleFinding & { source: string }> {
  const ruleSets = loadEnrichedRules();
  const findings: Array<EnrichedRuleFinding & { source: string }> = [];

  for (const ruleSet of ruleSets) {
    for (const rule of ruleSet.rules) {
      let matches = false;

      // Match by flow type
      if (rule.trigger.flow_type && flowType === rule.trigger.flow_type) {
        matches = true;
      }

      // Match by pattern types
      if (
        rule.trigger.pattern_types &&
        patternTypes?.some((p) => rule.trigger.pattern_types!.includes(p))
      ) {
        matches = true;
      }

      if (matches) {
        for (const finding of rule.findings) {
          findings.push({ ...finding, source: ruleSet.source });
        }
      }
    }
  }

  return findings;
}

/**
 * Clear all caches (useful for testing or hot reloading)
 */
export function clearKnowledgeCache(): void {
  rulesCache = null;
  mappingsCache = null;
  flowRulesCache = null;
  enrichedRulesCache = null;
}
