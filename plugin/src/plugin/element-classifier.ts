/**
 * Element Classifier
 *
 * Analyzes Figma ExtractedNode trees and classifies each node into
 * UI element types that map to shadcn/ui components.
 */

import type { ExtractedNode, RichColor } from "../ui/lib/types";

// --- Types ---

export type UIElementType =
  | "button"
  | "input"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "switch"
  | "slider"
  | "card"
  | "badge"
  | "avatar"
  | "icon"
  | "image"
  | "separator"
  | "label"
  | "heading"
  | "paragraph"
  | "link"
  | "nav"
  | "header"
  | "footer"
  | "list"
  | "list-item"
  | "table"
  | "dialog"
  | "toast"
  | "tooltip"
  | "tabs"
  | "accordion"
  | "container"
  | "unknown";

export interface ClassifiedElement {
  node: ExtractedNode;
  elementType: UIElementType;
  confidence: number; // 0-1
  shadcnComponent: string | null;
  props: Record<string, unknown>;
  children: ClassifiedElement[];
  textContent?: string;
  variant?: string;
}

// --- Classification Logic ---

/**
 * Classify an ExtractedNode tree into UI elements.
 */
export function classifyNodeTree(node: ExtractedNode): ClassifiedElement {
  const classification = classifyNode(node);

  // Recursively classify children
  const classifiedChildren: ClassifiedElement[] = [];
  for (const child of node.children) {
    if (child.visible !== false) {
      classifiedChildren.push(classifyNodeTree(child));
    }
  }

  return {
    ...classification,
    children: classifiedChildren,
  };
}

/**
 * Classify a single node based on its visual characteristics.
 */
function classifyNode(node: ExtractedNode): Omit<ClassifiedElement, "children"> {
  // Text nodes
  if (node.type === "TEXT" || node.textContent) {
    return classifyTextNode(node);
  }

  // Component instances - use component name as hint
  if (node.componentName) {
    return classifyFromComponentName(node);
  }

  // Frame/Rectangle nodes - classify by visual characteristics
  if (node.type === "FRAME" || node.type === "RECTANGLE" || node.type === "GROUP") {
    return classifyFrameNode(node);
  }

  // Ellipse - could be avatar, radio, or decorative
  if (node.type === "ELLIPSE") {
    return classifyEllipseNode(node);
  }

  // Vector/Line - likely icon or separator
  if (node.type === "VECTOR" || node.type === "LINE") {
    return classifyVectorNode(node);
  }

  // Default to container
  return {
    node,
    elementType: "container",
    confidence: 0.3,
    shadcnComponent: null,
    props: {},
  };
}

// --- Text Classification ---

function classifyTextNode(node: ExtractedNode): Omit<ClassifiedElement, "children"> {
  const text = node.textContent || "";
  const fontSize = node.textStyle?.fontSize || 14;
  const fontWeight = node.textStyle?.fontWeight || 400;

  // Heading detection
  if (fontSize >= 24 || fontWeight >= 600) {
    const level = fontSize >= 32 ? 1 : fontSize >= 24 ? 2 : 3;
    return {
      node,
      elementType: "heading",
      confidence: 0.9,
      shadcnComponent: null, // Use native h1-h6
      props: { level },
      textContent: text,
    };
  }

  // Label detection (short text, often near inputs)
  if (text.length < 30 && fontWeight >= 500) {
    return {
      node,
      elementType: "label",
      confidence: 0.7,
      shadcnComponent: "Label",
      props: {},
      textContent: text,
    };
  }

  // Link detection
  if (
    text.toLowerCase().includes("click") ||
    text.toLowerCase().includes("learn more") ||
    text.toLowerCase().includes("view") ||
    node.textStyle?.textDecoration === "underline"
  ) {
    return {
      node,
      elementType: "link",
      confidence: 0.7,
      shadcnComponent: null,
      props: { href: "#" },
      textContent: text,
    };
  }

  // Default to paragraph
  return {
    node,
    elementType: "paragraph",
    confidence: 0.8,
    shadcnComponent: null,
    props: {},
    textContent: text,
  };
}

// --- Component Name Classification ---

