/// <reference types="@figma/plugin-typings" />

import type {
  ExtractedNode,
  ExtractedScreen,
  AnalysisInput,
  RichFill,
  RichStroke,
  RichShadow,
  RichTextStyle,
  RichAutoLayout,
  RichBorderRadius,
  RichColor,
} from "../ui/lib/types";

/**
 * Extracts selected screens into a serializable format for analysis.
 * Walks the node tree recursively and exports thumbnails.
 */
export async function extractScreens(
  selection: readonly SceneNode[],
  onThumbnailProgress?: (current: number, total: number) => void
): Promise<AnalysisInput> {
  const frames = selection.filter(
    (node): node is FrameNode => node.type === "FRAME"
  );

  if (frames.length === 0) {
    throw new Error("No frames selected. Please select one or more screen frames.");
  }

  const screens: ExtractedScreen[] = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    // Export thumbnail
    onThumbnailProgress?.(i + 1, frames.length);
    let thumbnail_base64: string | undefined;
    try {
      const bytes = await frame.exportAsync({
        format: "PNG",
        constraint: { type: "WIDTH", value: 512 },
      });
      thumbnail_base64 = `data:image/png;base64,${figma.base64Encode(bytes)}`;
    } catch {
      // Thumbnail export can fail for some node types — continue without it
    }

    screens.push({
      screen_id: frame.id,
      name: frame.name,
      order: i,
      thumbnail_base64,
      width: frame.width,
      height: frame.height,
      x: frame.x,
      y: frame.y,
      node_tree: await extractNode(frame),
    });
  }

  return {
    analysis_id: generateUUID(),
    timestamp: new Date().toISOString(),
    file_name: figma.root.name,
    screens,
  };
}

// --- Helper functions for rich extraction ---

function extractColor(color: RGB | RGBA, opacity: number = 1): RichColor {
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    a: "a" in color ? color.a * opacity : opacity,
  };
}

function extractFills(node: SceneNode): RichFill[] | undefined {
  if (!("fills" in node) || node.fills === figma.mixed || !Array.isArray(node.fills)) {
    return undefined;
  }

  const richFills: RichFill[] = [];

  for (const paint of node.fills as ReadonlyArray<Paint>) {
    if (paint.visible === false) continue;

    if (paint.type === "SOLID") {
      richFills.push({
        type: "solid",
        color: extractColor(paint.color, paint.opacity ?? 1),
        opacity: paint.opacity ?? 1,
      });
    } else if (paint.type === "GRADIENT_LINEAR" || paint.type === "GRADIENT_RADIAL") {
      richFills.push({
        type: "gradient",
        gradient: {
          type: paint.type === "GRADIENT_LINEAR" ? "linear" : "radial",
          stops: paint.gradientStops.map((stop) => ({
            position: stop.position,
            color: extractColor(stop.color),
          })),
          angle: paint.type === "GRADIENT_LINEAR"
            ? Math.atan2(
                paint.gradientTransform[0][1],
                paint.gradientTransform[0][0]
              ) * (180 / Math.PI)
            : undefined,
        },
        opacity: paint.opacity ?? 1,
      });
    }
    // Image fills are handled separately via exportNodeImage
  }

  return richFills.length > 0 ? richFills : undefined;
}

function extractStrokes(node: SceneNode): RichStroke[] | undefined {
  if (!("strokes" in node) || !Array.isArray(node.strokes)) {
    return undefined;
  }

  const richStrokes: RichStroke[] = [];
  const strokeWeight = "strokeWeight" in node && typeof node.strokeWeight === "number"
    ? node.strokeWeight
    : 1;
  const strokeAlign = "strokeAlign" in node ? node.strokeAlign : "CENTER";

  for (const paint of node.strokes as ReadonlyArray<Paint>) {
    if (paint.visible === false) continue;

    if (paint.type === "SOLID") {
      richStrokes.push({
        color: extractColor(paint.color, paint.opacity ?? 1),
        weight: strokeWeight,
        align: strokeAlign === "INSIDE" ? "inside" : strokeAlign === "OUTSIDE" ? "outside" : "center",
      });
    }
  }

  return richStrokes.length > 0 ? richStrokes : undefined;
}

