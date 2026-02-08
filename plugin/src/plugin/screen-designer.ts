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
    componentLibraryCache = await discoverComponents();
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
    contentWidth: ACTIVE_CONTENT_WIDTH || Math.min(width - 48, 327),
    centerX: width / 2,
  };

  // Route to specific designer based on screen type
  if (flowType === "authentication") {
    await designAuthScreenEnhanced(frame, screenId, context);
  } else if (flowType === "checkout") {
    await designCheckoutScreen(frame, screenId, width, height);
  } else if (flowType === "onboarding") {
    await designOnboardingScreenEnhanced(frame, screenId, context);
  } else if (flowType === "crud") {
    await designCrudScreen(frame, screenId, width, height);
  } else if (flowType === "search") {
    await designSearchScreen(frame, screenId, width, height);
  } else if (flowType === "settings") {
    await designSettingsScreen(frame, screenId, width, height);
  } else if (flowType === "upload") {
    await designUploadScreen(frame, screenId, width, height);
  } else {
    // Generic fallback with enhancement
    await designGenericScreenEnhanced(frame, finding, context);
  }

  return frame;
}

// --- Active Layout Values (from analysis) ---

let ACTIVE_PADDING = 24;
let ACTIVE_GAP = 16;
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
  variant: "primary" | "secondary" | "outline" | "destructive" = "primary",
  width?: number
): Promise<SceneNode> {
  const { analysis, componentLibrary, contentWidth } = context;
  const buttonWidth = width || contentWidth;

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
      return clone;
    } catch (e) {
      console.warn("[edgy] Failed to clone button instance:", e);
    }
  }

  // Try to instantiate from component library (main components)
  if (componentLibrary) {
    const variantName = variant === "secondary" ? "outline" : variant;
    const bestComponent = findBestComponent(componentLibrary, "button", variantName);
    if (bestComponent) {
      try {
        const instance = await createComponentInstance(bestComponent.key);
        if (instance) {
          // Apply text override
          await applyTextToInstance(instance, label);
          // Resize if needed
          if (Math.abs(instance.width - buttonWidth) > 20) {
            instance.resize(buttonWidth, instance.height);
          }
          return instance;
        }
      } catch (e) {
        console.warn("[edgy] Failed to instantiate button component:", e);
      }
    }
  }

  // Fallback to created button, using extracted colors if available
  const colorOverrides: ButtonColorOverrides | undefined = bestButton
    ? {
        bgColor: bestButton.fillColor,
        textColor: bestButton.textColor,
      }
    : undefined;

  return createButton(label, variant === "secondary" ? "outline" : variant, buttonWidth, colorOverrides);
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
 */
