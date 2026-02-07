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
 */
export function matchRules(
  patterns: DetectedPattern[],
  rules: Rule[]
): TriggeredRule[] {
  const triggered: TriggeredRule[] = [];

  for (const rule of rules) {
    const matchedNodes: ExtractedNode[] = [];

    // Check component name triggers
    if (rule.triggers.component_names) {
      for (const pattern of patterns) {
        for (const node of pattern.nodes) {
          const nodeName = (node.componentName || node.name).toLowerCase();
          if (
            rule.triggers.component_names.some(
              (name) => nodeName.includes(name.toLowerCase())
            )
          ) {
            matchedNodes.push(node);
          }
        }
      }
    }

    // Check layer name pattern triggers
    if (rule.triggers.layer_name_patterns) {
      for (const pattern of patterns) {
        for (const node of pattern.nodes) {
          for (const regexStr of rule.triggers.layer_name_patterns) {
            try {
              const regex = new RegExp(regexStr, "i");
              if (regex.test(node.name) || (node.textContent && regex.test(node.textContent))) {
                if (!matchedNodes.includes(node)) {
                  matchedNodes.push(node);
                }
              }
            } catch {
              // Invalid regex — skip
            }
          }
        }
      }
    }

    // Check pattern type triggers
    if (rule.triggers.pattern_types) {
      for (const pattern of patterns) {
        if (rule.triggers.pattern_types.includes(pattern.type)) {
          for (const node of pattern.nodes) {
            if (!matchedNodes.includes(node)) {
              matchedNodes.push(node);
            }
          }
        }
      }
    }

    if (matchedNodes.length > 0) {
      triggered.push({ rule, matchedNodes });
    }
  }

  return triggered;
}
