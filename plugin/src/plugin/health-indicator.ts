/**
 * Health Indicator Badge
 *
 * Creates and manages health indicator badges on analyzed screens.
 */

import type { AnalysisFinding, AnalysisOutput, ScreenResult } from "../ui/lib/types";

// --- Types ---

export interface StoredFindingsData {
  version: 1;
  analyzed_at: string;
  llm_enhanced?: boolean;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
  findings: AnalysisFinding[];
}

// --- Constants ---

const BADGE_PREFIX = "Edgy Health: ";
const REPORT_NAME = "Edgy Report";

// Plugin UI-aligned colors (WCAG AA accessible)
const COLORS = {
  primary: { r: 0.478, g: 0.318, b: 0.906 }, // hsl(262, 83%, 58%) - purple
  background: { r: 1, g: 1, b: 1 },
  foreground: { r: 0.098, g: 0.098, b: 0.098 },
  muted: { r: 0.957, g: 0.957, b: 0.965 },
  mutedForeground: { r: 0.4, g: 0.4, b: 0.42 },
  border: { r: 0.898, g: 0.898, b: 0.914 },
  // Accessible colors with 4.5:1+ contrast ratio on their backgrounds
  critical: { r: 0.7, g: 0.15, b: 0.15 },      // Darker red for text
  criticalBg: { r: 0.98, g: 0.92, b: 0.92 },
  warning: { r: 0.55, g: 0.35, b: 0.0 },       // Darker orange/brown for text
  warningBg: { r: 0.99, g: 0.96, b: 0.88 },
  info: { r: 0.1, g: 0.35, b: 0.7 },           // Darker blue for text
  infoBg: { r: 0.92, g: 0.95, b: 0.99 },
};

// --- Font Loading (cached) ---

let fontsLoaded = false;

async function ensureFontsLoaded(): Promise<void> {
  if (fontsLoaded) return;
  await Promise.all([
    figma.loadFontAsync({ family: "Inter", style: "Bold" }),
    figma.loadFontAsync({ family: "Inter", style: "Semi Bold" }),
    figma.loadFontAsync({ family: "Inter", style: "Medium" }),
    figma.loadFontAsync({ family: "Inter", style: "Regular" }),
  ]);
  fontsLoaded = true;
}

// --- Public API ---

/**
 * Renders a health indicator badge above a screen frame.
 * Positioned at top-right with 16px spacing.
 */
export async function renderHealthIndicator(
  frame: FrameNode,
  data: StoredFindingsData
): Promise<FrameNode> {
  await ensureFontsLoaded();

  // Remove existing badge if present
  removeIndicatorForScreen(frame);

  // Determine styling based on worst severity
  const worst = getWorstSeverity(data);

  // Create badge container
  const badge = figma.createFrame();
  badge.name = `${BADGE_PREFIX}${frame.name}`;
  badge.layoutMode = "HORIZONTAL";
  badge.primaryAxisSizingMode = "AUTO";
  badge.counterAxisSizingMode = "AUTO";
  badge.primaryAxisAlignItems = "CENTER";
  badge.counterAxisAlignItems = "CENTER";
  badge.paddingLeft = 8;
  badge.paddingRight = 10;
  badge.paddingTop = 6;
  badge.paddingBottom = 6;
  badge.itemSpacing = 6;
  badge.cornerRadius = 4;
  badge.fills = [{ type: "SOLID", color: COLORS.background }];
  badge.strokes = [{ type: "SOLID", color: COLORS.border }];
  badge.strokeWeight = 1;

  // Add shadow for depth
  badge.effects = [
    {
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: 0.08 },
      offset: { x: 0, y: 1 },
      radius: 3,
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    },
  ];

  // Create status dot with severity color
  const dotColor = worst === "critical" ? COLORS.critical
    : worst === "warning" ? COLORS.warning
    : worst === "info" ? COLORS.info
    : COLORS.primary;

  const dot = figma.createEllipse();
  dot.name = "status-dot";
  dot.resize(6, 6);
  dot.fills = [{ type: "SOLID", color: dotColor }];
  badge.appendChild(dot);

  // Create text
  const labelText = formatBadgeText(data.summary);
  const text = figma.createText();
  text.name = "label";
  text.fontName = { family: "Inter", style: "Medium" };
  text.fontSize = 11;
  text.characters = labelText;
  text.fills = [{ type: "SOLID", color: COLORS.foreground }];
  badge.appendChild(text);

  // Add to page first
  figma.currentPage.appendChild(badge);

  // Estimate badge dimensions (auto-layout dimensions may not be ready)
  // dot(6) + spacing(6) + text(~6px per char) + paddingLeft(8) + paddingRight(10)
  const estimatedWidth = 8 + 6 + 6 + (labelText.length * 5.5) + 10;
  const estimatedHeight = 6 + 12 + 6; // padding + content

  // Position: top-right of frame (0px right, 20px above)
  badge.x = frame.x + frame.width - estimatedWidth;
  badge.y = frame.y - estimatedHeight - 20;

  // Lock the badge to prevent accidental edits
  badge.locked = true;

  return badge;
}

