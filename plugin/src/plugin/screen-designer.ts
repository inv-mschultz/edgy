/**
 * Screen Designer
 *
 * Generates complete, sensible UI layouts for missing screens.
 * Creates proper compositions based on screen type and flow context.
 *
 * Enhanced with:
 * - Component cloning from existing screens
 * - Pattern analysis for layout consistency
 * - Smart label generation
 */

import type { MissingScreenFinding } from "../ui/lib/types";
import { renderComponentStack } from "./component-renderer";
import {
  discoverComponents,
  findBestComponent,
  createComponentInstance,
  type ComponentLibrary,
} from "./component-library";
import {
  analyzeScreens,
  cloneInstance,
  findBestInstance,
  generateSmartLabels,
  type ScreenAnalysis,
  type DiscoveredInstance,
} from "./screen-analyzer";

// --- Types ---

interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * A color value with optional variable binding for Figma variable support.
 */
export interface BoundColor {
  color: RGB;
  variableId?: string; // Figma variable ID for binding
}

/**
 * Semantic color tokens for design system.
 * All colors are optional - defaults will be used if not provided.
 * Colors can include variable IDs for proper Figma variable binding.
 */
export interface SemanticColorTokens {
  primary?: RGB;
  primaryForeground?: RGB;
  secondary?: RGB;
  secondaryForeground?: RGB;
  destructive?: RGB;
  destructiveForeground?: RGB;
  muted?: RGB;
  mutedForeground?: RGB;
  accent?: RGB;
  accentForeground?: RGB;
  background?: RGB;
  foreground?: RGB;
  card?: RGB;
  cardForeground?: RGB;
  border?: RGB;
  input?: RGB;
  ring?: RGB;
  success?: RGB;
  successForeground?: RGB;
}

/**
 * Variable bindings for semantic colors.
 * Maps color role names to Figma variable IDs.
 */
export interface VariableBindings {
  primary?: string;
  primaryForeground?: string;
  secondary?: string;
  secondaryForeground?: string;
  destructive?: string;
  destructiveForeground?: string;
  muted?: string;
  mutedForeground?: string;
  accent?: string;
  accentForeground?: string;
  background?: string;
  foreground?: string;
  card?: string;
  cardForeground?: string;
  border?: string;
  input?: string;
  ring?: string;
  success?: string;
  successForeground?: string;
}

export interface DesignTokens {
  // Legacy fields (for backward compatibility)
  primaryColor: RGB;
  backgroundColor: RGB;
  textColor: RGB;
  mutedColor: RGB;
  borderColor: RGB;
  // Typography & layout
  borderRadius: number;
  fontFamily: string;
  baseFontSize: number;
  headingFontSize: number;
  // New semantic colors (optional)
  semanticColors?: SemanticColorTokens;
  // Variable bindings for Figma variable support
  variableBindings?: VariableBindings;
}

// --- Default Colors (shadcn/ui design system) ---

const DEFAULT_COLORS = {
  background: { r: 1, g: 1, b: 1 },
  foreground: { r: 0.09, g: 0.09, b: 0.09 },
  muted: { r: 0.96, g: 0.96, b: 0.96 },
  mutedForeground: { r: 0.45, g: 0.45, b: 0.45 },
  primary: { r: 0.09, g: 0.09, b: 0.09 },
  primaryForeground: { r: 1, g: 1, b: 1 },
  secondary: { r: 0.96, g: 0.96, b: 0.96 },
  destructive: { r: 0.94, g: 0.27, b: 0.27 },
  destructiveForeground: { r: 1, g: 1, b: 1 },
  border: { r: 0.9, g: 0.9, b: 0.9 },
  success: { r: 0.13, g: 0.55, b: 0.13 },
  successBg: { r: 0.92, g: 0.97, b: 0.92 },
};

// Active colors (can be overridden by design tokens)
let COLORS = { ...DEFAULT_COLORS };

// Active variable bindings (Figma variable IDs for each color role)
let VARIABLE_BINDINGS: VariableBindings = {};

// Active design settings
let BORDER_RADIUS = 8;
let FONT_FAMILY = "Inter";
let BASE_FONT_SIZE = 14;
let HEADING_FONT_SIZE = 24;

// Active component library and analysis (module-level for fallback functions)
let ACTIVE_COMPONENT_LIBRARY: ComponentLibrary | null = null;
let ACTIVE_SCREEN_ANALYSIS: ScreenAnalysis | null = null;

/**
 * Apply a solid fill to a node, binding to a Figma variable if available.
 */
async function applyBoundFill(
  node: GeometryMixin & SceneNode,
  colorKey: keyof typeof COLORS
): Promise<void> {
  const color = COLORS[colorKey];
  const variableId = VARIABLE_BINDINGS[colorKey as keyof VariableBindings];

  // Create the base fill
  const fill: SolidPaint = { type: "SOLID", color };
  node.fills = [fill];

  // Try to bind to variable if available
  if (variableId) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (variable) {
        const fillsCopy = [...(node.fills as SolidPaint[])];
        fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], "color", variable);
        node.fills = fillsCopy;
      }
    } catch (e) {
      // Variable binding failed, RGB fill already applied
      console.warn(`[edgy] Failed to bind variable ${variableId}:`, e);
    }
  }
}

/**
 * Apply a solid stroke to a node, binding to a Figma variable if available.
 */
async function applyBoundStroke(
  node: GeometryMixin & MinimalStrokesMixin & SceneNode,
  colorKey: keyof typeof COLORS,
  weight: number = 1
): Promise<void> {
  const color = COLORS[colorKey];
  const variableId = VARIABLE_BINDINGS[colorKey as keyof VariableBindings];

  // Create the base stroke
  const stroke: SolidPaint = { type: "SOLID", color };
  node.strokes = [stroke];
  node.strokeWeight = weight;

  // Try to bind to variable if available
  if (variableId) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (variable) {
        const strokesCopy = [...(node.strokes as SolidPaint[])];
        strokesCopy[0] = figma.variables.setBoundVariableForPaint(strokesCopy[0], "color", variable);
        node.strokes = strokesCopy;
      }
    } catch (e) {
      // Variable binding failed, RGB stroke already applied
      console.warn(`[edgy] Failed to bind stroke variable ${variableId}:`, e);
    }
  }
}

/**
 * Apply design tokens to override default styling.
 * Supports both legacy token format and new semantic colors.
 */
function applyDesignTokens(tokens?: DesignTokens): void {
  if (!tokens) {
    // Reset to defaults
    COLORS = { ...DEFAULT_COLORS };
    VARIABLE_BINDINGS = {};
    BORDER_RADIUS = 8;
    FONT_FAMILY = "Inter";
    BASE_FONT_SIZE = 14;
    HEADING_FONT_SIZE = 24;
    return;
  }

  const sem = tokens.semanticColors;

  // Apply token overrides - prefer semantic colors, fall back to legacy fields
  // Sanitize all colors to ensure no alpha values (Figma rejects 'a' property in colors)
  COLORS = {
    ...DEFAULT_COLORS,
    // Primary colors
    primary: sanitizeColor(sem?.primary ?? tokens.primaryColor),
    primaryForeground: sanitizeColor(sem?.primaryForeground ?? DEFAULT_COLORS.primaryForeground),
    // Secondary colors
    secondary: sanitizeColor(sem?.secondary ?? DEFAULT_COLORS.secondary),
    // Background and foreground
    background: sanitizeColor(sem?.background ?? tokens.backgroundColor),
    foreground: sanitizeColor(sem?.foreground ?? tokens.textColor),
    // Muted colors
    muted: sanitizeColor(sem?.muted ?? DEFAULT_COLORS.muted),
    mutedForeground: sanitizeColor(sem?.mutedForeground ?? tokens.mutedColor),
    // Destructive colors
    destructive: sanitizeColor(sem?.destructive ?? DEFAULT_COLORS.destructive),
    destructiveForeground: sanitizeColor(sem?.destructiveForeground ?? DEFAULT_COLORS.destructiveForeground),
    // Border colors
    border: sanitizeColor(sem?.border ?? tokens.borderColor),
    // Success colors
    success: sanitizeColor(sem?.success ?? DEFAULT_COLORS.success),
    successBg: sanitizeColor(sem?.successForeground ?? DEFAULT_COLORS.successBg),
  };

  // Store variable bindings for use when creating nodes
  VARIABLE_BINDINGS = tokens.variableBindings || {};

  BORDER_RADIUS = tokens.borderRadius;
  FONT_FAMILY = tokens.fontFamily;
  BASE_FONT_SIZE = tokens.baseFontSize;
  HEADING_FONT_SIZE = tokens.headingFontSize;
}

// --- Component Library Cache ---

let componentLibraryCache: ComponentLibrary | null = null;

async function getOrDiscoverComponents(): Promise<ComponentLibrary> {
  if (!componentLibraryCache) {
    console.log("[edgy] Discovering components...");
    componentLibraryCache = await discoverComponents();
    console.log(`[edgy] Component library: ${componentLibraryCache.buttons.length} buttons, ${componentLibraryCache.inputs.length} inputs, ${componentLibraryCache.toggles.length} toggles`);
  }
  return componentLibraryCache;
}

// --- Screen Analysis Cache ---

let screenAnalysisCache: ScreenAnalysis | null = null;
let analyzedFrameIds: Set<string> = new Set();

/**
 * Get or create screen analysis from existing frames.
 * Caches the analysis for reuse across multiple screen generations.
 */
export async function getOrAnalyzeScreens(frames: FrameNode[]): Promise<ScreenAnalysis> {
  // Check if we need to re-analyze
  const currentIds = new Set(frames.map(f => f.id));
  const idsMatch = analyzedFrameIds.size === currentIds.size &&
    [...analyzedFrameIds].every(id => currentIds.has(id));

  if (!screenAnalysisCache || !idsMatch) {
    console.log(`[edgy] Analyzing ${frames.length} screens for pattern extraction...`);
    screenAnalysisCache = await analyzeScreens(frames);
    analyzedFrameIds = currentIds;

    // Log what we found
    const { instances, patterns } = screenAnalysisCache;
    console.log(`[edgy] Found: ${instances.buttons.length} buttons, ${instances.inputs.length} inputs, ${instances.cards.length} cards`);
    console.log(`[edgy] Patterns: padding=${patterns.paddings[0] || 24}px, gap=${patterns.gaps[0] || 16}px, alignment=${patterns.alignment}`);
  }

  return screenAnalysisCache;
}

/**
 * Clear the screen analysis cache (call when starting a new analysis).
 */
export function clearScreenAnalysisCache(): void {
  screenAnalysisCache = null;
  analyzedFrameIds.clear();
}

// --- Font Loading ---

let fontsLoaded = false;

/**
 * Load Inter fonts for all generated screens.
 * We always use Inter to ensure consistent, reliable rendering.
 */
async function ensureFonts(): Promise<void> {
  if (!fontsLoaded) {
    await Promise.all([
      figma.loadFontAsync({ family: "Inter", style: "Bold" }),
      figma.loadFontAsync({ family: "Inter", style: "Semi Bold" }),
      figma.loadFontAsync({ family: "Inter", style: "Medium" }),
      figma.loadFontAsync({ family: "Inter", style: "Regular" }),
    ]);
    fontsLoaded = true;
  }
  // Always use Inter for generated screens
  FONT_FAMILY = "Inter";
}

// --- Main Designer ---

/**
 * Design a screen using static templates enhanced with component cloning.
 *
 * @param finding - The missing screen finding
 * @param width - Screen width
 * @param height - Screen height
 * @param tokens - Design tokens (colors, fonts, etc.)
 * @param existingFrames - Optional existing frames to analyze for component reuse
 */
export async function designScreen(
  finding: MissingScreenFinding,
  width: number,
  height: number,
  tokens?: DesignTokens,
  existingFrames?: FrameNode[]
): Promise<FrameNode> {
  // Apply design tokens
  applyDesignTokens(tokens);

  // Load Inter fonts (always use Inter for reliable rendering)
  await ensureFonts();

  // Analyze existing screens if provided
  let analysis: ScreenAnalysis | null = null;
  if (existingFrames && existingFrames.length > 0) {
    analysis = await getOrAnalyzeScreens(existingFrames);

    // Apply layout patterns from analysis
    if (analysis.patterns.paddings[0]) {
      ACTIVE_PADDING = analysis.patterns.paddings[0];
    }
    if (analysis.patterns.gaps[0]) {
      ACTIVE_GAP = analysis.patterns.gaps[0];
    }
    if (analysis.patterns.contentWidths[0]) {
      ACTIVE_CONTENT_WIDTH = Math.min(analysis.patterns.contentWidths[0], width - 48);
    }

    // Apply font sizes from analysis (but keep Inter font family)
    if (analysis.textStyles.heading.fontSize) {
      HEADING_FONT_SIZE = analysis.textStyles.heading.fontSize;
    }
    if (analysis.textStyles.body.fontSize) {
      BASE_FONT_SIZE = analysis.textStyles.body.fontSize;
    }

    // Extract button colors from analysis and apply to COLORS.primary if no semantic colors provided
    // This ensures buttons match the existing design even when cloning fails
    if (analysis.instances.buttons.length > 0 && !tokens?.semanticColors?.primary) {
      const primaryButton = findBestInstance(analysis.instances.buttons, "primary");
      if (primaryButton?.fillColor) {
        COLORS.primary = primaryButton.fillColor;
        console.log("[edgy] Applied button color from analysis:", primaryButton.fillColor);
      }
      if (primaryButton?.textColor) {
        COLORS.primaryForeground = primaryButton.textColor;
      }
    }
  }

  // Generate smart labels for this screen
  const labels = generateSmartLabels(finding.missing_screen.name, finding.flow_type);

  // Discover component library for instantiating design system components
  const componentLibrary = await getOrDiscoverComponents();

  // Set module-level variables so even fallback functions can use the library
  ACTIVE_COMPONENT_LIBRARY = componentLibrary;
  ACTIVE_SCREEN_ANALYSIS = analysis;

  const frame = figma.createFrame();
  frame.name = finding.missing_screen.name || "Screen";
  frame.resize(width, height);
  frame.fills = [{ type: "SOLID", color: COLORS.background }];
  frame.cornerRadius = 0; // Screen frames should have no border radius

  const screenId = finding.missing_screen.id.toLowerCase();
  const flowType = finding.flow_type.toLowerCase();

  // Create design context for enhanced rendering
  const context: DesignContext = {
    analysis,
    componentLibrary,
    labels,
    width,
    height,
    padding: ACTIVE_PADDING,
    gap: ACTIVE_GAP,
    sectionGap: SECTION_GAP,
    contentWidth: ACTIVE_CONTENT_WIDTH || Math.min(width - 48, 327),
    centerX: width / 2,
  };

  // Route to specific designer based on screen type
  // All functions now use context for component library access
  if (flowType === "authentication") {
    await designAuthScreenEnhanced(frame, screenId, context);
  } else if (flowType === "checkout") {
    await designCheckoutScreenEnhanced(frame, screenId, context);
  } else if (flowType === "onboarding") {
    await designOnboardingScreenEnhanced(frame, screenId, context);
  } else if (flowType === "crud") {
    await designCrudScreenEnhanced(frame, screenId, context);
  } else if (flowType === "search") {
    await designSearchScreenEnhanced(frame, screenId, context);
  } else if (flowType === "settings") {
    await designSettingsScreenEnhanced(frame, screenId, context);
  } else if (flowType === "upload") {
    await designUploadScreenEnhanced(frame, screenId, context);
  } else {
    // Generic fallback with enhancement
    await designGenericScreenEnhanced(frame, finding, context);
  }

  // Post-process: fix button hierarchy based on proximity
  await fixButtonProximityVariants(frame, context);

  // Post-process: fix centering for frame elements with children
  fixCenteringForFrames(frame);

  return frame;
}

/**
 * Post-processing: Ensure frames with children are properly centered.
 * Applies to frames that have auto-layout and should center their content.
 */
function fixCenteringForFrames(root: FrameNode): void {
  function processFrame(frame: FrameNode): void {
    // If this is an auto-layout frame, ensure proper alignment
    if (frame.layoutMode !== "NONE") {
      // Check if content should be centered (based on name or children)
      const nameLower = frame.name.toLowerCase();
      if (nameLower.includes("center") || nameLower.includes("button") || nameLower.includes("action")) {
        // Ensure counter-axis centering
        frame.counterAxisAlignItems = "CENTER";
      }
    }

    // Recurse into children
    for (const child of frame.children) {
      if (child.type === "FRAME") {
        processFrame(child);
      }
    }
  }

  processFrame(root);
}

/**
 * Post-processing: When two buttons are within 64px of each other,
 * the one that is lower or to the left should be secondary (not primary).
 * This ensures proper visual hierarchy (primary action on right/top).
 */
