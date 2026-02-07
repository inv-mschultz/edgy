/// <reference types="@figma/plugin-typings" />

import type { AnalysisOutput, AnalysisFinding } from "../ui/lib/types";

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

/**
 * Attaches Figma annotations to the affected nodes for each finding.
 * Falls back to annotating the screen frame if a node can't be found.
 */
export async function renderFindings(
  results: AnalysisOutput,
  originalFrames: FrameNode[]
): Promise<void> {
  // Set up annotation categories for each severity level
  const categories = await getOrCreateCategories();

  for (const screenResult of results.screens) {
    const originalFrame = originalFrames.find(
      (f) => f.id === screenResult.screen_id
    );
    if (!originalFrame || screenResult.findings.length === 0) continue;

    for (const finding of screenResult.findings) {
      const categoryId = categories[finding.severity];
      const label = formatAnnotationLabel(finding);

      const newAnnotation = {
        labelMarkdown: label,
        ...(categoryId ? { categoryId } : {}),
      };

      // Try to annotate the first affected node directly
      let annotated = false;
      for (const nodeId of finding.affected_nodes) {
        const node = await figma.getNodeByIdAsync(nodeId);
        if (node && "annotations" in node) {
          const target = node as SceneNode & { annotations: any[] };
          target.annotations = [
            ...sanitizeAnnotations(target.annotations),
            newAnnotation,
          ];
          annotated = true;
          break;
        }
      }

      // Fall back to the screen frame itself
      if (!annotated) {
        originalFrame.annotations = [
          ...sanitizeAnnotations(originalFrame.annotations),
          newAnnotation,
        ];
      }
    }
  }
}

/**
 * Sanitizes annotations read from a node so they can be re-set.
 * Figma may return both `label` and `labelMarkdown` on read,
 * but rejects annotations that have both when written back.
 */
function sanitizeAnnotations(annotations: readonly any[]): any[] {
  return annotations.map((a) => {
    const clean: any = {};
    if (a.labelMarkdown) {
      clean.labelMarkdown = a.labelMarkdown;
    } else if (a.label) {
      clean.label = a.label;
    }
    if (a.properties) clean.properties = a.properties;
    if (a.categoryId) clean.categoryId = a.categoryId;
    return clean;
  });
}

function formatAnnotationLabel(finding: AnalysisFinding): string {
  const severity = SEVERITY_LABELS[finding.severity] || finding.severity;
  const components = finding.recommendation.components
    .map((c) => c.name)
    .join(", ");

  let md = `**${severity}: ${finding.title}**\n\n${finding.description}`;

  if (finding.recommendation.message) {
    md += `\n\n${finding.recommendation.message}`;
  }

  if (components) {
    md += `\n\n*Suggested:* ${components}`;
  }

  return md;
}

/**
 * Creates annotation categories for critical/warning/info if they don't exist.
 * Returns a map of severity → categoryId.
 */
async function getOrCreateCategories(): Promise<Record<string, string | undefined>> {
  const result: Record<string, string | undefined> = {};

  try {
    const existing = await figma.annotations.getAnnotationCategoriesAsync();

    // Check if our categories already exist
    for (const cat of existing) {
      if (cat.label === "Edgy: Critical") result.critical = cat.id;
      if (cat.label === "Edgy: Warning") result.warning = cat.id;
      if (cat.label === "Edgy: Info") result.info = cat.id;
    }

    // Create missing categories
    if (!result.critical) {
      const cat = await figma.annotations.createAnnotationCategoryAsync({
        label: "Edgy: Critical",
        color: "RED",
      });
      result.critical = cat.id;
    }
    if (!result.warning) {
      const cat = await figma.annotations.createAnnotationCategoryAsync({
        label: "Edgy: Warning",
        color: "YELLOW",
      });
      result.warning = cat.id;
    }
    if (!result.info) {
      const cat = await figma.annotations.createAnnotationCategoryAsync({
        label: "Edgy: Info",
        color: "BLUE",
      });
      result.info = cat.id;
    }
  } catch {
    // Annotation categories may not be available — proceed without them
  }

  return result;
}
