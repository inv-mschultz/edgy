/**
 * Component Renderer
 *
 * Renders visual representations of shadcn components in Figma.
 */

import type { ComponentSuggestion } from "../ui/lib/types";

// --- Types ---

interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Semantic color tokens for component rendering.
 * All colors are optional - defaults will be used if not provided.
 */
export interface ColorTokens {
  background?: RGB;
  foreground?: RGB;
  muted?: RGB;
  mutedForeground?: RGB;
  primary?: RGB;
  primaryForeground?: RGB;
  secondary?: RGB;
  secondaryForeground?: RGB;
  destructive?: RGB;
  destructiveForeground?: RGB;
  border?: RGB;
  input?: RGB;
  ring?: RGB;
  accent?: RGB;
  accentForeground?: RGB;
  card?: RGB;
  cardForeground?: RGB;
}

// --- Default Colors (shadcn/ui design system fallback) ---

const DEFAULT_COLORS: Required<ColorTokens> = {
  // Base
  background: { r: 1, g: 1, b: 1 },
  foreground: { r: 0.09, g: 0.09, b: 0.09 },

  // Muted
  muted: { r: 0.96, g: 0.96, b: 0.96 },
  mutedForeground: { r: 0.45, g: 0.45, b: 0.45 },

  // Primary
  primary: { r: 0.09, g: 0.09, b: 0.09 },
  primaryForeground: { r: 1, g: 1, b: 1 },

  // Secondary
  secondary: { r: 0.96, g: 0.96, b: 0.96 },
  secondaryForeground: { r: 0.09, g: 0.09, b: 0.09 },

  // Destructive
  destructive: { r: 0.94, g: 0.27, b: 0.27 },
  destructiveForeground: { r: 1, g: 1, b: 1 },

  // Border
  border: { r: 0.9, g: 0.9, b: 0.9 },
  input: { r: 0.9, g: 0.9, b: 0.9 },

  // Ring (focus)
  ring: { r: 0.09, g: 0.09, b: 0.09 },

  // Accent
  accent: { r: 0.96, g: 0.96, b: 0.96 },
  accentForeground: { r: 0.09, g: 0.09, b: 0.09 },

  // Card
  card: { r: 1, g: 1, b: 1 },
  cardForeground: { r: 0.09, g: 0.09, b: 0.09 },
};

/**
 * Sanitize a color to only include r, g, b (removes alpha if present).
 * LLM/design tokens may include RGBA colors, but Figma only accepts RGB.
 */
function sanitizeColor(color: RGB | { r: number; g: number; b: number; a?: number }): RGB {
  return {
    r: Math.max(0, Math.min(1, color.r)),
    g: Math.max(0, Math.min(1, color.g)),
    b: Math.max(0, Math.min(1, color.b)),
  };
}

/**
 * Merge provided tokens with defaults and sanitize all colors.
 */
function resolveColors(tokens?: ColorTokens): Required<ColorTokens> {
  if (!tokens) return DEFAULT_COLORS;
  return {
    background: sanitizeColor(tokens.background ?? DEFAULT_COLORS.background),
    foreground: sanitizeColor(tokens.foreground ?? DEFAULT_COLORS.foreground),
    muted: sanitizeColor(tokens.muted ?? DEFAULT_COLORS.muted),
    mutedForeground: sanitizeColor(tokens.mutedForeground ?? DEFAULT_COLORS.mutedForeground),
    primary: sanitizeColor(tokens.primary ?? DEFAULT_COLORS.primary),
    primaryForeground: sanitizeColor(tokens.primaryForeground ?? DEFAULT_COLORS.primaryForeground),
    secondary: sanitizeColor(tokens.secondary ?? DEFAULT_COLORS.secondary),
    secondaryForeground: sanitizeColor(tokens.secondaryForeground ?? DEFAULT_COLORS.secondaryForeground),
    destructive: sanitizeColor(tokens.destructive ?? DEFAULT_COLORS.destructive),
    destructiveForeground: sanitizeColor(tokens.destructiveForeground ?? DEFAULT_COLORS.destructiveForeground),
    border: sanitizeColor(tokens.border ?? DEFAULT_COLORS.border),
    input: sanitizeColor(tokens.input ?? DEFAULT_COLORS.input),
    ring: sanitizeColor(tokens.ring ?? DEFAULT_COLORS.ring),
    accent: sanitizeColor(tokens.accent ?? DEFAULT_COLORS.accent),
    accentForeground: sanitizeColor(tokens.accentForeground ?? DEFAULT_COLORS.accentForeground),
    card: sanitizeColor(tokens.card ?? DEFAULT_COLORS.card),
    cardForeground: sanitizeColor(tokens.cardForeground ?? DEFAULT_COLORS.cardForeground),
  };
}