function classifyFromComponentName(node: ExtractedNode): Omit<ClassifiedElement, "children"> {
  const name = (node.componentName || "").toLowerCase();

  // Button patterns
  if (name.includes("button") || name.includes("btn") || name.includes("cta")) {
    const variant = detectButtonVariant(node);
    return {
      node,
      elementType: "button",
      confidence: 0.95,
      shadcnComponent: "Button",
      props: { variant },
      variant,
      textContent: extractTextFromNode(node),
    };
  }

  // Input patterns
  if (name.includes("input") || name.includes("text field") || name.includes("textfield")) {
    return {
      node,
      elementType: "input",
      confidence: 0.95,
      shadcnComponent: "Input",
      props: { placeholder: extractPlaceholder(node) },
    };
  }

  // Textarea
  if (name.includes("textarea") || name.includes("text area")) {
    return {
      node,
      elementType: "textarea",
      confidence: 0.95,
      shadcnComponent: "Textarea",
      props: { placeholder: extractPlaceholder(node) },
    };
  }

  // Select/Dropdown
  if (name.includes("select") || name.includes("dropdown") || name.includes("combobox")) {
    return {
      node,
      elementType: "select",
      confidence: 0.95,
      shadcnComponent: "Select",
      props: {},
    };
  }

  // Checkbox
  if (name.includes("checkbox") || name.includes("check box")) {
    return {
      node,
      elementType: "checkbox",
      confidence: 0.95,
      shadcnComponent: "Checkbox",
      props: {},
    };
  }

  // Radio
  if (name.includes("radio")) {
    return {
      node,
      elementType: "radio",
      confidence: 0.95,
      shadcnComponent: "RadioGroup",
      props: {},
    };
  }

  // Switch/Toggle
  if (name.includes("switch") || name.includes("toggle")) {
    return {
      node,
      elementType: "switch",
      confidence: 0.95,
      shadcnComponent: "Switch",
      props: {},
    };
  }

  // Card
  if (name.includes("card")) {
    return {
      node,
      elementType: "card",
      confidence: 0.95,
      shadcnComponent: "Card",
      props: {},
    };
  }

  // Badge/Tag/Chip
  if (name.includes("badge") || name.includes("tag") || name.includes("chip")) {
    return {
      node,
      elementType: "badge",
      confidence: 0.95,
      shadcnComponent: "Badge",
      props: {},
      textContent: extractTextFromNode(node),
    };
  }

  // Avatar
  if (name.includes("avatar") || name.includes("profile pic")) {
    return {
      node,
      elementType: "avatar",
      confidence: 0.95,
      shadcnComponent: "Avatar",
      props: {},
    };
  }

  // Icon
  if (name.includes("icon") || name.includes("ico_")) {
    return {
      node,
      elementType: "icon",
      confidence: 0.9,
      shadcnComponent: null,
      props: { name: node.name },
    };
  }

  // Tabs
  if (name.includes("tab")) {
    return {
      node,
      elementType: "tabs",
      confidence: 0.9,
      shadcnComponent: "Tabs",
      props: {},
    };
  }

  // Dialog/Modal
  if (name.includes("dialog") || name.includes("modal") || name.includes("popup")) {
    return {
      node,
      elementType: "dialog",
      confidence: 0.9,
      shadcnComponent: "Dialog",
      props: {},
    };
  }

  // Toast/Notification
  if (name.includes("toast") || name.includes("notification") || name.includes("snackbar")) {
    return {
      node,
      elementType: "toast",
      confidence: 0.9,
      shadcnComponent: "Toast",
      props: {},
    };
  }

  // Fall back to visual classification
  return classifyFrameNode(node);
}

// --- Frame Classification (by visual characteristics) ---