async function fixButtonProximityVariants(frame: FrameNode, context: DesignContext): Promise<void> {
  const PROXIMITY_THRESHOLD = 64;

  // Find all button-like nodes (instances or frames named with "button" or "btn")
  const buttons: { node: SceneNode; x: number; y: number; isPrimary: boolean }[] = [];

  function findButtons(parent: SceneNode): void {
    if (!("children" in parent)) return;

    for (const child of (parent as FrameNode).children) {
      const nameLower = child.name.toLowerCase();
      const isButton = nameLower.includes("button") || nameLower.includes("btn") ||
        (child.type === "INSTANCE" && child.name.toLowerCase().includes("button"));

      if (isButton && "x" in child && "y" in child) {
        // Determine if this looks like a primary button
        let isPrimary = false;
        if (child.type === "INSTANCE") {
          // Check variant properties
          const props = child.componentProperties;
          if (props) {
            const propsStr = JSON.stringify(props).toLowerCase();
            isPrimary = propsStr.includes("primary") || propsStr.includes("filled") || propsStr.includes("solid");
          }
        } else if (child.type === "FRAME" && "fills" in child) {
          // Check if it has a solid colored fill (primary buttons usually do)
          const fills = child.fills as Paint[];
          if (fills && fills.length > 0) {
            const solidFill = fills.find(f => f.type === "SOLID" && f.visible !== false);
            if (solidFill && solidFill.type === "SOLID") {
              // Not white/transparent = likely primary
              const { r, g, b } = solidFill.color;
              isPrimary = !(r > 0.95 && g > 0.95 && b > 0.95); // Not white
            }
          }
        }

        // Get absolute position
        const absX = getAbsoluteX(child, frame);
        const absY = getAbsoluteY(child, frame);

        buttons.push({ node: child, x: absX, y: absY, isPrimary });
      }

      // Recurse
      if ("children" in child) {
        findButtons(child);
      }
    }
  }

  findButtons(frame);

  if (buttons.length < 2) return;

  // Group buttons by proximity
  const groups: typeof buttons[] = [];
  const assigned = new Set<SceneNode>();

  for (const btn of buttons) {
    if (assigned.has(btn.node)) continue;

    const group = [btn];
    assigned.add(btn.node);

    // Find other buttons within proximity
    for (const other of buttons) {
      if (assigned.has(other.node)) continue;

      const dx = Math.abs(btn.x - other.x);
      const dy = Math.abs(btn.y - other.y);

      // Within proximity (either horizontally or vertically aligned)
      if (dx <= PROXIMITY_THRESHOLD || dy <= PROXIMITY_THRESHOLD) {
        group.push(other);
        assigned.add(other.node);
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  // For each group, ensure only ONE primary (the rightmost or topmost)
  for (const group of groups) {
    // Sort to find the "primary" position:
    // - If horizontally arranged (similar Y): rightmost is primary
    // - If vertically arranged (similar X): topmost (lower Y) is primary
    const ySpread = Math.max(...group.map(b => b.y)) - Math.min(...group.map(b => b.y));
    const xSpread = Math.max(...group.map(b => b.x)) - Math.min(...group.map(b => b.x));

    let primaryBtn: typeof group[0];
    if (xSpread > ySpread) {
      // Horizontally arranged - rightmost is primary
      primaryBtn = group.reduce((max, b) => b.x > max.x ? b : max, group[0]);
    } else {
      // Vertically arranged - bottom is typically primary (above the fold)
      primaryBtn = group.reduce((max, b) => b.y > max.y ? b : max, group[0]);
    }

    // Make others secondary by swapping with secondary variant if possible
    for (const btn of group) {
      if (btn === primaryBtn) continue;

      // Try to swap to secondary variant
      if (btn.node.type === "INSTANCE" && context.componentLibrary) {
        const secondaryComp = findBestComponent(context.componentLibrary, "button", "secondary");
        if (secondaryComp) {
          try {
            const newInstance = await createComponentInstance(secondaryComp.key);
            if (newInstance) {
              // Copy text content
              const oldTexts = btn.node.findAll(n => n.type === "TEXT") as TextNode[];
              const newTexts = newInstance.findAll(n => n.type === "TEXT") as TextNode[];
              if (oldTexts.length > 0 && newTexts.length > 0) {
                const text = oldTexts[0].characters;
                await applyTextToInstance(newInstance, text);
              }

              // Copy position and size
              newInstance.x = btn.node.x;
              newInstance.y = btn.node.y;
              if (Math.abs(newInstance.width - btn.node.width) > 10) {
                newInstance.resize(btn.node.width, newInstance.height);
              }

              // Replace in parent
              const parent = btn.node.parent;
              if (parent && "insertChild" in parent) {
                const index = parent.children.indexOf(btn.node);
                btn.node.remove();
                parent.insertChild(index, newInstance);
                console.log(`[edgy] Swapped button to secondary variant`);
              }
            }
          } catch (e) {
            console.warn("[edgy] Failed to swap button variant:", e);
          }
        }
      }
    }
  }
}

function getAbsoluteX(node: SceneNode, root: FrameNode): number {
  let x = "x" in node ? node.x : 0;
  let parent = node.parent;
  while (parent && parent !== root && "x" in parent) {
    x += parent.x;
    parent = parent.parent;
  }
  return x;
}

function getAbsoluteY(node: SceneNode, root: FrameNode): number {
  let y = "y" in node ? node.y : 0;
  let parent = node.parent;
  while (parent && parent !== root && "y" in parent) {
    y += parent.y;
    parent = parent.parent;
  }
  return y;
}

// --- Active Layout Values (from analysis) ---

let ACTIVE_PADDING = 24;
let ACTIVE_GAP = 16;
let SECTION_GAP = 32; // Larger gap between major screen sections
let ACTIVE_CONTENT_WIDTH: number | null = null;

// --- Design Context ---

interface DesignContext {
  analysis: ScreenAnalysis | null;
  componentLibrary: ComponentLibrary | null;
  labels: ReturnType<typeof generateSmartLabels>;
  width: number;
  height: number;
  padding: number;
  gap: number;
  sectionGap: number; // Larger gap between major screen sections
  contentWidth: number;
  centerX: number;
}

// --- Enhanced Design Functions (with component cloning) ---

/**
 * Try to clone a button from existing screens, or instantiate from component library.
 * Falls back to raw frame creation only if both methods fail.
 */
async function createButtonFromAnalysis(
  context: DesignContext,
  label: string,
  variant: "primary" | "secondary" | "outline" | "destructive" | "ghost" | "link" = "primary",
  width?: number
): Promise<SceneNode> {
  const { analysis, componentLibrary, contentWidth } = context;
  const buttonWidth = width || contentWidth;

  // Auto-detect destructive variant from label
  const labelLower = label.toLowerCase();
  if (variant === "primary" && (
    labelLower.includes("delete") || labelLower.includes("remove") ||
    labelLower.includes("destroy") || labelLower.includes("cancel account") ||
    labelLower.includes("deactivate")
  )) {
    variant = "destructive";
  }

  // Find the best matching button from analysis (cloned instances)
  let bestButton: ReturnType<typeof findBestInstance> = null;
  if (analysis && analysis.instances.buttons.length > 0) {
    bestButton = findBestInstance(analysis.instances.buttons, variant);
  }

  // Try to clone from existing screens first
  if (bestButton) {
    try {
      const clone = await cloneInstance(bestButton, { "*": label, "label": label, "text": label });
      // Resize to fit content width if needed
      if (Math.abs(clone.width - buttonWidth) > 20) {
        clone.resize(buttonWidth, clone.height);
      }
      console.log(`[edgy] Cloned button "${variant}" from analysis`);
      return clone;
    } catch (e) {
      console.warn("[edgy] Failed to clone button instance:", e);
    }
  }

  // Try to instantiate from component library (main components)
  if (componentLibrary) {
    // Map variant aliases for component library lookup
    let variantName = variant;
    if (variant === "secondary") variantName = "outline";

    const bestComponent = findBestComponent(componentLibrary, "button", variantName);
    if (bestComponent) {
      try {
        const instance = await createComponentInstance(bestComponent.key);
        if (instance) {
          // Apply text override
          await applyTextToInstance(instance, label);
          // Resize if needed - but not for link/ghost buttons which should hug content
          if (variant !== "link" && variant !== "ghost" && Math.abs(instance.width - buttonWidth) > 20) {
            instance.resize(buttonWidth, instance.height);
          }
          console.log(`[edgy] Instantiated button "${variant}" from library: ${bestComponent.name}`);
          return instance;
        }
      } catch (e) {
        console.warn("[edgy] Failed to instantiate button component:", e);
      }
    }
  }

  // Fallback to created button, using extracted colors if available
  console.log(`[edgy] Falling back to hardcoded button for "${variant}"`);
  const colorOverrides: ButtonColorOverrides | undefined = bestButton
    ? {
        bgColor: bestButton.fillColor,
        textColor: bestButton.textColor,
      }
    : undefined;

  // Map variants for fallback creation
  let fallbackVariant: "primary" | "outline" | "destructive" | "ghost" = "primary";
  if (variant === "secondary" || variant === "outline") fallbackVariant = "outline";
  else if (variant === "destructive") fallbackVariant = "destructive";
  else if (variant === "ghost" || variant === "link") fallbackVariant = "ghost";

  return createButton(label, fallbackVariant, buttonWidth, colorOverrides);
}

/**
 * Apply text to a component instance by finding and updating text nodes.
 */
async function applyTextToInstance(instance: InstanceNode, text: string): Promise<void> {
  const textNodes = instance.findAll((n) => n.type === "TEXT") as TextNode[];
  for (const textNode of textNodes) {
    try {
      const fontName = textNode.fontName;
      if (fontName !== figma.mixed) {
        await figma.loadFontAsync(fontName);
      }
      textNode.characters = text;
      return; // Only update the first text node (usually the label)
    } catch (e) {
      console.warn("[edgy] Failed to apply text to instance:", e);
    }
  }
}

/**
 * Try to clone an input from existing screens, or instantiate from component library.
 * @param value - Optional pre-filled value (if provided, shows value instead of placeholder)
 */
async function createInputFromAnalysis(
  context: DesignContext,
  label: string,
  placeholder: string,
  width?: number,
  value?: string
): Promise<SceneNode> {
  const { analysis, componentLibrary, contentWidth } = context;
  const inputWidth = width || contentWidth;
  const displayText = value || placeholder;

  // Filter out OTP inputs - they're not suitable for regular text fields
  const regularInputs = analysis?.instances?.inputs?.filter(
    (i) => !i.componentName.toLowerCase().includes("otp")
  ) || [];

  console.log(`[edgy] createInputFromAnalysis: label="${label}", regular inputs=${regularInputs.length}, library inputs=${componentLibrary?.inputs?.length || 0}`);

  // Try to clone from existing screens (excluding OTP)
  if (regularInputs.length > 0) {
    const bestInput = findBestInstance(regularInputs);
    console.log(`[edgy] Found best input instance:`, bestInput?.componentName);
    if (bestInput) {
      try {
        const clone = await cloneInstance(bestInput, {
          "label": label,
          "placeholder": displayText,
          "value": value || "",
          "*": displayText,
        });
        console.log(`[edgy] Successfully cloned input from analysis`);
        // Resize to fit content width if needed
        if (Math.abs(clone.width - inputWidth) > 20) {
          clone.resize(inputWidth, clone.height);
        }
        return clone;
      } catch (e) {
        console.warn("[edgy] Failed to clone input:", e);
      }
    }
  }

  // Try to instantiate from component library (already excludes OTP in discovery)
  if (componentLibrary && componentLibrary.inputs.length > 0) {
    const bestComponent = findBestComponent(componentLibrary, "input");
    console.log(`[edgy] Found best input component:`, bestComponent?.name);
    if (bestComponent) {
      try {
        const instance = await createComponentInstance(bestComponent.key);
        if (instance) {
          console.log(`[edgy] Successfully instantiated input component`);
          await applyTextToInstance(instance, displayText);
          if (Math.abs(instance.width - inputWidth) > 20) {
            instance.resize(inputWidth, instance.height);
          }
          return instance;
        }
      } catch (e) {
        console.warn("[edgy] Failed to instantiate input component:", e);
      }
    }
  }

  // Fallback to created input
  console.log(`[edgy] Falling back to hardcoded input for "${label}"`);
  if (value) {
    return createLabeledInputWithValue(label, value, inputWidth);
  }
  return createLabeledInput(label, placeholder, inputWidth);
}

/**
 * Try to clone a select/dropdown from existing screens, or instantiate from component library.
 */
async function createSelectFromAnalysis(
  context: DesignContext,
  label: string,
  placeholder: string,
  width?: number
): Promise<SceneNode> {
  const { analysis, componentLibrary, contentWidth } = context;
  const selectWidth = width || contentWidth;

  // Try to clone from existing screens - look for selects in inputs array
  if (analysis && analysis.instances.inputs.length > 0) {
    // Prefer components with "select" or "dropdown" in the name
    const selectInstance = analysis.instances.inputs.find(
      (c) => c.componentName.toLowerCase().includes("select") ||
             c.componentName.toLowerCase().includes("dropdown") ||
             c.componentName.toLowerCase().includes("picker")
    );
    if (selectInstance) {
      try {
        const clone = await cloneInstance(selectInstance, {
          "label": label,
          "placeholder": placeholder,
          "*": placeholder,
        });
        if (Math.abs(clone.width - selectWidth) > 20) {
          clone.resize(selectWidth, clone.height);
        }
        return clone;
      } catch (e) {
        console.warn("[edgy] Failed to clone select:", e);
      }
    }
  }

  // Try to instantiate from component library - look for select components
  if (componentLibrary) {
    // Search all components for a select/dropdown
    const selectComponent = Array.from(componentLibrary.components.values()).find(
      (c) => {
        const name = (c.componentSetName || c.name).toLowerCase();
        return name.includes("select") || name.includes("dropdown") || name.includes("picker");
      }
    );
    if (selectComponent) {
      try {
        const instance = await createComponentInstance(selectComponent.key);
        if (instance) {
          await applyTextToInstance(instance, placeholder);
          if (Math.abs(instance.width - selectWidth) > 20) {
            instance.resize(selectWidth, instance.height);
          }
          return instance;
        }
      } catch (e) {
        console.warn("[edgy] Failed to instantiate select component:", e);
      }
    }
  }

  // Fallback to created select
  return createLabeledSelect(label, placeholder, selectWidth);
}

/**
 * Try to clone a toggle/switch from existing screens, or instantiate from component library.
 * Toggles are preferred for boolean on/off decisions.
 * Always returns a row with label + switch for clarity.
 */
async function createToggleFromAnalysis(
  context: DesignContext,
  label: string,
  enabled: boolean = false
): Promise<SceneNode> {
  const { analysis, componentLibrary, contentWidth } = context;

  // Try to clone from existing screens (look for toggles in checkboxes array since they share the role)
  if (analysis && analysis.instances.checkboxes.length > 0) {
    // Prefer components with "toggle" or "switch" in the name
    const toggleInstance = analysis.instances.checkboxes.find(
      (c) => c.componentName.toLowerCase().includes("toggle") ||
             c.componentName.toLowerCase().includes("switch")
    );
    if (toggleInstance) {
      try {
        const toggle = await cloneInstance(toggleInstance, { "*": label, "label": label });
        // If the cloned instance doesn't have visible text, wrap it with a label
        const hasText = toggle.findOne?.(n => n.type === "TEXT" && n.characters.length > 0);
        if (!hasText) {
          return createToggleRowWithLabel(toggle, label, contentWidth);
        }
        return toggle;
      } catch (e) {
        console.warn("[edgy] Failed to clone toggle:", e);
      }
    }
  }

  // Try to instantiate from component library - try toggle first
  if (componentLibrary) {
    const toggleComponent = findBestComponent(componentLibrary, "toggle");
    if (toggleComponent) {
      try {
        const instance = await createComponentInstance(toggleComponent.key);
        if (instance) {
          // Try to apply text, but if no text nodes exist, wrap with label
          const textNodes = instance.findAll(n => n.type === "TEXT") as TextNode[];
          if (textNodes.length > 0) {
            await applyTextToInstance(instance, label);
            return instance;
          } else {
            // Switch has no label - wrap it with one
            return createToggleRowWithLabel(instance, label, contentWidth);
          }
        }
      } catch (e) {
        console.warn("[edgy] Failed to instantiate toggle component:", e);
      }
    }
  }

  // Fallback to created toggle
  return createToggle(label, enabled);
}

/**
 * Wraps a switch/toggle component with a label in a horizontal row.
 */
function createToggleRowWithLabel(toggle: SceneNode, label: string, width: number): FrameNode {
  const row = figma.createFrame();
  row.name = `Toggle: ${label}`;
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "AUTO";
  row.resize(width, 44);
  row.primaryAxisAlignItems = "SPACE_BETWEEN";
  row.counterAxisAlignItems = "CENTER";
  row.fills = [];

  // Label on the left
  const labelText = figma.createText();
  labelText.fontName = { family: FONT_FAMILY, style: "Regular" };
  labelText.fontSize = BASE_FONT_SIZE;
  labelText.characters = label;
  labelText.fills = [{ type: "SOLID", color: COLORS.foreground }];
  row.appendChild(labelText);

  // Toggle on the right
  row.appendChild(toggle);

  return row;
}

/**
 * Creates a button group with proper vertical spacing.
 * Automatically detects destructive buttons by label.
 */
async function createButtonGroup(
  context: DesignContext,
  buttons: { label: string; variant?: "primary" | "secondary" | "outline" | "destructive" | "ghost" | "link" }[],
  width?: number
): Promise<FrameNode> {
  const { contentWidth, gap } = context;
  const groupWidth = width || contentWidth;

  const group = figma.createFrame();
  group.name = "Button Group";
  group.layoutMode = "VERTICAL";
  group.primaryAxisSizingMode = "AUTO";
  group.counterAxisSizingMode = "FIXED";
  group.resize(groupWidth, 100);
  group.itemSpacing = gap;
  group.fills = [];

  for (let i = 0; i < buttons.length; i++) {
    const { label } = buttons[i];
    let { variant } = buttons[i];

    // Auto-detect destructive buttons by label
    if (!variant) {
      const labelLower = label.toLowerCase();
      if (labelLower.includes("delete") || labelLower.includes("remove") ||
          labelLower.includes("destroy") || labelLower.includes("cancel account")) {
        variant = "destructive";
      } else if (i === 0) {
        variant = "primary";
      } else {
        variant = "secondary";
      }
    }

    const btn = await createButtonFromAnalysis(context, label, variant, groupWidth);
    group.appendChild(btn);
  }

  return group;
}

/**
 * Try to clone a checkbox from existing screens, or instantiate from component library.
 * For boolean on/off states, consider using createToggleFromAnalysis instead.
 */
async function createCheckboxFromAnalysis(
  context: DesignContext,
  label: string
): Promise<SceneNode> {
  const { analysis, componentLibrary } = context;

  // Try to clone from existing screens
  if (analysis && analysis.instances.checkboxes.length > 0) {
    // Find actual checkboxes (not toggles)
    const checkboxInstance = analysis.instances.checkboxes.find(
      (c) => !c.componentName.toLowerCase().includes("toggle") &&
             !c.componentName.toLowerCase().includes("switch")
    );
    if (checkboxInstance) {
      try {
        return await cloneInstance(checkboxInstance, { "*": label, "label": label });
      } catch (e) {
        console.warn("[edgy] Failed to clone checkbox:", e);
      }
    }
  }

  // Try to instantiate from component library
  if (componentLibrary) {
    const bestComponent = findBestComponent(componentLibrary, "checkbox");
    if (bestComponent) {
      try {
        const instance = await createComponentInstance(bestComponent.key);
        if (instance) {
          await applyTextToInstance(instance, label);
          return instance;
        }
      } catch (e) {
        console.warn("[edgy] Failed to instantiate checkbox component:", e);
      }
    }
  }

  return createCheckbox(label);
}

/**
 * Enhanced auth screen designer with component cloning.
 */
async function designAuthScreenEnhanced(
  frame: FrameNode,
  screenId: string,
  context: DesignContext
): Promise<void> {
  const { labels, padding, gap, contentWidth, centerX, height } = context;

  if (screenId === "login" || screenId === "signin") {
    let y = 80;

    // Logo placeholder
    const logo = createLogoPlaceholder();
    logo.x = centerX - 24;
    logo.y = y;
    frame.appendChild(logo);
    y += 68;

    // Title (use smart labels)
    const title = createText(labels.title, HEADING_FONT_SIZE, "Semi Bold", COLORS.foreground);
    title.x = centerX - title.width / 2;
    title.y = y;
    frame.appendChild(title);
    y += 36;

    // Subtitle
    const subtitle = createText(labels.subtitle, BASE_FONT_SIZE, "Regular", COLORS.mutedForeground);
    subtitle.x = centerX - subtitle.width / 2;
    subtitle.y = y;
    frame.appendChild(subtitle);
    y += 40;

    // Form container with analyzed gap
    const form = figma.createFrame();
    form.name = "Form";
    form.layoutMode = "VERTICAL";
    form.itemSpacing = gap;
    form.primaryAxisSizingMode = "AUTO";
    form.counterAxisSizingMode = "FIXED";
    form.resize(contentWidth, 100);
    form.fills = [];
    form.x = centerX - contentWidth / 2;
    form.y = y;

    // Email input (try to clone from existing)
    const emailInput = await createInputFromAnalysis(
      context,
      labels.inputs["email"]?.label || "Email",
      labels.inputs["email"]?.placeholder || "Enter your email",
      contentWidth
    );
    form.appendChild(emailInput);

    // Password input
    const passwordInput = await createInputFromAnalysis(
      context,
      labels.inputs["password"]?.label || "Password",
      labels.inputs["password"]?.placeholder || "Enter your password",
      contentWidth
    );
    form.appendChild(passwordInput);

    // Forgot password link
    const forgotLink = createText("Forgot password?", BASE_FONT_SIZE, "Medium", COLORS.primary);
    form.appendChild(forgotLink);

    // Sign in button (try to clone from existing)
    const signInBtn = await createButtonFromAnalysis(context, labels.primaryButton, "primary");
    form.appendChild(signInBtn);

    // Divider
    const divider = createDivider(contentWidth, "or continue with");
    form.appendChild(divider);

    // Social buttons
    const socialRow = createSocialButtons(contentWidth);
    form.appendChild(socialRow);

    frame.appendChild(form);

    // Sign up link at bottom
    const signupText = createText(
      "Don't have an account? Sign up",
      BASE_FONT_SIZE,
      "Regular",
      COLORS.mutedForeground
    );
    signupText.x = centerX - signupText.width / 2;
    signupText.y = height - 60;
    frame.appendChild(signupText);

  } else if (screenId === "signup" || screenId === "register") {
    await designSignupScreenEnhanced(frame, context);
  } else if (screenId === "forgot-password" || screenId === "forgot_password") {
    await designForgotPasswordScreenEnhanced(frame, context);
  } else if (screenId === "2fa" || screenId === "mfa" || screenId === "verification") {
    await design2FAScreenEnhanced(frame, context);
  } else {
    // Fallback to generic auth
    await designGenericAuthScreenEnhanced(frame, screenId, context);
  }
}

async function designSignupScreenEnhanced(frame: FrameNode, context: DesignContext): Promise<void> {
  const { labels, gap, contentWidth, centerX, height } = context;
  let y = 60;

  // Title
  const title = createText(labels.title, HEADING_FONT_SIZE, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Subtitle
  const subtitle = createText(labels.subtitle, BASE_FONT_SIZE, "Regular", COLORS.mutedForeground);
  subtitle.x = centerX - subtitle.width / 2;
  subtitle.y = y;
  frame.appendChild(subtitle);
  y += 36;

  // Form
  const form = figma.createFrame();
  form.name = "Form";
  form.layoutMode = "VERTICAL";
  form.itemSpacing = gap;
  form.primaryAxisSizingMode = "AUTO";
  form.counterAxisSizingMode = "FIXED";
  form.resize(contentWidth, 100);
  form.fills = [];
  form.x = centerX - contentWidth / 2;
  form.y = y;

  // Fields
  const nameInput = await createInputFromAnalysis(context, "Full Name", "Enter your name");
  form.appendChild(nameInput);

  const emailInput = await createInputFromAnalysis(context, "Email", "Enter your email");
  form.appendChild(emailInput);

  const passwordInput = await createInputFromAnalysis(context, "Password", "Create a password");
  form.appendChild(passwordInput);

  // Terms checkbox
  const terms = await createCheckboxFromAnalysis(context, "I agree to the Terms and Privacy Policy");
  form.appendChild(terms);

  // Create account button
  const createBtn = await createButtonFromAnalysis(context, labels.primaryButton, "primary");
  form.appendChild(createBtn);

  frame.appendChild(form);

  // Login link
  const loginText = createText(
    labels.secondaryButton ? `Already have an account? ${labels.secondaryButton}` : "Already have an account? Sign in",
    BASE_FONT_SIZE,
    "Regular",
    COLORS.mutedForeground
  );
  loginText.x = centerX - loginText.width / 2;
  loginText.y = height - 60;
  frame.appendChild(loginText);
}

async function designForgotPasswordScreenEnhanced(frame: FrameNode, context: DesignContext): Promise<void> {
  const { labels, gap, contentWidth, centerX } = context;
  let y = 120;

  // Icon
  const icon = createIconCircle("✉", COLORS.primary);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  // Title
  const title = createText(labels.title, HEADING_FONT_SIZE, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Description
  const desc = createText(labels.subtitle, BASE_FONT_SIZE, "Regular", COLORS.mutedForeground);
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 40;

  // Form
  const form = figma.createFrame();
  form.name = "Form";
  form.layoutMode = "VERTICAL";
  form.itemSpacing = gap;
  form.primaryAxisSizingMode = "AUTO";
  form.counterAxisSizingMode = "FIXED";
  form.resize(contentWidth, 100);
  form.fills = [];
  form.x = centerX - contentWidth / 2;
  form.y = y;

  // Email input
  const emailInput = await createInputFromAnalysis(context, "Email", "Enter your email");
  form.appendChild(emailInput);

  // Submit button
  const submitBtn = await createButtonFromAnalysis(context, labels.primaryButton, "primary");
  form.appendChild(submitBtn);

  // Back link
  const backBtn = await createButtonFromAnalysis(context, labels.secondaryButton || "Back to Sign In", "outline");
  form.appendChild(backBtn);

  frame.appendChild(form);
}

async function design2FAScreenEnhanced(frame: FrameNode, context: DesignContext): Promise<void> {
  const { labels, gap, contentWidth, centerX } = context;
  let y = 120;

  // Icon
  const icon = createIconCircle("🔐", COLORS.primary);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  // Title
  const title = createText(labels.title, HEADING_FONT_SIZE, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Description
  const desc = createText(labels.subtitle, BASE_FONT_SIZE, "Regular", COLORS.mutedForeground);
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 40;

  // Form
  const form = figma.createFrame();
  form.name = "Form";
  form.layoutMode = "VERTICAL";
  form.itemSpacing = gap;
  form.primaryAxisSizingMode = "AUTO";
  form.counterAxisSizingMode = "FIXED";
  form.resize(contentWidth, 100);
  form.fills = [];
  form.x = centerX - contentWidth / 2;
  form.y = y;

  // Code input
  const codeInput = await createInputFromAnalysis(context, "Verification Code", "Enter 6-digit code");
  form.appendChild(codeInput);

  // Verify button
  const verifyBtn = await createButtonFromAnalysis(context, labels.primaryButton, "primary");
  form.appendChild(verifyBtn);

  // Resend link
  const resendText = createText(labels.secondaryButton || "Resend Code", BASE_FONT_SIZE, "Medium", COLORS.primary);
  resendText.textAlignHorizontal = "CENTER";
  form.appendChild(resendText);

  frame.appendChild(form);
}

async function designGenericAuthScreenEnhanced(
  frame: FrameNode,
  screenId: string,
  context: DesignContext
): Promise<void> {
  const { labels, gap, contentWidth, centerX, height } = context;
  let y = 100;

  // Title
  const title = createText(labels.title, HEADING_FONT_SIZE, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 40;

  // Subtitle
  if (labels.subtitle) {
    const subtitle = createText(labels.subtitle, BASE_FONT_SIZE, "Regular", COLORS.mutedForeground);
    subtitle.x = centerX - subtitle.width / 2;
    subtitle.y = y;
    frame.appendChild(subtitle);
    y += 36;
  }

  // Form
  const form = figma.createFrame();
  form.name = "Form";
  form.layoutMode = "VERTICAL";
  form.itemSpacing = gap;
  form.primaryAxisSizingMode = "AUTO";
  form.counterAxisSizingMode = "FIXED";
  form.resize(contentWidth, 100);
  form.fills = [];
  form.x = centerX - contentWidth / 2;
  form.y = y;

  // Add inputs based on what's in labels
  for (const [key, inputLabels] of Object.entries(labels.inputs)) {
    const input = await createInputFromAnalysis(context, inputLabels.label, inputLabels.placeholder);
    form.appendChild(input);
  }

  // Primary button
  const primaryBtn = await createButtonFromAnalysis(context, labels.primaryButton, "primary");
  form.appendChild(primaryBtn);

  // Secondary button if present
  if (labels.secondaryButton) {
    const secondaryBtn = await createButtonFromAnalysis(context, labels.secondaryButton, "outline");
    form.appendChild(secondaryBtn);
  }

  frame.appendChild(form);
}

/**
 * Enhanced onboarding screen designer with component cloning.
 */
async function designOnboardingScreenEnhanced(
  frame: FrameNode,
  screenId: string,
  context: DesignContext
): Promise<void> {
  const { labels, gap, contentWidth, centerX, height } = context;

  if (screenId.includes("welcome")) {
    await designWelcomeScreenEnhanced(frame, context);
  } else if (screenId.includes("profile")) {
    await designProfileSetupScreenEnhanced(frame, context);
  } else if (screenId.includes("preference") || screenId.includes("setting")) {
    await designPreferencesScreenEnhanced(frame, context);
  } else if (screenId.includes("notification")) {
    await designNotificationSetupScreenEnhanced(frame, context);
  } else if (screenId.includes("complete") || screenId.includes("done") || screenId.includes("success")) {
    await designOnboardingCompleteScreenEnhanced(frame, context);
  } else {
    // Generic onboarding screen
    await designGenericOnboardingScreenEnhanced(frame, screenId, context);
  }
}

async function designWelcomeScreenEnhanced(frame: FrameNode, context: DesignContext): Promise<void> {
  const { labels, gap, contentWidth, centerX, height } = context;

  // Centered welcome content
  const contentY = height / 2 - 100;

  // Welcome illustration placeholder
  const illustration = createContentPlaceholder(200, 200, "Illustration");
  illustration.name = "Illustration";
  illustration.x = centerX - 100;
  illustration.y = contentY - 120;
  frame.appendChild(illustration);

  // Title
  const title = createText(labels.title, HEADING_FONT_SIZE + 4, "Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = contentY + 100;
  frame.appendChild(title);

  // Subtitle
  const subtitle = createText(labels.subtitle, BASE_FONT_SIZE, "Regular", COLORS.mutedForeground);
  subtitle.x = centerX - subtitle.width / 2;
  subtitle.y = contentY + 140;
  frame.appendChild(subtitle);

  // Buttons at bottom
  const primaryBtn = await createButtonFromAnalysis(context, labels.primaryButton, "primary");
  primaryBtn.x = centerX - contentWidth / 2;
  primaryBtn.y = height - 120;
  frame.appendChild(primaryBtn);

  if (labels.secondaryButton) {
    const skipText = createText(labels.secondaryButton, BASE_FONT_SIZE, "Medium", COLORS.mutedForeground);
    skipText.x = centerX - skipText.width / 2;
    skipText.y = height - 60;
    frame.appendChild(skipText);
  }
}

async function designProfileSetupScreenEnhanced(frame: FrameNode, context: DesignContext): Promise<void> {
  const { labels, gap, contentWidth, centerX, height } = context;
  let y = 60;

  // Title
  const title = createText(labels.title, HEADING_FONT_SIZE, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Subtitle
  const subtitle = createText(labels.subtitle, BASE_FONT_SIZE, "Regular", COLORS.mutedForeground);
  subtitle.x = centerX - subtitle.width / 2;
  subtitle.y = y;
  frame.appendChild(subtitle);
  y += 48;

  // Avatar placeholder
  const avatar = figma.createEllipse();
  avatar.name = "Avatar";
  avatar.resize(80, 80);
  avatar.fills = [{ type: "SOLID", color: COLORS.muted }];
  avatar.x = centerX - 40;
  avatar.y = y;
  frame.appendChild(avatar);
  y += 100;

  // Upload photo button (link/ghost style)
  const uploadBtn = await createButtonFromAnalysis(context, "Upload Photo", "link");
  uploadBtn.x = centerX - uploadBtn.width / 2;
  uploadBtn.y = y;
  frame.appendChild(uploadBtn);
  y += 56;

  // Name input
  const nameInput = await createInputFromAnalysis(
    context,
    labels.inputs["name"]?.label || "Display Name",
    labels.inputs["name"]?.placeholder || "What should we call you?"
  );
  nameInput.x = centerX - contentWidth / 2;
  nameInput.y = y;
  if ("resize" in nameInput) {
    (nameInput as FrameNode).resize(contentWidth, (nameInput as FrameNode).height);
  }
  frame.appendChild(nameInput);

  // Buttons at bottom
  const primaryBtn = await createButtonFromAnalysis(context, labels.primaryButton, "primary");
  primaryBtn.x = centerX - contentWidth / 2;
  primaryBtn.y = height - 120;
  frame.appendChild(primaryBtn);

  if (labels.secondaryButton) {
    // Use ghost/link button for secondary action
    const skipBtn = await createButtonFromAnalysis(context, labels.secondaryButton, "ghost");
    skipBtn.x = centerX - skipBtn.width / 2;
    skipBtn.y = height - 60;
    frame.appendChild(skipBtn);
  }
}

async function designPreferencesScreenEnhanced(frame: FrameNode, context: DesignContext): Promise<void> {
  const { labels, gap, contentWidth, centerX, height } = context;
  let y = 60;

  // Title
  const title = createText(labels.title, HEADING_FONT_SIZE, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Subtitle
  const subtitle = createText(labels.subtitle, BASE_FONT_SIZE, "Regular", COLORS.mutedForeground);
  subtitle.x = centerX - subtitle.width / 2;
  subtitle.y = y;
  frame.appendChild(subtitle);
  y += 48;

  // Options container
  const options = figma.createFrame();
  options.name = "Options";
  options.layoutMode = "VERTICAL";
  options.itemSpacing = gap;
  options.primaryAxisSizingMode = "AUTO";
  options.counterAxisSizingMode = "FIXED";
  options.resize(contentWidth, 100);
  options.fills = [];
  options.x = centerX - contentWidth / 2;
  options.y = y;

  // Preference options (use toggles for on/off settings)
  const option1 = await createToggleFromAnalysis(context, "Receive personalized recommendations", true);
  options.appendChild(option1);

  const option2 = await createToggleFromAnalysis(context, "Enable dark mode", false);
  options.appendChild(option2);

  const option3 = await createToggleFromAnalysis(context, "Show activity status", true);
  options.appendChild(option3);

  frame.appendChild(options);

  // Buttons at bottom
  const primaryBtn = await createButtonFromAnalysis(context, labels.primaryButton, "primary");
  primaryBtn.x = centerX - contentWidth / 2;
  primaryBtn.y = height - 120;
  frame.appendChild(primaryBtn);

  if (labels.secondaryButton) {
    const secondaryBtn = await createButtonFromAnalysis(context, labels.secondaryButton, "outline");
    secondaryBtn.x = centerX - contentWidth / 2;
    secondaryBtn.y = height - 60;
    frame.appendChild(secondaryBtn);
  }
}

async function designNotificationSetupScreenEnhanced(frame: FrameNode, context: DesignContext): Promise<void> {
  const { labels, gap, contentWidth, centerX, height } = context;
  let y = 100;

  // Icon
  const icon = createIconCircle("🔔", COLORS.primary);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  // Title
  const title = createText(labels.title, HEADING_FONT_SIZE, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Subtitle
  const subtitle = createText(labels.subtitle, BASE_FONT_SIZE, "Regular", COLORS.mutedForeground);
  subtitle.x = centerX - subtitle.width / 2;
  subtitle.y = y;
  frame.appendChild(subtitle);
  y += 60;

  // Notification options
  const options = figma.createFrame();
  options.name = "Options";
  options.layoutMode = "VERTICAL";
  options.itemSpacing = gap + 4;
  options.primaryAxisSizingMode = "AUTO";
  options.counterAxisSizingMode = "FIXED";
  options.resize(contentWidth, 100);
  options.fills = [];
  options.x = centerX - contentWidth / 2;
  options.y = y;

  // Notification toggles
  const option1 = await createToggleFromAnalysis(context, "Push notifications", true);
  options.appendChild(option1);

  const option2 = await createToggleFromAnalysis(context, "Email updates", true);
  options.appendChild(option2);

  const option3 = await createToggleFromAnalysis(context, "Weekly digest", false);
  options.appendChild(option3);

  frame.appendChild(options);

  // Buttons
  const primaryBtn = await createButtonFromAnalysis(context, labels.primaryButton, "primary");
  primaryBtn.x = centerX - contentWidth / 2;
  primaryBtn.y = height - 120;
  frame.appendChild(primaryBtn);

  if (labels.secondaryButton) {
    const skipText = createText(labels.secondaryButton, BASE_FONT_SIZE, "Medium", COLORS.mutedForeground);
    skipText.x = centerX - skipText.width / 2;
    skipText.y = height - 60;
    frame.appendChild(skipText);
  }
}

async function designOnboardingCompleteScreenEnhanced(frame: FrameNode, context: DesignContext): Promise<void> {
  const { labels, contentWidth, centerX, height } = context;
  const centerY = height / 2;

  // Success icon
  const successCircle = figma.createEllipse();
  successCircle.name = "Success Icon";
  successCircle.resize(80, 80);
  successCircle.fills = [{ type: "SOLID", color: COLORS.success }];
  successCircle.x = centerX - 40;
  successCircle.y = centerY - 120;
  frame.appendChild(successCircle);

  // Checkmark
  const check = createText("✓", 36, "Bold", COLORS.successBg);
  check.x = centerX - check.width / 2;
  check.y = centerY - 105;
  frame.appendChild(check);

  // Title
  const title = createText(labels.title, HEADING_FONT_SIZE + 4, "Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = centerY;
  frame.appendChild(title);

  // Subtitle
  const subtitle = createText(labels.subtitle, BASE_FONT_SIZE, "Regular", COLORS.mutedForeground);
  subtitle.x = centerX - subtitle.width / 2;
  subtitle.y = centerY + 40;
  frame.appendChild(subtitle);

  // Primary button
  const primaryBtn = await createButtonFromAnalysis(context, labels.primaryButton, "primary");
  primaryBtn.x = centerX - contentWidth / 2;
  primaryBtn.y = height - 80;
  frame.appendChild(primaryBtn);
}

async function designGenericOnboardingScreenEnhanced(
  frame: FrameNode,
  screenId: string,
  context: DesignContext
): Promise<void> {
  const { labels, gap, contentWidth, centerX, height } = context;
  let y = 80;

  // Title
  const title = createText(labels.title, HEADING_FONT_SIZE, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Subtitle
  if (labels.subtitle) {
    const subtitle = createText(labels.subtitle, BASE_FONT_SIZE, "Regular", COLORS.mutedForeground);
    subtitle.x = centerX - subtitle.width / 2;
    subtitle.y = y;
    frame.appendChild(subtitle);
    y += 48;
  }

  // Content placeholder
  const content = createContentPlaceholder(contentWidth, 200, "Content Placeholder");
  content.name = "Content";
  content.x = centerX - contentWidth / 2;
  content.y = y;
  frame.appendChild(content);

  // Buttons at bottom
  const primaryBtn = await createButtonFromAnalysis(context, labels.primaryButton, "primary");
  primaryBtn.x = centerX - contentWidth / 2;
  primaryBtn.y = height - 120;
  frame.appendChild(primaryBtn);

  if (labels.secondaryButton) {
    const skipText = createText(labels.secondaryButton, BASE_FONT_SIZE, "Medium", COLORS.mutedForeground);
    skipText.x = centerX - skipText.width / 2;
    skipText.y = height - 60;
    frame.appendChild(skipText);
  }
}

/**
 * Enhanced generic screen designer with component cloning.
 */
async function designGenericScreenEnhanced(
  frame: FrameNode,
  finding: MissingScreenFinding,
  context: DesignContext
): Promise<void> {
  const { labels, gap, contentWidth, centerX, height } = context;
  let y = 60;

  // Title
  const title = createText(labels.title, HEADING_FONT_SIZE, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Subtitle/description
  const desc = createText(
    labels.subtitle || finding.missing_screen.description,
    BASE_FONT_SIZE,
    "Regular",
    COLORS.mutedForeground
  );
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 48;

  // Content area based on suggested components
  const components = finding.recommendation.components || [];

  if (components.length > 0) {
    const form = figma.createFrame();
    form.name = "Content";
    form.layoutMode = "VERTICAL";
    form.itemSpacing = gap;
    form.primaryAxisSizingMode = "AUTO";
    form.counterAxisSizingMode = "FIXED";
    form.resize(contentWidth, 100);
    form.fills = [];
    form.x = centerX - contentWidth / 2;
    form.y = y;

    for (const comp of components.slice(0, 5)) {
      const compId = comp.shadcn_id.toLowerCase();

      if (compId.includes("input") || compId.includes("textarea")) {
        const input = await createInputFromAnalysis(context, comp.name, `Enter ${comp.name.toLowerCase()}`);
        form.appendChild(input);
      } else if (compId.includes("button")) {
        const btn = await createButtonFromAnalysis(
          context,
          comp.name,
          comp.variant as any || "primary"
        );
        form.appendChild(btn);
      } else if (compId.includes("toggle") || compId.includes("switch")) {
        // Use toggle for on/off switches
        const toggle = await createToggleFromAnalysis(context, comp.name);
        form.appendChild(toggle);
      } else if (compId.includes("checkbox")) {
        // Use checkbox for multi-select or consent options
        const checkbox = await createCheckboxFromAnalysis(context, comp.name);
        form.appendChild(checkbox);
      } else if (compId.includes("alert")) {
        const alert = createAlertBox(comp.description || comp.name, comp.variant as any || "default");
        form.appendChild(alert);
      }
    }

    frame.appendChild(form);
  }

  // Primary action at bottom
  const primaryBtn = await createButtonFromAnalysis(context, labels.primaryButton, "primary");
  primaryBtn.x = centerX - contentWidth / 2;
  primaryBtn.y = height - 80;
  frame.appendChild(primaryBtn);
}

// --- LLM-Generated Layout Renderer ---

/**
 * Sanitize a color object to only include r, g, b (removes alpha if present).
 * LLM may return RGBA colors, but Figma stroke/fill colors only accept RGB.
 */
function sanitizeColor(color: RGB | { r: number; g: number; b: number; a?: number }): RGB {
  return {
    r: Math.max(0, Math.min(1, color.r)),
    g: Math.max(0, Math.min(1, color.g)),
    b: Math.max(0, Math.min(1, color.b)),
  };
}

/**
 * Coerce a value to a number. LLM may return numeric strings instead of numbers.
 */
function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && !isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Derive a meaningful label from element name when textContent is generic or missing.
 * Converts kebab-case/snake_case names to title case.
 */
function deriveLabel(textContent: string | undefined, elementName: string, fallback: string): string {
  // If textContent is provided and not generic, use it
  if (textContent && !isGenericLabel(textContent)) {
    return textContent;
  }

  // Try to derive from element name
  if (elementName && elementName !== "Button" && elementName !== "Input" && elementName !== "Text") {
    // Convert kebab-case or snake_case to title case
    const label = elementName
      .replace(/[-_]/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

    // Remove common suffixes
    return label
      .replace(/ button$/i, "")
      .replace(/ btn$/i, "")
      .replace(/ input$/i, "")
      .replace(/ field$/i, "")
      .trim();
  }

  return fallback;
}

/**
 * Check if a label is generic and should be replaced.
 */
function isGenericLabel(text: string): boolean {
  const genericLabels = [
    "button",
    "label",
    "text",
    "enter value...",
    "enter value",
    "placeholder",
    "input",
    "click me",
    "click here",
  ];
  return genericLabels.includes(text.toLowerCase().trim());
}

/**
 * Generated element type from LLM screen generator.
 */
export interface GeneratedElement {
  type: "frame" | "text" | "button" | "input" | "card" | "icon" | "separator" | "checkbox" | "image" | "component";
  name: string;
  x: number;
  y: number;
  width: number | "fill";
  height: number | "hug";
  style?: {
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
  };
  children?: GeneratedElement[];
  textContent?: string;
  variant?: string;
  /** For type="component": reference to a Figma component */
  componentRef?: {
    name: string;
    overrides?: Record<string, string>;
  };
}

/**
 * Generated screen layout from LLM.
 */
export interface GeneratedScreenLayout {
  name: string;
  width: number;
  height: number;
  backgroundColor: RGB;
  elements: GeneratedElement[];
}

/**
 * Renders a screen layout generated by the LLM into Figma nodes.
 */
export async function renderGeneratedLayout(
  layout: GeneratedScreenLayout,
  tokens?: DesignTokens
): Promise<FrameNode> {
  // Apply design tokens
  applyDesignTokens(tokens);
  await ensureFonts(tokens?.fontFamily);

  // Create main frame
  const frame = figma.createFrame();
  frame.name = layout.name;
  const frameWidth = toNumber(layout.width, 375);
  const frameHeight = toNumber(layout.height, 812);
  frame.resize(frameWidth, frameHeight);

  // Screen backgrounds should never be solid black - use the background color from tokens
  let bgColor = layout.backgroundColor ? sanitizeColor(layout.backgroundColor) : COLORS.background;
  if (bgColor.r < 0.1 && bgColor.g < 0.1 && bgColor.b < 0.1) {
    bgColor = COLORS.background;
  }
  frame.fills = [{ type: "SOLID", color: bgColor }];

  // Render all elements
  for (const element of layout.elements) {
    const node = await renderElement(element, frameWidth);
    if (node) {
      frame.appendChild(node);
      // Position the element (coerce to numbers in case LLM returns strings)
      const x = toNumber(element.x, 0);
      const y = toNumber(element.y, 0);
      if (x !== 0) node.x = x;
      if (y !== 0) node.y = y;
    }
  }

  return frame;
}

/**
 * Renders a single generated element to a Figma node.
 */
async function renderElement(element: GeneratedElement, parentWidth: number): Promise<SceneNode | null> {
  const style = element.style || {};
  // Coerce width/height to numbers - LLM may return strings
  const width = element.width === "fill" ? parentWidth : toNumber(element.width, parentWidth);
  const height = element.height === "hug" ? 100 : toNumber(element.height, 100);

  switch (element.type) {
    case "text":
      return renderTextElement(element, style);

    case "button":
      return renderButtonElement(element, width, style);

    case "input":
      return renderInputElement(element, width, style);

    case "card":
      return await renderCardElement(element, width, style);

    case "frame":
      return await renderFrameElement(element, width, height, style);

    case "separator":
      return renderSeparatorElement(width, style);

    case "checkbox":
      return renderCheckboxElement(element, style);

    case "icon":
      return renderIconElement(element, style);

    case "image":
      return renderImageElement(element, width, height, style);

    case "component":
      return await renderComponentElement(element, width, style);

    default:
      console.warn(`[edgy] Unknown element type: ${element.type}`);
      return null;
  }
}

function renderTextElement(element: GeneratedElement, style: GeneratedElement["style"]): TextNode {
  const text = figma.createText();
  text.fontName = {
    family: style?.fontFamily || FONT_FAMILY,
    style: style?.fontWeight || "Regular",
  };
  text.fontSize = toNumber(style?.fontSize, BASE_FONT_SIZE);
  text.characters = element.textContent || "";
  text.fills = [{ type: "SOLID", color: sanitizeColor(style?.textColor || COLORS.foreground) }];

  if (style?.textAlign) {
    text.textAlignHorizontal = style.textAlign;
  }

  return text;
}

function renderButtonElement(element: GeneratedElement, width: number, style: GeneratedElement["style"]): FrameNode {
  const variant = element.variant || "primary";
  const button = figma.createFrame();
  button.name = element.name || "Button";
  button.resize(width, 44);
  button.cornerRadius = toNumber(style?.borderRadius, BORDER_RADIUS);
  button.layoutMode = "HORIZONTAL";
  button.primaryAxisAlignItems = "CENTER";
  button.counterAxisAlignItems = "CENTER";

  // Apply padding
  const padding = toNumber(style?.padding, 16);
  button.paddingLeft = padding;
  button.paddingRight = padding;
  button.paddingTop = 10;
  button.paddingBottom = 10;

  // Style based on variant
  let bgColor: RGB;
  let textColor: RGB;

  switch (variant) {
    case "destructive":
      bgColor = COLORS.destructive;
      textColor = COLORS.destructiveForeground;
      break;
    case "outline":
      bgColor = COLORS.background;
      textColor = COLORS.foreground;
      button.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
      button.strokeWeight = 1;
      break;
    case "secondary":
      bgColor = COLORS.secondary;
      textColor = COLORS.foreground;
      break;
    case "ghost":
      bgColor = COLORS.background;
      textColor = COLORS.foreground;
      break;
    default:
      bgColor = style?.backgroundColor ? sanitizeColor(style.backgroundColor) : COLORS.primary;
      textColor = style?.textColor ? sanitizeColor(style.textColor) : COLORS.primaryForeground;
  }

  button.fills = [{ type: "SOLID", color: sanitizeColor(bgColor) }];

  const label = figma.createText();
  label.fontName = { family: FONT_FAMILY, style: "Medium" };
  label.fontSize = BASE_FONT_SIZE;
  // Derive meaningful label from name if textContent is generic
  label.characters = deriveLabel(element.textContent, element.name, "Continue");
  label.fills = [{ type: "SOLID", color: sanitizeColor(textColor) }];
  button.appendChild(label);

  return button;
}

function renderInputElement(element: GeneratedElement, width: number, style: GeneratedElement["style"]): FrameNode {
  const input = figma.createFrame();
  input.name = element.name || "Input";
  input.resize(width, 44);
  input.cornerRadius = toNumber(style?.borderRadius, BORDER_RADIUS);
  input.fills = [{ type: "SOLID", color: sanitizeColor(style?.backgroundColor || COLORS.background) }];
  input.strokes = [{ type: "SOLID", color: sanitizeColor(style?.borderColor || COLORS.border), opacity: 1 }];
  input.strokeWeight = toNumber(style?.borderWidth, 1);
  input.layoutMode = "HORIZONTAL";
  input.counterAxisAlignItems = "CENTER";
  input.paddingLeft = 12;
  input.paddingRight = 12;

  const placeholder = figma.createText();
  placeholder.fontName = { family: FONT_FAMILY, style: "Regular" };
  placeholder.fontSize = BASE_FONT_SIZE;
  // Derive meaningful placeholder from name if textContent is generic
  const derivedName = deriveLabel(element.textContent, element.name, "Enter value");
  placeholder.characters = derivedName.includes("Enter") ? derivedName : `Enter ${derivedName.toLowerCase()}...`;
  placeholder.fills = [{ type: "SOLID", color: COLORS.mutedForeground }];
  input.appendChild(placeholder);

  return input;
}

async function renderCardElement(element: GeneratedElement, width: number, style: GeneratedElement["style"]): Promise<FrameNode> {
  const card = figma.createFrame();
  card.name = element.name || "Card";
  card.resize(width, 100);
  card.cornerRadius = toNumber(style?.borderRadius, BORDER_RADIUS);

  // Cards should never have solid black backgrounds - use background color
  let bgColor = style?.backgroundColor ? sanitizeColor(style.backgroundColor) : COLORS.background;
  if (bgColor.r < 0.1 && bgColor.g < 0.1 && bgColor.b < 0.1) {
    bgColor = COLORS.background;
  }
  card.fills = [{ type: "SOLID", color: bgColor }];
  card.strokes = [{ type: "SOLID", color: sanitizeColor(style?.borderColor || COLORS.border), opacity: 1 }];
  card.strokeWeight = 1;
  card.layoutMode = style?.layoutMode || "VERTICAL";
  card.primaryAxisSizingMode = "AUTO";
  card.itemSpacing = toNumber(style?.gap, 8);

  // Apply padding
  const padding = toNumber(style?.padding, 16);
  card.paddingLeft = padding;
  card.paddingRight = padding;
  card.paddingTop = padding;
  card.paddingBottom = padding;

  // Render children
  if (element.children) {
    for (const child of element.children) {
      const childNode = await renderElement(child, width - padding * 2);
      if (childNode) {
        card.appendChild(childNode);
      }
    }
  }

  return card;
}

async function renderFrameElement(
  element: GeneratedElement,
  width: number,
  height: number,
  style: GeneratedElement["style"]
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = element.name || "Frame";
  frame.resize(width, height);

  if (style?.backgroundColor) {
    let bgColor = sanitizeColor(style.backgroundColor);
    // Avoid solid black backgrounds for frames (unless it's explicitly an overlay)
    const isOverlay = element.name?.toLowerCase().includes("overlay") ||
                      element.name?.toLowerCase().includes("backdrop");
    if (!isOverlay && bgColor.r < 0.1 && bgColor.g < 0.1 && bgColor.b < 0.1) {
      // Use white background instead of black
      bgColor = COLORS.background;
    }
    frame.fills = [{ type: "SOLID", color: bgColor }];
  } else {
    frame.fills = [];
  }

  if (style?.borderColor) {
    frame.strokes = [{ type: "SOLID", color: sanitizeColor(style.borderColor), opacity: 1 }];
    frame.strokeWeight = toNumber(style.borderWidth, 1);
  }

  if (style?.borderRadius) {
    frame.cornerRadius = toNumber(style.borderRadius, 0);
  }

  if (style?.layoutMode) {
    frame.layoutMode = style.layoutMode;
    frame.primaryAxisSizingMode = element.height === "hug" ? "AUTO" : "FIXED";
    frame.counterAxisSizingMode = element.width === "fill" ? "FIXED" : "AUTO";
    frame.itemSpacing = toNumber(style.gap, 0);

    if (style.alignItems) {
      frame.counterAxisAlignItems = style.alignItems;
    }
    if (style.justifyContent) {
      frame.primaryAxisAlignItems = style.justifyContent;
    }
  }

  // Apply padding
  if (style?.padding) {
    if (typeof style.padding === "number" || typeof style.padding === "string") {
      const paddingValue = toNumber(style.padding, 0);
      frame.paddingLeft = paddingValue;
      frame.paddingRight = paddingValue;
      frame.paddingTop = paddingValue;
      frame.paddingBottom = paddingValue;
    } else {
      frame.paddingLeft = toNumber(style.padding.left, 0);
      frame.paddingRight = toNumber(style.padding.right, 0);
      frame.paddingTop = toNumber(style.padding.top, 0);
      frame.paddingBottom = toNumber(style.padding.bottom, 0);
    }
  }

  // Render children
  if (element.children) {
    const childWidth = width - (frame.paddingLeft + frame.paddingRight);
    for (const child of element.children) {
      const childNode = await renderElement(child, childWidth);
      if (childNode) {
        frame.appendChild(childNode);
      }
    }
  }

  return frame;
}

function renderSeparatorElement(width: number, style: GeneratedElement["style"]): FrameNode {
  const separator = figma.createFrame();
  separator.name = "Separator";
  separator.resize(width, 1);
  separator.fills = [{ type: "SOLID", color: sanitizeColor(style?.borderColor || COLORS.border) }];
  return separator;
}

function renderCheckboxElement(element: GeneratedElement, style: GeneratedElement["style"]): FrameNode {
  const container = figma.createFrame();
  container.name = element.name || "Checkbox";
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
  box.fills = [{ type: "SOLID", color: COLORS.background }];
  box.strokes = [{ type: "SOLID", color: COLORS.primary, opacity: 1 }];
  box.strokeWeight = 1;
  container.appendChild(box);

  // Label - derive from name if textContent is generic
  const label = figma.createText();
  label.fontName = { family: FONT_FAMILY, style: "Regular" };
  label.fontSize = BASE_FONT_SIZE;
  label.characters = deriveLabel(element.textContent, element.name, "Enable option");
  label.fills = [{ type: "SOLID", color: sanitizeColor(style?.textColor || COLORS.foreground) }];
  container.appendChild(label);

  return container;
}

function renderIconElement(element: GeneratedElement, style: GeneratedElement["style"]): FrameNode {
  const size = element.width === "fill" ? 24 : toNumber(element.width, 24);
  const icon = figma.createFrame();
  icon.name = element.name || "Icon";
  icon.resize(size, size);
  icon.cornerRadius = size / 2;
  icon.fills = [{ type: "SOLID", color: sanitizeColor(style?.backgroundColor || COLORS.muted) }];
  icon.layoutMode = "HORIZONTAL";
  icon.primaryAxisAlignItems = "CENTER";
  icon.counterAxisAlignItems = "CENTER";

  // Placeholder icon content
  const iconText = figma.createText();
  iconText.fontName = { family: FONT_FAMILY, style: "Medium" };
  iconText.fontSize = size * 0.4;
  iconText.characters = element.textContent || "?";
  iconText.fills = [{ type: "SOLID", color: sanitizeColor(style?.textColor || COLORS.mutedForeground) }];
  icon.appendChild(iconText);

  return icon;
}

function renderImageElement(
  element: GeneratedElement,
  width: number,
  height: number,
  style: GeneratedElement["style"]
): FrameNode {
  const image = figma.createFrame();
  image.name = element.name || "Image";
  image.resize(width, height);
  image.cornerRadius = toNumber(style?.borderRadius, 8);

  // Avoid solid black backgrounds - use muted color for image placeholders
  let bgColor = style?.backgroundColor ? sanitizeColor(style.backgroundColor) : COLORS.muted;
  // If the background is nearly black (all channels < 0.1), use muted instead
  if (bgColor.r < 0.1 && bgColor.g < 0.1 && bgColor.b < 0.1) {
    bgColor = COLORS.muted;
  }
  image.fills = [{ type: "SOLID", color: bgColor }];
  image.layoutMode = "HORIZONTAL";
  image.primaryAxisAlignItems = "CENTER";
  image.counterAxisAlignItems = "CENTER";

  // Placeholder text
  const placeholder = figma.createText();
  placeholder.fontName = { family: FONT_FAMILY, style: "Regular" };
  placeholder.fontSize = 12;
  placeholder.characters = deriveLabel(element.textContent, element.name, "Image");
  placeholder.fills = [{ type: "SOLID", color: COLORS.mutedForeground }];
  image.appendChild(placeholder);

  return image;
}

/**
 * Renders a real Figma component instance.
 * Looks up the component by name and creates an instance.
 */
async function renderComponentElement(
  element: GeneratedElement,
  width: number,
  style: GeneratedElement["style"]
): Promise<SceneNode | null> {
  if (!element.componentRef?.name) {
    console.warn("[edgy] Component element missing componentRef.name");
    // Fall back to rendering a button
    return renderButtonElement(element, width, style);
  }

  try {
    const library = await getOrDiscoverComponents();
    const componentName = element.componentRef.name;

    // Try to find by exact name in component sets first
    let found = Array.from(library.components.values()).find(
      (c) => c.componentSetName === componentName || c.name === componentName
    );

    // If not found, try partial match or by type
    if (!found) {
      const nameLower = componentName.toLowerCase();

      // Try to match by common type
      if (nameLower.includes("button") || nameLower.includes("btn")) {
        found = findBestComponent(library, "button", element.variant);
      } else if (nameLower.includes("input") || nameLower.includes("field")) {
        found = findBestComponent(library, "input");
      } else if (nameLower.includes("card")) {
        found = findBestComponent(library, "card");
      } else if (nameLower.includes("checkbox") || nameLower.includes("toggle")) {
        found = findBestComponent(library, "checkbox");
      }
    }

    if (found) {
      // Import and instantiate the component
      const component = await figma.importComponentByKeyAsync(found.key);
      if (component) {
        const instance = component.createInstance();
        instance.name = element.name || componentName;

        // Apply text overrides if provided
        if (element.componentRef.overrides) {
          applyTextOverrides(instance, element.componentRef.overrides);
        }

        console.log(`[edgy] Instantiated component: ${found.name}`);
        return instance;
      }
    }

    console.warn(`[edgy] Component not found: ${componentName}, falling back to primitive`);
  } catch (e) {
    console.warn(`[edgy] Failed to instantiate component ${element.componentRef.name}:`, e);
  }

  // Fall back to rendering appropriate primitive based on variant
  if (element.variant === "input" || element.componentRef.name.toLowerCase().includes("input")) {
    return renderInputElement(element, width, style);
  }
  return renderButtonElement(element, width, style);
}

/**
 * Applies text overrides to a component instance.
 */
function applyTextOverrides(instance: InstanceNode, overrides: Record<string, string>): void {
  // Find all text nodes in the instance and apply overrides
  const textNodes = instance.findAll((node) => node.type === "TEXT") as TextNode[];

  for (const textNode of textNodes) {
    const nodeName = textNode.name.toLowerCase();

    // Try to match override keys to text node names
    for (const [key, value] of Object.entries(overrides)) {
      const keyLower = key.toLowerCase();
      if (
        nodeName.includes(keyLower) ||
        nodeName === keyLower ||
        keyLower === "label" ||
        keyLower === "text"
      ) {
        // Need to load font before changing text
        const fontName = textNode.fontName;
        if (fontName && typeof fontName === "object" && "family" in fontName) {
          figma.loadFontAsync(fontName).then(() => {
            textNode.characters = value;
          }).catch(() => {
            // Font loading failed, try with default
          });
        }
        break;
      }
    }
  }
}


// ============================================================
// CRUD SCREENS - ENHANCED (with component library)
// ============================================================

async function designCrudScreenEnhanced(frame: FrameNode, screenId: string, context: DesignContext) {
  const { padding, contentWidth, centerX, height } = context;

  if (screenId === "list" || screenId === "index") {
    await designListScreenEnhanced(frame, context);
  } else if (screenId === "detail" || screenId === "view" || screenId === "show") {
    await designDetailScreenEnhanced(frame, context);
  } else if (screenId === "create" || screenId === "new" || screenId === "add") {
    await designCreateScreenEnhanced(frame, context);
  } else if (screenId === "edit" || screenId === "update") {
    await designEditScreenEnhanced(frame, context);
  } else if (screenId === "delete" || screenId === "delete-confirmation") {
    await designDeleteConfirmationScreenEnhanced(frame, context);
  } else if (screenId === "empty" || screenId === "empty-state") {
    await designEmptyStateScreenEnhanced(frame, context);
  } else {
    await designGenericCrudScreenEnhanced(frame, screenId, context);
  }
}

async function designListScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth } = context;
  let y = 20;

  // Header with title and add button
  const header = figma.createFrame();
  header.name = "header";
  header.layoutMode = "HORIZONTAL";
  header.primaryAxisSizingMode = "FIXED";
  header.counterAxisSizingMode = "AUTO";
  header.resize(contentWidth, 40);
  header.primaryAxisAlignItems = "SPACE_BETWEEN";
  header.counterAxisAlignItems = "CENTER";
  header.fills = [];

  const title = createText("Items", 24, "Bold", COLORS.foreground);
  header.appendChild(title);

  const addBtn = await createButtonFromAnalysis(context, "+ Add New", "primary", 100);
  header.appendChild(addBtn);

  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 60;

  // Search bar
  const searchBar = createSearchInput(contentWidth);
  searchBar.x = padding;
  searchBar.y = y;
  frame.appendChild(searchBar);
  y += 56;

  // Table
  const table = createDataTable(contentWidth, 4);
  table.x = padding;
  table.y = y;
  frame.appendChild(table);
}

async function designDetailScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  // Back button
  const backBtn = createText("← Back to list", 14, "Medium", COLORS.primary);
  backBtn.x = padding;
  backBtn.y = y;
  frame.appendChild(backBtn);
  y += 40;

  // Title row
  const header = figma.createFrame();
  header.name = "header";
  header.layoutMode = "HORIZONTAL";
  header.primaryAxisSizingMode = "FIXED";
  header.counterAxisSizingMode = "AUTO";
  header.resize(contentWidth, 40);
  header.primaryAxisAlignItems = "SPACE_BETWEEN";
  header.counterAxisAlignItems = "CENTER";
  header.fills = [];

  const title = createText("Item Details", 24, "Bold", COLORS.foreground);
  header.appendChild(title);

  const editBtn = await createButtonFromAnalysis(context, "Edit", "outline", 80);
  header.appendChild(editBtn);

  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 60;

  // Detail card
  const card = figma.createFrame();
  card.name = "details";
  card.layoutMode = "VERTICAL";
  card.primaryAxisSizingMode = "AUTO";
  card.counterAxisSizingMode = "FIXED";
  card.resize(contentWidth, 100);
  card.paddingLeft = 20;
  card.paddingRight = 20;
  card.paddingTop = 20;
  card.paddingBottom = 20;
  card.itemSpacing = 16;
  card.cornerRadius = 8;
  card.fills = [{ type: "SOLID", color: COLORS.background }];
  card.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
  card.strokeWeight = 1;

  card.appendChild(createDetailRow("Name", "Sample Item"));
  card.appendChild(createDetailRow("Status", "Active"));
  card.appendChild(createDetailRow("Created", "Feb 8, 2024"));
  card.appendChild(createDetailRow("Description", "This is a sample item description."));

  card.x = padding;
  card.y = y;
  frame.appendChild(card);

  // Delete button at bottom
  const deleteBtn = await createButtonFromAnalysis(context, "Delete Item", "destructive", contentWidth);
  deleteBtn.x = padding;
  deleteBtn.y = height - 70;
  frame.appendChild(deleteBtn);
}

async function designCreateScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  // Header
  const header = createScreenHeader("Create New Item", "");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 60;

  // Form
  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;

  form.appendChild(await createInputFromAnalysis(context, "Name", "Enter item name", contentWidth));
  form.appendChild(await createInputFromAnalysis(context, "Description", "Enter description", contentWidth));
  form.appendChild(await createSelectFromAnalysis(context, "Status", "Select status", contentWidth));
  form.appendChild(await createSelectFromAnalysis(context, "Category", "Select category", contentWidth));

  frame.appendChild(form);

  // Buttons at bottom - Cancel (secondary) above, Create (primary) below
  const cancelBtn = await createButtonFromAnalysis(context, "Cancel", "outline", contentWidth);
  cancelBtn.x = padding;
  cancelBtn.y = height - 122;
  frame.appendChild(cancelBtn);

  const createBtn = await createButtonFromAnalysis(context, "Create Item", "primary", contentWidth);
  createBtn.x = padding;
  createBtn.y = height - 66;
  frame.appendChild(createBtn);
}

async function designEditScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  // Header
  const header = createScreenHeader("Edit Item", "");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 60;

  // Form with existing values
  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;

  form.appendChild(await createInputFromAnalysis(context, "Name", "Enter item name", contentWidth, "Sample Item"));
  form.appendChild(await createInputFromAnalysis(context, "Description", "Enter description", contentWidth, "This is a sample item"));
  form.appendChild(await createSelectFromAnalysis(context, "Status", "Active", contentWidth));
  form.appendChild(await createSelectFromAnalysis(context, "Category", "General", contentWidth));

  frame.appendChild(form);

  // Buttons - Cancel (secondary) above, Save (primary) below
  const cancelBtn = await createButtonFromAnalysis(context, "Cancel", "outline", contentWidth);
  cancelBtn.x = padding;
  cancelBtn.y = height - 122;
  frame.appendChild(cancelBtn);

  const saveBtn = await createButtonFromAnalysis(context, "Save Changes", "primary", contentWidth);
  saveBtn.x = padding;
  saveBtn.y = height - 66;
  frame.appendChild(saveBtn);
}

async function designDeleteConfirmationScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { contentWidth, centerX, height } = context;

  // Overlay
  frame.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.5 }];

  // Dialog
  const dialog = figma.createFrame();
  dialog.name = "dialog";
  dialog.layoutMode = "VERTICAL";
  dialog.primaryAxisSizingMode = "AUTO";
  dialog.counterAxisSizingMode = "FIXED";
  dialog.resize(Math.min(contentWidth, 320), 100);
  dialog.paddingLeft = 24;
  dialog.paddingRight = 24;
  dialog.paddingTop = 24;
  dialog.paddingBottom = 24;
  dialog.itemSpacing = 16;
  dialog.cornerRadius = 12;
  dialog.fills = [{ type: "SOLID", color: COLORS.background }];

  // Warning icon
  const iconRow = figma.createFrame();
  iconRow.layoutMode = "HORIZONTAL";
  iconRow.primaryAxisSizingMode = "AUTO";
  iconRow.counterAxisSizingMode = "AUTO";
  iconRow.fills = [];
  const icon = createIconCircle("!", COLORS.destructive);
  iconRow.appendChild(icon);
  dialog.appendChild(iconRow);

  // Title
  const title = createText("Delete Item?", 18, "Semi Bold", COLORS.foreground);
  dialog.appendChild(title);

  // Description
  const desc = createText("This action cannot be undone. This will permanently delete the item.", 14, "Regular", COLORS.mutedForeground);
  desc.resize(dialog.width - 48, desc.height);
  desc.textAutoResize = "HEIGHT";
  dialog.appendChild(desc);

  // Buttons - horizontal row: Cancel (outline) left, Delete (destructive) right
  const buttons = figma.createFrame();
  buttons.name = "buttons";
  buttons.layoutMode = "HORIZONTAL";
  buttons.primaryAxisSizingMode = "AUTO";
  buttons.counterAxisSizingMode = "AUTO";
  buttons.itemSpacing = 12;
  buttons.fills = [];

  const cancelBtn = await createButtonFromAnalysis(context, "Cancel", "outline", 100);
  buttons.appendChild(cancelBtn);

  const deleteBtn = await createButtonFromAnalysis(context, "Delete", "destructive", 100);
  buttons.appendChild(deleteBtn);

  dialog.appendChild(buttons);

  dialog.x = centerX - dialog.width / 2;
  dialog.y = height / 2 - 100;
  frame.appendChild(dialog);
}

async function designEmptyStateScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { contentWidth, centerX, height } = context;
  let y = height / 2 - 100;

  // Empty state illustration (placeholder)
  const illustration = createContentPlaceholder(120, 120, "");
  illustration.name = "illustration";
  illustration.cornerRadius = 60; // Circle for empty state

  const emptyIcon = createPlaceholderIcon(48, COLORS.mutedForeground, "square");
  illustration.appendChild(emptyIcon);

  illustration.x = centerX - 60;
  illustration.y = y;
  frame.appendChild(illustration);
  y += 140;

  // Title
  const title = createText("No items yet", 20, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 32;

  // Description
  const desc = createText("Get started by creating your first item.", 14, "Regular", COLORS.mutedForeground);
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 40;

  // CTA button - uses component library
  const ctaBtn = await createButtonFromAnalysis(context, "+ Create Item", "primary", 160);
  ctaBtn.x = centerX - 80;
  ctaBtn.y = y;
  frame.appendChild(ctaBtn);
}

async function designGenericCrudScreenEnhanced(frame: FrameNode, screenId: string, context: DesignContext) {
  const { padding, contentWidth } = context;
  let y = 20;

  const header = createScreenHeader(formatScreenName(screenId), "");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 60;

  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;
  form.appendChild(await createInputFromAnalysis(context, "Field", "Enter value", contentWidth));

  const submitBtn = await createButtonFromAnalysis(context, "Submit", "primary", contentWidth);
  form.appendChild(submitBtn);
  frame.appendChild(form);
}

// ============================================================
// CHECKOUT SCREENS - ENHANCED (with component library)
// ============================================================

async function designCheckoutScreenEnhanced(frame: FrameNode, screenId: string, context: DesignContext) {
  const { padding, contentWidth, centerX, height } = context;

  if (screenId === "cart" || screenId === "shopping-cart") {
    await designCartScreenEnhanced(frame, context);
  } else if (screenId === "shipping" || screenId === "address") {
    await designShippingScreenEnhanced(frame, context);
  } else if (screenId === "payment") {
    await designPaymentScreenEnhanced(frame, context);
  } else if (screenId === "review" || screenId === "order-review") {
    await designOrderReviewScreenEnhanced(frame, context);
  } else if (screenId === "confirmation" || screenId === "success") {
    await designOrderConfirmationScreenEnhanced(frame, context);
  } else if (screenId === "error") {
    await designCheckoutErrorScreenEnhanced(frame, context);
  } else {
    await designGenericCheckoutScreenEnhanced(frame, screenId, context);
  }
}

async function designCartScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  const header = createScreenHeader("Shopping Cart", "3 items");
  header.x = padding;
  header.y = y;
  header.resize(contentWidth, header.height);
  frame.appendChild(header);
  y += 70;

  // Cart items
  for (let i = 0; i < 2; i++) {
    const item = createCartItem(`Item ${i + 1}`, `$${(29.99 + i * 10).toFixed(2)}`, contentWidth);
    item.x = padding;
    item.y = y;
    frame.appendChild(item);
    y += 90;
  }

  // Summary
  const summary = createOrderSummary(contentWidth, 59.98, 5.99, 65.97);
  summary.x = padding;
  summary.y = height - 200;
  frame.appendChild(summary);

  // Checkout button
  const checkoutBtn = await createButtonFromAnalysis(context, "Proceed to Checkout", "primary", contentWidth);
  checkoutBtn.x = padding;
  checkoutBtn.y = height - 66;
  frame.appendChild(checkoutBtn);
}

async function designShippingScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  const header = createScreenHeader("Shipping Address", "Step 1 of 3");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 70;

  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;

  form.appendChild(await createInputFromAnalysis(context, "Full Name", "Enter your name", contentWidth));
  form.appendChild(await createInputFromAnalysis(context, "Address", "Street address", contentWidth));
  form.appendChild(await createInputFromAnalysis(context, "City", "City", contentWidth));

  const row = figma.createFrame();
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "AUTO";
  row.resize(contentWidth, 70);
  row.itemSpacing = 16;
  row.fills = [];
  row.appendChild(await createInputFromAnalysis(context, "State", "State", (contentWidth - 16) / 2));
  row.appendChild(await createInputFromAnalysis(context, "ZIP", "ZIP code", (contentWidth - 16) / 2));
  form.appendChild(row);

  frame.appendChild(form);

  const continueBtn = await createButtonFromAnalysis(context, "Continue to Payment", "primary", contentWidth);
  continueBtn.x = padding;
  continueBtn.y = height - 66;
  frame.appendChild(continueBtn);
}

async function designPaymentScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  const header = createScreenHeader("Payment", "Step 2 of 3");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 70;

  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;

  form.appendChild(await createInputFromAnalysis(context, "Card Number", "1234 5678 9012 3456", contentWidth));

  const row = figma.createFrame();
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "AUTO";
  row.resize(contentWidth, 70);
  row.itemSpacing = 16;
  row.fills = [];
  row.appendChild(await createInputFromAnalysis(context, "Expiry", "MM/YY", (contentWidth - 16) / 2));
  row.appendChild(await createInputFromAnalysis(context, "CVC", "123", (contentWidth - 16) / 2));
  form.appendChild(row);

  form.appendChild(await createInputFromAnalysis(context, "Name on Card", "John Doe", contentWidth));

  frame.appendChild(form);

  const payBtn = await createButtonFromAnalysis(context, "Review Order", "primary", contentWidth);
  payBtn.x = padding;
  payBtn.y = height - 66;
  frame.appendChild(payBtn);
}

async function designOrderReviewScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  const header = createScreenHeader("Review Order", "Step 3 of 3");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 70;

  // Shipping info card
  const shippingCard = createInfoCard("Shipping", "John Doe\n123 Main St\nNew York, NY 10001", contentWidth);
  shippingCard.x = padding;
  shippingCard.y = y;
  frame.appendChild(shippingCard);
  y += shippingCard.height + 16;

  // Payment info card
  const paymentCard = createInfoCard("Payment", "Visa ending in 3456", contentWidth);
  paymentCard.x = padding;
  paymentCard.y = y;
  frame.appendChild(paymentCard);
  y += paymentCard.height + 16;

  // Order summary
  const summary = createOrderSummary(contentWidth, 59.98, 5.99, 65.97);
  summary.x = padding;
  summary.y = height - 200;
  frame.appendChild(summary);

  // Place order button
  const placeOrderBtn = await createButtonFromAnalysis(context, "Place Order", "primary", contentWidth);
  placeOrderBtn.x = padding;
  placeOrderBtn.y = height - 66;
  frame.appendChild(placeOrderBtn);
}

async function designOrderConfirmationScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { contentWidth, centerX, height } = context;
  let y = 120;

  const icon = createIconCircle("✓", COLORS.success);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  const title = createText("Order Confirmed!", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  const orderNum = createText("Order #12345", 16, "Medium", COLORS.primary);
  orderNum.x = centerX - orderNum.width / 2;
  orderNum.y = y;
  frame.appendChild(orderNum);
  y += 28;

  const desc = createText("Thank you for your purchase! You'll receive\na confirmation email shortly.", 14, "Regular", COLORS.mutedForeground);
  desc.textAlignHorizontal = "CENTER";
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 60;

  const deliveryCard = createSummaryCard("Estimated Delivery", "March 15-18, 2024", Math.min(contentWidth, 280));
  deliveryCard.x = centerX - deliveryCard.width / 2;
  deliveryCard.y = y;
  frame.appendChild(deliveryCard);
  y += deliveryCard.height + 24;

  const continueBtn = await createButtonFromAnalysis(context, "Continue Shopping", "primary", Math.min(contentWidth, 280));
  continueBtn.x = centerX - continueBtn.width / 2;
  continueBtn.y = y;
  frame.appendChild(continueBtn);
}

async function designCheckoutErrorScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { contentWidth, centerX, height } = context;
  let y = 120;

  const icon = createIconCircle("!", COLORS.destructive);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  const title = createText("Payment Failed", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  const desc = createText("Your payment could not be processed.\nPlease try again or use a different payment method.", 14, "Regular", COLORS.mutedForeground);
  desc.textAlignHorizontal = "CENTER";
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 80;

  const retryBtn = await createButtonFromAnalysis(context, "Try Again", "primary", Math.min(contentWidth, 280));
  retryBtn.x = centerX - retryBtn.width / 2;
  retryBtn.y = y;
  frame.appendChild(retryBtn);
  y += 56;

  const changeBtn = await createButtonFromAnalysis(context, "Change Payment Method", "outline", Math.min(contentWidth, 280));
  changeBtn.x = centerX - changeBtn.width / 2;
  changeBtn.y = y;
  frame.appendChild(changeBtn);
}

async function designGenericCheckoutScreenEnhanced(frame: FrameNode, screenId: string, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  const header = createScreenHeader(formatScreenName(screenId), "");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 70;

  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;
  form.appendChild(await createInputFromAnalysis(context, "Field", "Enter value", contentWidth));
  frame.appendChild(form);

  const continueBtn = await createButtonFromAnalysis(context, "Continue", "primary", contentWidth);
  continueBtn.x = padding;
  continueBtn.y = height - 66;
  frame.appendChild(continueBtn);
}

// ============================================================
// SEARCH SCREENS - ENHANCED (with component library)
// ============================================================

async function designSearchScreenEnhanced(frame: FrameNode, screenId: string, context: DesignContext) {
  const { padding, contentWidth, centerX, height } = context;

  if (screenId === "search" || screenId === "search-input") {
    await designSearchInputScreenEnhanced(frame, context);
  } else if (screenId === "results" || screenId === "search-results") {
    await designSearchResultsScreenEnhanced(frame, context);
  } else if (screenId === "no-results" || screenId === "empty") {
    await designNoResultsScreenEnhanced(frame, context);
  } else if (screenId === "filters") {
    await designFiltersScreenEnhanced(frame, context);
  } else {
    await designGenericSearchScreenEnhanced(frame, screenId, context);
  }
}

async function designSearchInputScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth } = context;
  let y = 20;

  const searchBar = createSearchInput(contentWidth);
  searchBar.x = padding;
  searchBar.y = y;
  frame.appendChild(searchBar);
  y += 60;

  const recentLabel = createText("Recent Searches", 14, "Semi Bold", COLORS.foreground);
  recentLabel.x = padding;
  recentLabel.y = y;
  frame.appendChild(recentLabel);
  y += 32;

  for (const term of ["Mobile app design", "Dashboard UI", "Landing page"]) {
    const item = createRecentSearchItem(term, contentWidth);
    item.x = padding;
    item.y = y;
    frame.appendChild(item);
    y += 44;
  }
}

async function designSearchResultsScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth } = context;
  let y = 20;

  const searchBar = createSearchInputWithValue(contentWidth, "design templates");
  searchBar.x = padding;
  searchBar.y = y;
  frame.appendChild(searchBar);
  y += 56;

  const resultsHeader = figma.createFrame();
  resultsHeader.name = "results-header";
  resultsHeader.layoutMode = "HORIZONTAL";
  resultsHeader.primaryAxisSizingMode = "FIXED";
  resultsHeader.counterAxisSizingMode = "AUTO";
  resultsHeader.resize(contentWidth, 24);
  resultsHeader.primaryAxisAlignItems = "SPACE_BETWEEN";
  resultsHeader.counterAxisAlignItems = "CENTER";
  resultsHeader.fills = [];

  const resultsCount = createText("24 results", 14, "Regular", COLORS.mutedForeground);
  resultsHeader.appendChild(resultsCount);

  const filterLink = createText("Filters", 14, "Medium", COLORS.primary);
  resultsHeader.appendChild(filterLink);

  resultsHeader.x = padding;
  resultsHeader.y = y;
  frame.appendChild(resultsHeader);
  y += 40;

  for (let i = 0; i < 3; i++) {
    const card = createSearchResultCard(`Result ${i + 1}`, "Description text here", contentWidth);
    card.x = padding;
    card.y = y;
    frame.appendChild(card);
    y += card.height + 12;
  }
}

