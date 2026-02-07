/**
 * Rule Engine
 *
 * Loads YAML rule files and matches them against detected patterns.
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { parse as parseYaml } from "yaml";
import type { Rule, DetectedPattern, TriggeredRule, ExtractedNode } from "./types.js";

/**
 * Loads all rule files from the knowledge/rules/ directory.
 */
export async function loadRules(knowledgeDir: string): Promise<Rule[]> {
  const rulesDir = join(knowledgeDir, "rules");
  const rules: Rule[] = [];

  let files: string[];
  try {
    files = readdirSync(rulesDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  } catch {
    console.error(`[edgy] Warning: Rules directory not found at ${rulesDir}`);
    return rules;
  }

  for (const file of files) {
    try {
      const content = readFileSync(join(rulesDir, file), "utf-8");
      const parsed = parseYaml(content);

      if (parsed?.rules && Array.isArray(parsed.rules)) {
        const category = parsed.name?.toLowerCase().replace(/\s+/g, "-") || file.replace(/\.ya?ml$/, "");
        for (const rule of parsed.rules) {
          rules.push({
            ...rule,
            category: rule.category || category,
          });
        }
      }
    } catch (err) {
      console.error(`[edgy] Warning: Failed to parse rule file ${file}:`, err);
    }
  }

  return rules;
}

/**
 * Matches rules against detected patterns.
 * Returns rules whose trigger conditions are met.
 *
 * When a rule specifies multiple trigger types (component_names,
 * layer_name_patterns, pattern_types), a node must satisfy ALL of
 * them to match (AND logic). This prevents false positives like
 * a "Read more" Button triggering a destructive-action rule.
 */
export function matchRules(
  patterns: DetectedPattern[],
  rules: Rule[]
): TriggeredRule[] {
  const triggered: TriggeredRule[] = [];

  // Collect all unique nodes across all patterns
  const allNodes = new Map<string, ExtractedNode>();
  for (const pattern of patterns) {
    for (const node of pattern.nodes) {
      allNodes.set(node.id, node);
    }
  }

  // Reverse index: node ID → set of pattern types that contain it
  const nodePatternTypes = new Map<string, Set<string>>();
  for (const pattern of patterns) {
    for (const node of pattern.nodes) {
      if (!nodePatternTypes.has(node.id)) {
        nodePatternTypes.set(node.id, new Set());
      }
      nodePatternTypes.get(node.id)!.add(pattern.type);
    }
  }

  for (const rule of rules) {
    const matchedNodes: ExtractedNode[] = [];

    const hasComponentNames =
      rule.triggers.component_names != null &&
      rule.triggers.component_names.length > 0;
    const hasLayerPatterns =
      rule.triggers.layer_name_patterns != null &&
      rule.triggers.layer_name_patterns.length > 0;
    const hasPatternTypes =
      rule.triggers.pattern_types != null &&
      rule.triggers.pattern_types.length > 0;

    for (const node of allNodes.values()) {
      // component_names: vacuously true if not specified
      let passesComponentNames = true;
      if (hasComponentNames) {
        const nodeName = (node.componentName || node.name).toLowerCase();
        passesComponentNames = rule.triggers.component_names!.some((name) =>
          nodeName.includes(name.toLowerCase())
        );
      }

      // layer_name_patterns: vacuously true if not specified
      let passesLayerPatterns = true;
      if (hasLayerPatterns) {
        passesLayerPatterns = rule.triggers.layer_name_patterns!.some(
          (regexStr) => {
            try {
              const regex = new RegExp(stripInlineFlags(regexStr), "i");
              return (
                regex.test(node.name) ||
                (node.textContent ? regex.test(node.textContent) : false)
              );
            } catch {
              return false;
            }
          }
        );
      }

      // pattern_types: vacuously true if not specified
      let passesPatternTypes = true;
      if (hasPatternTypes) {
        const nodeTypes = nodePatternTypes.get(node.id);
        passesPatternTypes = nodeTypes
          ? rule.triggers.pattern_types!.some((pt) => nodeTypes.has(pt))
          : false;
      }

      // Node must satisfy ALL specified trigger conditions
      if (passesComponentNames && passesLayerPatterns && passesPatternTypes) {
        matchedNodes.push(node);
      }
    }

    if (matchedNodes.length > 0) {
      triggered.push({ rule, matchedNodes });
    }
  }

  return triggered;
}

/**
 * Strips inline flag prefixes like (?i) from regex strings.
 * YAML rules use (?i) for case-insensitive matching, but JavaScript
 * doesn't support inline flags — we pass "i" to RegExp() instead.
 */
function stripInlineFlags(pattern: string): string {
  return pattern.replace(/^\(\?[gimsuy]+\)/, "");
}
