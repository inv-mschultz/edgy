/**
 * HTML Renderer
 *
 * Converts GeneratedElement structures and ExtractedNode trees into HTML/CSS.
 * Uses rich styling data from Figma for pixel-perfect rendering.
 */

import type {
  ExtractedNode,
  RichFill,
  RichStroke,
  RichShadow,
  RichTextStyle,
  RichAutoLayout,
  RichBorderRadius,
  RichColor,
  GeneratedElement,
  GeneratedScreenLayout,
} from "../ui/lib/types";
import type { DesignTokens, SemanticColorTokens } from "./screen-designer";

// --- Types ---

interface RGB {
  r: number;
  g: number;
  b: number;
}

// Internal style interface for HTML generation
interface ElementStyle {
  backgroundColor?: RGB;
  textColor?: RGB;
  borderColor?: RGB;
  borderRadius?: number;
  borderWidth?: number;
  padding?: number | { top: number; right: number; bottom: number; left: number };
  gap?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "Regular" | "Medium" | "Semi Bold" | "Bold";
  textAlign?: "LEFT" | "CENTER" | "RIGHT";
  layoutMode?: "HORIZONTAL" | "VERTICAL";
  alignItems?: "MIN" | "CENTER" | "MAX";
  justifyContent?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
}

// --- Utility Functions ---

function rgbToHex(color: RGB): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function rgbToCss(color: RGB): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fontWeightToCss(weight?: "Regular" | "Medium" | "Semi Bold" | "Bold"): number {
  switch (weight) {
    case "Bold": return 700;
    case "Semi Bold": return 600;
    case "Medium": return 500;
    default: return 400;
  }
}

function alignItemsToCss(align?: "MIN" | "CENTER" | "MAX"): string {
  switch (align) {
    case "CENTER": return "center";
    case "MAX": return "flex-end";
    default: return "flex-start";
  }
}

function justifyContentToCss(justify?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN"): string {
  switch (justify) {
    case "CENTER": return "center";
    case "MAX": return "flex-end";
    case "SPACE_BETWEEN": return "space-between";
    default: return "flex-start";
  }
}

function textAlignToCss(align?: "LEFT" | "CENTER" | "RIGHT"): string {
  switch (align) {
    case "CENTER": return "center";
    case "RIGHT": return "right";
    default: return "left";
  }
}

// --- Rich Styling to CSS ---

/**
 * Converts RichColor to CSS rgba string.
 */
function richColorToCss(color: RichColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (color.a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${color.a.toFixed(3)})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Converts RichFill array to CSS background.
 */
function richFillsToCss(fills: RichFill[]): string {
  if (!fills || fills.length === 0) return "";

  // Find the first visible fill (opacity > 0)
  const fill = fills.find((f) => f.opacity > 0);
  if (!fill) return "";

  if (fill.type === "solid" && fill.color) {
    // Apply fill opacity to the color
    const colorWithOpacity = {
      ...fill.color,
      a: fill.color.a * fill.opacity,
    };
    return richColorToCss(colorWithOpacity);
  }

  if (fill.type === "gradient" && fill.gradient) {
    // Apply fill opacity to gradient stops
    const stops = fill.gradient.stops
      .map((s) => {
        const colorWithOpacity = { ...s.color, a: s.color.a * fill.opacity };
        return `${richColorToCss(colorWithOpacity)} ${(s.position * 100).toFixed(1)}%`;
      })
      .join(", ");

    if (fill.gradient.type === "linear") {
      const angle = fill.gradient.angle ?? 180;
      return `linear-gradient(${angle}deg, ${stops})`;
    } else {
      return `radial-gradient(circle, ${stops})`;
    }
  }

  return "";
}

/**
 * Converts RichStroke array to CSS border.
 */
function richStrokesToCss(strokes: RichStroke[]): string {
  if (!strokes || strokes.length === 0) return "";

  const stroke = strokes[0];
  return `${stroke.weight}px solid ${richColorToCss(stroke.color)}`;
}

/**
 * Converts RichShadow array to CSS box-shadow.
 */
function richShadowsToCss(shadows: RichShadow[]): string {
  if (!shadows || shadows.length === 0) return "";

  return shadows.map((shadow) => {
    const inset = shadow.type === "inner" ? "inset " : "";
    return `${inset}${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.spread}px ${richColorToCss(shadow.color)}`;
  }).join(", ");
}

/**
 * Converts RichBorderRadius to CSS border-radius.
 */
function richBorderRadiusToCss(radius: RichBorderRadius): string {
  if (radius.topLeft === radius.topRight &&
      radius.topRight === radius.bottomRight &&
      radius.bottomRight === radius.bottomLeft) {
    return `${radius.topLeft}px`;
  }
  return `${radius.topLeft}px ${radius.topRight}px ${radius.bottomRight}px ${radius.bottomLeft}px`;
}

/**
 * Generates inline CSS styles from an ExtractedNode's rich styling.
 */
function generateNodeStyles(node: ExtractedNode): string {
  const styles: string[] = [];

  // Position and size
  styles.push(`width: ${node.width}px`);
  styles.push(`height: ${node.height}px`);

  // Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    styles.push(`opacity: ${node.opacity}`);
  }

  // Background / fills
  if (node.fills && node.fills.length > 0) {
    const bg = richFillsToCss(node.fills);
    if (bg) {
      if (bg.includes("gradient")) {
        styles.push(`background: ${bg}`);
      } else {
        styles.push(`background-color: ${bg}`);
      }
    }
  }

  // Border / strokes
  if (node.strokes && node.strokes.length > 0) {
    styles.push(`border: ${richStrokesToCss(node.strokes)}`);
  }

  // Border radius
  if (node.borderRadius) {
    styles.push(`border-radius: ${richBorderRadiusToCss(node.borderRadius)}`);
  }

  // Shadows
  if (node.effects && node.effects.length > 0) {
    styles.push(`box-shadow: ${richShadowsToCss(node.effects)}`);
  }

  // Overflow
  if (node.clipsContent) {
    styles.push("overflow: hidden");
  }

  // Auto-layout
  if (node.autoLayout) {
    styles.push("display: flex");
    styles.push(`flex-direction: ${node.autoLayout.direction === "horizontal" ? "row" : "column"}`);
    styles.push(`padding: ${node.autoLayout.padding.top}px ${node.autoLayout.padding.right}px ${node.autoLayout.padding.bottom}px ${node.autoLayout.padding.left}px`);
    styles.push(`gap: ${node.autoLayout.gap}px`);

    const alignMap = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" };
    styles.push(`align-items: ${alignMap[node.autoLayout.alignItems] || "flex-start"}`);

    const justifyMap = { start: "flex-start", center: "center", end: "flex-end", "space-between": "space-between" };
    styles.push(`justify-content: ${justifyMap[node.autoLayout.justifyContent] || "flex-start"}`);

    if (node.autoLayout.wrap) {
      styles.push("flex-wrap: wrap");
    }
  }

  return styles.join("; ");
}