async function createInputFromAnalysis(
  context: DesignContext,
  label: string,
  placeholder: string,
  width?: number
): Promise<SceneNode> {
  const { analysis, componentLibrary, contentWidth } = context;
  const inputWidth = width || contentWidth;

  // Try to clone from existing screens
  if (analysis && analysis.instances.inputs.length > 0) {
    const bestInput = findBestInstance(analysis.instances.inputs);
    if (bestInput) {
      try {
        const clone = await cloneInstance(bestInput, {
          "label": label,
          "placeholder": placeholder,
          "*": placeholder,
        });
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

  // Try to instantiate from component library
  if (componentLibrary) {
    const bestComponent = findBestComponent(componentLibrary, "input");
    if (bestComponent) {
      try {
        const instance = await createComponentInstance(bestComponent.key);
        if (instance) {
          await applyTextToInstance(instance, placeholder);
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
  return createLabeledInput(label, placeholder, inputWidth);
}

/**
 * Try to clone a toggle/switch from existing screens, or instantiate from component library.
 * Toggles are preferred for boolean on/off decisions.
 */
async function createToggleFromAnalysis(
  context: DesignContext,
  label: string,
  enabled: boolean = false
): Promise<SceneNode> {
  const { analysis, componentLibrary } = context;

  // Try to clone from existing screens (look for toggles in checkboxes array since they share the role)
  if (analysis && analysis.instances.checkboxes.length > 0) {
    // Prefer components with "toggle" or "switch" in the name
    const toggleInstance = analysis.instances.checkboxes.find(
      (c) => c.componentName.toLowerCase().includes("toggle") ||
             c.componentName.toLowerCase().includes("switch")
    );
    if (toggleInstance) {
      try {
        return await cloneInstance(toggleInstance, { "*": label, "label": label });
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
          await applyTextToInstance(instance, label);
          return instance;
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

  // Upload photo text
  const uploadText = createText("Upload Photo", BASE_FONT_SIZE, "Medium", COLORS.primary);
  uploadText.x = centerX - uploadText.width / 2;
  uploadText.y = y;
  frame.appendChild(uploadText);
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

  // Name input
  const nameInput = await createInputFromAnalysis(
    context,
    labels.inputs["name"]?.label || "Display Name",
    labels.inputs["name"]?.placeholder || "What should we call you?"
  );
  form.appendChild(nameInput);

  frame.appendChild(form);

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
// AUTHENTICATION SCREENS
// ============================================================

async function designAuthScreen(frame: FrameNode, screenId: string, width: number, height: number) {
  const padding = 24;
  const contentWidth = Math.min(width - padding * 2, 320);
  const centerX = width / 2;

  if (screenId === "login" || screenId === "signin") {
    await designLoginScreen(frame, contentWidth, centerX, height);
  } else if (screenId === "signup" || screenId === "register") {
    await designSignupScreen(frame, contentWidth, centerX, height);
  } else if (screenId === "forgot-password" || screenId === "forgot_password") {
    await designForgotPasswordScreen(frame, contentWidth, centerX, height);
  } else if (screenId === "reset-password" || screenId === "reset_password") {
    await designResetPasswordScreen(frame, contentWidth, centerX, height);
  } else if (screenId === "2fa" || screenId === "mfa" || screenId === "verification") {
    await design2FAScreen(frame, contentWidth, centerX, height);
  } else if (screenId === "error" || screenId === "auth-error") {
    await designAuthErrorScreen(frame, contentWidth, centerX, height);
  } else {
    await designGenericAuthScreen(frame, screenId, contentWidth, centerX, height);
  }
}

async function designLoginScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 80;

  // Logo placeholder
  const logo = createLogoPlaceholder();
  logo.x = centerX - 24;
  logo.y = y;
  frame.appendChild(logo);
  y += 68;

  // Title
  const title = createText("Welcome back", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Subtitle
  const subtitle = createText("Sign in to your account", 14, "Regular", COLORS.mutedForeground);
  subtitle.x = centerX - subtitle.width / 2;
  subtitle.y = y;
  frame.appendChild(subtitle);
  y += 40;

  // Form container
  const form = createFormContainer(contentWidth);
  form.x = centerX - contentWidth / 2;
  form.y = y;

  // Email input
  const emailField = createLabeledInput("Email", "Enter your email", contentWidth);
  form.appendChild(emailField);

  // Password input
  const passwordField = createLabeledInput("Password", "Enter your password", contentWidth);
  form.appendChild(passwordField);

  // Forgot password link
  const forgotLink = createText("Forgot password?", 14, "Medium", COLORS.primary);
  form.appendChild(forgotLink);

  // Sign in button
  const signInBtn = createButton("Sign in", "primary", contentWidth);
  form.appendChild(signInBtn);

  // Divider
  const divider = createDivider(contentWidth, "or continue with");
  form.appendChild(divider);

  // Social buttons row
  const socialRow = createSocialButtons(contentWidth);
  form.appendChild(socialRow);

  frame.appendChild(form);

  // Sign up link at bottom
  const signupText = createText("Don't have an account? Sign up", 14, "Regular", COLORS.mutedForeground);
  signupText.x = centerX - signupText.width / 2;
  signupText.y = height - 60;
  frame.appendChild(signupText);
}

async function designSignupScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 60;

  // Title
  const title = createText("Create account", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Subtitle
  const subtitle = createText("Start your journey with us", 14, "Regular", COLORS.mutedForeground);
  subtitle.x = centerX - subtitle.width / 2;
  subtitle.y = y;
  frame.appendChild(subtitle);
  y += 36;

  // Form
  const form = createFormContainer(contentWidth);
  form.x = centerX - contentWidth / 2;
  form.y = y;

  form.appendChild(createLabeledInput("Full name", "Enter your name", contentWidth));
  form.appendChild(createLabeledInput("Email", "Enter your email", contentWidth));
  form.appendChild(createLabeledInput("Password", "Create a password", contentWidth));
  form.appendChild(createLabeledInput("Confirm password", "Confirm your password", contentWidth));

  // Terms checkbox
  const terms = createCheckbox("I agree to the Terms of Service and Privacy Policy");
  form.appendChild(terms);

  // Create account button
  const createBtn = createButton("Create account", "primary", contentWidth);
  form.appendChild(createBtn);

  frame.appendChild(form);

  // Login link
  const loginText = createText("Already have an account? Sign in", 14, "Regular", COLORS.mutedForeground);
  loginText.x = centerX - loginText.width / 2;
  loginText.y = height - 60;
  frame.appendChild(loginText);
}

async function designForgotPasswordScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 120;

  // Icon
  const icon = createIconCircle("✉", COLORS.primary);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  // Title
  const title = createText("Forgot password?", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Description
  const desc = createText("No worries, we'll send you reset instructions.", 14, "Regular", COLORS.mutedForeground);
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 40;

  // Form
  const form = createFormContainer(contentWidth);
  form.x = centerX - contentWidth / 2;
  form.y = y;

  form.appendChild(createLabeledInput("Email", "Enter your email", contentWidth));
  form.appendChild(createButton("Send reset link", "primary", contentWidth));

  frame.appendChild(form);

  // Back to login
  const backText = createText("← Back to login", 14, "Medium", COLORS.primary);
  backText.x = centerX - backText.width / 2;
  backText.y = height - 60;
  frame.appendChild(backText);
}

async function designResetPasswordScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 120;

  // Icon
  const icon = createIconCircle("🔐", COLORS.primary);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  // Title
  const title = createText("Set new password", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Description
  const desc = createText("Your new password must be different from previous ones.", 14, "Regular", COLORS.mutedForeground);
  desc.resize(contentWidth, desc.height);
  desc.textAutoResize = "HEIGHT";
  desc.textAlignHorizontal = "CENTER";
  desc.x = centerX - contentWidth / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 50;

  // Form
  const form = createFormContainer(contentWidth);
  form.x = centerX - contentWidth / 2;
  form.y = y;

  form.appendChild(createLabeledInput("New password", "Enter new password", contentWidth));
  form.appendChild(createLabeledInput("Confirm password", "Confirm new password", contentWidth));
  form.appendChild(createButton("Reset password", "primary", contentWidth));

  frame.appendChild(form);
}

async function design2FAScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 120;

  // Icon
  const icon = createIconCircle("🔒", COLORS.primary);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  // Title
  const title = createText("Two-factor authentication", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Description
  const desc = createText("Enter the 6-digit code from your authenticator app.", 14, "Regular", COLORS.mutedForeground);
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 50;

  // Code input boxes
  const codeRow = createCodeInputRow(6, contentWidth);
  codeRow.x = centerX - codeRow.width / 2;
  codeRow.y = y;
  frame.appendChild(codeRow);
  y += 70;

  // Verify button
  const verifyBtn = createButton("Verify", "primary", contentWidth);
  verifyBtn.x = centerX - contentWidth / 2;
  verifyBtn.y = y;
  frame.appendChild(verifyBtn);
  y += 60;

  // Resend code
  const resendText = createText("Didn't receive a code? Resend", 14, "Regular", COLORS.mutedForeground);
  resendText.x = centerX - resendText.width / 2;
  resendText.y = y;
  frame.appendChild(resendText);
}

async function designAuthErrorScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 150;

  // Error icon
  const icon = createIconCircle("!", COLORS.destructive);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  // Title
  const title = createText("Something went wrong", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Description
  const desc = createText("We couldn't complete your request. Please try again.", 14, "Regular", COLORS.mutedForeground);
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 50;

  // Error details card
  const errorCard = createErrorCard(contentWidth, "Error: Authentication failed. Invalid credentials provided.");
  errorCard.x = centerX - contentWidth / 2;
  errorCard.y = y;
  frame.appendChild(errorCard);
  y += 100;

  // Buttons
  const retryBtn = createButton("Try again", "primary", contentWidth);
  retryBtn.x = centerX - contentWidth / 2;
  retryBtn.y = y;
  frame.appendChild(retryBtn);
  y += 52;

  const backBtn = createButton("Back to login", "outline", contentWidth);
  backBtn.x = centerX - contentWidth / 2;
  backBtn.y = y;
  frame.appendChild(backBtn);
}

async function designGenericAuthScreen(frame: FrameNode, screenId: string, contentWidth: number, centerX: number, height: number) {
  let y = 120;

  const title = createText(formatScreenName(screenId), 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 50;

  const form = createFormContainer(contentWidth);
  form.x = centerX - contentWidth / 2;
  form.y = y;

  form.appendChild(createLabeledInput("Field", "Enter value", contentWidth));
  form.appendChild(createButton("Continue", "primary", contentWidth));

  frame.appendChild(form);
}

// ============================================================
// CHECKOUT SCREENS
// ============================================================

async function designCheckoutScreen(frame: FrameNode, screenId: string, width: number, height: number) {
  const padding = 20;
  const contentWidth = width - padding * 2;

  if (screenId === "cart" || screenId === "shopping-cart") {
    await designCartScreen(frame, contentWidth, padding, height);
  } else if (screenId === "shipping" || screenId === "address") {
    await designShippingScreen(frame, contentWidth, padding, height);
  } else if (screenId === "payment") {
    await designPaymentScreen(frame, contentWidth, padding, height);
  } else if (screenId === "review" || screenId === "order-review") {
    await designOrderReviewScreen(frame, contentWidth, padding, height);
  } else if (screenId === "confirmation" || screenId === "success") {
    await designOrderConfirmationScreen(frame, contentWidth, width / 2, height);
  } else if (screenId === "error") {
    await designCheckoutErrorScreen(frame, contentWidth, width / 2, height);
  } else {
    await designGenericCheckoutScreen(frame, screenId, contentWidth, padding, height);
  }
}

async function designCartScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
  let y = 20;

  // Header
  const header = createScreenHeader("Shopping Cart", "3 items");
  header.x = padding;
  header.y = y;
  header.resize(contentWidth, header.height);
  frame.appendChild(header);
  y += 70;

  // Cart items
  for (let i = 0; i < 2; i++) {
    const item = createCartItem(contentWidth, `Product ${i + 1}`, "$49.99");
    item.x = padding;
    item.y = y;
    frame.appendChild(item);
    y += 100;
  }

  // Divider
  const divider = figma.createFrame();
  divider.resize(contentWidth, 1);
  divider.fills = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
  divider.x = padding;
  divider.y = y;
  frame.appendChild(divider);
  y += 20;

  // Totals
  const subtotal = createPriceRow("Subtotal", "$99.98", contentWidth);
  subtotal.x = padding;
  subtotal.y = y;
  frame.appendChild(subtotal);
  y += 32;

  const shipping = createPriceRow("Shipping", "$5.00", contentWidth);
  shipping.x = padding;
  shipping.y = y;
  frame.appendChild(shipping);
  y += 32;

  const total = createPriceRow("Total", "$104.98", contentWidth, true);
  total.x = padding;
  total.y = y;
  frame.appendChild(total);

  // Checkout button (sticky at bottom)
  const checkoutBtn = createButton("Proceed to Checkout", "primary", contentWidth);
  checkoutBtn.x = padding;
  checkoutBtn.y = height - 70;
  frame.appendChild(checkoutBtn);
}

async function designShippingScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
  let y = 20;

  // Header with step indicator
  const header = createScreenHeader("Shipping Address", "Step 1 of 3");
  header.x = padding;
  header.y = y;
  header.resize(contentWidth, header.height);
  frame.appendChild(header);
  y += 60;

  // Progress bar
  const progress = createProgressBar(contentWidth, 1, 3);
  progress.x = padding;
  progress.y = y;
  frame.appendChild(progress);
  y += 40;

  // Form
  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;

  form.appendChild(createLabeledInput("Full name", "John Doe", contentWidth));

  // Address row
  form.appendChild(createLabeledInput("Street address", "123 Main St", contentWidth));
  form.appendChild(createLabeledInput("City", "New York", contentWidth));

  // State/Zip row (side by side would be nice but keeping simple)
  form.appendChild(createLabeledInput("State", "NY", contentWidth));
  form.appendChild(createLabeledInput("ZIP Code", "10001", contentWidth));
  form.appendChild(createLabeledInput("Phone", "+1 (555) 000-0000", contentWidth));

  frame.appendChild(form);

  // Continue button
  const continueBtn = createButton("Continue to Payment", "primary", contentWidth);
  continueBtn.x = padding;
  continueBtn.y = height - 70;
  frame.appendChild(continueBtn);
}

async function designPaymentScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
  let y = 20;

  // Header
  const header = createScreenHeader("Payment", "Step 2 of 3");
  header.x = padding;
  header.y = y;
  header.resize(contentWidth, header.height);
  frame.appendChild(header);
  y += 60;

  // Progress bar
  const progress = createProgressBar(contentWidth, 2, 3);
  progress.x = padding;
  progress.y = y;
  frame.appendChild(progress);
  y += 40;

  // Payment method selection
  const methodLabel = createText("Payment method", 14, "Medium", COLORS.foreground);
  methodLabel.x = padding;
  methodLabel.y = y;
  frame.appendChild(methodLabel);
  y += 28;

  // Card option (selected)
  const cardOption = createRadioOption("Credit / Debit Card", true, contentWidth);
  cardOption.x = padding;
  cardOption.y = y;
  frame.appendChild(cardOption);
  y += 52;

  // Card form
  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;

  form.appendChild(createLabeledInput("Card number", "1234 5678 9012 3456", contentWidth));
  form.appendChild(createLabeledInput("Name on card", "John Doe", contentWidth));
  form.appendChild(createLabeledInput("Expiry date", "MM/YY", contentWidth));
  form.appendChild(createLabeledInput("CVV", "123", contentWidth));

  frame.appendChild(form);

  // Pay button
  const payBtn = createButton("Review Order", "primary", contentWidth);
  payBtn.x = padding;
  payBtn.y = height - 70;
  frame.appendChild(payBtn);
}

async function designOrderReviewScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
  let y = 20;

  // Header
  const header = createScreenHeader("Review Order", "Step 3 of 3");
  header.x = padding;
  header.y = y;
  header.resize(contentWidth, header.height);
  frame.appendChild(header);
  y += 60;

  // Progress bar
  const progress = createProgressBar(contentWidth, 3, 3);
  progress.x = padding;
  progress.y = y;
  frame.appendChild(progress);
  y += 40;

  // Shipping summary card
  const shippingCard = createSummaryCard("Shipping Address", "John Doe\n123 Main St\nNew York, NY 10001", contentWidth);
  shippingCard.x = padding;
  shippingCard.y = y;
  frame.appendChild(shippingCard);
  y += shippingCard.height + 16;

  // Payment summary card
  const paymentCard = createSummaryCard("Payment Method", "Visa ending in 3456", contentWidth);
  paymentCard.x = padding;
  paymentCard.y = y;
  frame.appendChild(paymentCard);
  y += paymentCard.height + 16;

  // Order total
  const totalCard = createSummaryCard("Order Total", "$104.98", contentWidth);
  totalCard.x = padding;
  totalCard.y = y;
  frame.appendChild(totalCard);

  // Place order button
  const orderBtn = createButton("Place Order", "primary", contentWidth);
  orderBtn.x = padding;
  orderBtn.y = height - 70;
  frame.appendChild(orderBtn);
}

async function designOrderConfirmationScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 120;

  // Success icon
  const icon = createIconCircle("✓", COLORS.success);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  // Title
  const title = createText("Order Confirmed!", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Order number
  const orderNum = createText("Order #12345", 16, "Medium", COLORS.primary);
  orderNum.x = centerX - orderNum.width / 2;
  orderNum.y = y;
  frame.appendChild(orderNum);
  y += 32;

  // Description
  const desc = createText("Thank you for your purchase! You'll receive\na confirmation email shortly.", 14, "Regular", COLORS.mutedForeground);
  desc.textAlignHorizontal = "CENTER";
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 60;

  // Estimated delivery card
  const deliveryCard = createSummaryCard("Estimated Delivery", "March 15-18, 2024", Math.min(contentWidth, 280));
  deliveryCard.x = centerX - deliveryCard.width / 2;
  deliveryCard.y = y;
  frame.appendChild(deliveryCard);

  // Continue shopping button
  const continueBtn = createButton("Continue Shopping", "primary", Math.min(contentWidth, 280));
  continueBtn.x = centerX - continueBtn.width / 2;
  continueBtn.y = height - 120;
  frame.appendChild(continueBtn);

  // Track order button
  const trackBtn = createButton("Track Order", "outline", Math.min(contentWidth, 280));
  trackBtn.x = centerX - trackBtn.width / 2;
  trackBtn.y = height - 64;
  frame.appendChild(trackBtn);
}

async function designCheckoutErrorScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 150;

  // Error icon
  const icon = createIconCircle("!", COLORS.destructive);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  // Title
  const title = createText("Payment Failed", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Description
  const desc = createText("Your payment could not be processed.\nPlease check your details and try again.", 14, "Regular", COLORS.mutedForeground);
  desc.textAlignHorizontal = "CENTER";
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 70;

  // Retry button
  const retryBtn = createButton("Try Again", "primary", Math.min(contentWidth, 280));
  retryBtn.x = centerX - retryBtn.width / 2;
  retryBtn.y = y;
  frame.appendChild(retryBtn);
  y += 52;

  // Use different method
  const diffBtn = createButton("Use Different Payment", "outline", Math.min(contentWidth, 280));
  diffBtn.x = centerX - diffBtn.width / 2;
  diffBtn.y = y;
  frame.appendChild(diffBtn);
}

async function designGenericCheckoutScreen(frame: FrameNode, screenId: string, contentWidth: number, padding: number, height: number) {
  let y = 20;

  const header = createScreenHeader(formatScreenName(screenId), "");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 70;

  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;
  form.appendChild(createLabeledInput("Field", "Enter value", contentWidth));
  form.appendChild(createButton("Continue", "primary", contentWidth));
  frame.appendChild(form);
}

// ============================================================
// ONBOARDING SCREENS
// ============================================================

async function designOnboardingScreen(frame: FrameNode, screenId: string, width: number, height: number) {
  const padding = 24;
  const contentWidth = Math.min(width - padding * 2, 320);
  const centerX = width / 2;

  if (screenId === "welcome" || screenId === "intro") {
    await designWelcomeScreen(frame, contentWidth, centerX, height);
  } else if (screenId === "profile" || screenId === "profile-setup") {
    await designProfileSetupScreen(frame, contentWidth, centerX, height);
  } else if (screenId === "preferences") {
    await designPreferencesScreen(frame, contentWidth, centerX, height);
  } else if (screenId === "completion" || screenId === "done" || screenId === "success") {
    await designOnboardingCompleteScreen(frame, contentWidth, centerX, height);
  } else if (screenId === "skip" || screenId === "skip-confirmation") {
    await designSkipConfirmationScreen(frame, contentWidth, centerX, height);
  } else {
    await designGenericOnboardingScreen(frame, screenId, contentWidth, centerX, height);
  }
}

async function designWelcomeScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 100;

  // App icon/logo
  const logo = createLogoPlaceholder();
  logo.resize(64, 64);
  logo.cornerRadius = 16;
  logo.x = centerX - 32;
  logo.y = y;
  frame.appendChild(logo);
  y += 84;

  // Title
  const title = createText("Welcome to App", 28, "Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 44;

  // Description
  const desc = createText("Your journey to amazing things\nstarts here.", 16, "Regular", COLORS.mutedForeground);
  desc.textAlignHorizontal = "CENTER";
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);

  // Get started button
  const startBtn = createButton("Get Started", "primary", contentWidth);
  startBtn.x = centerX - contentWidth / 2;
  startBtn.y = height - 120;
  frame.appendChild(startBtn);

  // Sign in link
  const signInText = createText("Already have an account? Sign in", 14, "Regular", COLORS.mutedForeground);
  signInText.x = centerX - signInText.width / 2;
  signInText.y = height - 60;
  frame.appendChild(signInText);
}

async function designProfileSetupScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 60;

  // Step indicator
  const step = createText("Step 1 of 3", 12, "Medium", COLORS.mutedForeground);
  step.x = centerX - step.width / 2;
  step.y = y;
  frame.appendChild(step);
  y += 30;

  // Title
  const title = createText("Set up your profile", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 50;

  // Avatar
  const avatar = createAvatarUpload();
  avatar.x = centerX - 48;
  avatar.y = y;
  frame.appendChild(avatar);
  y += 116;

  // Form
  const form = createFormContainer(contentWidth);
  form.x = centerX - contentWidth / 2;
  form.y = y;

  form.appendChild(createLabeledInput("Display name", "What should we call you?", contentWidth));
  form.appendChild(createLabeledInput("Bio", "Tell us about yourself (optional)", contentWidth));

  frame.appendChild(form);

  // Continue button
  const continueBtn = createButton("Continue", "primary", contentWidth);
  continueBtn.x = centerX - contentWidth / 2;
  continueBtn.y = height - 120;
  frame.appendChild(continueBtn);

  // Skip
  const skipText = createText("Skip for now", 14, "Medium", COLORS.mutedForeground);
  skipText.x = centerX - skipText.width / 2;
  skipText.y = height - 60;
  frame.appendChild(skipText);
}

async function designPreferencesScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 60;

  // Step indicator
  const step = createText("Step 2 of 3", 12, "Medium", COLORS.mutedForeground);
  step.x = centerX - step.width / 2;
  step.y = y;
  frame.appendChild(step);
  y += 30;

  // Title
  const title = createText("Your preferences", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 16;

  // Subtitle
  const subtitle = createText("Customize your experience", 14, "Regular", COLORS.mutedForeground);
  subtitle.x = centerX - subtitle.width / 2;
  subtitle.y = y;
  frame.appendChild(subtitle);
  y += 50;

  // Preference switches
  const prefsContainer = figma.createFrame();
  prefsContainer.name = "preferences";
  prefsContainer.layoutMode = "VERTICAL";
  prefsContainer.primaryAxisSizingMode = "AUTO";
  prefsContainer.counterAxisSizingMode = "FIXED";
  prefsContainer.resize(contentWidth, 100);
  prefsContainer.itemSpacing = 0;
  prefsContainer.fills = [];

  prefsContainer.appendChild(createPreferenceRow("Email notifications", "Receive updates via email", true));
  prefsContainer.appendChild(createPreferenceRow("Push notifications", "Get notified on your device", true));
  prefsContainer.appendChild(createPreferenceRow("Dark mode", "Use dark color theme", false));
  prefsContainer.appendChild(createPreferenceRow("Analytics", "Help us improve the app", false));

  prefsContainer.x = centerX - contentWidth / 2;
  prefsContainer.y = y;
  frame.appendChild(prefsContainer);

  // Continue button
  const continueBtn = createButton("Continue", "primary", contentWidth);
  continueBtn.x = centerX - contentWidth / 2;
  continueBtn.y = height - 120;
  frame.appendChild(continueBtn);

  // Skip
  const skipText = createText("Skip for now", 14, "Medium", COLORS.mutedForeground);
  skipText.x = centerX - skipText.width / 2;
  skipText.y = height - 60;
  frame.appendChild(skipText);
}

async function designOnboardingCompleteScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 140;

  // Success icon with animation feel
  const icon = createIconCircle("✓", COLORS.success);
  icon.resize(64, 64);
  icon.x = centerX - 32;
  icon.y = y;
  frame.appendChild(icon);
  y += 84;

  // Title
  const title = createText("You're all set!", 28, "Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 44;

  // Description
  const desc = createText("Your account is ready.\nLet's start exploring!", 16, "Regular", COLORS.mutedForeground);
  desc.textAlignHorizontal = "CENTER";
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);

  // Start button
  const startBtn = createButton("Start Exploring", "primary", contentWidth);
  startBtn.x = centerX - contentWidth / 2;
  startBtn.y = height - 70;
  frame.appendChild(startBtn);
}

async function designSkipConfirmationScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  // Dialog overlay effect
  frame.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.5 }];

  // Dialog card
  const dialog = figma.createFrame();
  dialog.name = "dialog";
  dialog.layoutMode = "VERTICAL";
  dialog.primaryAxisSizingMode = "AUTO";
  dialog.counterAxisSizingMode = "FIXED";
  dialog.resize(contentWidth, 100);
  dialog.paddingLeft = 24;
  dialog.paddingRight = 24;
  dialog.paddingTop = 24;
  dialog.paddingBottom = 24;
  dialog.itemSpacing = 16;
  dialog.cornerRadius = 12;
  dialog.fills = [{ type: "SOLID", color: COLORS.background }];

  // Title
  const title = createText("Skip setup?", 18, "Semi Bold", COLORS.foreground);
  dialog.appendChild(title);

  // Description
  const desc = createText("You can always complete your profile later in settings.", 14, "Regular", COLORS.mutedForeground);
  desc.resize(contentWidth - 48, desc.height);
  desc.textAutoResize = "HEIGHT";
  dialog.appendChild(desc);

  // Buttons
  const buttons = figma.createFrame();
  buttons.name = "buttons";
  buttons.layoutMode = "HORIZONTAL";
  buttons.primaryAxisSizingMode = "AUTO";
  buttons.counterAxisSizingMode = "AUTO";
  buttons.itemSpacing = 12;
  buttons.fills = [];

  const cancelBtn = createButton("Go Back", "outline", 120);
  buttons.appendChild(cancelBtn);

  const skipBtn = createButton("Skip", "primary", 120);
  buttons.appendChild(skipBtn);

  dialog.appendChild(buttons);

  dialog.x = centerX - contentWidth / 2;
  dialog.y = height / 2 - dialog.height / 2;
  frame.appendChild(dialog);
}

async function designGenericOnboardingScreen(frame: FrameNode, screenId: string, contentWidth: number, centerX: number, height: number) {
  let y = 80;

  const title = createText(formatScreenName(screenId), 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 50;

  const form = createFormContainer(contentWidth);
  form.x = centerX - contentWidth / 2;
  form.y = y;
  form.appendChild(createLabeledInput("Field", "Enter value", contentWidth));
  form.appendChild(createButton("Continue", "primary", contentWidth));
  frame.appendChild(form);
}

// ============================================================
// CRUD SCREENS
// ============================================================

async function designCrudScreen(frame: FrameNode, screenId: string, width: number, height: number) {
  const padding = 20;
  const contentWidth = width - padding * 2;

  if (screenId === "list" || screenId === "index") {
    await designListScreen(frame, contentWidth, padding, height);
  } else if (screenId === "detail" || screenId === "view" || screenId === "show") {
    await designDetailScreen(frame, contentWidth, padding, height);
  } else if (screenId === "create" || screenId === "new" || screenId === "add") {
    await designCreateScreen(frame, contentWidth, padding, height);
  } else if (screenId === "edit" || screenId === "update") {
    await designEditScreen(frame, contentWidth, padding, height);
  } else if (screenId === "delete" || screenId === "delete-confirmation") {
    await designDeleteConfirmationScreen(frame, contentWidth, width / 2, height);
  } else if (screenId === "empty" || screenId === "empty-state") {
    await designEmptyStateScreen(frame, contentWidth, width / 2, height);
  } else {
    await designGenericCrudScreen(frame, screenId, contentWidth, padding, height);
  }
}

async function designListScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
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

  const addBtn = createButton("+ Add New", "primary", 100);
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

async function designDetailScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
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

  const editBtn = createButton("Edit", "outline", 80);
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
  const deleteBtn = createButton("Delete Item", "destructive", contentWidth);
  deleteBtn.x = padding;
  deleteBtn.y = height - 70;
  frame.appendChild(deleteBtn);
}

async function designCreateScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
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

  form.appendChild(createLabeledInput("Name", "Enter item name", contentWidth));
  form.appendChild(createLabeledInput("Description", "Enter description", contentWidth));
  form.appendChild(createLabeledSelect("Status", "Select status", contentWidth));
  form.appendChild(createLabeledSelect("Category", "Select category", contentWidth));

  frame.appendChild(form);

  // Buttons at bottom
  const cancelBtn = createButton("Cancel", "outline", contentWidth);
  cancelBtn.x = padding;
  cancelBtn.y = height - 122;
  frame.appendChild(cancelBtn);

  const createBtn = createButton("Create Item", "primary", contentWidth);
  createBtn.x = padding;
  createBtn.y = height - 66;
  frame.appendChild(createBtn);
}

async function designEditScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
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

  form.appendChild(createLabeledInputWithValue("Name", "Sample Item", contentWidth));
  form.appendChild(createLabeledInputWithValue("Description", "This is a sample item", contentWidth));
  form.appendChild(createLabeledSelect("Status", "Active", contentWidth));
  form.appendChild(createLabeledSelect("Category", "General", contentWidth));

  frame.appendChild(form);

  // Buttons
  const cancelBtn = createButton("Cancel", "outline", contentWidth);
  cancelBtn.x = padding;
  cancelBtn.y = height - 122;
  frame.appendChild(cancelBtn);

  const saveBtn = createButton("Save Changes", "primary", contentWidth);
  saveBtn.x = padding;
  saveBtn.y = height - 66;
  frame.appendChild(saveBtn);
}

async function designDeleteConfirmationScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
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

  // Buttons
  const buttons = figma.createFrame();
  buttons.name = "buttons";
  buttons.layoutMode = "HORIZONTAL";
  buttons.primaryAxisSizingMode = "AUTO";
  buttons.counterAxisSizingMode = "AUTO";
  buttons.itemSpacing = 12;
  buttons.fills = [];

  const cancelBtn = createButton("Cancel", "outline", 100);
  buttons.appendChild(cancelBtn);

  const deleteBtn = createButton("Delete", "destructive", 100);
  buttons.appendChild(deleteBtn);

  dialog.appendChild(buttons);

  dialog.x = centerX - dialog.width / 2;
  dialog.y = height / 2 - 100;
  frame.appendChild(dialog);
}

