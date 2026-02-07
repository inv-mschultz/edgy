/// <reference types="@figma/plugin-typings" />

import type { AnalysisOutput } from "../ui/lib/types";

const REPORT_WIDTH = 900;
const REPORT_OFFSET_Y = 200; // Below the lowest screen

const COLORS = {
  bg: { r: 1, g: 1, b: 1 },
  text: { r: 0.1, g: 0.1, b: 0.1 },
  muted: { r: 0.5, g: 0.5, b: 0.5 },
  critical: { r: 0.9, g: 0.2, b: 0.2 },
  warning: { r: 0.95, g: 0.7, b: 0.1 },
  info: { r: 0.2, g: 0.5, b: 0.9 },
  accent: { r: 0.4, g: 0.3, b: 0.9 },
  cardBg: { r: 0.97, g: 0.97, b: 0.98 },
};

/**
 * Generates a summary report frame placed below the analyzed screens.
 */
export async function generateReport(
  results: AnalysisOutput,
  originalFrames: FrameNode[]
): Promise<FrameNode> {
  const fontsToLoad = [
    { family: "Inter", style: "Bold" },
    { family: "Inter", style: "Semi Bold" },
    { family: "Inter", style: "Regular" },
    { family: "Inter", style: "Medium" },
  ];
  await Promise.all(fontsToLoad.map((f) => figma.loadFontAsync(f)));

  // Position below the lowest screen
  const lowestY = Math.max(...originalFrames.map((f) => f.y + f.height));
  const leftX = Math.min(...originalFrames.map((f) => f.x));

  const report = figma.createFrame();
  report.name = "Edgy Report — Edge Case Analysis";
  report.x = leftX;
  report.y = lowestY + REPORT_OFFSET_Y;
  report.resize(REPORT_WIDTH, 100);
  report.fills = [{ type: "SOLID", color: COLORS.bg }];
  report.cornerRadius = 16;
  report.layoutMode = "VERTICAL";
  report.paddingTop = 40;
  report.paddingBottom = 40;
  report.paddingLeft = 40;
  report.paddingRight = 40;
  report.itemSpacing = 32;
  report.primaryAxisSizingMode = "AUTO";
  report.strokeWeight = 1;
  report.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];

  // --- Header ---
  const headerSection = createAutoLayoutFrame("Header", "VERTICAL", 8);
  headerSection.layoutAlign = "STRETCH";

  const brandText = createText("EDGY", 11, "Bold", COLORS.accent);
  brandText.letterSpacing = { value: 2, unit: "PIXELS" };
  headerSection.appendChild(brandText);

  const titleText = createText("Edge Case Analysis Report", 28, "Bold", COLORS.text);
  titleText.layoutAlign = "STRETCH";
  headerSection.appendChild(titleText);

  const metaText = createText(
    `${results.summary.screens_analyzed} screens analyzed · ${new Date(results.completed_at).toLocaleDateString()}`,
    13,
    "Regular",
    COLORS.muted
  );
  headerSection.appendChild(metaText);

  report.appendChild(headerSection);

  // --- Summary Cards ---
  const cardsRow = createAutoLayoutFrame("Summary Cards", "HORIZONTAL", 16);
  cardsRow.layoutAlign = "STRETCH";

  cardsRow.appendChild(createStatCard("Total Findings", results.summary.total_findings, COLORS.text));
  cardsRow.appendChild(createStatCard("Critical", results.summary.critical, COLORS.critical));
  cardsRow.appendChild(createStatCard("Warning", results.summary.warning, COLORS.warning));
  cardsRow.appendChild(createStatCard("Info", results.summary.info, COLORS.info));

  report.appendChild(cardsRow);

  // --- Per-Screen Breakdown ---
  const breakdownSection = createAutoLayoutFrame("Screen Breakdown", "VERTICAL", 16);
  breakdownSection.layoutAlign = "STRETCH";

  const breakdownTitle = createText("Screen Breakdown", 18, "Semi Bold", COLORS.text);
  breakdownSection.appendChild(breakdownTitle);

  for (const screen of results.screens) {
    if (screen.findings.length === 0) continue;

    const screenCard = createAutoLayoutFrame(`Screen: ${screen.name}`, "VERTICAL", 8);
    screenCard.fills = [{ type: "SOLID", color: COLORS.cardBg }];
    screenCard.cornerRadius = 8;
    screenCard.paddingTop = 16;
    screenCard.paddingBottom = 16;
    screenCard.paddingLeft = 16;
    screenCard.paddingRight = 16;
    screenCard.layoutAlign = "STRETCH";

    const screenHeader = createText(
      `${screen.name} — ${screen.findings.length} finding(s)`,
      14,
      "Semi Bold",
      COLORS.text
    );
    screenHeader.layoutAlign = "STRETCH";
    screenCard.appendChild(screenHeader);

    // Separate element-specific findings (compact) from screen-level findings (detailed)
    const elementFindings = screen.findings.filter((f) => f.annotation_target === "element");
    const screenFindings = screen.findings.filter((f) => f.annotation_target !== "element");

    // Element findings: compact bullet (they have annotations on-canvas)
    for (const finding of elementFindings) {
      const severityColor = COLORS[finding.severity] || COLORS.info;
      const findingText = createText(
        `• [${finding.severity.toUpperCase()}] ${finding.title}  ← see annotation`,
        12,
        "Regular",
        severityColor
      );
      findingText.layoutAlign = "STRETCH";
      screenCard.appendChild(findingText);
    }

    // Screen findings: full detail (no annotation, report is the only place they appear)
    for (const finding of screenFindings) {
      const severityColor = COLORS[finding.severity] || COLORS.info;

      const findingBlock = createAutoLayoutFrame(`Finding: ${finding.title}`, "VERTICAL", 4);
      findingBlock.layoutAlign = "STRETCH";
      findingBlock.paddingTop = 8;
      findingBlock.paddingBottom = 8;
      findingBlock.paddingLeft = 12;
      findingBlock.paddingRight = 12;
      findingBlock.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      findingBlock.cornerRadius = 6;

      const titleLine = createText(
        `[${finding.severity.toUpperCase()}] ${finding.title}`,
        13,
        "Semi Bold",
        severityColor
      );
      titleLine.layoutAlign = "STRETCH";
      findingBlock.appendChild(titleLine);

      const descText = createText(finding.description, 11, "Regular", COLORS.text);
      descText.layoutAlign = "STRETCH";
      findingBlock.appendChild(descText);

      if (finding.recommendation.message) {
        const recoText = createText(
          `→ ${finding.recommendation.message}`,
          11,
          "Medium",
          COLORS.accent
        );
        recoText.layoutAlign = "STRETCH";
        findingBlock.appendChild(recoText);
      }

      if (finding.recommendation.components.length > 0) {
        const componentNames = finding.recommendation.components
          .map((c) => c.name)
          .join(", ");
        const compText = createText(
          `Suggested: ${componentNames}`,
          10,
          "Regular",
          COLORS.muted
        );
        compText.layoutAlign = "STRETCH";
        findingBlock.appendChild(compText);
      }

      screenCard.appendChild(findingBlock);
    }

    breakdownSection.appendChild(screenCard);
  }

  report.appendChild(breakdownSection);

  // --- Flow-Level Findings ---
  if (results.flow_findings.length > 0) {
    const flowSection = createAutoLayoutFrame("Flow Findings", "VERTICAL", 12);
    flowSection.layoutAlign = "STRETCH";

    const flowTitle = createText("Flow-Level Findings", 18, "Semi Bold", COLORS.text);
    flowSection.appendChild(flowTitle);

    for (const finding of results.flow_findings) {
      const findingText = createText(
        `• [${finding.severity.toUpperCase()}] ${finding.title}: ${finding.description}`,
        12,
        "Regular",
        COLORS.text
      );
      findingText.layoutAlign = "STRETCH";
      flowSection.appendChild(findingText);
    }

    report.appendChild(flowSection);
  }

  // --- Footer ---
  const footer = createText(
    "Generated by Edgy · Edge Case Analysis Plugin",
    11,
    "Regular",
    COLORS.muted
  );
  report.appendChild(footer);

  figma.currentPage.appendChild(report);
  return report;
}