// --- Font Loading ---

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

// --- Main Renderer ---

export interface RenderOptions {
  x: number;
  y: number;
  maxWidth: number;
  tokens?: ColorTokens;
}

/**
 * Renders a collection of components in a vertical stack layout.
 * Returns the rendered frame and its height.
 */
export async function renderComponentStack(
  components: ComponentSuggestion[],
  parent: FrameNode,
  options: RenderOptions
): Promise<{ frame: FrameNode; height: number }> {
  await ensureFontsLoaded();

  const colors = resolveColors(options.tokens);

  const container = figma.createFrame();
  container.name = "components";
  container.layoutMode = "VERTICAL";
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "FIXED";
  container.resize(options.maxWidth, 100);
  container.itemSpacing = 12;
  container.fills = [];

  // Group components by type for better layout
  const grouped = groupComponents(components);

  // Render form inputs together
  if (grouped.inputs.length > 0) {
    const inputsFrame = await renderInputGroup(grouped.inputs, options.maxWidth, colors);
    container.appendChild(inputsFrame);
  }

  // Render buttons in a row
  if (grouped.buttons.length > 0) {
    const buttonsFrame = await renderButtonRow(grouped.buttons, options.maxWidth, colors);
    container.appendChild(buttonsFrame);
  }

  // Render cards
  for (const card of grouped.cards) {
    const cardFrame = await renderCard(card, options.maxWidth, colors);
    container.appendChild(cardFrame);
  }

  // Render other components
  for (const comp of grouped.other) {
    const compFrame = await renderGenericComponent(comp, options.maxWidth, colors);
    container.appendChild(compFrame);
  }

  container.x = options.x;
  container.y = options.y;
  parent.appendChild(container);

  return { frame: container, height: container.height };
}

// --- Component Grouping ---

interface GroupedComponents {
  inputs: ComponentSuggestion[];
  buttons: ComponentSuggestion[];
  cards: ComponentSuggestion[];
  other: ComponentSuggestion[];
}

function groupComponents(components: ComponentSuggestion[]): GroupedComponents {
  const grouped: GroupedComponents = {
    inputs: [],
    buttons: [],
    cards: [],
    other: [],
  };

  for (const comp of components) {
    const id = comp.shadcn_id.toLowerCase();
    if (["input", "textarea", "select", "checkbox", "switch", "slider"].includes(id)) {
      grouped.inputs.push(comp);
    } else if (id === "button") {
      grouped.buttons.push(comp);
    } else if (["card", "alert-dialog", "dialog"].includes(id)) {
      grouped.cards.push(comp);
    } else {
      grouped.other.push(comp);
    }
  }

  return grouped;
}

// --- Input Group Renderer ---

async function renderInputGroup(inputs: ComponentSuggestion[], maxWidth: number, colors: Required<ColorTokens>): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = "form-fields";
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";
  frame.resize(maxWidth, 100);
  frame.itemSpacing = 16;
  frame.fills = [];

  for (const input of inputs) {
    const inputFrame = await renderInput(input, maxWidth, colors);
    frame.appendChild(inputFrame);
  }

  return frame;
}