async function designGenericSearchScreenEnhanced(frame: FrameNode, screenId: string, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  const searchBar = createSearchInput(contentWidth);
  searchBar.x = padding;
  searchBar.y = y;
  frame.appendChild(searchBar);
  y += 60;

  const content = createText(`${formatScreenName(screenId)} content`, 14, "Regular", COLORS.mutedForeground);
  content.x = padding;
  content.y = y;
  frame.appendChild(content);
}

async function designNoResultsScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { contentWidth, centerX, height } = context;
  let y = 120;

  const icon = createIconCircle("?", COLORS.mutedForeground);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  const title = createText("No results found", 20, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 32;

  const desc = createText("Try adjusting your search or filters\nto find what you're looking for.", 14, "Regular", COLORS.mutedForeground);
  desc.textAlignHorizontal = "CENTER";
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 60;

  const clearBtn = await createButtonFromAnalysis(context, "Clear Filters", "outline", 160);
  clearBtn.x = centerX - 80;
  clearBtn.y = y;
  frame.appendChild(clearBtn);
}

async function designFiltersScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  const header = figma.createFrame();
  header.layoutMode = "HORIZONTAL";
  header.primaryAxisSizingMode = "FIXED";
  header.counterAxisSizingMode = "AUTO";
  header.resize(contentWidth, 40);
  header.primaryAxisAlignItems = "SPACE_BETWEEN";
  header.counterAxisAlignItems = "CENTER";
  header.fills = [];

  const title = createText("Filters", 20, "Semi Bold", COLORS.foreground);
  header.appendChild(title);

  const clearLink = createText("Clear all", 14, "Medium", COLORS.primary);
  header.appendChild(clearLink);

  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 60;

  // Filter sections
  const filterSection1 = createFilterSection("Category", ["All", "Design", "Development", "Marketing"], contentWidth);
  filterSection1.x = padding;
  filterSection1.y = y;
  frame.appendChild(filterSection1);
  y += filterSection1.height + 24;

  const filterSection2 = createFilterSection("Price Range", ["Any", "Free", "$1-$50", "$50+"], contentWidth);
  filterSection2.x = padding;
  filterSection2.y = y;
  frame.appendChild(filterSection2);

  // Apply button
  const applyBtn = await createButtonFromAnalysis(context, "Apply Filters", "primary", contentWidth);
  applyBtn.x = padding;
  applyBtn.y = height - 66;
  frame.appendChild(applyBtn);
}