/**
 * Generates a findings report frame positioned to the left of screens.
 */
export async function generateFindingsReport(
  results: AnalysisOutput,
  screens: FrameNode[]
): Promise<FrameNode> {
  await ensureFontsLoaded();

  // Remove existing report
  const existingReport = figma.currentPage.findOne(
    (n) => n.type === "FRAME" && n.name === REPORT_NAME
  );
  if (existingReport) existingReport.remove();

  // Find leftmost screen position
  const leftmostX = Math.min(...screens.map((s) => s.x));
  const topY = Math.min(...screens.map((s) => s.y));

  // Create report container
  const report = figma.createFrame();
  report.name = REPORT_NAME;
  report.layoutMode = "VERTICAL";
  report.primaryAxisSizingMode = "AUTO";
  report.counterAxisSizingMode = "FIXED";
  report.resize(400, 100); // Fixed width, height will auto-expand
  report.paddingLeft = 24;
  report.paddingRight = 24;
  report.paddingTop = 24;
  report.paddingBottom = 24;
  report.itemSpacing = 16;
  report.cornerRadius = 8;
  report.fills = [{ type: "SOLID", color: COLORS.background }];
  report.strokes = [{ type: "SOLID", color: COLORS.border }];
  report.strokeWeight = 1;
  report.effects = [
    {
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: 0.06 },
      offset: { x: 0, y: 2 },
      radius: 8,
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    },
  ];

  // Header
  const header = figma.createFrame();
  header.name = "header";
  header.layoutMode = "VERTICAL";
  header.primaryAxisSizingMode = "AUTO";
  header.counterAxisSizingMode = "AUTO";
  header.itemSpacing = 4;
  header.fills = [];

  const title = figma.createText();
  title.fontName = { family: "Inter", style: "Bold" };
  title.fontSize = 14;
  title.characters = "EDGY";
  title.fills = [{ type: "SOLID", color: COLORS.primary }];
  header.appendChild(title);

  const subtitle = figma.createText();
  subtitle.fontName = { family: "Inter", style: "Regular" };
  subtitle.fontSize = 11;
  subtitle.characters = `${results.summary.total_findings} edge case${results.summary.total_findings !== 1 ? "s" : ""} found`;
  subtitle.fills = [{ type: "SOLID", color: COLORS.mutedForeground }];
  header.appendChild(subtitle);

  report.appendChild(header);

  // Summary stats row
  const statsRow = figma.createFrame();
  statsRow.name = "stats";
  statsRow.layoutMode = "HORIZONTAL";
  statsRow.primaryAxisSizingMode = "AUTO";
  statsRow.counterAxisSizingMode = "AUTO";
  statsRow.itemSpacing = 12;
  statsRow.fills = [];

  statsRow.appendChild(createStatBadge("Critical", results.summary.critical, COLORS.critical, COLORS.criticalBg));
  statsRow.appendChild(createStatBadge("Warning", results.summary.warning, COLORS.warning, COLORS.warningBg));
  statsRow.appendChild(createStatBadge("Info", results.summary.info, COLORS.info, COLORS.infoBg));

  report.appendChild(statsRow);

  // Divider (stretches to fill width)
  const divider = figma.createFrame();
  divider.name = "divider";
  divider.resize(100, 1);
  divider.layoutAlign = "STRETCH";
  divider.fills = [{ type: "SOLID", color: COLORS.border }];
  report.appendChild(divider);

  // Findings by screen
  for (const screenResult of results.screens) {
    if (screenResult.findings.length === 0) continue;

    const screenSection = createScreenSection(screenResult);
    report.appendChild(screenSection);
  }

  // Flow findings
  if (results.flow_findings.length > 0) {
    const flowSection = figma.createFrame();
    flowSection.name = "flow-findings";
    flowSection.layoutMode = "VERTICAL";
    flowSection.primaryAxisSizingMode = "AUTO";
    flowSection.counterAxisSizingMode = "AUTO";
    flowSection.layoutAlign = "STRETCH";
    flowSection.itemSpacing = 8;
    flowSection.fills = [];

    const flowTitle = figma.createText();
    flowTitle.fontName = { family: "Inter", style: "Semi Bold" };
    flowTitle.fontSize = 11;
    flowTitle.characters = "FLOW-LEVEL";
    flowTitle.fills = [{ type: "SOLID", color: COLORS.mutedForeground }];
    flowSection.appendChild(flowTitle);

    for (const finding of results.flow_findings) {
      flowSection.appendChild(createFindingItem(finding));
    }

    report.appendChild(flowSection);
  }

  // Add to page
  figma.currentPage.appendChild(report);

  // Position: 150px to the left of leftmost screen
  report.x = leftmostX - report.width - 150;
  report.y = topY;

  // Lock the report to prevent accidental edits
  report.locked = true;

  return report;
}