/**
 * Generates inline CSS styles from a text node's RichTextStyle.
 */
function generateTextStyles(textStyle: RichTextStyle): string {
  const styles: string[] = [];

  styles.push(`font-family: "${textStyle.fontFamily}", -apple-system, BlinkMacSystemFont, sans-serif`);
  styles.push(`font-size: ${textStyle.fontSize}px`);
  styles.push(`font-weight: ${textStyle.fontWeight}`);

  if (textStyle.lineHeight !== "auto") {
    styles.push(`line-height: ${textStyle.lineHeight}px`);
  } else {
    styles.push("line-height: 1.5");
  }

  if (textStyle.letterSpacing !== 0) {
    styles.push(`letter-spacing: ${textStyle.letterSpacing}px`);
  }

  styles.push(`text-align: ${textStyle.textAlign}`);
  styles.push(`color: ${richColorToCss(textStyle.color)}`);

  if (textStyle.textDecoration !== "none") {
    styles.push(`text-decoration: ${textStyle.textDecoration}`);
  }

  if (textStyle.textTransform !== "none") {
    styles.push(`text-transform: ${textStyle.textTransform}`);
  }

  return styles.join("; ");
}

// --- CSS Generation ---

/**
 * Generates CSS custom properties from design tokens.
 */
export function generateCssVariables(tokens: DesignTokens): string {
  const sem = tokens.semanticColors || {};

  const vars: Record<string, string> = {
    // Colors
    "--background": rgbToHex(sem.background || tokens.backgroundColor),
    "--foreground": rgbToHex(sem.foreground || tokens.textColor),
    "--primary": rgbToHex(sem.primary || tokens.primaryColor),
    "--primary-foreground": rgbToHex(sem.primaryForeground || { r: 1, g: 1, b: 1 }),
    "--secondary": rgbToHex(sem.secondary || { r: 0.96, g: 0.96, b: 0.96 }),
    "--secondary-foreground": rgbToHex(sem.secondaryForeground || tokens.textColor),
    "--muted": rgbToHex(sem.muted || { r: 0.96, g: 0.96, b: 0.96 }),
    "--muted-foreground": rgbToHex(sem.mutedForeground || tokens.mutedColor),
    "--accent": rgbToHex(sem.accent || { r: 0.96, g: 0.96, b: 0.96 }),
    "--accent-foreground": rgbToHex(sem.accentForeground || tokens.textColor),
    "--destructive": rgbToHex(sem.destructive || { r: 0.94, g: 0.27, b: 0.27 }),
    "--destructive-foreground": rgbToHex(sem.destructiveForeground || { r: 1, g: 1, b: 1 }),
    "--border": rgbToHex(sem.border || tokens.borderColor),
    "--input": rgbToHex(sem.input || tokens.borderColor),
    "--ring": rgbToHex(sem.ring || tokens.primaryColor),
    "--card": rgbToHex(sem.card || tokens.backgroundColor),
    "--card-foreground": rgbToHex(sem.cardForeground || tokens.textColor),
    // Typography
    "--font-family": tokens.fontFamily,
    "--font-size-base": `${tokens.baseFontSize}px`,
    "--font-size-heading": `${tokens.headingFontSize}px`,
    // Layout
    "--border-radius": `${tokens.borderRadius}px`,
  };

  return Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
}

/**
 * Generates base CSS styles for the prototype.
 */
export function generateBaseStyles(): string {
  return `
/* Reset */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* Base */
html {
  font-size: var(--font-size-base, 14px);
  font-family: var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  background-color: var(--background, #ffffff);
  color: var(--foreground, #171717);
  line-height: 1.5;
}

/* Typography */
h1, h2, h3, h4, h5, h6 {
  font-weight: 600;
  line-height: 1.25;
}

h1 { font-size: var(--font-size-heading, 24px); }
h2 { font-size: calc(var(--font-size-heading, 24px) * 0.85); }
h3 { font-size: calc(var(--font-size-heading, 24px) * 0.7); }

/* Links */
a {
  color: var(--primary, #171717);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: var(--font-size-base, 14px);
  font-weight: 500;
  border-radius: var(--border-radius, 8px);
  border: none;
  cursor: pointer;
  transition: opacity 0.15s, background-color 0.15s;
  white-space: nowrap;
}

.btn:hover {
  opacity: 0.9;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--primary, #171717);
  color: var(--primary-foreground, #ffffff);
}

.btn-secondary {
  background-color: var(--secondary, #f5f5f5);
  color: var(--secondary-foreground, #171717);
}

.btn-outline {
  background-color: transparent;
  border: 1px solid var(--border, #e5e5e5);
  color: var(--foreground, #171717);
}

.btn-ghost {
  background-color: transparent;
  color: var(--foreground, #171717);
}

.btn-ghost:hover {
  background-color: var(--accent, #f5f5f5);
}

.btn-destructive {
  background-color: var(--destructive, #ef4444);
  color: var(--destructive-foreground, #ffffff);
}

/* Inputs */
.input {
  display: block;
  width: 100%;
  padding: 10px 12px;
  font-size: var(--font-size-base, 14px);
  font-family: inherit;
  background-color: var(--background, #ffffff);
  border: 1px solid var(--input, #e5e5e5);
  border-radius: var(--border-radius, 8px);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.input:focus {
  border-color: var(--ring, #171717);
  box-shadow: 0 0 0 2px var(--ring, #171717)20;
}

.input::placeholder {
  color: var(--muted-foreground, #737373);
}

/* Cards */
.card {
  background-color: var(--card, #ffffff);
  border: 1px solid var(--border, #e5e5e5);
  border-radius: var(--border-radius, 8px);
  padding: 24px;
}

.card-header {
  margin-bottom: 16px;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
}

.card-description {
  color: var(--muted-foreground, #737373);
  font-size: 14px;
  margin-top: 4px;
}

/* Checkbox */
.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox {
  width: 16px;
  height: 16px;
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 4px;
  cursor: pointer;
}

.checkbox:checked {
  background-color: var(--primary, #171717);
  border-color: var(--primary, #171717);
}

/* Separator */
.separator {
  height: 1px;
  background-color: var(--border, #e5e5e5);
  margin: 16px 0;
}

/* Screen wrapper */
.screen {
  position: relative;
  margin: 0 auto;
  overflow: hidden;
}

/* Navigation */
.prototype-nav {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 24px;
  z-index: 1000;
}

.prototype-nav a {
  padding: 6px 12px;
  color: white;
  font-size: 12px;
  border-radius: 16px;
  transition: background-color 0.15s;
}

.prototype-nav a:hover {
  background: rgba(255, 255, 255, 0.1);
  text-decoration: none;
}

.prototype-nav a.active {
  background: var(--primary, #171717);
}

/* Hotspot (clickable area) */
.hotspot {
  position: absolute;
  cursor: pointer;
  transition: background-color 0.15s;
}

.hotspot:hover {
  background-color: rgba(0, 100, 255, 0.1);
}

/* Image placeholder */
.image-placeholder {
  background-color: var(--muted, #f5f5f5);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted-foreground, #737373);
  font-size: 12px;
}
`;
}

