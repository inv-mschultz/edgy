/**
 * Health Indicator Badge
 *
 * Creates and manages health indicator badges on analyzed screens.
 */

import type { AnalysisFinding, AnalysisOutput, ScreenResult, MissingScreenFinding } from "../ui/lib/types";
import { designScreen, renderGeneratedLayout, type DesignTokens, type GeneratedScreenLayout } from "./screen-designer";
import { extractMultipleFrameContexts, mergeFrameContexts, getAllStoredContexts, type FrameContext, type MergedContext } from "./frame-context";

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
  badge.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
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

  // Add to page first, then position
  figma.currentPage.appendChild(badge);

  // Store frame ID for repositioning later
  badge.setPluginData("frame-id", frame.id);

  // Position badge at top-right of frame, aligned with frame's right edge
  // Use actual badge dimensions after auto-layout computes them
  badge.x = frame.x + frame.width - badge.width;
  badge.y = frame.y - badge.height - 16;

  // Lock the badge to prevent accidental edits
  badge.locked = true;

  return badge;
}

/**
 * Generates a findings report frame positioned to the right of screens.
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

  // Find rightmost screen edge and top position
  const rightmostX = Math.max(...screens.map((s) => s.x + s.width));
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
  report.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
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

  // Group all findings by flow type
  const flowGroups = groupFindingsByFlow(results);

  // Render each flow group
  for (const [flowType, flowGroup] of flowGroups) {
    // Create flow section
    const flowSection = figma.createFrame();
    flowSection.name = `flow-${flowType}`;
    flowSection.layoutMode = "VERTICAL";
    flowSection.primaryAxisSizingMode = "AUTO";
    flowSection.itemSpacing = 12;
    flowSection.fills = [];

    report.appendChild(flowSection);
    flowSection.layoutAlign = "STRETCH";

    // Flow header
    const flowHeader = figma.createText();
    flowHeader.fontName = { family: "Inter", style: "Semi Bold" };
    flowHeader.fontSize = 11;
    flowHeader.characters = formatFlowName(flowType).toUpperCase();
    flowHeader.fills = [{ type: "SOLID", color: COLORS.primary }];
    flowSection.appendChild(flowHeader);

    // Screen findings within this flow
    for (const screenResult of flowGroup.screenFindings) {
      if (screenResult.findings.length === 0) continue;

      // Screen title
      const screenTitle = figma.createText();
      screenTitle.fontName = { family: "Inter", style: "Semi Bold" };
      screenTitle.fontSize = 14;
      screenTitle.lineHeight = { value: 20, unit: "PIXELS" };
      screenTitle.characters = screenResult.name;
      screenTitle.fills = [{ type: "SOLID", color: COLORS.foreground }];
      flowSection.appendChild(screenTitle);

      // Screen findings
      for (const finding of screenResult.findings) {
        const item = createFindingItem(finding);
        flowSection.appendChild(item);
        item.layoutSizingHorizontal = "FILL";
        item.layoutSizingVertical = "HUG";
      }
    }

    // Flow-level findings
    for (const finding of flowGroup.flowFindings) {
      const item = createFindingItem(finding);
      flowSection.appendChild(item);
      item.layoutSizingHorizontal = "FILL";
      item.layoutSizingVertical = "HUG";
    }

    // Missing screens for this flow
    if (flowGroup.missingScreens.length > 0) {
      const missingLabel = figma.createText();
      missingLabel.fontName = { family: "Inter", style: "Medium" };
      missingLabel.fontSize = 11;
      missingLabel.characters = "Missing Screens";
      missingLabel.fills = [{ type: "SOLID", color: COLORS.mutedForeground }];
      flowSection.appendChild(missingLabel);

      for (const finding of flowGroup.missingScreens) {
        const item = createFindingItem({
          severity: finding.severity,
          title: finding.missing_screen.name,
          description: finding.missing_screen.description,
        });
        flowSection.appendChild(item);
        item.layoutSizingHorizontal = "FILL";
        item.layoutSizingVertical = "HUG";
      }
    }

    // Add divider between flow groups (except last one)
    const flowDivider = figma.createFrame();
    flowDivider.name = "flow-divider";
    flowDivider.resize(100, 1);
    flowDivider.layoutAlign = "STRETCH";
    flowDivider.fills = [{ type: "SOLID", color: COLORS.border }];
    report.appendChild(flowDivider);
  }

  // Add to page
  figma.currentPage.appendChild(report);

  // Position: 100px to the right of rightmost screen
  report.x = rightmostX + 100;
  report.y = topY;

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

/**
 * Repositions all health indicator badges to match their frame positions.
 * Call this when frames are moved.
 */