// ============================================================
// SETTINGS SCREENS - ENHANCED (with component library)
// ============================================================

async function designSettingsScreenEnhanced(frame: FrameNode, screenId: string, context: DesignContext) {
  const { padding, contentWidth, centerX, height } = context;

  if (screenId === "settings" || screenId === "preferences") {
    await designSettingsMainScreenEnhanced(frame, context);
  } else if (screenId === "profile" || screenId === "account") {
    await designProfileScreenEnhanced(frame, context);
  } else if (screenId === "notifications") {
    await designNotificationSettingsScreenEnhanced(frame, context);
  } else if (screenId === "privacy" || screenId === "security") {
    await designPrivacySettingsScreenEnhanced(frame, context);
  } else if (screenId === "password" || screenId === "change-password") {
    await designChangePasswordScreenEnhanced(frame, context);
  } else if (screenId === "delete-account") {
    await designDeleteAccountScreenEnhanced(frame, context);
  } else {
    await designGenericSettingsScreenEnhanced(frame, screenId, context);
  }
}

async function designSettingsMainScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth } = context;
  let y = 20;

  const header = createScreenHeader("Settings", "");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 60;

  const sections = [
    { title: "Account", items: ["Profile", "Email", "Password"] },
    { title: "Preferences", items: ["Notifications", "Language", "Theme"] },
    { title: "Privacy", items: ["Privacy Settings", "Security", "Data"] },
  ];

  for (const section of sections) {
    const sectionFrame = createSettingsSection(section.title, section.items, contentWidth);
    sectionFrame.x = padding;
    sectionFrame.y = y;
    frame.appendChild(sectionFrame);
    y += sectionFrame.height + 24;
  }
}