// --- Element to HTML Conversion (with Tailwind/shadcn classes) ---

/**
 * Converts padding value to Tailwind class.
 */
function paddingToTailwind(padding: number | { top: number; right: number; bottom: number; left: number }): string {
  if (typeof padding === "number") {
    if (padding <= 4) return "p-1";
    if (padding <= 8) return "p-2";
    if (padding <= 12) return "p-3";
    if (padding <= 16) return "p-4";
    if (padding <= 20) return "p-5";
    if (padding <= 24) return "p-6";
    return "p-8";
  }
  // For asymmetric padding, use inline style
  return "";
}

/**
 * Converts gap value to Tailwind class.
 */
function gapToTailwind(gap: number): string {
  if (gap <= 4) return "gap-1";
  if (gap <= 8) return "gap-2";
  if (gap <= 12) return "gap-3";
  if (gap <= 16) return "gap-4";
  if (gap <= 20) return "gap-5";
  if (gap <= 24) return "gap-6";
  return "gap-8";
}

/**
 * Converts font size to Tailwind class.
 */
function fontSizeToTailwind(size: number): string {
  if (size <= 12) return "text-xs";
  if (size <= 14) return "text-sm";
  if (size <= 16) return "text-base";
  if (size <= 18) return "text-lg";
  if (size <= 20) return "text-xl";
  if (size <= 24) return "text-2xl";
  if (size <= 30) return "text-3xl";
  return "text-4xl";
}

/**
 * Converts font weight to Tailwind class.
 */
function fontWeightToTailwind(weight?: "Regular" | "Medium" | "Semi Bold" | "Bold"): string {
  switch (weight) {
    case "Bold": return "font-bold";
    case "Semi Bold": return "font-semibold";
    case "Medium": return "font-medium";
    default: return "";
  }
}

/**
 * Renders a GeneratedElement to HTML string with Tailwind classes.
 */
export function renderElementToHtml(
  element: GeneratedElement,
  tokens?: DesignTokens,
  depth: number = 0
): string {
  const indent = "  ".repeat(depth);
  const style = element.style || {};
  const classes: string[] = [];
  const inlineStyles: string[] = [];

  // Width
  if (element.width === "fill") {
    classes.push("w-full");
  } else if (typeof element.width === "number") {
    inlineStyles.push(`width: ${element.width}px`);
  }

  // Height
  if (element.height !== "hug" && typeof element.height === "number") {
    inlineStyles.push(`height: ${element.height}px`);
  }

  // Background color (use CSS variable or inline)
  if (style.backgroundColor) {
    inlineStyles.push(`background-color: ${rgbToCss(style.backgroundColor)}`);
  }

  // Text styling
  if (style.fontSize) {
    classes.push(fontSizeToTailwind(style.fontSize));
  }
  if (style.fontWeight) {
    const tw = fontWeightToTailwind(style.fontWeight);
    if (tw) classes.push(tw);
  }
  if (style.textAlign) {
    if (style.textAlign === "CENTER") classes.push("text-center");
    else if (style.textAlign === "RIGHT") classes.push("text-right");
  }
  if (style.textColor) {
    inlineStyles.push(`color: ${rgbToCss(style.textColor)}`);
  }

  // Border
  if (style.borderColor) {
    classes.push("border");
    classes.push("border-border");
    if (style.borderRadius !== undefined) {
      if (style.borderRadius <= 4) classes.push("rounded-sm");
      else if (style.borderRadius <= 8) classes.push("rounded-md");
      else if (style.borderRadius <= 12) classes.push("rounded-lg");
      else classes.push("rounded-xl");
    }
  } else if (style.borderRadius !== undefined) {
    if (style.borderRadius <= 4) classes.push("rounded-sm");
    else if (style.borderRadius <= 8) classes.push("rounded-md");
    else if (style.borderRadius <= 12) classes.push("rounded-lg");
    else classes.push("rounded-xl");
  }

  // Layout
  if (style.layoutMode) {
    classes.push("flex");
    classes.push(style.layoutMode === "HORIZONTAL" ? "flex-row" : "flex-col");
    if (style.alignItems === "CENTER") classes.push("items-center");
    else if (style.alignItems === "MAX") classes.push("items-end");
    if (style.justifyContent === "CENTER") classes.push("justify-center");
    else if (style.justifyContent === "MAX") classes.push("justify-end");
    else if (style.justifyContent === "SPACE_BETWEEN") classes.push("justify-between");
  }

  // Gap
  if (style.gap) {
    classes.push(gapToTailwind(style.gap));
  }

  // Padding
  if (style.padding) {
    const tw = paddingToTailwind(style.padding);
    if (tw) {
      classes.push(tw);
    } else if (typeof style.padding === "object") {
      inlineStyles.push(`padding: ${style.padding.top}px ${style.padding.right}px ${style.padding.bottom}px ${style.padding.left}px`);
    }
  }

  const classAttr = classes.length > 0 ? ` class="${classes.join(" ")}"` : "";
  const styleAttr = inlineStyles.length > 0 ? ` style="${inlineStyles.join("; ")}"` : "";

  // Render based on element type
  switch (element.type) {
    case "text": {
      const isHeading = style.fontSize && style.fontSize >= 20;
      const headingClasses = isHeading ? "font-semibold tracking-tight" : "";
      const tag = isHeading ? "h2" : "p";
      const combinedClasses = [headingClasses, ...classes].filter(Boolean).join(" ");
      const finalClassAttr = combinedClasses ? ` class="${combinedClasses}"` : "";
      return `${indent}<${tag}${finalClassAttr}${styleAttr}>${escapeHtml(element.textContent || "")}</${tag}>`;
    }

    case "button": {
      const variant = element.variant || "primary";
      return `${indent}<button class="btn btn-${variant}"${styleAttr}>${escapeHtml(element.textContent || "Button")}</button>`;
    }

    case "input": {
      const placeholder = element.textContent || element.name || "Enter text...";
      return `${indent}<input type="text" class="input w-full" placeholder="${escapeHtml(placeholder)}"${styleAttr}>`;
    }

    case "checkbox": {
      const label = element.textContent || element.name || "Checkbox";
      return `${indent}<label class="flex items-center gap-2 text-sm cursor-pointer"${styleAttr}>
${indent}  <input type="checkbox" class="h-4 w-4 rounded border-border">
${indent}  <span>${escapeHtml(label)}</span>
${indent}</label>`;
    }

    case "separator": {
      return `${indent}<div class="separator my-4"${styleAttr}></div>`;
    }

    case "icon": {
      const icon = element.textContent || "?";
      return `${indent}<span class="inline-flex items-center justify-center"${styleAttr}>${escapeHtml(icon)}</span>`;
    }

    case "image": {
      const alt = element.name || "Image";
      return `${indent}<div class="avatar bg-muted flex items-center justify-center text-muted-foreground text-xs"${styleAttr}>${escapeHtml(alt)}</div>`;
    }

    case "card": {
      const children = (element.children || [])
        .map((child) => renderElementToHtml(child, tokens, depth + 1))
        .join("\n");
      return `${indent}<div class="card"${styleAttr}>
${indent}  <div class="card-content pt-6">
${children}
${indent}  </div>
${indent}</div>`;
    }

    case "frame":
    default: {
      const children = (element.children || [])
        .map((child) => renderElementToHtml(child, tokens, depth + 1))
        .join("\n");
      if (children) {
        return `${indent}<div${classAttr}${styleAttr}>
${children}
${indent}</div>`;
      }
      return `${indent}<div${classAttr}${styleAttr}></div>`;
    }
  }
}