async function designEmptyStateScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
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

  // CTA button
  const ctaBtn = createButton("+ Create Item", "primary", 160);
  ctaBtn.x = centerX - 80;
  ctaBtn.y = y;
  frame.appendChild(ctaBtn);
}

async function designGenericCrudScreen(frame: FrameNode, screenId: string, contentWidth: number, padding: number, height: number) {
  let y = 20;

  const header = createScreenHeader(formatScreenName(screenId), "");
  header.x = padding;
  header.y = y;
  frame.appendChild(header);
  y += 60;

  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;
  form.appendChild(createLabeledInput("Field", "Enter value", contentWidth));
  form.appendChild(createButton("Submit", "primary", contentWidth));
  frame.appendChild(form);
}

// ============================================================
// SEARCH SCREENS
// ============================================================

async function designSearchScreen(frame: FrameNode, screenId: string, width: number, height: number) {
  const padding = 20;
  const contentWidth = width - padding * 2;
  const centerX = width / 2;

  if (screenId === "search" || screenId === "search-input") {
    await designSearchInputScreen(frame, contentWidth, padding, height);
  } else if (screenId === "results" || screenId === "search-results") {
    await designSearchResultsScreen(frame, contentWidth, padding, height);
  } else if (screenId === "no-results" || screenId === "empty") {
    await designNoResultsScreen(frame, contentWidth, centerX, height);
  } else if (screenId === "filters") {
    await designFiltersScreen(frame, contentWidth, padding, height);
  } else {
    await designGenericSearchScreen(frame, screenId, contentWidth, padding, height);
  }
}