async function designProfileScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  const header = createScreenHeader("Profile", "");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 60;

  // Avatar
  const avatar = createAvatarPlaceholder(80);
  avatar.x = context.centerX - 40;
  avatar.y = y;
  frame.appendChild(avatar);
  y += 100;

  // Form
  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;

  form.appendChild(await createInputFromAnalysis(context, "Name", "Enter your name", contentWidth, "John Doe"));
  form.appendChild(await createInputFromAnalysis(context, "Email", "Enter your email", contentWidth, "john@example.com"));
  form.appendChild(await createInputFromAnalysis(context, "Phone", "Enter phone number", contentWidth, "+1 234 567 8900"));

  frame.appendChild(form);

  // Save button
  const saveBtn = await createButtonFromAnalysis(context, "Save Changes", "primary", contentWidth);
  saveBtn.x = padding;
  saveBtn.y = height - 66;
  frame.appendChild(saveBtn);
}

async function designNotificationSettingsScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  const header = createScreenHeader("Notifications", "");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 60;

  const toggles = [
    { label: "Push Notifications", enabled: true },
    { label: "Email Notifications", enabled: true },
    { label: "Marketing Emails", enabled: false },
    { label: "Weekly Digest", enabled: true },
  ];

  for (const toggle of toggles) {
    const row = await createToggleFromAnalysis(context, toggle.label, toggle.enabled);
    row.x = padding;
    row.y = y;
    frame.appendChild(row);
    y += 56;
  }

  const saveBtn = await createButtonFromAnalysis(context, "Save Preferences", "primary", contentWidth);
  saveBtn.x = padding;
  saveBtn.y = height - 66;
  frame.appendChild(saveBtn);
}

