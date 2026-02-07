/// <reference types="@figma/plugin-typings" />

import type { AnalysisOutput, AnalysisFinding } from "../ui/lib/types";

const ANNOTATION_OFFSET_X = 80; // px to the right of the screen
const ANNOTATION_WIDTH = 420;
const COLORS = {
  critical: { r: 0.9, g: 0.2, b: 0.2 },
  warning: { r: 0.95, g: 0.7, b: 0.1 },
  info: { r: 0.2, g: 0.5, b: 0.9 },
  background: { r: 0.98, g: 0.98, b: 0.98 },
  text: { r: 0.1, g: 0.1, b: 0.1 },
  muted: { r: 0.5, g: 0.5, b: 0.5 },
};

/**
 * Renders finding annotations next to each analyzed screen
 * and adds highlight overlays on affected areas.
 */
export async function renderFindings(
  results: AnalysisOutput,
  originalFrames: FrameNode[]
): Promise<void> {
  const fontsToLoad = [
    { family: "Inter", style: "Bold" },
    { family: "Inter", style: "Semi Bold" },
    { family: "Inter", style: "Regular" },
  ];
  await Promise.all(fontsToLoad.map((f) => figma.loadFontAsync(f)));

  for (const screenResult of results.screens) {
    const originalFrame = originalFrames.find(
      (f) => f.id === screenResult.screen_id
    );
    if (!originalFrame || screenResult.findings.length === 0) continue;

    // Create annotation frame to the right of the screen
    const annotationFrame = createAnnotationFrame(
      screenResult.name,
      screenResult.findings,
      originalFrame
    );

    // Create highlight overlays on the original screen
    createHighlightOverlays(screenResult.findings, originalFrame);

    // Group the annotation with a connector line
    figma.currentPage.appendChild(annotationFrame);
  }
}

function createAnnotationFrame(
  screenName: string,
  findings: AnalysisFinding[],
  originalFrame: FrameNode
): FrameNode {
  const frame = figma.createFrame();
  frame.name = `Edgy Findings: ${screenName}`;
  frame.x = originalFrame.x + originalFrame.width + ANNOTATION_OFFSET_X;
  frame.y = originalFrame.y;
  frame.resize(ANNOTATION_WIDTH, 100); // Will auto-resize
  frame.fills = [{ type: "SOLID", color: COLORS.background }];
  frame.cornerRadius = 12;
  frame.layoutMode = "VERTICAL";
  frame.paddingTop = 24;
  frame.paddingBottom = 24;
  frame.paddingLeft = 24;
  frame.paddingRight = 24;
  frame.itemSpacing = 16;
  frame.primaryAxisSizingMode = "AUTO";

  // Title
  const title = figma.createText();
  title.characters = `FINDINGS: ${screenName}`;
  title.fontSize = 14;
  title.fontName = { family: "Inter", style: "Bold" };
  title.fills = [{ type: "SOLID", color: COLORS.text }];
  title.layoutAlign = "STRETCH";
  frame.appendChild(title);

  // Group findings by severity
  const grouped = groupBySeverity(findings);

  for (const [severity, items] of Object.entries(grouped)) {
    if (items.length === 0) continue;

    const severityColor = COLORS[severity as keyof typeof COLORS] || COLORS.info;

    // Severity header
    const header = figma.createText();
    header.characters = `${severity.toUpperCase()} (${items.length})`;
    header.fontSize = 12;
    header.fontName = { family: "Inter", style: "Semi Bold" };
    header.fills = [{ type: "SOLID", color: severityColor }];
    header.layoutAlign = "STRETCH";
    frame.appendChild(header);

    // Individual findings
    for (const finding of items) {
      const findingFrame = createFindingEntry(finding);
      frame.appendChild(findingFrame);
    }
  }

  return frame;
}

function createFindingEntry(finding: AnalysisFinding): FrameNode {
  const entry = figma.createFrame();
  entry.name = finding.title;
  entry.layoutMode = "VERTICAL";
  entry.itemSpacing = 4;
  entry.fills = [];
  entry.paddingLeft = 12;
  entry.layoutAlign = "STRETCH";
  entry.primaryAxisSizingMode = "AUTO";

  // Finding title
  const titleText = figma.createText();
  titleText.characters = `• ${finding.title}`;
  titleText.fontSize = 12;
  titleText.fontName = { family: "Inter", style: "Semi Bold" };
  titleText.fills = [{ type: "SOLID", color: COLORS.text }];
  titleText.layoutAlign = "STRETCH";
  entry.appendChild(titleText);

  // Description
  const descText = figma.createText();
  descText.characters = finding.description;
  descText.fontSize = 11;
  descText.fontName = { family: "Inter", style: "Regular" };
  descText.fills = [{ type: "SOLID", color: COLORS.muted }];
  descText.layoutAlign = "STRETCH";
  entry.appendChild(descText);

  // Recommended components
  if (finding.recommendation.components.length > 0) {
    const compText = figma.createText();
    const compNames = finding.recommendation.components.map((c) => c.name).join(", ");
    compText.characters = `→ ${compNames}`;
    compText.fontSize = 11;
    compText.fontName = { family: "Inter", style: "Regular" };
    compText.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.5, b: 0.9 } }];
    compText.layoutAlign = "STRETCH";
    entry.appendChild(compText);
  }

  return entry;
}

function createHighlightOverlays(
  findings: AnalysisFinding[],
  originalFrame: FrameNode
): void {
  const highlightGroup = figma.createFrame();
  highlightGroup.name = "Edgy Highlights";
  highlightGroup.x = originalFrame.x;
  highlightGroup.y = originalFrame.y;
  highlightGroup.resize(originalFrame.width, originalFrame.height);
  highlightGroup.fills = [];
  highlightGroup.clipsContent = false;

  for (const finding of findings) {
    if (!finding.affected_area) continue;

    const color = COLORS[finding.severity] || COLORS.info;
    const overlay = figma.createRectangle();
    overlay.name = `Highlight: ${finding.title}`;
    overlay.x = finding.affected_area.x;
    overlay.y = finding.affected_area.y;
    overlay.resize(finding.affected_area.width, finding.affected_area.height);
    overlay.fills = [{ type: "SOLID", color, opacity: 0.1 }];
    overlay.strokes = [{ type: "SOLID", color }];
    overlay.strokeWeight = 2;
    overlay.dashPattern = [4, 4];
    overlay.cornerRadius = 4;

    highlightGroup.appendChild(overlay);
  }

  figma.currentPage.appendChild(highlightGroup);
}

function groupBySeverity(
  findings: AnalysisFinding[]
): Record<string, AnalysisFinding[]> {
  const grouped: Record<string, AnalysisFinding[]> = {
    critical: [],
    warning: [],
    info: [],
  };

  for (const finding of findings) {
    if (grouped[finding.severity]) {
      grouped[finding.severity].push(finding);
    }
  }

  return grouped;
}
