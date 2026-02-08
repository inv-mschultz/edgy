/**
 * Frame Context Extraction
 *
 * Extracts and stores design context from frames for use in screen generation.
 */

// --- Types ---

export interface FrameContext {
  frameId: string;
  frameName: string;
  width: number;
  height: number;
  fonts: FontInfo[];
  colors: ColorInfo[];
  components: ComponentInfo[];
  spacing: SpacingInfo;
  borderRadii: number[];
  textStyles: TextStyleInfo[];
}

export interface FontInfo {
  family: string;
  styles: string[];
  sizes: number[];
  count: number;
}

export interface ColorInfo {
  hex: string;
  rgb: RGB;
  usage: "fill" | "stroke" | "text";
  count: number;
  isFromStyle: boolean;
  styleName?: string;
}

export interface ComponentInfo {
  type: string;
  name: string;
  count: number;
}

export interface SpacingInfo {
  commonGaps: number[];
  commonPaddings: number[];
}

export interface TextStyleInfo {
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  lineHeight?: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

// --- Storage Keys ---

const CONTEXT_STORAGE_KEY = "edgy-frame-context";

// --- Public API ---

/**
 * Extracts context from a frame and stores it.
 */
export async function extractAndStoreFrameContext(frame: FrameNode): Promise<FrameContext> {
  const context = await extractFrameContext(frame);
  storeFrameContext(frame.id, context);
  return context;
}

/**
 * Extracts context from multiple frames.
 */
export async function extractMultipleFrameContexts(frames: FrameNode[]): Promise<Map<string, FrameContext>> {
  const contexts = new Map<string, FrameContext>();

  for (const frame of frames) {
    const context = await extractAndStoreFrameContext(frame);
    contexts.set(frame.id, context);
  }

  return contexts;
}

/**
 * Gets stored context for a frame.
 */
export function getStoredFrameContext(frameId: string): FrameContext | null {
  try {
    const allContexts = getAllStoredContexts();
    return allContexts[frameId] || null;
  } catch {
    return null;
  }
}

/**
 * Gets all stored frame contexts.
 */
export function getAllStoredContexts(): Record<string, FrameContext> {
  try {
    const stored = figma.root.getPluginData(CONTEXT_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    // Validate the parsed data is an object
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Merges contexts from multiple frames into a unified design context.
 */
export function mergeFrameContexts(contexts: FrameContext[]): MergedContext {
  const merged: MergedContext = {
    fonts: new Map<string, FontInfo>(),
    colors: new Map<string, ColorInfo>(),
    components: new Map<string, ComponentInfo>(),
    spacing: { commonGaps: [], commonPaddings: [] },
    borderRadii: [],
    textStyles: [],
  };

  for (const ctx of contexts) {
    // Merge fonts
    for (const font of ctx.fonts) {
      const key = font.family;
      const existing = merged.fonts.get(key);
      if (existing) {
        existing.count += font.count;
        existing.sizes = [...new Set([...existing.sizes, ...font.sizes])];
        existing.styles = [...new Set([...existing.styles, ...font.styles])];
      } else {
        merged.fonts.set(key, { ...font });
      }
    }

    // Merge colors
    for (const color of ctx.colors) {
      const key = color.hex;
      const existing = merged.colors.get(key);
      if (existing) {
        existing.count += color.count;
      } else {
        merged.colors.set(key, { ...color });
      }
    }

    // Merge components
    for (const comp of ctx.components) {
      const key = comp.type;
      const existing = merged.components.get(key);
      if (existing) {
        existing.count += comp.count;
      } else {
        merged.components.set(key, { ...comp });
      }
    }

    // Merge spacing
    merged.spacing.commonGaps.push(...ctx.spacing.commonGaps);
    merged.spacing.commonPaddings.push(...ctx.spacing.commonPaddings);

    // Merge border radii
    merged.borderRadii.push(...ctx.borderRadii);

    // Merge text styles
    merged.textStyles.push(...ctx.textStyles);
  }

  // Deduplicate and sort
  merged.spacing.commonGaps = [...new Set(merged.spacing.commonGaps)].sort((a, b) => a - b);
  merged.spacing.commonPaddings = [...new Set(merged.spacing.commonPaddings)].sort((a, b) => a - b);
  merged.borderRadii = [...new Set(merged.borderRadii)].sort((a, b) => a - b);

  return merged;
}

export interface MergedContext {
  fonts: Map<string, FontInfo>;
  colors: Map<string, ColorInfo>;
  components: Map<string, ComponentInfo>;
  spacing: SpacingInfo;
  borderRadii: number[];
  textStyles: TextStyleInfo[];
}

// --- Private Functions ---

function storeFrameContext(frameId: string, context: FrameContext): void {
  try {
    const allContexts = getAllStoredContexts();
    allContexts[frameId] = context;
    figma.root.setPluginData(CONTEXT_STORAGE_KEY, JSON.stringify(allContexts));
  } catch (e) {
    console.warn("Failed to store frame context:", e);
  }
}

async function extractFrameContext(frame: FrameNode): Promise<FrameContext> {
  const context: FrameContext = {
    frameId: frame.id,
    frameName: frame.name,
    width: frame.width,
    height: frame.height,
    fonts: [],
    colors: [],
    components: [],
    spacing: { commonGaps: [], commonPaddings: [] },
    borderRadii: [],
    textStyles: [],
  };

  // Tracking maps
  const fontMap = new Map<string, FontInfo>();
  const colorMap = new Map<string, ColorInfo>();
  const componentMap = new Map<string, ComponentInfo>();
  const gaps: number[] = [];
  const paddings: number[] = [];
  const radii: number[] = [];

  // Extract text styles from document
  try {
    const textStyles = await figma.getLocalTextStylesAsync();
    for (const style of textStyles) {
      context.textStyles.push({
        name: style.name,
        fontFamily: style.fontName.family,
        fontSize: style.fontSize,
        fontWeight: style.fontName.style,
        lineHeight: style.lineHeight && typeof style.lineHeight === "object" && "value" in style.lineHeight
          ? style.lineHeight.value
          : undefined,
      });
    }
  } catch {
    // Text styles not available
  }

  // Recursively extract from nodes
  await extractFromNode(frame, fontMap, colorMap, componentMap, gaps, paddings, radii);

  // Convert maps to arrays
  context.fonts = Array.from(fontMap.values()).sort((a, b) => b.count - a.count);
  context.colors = Array.from(colorMap.values()).sort((a, b) => b.count - a.count);
  context.components = Array.from(componentMap.values()).sort((a, b) => b.count - a.count);

  // Get most common spacing values
  context.spacing.commonGaps = getMostCommon(gaps, 5);
  context.spacing.commonPaddings = getMostCommon(paddings, 5);
  context.borderRadii = getMostCommon(radii, 5);

  return context;
}

async function extractFromNode(
  node: SceneNode,
  fontMap: Map<string, FontInfo>,
  colorMap: Map<string, ColorInfo>,
  componentMap: Map<string, ComponentInfo>,
  gaps: number[],
  paddings: number[],
  radii: number[]
): Promise<void> {
  // Extract text info
  if (node.type === "TEXT") {
    const fontName = node.fontName;
    if (fontName && typeof fontName === "object" && "family" in fontName) {
      const key = fontName.family;
      const existing = fontMap.get(key);
      const fontSize = typeof node.fontSize === "number" ? node.fontSize : 14;

      if (existing) {
        existing.count++;
        if (!existing.sizes.includes(fontSize)) {
          existing.sizes.push(fontSize);
        }
        if (!existing.styles.includes(fontName.style)) {
          existing.styles.push(fontName.style);
        }
      } else {
        fontMap.set(key, {
          family: fontName.family,
          styles: [fontName.style],
          sizes: [fontSize],
          count: 1,
        });
      }
    }

    // Extract text color
    if (Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === "SOLID" && fill.visible !== false) {
          addColor(colorMap, fill.color, "text", node.boundVariables?.fills);
        }
      }
    }
  }

  // Extract fills
  if ("fills" in node && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill.type === "SOLID" && fill.visible !== false) {
        addColor(colorMap, fill.color, "fill", (node as any).boundVariables?.fills);
      }
    }
  }