async function designSearchInputScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
  let y = 20;

  // Search bar
  const searchBar = createSearchInput(contentWidth);
  searchBar.x = padding;
  searchBar.y = y;
  frame.appendChild(searchBar);
  y += 60;

  // Recent searches
  const recentLabel = createText("Recent Searches", 14, "Semi Bold", COLORS.foreground);
  recentLabel.x = padding;
  recentLabel.y = y;
  frame.appendChild(recentLabel);
  y += 32;

  // Recent items
  for (const term of ["Mobile app design", "Dashboard UI", "Landing page"]) {
    const item = createRecentSearchItem(term, contentWidth);
    item.x = padding;
    item.y = y;
    frame.appendChild(item);
    y += 44;
  }
}

async function designSearchResultsScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
  let y = 20;

  // Search bar with query
  const searchBar = createSearchInputWithValue(contentWidth, "design templates");
  searchBar.x = padding;
  searchBar.y = y;
  frame.appendChild(searchBar);
  y += 56;

  // Results count and filter
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

  // Result cards
  for (let i = 0; i < 3; i++) {
    const card = createSearchResultCard(contentWidth, `Result ${i + 1}`, "Description of the search result item goes here.");
    card.x = padding;
    card.y = y;
    frame.appendChild(card);
    y += card.height + 12;
  }
}