function extractEffects(node: SceneNode): RichShadow[] | undefined {
  if (!("effects" in node) || !Array.isArray(node.effects)) {
    return undefined;
  }

  const shadows: RichShadow[] = [];

  for (const effect of node.effects as ReadonlyArray<Effect>) {
    if (effect.visible === false) continue;

    if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
      shadows.push({
        type: effect.type === "DROP_SHADOW" ? "drop" : "inner",
        color: extractColor(effect.color),
        offsetX: effect.offset.x,
        offsetY: effect.offset.y,
        blur: effect.radius,
        spread: effect.spread ?? 0,
      });
    }
  }

  return shadows.length > 0 ? shadows : undefined;
}

function extractBorderRadius(node: SceneNode): RichBorderRadius | undefined {
  if (!("cornerRadius" in node)) {
    return undefined;
  }

  // Check for individual corner radii
  if ("topLeftRadius" in node) {
    const n = node as FrameNode | RectangleNode;
    return {
      topLeft: n.topLeftRadius ?? 0,
      topRight: n.topRightRadius ?? 0,
      bottomRight: n.bottomRightRadius ?? 0,
      bottomLeft: n.bottomLeftRadius ?? 0,
    };
  }

  // Uniform corner radius
  const radius = node.cornerRadius;
  if (typeof radius === "number" && radius > 0) {
    return {
      topLeft: radius,
      topRight: radius,
      bottomRight: radius,
      bottomLeft: radius,
    };
  }

  return undefined;
}

function extractTextStyle(node: TextNode): RichTextStyle | undefined {
  // Handle mixed styles by taking the first character's style
  const fontSize = node.fontSize !== figma.mixed ? node.fontSize : 14;
  const fontName = node.fontName !== figma.mixed ? node.fontName : { family: "Inter", style: "Regular" };
  const fontWeight = fontName.style.toLowerCase().includes("bold") ? 700
    : fontName.style.toLowerCase().includes("semi") ? 600
    : fontName.style.toLowerCase().includes("medium") ? 500
    : fontName.style.toLowerCase().includes("light") ? 300
    : 400;

  const lineHeight = node.lineHeight !== figma.mixed
    ? (node.lineHeight.unit === "PIXELS" ? node.lineHeight.value : "auto")
    : "auto";

  const letterSpacing = node.letterSpacing !== figma.mixed
    ? (node.letterSpacing.unit === "PIXELS" ? node.letterSpacing.value : 0)
    : 0;

  const textAlign = node.textAlignHorizontal === "CENTER" ? "center"
    : node.textAlignHorizontal === "RIGHT" ? "right"
    : node.textAlignHorizontal === "JUSTIFIED" ? "justify"
    : "left";

  const textDecoration = node.textDecoration !== figma.mixed
    ? (node.textDecoration === "UNDERLINE" ? "underline"
      : node.textDecoration === "STRIKETHROUGH" ? "line-through"
      : "none")
    : "none";

  const textCase = node.textCase !== figma.mixed ? node.textCase : "ORIGINAL";
  const textTransform = textCase === "UPPER" ? "uppercase"
    : textCase === "LOWER" ? "lowercase"
    : textCase === "TITLE" ? "capitalize"
    : "none";

  // Get text color from fills
  let textColor: RichColor = { r: 0, g: 0, b: 0, a: 1 };
  if (node.fills !== figma.mixed && Array.isArray(node.fills)) {
    const solidFill = (node.fills as ReadonlyArray<Paint>).find(
      (p): p is SolidPaint => p.type === "SOLID" && p.visible !== false
    );
    if (solidFill) {
      textColor = extractColor(solidFill.color, solidFill.opacity ?? 1);
    }
  }

  return {
    fontFamily: fontName.family,
    fontSize,
    fontWeight,
    lineHeight,
    letterSpacing,
    textAlign,
    textDecoration,
    textTransform,
    color: textColor,
  };
}

