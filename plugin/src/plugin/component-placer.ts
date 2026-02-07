/// <reference types="@figma/plugin-typings" />

import type { AnalysisOutput, ComponentSuggestion } from "../ui/lib/types";

const SUGGESTION_WIDTH = 280;
const SUGGESTION_SPACING = 24;

const COLORS = {
  bg: { r: 0.97, g: 0.97, b: 1 },
  border: { r: 0.8, g: 0.8, b: 0.9 },
  text: { r: 0.1, g: 0.1, b: 0.1 },
  muted: { r: 0.5, g: 0.5, b: 0.5 },
  accent: { r: 0.4, g: 0.3, b: 0.9 },
};

/**
 * Places component suggestion frames on the canvas below the report.
 * Each frame shows a recommended shadcn component with usage context.
 */
export async function placeComponentSuggestions(
  results: AnalysisOutput
): Promise<void> {
  const fontsToLoad = [
    { family: "Inter", style: "Bold" },
    { family: "Inter", style: "Semi Bold" },
    { family: "Inter", style: "Regular" },
  ];
  await Promise.all(fontsToLoad.map((f) => figma.loadFontAsync(f)));

  // Collect unique component suggestions across all findings
  const componentMap = new Map<
    string,
    { suggestion: ComponentSuggestion; usedIn: string[]; categories: Set<string> }
  >();

  for (const screen of results.screens) {
    for (const finding of screen.findings) {
      for (const comp of finding.recommendation.components) {
        const key = `${comp.shadcn_id}-${comp.variant || "default"}`;
        if (!componentMap.has(key)) {
          componentMap.set(key, {
            suggestion: comp,
            usedIn: [],
            categories: new Set(),
          });
        }
        const entry = componentMap.get(key)!;
        if (!entry.usedIn.includes(screen.name)) {
          entry.usedIn.push(screen.name);
        }
        entry.categories.add(finding.category);
      }
    }
  }

  if (componentMap.size === 0) return;

  // Find the report frame to position below it
  const reportFrame = figma.currentPage.findOne(
    (n) => n.name === "Edgy Report — Edge Case Analysis"
  );

  const startX = reportFrame ? reportFrame.x : 0;
  const startY = reportFrame
    ? reportFrame.y + reportFrame.height + 100
    : 2000;

  // Create a container for all suggestions
  const container = figma.createFrame();
  container.name = "Edgy — Recommended Components";
  container.x = startX;
  container.y = startY;
  container.layoutMode = "HORIZONTAL";
  container.itemSpacing = SUGGESTION_SPACING;
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.fills = [];
  container.counterAxisAlignItems = "MIN";

  let index = 0;
  for (const [, entry] of componentMap) {
    const card = createComponentCard(entry.suggestion, entry.usedIn, entry.categories);
    container.appendChild(card);
    index++;
  }

  figma.currentPage.appendChild(container);
}

function createComponentCard(
  suggestion: ComponentSuggestion,
  usedIn: string[],
  categories: Set<string>
): FrameNode {
  const card = figma.createFrame();
  card.name = `Component: ${suggestion.name}`;
  card.resize(SUGGESTION_WIDTH, 100);
  card.layoutMode = "VERTICAL";
  card.itemSpacing = 12;
  card.paddingTop = 20;
  card.paddingBottom = 20;
  card.paddingLeft = 20;
  card.paddingRight = 20;
  card.fills = [{ type: "SOLID", color: COLORS.bg }];
  card.strokes = [{ type: "SOLID", color: COLORS.border }];
  card.strokeWeight = 1;
  card.cornerRadius = 10;
  card.primaryAxisSizingMode = "AUTO";

  // Component icon placeholder
  const iconLabel = figma.createText();
  iconLabel.characters = "📦";
  iconLabel.fontSize = 20;
  iconLabel.fontName = { family: "Inter", style: "Regular" };
  card.appendChild(iconLabel);

  // Component name
  const nameText = figma.createText();
  nameText.characters = suggestion.name;
  nameText.fontSize = 16;
  nameText.fontName = { family: "Inter", style: "Bold" };
  nameText.fills = [{ type: "SOLID", color: COLORS.text }];
  nameText.layoutAlign = "STRETCH";
  card.appendChild(nameText);

  // Description
  const descText = figma.createText();
  descText.characters = suggestion.description;
  descText.fontSize = 12;
  descText.fontName = { family: "Inter", style: "Regular" };
  descText.fills = [{ type: "SOLID", color: COLORS.muted }];
  descText.layoutAlign = "STRETCH";
  card.appendChild(descText);

  // Variant
  if (suggestion.variant) {
    const variantText = figma.createText();
    variantText.characters = `Variant: ${suggestion.variant}`;
    variantText.fontSize = 11;
    variantText.fontName = { family: "Inter", style: "Semi Bold" };
    variantText.fills = [{ type: "SOLID", color: COLORS.accent }];
    variantText.layoutAlign = "STRETCH";
    card.appendChild(variantText);
  }

  // Categories
  const catText = figma.createText();
  catText.characters = `For: ${Array.from(categories).join(", ")}`;
  catText.fontSize = 11;
  catText.fontName = { family: "Inter", style: "Regular" };
  catText.fills = [{ type: "SOLID", color: COLORS.accent }];
  catText.layoutAlign = "STRETCH";
  card.appendChild(catText);

  // Used in screens
  const usedText = figma.createText();
  usedText.characters = `Needed in: ${usedIn.join(", ")}`;
  usedText.fontSize = 11;
  usedText.fontName = { family: "Inter", style: "Regular" };
  usedText.fills = [{ type: "SOLID", color: COLORS.muted }];
  usedText.layoutAlign = "STRETCH";
  card.appendChild(usedText);

  return card;
}