async function designNoResultsScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 60;

  // Search bar
  const searchBar = createSearchInputWithValue(contentWidth, "asdfghjkl");
  searchBar.x = centerX - contentWidth / 2;
  searchBar.y = y;
  frame.appendChild(searchBar);
  y = height / 2 - 80;

  // Empty state
  const icon = createIconCircle("🔍", COLORS.mutedForeground);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  const title = createText("No results found", 20, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 32;

  const desc = createText("Try adjusting your search or filters", 14, "Regular", COLORS.mutedForeground);
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 40;

  const clearBtn = createButton("Clear Search", "outline", 140);
  clearBtn.x = centerX - 70;
  clearBtn.y = y;
  frame.appendChild(clearBtn);
}

async function designFiltersScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
  let y = 20;

  // Header
  const header = figma.createFrame();
  header.name = "header";
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
  const sections = [
    { title: "Category", options: ["All", "Design", "Development", "Marketing"] },
    { title: "Date", options: ["Any time", "Past week", "Past month", "Past year"] },
    { title: "Sort by", options: ["Relevance", "Newest", "Oldest", "Popular"] },
  ];

  for (const section of sections) {
    const sectionTitle = createText(section.title, 14, "Semi Bold", COLORS.foreground);
    sectionTitle.x = padding;
    sectionTitle.y = y;
    frame.appendChild(sectionTitle);
    y += 28;

    for (let i = 0; i < section.options.length; i++) {
      const option = createRadioOption(section.options[i], i === 0, contentWidth);
      option.x = padding;
      option.y = y;
      frame.appendChild(option);
      y += 40;
    }
    y += 16;
  }

  // Apply button
  const applyBtn = createButton("Apply Filters", "primary", contentWidth);
  applyBtn.x = padding;
  applyBtn.y = height - 70;
  frame.appendChild(applyBtn);
}

