/**
 * Health Indicator Badge
 *
 * Creates and manages health indicator badges on analyzed screens.
 */

import type { AnalysisFinding, AnalysisOutput, ScreenResult, MissingScreenFinding } from "../ui/lib/types";

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

  // Add to page first, then position
  figma.currentPage.appendChild(badge);

  // Store frame ID for repositioning later
  badge.setPluginData("frame-id", frame.id);

  // Position badge at top-right of frame (0px right, 20px above)
  // Use actual badge dimensions after auto-layout computes them
  // Badge width = paddingLeft(8) + dot(6) + spacing(6) + text + paddingRight(10)
  const textWidth = labelText.length * 6.5; // Approximate character width
  const badgeWidth = 8 + 6 + 6 + textWidth + 10;
  const badgeHeight = 6 + 14 + 6; // padding + content height

  badge.x = frame.x + frame.width - badgeWidth;
  badge.y = frame.y - badgeHeight - 16;

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

    // Create section container
    const section = figma.createFrame();
    section.name = `screen-${screenResult.screen_id}`;
    section.layoutMode = "VERTICAL";
    section.primaryAxisSizingMode = "AUTO";
    section.itemSpacing = 12;
    section.fills = [];

    // Add section to report and set stretch BEFORE adding children
    report.appendChild(section);
    section.layoutAlign = "STRETCH";

    // Screen title
    const screenTitle = figma.createText();
    screenTitle.fontName = { family: "Inter", style: "Semi Bold" };
    screenTitle.fontSize = 14;
    screenTitle.lineHeight = { value: 20, unit: "PIXELS" };
    screenTitle.characters = screenResult.name;
    screenTitle.fills = [{ type: "SOLID", color: COLORS.foreground }];
    section.appendChild(screenTitle);

    // Add findings AFTER section is stretched
    for (const finding of screenResult.findings) {
      const item = createFindingItem(finding);
      section.appendChild(item);
      // Use newer sizing properties: FILL width, HUG height
      item.layoutSizingHorizontal = "FILL";
      item.layoutSizingVertical = "HUG";
    }
  }

  // Flow findings
  if (results.flow_findings.length > 0) {
    const flowSection = figma.createFrame();
    flowSection.name = "flow-findings";
    flowSection.layoutMode = "VERTICAL";
    flowSection.primaryAxisSizingMode = "AUTO";
    flowSection.itemSpacing = 12;
    flowSection.fills = [];

    // Add section to report and set stretch BEFORE adding children
    report.appendChild(flowSection);
    flowSection.layoutAlign = "STRETCH";

    const flowTitle = figma.createText();
    flowTitle.fontName = { family: "Inter", style: "Semi Bold" };
    flowTitle.fontSize = 11;
    flowTitle.characters = "FLOW-LEVEL";
    flowTitle.fills = [{ type: "SOLID", color: COLORS.mutedForeground }];
    flowSection.appendChild(flowTitle);

    // Add findings AFTER section is stretched
    for (const finding of results.flow_findings) {
      const item = createFindingItem(finding);
      flowSection.appendChild(item);
      // Use newer sizing properties: FILL width, HUG height
      item.layoutSizingHorizontal = "FILL";
      item.layoutSizingVertical = "HUG";
    }
  }

  // Missing screen findings
  if (results.missing_screen_findings?.length > 0) {
    const missingSection = figma.createFrame();
    missingSection.name = "missing-screens";
    missingSection.layoutMode = "VERTICAL";
    missingSection.primaryAxisSizingMode = "AUTO";
    missingSection.itemSpacing = 12;
    missingSection.fills = [];

    // Add section to report and set stretch BEFORE adding children
    report.appendChild(missingSection);
    missingSection.layoutAlign = "STRETCH";

    const missingTitle = figma.createText();
    missingTitle.fontName = { family: "Inter", style: "Semi Bold" };
    missingTitle.fontSize = 11;
    missingTitle.characters = "MISSING SCREENS";
    missingTitle.fills = [{ type: "SOLID", color: COLORS.mutedForeground }];
    missingSection.appendChild(missingTitle);

    // Add findings AFTER section is stretched
    for (const finding of results.missing_screen_findings) {
      const item = createFindingItem({
        severity: finding.severity,
        title: finding.missing_screen.name,
        description: `${finding.flow_name}: ${finding.missing_screen.description}`,
      });
      missingSection.appendChild(item);
      // Use newer sizing properties: FILL width, HUG height
      item.layoutSizingHorizontal = "FILL";
      item.layoutSizingVertical = "HUG";
    }
  }

  // Add to page
  figma.currentPage.appendChild(report);

  // Position: 150px to the left of leftmost screen
  report.x = leftmostX - report.width - 150;
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

    // Get badge text to estimate width
    const textNode = badge.findOne((n) => n.type === "TEXT" && n.name === "label") as TextNode;
    const labelText = textNode?.characters || "";
    const textWidth = labelText.length * 6.5;
    const badgeWidth = 8 + 6 + 6 + textWidth + 10;
    const badgeHeight = 6 + 14 + 6;

    // Unlock, reposition, lock
    badge.locked = false;
    badge.x = frame.x + frame.width - badgeWidth;
    badge.y = frame.y - badgeHeight - 16;
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
  item.strokes = [{ type: "SOLID", color: COLORS.border }];
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

