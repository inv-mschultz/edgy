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
        format: "PNG",
        constraint: { type: "WIDTH", value: 400 },
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
      node_tree: extractNode(frame),
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
function extractNode(node: SceneNode): ExtractedNode {
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
    const mainComponent = node.mainComponent;
    if (mainComponent) {
      extracted.componentName = mainComponent.name;
      // Walk up to get the component set name (e.g., "Button" from "Button/Primary")
      if (mainComponent.parent?.type === "COMPONENT_SET") {
        extracted.componentName = mainComponent.parent.name;
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

  // Recurse into children
  if ("children" in node) {
    extracted.children = node.children
      .filter((child): child is SceneNode => child.type !== undefined)
      .map((child) => extractNode(child));
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
