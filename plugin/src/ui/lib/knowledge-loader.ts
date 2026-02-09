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

// Lazy-loaded cache
let cachedRules: Rule[] | null = null;
let cachedMappings: Map<string, MappingEntry> | null = null;
let loadPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (cachedRules && cachedMappings) return;

  if (!loadPromise) {
    loadPromise = (async () => {
      const { rules: ruleModules, componentMappings } = await import("virtual:edgy-knowledge");

      // Parse rules
      const rules: Rule[] = [];
      for (const [fileName, parsed] of Object.entries(ruleModules)) {
        if ((parsed as any)?.rules && Array.isArray((parsed as any).rules)) {
          const category =
            (parsed as any).name?.toLowerCase().replace(/\s+/g, "-") ||
            fileName.replace(/\.ya?ml$/, "");
          for (const rule of (parsed as any).rules) {
            rules.push({
              ...rule,
              category: rule.category || category,
            });
          }
        }
      }
      cachedRules = rules;

      // Parse mappings
      const mappings = new Map<string, MappingEntry>();
      if ((componentMappings as any)?.mappings) {
        for (const [category, entry] of Object.entries((componentMappings as any).mappings)) {
          mappings.set(category, entry as MappingEntry);
        }
      }
      cachedMappings = mappings;
    })();
  }

  await loadPromise;
}

/**
 * Returns all rules from the bundled knowledge base.
 * Lazy-loads the knowledge base on first access.
 */
export async function loadBundledRules(): Promise<Rule[]> {
  await ensureLoaded();
  return cachedRules!;
}

/**
 * Returns component mappings from the bundled knowledge base.
 * Lazy-loads the knowledge base on first access.
 */
export async function loadBundledMappings(): Promise<Map<string, MappingEntry>> {
  await ensureLoaded();
  return cachedMappings!;
}