// --- Placeholder Frame Generation ---

/**
 * Generates placeholder frames for missing screens.
 */
export async function generatePlaceholderFrames(
  findings: MissingScreenFinding[],
  referenceScreens: FrameNode[]
): Promise<FrameNode[]> {
  await ensureFontsLoaded();

  const placeholders: FrameNode[] = [];

  if (findings.length === 0 || referenceScreens.length === 0) {
    return placeholders;
  }

  // Find rightmost screen to position section after
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

  // Create frames with coordinates relative to section (starting at padding offset)
  const sectionPadding = 50;
  let localX = sectionPadding;

  for (const [, flowFindings] of byFlow) {
    for (const finding of flowFindings) {
      const frame = await createPlaceholderFrame(
        finding,
        localX,
        sectionPadding,
        templateWidth,
        templateHeight
      );
      placeholders.push(frame);
      localX += templateWidth + 50;
    }
    localX += 50; // Extra gap between flows
  }

  // Create a Section to contain all placeholder frames
  if (placeholders.length > 0) {
    const section = figma.createSection();
    section.name = "Suggested Screens";
    section.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.1 }];

    // Position section to the right of existing screens
    section.x = rightmostX + 100;
    section.y = topY;

    // Move all placeholders into the section
    for (const placeholder of placeholders) {
      section.appendChild(placeholder);
    }

    // Resize section to fit content
    const sectionWidth = localX + sectionPadding;
    const sectionHeight = templateHeight + sectionPadding * 2;
    section.resizeWithoutConstraints(sectionWidth, sectionHeight);
  }

  return placeholders;
}