// --- ExtractedNode to HTML Conversion ---

/**
 * Infers button variant from node properties.
 * Checks componentName, componentProperties, and node name for variant hints.
 */
function inferButtonVariant(node: ExtractedNode): string {
  const name = node.name.toLowerCase();
  const componentName = node.componentName?.toLowerCase() || "";

  // Check componentProperties first (most reliable - from Figma variant system)
  if (node.componentProperties) {
    const propValues = Object.values(node.componentProperties)
      .map(p => (typeof p.value === "string" ? p.value : String(p.value)).toLowerCase())
      .join(" ");

    if (propValues.includes("secondary") || propValues.includes("outline")) return "outline";
    if (propValues.includes("ghost") || propValues.includes("text") || propValues.includes("link")) return "ghost";
    if (propValues.includes("destructive") || propValues.includes("danger") || propValues.includes("delete")) return "destructive";
    if (propValues.includes("primary") || propValues.includes("filled") || propValues.includes("solid")) return "primary";
  }

  // Check componentName (e.g., "Button/Secondary" or "Style=Outline")
  if (componentName.includes("secondary") || componentName.includes("outline")) return "outline";
  if (componentName.includes("ghost") || componentName.includes("text") || componentName.includes("link")) return "ghost";
  if (componentName.includes("destructive") || componentName.includes("danger") || componentName.includes("delete")) return "destructive";
  if (componentName.includes("primary") || componentName.includes("filled")) return "primary";

  // Check node name
  if (name.includes("secondary") || name.includes("outline") || name.includes("cancel") || name.includes("back")) return "outline";
  if (name.includes("ghost") || name.includes("skip") || name.includes("link")) return "ghost";
  if (name.includes("destructive") || name.includes("delete") || name.includes("danger") || name.includes("remove")) return "destructive";
  if (name.includes("primary") || name.includes("cta") || name.includes("submit") || name.includes("save") || name.includes("continue")) return "primary";

  // Default to primary (caller may override based on context)
  return "primary";
}

/**
 * Infers element type from ExtractedNode.
 */
function inferElementType(node: ExtractedNode): string {
  const name = node.name.toLowerCase();
  const type = node.type;
  const componentName = node.componentName?.toLowerCase() || "";

  // Check component name first
  if (componentName.includes("button") || componentName.includes("btn")) return "button";
  if (componentName.includes("input") || componentName.includes("textfield") || componentName.includes("text field")) return "input";
  if (componentName.includes("checkbox")) return "checkbox";
  if (componentName.includes("card")) return "card";
  if (componentName.includes("divider") || componentName.includes("separator")) return "separator";
  if (componentName.includes("avatar") || componentName.includes("image") || componentName.includes("icon")) return "image";

  // Check node name
  if (name.includes("button") || name.includes("btn") || name.includes("cta")) return "button";
  if (name.includes("input") || name.includes("textfield") || name.includes("text field") || name.includes("email") || name.includes("password")) return "input";
  if (name.includes("checkbox") || name.includes("toggle") || name.includes("switch")) return "checkbox";
  if (name.includes("card")) return "card";
  if (name.includes("divider") || name.includes("separator") || name.includes("line")) return "separator";
  if (name.includes("avatar") || name.includes("photo") || name.includes("thumbnail")) return "image";
  if (name.includes("icon")) return "icon";

  // Check node type
  if (type === "TEXT") return "text";
  if (type === "RECTANGLE" && node.width && node.height && node.width > node.height * 5) return "separator";
  if (type === "ELLIPSE" || (type === "RECTANGLE" && node.width === node.height)) return "image";

  return "frame";
}

/**
 * Renders an ExtractedNode to HTML with EXACT Figma positioning (absolute).
 * This is a 1:1 replication using absolute positioning for pixel-perfect results.
 */