/**
 * Removes the health indicator badge for a screen.
 */
export function removeIndicatorForScreen(frame: FrameNode): void {
  const badge = findIndicatorForScreen(frame);
  if (badge) {
    badge.remove();
  }
}

/**
 * Finds the health indicator badge for a screen.
 */
export function findIndicatorForScreen(frame: FrameNode): FrameNode | null {
  const badgeName = `${BADGE_PREFIX}${frame.name}`;
  const nodes = figma.currentPage.findAll(
    (n) => n.type === "FRAME" && n.name === badgeName
  );
  return (nodes[0] as FrameNode) || null;
}

/**
 * Clears badges and report from canvas.
 */
export function clearAllFindings(frames: FrameNode[]): void {
  for (const frame of frames) {
    removeIndicatorForScreen(frame);
  }
  const report = figma.currentPage.findOne(
    (n) => n.type === "FRAME" && n.name === REPORT_NAME
  );
  if (report) report.remove();
}

/**
 * Clears all Edgy documentation from the canvas (all badges + report).
 * Returns the count of removed items.
 */
export function clearAllCanvasDocumentation(): number {
  let removed = 0;

  // Find and remove all health badges
  const badges = figma.currentPage.findAll(
    (n) => n.type === "FRAME" && n.name.startsWith(BADGE_PREFIX)
  );
  for (const badge of badges) {
    badge.locked = false; // Unlock before removing
    badge.remove();
    removed++;
  }

  // Find and remove report
  const report = figma.currentPage.findOne(
    (n) => n.type === "FRAME" && n.name === REPORT_NAME
  );
  if (report) {
    report.locked = false;
    report.remove();
    removed++;
  }

  return removed;
}

/**
 * Finds a frame by ID on the current page.
 */
export function findFrameById(frameId: string): FrameNode | null {
  const node = figma.currentPage.findOne((n) => n.id === frameId);
  return node?.type === "FRAME" ? node : null;
}

// --- Helpers ---

function getWorstSeverity(
  data: StoredFindingsData
): "critical" | "warning" | "info" | "none" {
  if (data.summary.critical > 0) return "critical";
  if (data.summary.warning > 0) return "warning";
  if (data.summary.info > 0) return "info";
  return "none";
}

function formatBadgeText(summary: StoredFindingsData["summary"]): string {
  if (summary.total === 0) return "No issues";

  const parts: string[] = [];
  if (summary.critical > 0) parts.push(`${summary.critical} critical`);
  if (summary.warning > 0) parts.push(`${summary.warning} warning`);
  if (summary.info > 0) parts.push(`${summary.info} info`);

  return parts.join(", ");
}

