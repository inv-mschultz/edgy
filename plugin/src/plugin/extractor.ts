/// <reference types="@figma/plugin-typings" />

import type { ExtractedNode, ExtractedScreen, AnalysisInput } from "../ui/lib/types";

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
        format: "JPG",
        constraint: { type: "WIDTH", value: 256 },
      });
      thumbnail_base64 = `data:image/jpeg;base64,${figma.base64Encode(bytes)}`;
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

/**
 * Recursively extracts a Figma node into a serializable format.
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

  // Extract component info for instances
  if (node.type === "INSTANCE") {
    const mainComponent = await node.getMainComponentAsync();
    if (mainComponent) {
      extracted.componentName = mainComponent.name;
      // Walk up to get the component set name (e.g., "Button" from "Button/Primary")
      const parent = mainComponent.parent;
      if (parent && parent.type === "COMPONENT_SET") {
        extracted.componentName = parent.name;
      }
    }

    // Extract component properties
    try {
      const props = node.componentProperties;
      if (props) {
        extracted.componentProperties = {};
        for (const [key, val] of Object.entries(props)) {
          extracted.componentProperties[key] = { value: String(val.value) };
        }
      }
    } catch {
      // Some instances may not have accessible properties
    }
  }

  // Extract text content
  if (node.type === "TEXT") {
    extracted.textContent = node.characters;
  }

  // Extract visual properties (fills, strokes)
  if ("fills" in node && node.fills !== figma.mixed) {
    const solidFills = (node.fills as ReadonlyArray<Paint>)
      .filter((p): p is SolidPaint => p.type === "SOLID" && p.visible !== false)
      .map((p) => [p.color.r, p.color.g, p.color.b] as [number, number, number]);
    if (solidFills.length > 0) {
      extracted.fills = solidFills;
    }
  }

  if ("strokes" in node) {
    const solidStrokes = (node.strokes as ReadonlyArray<Paint>)
      .filter((p): p is SolidPaint => p.type === "SOLID" && p.visible !== false)
      .map((p) => [p.color.r, p.color.g, p.color.b] as [number, number, number]);
    if (solidStrokes.length > 0) {
      extracted.strokes = solidStrokes;
      const sw = (node as any).strokeWeight;
      extracted.strokeWeight = typeof sw === "number" ? sw : 1;
    }
  }

  // Recurse into children
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