export function renderNodeToHtml(
  node: ExtractedNode,
  tokens?: DesignTokens,
  depth: number = 0,
  isRoot: boolean = false
): string {
  if (!node.visible) return "";

  const indent = "  ".repeat(depth);
  const styles: string[] = [];

  // --- POSITIONING: Use absolute positioning with exact Figma coordinates ---
  if (isRoot) {
    styles.push("position: relative");
  } else {
    styles.push("position: absolute");
    styles.push(`left: ${node.x}px`);
    styles.push(`top: ${node.y}px`);
  }

  // --- SIZE: Exact dimensions ---
  styles.push(`width: ${node.width}px`);
  styles.push(`height: ${node.height}px`);

  // --- IMAGE FILLS: Use exported image as background ---
  if (node.hasImageFill && node.imageBase64) {
    styles.push(`background-image: url('${node.imageBase64}')`);
    styles.push("background-size: cover");
    styles.push("background-position: center");
  } else if (node.fills && node.fills.length > 0) {
    // --- BACKGROUND: Fills (colors, gradients) ---
    const bg = richFillsToCss(node.fills);
    if (bg) {
      if (bg.includes("gradient")) {
        styles.push(`background: ${bg}`);
      } else {
        styles.push(`background-color: ${bg}`);
      }
    }
  }

  // --- BORDER: Strokes ---
  if (node.strokes && node.strokes.length > 0) {
    styles.push(`border: ${richStrokesToCss(node.strokes)}`);
  }

  // --- BORDER RADIUS ---
  if (node.borderRadius) {
    styles.push(`border-radius: ${richBorderRadiusToCss(node.borderRadius)}`);
  }

  // --- SHADOWS ---
  if (node.effects && node.effects.length > 0) {
    styles.push(`box-shadow: ${richShadowsToCss(node.effects)}`);
  }

  // --- OPACITY ---
  if (node.opacity !== undefined && node.opacity < 1) {
    styles.push(`opacity: ${node.opacity}`);
  }

  // --- OVERFLOW ---
  if (node.clipsContent) {
    styles.push("overflow: hidden");
  }

  // --- TEXT NODES ---
  if (node.type === "TEXT") {
    const content = node.textContent || "";
    if (!content.trim()) return "";

    // Add text-specific styles
    if (node.textStyle) {
      styles.push(`font-family: "${node.textStyle.fontFamily}", -apple-system, BlinkMacSystemFont, sans-serif`);
      styles.push(`font-size: ${node.textStyle.fontSize}px`);
      styles.push(`font-weight: ${node.textStyle.fontWeight}`);
      if (node.textStyle.lineHeight !== "auto") {
        styles.push(`line-height: ${node.textStyle.lineHeight}px`);
      }
      if (node.textStyle.letterSpacing !== 0) {
        styles.push(`letter-spacing: ${node.textStyle.letterSpacing}px`);
      }
      styles.push(`text-align: ${node.textStyle.textAlign}`);
      styles.push(`color: ${richColorToCss(node.textStyle.color)}`);
      if (node.textStyle.textDecoration !== "none") {
        styles.push(`text-decoration: ${node.textStyle.textDecoration}`);
      }
      if (node.textStyle.textTransform !== "none") {
        styles.push(`text-transform: ${node.textStyle.textTransform}`);
      }
    }

    // Remove position for text since we want it to flow
    const styleStr = styles.join("; ");
    return `${indent}<div style="${styleStr}">${escapeHtml(content)}</div>`;
  }

  // --- INTERACTIVE ELEMENT DETECTION ---
  const elementType = inferElementType(node);
  const isButton = elementType === "button";
  const isInput = elementType === "input";

  if (isButton) {
    styles.push("cursor: pointer");
  }

  // --- RENDER CHILDREN (recursively with absolute positioning) ---
  const children = node.children
    .filter((c) => c.visible)
    .map((child) => renderNodeToHtml(child, tokens, depth + 1, false))
    .filter((html) => html.trim())
    .join("\n");

  const styleStr = styles.join("; ");

  // Use appropriate HTML element
  if (isButton) {
    const label = findTextContent(node) || node.name || "";
    if (children) {
      return `${indent}<button style="${styleStr}">
${children}
${indent}</button>`;
    }
    return `${indent}<button style="${styleStr}">${escapeHtml(label)}</button>`;
  }

  if (isInput) {
    const placeholder = findTextContent(node) || node.name || "Enter text...";
    return `${indent}<input type="text" placeholder="${escapeHtml(placeholder)}" style="${styleStr}">`;
  }

  // Generic container
  if (children) {
    return `${indent}<div style="${styleStr}">
${children}
${indent}</div>`;
  }

  // Empty container (might have background/border)
  if (node.fills?.length || node.strokes?.length || node.borderRadius || node.effects?.length) {
    return `${indent}<div style="${styleStr}"></div>`;
  }

  return "";
}

/**
 * Recursively finds text content within a node tree.
 */
function findTextContent(node: ExtractedNode): string | undefined {
  if (node.textContent) return node.textContent;
  for (const child of node.children) {
    const text = findTextContent(child);
    if (text) return text;
  }
  return undefined;
}

/**
 * Recursively finds the first text node within a node tree.
 */
function findTextNode(node: ExtractedNode): ExtractedNode | undefined {
  if (node.type === "TEXT" && node.textStyle) return node;
  for (const child of node.children) {
    const found = findTextNode(child);
    if (found) return found;
  }
  return undefined;
}

// --- Full Page Generation ---

/**
 * Generates a complete HTML page for a screen.
 */
export function generateScreenPage(
  screenName: string,
  screenSlug: string,
  width: number,
  height: number,
  content: string,
  tokens: DesignTokens,
  allScreens: { name: string; slug: string }[],
  backgroundColor?: RGB
): string {
  const cssVars = generateCssVariables(tokens);
  const baseStyles = generateBaseStyles();
  const bgColor = backgroundColor ? rgbToCss(backgroundColor) : "var(--background)";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(screenName)} - Prototype</title>
  <style>
    :root {
${cssVars}
    }
${baseStyles}
  </style>
</head>
<body>
  <div class="screen" style="width: ${width}px; min-height: ${height}px; background-color: ${bgColor};">
${content}
  </div>

  <!-- Navigation -->
  <nav class="prototype-nav">
    ${allScreens.map((s) =>
      `<a href="${s.slug}.html"${s.slug === screenSlug ? ' class="active"' : ''}>${escapeHtml(s.name)}</a>`
    ).join("\n    ")}
  </nav>