async function designGenericSearchScreen(frame: FrameNode, screenId: string, contentWidth: number, padding: number, height: number) {
  let y = 20;

  const searchBar = createSearchInput(contentWidth);
  searchBar.x = padding;
  searchBar.y = y;
  frame.appendChild(searchBar);
  y += 60;

  const title = createText(formatScreenName(screenId), 18, "Semi Bold", COLORS.foreground);
  title.x = padding;
  title.y = y;
  frame.appendChild(title);
}

// ============================================================
// SETTINGS SCREENS
// ============================================================

async function designSettingsScreen(frame: FrameNode, screenId: string, width: number, height: number) {
  const padding = 20;
  const contentWidth = width - padding * 2;
  const centerX = width / 2;

  if (screenId === "main" || screenId === "settings" || screenId === "index") {
    await designMainSettingsScreen(frame, contentWidth, padding, height);
  } else if (screenId === "account" || screenId === "profile") {
    await designAccountSettingsScreen(frame, contentWidth, padding, height);
  } else if (screenId === "notifications") {
    await designNotificationSettingsScreen(frame, contentWidth, padding, height);
  } else if (screenId === "security" || screenId === "privacy") {
    await designSecuritySettingsScreen(frame, contentWidth, padding, height);
  } else {
    await designGenericSettingsScreen(frame, screenId, contentWidth, padding, height);
  }
}

async function designMainSettingsScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
  let y = 20;

  // Header
  const title = createText("Settings", 24, "Bold", COLORS.foreground);
  title.x = padding;
  title.y = y;
  frame.appendChild(title);
  y += 50;

  // Settings groups
  const groups = [
    {
      title: "Account",
      items: [
        { icon: "👤", label: "Profile", subtitle: "Manage your profile" },
        { icon: "🔔", label: "Notifications", subtitle: "Notification preferences" },
        { icon: "🔒", label: "Security", subtitle: "Password and security" },
      ],
    },
    {
      title: "Preferences",
      items: [
        { icon: "🎨", label: "Appearance", subtitle: "Theme and display" },
        { icon: "🌐", label: "Language", subtitle: "English (US)" },
      ],
    },
  ];

  for (const group of groups) {
    const groupTitle = createText(group.title, 12, "Medium", COLORS.mutedForeground);
    groupTitle.x = padding;
    groupTitle.y = y;
    frame.appendChild(groupTitle);
    y += 28;

    for (const item of group.items) {
      const row = createSettingsRow(item.icon, item.label, item.subtitle, contentWidth);
      row.x = padding;
      row.y = y;
      frame.appendChild(row);
      y += 64;
    }
    y += 16;
  }

  // Logout button
  const logoutBtn = createButton("Log Out", "outline", contentWidth);
  logoutBtn.x = padding;
  logoutBtn.y = height - 70;
  frame.appendChild(logoutBtn);
}