function extractAutoLayout(node: SceneNode): RichAutoLayout | undefined {
  if (!("layoutMode" in node) || node.layoutMode === "NONE") {
    return undefined;
  }

  const frame = node as FrameNode;

  return {
    direction: frame.layoutMode === "HORIZONTAL" ? "horizontal" : "vertical",
    padding: {
      top: frame.paddingTop ?? 0,
      right: frame.paddingRight ?? 0,
      bottom: frame.paddingBottom ?? 0,
      left: frame.paddingLeft ?? 0,
    },
    gap: frame.itemSpacing ?? 0,
    alignItems: frame.counterAxisAlignItems === "CENTER" ? "center"
      : frame.counterAxisAlignItems === "MAX" ? "end"
      : frame.counterAxisAlignItems === "BASELINE" ? "start"
      : "start",
    justifyContent: frame.primaryAxisAlignItems === "CENTER" ? "center"
      : frame.primaryAxisAlignItems === "MAX" ? "end"
      : frame.primaryAxisAlignItems === "SPACE_BETWEEN" ? "space-between"
      : "start",
    wrap: frame.layoutWrap === "WRAP",
  };
}

/**
 * Checks if a node has an image fill.
 */
function hasImageFill(node: SceneNode): boolean {
  if (!("fills" in node) || node.fills === figma.mixed) return false;
  const fills = node.fills as ReadonlyArray<Paint>;
  return fills.some((p) => p.type === "IMAGE" && p.visible !== false);
}

/**
 * Exports a node as a PNG image and returns base64 data URL.
 */
async function exportNodeAsImage(node: SceneNode): Promise<string | undefined> {
  try {
    // Check if node can be exported
    if (!("exportAsync" in node)) return undefined;

    const bytes = await (node as FrameNode).exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: 2 }, // 2x for retina
    });
    return `data:image/png;base64,${figma.base64Encode(bytes)}`;
  } catch {
    return undefined;
  }
}

/**
 * Recursively extracts a Figma node into a serializable format with rich styling.
 */
async function extractNode(node: SceneNode): Promise<ExtractedNode> {
  const extracted: ExtractedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    children: [],
  };

  // --- Opacity and blend mode ---
  if ("opacity" in node && node.opacity !== 1) {
    extracted.opacity = node.opacity;
  }
  if ("blendMode" in node && node.blendMode !== "NORMAL") {
    extracted.blendMode = node.blendMode;
  }

  // --- Rich fills ---
  const fills = extractFills(node);
  if (fills) {
    extracted.fills = fills;
  }

  // --- Image fills: Export node as image if it has image fills ---
  if (hasImageFill(node)) {
    extracted.hasImageFill = true;
    const imageData = await exportNodeAsImage(node);
    if (imageData) {
      extracted.imageBase64 = imageData;
    }
  }

  // --- Rich strokes ---
  const strokes = extractStrokes(node);
  if (strokes) {
    extracted.strokes = strokes;
  }

  // --- Effects (shadows) ---
  const effects = extractEffects(node);
  if (effects) {
    extracted.effects = effects;
  }

  // --- Border radius ---
  const borderRadius = extractBorderRadius(node);
  if (borderRadius) {
    extracted.borderRadius = borderRadius;
  }

  // --- Auto-layout ---
  const autoLayout = extractAutoLayout(node);
  if (autoLayout) {
    extracted.autoLayout = autoLayout;
  }

  // --- Clips content ---
  if ("clipsContent" in node && node.clipsContent) {
    extracted.clipsContent = true;
  }

  // --- Component info for instances ---
  if (node.type === "INSTANCE") {
    try {
      const mainComponent = await node.getMainComponentAsync();
      if (mainComponent && mainComponent.name) {
        extracted.componentName = mainComponent.name;
        const parent = mainComponent.parent;
        if (parent && parent.type === "COMPONENT_SET") {
          extracted.componentName = parent.name;
        }
      }
    } catch {
      // Component may be from a library that's not accessible
    }

    try {
      const props = node.componentProperties;
      if (props) {
        extracted.componentProperties = {};
        for (const [key, val] of Object.entries(props)) {
          if (val && val.value !== undefined) {
            extracted.componentProperties[key] = { value: String(val.value) };
          }
        }
      }
    } catch {
      // Some instances may not have accessible properties
    }
  }

  // --- Text content and styling ---
  if (node.type === "TEXT") {
    extracted.textContent = node.characters;
    extracted.textStyle = extractTextStyle(node);
  }

  // --- Recurse into children ---
  if ("children" in node) {
    const sceneChildren = node.children.filter(
      (child): child is SceneNode => child.type !== undefined
    );
    extracted.children = await Promise.all(
      sceneChildren.map((child) => extractNode(child))
    );
  }

  return extracted;
}

/**
 * Generates a UUID v4 string.
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
