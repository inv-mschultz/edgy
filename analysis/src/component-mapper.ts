/**
 * Component Mapper
 *
 * Enriches findings with shadcn component recommendations
 * based on the component catalog and mapping files.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type { AnalysisFinding, ComponentSuggestion } from "./types.js";

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
 * Enriches findings with component recommendations from the catalog.
 * Falls back to the rule's own recommendations if no mapping exists.
 */
export function mapComponents(
  findings: AnalysisFinding[],
  knowledgeDir: string
): AnalysisFinding[] {
  const mappings = loadMappings(knowledgeDir);

  return findings.map((finding) => {
    // Try to get richer component suggestions from the mappings
    const mapping = mappings.get(finding.category);

    if (mapping) {
      const enrichedComponents: ComponentSuggestion[] = [
        ...mapping.primary.map((m) => ({
          name: `${m.shadcn_id}${m.variant ? ` (${m.variant})` : ""}`,
          shadcn_id: m.shadcn_id,
          variant: m.variant,
          description: m.usage,
        })),
        ...(mapping.supporting || []).map((m) => ({
          name: `${m.shadcn_id}${m.variant ? ` (${m.variant})` : ""}`,
          shadcn_id: m.shadcn_id,
          variant: m.variant,
          description: m.usage,
        })),
      ];

      // Merge: keep rule-specific suggestions, add mapped ones that aren't duplicates
      const existingIds = new Set(
        finding.recommendation.components.map((c) => `${c.shadcn_id}-${c.variant || ""}`)
      );

      const merged = [
        ...finding.recommendation.components,
        ...enrichedComponents.filter(
          (c) => !existingIds.has(`${c.shadcn_id}-${c.variant || ""}`)
        ),
      ];

      return {
        ...finding,
        recommendation: {
          ...finding.recommendation,
          components: merged,
        },
      };
    }

    return finding;
  });
}

function loadMappings(knowledgeDir: string): Map<string, MappingEntry> {
  const mappingsPath = join(knowledgeDir, "components", "component-mappings.yml");
  const mappings = new Map<string, MappingEntry>();

  try {
    const content = readFileSync(mappingsPath, "utf-8");
    const parsed = parseYaml(content);

    if (parsed?.mappings) {
      for (const [category, entry] of Object.entries(parsed.mappings)) {
        mappings.set(category, entry as MappingEntry);
      }
    }
  } catch {
    console.error("[edgy] Warning: Could not load component mappings");
  }

  return mappings;
}