async function designPrivacySettingsScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  const header = createScreenHeader("Privacy & Security", "");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 60;

  const options = [
    { label: "Two-Factor Authentication", enabled: true },
    { label: "Profile Visibility", enabled: true },
    { label: "Data Collection", enabled: false },
  ];

  for (const opt of options) {
    const row = await createToggleFromAnalysis(context, opt.label, opt.enabled);
    row.x = padding;
    row.y = y;
    frame.appendChild(row);
    y += 56;
  }

  const saveBtn = await createButtonFromAnalysis(context, "Save Settings", "primary", contentWidth);
  saveBtn.x = padding;
  saveBtn.y = height - 66;
  frame.appendChild(saveBtn);
}

async function designChangePasswordScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  const header = createScreenHeader("Change Password", "");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 60;

  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;

  form.appendChild(await createInputFromAnalysis(context, "Current Password", "Enter current password", contentWidth));
  form.appendChild(await createInputFromAnalysis(context, "New Password", "Enter new password", contentWidth));
  form.appendChild(await createInputFromAnalysis(context, "Confirm Password", "Confirm new password", contentWidth));

  frame.appendChild(form);

  const updateBtn = await createButtonFromAnalysis(context, "Update Password", "primary", contentWidth);
  updateBtn.x = padding;
  updateBtn.y = height - 66;
  frame.appendChild(updateBtn);
}

async function designDeleteAccountScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, centerX, height } = context;
  let y = 100;

  const icon = createIconCircle("!", COLORS.destructive);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  const title = createText("Delete Account", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  const desc = createText("This action is permanent. All your data\nwill be deleted and cannot be recovered.", 14, "Regular", COLORS.mutedForeground);
  desc.textAlignHorizontal = "CENTER";
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 60;

  const input = await createInputFromAnalysis(context, "Type DELETE to confirm", "DELETE", contentWidth);
  input.x = padding;
  input.y = y;
  frame.appendChild(input);

  // Cancel button (secondary, top)
  const cancelBtn = await createButtonFromAnalysis(context, "Cancel", "outline", contentWidth);
  cancelBtn.x = padding;
  cancelBtn.y = height - 122;
  frame.appendChild(cancelBtn);

  // Delete button (destructive, bottom)
  const deleteBtn = await createButtonFromAnalysis(context, "Delete My Account", "destructive", contentWidth);
  deleteBtn.x = padding;
  deleteBtn.y = height - 66;
  frame.appendChild(deleteBtn);
}