async function renderInput(comp: ComponentSuggestion, maxWidth: number, colors: Required<ColorTokens>): Promise<FrameNode> {
  const id = comp.shadcn_id.toLowerCase();

  const container = figma.createFrame();
  container.name = comp.description || comp.shadcn_id;
  container.layoutMode = "VERTICAL";
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "FIXED";
  container.resize(maxWidth, 100);
  container.itemSpacing = 6;
  container.fills = [];

  // Label
  const label = figma.createText();
  label.fontName = { family: "Inter", style: "Medium" };
  label.fontSize = 14;
  label.characters = comp.description || comp.shadcn_id;
  label.fills = [{ type: "SOLID", color: colors.foreground }];
  container.appendChild(label);

  if (id === "textarea") {
    // Textarea
    const textarea = createTextarea(maxWidth, colors);
    container.appendChild(textarea);
  } else if (id === "select") {
    // Select dropdown
    const select = createSelect(maxWidth, colors);
    container.appendChild(select);
  } else if (id === "checkbox") {
    // Checkbox (replace label with inline)
    container.children[0]?.remove();
    const checkbox = createCheckbox(comp.description || "Option", colors);
    container.appendChild(checkbox);
  } else if (id === "switch") {
    // Switch (replace label with inline)
    container.children[0]?.remove();
    const switchComp = createSwitch(comp.description || "Toggle", colors);
    container.appendChild(switchComp);
  } else {
    // Default input
    const input = createInput(maxWidth, colors, comp.variant === "error");
    container.appendChild(input);
  }

  return container;
}

function createInput(width: number, colors: Required<ColorTokens>, isError: boolean = false): FrameNode {
  const input = figma.createFrame();
  input.name = "input";
  input.resize(width, 40);
  input.cornerRadius = 6;
  input.fills = [{ type: "SOLID", color: colors.background }];
  input.strokes = [{ type: "SOLID", color: sanitizeColor(isError ? colors.destructive : colors.input), opacity: 1 }];
  input.strokeWeight = 1;
  input.paddingLeft = 12;
  input.paddingRight = 12;
  input.layoutMode = "HORIZONTAL";
  input.counterAxisAlignItems = "CENTER";

  const placeholder = figma.createText();
  placeholder.fontName = { family: "Inter", style: "Regular" };
  placeholder.fontSize = 14;
  placeholder.characters = "Enter value...";
  placeholder.fills = [{ type: "SOLID", color: colors.mutedForeground }];
  input.appendChild(placeholder);

  return input;
}

function createTextarea(width: number, colors: Required<ColorTokens>): FrameNode {
  const textarea = figma.createFrame();
  textarea.name = "textarea";
  textarea.resize(width, 80);
  textarea.cornerRadius = 6;
  textarea.fills = [{ type: "SOLID", color: colors.background }];
  textarea.strokes = [{ type: "SOLID", color: sanitizeColor(colors.input), opacity: 1 }];
  textarea.strokeWeight = 1;
  textarea.paddingLeft = 12;
  textarea.paddingRight = 12;
  textarea.paddingTop = 8;
  textarea.layoutMode = "VERTICAL";

  const placeholder = figma.createText();
  placeholder.fontName = { family: "Inter", style: "Regular" };
  placeholder.fontSize = 14;
  placeholder.characters = "Enter text...";
  placeholder.fills = [{ type: "SOLID", color: colors.mutedForeground }];
  textarea.appendChild(placeholder);

  return textarea;
}

function createSelect(width: number, colors: Required<ColorTokens>): FrameNode {
  const select = figma.createFrame();
  select.name = "select";
  select.resize(width, 40);
  select.cornerRadius = 6;
  select.fills = [{ type: "SOLID", color: colors.background }];
  select.strokes = [{ type: "SOLID", color: sanitizeColor(colors.input), opacity: 1 }];
  select.strokeWeight = 1;
  select.paddingLeft = 12;
  select.paddingRight = 12;
  select.layoutMode = "HORIZONTAL";
  select.primaryAxisAlignItems = "SPACE_BETWEEN";
  select.counterAxisAlignItems = "CENTER";

  const placeholder = figma.createText();
  placeholder.fontName = { family: "Inter", style: "Regular" };
  placeholder.fontSize = 14;
  placeholder.characters = "Select option...";
  placeholder.fills = [{ type: "SOLID", color: colors.mutedForeground }];
  select.appendChild(placeholder);

  // Chevron
  const chevron = figma.createText();
  chevron.fontName = { family: "Inter", style: "Regular" };
  chevron.fontSize = 14;
  chevron.characters = "▼";
  chevron.fills = [{ type: "SOLID", color: colors.mutedForeground }];
  select.appendChild(chevron);

  return select;
}