async function createPlaceholderFrame(
  finding: MissingScreenFinding,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = finding.missing_screen.name || "Missing Screen";
  frame.resize(width, height);
  frame.x = x;
  frame.y = y;
  frame.cornerRadius = 8;
  frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }]; // White background

  // Calculate center position
  const centerX = width / 2;
  let currentY = 80;

  // Icon placeholder (rounded square with + symbol)
  const iconSize = 56;
  const iconBg = figma.createFrame();
  iconBg.name = "icon";
  iconBg.resize(iconSize, iconSize);
  iconBg.cornerRadius = 12;
  iconBg.fills = [{ type: "SOLID", color: COLORS.primary, opacity: 0.1 }];
  iconBg.layoutMode = "HORIZONTAL";
  iconBg.primaryAxisSizingMode = "FIXED";
  iconBg.counterAxisSizingMode = "FIXED";
  iconBg.primaryAxisAlignItems = "CENTER";
  iconBg.counterAxisAlignItems = "CENTER";

  const iconText = figma.createText();
  iconText.fontName = { family: "Inter", style: "Bold" };
  iconText.fontSize = 24;
  iconText.characters = "+";
  iconText.fills = [{ type: "SOLID", color: COLORS.primary }];
  iconBg.appendChild(iconText);

  iconBg.x = centerX - iconSize / 2;
  iconBg.y = currentY;
  frame.appendChild(iconBg);
  currentY += iconSize + 24;

  // Title
  const title = figma.createText();
  title.name = "title";
  title.fontName = { family: "Inter", style: "Semi Bold" };
  title.fontSize = 18;
  title.characters = finding.missing_screen.name || "Missing Screen";
  title.fills = [{ type: "SOLID", color: COLORS.foreground }];
  title.textAlignHorizontal = "CENTER";
  title.x = centerX - title.width / 2;
  title.y = currentY;
  frame.appendChild(title);
  currentY += title.height + 12;

  // Description (only add if there's content)
  const descText = finding.missing_screen.description || "";
  if (descText) {
    const desc = figma.createText();
    desc.name = "description";
    desc.fontName = { family: "Inter", style: "Regular" };
    desc.fontSize = 14;
    desc.characters = descText;
    desc.fills = [{ type: "SOLID", color: COLORS.mutedForeground }];
    desc.textAlignHorizontal = "CENTER";
    desc.resize(width - 48, desc.height);
    desc.textAutoResize = "HEIGHT";
    desc.x = 24;
    desc.y = currentY;
    frame.appendChild(desc);
    currentY += desc.height + 24;
  } else {
    currentY += 24;
  }

  // Suggested components section
  if (finding.recommendation.components.length > 0) {
    const label = figma.createText();
    label.name = "components-label";
    label.fontName = { family: "Inter", style: "Medium" };
    label.fontSize = 10;
    label.characters = "SUGGESTED COMPONENTS";
    label.fills = [{ type: "SOLID", color: COLORS.mutedForeground }];
    label.letterSpacing = { value: 0.5, unit: "PIXELS" };
    label.x = centerX - label.width / 2;
    label.y = currentY;
    frame.appendChild(label);
    currentY += label.height + 12;

    // Create component chips row (still use auto-layout for the chips container)
    const chipsRow = figma.createFrame();
    chipsRow.name = "chips";
    chipsRow.layoutMode = "HORIZONTAL";
    chipsRow.primaryAxisSizingMode = "AUTO";
    chipsRow.counterAxisSizingMode = "AUTO";
    chipsRow.itemSpacing = 6;
    chipsRow.fills = [];

    for (const comp of finding.recommendation.components.slice(0, 4)) {
      const chip = figma.createFrame();
      chip.name = comp.shadcn_id;
      chip.layoutMode = "HORIZONTAL";
      chip.primaryAxisSizingMode = "AUTO";
      chip.counterAxisSizingMode = "AUTO";
      chip.paddingLeft = 8;
      chip.paddingRight = 8;
      chip.paddingTop = 4;
      chip.paddingBottom = 4;
      chip.cornerRadius = 4;
      chip.fills = [{ type: "SOLID", color: COLORS.background }];
      chip.strokes = [{ type: "SOLID", color: COLORS.border }];
      chip.strokeWeight = 1;

      const chipText = figma.createText();
      chipText.fontName = { family: "Inter", style: "Medium" };
      chipText.fontSize = 11;
      chipText.characters = comp.label || comp.shadcn_id || "Component";
      chipText.fills = [{ type: "SOLID", color: COLORS.foreground }];
      chip.appendChild(chipText);

      chipsRow.appendChild(chip);
    }

    frame.appendChild(chipsRow);
    // Center the chips row after adding to frame (so we can get its width)
    chipsRow.x = centerX - chipsRow.width / 2;
    chipsRow.y = currentY;
  }

  // Mark as Edgy placeholder for later identification
  frame.setPluginData("edgy-placeholder", "true");
  frame.setPluginData("flow-type", finding.flow_type);
  frame.setPluginData("screen-id", finding.missing_screen.id);

  return frame;
}