async function designAccountSettingsScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
  let y = 20;

  // Back and title
  const backBtn = createText("← Settings", 14, "Medium", COLORS.primary);
  backBtn.x = padding;
  backBtn.y = y;
  frame.appendChild(backBtn);
  y += 36;

  const title = createText("Account", 24, "Bold", COLORS.foreground);
  title.x = padding;
  title.y = y;
  frame.appendChild(title);
  y += 50;

  // Avatar section
  const avatarSection = figma.createFrame();
  avatarSection.name = "avatar-section";
  avatarSection.layoutMode = "HORIZONTAL";
  avatarSection.primaryAxisSizingMode = "AUTO";
  avatarSection.counterAxisSizingMode = "AUTO";
  avatarSection.itemSpacing = 16;
  avatarSection.counterAxisAlignItems = "CENTER";
  avatarSection.fills = [];

  const avatar = createAvatarUpload();
  avatar.resize(64, 64);
  avatarSection.appendChild(avatar);

  const changeBtn = createButton("Change Photo", "outline", 120);
  avatarSection.appendChild(changeBtn);

  avatarSection.x = padding;
  avatarSection.y = y;
  frame.appendChild(avatarSection);
  y += 100;

  // Form
  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;

  form.appendChild(createLabeledInputWithValue("Name", "John Doe", contentWidth));
  form.appendChild(createLabeledInputWithValue("Email", "john@example.com", contentWidth));
  form.appendChild(createLabeledInputWithValue("Phone", "+1 (555) 000-0000", contentWidth));

  frame.appendChild(form);

  // Save button
  const saveBtn = createButton("Save Changes", "primary", contentWidth);
  saveBtn.x = padding;
  saveBtn.y = height - 70;
  frame.appendChild(saveBtn);
}

async function designNotificationSettingsScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
  let y = 20;

  // Back and title
  const backBtn = createText("← Settings", 14, "Medium", COLORS.primary);
  backBtn.x = padding;
  backBtn.y = y;
  frame.appendChild(backBtn);
  y += 36;

  const title = createText("Notifications", 24, "Bold", COLORS.foreground);
  title.x = padding;
  title.y = y;
  frame.appendChild(title);
  y += 50;

  // Notification toggles
  const prefs = figma.createFrame();
  prefs.name = "preferences";
  prefs.layoutMode = "VERTICAL";
  prefs.primaryAxisSizingMode = "AUTO";
  prefs.counterAxisSizingMode = "FIXED";
  prefs.resize(contentWidth, 100);
  prefs.itemSpacing = 0;
  prefs.fills = [];

  prefs.appendChild(createPreferenceRow("Push notifications", "Receive push notifications", true));
  prefs.appendChild(createPreferenceRow("Email notifications", "Receive email updates", true));
  prefs.appendChild(createPreferenceRow("SMS notifications", "Receive text messages", false));
  prefs.appendChild(createPreferenceRow("Marketing emails", "Receive promotional content", false));

  prefs.x = padding;
  prefs.y = y;
  frame.appendChild(prefs);
}

async function designSecuritySettingsScreen(frame: FrameNode, contentWidth: number, padding: number, height: number) {
  let y = 20;

  // Back and title
  const backBtn = createText("← Settings", 14, "Medium", COLORS.primary);
  backBtn.x = padding;
  backBtn.y = y;
  frame.appendChild(backBtn);
  y += 36;

  const title = createText("Security", 24, "Bold", COLORS.foreground);
  title.x = padding;
  title.y = y;
  frame.appendChild(title);
  y += 50;

  // Password section
  const passwordLabel = createText("Password", 12, "Medium", COLORS.mutedForeground);
  passwordLabel.x = padding;
  passwordLabel.y = y;
  frame.appendChild(passwordLabel);
  y += 24;

  const passwordRow = createSettingsRow("🔑", "Change password", "Last changed 3 months ago", contentWidth);
  passwordRow.x = padding;
  passwordRow.y = y;
  frame.appendChild(passwordRow);
  y += 80;

  // 2FA section
  const tfaLabel = createText("Two-factor authentication", 12, "Medium", COLORS.mutedForeground);
  tfaLabel.x = padding;
  tfaLabel.y = y;
  frame.appendChild(tfaLabel);
  y += 24;

  const tfaRow = createSettingsRow("🔒", "Enable 2FA", "Add an extra layer of security", contentWidth);
  tfaRow.x = padding;
  tfaRow.y = y;
  frame.appendChild(tfaRow);
  y += 80;

  // Sessions
  const sessionsLabel = createText("Sessions", 12, "Medium", COLORS.mutedForeground);
  sessionsLabel.x = padding;
  sessionsLabel.y = y;
  frame.appendChild(sessionsLabel);
  y += 24;

  const sessionsRow = createSettingsRow("📱", "Manage sessions", "View and manage active sessions", contentWidth);
  sessionsRow.x = padding;
  sessionsRow.y = y;
  frame.appendChild(sessionsRow);
}

async function designGenericSettingsScreen(frame: FrameNode, screenId: string, contentWidth: number, padding: number, height: number) {
  let y = 20;

  const backBtn = createText("← Settings", 14, "Medium", COLORS.primary);
  backBtn.x = padding;
  backBtn.y = y;
  frame.appendChild(backBtn);
  y += 36;

  const title = createText(formatScreenName(screenId), 24, "Bold", COLORS.foreground);
  title.x = padding;
  title.y = y;
  frame.appendChild(title);
  y += 50;

  const form = createFormContainer(contentWidth);
  form.x = padding;
  form.y = y;
  form.appendChild(createLabeledInput("Setting", "Value", contentWidth));
  form.appendChild(createButton("Save", "primary", contentWidth));
  frame.appendChild(form);
}

// ============================================================
// UPLOAD SCREENS
// ============================================================

async function designUploadScreen(frame: FrameNode, screenId: string, width: number, height: number) {
  const padding = 20;
  const contentWidth = width - padding * 2;
  const centerX = width / 2;

  if (screenId === "upload" || screenId === "select") {
    await designFileSelectScreen(frame, contentWidth, centerX, height);
  } else if (screenId === "progress" || screenId === "uploading") {
    await designUploadProgressScreen(frame, contentWidth, centerX, height);
  } else if (screenId === "success" || screenId === "complete") {
    await designUploadSuccessScreen(frame, contentWidth, centerX, height);
  } else if (screenId === "error") {
    await designUploadErrorScreen(frame, contentWidth, centerX, height);
  } else {
    await designGenericUploadScreen(frame, screenId, contentWidth, padding, height);
  }
}