  // Extract strokes
  if ("strokes" in node && Array.isArray(node.strokes)) {
    for (const stroke of node.strokes) {
      if (stroke.type === "SOLID" && stroke.visible !== false) {
        addColor(colorMap, stroke.color, "stroke", (node as any).boundVariables?.strokes);
      }
    }
  }

  // Extract border radius
  if ("cornerRadius" in node && typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
    radii.push(node.cornerRadius);
  }

  // Extract spacing from auto-layout
  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    const frameNode = node as FrameNode;
    if (frameNode.itemSpacing > 0) {
      gaps.push(frameNode.itemSpacing);
    }
    if (frameNode.paddingLeft > 0) paddings.push(frameNode.paddingLeft);
    if (frameNode.paddingRight > 0) paddings.push(frameNode.paddingRight);
    if (frameNode.paddingTop > 0) paddings.push(frameNode.paddingTop);
    if (frameNode.paddingBottom > 0) paddings.push(frameNode.paddingBottom);
  }

  // Track component instances
  if (node.type === "INSTANCE") {
    try {
      const mainComponent = await node.getMainComponentAsync();
      if (mainComponent && mainComponent.name) {
        const compName = mainComponent.name;
        const existing = componentMap.get(compName);
        if (existing) {
          existing.count++;
        } else {
          componentMap.set(compName, {
            type: compName,
            name: compName,
            count: 1,
          });
        }
      }
    } catch {
      // Component may be from a library that's not accessible
    }
  }

  // Recurse into children
  if ("children" in node && node.children) {
    for (const child of node.children) {
      if (child) {
        await extractFromNode(child, fontMap, colorMap, componentMap, gaps, paddings, radii);
      }
    }
  }
}

function addColor(
  colorMap: Map<string, ColorInfo>,
  color: RGB,
  usage: "fill" | "stroke" | "text",
  boundVariables?: any
): void {
  const hex = rgbToHex(color);
  const existing = colorMap.get(hex);

  // Check if bound to a variable/style
  const isFromStyle = boundVariables && boundVariables.length > 0;

  if (existing) {
    existing.count++;
  } else {
    colorMap.set(hex, {
      hex,
      rgb: color,
      usage,
      count: 1,
      isFromStyle,
    });
  }
}

function rgbToHex(color: RGB): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, "0");
  const g = Math.round(color.g * 255).toString(16).padStart(2, "0");
  const b = Math.round(color.b * 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`.toUpperCase();
}

function getMostCommon(values: number[], limit: number): number[] {
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}