</body>
</html>`;
}

/**
 * Phone frame styles and dimensions
 */
const PHONE_FRAME = {
  // iPhone 14 Pro dimensions
  frameWidth: 433,
  frameHeight: 882,
  screenWidth: 393,
  screenHeight: 852,
  borderRadius: 55,
  notchWidth: 126,
  notchHeight: 37,
  bezelTop: 15,
  bezelSide: 20,
};

/**
 * Generates shadcn/ui compatible Tailwind config and base styles.
 */
function generateShadcnStyles(tokens: DesignTokens): string {
  const sem = tokens.semanticColors || {};

  // Convert RGB to HSL for shadcn compatibility
  function rgbToHsl(color: RGB): string {
    const r = color.r;
    const g = color.g;
    const b = color.b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  }

  const background = sem.background || tokens.backgroundColor;
  const foreground = sem.foreground || tokens.textColor;
  const primary = sem.primary || tokens.primaryColor;
  const muted = sem.muted || { r: 0.96, g: 0.96, b: 0.96 };
  const mutedForeground = sem.mutedForeground || tokens.mutedColor;
  const border = sem.border || tokens.borderColor;

  return `
    /* shadcn/ui CSS Variables */
    :root {
      --background: ${rgbToHsl(background)};
      --foreground: ${rgbToHsl(foreground)};
      --card: ${rgbToHsl(sem.card || background)};
      --card-foreground: ${rgbToHsl(sem.cardForeground || foreground)};
      --popover: ${rgbToHsl(background)};
      --popover-foreground: ${rgbToHsl(foreground)};
      --primary: ${rgbToHsl(primary)};
      --primary-foreground: ${rgbToHsl(sem.primaryForeground || { r: 1, g: 1, b: 1 })};
      --secondary: ${rgbToHsl(sem.secondary || { r: 0.96, g: 0.96, b: 0.96 })};
      --secondary-foreground: ${rgbToHsl(sem.secondaryForeground || foreground)};
      --muted: ${rgbToHsl(muted)};
      --muted-foreground: ${rgbToHsl(mutedForeground)};
      --accent: ${rgbToHsl(sem.accent || muted)};
      --accent-foreground: ${rgbToHsl(sem.accentForeground || foreground)};
      --destructive: ${rgbToHsl(sem.destructive || { r: 0.94, g: 0.27, b: 0.27 })};
      --destructive-foreground: ${rgbToHsl(sem.destructiveForeground || { r: 1, g: 1, b: 1 })};
      --border: ${rgbToHsl(border)};
      --input: ${rgbToHsl(sem.input || border)};
      --ring: ${rgbToHsl(sem.ring || primary)};
      --radius: ${tokens.borderRadius}px;
    }

    /* Tailwind base overrides for shadcn */
    * {
      border-color: hsl(var(--border));
    }

    body {
      background-color: hsl(var(--background));
      color: hsl(var(--foreground));
    }
  `;
}

/**
 * Generates the interactive phone-framed prototype viewer with Tailwind + shadcn/ui.
 */
export function generateInteractivePrototype(
  screens: Array<{
    id: string;
    name: string;
    slug: string;
    source: "existing" | "generated";
    width: number;
    height: number;
    htmlContent: string;
    thumbnail?: string;
    backgroundColor?: RGB;
  }>,
  navigation: Array<{
    fromScreen: string;
    toScreen: string;
    trigger: string;
    label?: string;
  }>,
  tokens: DesignTokens
): string {
  const shadcnStyles = generateShadcnStyles(tokens);

  // Create screen data for JavaScript
  const screenData = screens.map(s => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    source: s.source,
    backgroundColor: s.backgroundColor ? rgbToCss(s.backgroundColor) : null,
  }));

  // Create navigation map for quick lookup
  const navMap: Record<string, string[]> = {};
  for (const nav of navigation) {
    if (!navMap[nav.fromScreen]) navMap[nav.fromScreen] = [];
    navMap[nav.fromScreen].push(nav.toScreen);
  }

  // Generate screen content sections with Tailwind classes
  const screenSections = screens.map((screen, index) => {
    const bgStyle = screen.backgroundColor
      ? `background-color: ${rgbToCss(screen.backgroundColor)};`
      : "background-color: hsl(var(--background));";
    const aiTag = screen.source === "generated"
      ? `<div class="sticky top-0 left-0 right-0 z-50 flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-gradient-to-r from-violet-600 to-purple-600">
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M5 19l1 3 3-1-1-3-3 1z"/><path d="M19 5l1 3 3-1-1-3-3 1z"/></svg>
          AI generated screen
        </div>`
      : "";

    // Always use interactive HTML content (not thumbnail images)
    const content = screen.htmlContent;

    return `      <div class="screen-content absolute inset-0 overflow-y-auto overflow-x-hidden" data-screen="${screen.slug}" data-index="${index}" style="${bgStyle} display: ${index === 0 ? 'block' : 'none'};">
        ${aiTag}
        <div class="min-h-full relative">
