import { rules as ruleModules, componentMappings } from "virtual:edgy-knowledge";
import type { Rule } from "@analysis/types";

interface ComponentMapping {
  shadcn_id: string;
  variant?: string;
  usage: string;
}

interface MappingEntry {
  description: string;
  primary: ComponentMapping[];
  supporting?: ComponentMapping[];
}

/**
 * Returns all rules from the bundled knowledge base.
 * Browser-compatible replacement for rule-engine.ts loadRules().
 */
export function loadBundledRules(): Rule[] {
  const rules: Rule[] = [];

  for (const [fileName, parsed] of Object.entries(ruleModules)) {
    if (parsed?.rules && Array.isArray(parsed.rules)) {
      const category =
        parsed.name?.toLowerCase().replace(/\s+/g, "-") ||
        fileName.replace(/\.ya?ml$/, "");
      for (const rule of parsed.rules) {
        rules.push({
          ...rule,
          category: rule.category || category,
        });
      }
    }
  }

  return rules;
}

/**
 * Returns component mappings from the bundled knowledge base.
 * Browser-compatible replacement for component-mapper.ts loadMappings().
 */
export function loadBundledMappings(): Map<string, MappingEntry> {
  const mappings = new Map<string, MappingEntry>();

  if (componentMappings?.mappings) {
    for (const [category, entry] of Object.entries(componentMappings.mappings)) {
      mappings.set(category, entry as MappingEntry);
    }
  }

  return mappings;
}