function createStatBadge(
  label: string,
  count: number,
  textColor: RGB,
  bgColor: RGB
): FrameNode {
  const badge = figma.createFrame();
  badge.name = label.toLowerCase();
  badge.layoutMode = "HORIZONTAL";
  badge.primaryAxisSizingMode = "AUTO";
  badge.counterAxisSizingMode = "AUTO";
  badge.paddingLeft = 8;
  badge.paddingRight = 8;
  badge.paddingTop = 4;
  badge.paddingBottom = 4;
  badge.itemSpacing = 4;
  badge.cornerRadius = 4;
  badge.fills = [{ type: "SOLID", color: bgColor }];

  const countText = figma.createText();
  countText.fontName = { family: "Inter", style: "Semi Bold" };
  countText.fontSize = 11;
  countText.characters = String(count);
  countText.fills = [{ type: "SOLID", color: textColor }];
  badge.appendChild(countText);

  const labelText = figma.createText();
  labelText.fontName = { family: "Inter", style: "Medium" };
  labelText.fontSize = 11;
  labelText.characters = label;
  labelText.fills = [{ type: "SOLID", color: textColor }];
  badge.appendChild(labelText);

  return badge;
}

function createScreenSection(screenResult: ScreenResult): FrameNode {
  const section = figma.createFrame();
  section.name = `screen-${screenResult.screen_id}`;
  section.layoutMode = "VERTICAL";
  section.primaryAxisSizingMode = "AUTO";
  section.counterAxisSizingMode = "AUTO";
  section.layoutAlign = "STRETCH";
  section.itemSpacing = 12;
  section.fills = [];

  const screenTitle = figma.createText();
  screenTitle.fontName = { family: "Inter", style: "Semi Bold" };
  screenTitle.fontSize = 14;
  screenTitle.lineHeight = { value: 20, unit: "PIXELS" };
  screenTitle.characters = screenResult.name;
  screenTitle.fills = [{ type: "SOLID", color: COLORS.foreground }];
  section.appendChild(screenTitle);

  for (const finding of screenResult.findings) {
    section.appendChild(createFindingItem(finding));
  }

  return section;
}

function createFindingItem(finding: AnalysisFinding | { severity: string; title: string; description: string }): FrameNode {
  const item = figma.createFrame();
  item.name = "finding";
  item.layoutMode = "VERTICAL";
  item.primaryAxisSizingMode = "AUTO";
  item.counterAxisSizingMode = "AUTO";
  item.layoutAlign = "STRETCH";
  item.itemSpacing = 6;
  item.paddingLeft = 16;
  item.paddingRight = 16;
  item.paddingTop = 16;
  item.paddingBottom = 16;
  item.cornerRadius = 6;
  item.fills = [{ type: "SOLID", color: COLORS.background }];
  item.strokes = [{ type: "SOLID", color: COLORS.border }];
  item.strokeWeight = 1;

  // Severity dot color
  const dotColor = finding.severity === "critical" ? COLORS.critical
    : finding.severity === "warning" ? COLORS.warning
    : COLORS.info;

  // Title row with dot and title
  const titleRow = figma.createFrame();
  titleRow.name = "title-row";
  titleRow.layoutMode = "HORIZONTAL";
  titleRow.primaryAxisSizingMode = "AUTO";
  titleRow.counterAxisSizingMode = "AUTO";
  titleRow.layoutAlign = "STRETCH";
  titleRow.counterAxisAlignItems = "CENTER";
  titleRow.itemSpacing = 8;
  titleRow.fills = [];

  const dot = figma.createEllipse();
  dot.name = "dot";
  dot.resize(6, 6);
  dot.fills = [{ type: "SOLID", color: dotColor }];
  titleRow.appendChild(dot);

  const titleText = figma.createText();
  titleText.fontName = { family: "Inter", style: "Medium" };
  titleText.fontSize = 12;
  titleText.lineHeight = { value: 16, unit: "PIXELS" };
  titleText.characters = finding.title;
  titleText.fills = [{ type: "SOLID", color: COLORS.foreground }];
  titleText.layoutGrow = 1;
  titleText.textAutoResize = "HEIGHT";
  titleRow.appendChild(titleText);

  item.appendChild(titleRow);

  // Description (clean up redundant text)
  let description = finding.description;
  description = description.replace(/\s*\(Missing in current screen\)/gi, "");
  description = description.replace(/\s*\(Missing in flow\)/gi, "");
  description = description.trim();

  if (description) {
    const descText = figma.createText();
    descText.fontName = { family: "Inter", style: "Regular" };
    descText.fontSize = 12;
    descText.lineHeight = { value: 16, unit: "PIXELS" };
    descText.characters = description;
    descText.fills = [{ type: "SOLID", color: COLORS.mutedForeground }];
    descText.layoutAlign = "STRETCH";
    descText.textAutoResize = "HEIGHT";
    item.appendChild(descText);
  }

  return item;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}