// --- Helpers ---

function createAutoLayoutFrame(
  name: string,
  direction: "HORIZONTAL" | "VERTICAL",
  spacing: number
): FrameNode {
  const frame = figma.createFrame();
  frame.name = name;
  frame.layoutMode = direction;
  frame.itemSpacing = spacing;
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.fills = [];
  return frame;
}

function createStatCard(
  label: string,
  value: number,
  color: RGB
): FrameNode {
  const card = figma.createFrame();
  card.name = `Stat: ${label}`;
  card.layoutMode = "VERTICAL";
  card.itemSpacing = 4;
  card.paddingTop = 16;
  card.paddingBottom = 16;
  card.paddingLeft = 20;
  card.paddingRight = 20;
  card.fills = [{ type: "SOLID", color: COLORS.cardBg }];
  card.cornerRadius = 8;
  card.layoutGrow = 1;
  card.primaryAxisSizingMode = "AUTO";

  const valueText = createText(String(value), 32, "Bold", color);
  card.appendChild(valueText);

  const labelText = createText(label, 12, "Medium", COLORS.muted);
  card.appendChild(labelText);

  return card;
}

function createText(
  content: string,
  size: number,
  style: "Bold" | "Semi Bold" | "Medium" | "Regular",
  color: RGB
): TextNode {
  const text = figma.createText();
  text.characters = content;
  text.fontSize = size;
  text.fontName = { family: "Inter", style };
  text.fills = [{ type: "SOLID", color }];
  return text;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}