function createCheckbox(labelText: string, colors: Required<ColorTokens>): FrameNode {
  const container = figma.createFrame();
  container.name = "checkbox";
  container.layoutMode = "HORIZONTAL";
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.itemSpacing = 8;
  container.counterAxisAlignItems = "CENTER";
  container.fills = [];

  // Box
  const box = figma.createFrame();
  box.name = "box";
  box.resize(16, 16);
  box.cornerRadius = 4;
  box.fills = [{ type: "SOLID", color: colors.background }];
  box.strokes = [{ type: "SOLID", color: sanitizeColor(colors.primary), opacity: 1 }];
  box.strokeWeight = 1;
  container.appendChild(box);

  // Label
  const label = figma.createText();
  label.fontName = { family: "Inter", style: "Regular" };
  label.fontSize = 14;
  label.characters = labelText;
  label.fills = [{ type: "SOLID", color: colors.foreground }];
  container.appendChild(label);

  return container;
}

function createSwitch(labelText: string, colors: Required<ColorTokens>): FrameNode {
  const container = figma.createFrame();
  container.name = "switch";
  container.layoutMode = "HORIZONTAL";
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.itemSpacing = 8;
  container.counterAxisAlignItems = "CENTER";
  container.fills = [];

  // Track
  const track = figma.createFrame();
  track.name = "track";
  track.resize(44, 24);
  track.cornerRadius = 12;
  track.fills = [{ type: "SOLID", color: colors.muted }];

  // Thumb
  const thumb = figma.createEllipse();
  thumb.name = "thumb";
  thumb.resize(20, 20);
  thumb.x = 2;
  thumb.y = 2;
  thumb.fills = [{ type: "SOLID", color: colors.background }];
  thumb.effects = [
    {
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: 0.1 },
      offset: { x: 0, y: 1 },
      radius: 2,
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    },
  ];
  track.appendChild(thumb);
  container.appendChild(track);

  // Label
  const label = figma.createText();
  label.fontName = { family: "Inter", style: "Regular" };
  label.fontSize = 14;
  label.characters = labelText;
  label.fills = [{ type: "SOLID", color: colors.foreground }];
  container.appendChild(label);

  return container;
}

// --- Button Row Renderer ---

async function renderButtonRow(buttons: ComponentSuggestion[], maxWidth: number, colors: Required<ColorTokens>): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = "buttons";
  frame.layoutMode = "HORIZONTAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.itemSpacing = 8;
  frame.fills = [];

  for (const btn of buttons) {
    const button = await renderButton(btn, colors);
    frame.appendChild(button);
  }

  return frame;
}

async function renderButton(comp: ComponentSuggestion, colors: Required<ColorTokens>): Promise<FrameNode> {
  const variant = comp.variant?.toLowerCase() || "default";

  const button = figma.createFrame();
  button.name = comp.description || "Button";
  button.layoutMode = "HORIZONTAL";
  button.primaryAxisSizingMode = "AUTO";
  button.counterAxisSizingMode = "AUTO";
  button.paddingLeft = 16;
  button.paddingRight = 16;
  button.paddingTop = 10;
  button.paddingBottom = 10;
  button.cornerRadius = 6;
  button.primaryAxisAlignItems = "CENTER";
  button.counterAxisAlignItems = "CENTER";

  // Style based on variant
  let bgColor: RGB;
  let textColor: RGB;
  let strokeColor: RGB | null = null;

  switch (variant) {
    case "destructive":
      bgColor = colors.destructive;
      textColor = colors.destructiveForeground;
      break;
    case "outline":
      bgColor = colors.background;
      textColor = colors.foreground;
      strokeColor = colors.input;
      break;
    case "secondary":
      bgColor = colors.secondary;
      textColor = colors.secondaryForeground;
      break;
    case "ghost":
      bgColor = colors.background;
      textColor = colors.foreground;
      break;
    default:
      bgColor = colors.primary;
      textColor = colors.primaryForeground;
  }

  button.fills = [{ type: "SOLID", color: sanitizeColor(bgColor) }];
  if (strokeColor) {
    button.strokes = [{ type: "SOLID", color: sanitizeColor(strokeColor), opacity: 1 }];
    button.strokeWeight = 1;
  }

  const label = figma.createText();
  label.fontName = { family: "Inter", style: "Medium" };
  label.fontSize = 14;
  label.characters = comp.description || "Button";
  label.fills = [{ type: "SOLID", color: textColor }];
  button.appendChild(label);

  return button;
}

// --- Card Renderer ---