${content}
        </div>
      </div>`;
  }).join("\n");

  // Generate screen list for sidebar with Tailwind
  const screenList = screens.map((s, i) =>
    `<button class="screen-item group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${i === 0 ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}" data-target="${s.slug}">
          <span class="screen-number flex items-center justify-center w-6 h-6 rounded-md text-xs font-medium ${i === 0 ? 'bg-white text-zinc-900' : 'bg-zinc-800 group-hover:bg-zinc-700'}">${i + 1}</span>
          <span class="flex-1 text-sm truncate">${escapeHtml(s.name)}</span>
          ${s.source === "generated" ? '<span class="px-1.5 py-0.5 text-[10px] font-medium bg-violet-600 text-white rounded">AI</span>' : ''}
        </button>`
  ).join("\n        ");

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interactive Prototype</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            border: 'hsl(var(--border))',
            input: 'hsl(var(--input))',
            ring: 'hsl(var(--ring))',
            background: 'hsl(var(--background))',
            foreground: 'hsl(var(--foreground))',
            primary: {
              DEFAULT: 'hsl(var(--primary))',
              foreground: 'hsl(var(--primary-foreground))',
            },
            secondary: {
              DEFAULT: 'hsl(var(--secondary))',
              foreground: 'hsl(var(--secondary-foreground))',
            },
            destructive: {
              DEFAULT: 'hsl(var(--destructive))',
              foreground: 'hsl(var(--destructive-foreground))',
            },
            muted: {
              DEFAULT: 'hsl(var(--muted))',
              foreground: 'hsl(var(--muted-foreground))',
            },
            accent: {
              DEFAULT: 'hsl(var(--accent))',
              foreground: 'hsl(var(--accent-foreground))',
            },
            card: {
              DEFAULT: 'hsl(var(--card))',
              foreground: 'hsl(var(--card-foreground))',
            },
          },
          borderRadius: {
            lg: 'var(--radius)',
            md: 'calc(var(--radius) - 2px)',
            sm: 'calc(var(--radius) - 4px)',
          },
        },
      },
    }
  </script>
  <style>
    ${shadcnStyles}

    /* Inter font for better typography */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    /* shadcn/ui Button styles */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      white-space: nowrap;
      border-radius: var(--radius);
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 150ms;
      outline: none;
      cursor: pointer;
    }
    .btn:focus-visible {
      ring: 2px;
      ring-offset: 2px;
    }
    .btn:disabled {
      pointer-events: none;
      opacity: 0.5;
    }
    .btn-primary {
      background-color: hsl(var(--primary));
      color: hsl(var(--primary-foreground));
      padding: 0.625rem 1rem;
      border: none;
    }
    .btn-primary:hover {
      background-color: hsl(var(--primary) / 0.9);
    }
    .btn-secondary {
      background-color: hsl(var(--secondary));
      color: hsl(var(--secondary-foreground));
      padding: 0.625rem 1rem;
      border: none;
    }
    .btn-secondary:hover {
      background-color: hsl(var(--secondary) / 0.8);
    }
    .btn-outline {
      border: 1px solid hsl(var(--border));
      background-color: transparent;
      color: hsl(var(--foreground));
      padding: 0.625rem 1rem;
    }
    .btn-outline:hover {
      background-color: hsl(var(--accent));
      color: hsl(var(--accent-foreground));
    }
    .btn-ghost {
      background-color: transparent;
      color: hsl(var(--foreground));
      padding: 0.625rem 1rem;
      border: none;
    }
    .btn-ghost:hover {
      background-color: hsl(var(--accent));
      color: hsl(var(--accent-foreground));
    }
    .btn-destructive {
      background-color: hsl(var(--destructive));
      color: hsl(var(--destructive-foreground));
      padding: 0.625rem 1rem;
      border: none;
    }
    .btn-destructive:hover {
      background-color: hsl(var(--destructive) / 0.9);
    }
    .btn-link {
      color: hsl(var(--primary));
      text-decoration: underline;
      text-underline-offset: 4px;
      background: none;
      border: none;
      padding: 0;
    }
    .btn-link:hover {
      text-decoration: underline;
    }

    /* shadcn/ui Input styles */
    .input {
      display: flex;
      height: 2.5rem;
      width: 100%;
      border-radius: var(--radius);
      border: 1px solid hsl(var(--input));
      background-color: hsl(var(--background));
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
      color: hsl(var(--foreground));
      transition: all 150ms;
    }
    .input::placeholder {
      color: hsl(var(--muted-foreground));
    }
    .input:focus {
      outline: none;
      ring: 2px;
      ring-color: hsl(var(--ring));
      ring-offset: 2px;
    }
    .input:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    /* shadcn/ui Card styles */
    .card {
      border-radius: var(--radius);
      border: 1px solid hsl(var(--border));
      background-color: hsl(var(--card));
      color: hsl(var(--card-foreground));
    }
    .card-header {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      padding: 1.5rem;
    }
    .card-title {
      font-size: 1.25rem;
      font-weight: 600;
      line-height: 1;
      letter-spacing: -0.025em;
    }
    .card-description {
      font-size: 0.875rem;
      color: hsl(var(--muted-foreground));
    }
    .card-content {
      padding: 1.5rem;
      padding-top: 0;
    }
    .card-footer {
      display: flex;
      align-items: center;
      padding: 1.5rem;
      padding-top: 0;
    }

    /* shadcn/ui Label styles */
    .label {
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1;
      color: hsl(var(--foreground));
    }

    /* shadcn/ui Badge styles */
    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 9999px;
      padding: 0.125rem 0.625rem;
      font-size: 0.75rem;
      font-weight: 600;
      transition: colors 150ms;
    }
    .badge-default {
      background-color: hsl(var(--primary));
      color: hsl(var(--primary-foreground));
    }
    .badge-secondary {
      background-color: hsl(var(--secondary));
      color: hsl(var(--secondary-foreground));
    }
    .badge-destructive {
      background-color: hsl(var(--destructive));
      color: hsl(var(--destructive-foreground));
    }
    .badge-outline {
      border: 1px solid hsl(var(--border));
      color: hsl(var(--foreground));
    }

    /* shadcn/ui Separator */
    .separator {
      height: 1px;
      width: 100%;
      background-color: hsl(var(--border));
    }

    /* shadcn/ui Avatar */
    .avatar {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 9999px;
      background-color: hsl(var(--muted));
    }
    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .avatar-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      font-size: 0.875rem;
      font-weight: 500;
      color: hsl(var(--muted-foreground));
    }

    /* Phone frame styles */
    .phone-frame {
      position: relative;
      width: ${PHONE_FRAME.frameWidth}px;
      height: ${PHONE_FRAME.frameHeight}px;
      background: #1a1a1a;
      border-radius: ${PHONE_FRAME.borderRadius}px;
      padding: ${PHONE_FRAME.bezelTop}px ${PHONE_FRAME.bezelSide}px;
      box-shadow:
        0 0 0 2px #333,
        0 25px 50px -12px rgba(0, 0, 0, 0.5),
        inset 0 0 0 2px #444;
    }

    .phone-notch {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      width: ${PHONE_FRAME.notchWidth}px;
      height: ${PHONE_FRAME.notchHeight}px;
      background: #000;
      border-radius: 20px;
      z-index: 100;
    }

    .phone-button {
      position: absolute;
      background: #333;
      border-radius: 2px;
    }
    .phone-button.volume-up { left: -3px; top: 180px; width: 3px; height: 60px; }
    .phone-button.volume-down { left: -3px; top: 260px; width: 3px; height: 60px; }
    .phone-button.power { right: -3px; top: 220px; width: 3px; height: 90px; }

    .phone-screen {
      width: ${PHONE_FRAME.screenWidth}px;
      height: ${PHONE_FRAME.screenHeight}px;
      background: hsl(var(--background));
      border-radius: ${PHONE_FRAME.borderRadius - 10}px;
      overflow: hidden;
      position: relative;
    }

    .nav-hint {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      color: #fff;
      font-size: 12px;
      border-radius: 20px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 200;
    }
    .phone-screen:hover .nav-hint {
      opacity: 1;
    }

    /* Interactive element styles */
    .screen-content .btn,
    .screen-content button {
      cursor: pointer;
      transition: all 0.15s;
    }
    .screen-content .btn:hover,
    .screen-content button:hover {
      opacity: 0.9;
      transform: scale(0.98);
    }
    .screen-content .btn:active,
    .screen-content button:active {
      transform: scale(0.95);
    }

    .screen-content .input,
    .screen-content input[type="text"],
    .screen-content input[type="email"],
    .screen-content input[type="password"],
    .screen-content textarea {
      cursor: text;
      transition: all 0.15s;
    }
    .screen-content .input:focus,
    .screen-content input:focus,
    .screen-content textarea:focus {
      outline: none;
      box-shadow: 0 0 0 2px hsl(var(--ring));
    }

    .screen-content a {
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .screen-content a:hover {
      opacity: 0.8;
    }

    /* Checkbox/radio styling */
    .screen-content input[type="checkbox"],
    .screen-content input[type="radio"] {
      cursor: pointer;
      accent-color: hsl(var(--primary));
    }

    /* Screen content text colors */
    .screen-content h1, .screen-content h2, .screen-content h3, .screen-content h4 {
      color: hsl(var(--foreground));
    }
    .screen-content p, .screen-content span {
      color: hsl(var(--foreground));
    }
    .screen-content .text-muted {
      color: hsl(var(--muted-foreground));
    }
  </style>
</head>
<body class="bg-zinc-950 text-white min-h-screen flex overflow-hidden">
  <!-- Sidebar -->
  <aside class="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col h-screen">
    <div class="p-5 border-b border-zinc-800">
      <h1 class="text-sm font-semibold text-white">Prototype</h1>
      <p class="text-xs text-zinc-500 mt-0.5">${screens.length} screens</p>
    </div>
    <div class="flex-1 overflow-y-auto p-3 space-y-1">
      ${screenList}
    </div>
    <div class="p-4 border-t border-zinc-800 text-[11px] text-zinc-600 space-y-1.5">
      <div class="flex justify-between">
        <span>Next screen</span>
        <span><kbd class="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px]">→</kbd> or <kbd class="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px]">Space</kbd></span>
      </div>
      <div class="flex justify-between">
        <span>Previous screen</span>
        <kbd class="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px]">←</kbd>
      </div>
    </div>
  </aside>

  <!-- Viewer -->
  <main class="flex-1 flex items-center justify-center p-10 overflow-auto">
    <div class="phone-frame">
      <div class="phone-notch"></div>
      <div class="phone-button volume-up"></div>
      <div class="phone-button volume-down"></div>
      <div class="phone-button power"></div>

      <div class="phone-screen">
${screenSections}
        <div class="nav-hint" id="navHint">Click buttons to navigate</div>
      </div>
    </div>
  </main>

  <script>
    const screens = ${JSON.stringify(screenData)};
    const navigation = ${JSON.stringify(navMap)};
    let currentIndex = 0;

    function showScreen(index) {
      if (index < 0 || index >= screens.length) return;

      document.querySelectorAll('.screen-content').forEach(el => {
        el.style.display = 'none';
      });

      const target = document.querySelector(\`[data-index="\${index}"]\`);
      if (target) {
        target.style.display = 'block';
        currentIndex = index;

        // Update sidebar active state
        document.querySelectorAll('.screen-item').forEach((el, i) => {
          if (i === index) {
            el.classList.add('bg-zinc-800', 'text-white');
            el.classList.remove('text-zinc-400', 'hover:bg-zinc-800/50', 'hover:text-white');
            el.querySelector('.screen-number').classList.add('bg-white', 'text-zinc-900');
            el.querySelector('.screen-number').classList.remove('bg-zinc-800', 'group-hover:bg-zinc-700');
          } else {
            el.classList.remove('bg-zinc-800', 'text-white');
            el.classList.add('text-zinc-400', 'hover:bg-zinc-800/50', 'hover:text-white');
            el.querySelector('.screen-number').classList.remove('bg-white', 'text-zinc-900');
            el.querySelector('.screen-number').classList.add('bg-zinc-800', 'group-hover:bg-zinc-700');
          }
        });

        // Update navigation hint
        const hasNext = navigation[screens[index].slug]?.length > 0 || index < screens.length - 1;
        document.getElementById('navHint').textContent = hasNext ? 'Click buttons to navigate' : 'End of flow';

        // Re-attach event listeners to new screen elements
        attachInteractiveListeners();
      }
    }

    function nextScreen() {
      const currentSlug = screens[currentIndex].slug;
      const targets = navigation[currentSlug];

      if (targets && targets.length > 0) {
        const targetIndex = screens.findIndex(s => s.slug === targets[0]);
        if (targetIndex !== -1) {
          showScreen(targetIndex);
          return;
        }
      }

      if (currentIndex < screens.length - 1) {
        showScreen(currentIndex + 1);
      }
    }

    function prevScreen() {
      if (currentIndex > 0) {
        showScreen(currentIndex - 1);
      }
    }

    // Check if an element is an input/textarea
    function isInputElement(el) {
      const tagName = el.tagName.toLowerCase();
      return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || el.isContentEditable;
    }

    // Attach click handlers to interactive elements
    function attachInteractiveListeners() {
      // Buttons advance the flow
      document.querySelectorAll('.screen-content .btn, .screen-content button:not([type="submit"])').forEach(el => {
        if (!el.dataset.protoListener) {
          el.dataset.protoListener = 'true';
          el.addEventListener('click', (e) => {
            e.preventDefault();
            nextScreen();
          });
        }
      });

      // Links with # or empty href advance the flow
      document.querySelectorAll('.screen-content a').forEach(el => {
        if (!el.dataset.protoListener) {
          el.dataset.protoListener = 'true';
          el.addEventListener('click', (e) => {
            const href = el.getAttribute('href');
            if (!href || href === '#' || href.startsWith('#')) {
              e.preventDefault();
              nextScreen();
            }
          });
        }
      });

      // Checkboxes and radios are interactive but don't navigate
      document.querySelectorAll('.screen-content input[type="checkbox"], .screen-content input[type="radio"]').forEach(el => {
        if (!el.dataset.protoListener) {
          el.dataset.protoListener = 'true';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            // Allow normal checkbox/radio behavior
          });
        }
      });

      // Form submissions advance the flow
      document.querySelectorAll('.screen-content form').forEach(el => {
        if (!el.dataset.protoListener) {
          el.dataset.protoListener = 'true';
          el.addEventListener('submit', (e) => {
            e.preventDefault();
            nextScreen();
          });
        }
      });
    }

    // Sidebar navigation
    document.querySelectorAll('.screen-item').forEach((el, index) => {
      el.addEventListener('click', () => showScreen(index));
    });

    // Keyboard navigation (only when not focused on input)
    document.addEventListener('keydown', (e) => {
      // Don't interfere with typing in inputs
      if (isInputElement(document.activeElement)) {
        // Allow Enter to submit/advance from inputs
        if (e.key === 'Enter') {
          e.preventDefault();
          document.activeElement.blur();
          nextScreen();
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextScreen();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevScreen();
      }
    });

    // Initial setup
    attachInteractiveListeners();
  </script>
</body>
</html>`;
}