async function designGenericSettingsScreenEnhanced(frame: FrameNode, screenId: string, context: DesignContext) {
  const { padding, contentWidth, height } = context;
  let y = 20;

  const header = createScreenHeader(formatScreenName(screenId), "");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 60;

  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;
  form.appendChild(await createInputFromAnalysis(context, "Setting", "Value", contentWidth));
  frame.appendChild(form);

  const saveBtn = await createButtonFromAnalysis(context, "Save", "primary", contentWidth);
  saveBtn.x = padding;
  saveBtn.y = height - 66;
  frame.appendChild(saveBtn);
}

// ============================================================
// UPLOAD SCREENS - ENHANCED (with component library)
// ============================================================

async function designUploadScreenEnhanced(frame: FrameNode, screenId: string, context: DesignContext) {
  const { padding, contentWidth, centerX, height } = context;

  if (screenId === "select" || screenId === "file-select") {
    await designFileSelectScreenEnhanced(frame, context);
  } else if (screenId === "progress" || screenId === "uploading") {
    await designUploadProgressScreenEnhanced(frame, context);
  } else if (screenId === "success" || screenId === "complete") {
    await designUploadSuccessScreenEnhanced(frame, context);
  } else if (screenId === "error" || screenId === "failed") {
    await designUploadErrorScreenEnhanced(frame, context);
  } else {
    await designFileSelectScreenEnhanced(frame, context);
  }
}

async function designFileSelectScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { padding, contentWidth, centerX, height } = context;
  let y = 100;

  // Upload area
  const uploadArea = figma.createFrame();
  uploadArea.name = "upload-area";
  uploadArea.resize(Math.min(contentWidth, 300), 200);
  uploadArea.cornerRadius = 12;
  uploadArea.fills = [{ type: "SOLID", color: COLORS.muted }];
  uploadArea.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
  uploadArea.strokeWeight = 2;
  uploadArea.dashPattern = [8, 8];
  uploadArea.layoutMode = "VERTICAL";
  uploadArea.primaryAxisAlignItems = "CENTER";
  uploadArea.counterAxisAlignItems = "CENTER";
  uploadArea.itemSpacing = 16;

  const uploadIcon = createPlaceholderIcon(48, COLORS.mutedForeground, "arrow-up");
  uploadArea.appendChild(uploadIcon);

  const uploadText = createText("Drag & drop files here", 14, "Medium", COLORS.foreground);
  uploadArea.appendChild(uploadText);

  const uploadHint = createText("or click to browse", 12, "Regular", COLORS.mutedForeground);
  uploadArea.appendChild(uploadHint);

  uploadArea.x = centerX - uploadArea.width / 2;
  uploadArea.y = y;
  frame.appendChild(uploadArea);
  y += 240;

  const supportedText = createText("Supported: JPG, PNG, PDF (max 10MB)", 12, "Regular", COLORS.mutedForeground);
  supportedText.x = centerX - supportedText.width / 2;
  supportedText.y = y;
  frame.appendChild(supportedText);
  y += 50;

  const cancelBtn = await createButtonFromAnalysis(context, "Cancel", "outline", 120);
  cancelBtn.x = centerX - 60;
  cancelBtn.y = y;
  frame.appendChild(cancelBtn);
}

async function designUploadProgressScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { contentWidth, centerX, height } = context;
  let y = 150;

  const fileName = createText("document.pdf", 16, "Medium", COLORS.foreground);
  fileName.x = centerX - fileName.width / 2;
  fileName.y = y;
  frame.appendChild(fileName);
  y += 32;

  const progressBg = figma.createFrame();
  progressBg.name = "progress-bg";
  progressBg.resize(Math.min(contentWidth, 280), 8);
  progressBg.cornerRadius = 4;
  progressBg.fills = [{ type: "SOLID", color: COLORS.muted }];
  progressBg.x = centerX - progressBg.width / 2;
  progressBg.y = y;
  frame.appendChild(progressBg);

  const progressFill = figma.createFrame();
  progressFill.name = "progress-fill";
  progressFill.resize(Math.min(contentWidth, 280) * 0.65, 8);
  progressFill.cornerRadius = 4;
  progressFill.fills = [{ type: "SOLID", color: COLORS.primary }];
  progressFill.x = centerX - progressBg.width / 2;
  progressFill.y = y;
  frame.appendChild(progressFill);
  y += 24;

  const progressText = createText("65% uploaded", 14, "Regular", COLORS.mutedForeground);
  progressText.x = centerX - progressText.width / 2;
  progressText.y = y;
  frame.appendChild(progressText);
  y += 50;

  const cancelBtn = await createButtonFromAnalysis(context, "Cancel", "outline", Math.min(contentWidth, 280));
  cancelBtn.x = centerX - cancelBtn.width / 2;
  cancelBtn.y = y;
  frame.appendChild(cancelBtn);
}

async function designUploadSuccessScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { contentWidth, centerX, height } = context;
  let y = 120;

  const icon = createIconCircle("✓", COLORS.success);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  const title = createText("Upload Complete", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  const desc = createText("Your file has been uploaded successfully.", 14, "Regular", COLORS.mutedForeground);
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 60;

  const doneBtn = await createButtonFromAnalysis(context, "Done", "primary", Math.min(contentWidth, 280));
  doneBtn.x = centerX - doneBtn.width / 2;
  doneBtn.y = y;
  frame.appendChild(doneBtn);
  y += 56;

  const uploadMoreBtn = await createButtonFromAnalysis(context, "Upload Another", "outline", Math.min(contentWidth, 280));
  uploadMoreBtn.x = centerX - uploadMoreBtn.width / 2;
  uploadMoreBtn.y = y;
  frame.appendChild(uploadMoreBtn);
}

async function designUploadErrorScreenEnhanced(frame: FrameNode, context: DesignContext) {
  const { contentWidth, centerX, height } = context;
  let y = 120;

  const icon = createIconCircle("!", COLORS.destructive);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  const title = createText("Upload Failed", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  const desc = createText("Something went wrong. Please try again.", 14, "Regular", COLORS.mutedForeground);
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 60;

  const retryBtn = await createButtonFromAnalysis(context, "Try Again", "primary", Math.min(contentWidth, 280));
  retryBtn.x = centerX - retryBtn.width / 2;
  retryBtn.y = y;
  frame.appendChild(retryBtn);
  y += 56;

  const cancelBtn = await createButtonFromAnalysis(context, "Cancel", "outline", Math.min(contentWidth, 280));
  cancelBtn.x = centerX - cancelBtn.width / 2;
  cancelBtn.y = y;
  frame.appendChild(cancelBtn);
}


// ============================================================
// HELPER FUNCTIONS
// ============================================================

function createText(
  content: string,
  size: number,
  weight: "Regular" | "Medium" | "Semi Bold" | "Bold",
  color: RGB
): TextNode {
  const text = figma.createText();
  text.fontName = { family: FONT_FAMILY, style: weight };
  text.fontSize = size;
  text.characters = content;
  text.fills = [{ type: "SOLID", color }];
  return text;
}

/**
 * Creates a simple placeholder shape for icons/images.
 * Uses geometric shapes instead of emojis for cleaner designs.
 */
function createPlaceholderIcon(size: number, color: RGB, shape: "circle" | "square" = "square"): FrameNode {
  const container = figma.createFrame();
  container.name = "icon-placeholder";
  container.resize(size, size);
  container.cornerRadius = shape === "circle" ? size / 2 : BORDER_RADIUS;
  container.fills = [{ type: "SOLID", color: COLORS.muted }];

  // Inner shape
  const innerSize = Math.max(8, size * 0.4);
  const offset = (size - innerSize) / 2;

  if (shape === "circle") {
    const inner = figma.createEllipse();
    inner.resize(innerSize, innerSize);
    inner.x = offset;
    inner.y = offset;
    inner.fills = [{ type: "SOLID", color, opacity: 0.4 }];
    container.appendChild(inner);
  } else {
    const inner = figma.createFrame();
    inner.resize(innerSize, innerSize);
    inner.x = offset;
    inner.y = offset;
    inner.cornerRadius = Math.max(2, BORDER_RADIUS / 2);
    inner.fills = [{ type: "SOLID", color, opacity: 0.4 }];
    container.appendChild(inner);
  }

  return container;
}

function createLogoPlaceholder(): FrameNode {
  const logo = figma.createFrame();
  logo.name = "logo-placeholder";
  logo.resize(48, 48);
  logo.cornerRadius = BORDER_RADIUS;
  logo.fills = [{ type: "SOLID", color: COLORS.muted }];

  // Simple inner shape as placeholder
  const inner = figma.createFrame();
  inner.name = "logo-inner";
  inner.resize(24, 24);
  inner.x = 12;
  inner.y = 12;
  inner.cornerRadius = 4;
  inner.fills = [{ type: "SOLID", color: COLORS.mutedForeground, opacity: 0.3 }];
  logo.appendChild(inner);

  return logo;
}

/**
 * Creates a content placeholder with a light grey background and centered label.
 * Use this instead of grey boxes for content areas.
 */
function createContentPlaceholder(width: number, height: number, label: string = "Content Placeholder"): FrameNode {
  const container = figma.createFrame();
  container.name = "content-placeholder";
  container.resize(width, height);
  container.cornerRadius = BORDER_RADIUS;
  // Light grey background (lighter than muted)
  container.fills = [{ type: "SOLID", color: { r: 0.96, g: 0.96, b: 0.96 } }];
  // Add a subtle dashed border
  container.strokes = [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 } }];
  container.strokeWeight = 1;
  container.dashPattern = [4, 4];

  // Center the content
  container.layoutMode = "VERTICAL";
  container.primaryAxisAlignItems = "CENTER";
  container.counterAxisAlignItems = "CENTER";
  container.primaryAxisSizingMode = "FIXED";
  container.counterAxisSizingMode = "FIXED";

  // Add label text
  const text = createText(label, 12, "Medium", COLORS.mutedForeground);
  container.appendChild(text);

  return container;
}

function createFormContainer(width: number): FrameNode {
  const form = figma.createFrame();
  form.name = "form";
  form.layoutMode = "VERTICAL";
  form.primaryAxisSizingMode = "AUTO";
  form.counterAxisSizingMode = "FIXED";
  form.resize(width, 100);
  form.itemSpacing = 16;
  form.fills = [];
  return form;
}

function createLabeledInput(label: string, placeholder: string, width: number): FrameNode {
  const container = figma.createFrame();
  container.name = label.toLowerCase().replace(/\s+/g, "-");
  container.layoutMode = "VERTICAL";
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "FIXED";
  container.resize(width, 100);
  container.itemSpacing = 6;
  container.fills = [];

  const labelText = createText(label, 14, "Medium", COLORS.foreground);
  container.appendChild(labelText);

  const input = figma.createFrame();
  input.name = "input";
  input.layoutMode = "HORIZONTAL";
  input.counterAxisSizingMode = "FIXED";
  input.resize(width, 44);
  input.paddingLeft = 12;
  input.paddingRight = 12;
  input.counterAxisAlignItems = "CENTER";
  input.cornerRadius = 8;
  input.fills = [{ type: "SOLID", color: COLORS.background }];
  input.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
  input.strokeWeight = 1;

  const placeholderText = createText(placeholder, 14, "Regular", COLORS.mutedForeground);
  input.appendChild(placeholderText);
  input.layoutAlign = "STRETCH";

  container.appendChild(input);

  return container;
}

function createLabeledInputWithValue(label: string, value: string, width: number): FrameNode {
  const container = createLabeledInput(label, "", width);
  const input = container.findOne((n) => n.name === "input") as FrameNode;
  if (input) {
    const textNode = input.findOne((n) => n.type === "TEXT") as TextNode;
    if (textNode) {
      textNode.characters = value;
      textNode.fills = [{ type: "SOLID", color: COLORS.foreground }];
    }
  }
  return container;
}

function createLabeledSelect(label: string, placeholder: string, width: number): FrameNode {
  const container = figma.createFrame();
  container.name = label.toLowerCase().replace(/\s+/g, "-");
  container.layoutMode = "VERTICAL";
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "FIXED";
  container.resize(width, 100);
  container.itemSpacing = 6;
  container.fills = [];

  const labelText = createText(label, 14, "Medium", COLORS.foreground);
  container.appendChild(labelText);

  const select = figma.createFrame();
  select.name = "select";
  select.layoutMode = "HORIZONTAL";
  select.counterAxisSizingMode = "FIXED";
  select.resize(width, 44);
  select.paddingLeft = 12;
  select.paddingRight = 12;
  select.primaryAxisAlignItems = "SPACE_BETWEEN";
  select.counterAxisAlignItems = "CENTER";
  select.cornerRadius = 8;
  select.fills = [{ type: "SOLID", color: COLORS.background }];
  select.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
  select.strokeWeight = 1;

  const placeholderText = createText(placeholder, 14, "Regular", COLORS.mutedForeground);
  select.appendChild(placeholderText);

  const chevron = createText("▼", 10, "Regular", COLORS.mutedForeground);
  select.appendChild(chevron);

  select.layoutAlign = "STRETCH";
  container.appendChild(select);

  return container;
}

interface ButtonColorOverrides {
  bgColor?: RGB;
  textColor?: RGB;
}

function createButton(
  label: string,
  variant: "primary" | "outline" | "destructive" | "ghost",
  width: number,
  colorOverrides?: ButtonColorOverrides
): FrameNode {
  const button = figma.createFrame();
  button.name = label.toLowerCase().replace(/\s+/g, "-");
  button.layoutMode = "HORIZONTAL";
  button.primaryAxisSizingMode = "FIXED";
  button.counterAxisSizingMode = "FIXED";
  button.resize(width, 44);
  button.primaryAxisAlignItems = "CENTER";
  button.counterAxisAlignItems = "CENTER";
  button.cornerRadius = 8;

  let bgColor: RGB;
  let textColor: RGB;
  let strokeColor: RGB | null = null;

  switch (variant) {
    case "primary":
      bgColor = COLORS.primary;
      textColor = COLORS.primaryForeground;
      break;
    case "outline":
      bgColor = COLORS.background;
      textColor = COLORS.foreground;
      strokeColor = COLORS.foreground; // Use foreground (black) for outline, not border (grey)
      break;
    case "destructive":
      bgColor = COLORS.destructive;
      textColor = COLORS.destructiveForeground;
      break;
    case "ghost":
      bgColor = { r: 1, g: 1, b: 1 };
      textColor = COLORS.foreground;
      break;
  }

  // Apply color overrides from extracted button colors
  if (colorOverrides?.bgColor) {
    bgColor = colorOverrides.bgColor;
  }
  if (colorOverrides?.textColor) {
    textColor = colorOverrides.textColor;
  }

  button.fills = [{ type: "SOLID", color: bgColor }];
  if (strokeColor) {
    button.strokes = [{ type: "SOLID", color: strokeColor, opacity: 1 }];
    button.strokeWeight = 1;
  }

  const text = createText(label, 14, "Medium", textColor);
  button.appendChild(text);

  return button;
}

function createCheckbox(label: string): FrameNode {
  const container = figma.createFrame();
  container.name = "checkbox";
  container.layoutMode = "HORIZONTAL";
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.itemSpacing = 8;
  container.counterAxisAlignItems = "CENTER";
  container.fills = [];

  const box = figma.createFrame();
  box.name = "box";
  box.resize(18, 18);
  box.cornerRadius = 4;
  box.fills = [{ type: "SOLID", color: COLORS.background }];
  box.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
  box.strokeWeight = 1;
  container.appendChild(box);

  const labelText = createText(label, 14, "Regular", COLORS.foreground);
  container.appendChild(labelText);

  return container;
}

function createToggle(label: string, enabled: boolean = false): FrameNode {
  const container = figma.createFrame();
  container.name = "toggle";
  container.layoutMode = "HORIZONTAL";
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.itemSpacing = 12;
  container.counterAxisAlignItems = "CENTER";
  container.fills = [];

  // Label on the left
  const labelText = createText(label, 14, "Regular", COLORS.foreground);
  container.appendChild(labelText);

  // Toggle track
  const track = figma.createFrame();
  track.name = "toggle-track";
  track.resize(44, 24);
  track.cornerRadius = 12;
  track.fills = [{ type: "SOLID", color: enabled ? COLORS.primary : COLORS.muted }];

  // Toggle thumb
  const thumb = figma.createEllipse();
  thumb.name = "toggle-thumb";
  thumb.resize(20, 20);
  thumb.x = enabled ? 22 : 2;
  thumb.y = 2;
  thumb.fills = [{ type: "SOLID", color: COLORS.background }];
  track.appendChild(thumb);

  container.appendChild(track);

  return container;
}

function createDivider(width: number, text?: string): FrameNode {
  const container = figma.createFrame();
  container.name = "divider";
  container.layoutMode = "HORIZONTAL";
  container.primaryAxisSizingMode = "FIXED";
  container.counterAxisSizingMode = "AUTO";
  container.resize(width, 20);
  container.primaryAxisAlignItems = "CENTER";
  container.counterAxisAlignItems = "CENTER";
  container.itemSpacing = 16;
  container.fills = [];

  const line1 = figma.createFrame();
  line1.resize(80, 1);
  line1.fills = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
  line1.layoutGrow = 1;
  container.appendChild(line1);

  if (text) {
    const dividerText = createText(text, 12, "Regular", COLORS.mutedForeground);
    container.appendChild(dividerText);

    const line2 = figma.createFrame();
    line2.resize(80, 1);
    line2.fills = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
    line2.layoutGrow = 1;
    container.appendChild(line2);
  }

  return container;
}

function createSocialButtons(width: number): FrameNode {
  const container = figma.createFrame();
  container.name = "social-buttons";
  container.layoutMode = "HORIZONTAL";
  container.primaryAxisSizingMode = "FIXED";
  container.counterAxisSizingMode = "AUTO";
  container.resize(width, 44);
  container.itemSpacing = 12;
  container.fills = [];

  for (const icon of ["G", "🍎", "f"]) {
    const btn = figma.createFrame();
    btn.layoutMode = "HORIZONTAL";
    btn.primaryAxisAlignItems = "CENTER";
    btn.counterAxisAlignItems = "CENTER";
    btn.layoutGrow = 1;
    btn.resize(100, 44);
    btn.cornerRadius = 8;
    btn.fills = [{ type: "SOLID", color: COLORS.background }];
    btn.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
    btn.strokeWeight = 1;

    const iconText = createText(icon, 18, "Medium", COLORS.foreground);
    btn.appendChild(iconText);

    container.appendChild(btn);
  }

  return container;
}