function classifyFrameNode(node: ExtractedNode): Omit<ClassifiedElement, "children"> {
  const { width, height } = node;
  const hasText = hasTextChild(node);
  const textContent = extractTextFromNode(node);
  const hasFill = node.fills && node.fills.length > 0;
  const hasStroke = node.strokes && node.strokes.length > 0;
  const hasShadow = node.effects && node.effects.length > 0;
  const borderRadius = getMaxBorderRadius(node);
  const aspectRatio = width / height;

  // Button detection: rectangular, has text, has fill, moderate size
  if (
    hasText &&
    hasFill &&
    height >= 28 &&
    height <= 60 &&
    width >= 60 &&
    width <= 400 &&
    borderRadius > 0
  ) {
    const variant = detectButtonVariant(node);
    return {
      node,
      elementType: "button",
      confidence: 0.8,
      shadcnComponent: "Button",
      props: { variant },
      variant,
      textContent,
    };
  }

  // Input detection: rectangular, has stroke, specific height range
  if (
    hasStroke &&
    !hasFill &&
    height >= 32 &&
    height <= 56 &&
    width >= 120
  ) {
    return {
      node,
      elementType: "input",
      confidence: 0.75,
      shadcnComponent: "Input",
      props: { placeholder: textContent || "Enter value..." },
    };
  }

  // Textarea: like input but taller
  if (hasStroke && height >= 80 && width >= 120) {
    return {
      node,
      elementType: "textarea",
      confidence: 0.7,
      shadcnComponent: "Textarea",
      props: { placeholder: textContent || "Enter text..." },
    };
  }

  // Card detection: has shadow or border, larger size, has children
  if (
    (hasShadow || hasStroke) &&
    width >= 150 &&
    height >= 100 &&
    node.children.length > 0
  ) {
    return {
      node,
      elementType: "card",
      confidence: 0.7,
      shadcnComponent: "Card",
      props: {},
    };
  }

  // Checkbox: small square
  if (width >= 14 && width <= 24 && height >= 14 && height <= 24 && Math.abs(aspectRatio - 1) < 0.1) {
    return {
      node,
      elementType: "checkbox",
      confidence: 0.7,
      shadcnComponent: "Checkbox",
      props: {},
    };
  }

  // Switch: small horizontal pill
  if (width >= 36 && width <= 60 && height >= 18 && height <= 28 && aspectRatio > 1.5) {
    return {
      node,
      elementType: "switch",
      confidence: 0.7,
      shadcnComponent: "Switch",
      props: {},
    };
  }

  // Badge: small pill with text
  if (hasText && hasFill && height <= 28 && width <= 100 && borderRadius > height / 3) {
    return {
      node,
      elementType: "badge",
      confidence: 0.7,
      shadcnComponent: "Badge",
      props: {},
      textContent,
    };
  }

  // Separator: very thin horizontal or vertical
  if ((height <= 2 && width >= 50) || (width <= 2 && height >= 50)) {
    return {
      node,
      elementType: "separator",
      confidence: 0.85,
      shadcnComponent: "Separator",
      props: { orientation: height <= 2 ? "horizontal" : "vertical" },
    };
  }

  // Image: has image fill
  if (node.hasImageFill || node.imageBase64) {
    return {
      node,
      elementType: "image",
      confidence: 0.95,
      shadcnComponent: null,
      props: { src: node.imageBase64 || "" },
    };
  }

  // Header detection: at top, full width, contains navigation
  if (node.y <= 20 && width >= 300 && height <= 80) {
    return {
      node,
      elementType: "header",
      confidence: 0.6,
      shadcnComponent: null,
      props: {},
    };
  }

  // Footer detection: at bottom (relative to parent), full width
  if (height <= 80 && width >= 300) {
    return {
      node,
      elementType: "footer",
      confidence: 0.4,
      shadcnComponent: null,
      props: {},
    };
  }

  // Default to container
  return {
    node,
    elementType: "container",
    confidence: 0.5,
    shadcnComponent: null,
    props: {},
  };
}

// --- Ellipse Classification ---

function classifyEllipseNode(node: ExtractedNode): Omit<ClassifiedElement, "children"> {
  const { width, height } = node;
  const isCircle = Math.abs(width - height) < 2;

  // Avatar: circle, moderate size
  if (isCircle && width >= 24 && width <= 120) {
    return {
      node,
      elementType: "avatar",
      confidence: 0.8,
      shadcnComponent: "Avatar",
      props: {},
    };
  }

  // Radio: small circle
  if (isCircle && width >= 12 && width <= 24) {
    return {
      node,
      elementType: "radio",
      confidence: 0.7,
      shadcnComponent: "RadioGroup",
      props: {},
    };
  }

  // Default to decorative/icon
  return {
    node,
    elementType: "icon",
    confidence: 0.5,
    shadcnComponent: null,
    props: {},
  };
}

// --- Vector Classification ---