export function repositionAllBadges(): void {
  const badges = figma.currentPage.findAll(
    (n) => n.type === "FRAME" && n.name.startsWith(BADGE_PREFIX)
  ) as FrameNode[];

  for (const badge of badges) {
    const frameId = badge.getPluginData("frame-id");
    if (!frameId) continue;

    const frame = findFrameById(frameId);
    if (!frame) {
      // Frame was deleted, remove the badge
      badge.locked = false;
      badge.remove();
      continue;
    }

    // Unlock, reposition using actual badge dimensions, lock
    badge.locked = false;
    badge.x = frame.x + frame.width - badge.width;
    badge.y = frame.y - badge.height - 16;
    badge.locked = true;
  }
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

function createFindingItem(finding: AnalysisFinding | { severity: string; title: string; description: string }): FrameNode {
  // Determine colors based on severity
  const iconColor = finding.severity === "critical" ? COLORS.critical
    : finding.severity === "warning" ? COLORS.warning
    : COLORS.info;
  const iconBgColor = finding.severity === "critical" ? COLORS.criticalBg
    : finding.severity === "warning" ? COLORS.warningBg
    : COLORS.infoBg;

  // Main container - horizontal flex, align-items: flex-start
  const item = figma.createFrame();
  item.name = "finding";
  item.layoutMode = "HORIZONTAL";
  item.counterAxisAlignItems = "MIN"; // align-items: flex-start
  item.itemSpacing = 12;
  item.paddingLeft = 16;
  item.paddingRight = 16;
  item.paddingTop = 16;
  item.paddingBottom = 16;
  item.cornerRadius = 8;
  item.fills = [{ type: "SOLID", color: COLORS.background }];
  item.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
  item.strokeWeight = 1;

  // Severity icon container (fixed 32x32)
  const iconContainer = figma.createFrame();
  iconContainer.name = "icon";
  iconContainer.layoutMode = "HORIZONTAL";
  iconContainer.primaryAxisSizingMode = "FIXED";
  iconContainer.counterAxisSizingMode = "FIXED";
  iconContainer.resize(32, 32);
  iconContainer.primaryAxisAlignItems = "CENTER";
  iconContainer.counterAxisAlignItems = "CENTER";
  iconContainer.cornerRadius = 6;
  iconContainer.fills = [{ type: "SOLID", color: iconBgColor }];

  // Icon symbol
  const iconSymbol = figma.createText();
  iconSymbol.fontName = { family: "Inter", style: "Bold" };
  iconSymbol.fontSize = 16;
  if (finding.severity === "critical") {
    iconSymbol.characters = "×";
  } else if (finding.severity === "warning") {
    iconSymbol.characters = "!";
  } else {
    iconSymbol.characters = "i";
  }
  iconSymbol.fills = [{ type: "SOLID", color: iconColor }];
  iconContainer.appendChild(iconSymbol);

  item.appendChild(iconContainer);

  // Content column - flex: 1 1 0 (fills remaining width)
  const content = figma.createFrame();
  content.name = "content";
  content.layoutMode = "VERTICAL";
  content.primaryAxisSizingMode = "AUTO";
  content.itemSpacing = 4;
  content.fills = [];

  // Add content to item first, then set layoutGrow
  item.appendChild(content);
  content.layoutGrow = 1; // flex: 1 - fills remaining horizontal space

  // Title text
  const titleText = figma.createText();
  titleText.name = "title";
  titleText.fontName = { family: "Inter", style: "Semi Bold" };
  titleText.fontSize = 13;
  titleText.lineHeight = { value: 18, unit: "PIXELS" };
  titleText.characters = finding.title;
  titleText.fills = [{ type: "SOLID", color: COLORS.foreground }];
  titleText.textAutoResize = "HEIGHT";
  content.appendChild(titleText);
  titleText.layoutAlign = "STRETCH"; // align-self: stretch - after appendChild

  // Description (clean up redundant text)
  let description = finding.description;
  description = description.replace(/\s*\(Missing in current screen\)/gi, "");
  description = description.replace(/\s*\(Missing in flow\)/gi, "");
  description = description.trim();

  if (description) {
    const descText = figma.createText();
    descText.name = "description";
    descText.fontName = { family: "Inter", style: "Regular" };
    descText.fontSize = 12;
    descText.lineHeight = { value: 18, unit: "PIXELS" };
    descText.characters = description;
    descText.fills = [{ type: "SOLID", color: COLORS.mutedForeground }];
    descText.textAutoResize = "HEIGHT";
    content.appendChild(descText);
    descText.layoutAlign = "STRETCH"; // align-self: stretch - after appendChild
  }

  return item;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

// --- Flow Grouping Helpers ---

interface FlowGroup {
  screenFindings: ScreenResult[];
  flowFindings: AnalysisFinding[];
  missingScreens: MissingScreenFinding[];
}

/**
 * Groups all findings by flow type for organized reporting.
 */
function groupFindingsByFlow(results: AnalysisOutput): Map<string, FlowGroup> {
  const groups = new Map<string, FlowGroup>();

  // Helper to get or create a flow group
  const getGroup = (flowType: string): FlowGroup => {
    if (!groups.has(flowType)) {
      groups.set(flowType, {
        screenFindings: [],
        flowFindings: [],
        missingScreens: [],
      });
    }
    return groups.get(flowType)!;
  };

  // Group screen findings by detected flow type
  for (const screen of results.screens) {
    // Determine flow type from screen name or findings
    const flowType = detectFlowTypeFromScreen(screen);
    const group = getGroup(flowType);
    if (screen.findings.length > 0) {
      group.screenFindings.push(screen);
    }
  }

  // Group flow-level findings
  for (const finding of results.flow_findings) {
    // Extract flow type from finding title/description
    const flowType = detectFlowTypeFromFinding(finding);
    const group = getGroup(flowType);
    group.flowFindings.push(finding);
  }

  // Group missing screen findings by their explicit flow_type
  for (const finding of results.missing_screen_findings || []) {
    const group = getGroup(finding.flow_type);
    group.missingScreens.push(finding);
  }

  return groups;
}

/**
 * Detects flow type from screen name patterns.
 */
function detectFlowTypeFromScreen(screen: ScreenResult): string {
  const name = screen.name.toLowerCase();

  if (name.includes("login") || name.includes("signup") || name.includes("sign up") ||
      name.includes("register") || name.includes("auth") || name.includes("password") ||
      name.includes("forgot") || name.includes("reset") || name.includes("verify") ||
      name.includes("2fa") || name.includes("mfa")) {
    return "authentication";
  }
  if (name.includes("cart") || name.includes("checkout") || name.includes("payment") ||
      name.includes("order") || name.includes("shipping") || name.includes("billing")) {
    return "checkout";
  }
  if (name.includes("onboard") || name.includes("welcome") || name.includes("tutorial") ||
      name.includes("intro") || name.includes("getting started") || name.includes("setup")) {
    return "onboarding";
  }
  if (name.includes("search") || name.includes("filter") || name.includes("results") ||
      name.includes("browse")) {
    return "search";
  }
  if (name.includes("setting") || name.includes("preference") || name.includes("config") ||
      name.includes("profile") || name.includes("account")) {
    return "settings";
  }
  if (name.includes("upload") || name.includes("import") || name.includes("attach")) {
    return "upload";
  }
  if (name.includes("create") || name.includes("edit") || name.includes("new") ||
      name.includes("add") || name.includes("delete") || name.includes("list") ||
      name.includes("detail") || name.includes("view")) {
    return "crud";
  }

  return "general";
}

/**
 * Detects flow type from finding content.
 */
function detectFlowTypeFromFinding(finding: AnalysisFinding): string {
  const text = `${finding.title} ${finding.description}`.toLowerCase();

  if (text.includes("login") || text.includes("auth") || text.includes("password") ||
      text.includes("session") || text.includes("signup") || text.includes("register")) {
    return "authentication";
  }
  if (text.includes("cart") || text.includes("checkout") || text.includes("payment") ||
      text.includes("order")) {
    return "checkout";
  }
  if (text.includes("onboard") || text.includes("welcome") || text.includes("tutorial")) {
    return "onboarding";
  }
  if (text.includes("search") || text.includes("filter")) {
    return "search";
  }
  if (text.includes("setting") || text.includes("preference")) {
    return "settings";
  }
  if (text.includes("upload") || text.includes("file")) {
    return "upload";
  }

  return "general";
}

/**
 * Formats flow type into human-readable name.
 */
function formatFlowName(flowType: string): string {
  const names: Record<string, string> = {
    "authentication": "Authentication Flow",
    "checkout": "Checkout Flow",
    "onboarding": "Onboarding Flow",
    "search": "Search Flow",
    "settings": "Settings Flow",
    "upload": "Upload Flow",
    "crud": "Data Management",
    "general": "General",
  };
  return names[flowType] || flowType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// --- Placeholder Frame Generation ---

/**
 * Extracts design tokens from Figma styles, variables, and reference screens.
 */
export async function extractDesignTokens(referenceScreens: FrameNode[]): Promise<DesignTokens> {
  // Initialize semantic colors object to collect all color roles
  const semanticColors: DesignTokens["semanticColors"] = {};
  // Initialize variable bindings to store Figma variable IDs
  const variableBindings: DesignTokens["variableBindings"] = {};

  const tokens: DesignTokens = {
    primaryColor: { r: 0.09, g: 0.09, b: 0.09 },
    backgroundColor: { r: 1, g: 1, b: 1 },
    textColor: { r: 0.09, g: 0.09, b: 0.09 },
    mutedColor: { r: 0.45, g: 0.45, b: 0.45 },
    borderColor: { r: 0.9, g: 0.9, b: 0.9 },
    borderRadius: 8,
    fontFamily: "Inter",
    baseFontSize: 14,
    headingFontSize: 24,
    semanticColors,
    variableBindings,
  };

  // Helper to match semantic color names and optionally store variable ID
  const matchSemanticColor = (nameLower: string, color: RGB, variableId?: string): void => {
    // Primary colors
    if ((nameLower.includes("primary") && nameLower.includes("foreground")) ||
        nameLower === "primary-foreground" || nameLower.endsWith("/primary-foreground")) {
      semanticColors.primaryForeground = color;
      if (variableId) variableBindings.primaryForeground = variableId;
    } else if (nameLower.includes("primary") || nameLower.includes("brand")) {
      tokens.primaryColor = color;
      semanticColors.primary = color;
      if (variableId) variableBindings.primary = variableId;
    }
    // Secondary colors
    else if ((nameLower.includes("secondary") && nameLower.includes("foreground")) ||
             nameLower === "secondary-foreground") {
      semanticColors.secondaryForeground = color;
      if (variableId) variableBindings.secondaryForeground = variableId;
    } else if (nameLower.includes("secondary")) {
      semanticColors.secondary = color;
      if (variableId) variableBindings.secondary = variableId;
    }
    // Destructive colors
    else if ((nameLower.includes("destructive") && nameLower.includes("foreground")) ||
             nameLower === "destructive-foreground") {
      semanticColors.destructiveForeground = color;
      if (variableId) variableBindings.destructiveForeground = variableId;
    } else if (nameLower.includes("destructive") || nameLower.includes("danger") || nameLower.includes("error")) {
      semanticColors.destructive = color;
      if (variableId) variableBindings.destructive = variableId;
    }
    // Muted colors
    else if ((nameLower.includes("muted") && nameLower.includes("foreground")) ||
             nameLower === "muted-foreground") {
      tokens.mutedColor = color;
      semanticColors.mutedForeground = color;
      if (variableId) variableBindings.mutedForeground = variableId;
    } else if (nameLower.includes("muted")) {
      semanticColors.muted = color;
      if (variableId) variableBindings.muted = variableId;
    }
    // Accent colors
    else if ((nameLower.includes("accent") && nameLower.includes("foreground")) ||
             nameLower === "accent-foreground") {
      semanticColors.accentForeground = color;
      if (variableId) variableBindings.accentForeground = variableId;
    } else if (nameLower.includes("accent")) {
      semanticColors.accent = color;
      if (variableId) variableBindings.accent = variableId;
    }
    // Card colors
    else if ((nameLower.includes("card") && nameLower.includes("foreground")) ||
             nameLower === "card-foreground") {
      semanticColors.cardForeground = color;
      if (variableId) variableBindings.cardForeground = variableId;
    } else if (nameLower.includes("card")) {
      semanticColors.card = color;
      if (variableId) variableBindings.card = variableId;
    }
    // Background and foreground
    else if (nameLower.includes("background") || nameLower.includes("bg") || nameLower === "surface") {
      tokens.backgroundColor = color;
      semanticColors.background = color;
      if (variableId) variableBindings.background = variableId;
    } else if (nameLower.includes("foreground") || nameLower === "text") {
      tokens.textColor = color;
      semanticColors.foreground = color;
      if (variableId) variableBindings.foreground = variableId;
    }
    // Border and input
    else if (nameLower.includes("border") || nameLower.includes("stroke")) {
      tokens.borderColor = color;
      semanticColors.border = color;
      if (variableId) variableBindings.border = variableId;
    } else if (nameLower.includes("input")) {
      semanticColors.input = color;
      if (variableId) variableBindings.input = variableId;
    } else if (nameLower.includes("ring") || nameLower.includes("focus")) {
      semanticColors.ring = color;
      if (variableId) variableBindings.ring = variableId;
    }
    // Success colors
    else if ((nameLower.includes("success") && nameLower.includes("foreground")) ||
             nameLower === "success-foreground") {
      semanticColors.successForeground = color;
      if (variableId) variableBindings.successForeground = variableId;
    } else if (nameLower.includes("success")) {
      semanticColors.success = color;
      if (variableId) variableBindings.success = variableId;
    }
  };

  // 1. Try to extract from local color styles
  try {
    const colorStyles = await figma.getLocalPaintStylesAsync();
    for (const style of colorStyles) {
      const nameLower = style.name.toLowerCase().replace(/\//g, "-");
      const paint = style.paints[0];
      if (paint?.type === "SOLID") {
        matchSemanticColor(nameLower, paint.color);
      }
    }
  } catch (e) {
    // Styles not available, continue with other methods
  }

  // 2. Try to extract from local text styles
  try {
    const textStyles = await figma.getLocalTextStylesAsync();
    for (const style of textStyles) {
      const nameLower = style.name.toLowerCase();
      if (nameLower.includes("body") || nameLower.includes("paragraph") || nameLower.includes("base")) {
        tokens.baseFontSize = style.fontSize;
        tokens.fontFamily = style.fontName.family;
      } else if (nameLower.includes("heading") || nameLower.includes("title") || nameLower.includes("h1")) {
        tokens.headingFontSize = style.fontSize;
      }
    }
  } catch (e) {
    // Text styles not available
  }

  // 3. Try to extract from variables (Figma variables API)
  try {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    if (collections && Array.isArray(collections)) {
      // Helper to resolve variable aliases to their final value
      const resolveVariableValue = async (
        value: VariableValue,
        resolvedType: string,
        modeId: string,
        depth: number = 0
      ): Promise<RGB | number | null> => {
        // Prevent infinite recursion
        if (depth > 10) return null;

        // Check if it's a variable alias
        if (typeof value === "object" && value !== null && "type" in value && value.type === "VARIABLE_ALIAS") {
          const aliasValue = value as { type: "VARIABLE_ALIAS"; id: string };
          try {
            const referencedVar = await figma.variables.getVariableByIdAsync(aliasValue.id);
            if (referencedVar && referencedVar.valuesByMode) {
              // Try to get value from the same mode, fall back to first available mode
              const refValue = referencedVar.valuesByMode[modeId] ??
                               Object.values(referencedVar.valuesByMode)[0];
              if (refValue !== undefined) {
                return resolveVariableValue(refValue, referencedVar.resolvedType, modeId, depth + 1);
              }
            }
          } catch {
            return null;
          }
        }

        // Direct value
        if (resolvedType === "COLOR" && typeof value === "object" && "r" in value) {
          return value as RGB;
        }
        if (resolvedType === "FLOAT" && typeof value === "number") {
          return value;
        }

        return null;
      };

      for (const collection of collections) {
        if (!collection || !collection.variableIds || !collection.defaultModeId) continue;

        for (const variableId of collection.variableIds) {
          if (!variableId) continue;

          try {
            const variable = await figma.variables.getVariableByIdAsync(variableId);
            if (!variable || !variable.valuesByMode) continue;

            const nameLower = (variable.name?.toLowerCase() || "").replace(/\//g, "-");
            const modeId = collection.defaultModeId;
            const rawValue = variable.valuesByMode[modeId];

            if (rawValue === undefined || rawValue === null) continue;

            // Resolve the value (handles both direct values and aliases)
            const resolvedValue = await resolveVariableValue(rawValue, variable.resolvedType, modeId);

            if (variable.resolvedType === "COLOR" && resolvedValue && typeof resolvedValue === "object" && "r" in resolvedValue) {
              // Pass the variable ID so we can bind to it later
              matchSemanticColor(nameLower, resolvedValue, variableId);
            } else if (variable.resolvedType === "FLOAT" && typeof resolvedValue === "number") {
              if (nameLower.includes("radius") || nameLower.includes("corner")) {
                // Cap at 32px to avoid pill-shaped frames
                tokens.borderRadius = Math.min(resolvedValue, 32);
              }
            }
          } catch (varError) {
            // Skip this variable if it can't be accessed
            continue;
          }
        }
      }
    }
  } catch (e) {
    // Variables API not available
  }

  // 4. Check stored frame context (extracted during analysis)
  try {
    const storedContexts = getAllStoredContexts();
    const contexts = Object.values(storedContexts);

    if (contexts.length > 0) {
      const merged = mergeFrameContexts(contexts);

      // Use most common font family
      if (tokens.fontFamily === "Inter" && merged.fonts.size > 0) {
        let maxCount = 0;
        for (const [family, info] of merged.fonts) {
          if (info.count > maxCount) {
            maxCount = info.count;
            tokens.fontFamily = family;
          }
        }
      }

      // Use border radius from context (capped to avoid pill shapes)
      if (tokens.borderRadius === 8 && merged.borderRadii.length > 0) {
        tokens.borderRadius = Math.min(merged.borderRadii[0], 32); // Most common, capped
      }

      // Use colors from context (prefer fill colors)
      if (merged.colors.size > 0) {
        for (const [, info] of merged.colors) {
          // Skip very light colors (likely backgrounds) for primary
          const brightness = (info.rgb.r + info.rgb.g + info.rgb.b) / 3;
          if (brightness < 0.9 && info.usage === "fill" && info.count > 2) {
            tokens.primaryColor = info.rgb;
            break;
          }
        }
      }
    }
  } catch (e) {
    // Stored context not available
  }

  // 5. Fallback: analyze reference screens for resolved values
  if (referenceScreens.length > 0) {
    const analyzed = analyzeResolvedValues(referenceScreens);

    // Only use analyzed values if we didn't find styles/variables
    if (tokens.fontFamily === "Inter" && analyzed.fontFamily) {
      tokens.fontFamily = analyzed.fontFamily;
    }
    if (tokens.baseFontSize === 14 && analyzed.baseFontSize) {
      tokens.baseFontSize = analyzed.baseFontSize;
    }
    if (tokens.headingFontSize === 24 && analyzed.headingFontSize) {
      tokens.headingFontSize = analyzed.headingFontSize;
    }
    if (tokens.borderRadius === 8 && analyzed.borderRadius) {
      tokens.borderRadius = Math.min(analyzed.borderRadius, 32); // Cap to avoid pill shapes
    }
  }

  // Log extracted variable bindings
  const bindingCount = Object.keys(variableBindings).length;
  if (bindingCount > 0) {
    console.log(`[edgy] Mapped ${bindingCount} Figma variables:`, Object.keys(variableBindings).join(", "));
  }

  return tokens;
}

interface AnalyzedValues {
  fontFamily?: string;
  baseFontSize?: number;
  headingFontSize?: number;
  borderRadius?: number;
}

/**
 * Analyzes resolved values from reference screens as fallback.
 */
function analyzeResolvedValues(referenceScreens: FrameNode[]): AnalyzedValues {
  const fontSizes: number[] = [];
  const fontFamilies = new Map<string, number>();
  const borderRadii: number[] = [];

  for (const screen of referenceScreens.slice(0, 3)) {
    analyzeNodeResolved(screen, fontSizes, fontFamilies, borderRadii);
  }

  const result: AnalyzedValues = {};

  // Most common font family
  let maxFontCount = 0;
  for (const [family, count] of fontFamilies) {
    if (count > maxFontCount) {
      maxFontCount = count;
      result.fontFamily = family;
    }
  }

  // Font sizes
  if (fontSizes.length > 0) {
    fontSizes.sort((a, b) => a - b);
    result.baseFontSize = fontSizes[Math.floor(fontSizes.length / 2)];
    result.headingFontSize = Math.max(...fontSizes);
  }

  // Border radius
  if (borderRadii.length > 0) {
    borderRadii.sort((a, b) => a - b);
    result.borderRadius = borderRadii[Math.floor(borderRadii.length / 2)];
  }

  return result;
}

function analyzeNodeResolved(
  node: SceneNode,
  fontSizes: number[],
  fontFamilies: Map<string, number>,
  borderRadii: number[]
): void {
  // Analyze text (using resolved/computed values)
  if (node.type === "TEXT") {
    const fontSize = node.fontSize;
    if (typeof fontSize === "number") {
      fontSizes.push(fontSize);
    }
    const fontName = node.fontName;
    if (fontName && typeof fontName === "object" && "family" in fontName) {
      const family = fontName.family;
      fontFamilies.set(family, (fontFamilies.get(family) || 0) + 1);
    }
  }

  // Analyze border radius (only collect reasonable values, skip pill shapes)
  if ("cornerRadius" in node && typeof node.cornerRadius === "number" && node.cornerRadius > 0 && node.cornerRadius <= 32) {
    borderRadii.push(node.cornerRadius);
  }

  // Recurse into children
  if ("children" in node) {
    for (const child of node.children) {
      analyzeNodeResolved(child, fontSizes, fontFamilies, borderRadii);
    }
  }
}

/**
 * Generates placeholder frames for missing screens.
 * Creates individual sections per flow type for better organization.
 * If generatedLayouts is provided, uses AI-generated layouts instead of templates.
 */
export async function generatePlaceholderFrames(
  findings: MissingScreenFinding[],
  referenceScreens: FrameNode[],
  generatedLayouts?: Record<string, { name: string; width: number; height: number; backgroundColor: RGB; elements: unknown[] }>,
  onProgress?: (currentIndex: number, totalCount: number, screenName: string) => void
): Promise<FrameNode[]> {
  await ensureFontsLoaded();

  const placeholders: FrameNode[] = [];

  if (findings.length === 0 || referenceScreens.length === 0) {
    return placeholders;
  }

  // Extract design tokens from Figma styles, variables, and reference screens
  const designTokens = await extractDesignTokens(referenceScreens);

  // Find rightmost screen to position sections after
  const rightmostX = Math.max(...referenceScreens.map((s) => s.x + s.width));
  const topY = Math.min(...referenceScreens.map((s) => s.y));

  // Use first screen dimensions as template
  const templateWidth = referenceScreens[0]?.width || 375;
  const templateHeight = referenceScreens[0]?.height || 812;

  // Group findings by flow type
  const byFlow = new Map<string, MissingScreenFinding[]>();
  for (const finding of findings) {
    const key = finding.flow_type;
    if (!byFlow.has(key)) byFlow.set(key, []);
    byFlow.get(key)!.push(finding);
  }

  // Layout constants
  const sectionPadding = 60;
  const screenGap = 50;
  const sectionGap = 80; // Gap between flow sections
  const reportWidth = 400; // Width of the Edgy report
  const gapAfterScreens = 100;
  const gapAfterReport = 100;

  // Position sections after the report (which is placed after screens)
  let currentSectionX = rightmostX + gapAfterScreens + reportWidth + gapAfterReport;

  // Track overall progress across all flow groups
  let currentScreenIndex = 0;
  const totalScreens = findings.length;

  // Create individual section for each flow type
  for (const [flowType, flowFindings] of byFlow) {
    const section = figma.createSection();
    section.name = `${formatFlowName(flowType)} - Suggested Screens`;
    section.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.1 }];

    // Position section
    section.x = currentSectionX;
    section.y = topY;

    // Calculate section width based on number of screens
    const sectionWidth = sectionPadding * 2 + flowFindings.length * templateWidth + (flowFindings.length - 1) * screenGap;
    const sectionHeight = templateHeight + sectionPadding * 2;
    section.resizeWithoutConstraints(sectionWidth, sectionHeight);

    // Create frames within section
    let localX = sectionPadding;

    for (const finding of flowFindings) {
      // Report progress before creating each screen
      currentScreenIndex++;
      if (onProgress) {
        onProgress(currentScreenIndex, totalScreens, finding.missing_screen.name);
      }

      // Check if we have an AI-generated layout for this finding
      const generatedLayout = generatedLayouts?.[finding.id];

      // Create frame with design tokens applied and reference screens for component cloning
      const frame = await createPlaceholderFrame(
        finding,
        localX,
        sectionPadding,
        templateWidth,
        templateHeight,
        referenceScreens,
        designTokens,
        generatedLayout
      );

      // Add frame to section
      section.appendChild(frame);
      placeholders.push(frame);

      localX += templateWidth + screenGap;
    }

    // Move to next section position
    currentSectionX += sectionWidth + sectionGap;
  }

  return placeholders;
}

async function createPlaceholderFrame(
  finding: MissingScreenFinding,
  x: number,
  y: number,
  width: number,
  height: number,
  referenceScreens: FrameNode[],
  designTokens?: DesignTokens,
  generatedLayout?: GeneratedScreenLayout
): Promise<FrameNode> {
  let frame: FrameNode;

  // Use AI-generated layout if available, otherwise fall back to template
  if (generatedLayout) {
    frame = await renderGeneratedLayout(generatedLayout, designTokens);
    // Resize to match template dimensions if needed
    if (frame.width !== width || frame.height !== height) {
      frame.resize(width, height);
    }
  } else {
    // Use the screen designer with component cloning from existing screens
    frame = await designScreen(finding, width, height, designTokens, referenceScreens);
  }

  // Position the frame
  frame.x = x;
  frame.y = y;

  // Screen frames should have no border radius for proper mobile app appearance
  frame.cornerRadius = 0;

  // Mark as Edgy placeholder for later identification
  frame.setPluginData("edgy-placeholder", "true");
  frame.setPluginData("flow-type", finding.flow_type);
  frame.setPluginData("screen-id", finding.missing_screen.id);
  if (generatedLayout) {
    frame.setPluginData("edgy-ai-generated", "true");
  }

  return frame;
}