async function renderCard(comp: ComponentSuggestion, maxWidth: number, colors: Required<ColorTokens>): Promise<FrameNode> {
  const card = figma.createFrame();
  card.name = comp.description || "Card";
  card.layoutMode = "VERTICAL";
  card.primaryAxisSizingMode = "AUTO";
  card.counterAxisSizingMode = "FIXED";
  card.resize(maxWidth, 100);
  card.paddingLeft = 16;
  card.paddingRight = 16;
  card.paddingTop = 16;
  card.paddingBottom = 16;
  card.itemSpacing = 8;
  card.cornerRadius = 8;
  card.fills = [{ type: "SOLID", color: sanitizeColor(colors.card) }];
  card.strokes = [{ type: "SOLID", color: sanitizeColor(colors.border), opacity: 1 }];
  card.strokeWeight = 1;

  // Card title
  const title = figma.createText();
  title.fontName = { family: "Inter", style: "Semi Bold" };
  title.fontSize = 16;
  title.characters = comp.description || "Card Title";
  title.fills = [{ type: "SOLID", color: colors.cardForeground }];
  card.appendChild(title);

  // Card description placeholder
  const desc = figma.createText();
  desc.fontName = { family: "Inter", style: "Regular" };
  desc.fontSize = 14;
  desc.characters = "Card content goes here...";
  desc.fills = [{ type: "SOLID", color: colors.mutedForeground }];
  card.appendChild(desc);

  return card;
}

// --- Generic Component Renderer ---

async function renderGenericComponent(comp: ComponentSuggestion, maxWidth: number, colors: Required<ColorTokens>): Promise<FrameNode> {
  const id = comp.shadcn_id.toLowerCase();

  // Handle specific components
  if (id === "badge") {
    return renderBadge(comp, colors);
  }
  if (id === "avatar") {
    return renderAvatar(comp, colors);
  }
  if (id === "table") {
    return renderTablePreview(maxWidth, colors);
  }
  if (id === "pagination") {
    return renderPagination(colors);
  }

  // Default: simple labeled frame
  const frame = figma.createFrame();
  frame.name = comp.description || comp.shadcn_id;
  frame.layoutMode = "HORIZONTAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.paddingLeft = 12;
  frame.paddingRight = 12;
  frame.paddingTop = 8;
  frame.paddingBottom = 8;
  frame.cornerRadius = 6;
  frame.fills = [{ type: "SOLID", color: colors.muted }];

  const label = figma.createText();
  label.fontName = { family: "Inter", style: "Medium" };
  label.fontSize = 12;
  label.characters = comp.description || comp.shadcn_id;
  label.fills = [{ type: "SOLID", color: colors.mutedForeground }];
  frame.appendChild(label);

  return frame;
}

function renderBadge(comp: ComponentSuggestion, colors: Required<ColorTokens>): FrameNode {
  const badge = figma.createFrame();
  badge.name = "badge";
  badge.layoutMode = "HORIZONTAL";
  badge.primaryAxisSizingMode = "AUTO";
  badge.counterAxisSizingMode = "AUTO";
  badge.paddingLeft = 10;
  badge.paddingRight = 10;
  badge.paddingTop = 4;
  badge.paddingBottom = 4;
  badge.cornerRadius = 9999;
  badge.fills = [{ type: "SOLID", color: colors.primary }];

  const label = figma.createText();
  label.fontName = { family: "Inter", style: "Medium" };
  label.fontSize = 12;
  label.characters = comp.description || "Badge";
  label.fills = [{ type: "SOLID", color: colors.primaryForeground }];
  badge.appendChild(label);

  return badge;
}

function renderAvatar(comp: ComponentSuggestion, colors: Required<ColorTokens>): FrameNode {
  const avatar = figma.createFrame();
  avatar.name = "avatar";
  avatar.resize(40, 40);
  avatar.cornerRadius = 20;
  avatar.fills = [{ type: "SOLID", color: colors.muted }];
  avatar.layoutMode = "HORIZONTAL";
  avatar.primaryAxisAlignItems = "CENTER";
  avatar.counterAxisAlignItems = "CENTER";

  const initials = figma.createText();
  initials.fontName = { family: "Inter", style: "Medium" };
  initials.fontSize = 14;
  initials.characters = "AB";
  initials.fills = [{ type: "SOLID", color: colors.mutedForeground }];
  avatar.appendChild(initials);

  return avatar;
}