function createIconCircle(_icon: string, color: RGB): FrameNode {
  // Simple circle with inner shape as placeholder (no emojis/symbols)
  const circle = figma.createFrame();
  circle.name = "icon-placeholder";
  circle.resize(56, 56);
  circle.cornerRadius = 28;
  circle.fills = [{ type: "SOLID", color, opacity: 0.1 }];

  // Inner circle as simple placeholder
  const inner = figma.createEllipse();
  inner.name = "icon-inner";
  inner.resize(20, 20);
  inner.x = 18;
  inner.y = 18;
  inner.fills = [{ type: "SOLID", color, opacity: 0.5 }];
  circle.appendChild(inner);

  return circle;
}

function createCodeInputRow(digits: number, maxWidth: number): FrameNode {
  const container = figma.createFrame();
  container.name = "code-input";
  container.layoutMode = "HORIZONTAL";
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.itemSpacing = 8;
  container.fills = [];

  const boxSize = Math.min(44, (maxWidth - (digits - 1) * 8) / digits);

  for (let i = 0; i < digits; i++) {
    const box = figma.createFrame();
    box.resize(boxSize, boxSize);
    box.cornerRadius = 8;
    box.fills = [{ type: "SOLID", color: COLORS.background }];
    box.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
    box.strokeWeight = 1;
    box.layoutMode = "HORIZONTAL";
    box.primaryAxisAlignItems = "CENTER";
    box.counterAxisAlignItems = "CENTER";

    if (i < 3) {
      const digit = createText(String(Math.floor(Math.random() * 10)), 20, "Semi Bold", COLORS.foreground);
      box.appendChild(digit);
    }

    container.appendChild(box);
  }

  return container;
}

function createErrorCard(width: number, message: string): FrameNode {
  const card = figma.createFrame();
  card.name = "error-card";
  card.layoutMode = "HORIZONTAL";
  card.primaryAxisSizingMode = "FIXED";
  card.counterAxisSizingMode = "AUTO";
  card.resize(width, 60);
  card.paddingLeft = 16;
  card.paddingRight = 16;
  card.paddingTop = 12;
  card.paddingBottom = 12;
  card.itemSpacing = 12;
  card.counterAxisAlignItems = "CENTER";
  card.cornerRadius = 8;
  card.fills = [{ type: "SOLID", color: COLORS.destructive, opacity: 0.1 }];

  const icon = createText("⚠", 16, "Regular", COLORS.destructive);
  card.appendChild(icon);

  const text = createText(message, 13, "Regular", COLORS.destructive);
  text.layoutGrow = 1;
  text.resize(width - 60, text.height);
  text.textAutoResize = "HEIGHT";
  card.appendChild(text);

  return card;
}

function createScreenHeader(title: string, subtitle: string): FrameNode {
  const header = figma.createFrame();
  header.name = "header";
  header.layoutMode = "HORIZONTAL";
  header.primaryAxisSizingMode = "AUTO";
  header.counterAxisSizingMode = "AUTO";
  header.primaryAxisAlignItems = "SPACE_BETWEEN";
  header.counterAxisAlignItems = "CENTER";
  header.fills = [];

  const titleText = createText(title, 20, "Bold", COLORS.foreground);
  header.appendChild(titleText);

  if (subtitle) {
    const subtitleText = createText(subtitle, 14, "Regular", COLORS.mutedForeground);
    header.appendChild(subtitleText);
  }

  return header;
}

function createProgressBar(width: number, current: number, total: number): FrameNode {
  const container = figma.createFrame();
  container.name = "progress";
  container.layoutMode = "HORIZONTAL";
  container.primaryAxisSizingMode = "FIXED";
  container.counterAxisSizingMode = "AUTO";
  container.resize(width, 4);
  container.itemSpacing = 4;
  container.fills = [];

  for (let i = 1; i <= total; i++) {
    const segment = figma.createFrame();
    segment.layoutGrow = 1;
    segment.resize(100, 4);
    segment.cornerRadius = 2;
    segment.fills = [{ type: "SOLID", color: i <= current ? COLORS.primary : COLORS.muted }];
    container.appendChild(segment);
  }

  return container;
}

function createCartItem(width: number, name: string, price: string): FrameNode {
  const item = figma.createFrame();
  item.name = "cart-item";
  item.layoutMode = "HORIZONTAL";
  item.primaryAxisSizingMode = "FIXED";
  item.counterAxisSizingMode = "AUTO";
  item.resize(width, 80);
  item.itemSpacing = 12;
  item.counterAxisAlignItems = "CENTER";
  item.fills = [];

  // Thumbnail
  const thumb = figma.createFrame();
  thumb.resize(64, 64);
  thumb.cornerRadius = 8;
  thumb.fills = [{ type: "SOLID", color: COLORS.muted }];
  item.appendChild(thumb);

  // Details
  const details = figma.createFrame();
  details.layoutMode = "VERTICAL";
  details.primaryAxisSizingMode = "AUTO";
  details.counterAxisSizingMode = "AUTO";
  details.itemSpacing = 4;
  details.layoutGrow = 1;
  details.fills = [];

  details.appendChild(createText(name, 14, "Medium", COLORS.foreground));
  details.appendChild(createText("Qty: 1", 12, "Regular", COLORS.mutedForeground));
  item.appendChild(details);

  // Price
  const priceText = createText(price, 14, "Semi Bold", COLORS.foreground);
  item.appendChild(priceText);

  return item;
}

function createPriceRow(label: string, value: string, width: number, bold: boolean = false): FrameNode {
  const row = figma.createFrame();
  row.name = label.toLowerCase();
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "AUTO";
  row.resize(width, 24);
  row.primaryAxisAlignItems = "SPACE_BETWEEN";
  row.fills = [];

  const labelText = createText(label, 14, bold ? "Semi Bold" : "Regular", COLORS.foreground);
  row.appendChild(labelText);

  const valueText = createText(value, 14, bold ? "Bold" : "Medium", COLORS.foreground);
  row.appendChild(valueText);

  return row;
}

function createSummaryCard(title: string, content: string, width: number): FrameNode {
  const card = figma.createFrame();
  card.name = title.toLowerCase().replace(/\s+/g, "-");
  card.layoutMode = "VERTICAL";
  card.primaryAxisSizingMode = "AUTO";
  card.counterAxisSizingMode = "FIXED";
  card.resize(width, 60);
  card.paddingLeft = 16;
  card.paddingRight = 16;
  card.paddingTop = 12;
  card.paddingBottom = 12;
  card.itemSpacing = 4;
  card.cornerRadius = 8;
  card.fills = [{ type: "SOLID", color: COLORS.muted }];

  card.appendChild(createText(title, 12, "Medium", COLORS.mutedForeground));
  card.appendChild(createText(content, 14, "Medium", COLORS.foreground));

  return card;
}

function createRadioOption(label: string, selected: boolean, width: number): FrameNode {
  const option = figma.createFrame();
  option.name = label.toLowerCase().replace(/\s+/g, "-");
  option.layoutMode = "HORIZONTAL";
  option.primaryAxisSizingMode = "FIXED";
  option.counterAxisSizingMode = "AUTO";
  option.resize(width, 40);
  option.itemSpacing = 12;
  option.counterAxisAlignItems = "CENTER";
  option.fills = [];

  // Radio circle
  const radio = figma.createFrame();
  radio.resize(20, 20);
  radio.cornerRadius = 10;
  radio.fills = [{ type: "SOLID", color: COLORS.background }];
  radio.strokes = [{ type: "SOLID", color: selected ? COLORS.primary : COLORS.border, opacity: 1 }];
  radio.strokeWeight = selected ? 6 : 1;
  option.appendChild(radio);

  const labelText = createText(label, 14, "Regular", COLORS.foreground);
  option.appendChild(labelText);

  return option;
}

function createAvatarUpload(): FrameNode {
  const container = figma.createFrame();
  container.name = "avatar-upload";
  container.layoutMode = "VERTICAL";
  container.primaryAxisSizingMode = "AUTO";
  container.counterAxisSizingMode = "AUTO";
  container.itemSpacing = 8;
  container.counterAxisAlignItems = "CENTER";
  container.fills = [];

  // Avatar placeholder (simple circle with inner shape)
  const avatar = figma.createFrame();
  avatar.name = "avatar-placeholder";
  avatar.resize(96, 96);
  avatar.cornerRadius = 48;
  avatar.fills = [{ type: "SOLID", color: COLORS.muted }];

  // Inner placeholder shape
  const avatarInner = figma.createEllipse();
  avatarInner.resize(32, 32);
  avatarInner.x = 32;
  avatarInner.y = 32;
  avatarInner.fills = [{ type: "SOLID", color: COLORS.mutedForeground, opacity: 0.3 }];
  avatar.appendChild(avatarInner);

  container.appendChild(avatar);

  return container;
}

function createPreferenceRow(title: string, subtitle: string, enabled: boolean): FrameNode {
  const row = figma.createFrame();
  row.name = title.toLowerCase().replace(/\s+/g, "-");
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "AUTO";
  row.counterAxisSizingMode = "AUTO";
  row.primaryAxisAlignItems = "SPACE_BETWEEN";
  row.counterAxisAlignItems = "CENTER";
  row.paddingTop = 16;
  row.paddingBottom = 16;
  row.fills = [];

  // Left side
  const left = figma.createFrame();
  left.layoutMode = "VERTICAL";
  left.primaryAxisSizingMode = "AUTO";
  left.counterAxisSizingMode = "AUTO";
  left.itemSpacing = 2;
  left.fills = [];

  left.appendChild(createText(title, 14, "Medium", COLORS.foreground));
  left.appendChild(createText(subtitle, 12, "Regular", COLORS.mutedForeground));
  row.appendChild(left);

  // Toggle
  const toggle = figma.createFrame();
  toggle.resize(44, 24);
  toggle.cornerRadius = 12;
  toggle.fills = [{ type: "SOLID", color: enabled ? COLORS.primary : COLORS.muted }];

  const thumb = figma.createEllipse();
  thumb.resize(20, 20);
  thumb.x = enabled ? 22 : 2;
  thumb.y = 2;
  thumb.fills = [{ type: "SOLID", color: COLORS.background }];
  toggle.appendChild(thumb);

  row.appendChild(toggle);

  return row;
}

function createSearchInput(width: number): FrameNode {
  const search = figma.createFrame();
  search.name = "search";
  search.layoutMode = "HORIZONTAL";
  search.primaryAxisSizingMode = "FIXED";
  search.counterAxisSizingMode = "FIXED";
  search.resize(width, 44);
  search.paddingLeft = 12;
  search.paddingRight = 12;
  search.itemSpacing = 8;
  search.counterAxisAlignItems = "CENTER";
  search.cornerRadius = 8;
  search.fills = [{ type: "SOLID", color: COLORS.muted }];

  const searchIcon = createPlaceholderIcon(16, COLORS.mutedForeground, "circle");
  search.appendChild(searchIcon);

  const placeholder = createText("Search...", 14, "Regular", COLORS.mutedForeground);
  search.appendChild(placeholder);

  return search;
}

function createSearchInputWithValue(width: number, value: string): FrameNode {
  const search = createSearchInput(width);
  const textNode = search.findOne((n) => n.type === "TEXT" && (n as TextNode).characters === "Search...") as TextNode;
  if (textNode) {
    textNode.characters = value;
    textNode.fills = [{ type: "SOLID", color: COLORS.foreground }];
  }
  return search;
}

function createDataTable(width: number, rows: number): FrameNode {
  const table = figma.createFrame();
  table.name = "table";
  table.layoutMode = "VERTICAL";
  table.primaryAxisSizingMode = "AUTO";
  table.counterAxisSizingMode = "FIXED";
  table.resize(width, 200);
  table.cornerRadius = 8;
  table.fills = [{ type: "SOLID", color: COLORS.background }];
  table.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
  table.strokeWeight = 1;
  table.clipsContent = true;

  // Header
  const header = figma.createFrame();
  header.name = "header";
  header.layoutMode = "HORIZONTAL";
  header.primaryAxisSizingMode = "FIXED";
  header.counterAxisSizingMode = "FIXED";
  header.resize(width, 44);
  header.paddingLeft = 16;
  header.paddingRight = 16;
  header.counterAxisAlignItems = "CENTER";
  header.fills = [{ type: "SOLID", color: COLORS.muted }];

  for (const col of ["Name", "Status", "Date", ""]) {
    const cell = createText(col || "Actions", 12, "Medium", COLORS.mutedForeground);
    cell.layoutGrow = col ? 1 : 0;
    header.appendChild(cell);
  }
  table.appendChild(header);
  header.layoutAlign = "STRETCH";

  // Rows
  const statuses = ["Active", "Pending", "Completed"];
  for (let i = 0; i < rows; i++) {
    const row = figma.createFrame();
    row.name = `row-${i}`;
    row.layoutMode = "HORIZONTAL";
    row.primaryAxisSizingMode = "FIXED";
    row.counterAxisSizingMode = "FIXED";
    row.resize(width, 52);
    row.paddingLeft = 16;
    row.paddingRight = 16;
    row.counterAxisAlignItems = "CENTER";
    row.fills = [];

    const name = createText(`Item ${i + 1}`, 14, "Medium", COLORS.foreground);
    name.layoutGrow = 1;
    row.appendChild(name);

    const status = createText(statuses[i % 3], 14, "Regular", COLORS.foreground);
    status.layoutGrow = 1;
    row.appendChild(status);

    const date = createText("Feb 8, 2024", 14, "Regular", COLORS.mutedForeground);
    date.layoutGrow = 1;
    row.appendChild(date);

    const actions = createText("•••", 14, "Regular", COLORS.mutedForeground);
    row.appendChild(actions);

    table.appendChild(row);
    row.layoutAlign = "STRETCH";
  }

  return table;
}

function createRecentSearchItem(term: string, width: number): FrameNode {
  const item = figma.createFrame();
  item.name = "recent-item";
  item.layoutMode = "HORIZONTAL";
  item.primaryAxisSizingMode = "FIXED";
  item.counterAxisSizingMode = "AUTO";
  item.resize(width, 36);
  item.itemSpacing = 12;
  item.counterAxisAlignItems = "CENTER";
  item.fills = [];

  const clockIcon = createPlaceholderIcon(14, COLORS.mutedForeground, "circle");
  item.appendChild(clockIcon);

  const text = createText(term, 14, "Regular", COLORS.foreground);
  item.appendChild(text);

  return item;
}

function createSearchResultCard(width: number, title: string, description: string): FrameNode {
  const card = figma.createFrame();
  card.name = "result";
  card.layoutMode = "VERTICAL";
  card.primaryAxisSizingMode = "AUTO";
  card.counterAxisSizingMode = "FIXED";
  card.resize(width, 80);
  card.paddingLeft = 16;
  card.paddingRight = 16;
  card.paddingTop = 12;
  card.paddingBottom = 12;
  card.itemSpacing = 4;
  card.cornerRadius = 8;
  card.fills = [{ type: "SOLID", color: COLORS.background }];
  card.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
  card.strokeWeight = 1;

  card.appendChild(createText(title, 14, "Semi Bold", COLORS.foreground));
  card.appendChild(createText(description, 13, "Regular", COLORS.mutedForeground));

  return card;
}

function createSettingsRow(icon: string, title: string, subtitle: string, width: number): FrameNode {
  const row = figma.createFrame();
  row.name = title.toLowerCase().replace(/\s+/g, "-");
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "AUTO";
  row.resize(width, 56);
  row.paddingLeft = 16;
  row.paddingRight = 16;
  row.itemSpacing = 16;
  row.counterAxisAlignItems = "CENTER";
  row.cornerRadius = 8;
  row.fills = [{ type: "SOLID", color: COLORS.background }];
  row.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
  row.strokeWeight = 1;

  // Icon placeholder (simple geometric shape instead of emoji)
  const iconFrame = figma.createFrame();
  iconFrame.name = "icon-placeholder";
  iconFrame.resize(40, 40);
  iconFrame.cornerRadius = 8;
  iconFrame.fills = [{ type: "SOLID", color: COLORS.muted }];

  const iconInner = figma.createFrame();
  iconInner.resize(16, 16);
  iconInner.x = 12;
  iconInner.y = 12;
  iconInner.cornerRadius = 4;
  iconInner.fills = [{ type: "SOLID", color: COLORS.mutedForeground, opacity: 0.4 }];
  iconFrame.appendChild(iconInner);
  row.appendChild(iconFrame);

  const content = figma.createFrame();
  content.layoutMode = "VERTICAL";
  content.primaryAxisSizingMode = "AUTO";
  content.counterAxisSizingMode = "AUTO";
  content.itemSpacing = 2;
  content.layoutGrow = 1;
  content.fills = [];
  content.appendChild(createText(title, 14, "Medium", COLORS.foreground));
  content.appendChild(createText(subtitle, 12, "Regular", COLORS.mutedForeground));
  row.appendChild(content);

  const chevron = createText("›", 20, "Regular", COLORS.mutedForeground);
  row.appendChild(chevron);

  return row;
}

function createDetailRow(label: string, value: string): FrameNode {
  const row = figma.createFrame();
  row.name = label.toLowerCase();
  row.layoutMode = "VERTICAL";
  row.primaryAxisSizingMode = "AUTO";
  row.counterAxisSizingMode = "AUTO";
  row.itemSpacing = 4;
  row.fills = [];

  row.appendChild(createText(label, 12, "Medium", COLORS.mutedForeground));
  row.appendChild(createText(value, 14, "Regular", COLORS.foreground));

  return row;
}

function formatScreenName(screenId: string): string {
  return screenId
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