function classifyVectorNode(node: ExtractedNode): Omit<ClassifiedElement, "children"> {
  const { width, height } = node;

  // Separator: very thin line
  if (node.type === "LINE" || (height <= 2 && width >= 30) || (width <= 2 && height >= 30)) {
    return {
      node,
      elementType: "separator",
      confidence: 0.85,
      shadcnComponent: "Separator",
      props: { orientation: height <= 2 ? "horizontal" : "vertical" },
    };
  }

  // Icon: small vector
  if (width <= 32 && height <= 32) {
    return {
      node,
      elementType: "icon",
      confidence: 0.8,
      shadcnComponent: null,
      props: { name: node.name },
    };
  }

  // Larger vector - treat as image
  return {
    node,
    elementType: "image",
    confidence: 0.5,
    shadcnComponent: null,
    props: {},
  };
}

// --- Helper Functions ---

function hasTextChild(node: ExtractedNode): boolean {
  if (node.textContent) return true;
  for (const child of node.children) {
    if (hasTextChild(child)) return true;
  }
  return false;
}

function extractTextFromNode(node: ExtractedNode): string {
  if (node.textContent) return node.textContent;
  for (const child of node.children) {
    const text = extractTextFromNode(child);
    if (text) return text;
  }
  return "";
}

function extractPlaceholder(node: ExtractedNode): string {
  const text = extractTextFromNode(node);
  if (text && text.length < 50) return text;
  return "Enter value...";
}

function getMaxBorderRadius(node: ExtractedNode): number {
  if (!node.borderRadius) return 0;
  return Math.max(
    node.borderRadius.topLeft,
    node.borderRadius.topRight,
    node.borderRadius.bottomLeft,
    node.borderRadius.bottomRight
  );
}

function detectButtonVariant(node: ExtractedNode): string {
  const name = (node.name || "").toLowerCase();
  const componentName = (node.componentName || "").toLowerCase();

  // Check componentProperties first (most reliable - from Figma variant system)
  if (node.componentProperties) {
    const propValues = Object.values(node.componentProperties)
      .map(p => (typeof p.value === "string" ? p.value : String(p.value)).toLowerCase())
      .join(" ");

    if (propValues.includes("secondary") || propValues.includes("outline")) return "outline";
    if (propValues.includes("ghost") || propValues.includes("text") || propValues.includes("link")) return "ghost";
    if (propValues.includes("destructive") || propValues.includes("danger") || propValues.includes("delete")) return "destructive";
    if (propValues.includes("primary") || propValues.includes("filled") || propValues.includes("solid")) return "default";
  }

  // Check componentName (e.g., "Button/Secondary" or "Style=Outline")
  if (componentName.includes("secondary") || componentName.includes("outline")) return "outline";
  if (componentName.includes("ghost") || componentName.includes("text") || componentName.includes("link")) return "ghost";
  if (componentName.includes("destructive") || componentName.includes("danger") || componentName.includes("delete")) return "destructive";

  // Check node name for variant hints
  if (name.includes("secondary") || name.includes("outline") || name.includes("cancel") || name.includes("back")) return "outline";
  if (name.includes("ghost") || name.includes("skip") || name.includes("link")) return "ghost";
  if (name.includes("destructive") || name.includes("delete") || name.includes("danger") || name.includes("remove")) return "destructive";

  // Check fill color for destructive
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === "solid" && fill.color) {
      const { r, g, b } = fill.color;
      // Red-ish color suggests destructive
      if (r > 0.7 && g < 0.4 && b < 0.4) {
        return "destructive";
      }
    }
  }

  // Check for outline style (has stroke, no/light fill)
  if (node.strokes && node.strokes.length > 0) {
    const hasFill = node.fills && node.fills.some(f => f.opacity > 0.1);
    if (!hasFill) {
      return "outline";
    }
  }

  return "default";
}

/**
 * Get all classified elements of a specific type from a tree.
 */
export function findElementsByType(
  root: ClassifiedElement,
  type: UIElementType
): ClassifiedElement[] {
  const results: ClassifiedElement[] = [];

  function traverse(el: ClassifiedElement) {
    if (el.elementType === type) {
      results.push(el);
    }
    for (const child of el.children) {
      traverse(child);
    }
  }

  traverse(root);
  return results;
}

/**
 * Get a flat list of all classified elements.
 */
export function flattenClassifiedTree(root: ClassifiedElement): ClassifiedElement[] {
  const results: ClassifiedElement[] = [root];

  function traverse(el: ClassifiedElement) {
    for (const child of el.children) {
      results.push(child);
      traverse(child);
    }
  }

  traverse(root);
  return results;
}