/**
 * Generates HTML content from a GeneratedScreenLayout.
 */
export function generateHtmlFromLayout(
  layout: GeneratedScreenLayout,
  tokens?: DesignTokens
): string {
  return layout.elements
    .map((element) => renderElementToHtml(element, tokens, 2))
    .join("\n");
}

/**
 * Generates HTML content from an ExtractedNode tree.
 */
export function generateHtmlFromNodeTree(
  nodeTree: ExtractedNode,
  tokens?: DesignTokens
): string {
  // Render the root node as a relative container, children will be absolutely positioned
  const children = nodeTree.children
    .filter((c) => c.visible)
    .map((node) => renderNodeToHtml(node, tokens, 3, false))
    .filter((html) => html.trim())
    .join("\n");

  // Root container with relative positioning
  const rootStyles = [
    "position: relative",
    `width: ${nodeTree.width}px`,
    `height: ${nodeTree.height}px`,
  ];

  // Add root background
  if (nodeTree.fills && nodeTree.fills.length > 0) {
    const bg = richFillsToCss(nodeTree.fills);
    if (bg) {
      if (bg.includes("gradient")) {
        rootStyles.push(`background: ${bg}`);
      } else {
        rootStyles.push(`background-color: ${bg}`);
      }
    }
  }

  return `    <div style="${rootStyles.join("; ")}">
${children}
    </div>`;
}

export { slugify, rgbToHex, rgbToCss, escapeHtml };