async function designFileSelectScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 80;

  // Title
  const title = createText("Upload Files", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 50;

  // Drop zone
  const dropZone = figma.createFrame();
  dropZone.name = "drop-zone";
  dropZone.resize(contentWidth, 200);
  dropZone.cornerRadius = 12;
  dropZone.fills = [{ type: "SOLID", color: COLORS.muted }];
  dropZone.strokes = [{ type: "SOLID", color: COLORS.border, opacity: 1 }];
  dropZone.strokeWeight = 2;
  dropZone.dashPattern = [8, 4];
  dropZone.layoutMode = "VERTICAL";
  dropZone.primaryAxisAlignItems = "CENTER";
  dropZone.counterAxisAlignItems = "CENTER";
  dropZone.itemSpacing = 12;

  const uploadIcon = createPlaceholderIcon(48, COLORS.mutedForeground, "square");
  dropZone.appendChild(uploadIcon);

  const dropText = createText("Drag and drop files here", 16, "Medium", COLORS.foreground);
  dropZone.appendChild(dropText);

  const orText = createText("or", 14, "Regular", COLORS.mutedForeground);
  dropZone.appendChild(orText);

  const browseBtn = createButton("Browse Files", "outline", 140);
  dropZone.appendChild(browseBtn);

  dropZone.x = centerX - contentWidth / 2;
  dropZone.y = y;
  frame.appendChild(dropZone);
  y += 230;

  // File types info
  const fileTypes = createText("Supported: JPG, PNG, GIF, PDF (max 10MB)", 12, "Regular", COLORS.mutedForeground);
  fileTypes.x = centerX - fileTypes.width / 2;
  fileTypes.y = y;
  frame.appendChild(fileTypes);
}

async function designUploadProgressScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 120;

  // Uploading icon
  const icon = createIconCircle("↑", COLORS.primary);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  // Title
  const title = createText("Uploading...", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 50;

  // Progress bar
  const progressBg = figma.createFrame();
  progressBg.name = "progress-bg";
  progressBg.resize(contentWidth, 8);
  progressBg.cornerRadius = 4;
  progressBg.fills = [{ type: "SOLID", color: COLORS.muted }];
  progressBg.x = centerX - contentWidth / 2;
  progressBg.y = y;
  frame.appendChild(progressBg);

  const progressFill = figma.createFrame();
  progressFill.name = "progress-fill";
  progressFill.resize(contentWidth * 0.65, 8);
  progressFill.cornerRadius = 4;
  progressFill.fills = [{ type: "SOLID", color: COLORS.primary }];
  progressFill.x = centerX - contentWidth / 2;
  progressFill.y = y;
  frame.appendChild(progressFill);
  y += 24;

  // Progress text
  const progressText = createText("65% • 2.3 MB of 3.5 MB", 14, "Regular", COLORS.mutedForeground);
  progressText.x = centerX - progressText.width / 2;
  progressText.y = y;
  frame.appendChild(progressText);
  y += 50;

  // Cancel button
  const cancelBtn = createButton("Cancel", "outline", 120);
  cancelBtn.x = centerX - 60;
  cancelBtn.y = y;
  frame.appendChild(cancelBtn);
}

async function designUploadSuccessScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 120;

  // Success icon
  const icon = createIconCircle("✓", COLORS.success);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  // Title
  const title = createText("Upload Complete!", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Description
  const desc = createText("Your file has been uploaded successfully.", 14, "Regular", COLORS.mutedForeground);
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 50;

  // File preview card
  const fileCard = figma.createFrame();
  fileCard.name = "file-card";
  fileCard.layoutMode = "HORIZONTAL";
  fileCard.primaryAxisSizingMode = "FIXED";
  fileCard.counterAxisSizingMode = "AUTO";
  fileCard.resize(Math.min(contentWidth, 280), 60);
  fileCard.paddingLeft = 16;
  fileCard.paddingRight = 16;
  fileCard.paddingTop = 12;
  fileCard.paddingBottom = 12;
  fileCard.itemSpacing = 12;
  fileCard.counterAxisAlignItems = "CENTER";
  fileCard.cornerRadius = 8;
  fileCard.fills = [{ type: "SOLID", color: COLORS.muted }];

  const fileIcon = createPlaceholderIcon(24, COLORS.foreground, "square");
  fileCard.appendChild(fileIcon);

  const fileName = createText("document.pdf", 14, "Medium", COLORS.foreground);
  fileCard.appendChild(fileName);

  fileCard.x = centerX - fileCard.width / 2;
  fileCard.y = y;
  frame.appendChild(fileCard);
  y += 90;

  // Buttons
  const uploadMoreBtn = createButton("Upload More", "primary", Math.min(contentWidth, 280));
  uploadMoreBtn.x = centerX - uploadMoreBtn.width / 2;
  uploadMoreBtn.y = y;
  frame.appendChild(uploadMoreBtn);
  y += 52;

  const doneBtn = createButton("Done", "outline", Math.min(contentWidth, 280));
  doneBtn.x = centerX - doneBtn.width / 2;
  doneBtn.y = y;
  frame.appendChild(doneBtn);
}

async function designUploadErrorScreen(frame: FrameNode, contentWidth: number, centerX: number, height: number) {
  let y = 120;

  // Error icon
  const icon = createIconCircle("!", COLORS.destructive);
  icon.x = centerX - 28;
  icon.y = y;
  frame.appendChild(icon);
  y += 76;

  // Title
  const title = createText("Upload Failed", 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 36;

  // Description
  const desc = createText("Something went wrong. Please try again.", 14, "Regular", COLORS.mutedForeground);
  desc.x = centerX - desc.width / 2;
  desc.y = y;
  frame.appendChild(desc);
  y += 50;

  // Error card
  const errorCard = createErrorCard(Math.min(contentWidth, 280), "File size exceeds the 10MB limit.");
  errorCard.x = centerX - errorCard.width / 2;
  errorCard.y = y;
  frame.appendChild(errorCard);
  y += 90;

  // Retry button
  const retryBtn = createButton("Try Again", "primary", Math.min(contentWidth, 280));
  retryBtn.x = centerX - retryBtn.width / 2;
  retryBtn.y = y;
  frame.appendChild(retryBtn);
  y += 52;

  // Cancel button
  const cancelBtn = createButton("Cancel", "outline", Math.min(contentWidth, 280));
  cancelBtn.x = centerX - cancelBtn.width / 2;
  cancelBtn.y = y;
  frame.appendChild(cancelBtn);
}

async function designGenericUploadScreen(frame: FrameNode, screenId: string, contentWidth: number, padding: number, height: number) {
  await designFileSelectScreen(frame, contentWidth, frame.width / 2, height);
}

// ============================================================
// GENERIC FALLBACK
// ============================================================

async function designGenericScreen(frame: FrameNode, finding: MissingScreenFinding, width: number, height: number) {
  const padding = 24;
  const contentWidth = Math.min(width - padding * 2, 320);
  const centerX = width / 2;

  let y = 80;

  // Title
  const title = createText(finding.missing_screen.name, 24, "Semi Bold", COLORS.foreground);
  title.x = centerX - title.width / 2;
  title.y = y;
  frame.appendChild(title);
  y += 40;

  // Description
  if (finding.missing_screen.description) {
    const desc = createText(finding.missing_screen.description, 14, "Regular", COLORS.mutedForeground);
    desc.resize(contentWidth, desc.height);
    desc.textAutoResize = "HEIGHT";
    desc.textAlignHorizontal = "CENTER";
    desc.x = centerX - contentWidth / 2;
    desc.y = y;
    frame.appendChild(desc);
    y += desc.height + 30;
  }

  // Render suggested components
  if (finding.recommendation.components.length > 0) {
    await renderComponentStack(finding.recommendation.components, frame, {
      x: centerX - contentWidth / 2,
      y: y,
      maxWidth: contentWidth,
    });
  }
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