function renderTablePreview(maxWidth: number, colors: Required<ColorTokens>): FrameNode {
  const table = figma.createFrame();
  table.name = "table";
  table.layoutMode = "VERTICAL";
  table.primaryAxisSizingMode = "AUTO";
  table.counterAxisSizingMode = "FIXED";
  table.resize(maxWidth, 100);
  table.cornerRadius = 6;
  table.fills = [{ type: "SOLID", color: sanitizeColor(colors.background) }];
  table.strokes = [{ type: "SOLID", color: sanitizeColor(colors.border), opacity: 1 }];
  table.strokeWeight = 1;
  table.clipsContent = true;

  // Header row
  const header = figma.createFrame();
  header.name = "header";
  header.layoutMode = "HORIZONTAL";
  header.counterAxisSizingMode = "AUTO";
  header.layoutAlign = "STRETCH";
  header.paddingLeft = 12;
  header.paddingRight = 12;
  header.paddingTop = 10;
  header.paddingBottom = 10;
  header.fills = [{ type: "SOLID", color: colors.muted }];

  for (const col of ["Name", "Status", "Date"]) {
    const cell = figma.createText();
    cell.fontName = { family: "Inter", style: "Medium" };
    cell.fontSize = 12;
    cell.characters = col;
    cell.fills = [{ type: "SOLID", color: colors.mutedForeground }];
    cell.layoutGrow = 1;
    header.appendChild(cell);
  }
  table.appendChild(header);
  header.layoutAlign = "STRETCH";

  // Sample rows
  for (let i = 0; i < 2; i++) {
    const row = figma.createFrame();
    row.name = `row-${i}`;
    row.layoutMode = "HORIZONTAL";
    row.counterAxisSizingMode = "AUTO";
    row.layoutAlign = "STRETCH";
    row.paddingLeft = 12;
    row.paddingRight = 12;
    row.paddingTop = 10;
    row.paddingBottom = 10;
    row.fills = [];

    for (const val of ["Item " + (i + 1), "Active", "Today"]) {
      const cell = figma.createText();
      cell.fontName = { family: "Inter", style: "Regular" };
      cell.fontSize = 12;
      cell.characters = val;
      cell.fills = [{ type: "SOLID", color: colors.foreground }];
      cell.layoutGrow = 1;
      row.appendChild(cell);
    }
    table.appendChild(row);
    row.layoutAlign = "STRETCH";
  }

  return table;
}

function renderPagination(colors: Required<ColorTokens>): FrameNode {
  const pagination = figma.createFrame();
  pagination.name = "pagination";
  pagination.layoutMode = "HORIZONTAL";
  pagination.primaryAxisSizingMode = "AUTO";
  pagination.counterAxisSizingMode = "AUTO";
  pagination.itemSpacing = 4;
  pagination.fills = [];

  // Previous
  const prev = createPaginationButton("←", false, colors);
  pagination.appendChild(prev);

  // Page numbers
  for (let i = 1; i <= 3; i++) {
    const page = createPaginationButton(String(i), i === 1, colors);
    pagination.appendChild(page);
  }

  // Next
  const next = createPaginationButton("→", false, colors);
  pagination.appendChild(next);

  return pagination;
}

function createPaginationButton(text: string, active: boolean, colors: Required<ColorTokens>): FrameNode {
  const btn = figma.createFrame();
  btn.name = `page-${text}`;
  btn.resize(32, 32);
  btn.cornerRadius = 6;
  btn.fills = [{ type: "SOLID", color: sanitizeColor(active ? colors.primary : colors.background) }];
  if (!active) {
    btn.strokes = [{ type: "SOLID", color: sanitizeColor(colors.border), opacity: 1 }];
    btn.strokeWeight = 1;
  }
  btn.layoutMode = "HORIZONTAL";
  btn.primaryAxisAlignItems = "CENTER";
  btn.counterAxisAlignItems = "CENTER";

  const label = figma.createText();
  label.fontName = { family: "Inter", style: "Medium" };
  label.fontSize = 12;
  label.characters = text;
  label.fills = [{ type: "SOLID", color: active ? colors.primaryForeground : colors.foreground }];
  btn.appendChild(label);

  return btn;
}
