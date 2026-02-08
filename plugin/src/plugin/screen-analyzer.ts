/**
 * Screen Analyzer
 *
 * Analyzes existing screens to extract patterns, components, and styles
 * for reuse in generated screens. Enables static generation to match
 * the exact look and feel of existing designs.
 */

// --- Types ---

export interface DiscoveredInstance {
  /** The original instance node (for cloning) */
  node: InstanceNode;
  /** Component name */
  componentName: string;
  /** Component set name (e.g., "Button" for "Button/Primary") */
  componentSetName?: string;
  /** Variant properties */
  variantProperties?: Record<string, string>;
  /** Context where this instance appears */
  context: {
    screenName: string;
    parentName: string;
    role: "button" | "input" | "card" | "checkbox" | "icon" | "navigation" | "other";
  };
  /** Dimensions */
  width: number;
  height: number;
  /** Extracted fill color (for buttons/cards) */
  fillColor?: RGB;
  /** Extracted text color */
  textColor?: RGB;
}

export interface LayoutPatterns {
  /** Common padding values (sorted by frequency) */
  paddings: number[];
  /** Common gap/spacing values */
  gaps: number[];
  /** Common content widths */
  contentWidths: number[];
  /** Common element heights */
  elementHeights: number[];
  /** Whether screens use centered or left-aligned layouts */
  alignment: "centered" | "left" | "mixed";
  /** Whether screens use card-based layouts */
  usesCards: boolean;
  /** Whether screens have headers */
  hasHeaders: boolean;
}

export interface TextStyles {
  /** Heading styles (large, prominent text) */
  heading: { fontSize: number; fontWeight: string; fontFamily: string };
  /** Subheading styles */
  subheading: { fontSize: number; fontWeight: string; fontFamily: string };
  /** Body text styles */
  body: { fontSize: number; fontWeight: string; fontFamily: string };
  /** Label styles (form labels, small text) */
  label: { fontSize: number; fontWeight: string; fontFamily: string };
  /** Button text styles */
  button: { fontSize: number; fontWeight: string; fontFamily: string };
}

export interface ScreenAnalysis {
  /** Component instances found in screens, grouped by role */
  instances: {
    buttons: DiscoveredInstance[];
    inputs: DiscoveredInstance[];
    cards: DiscoveredInstance[];
    checkboxes: DiscoveredInstance[];
    icons: DiscoveredInstance[];
    navigation: DiscoveredInstance[];
    other: DiscoveredInstance[];
  };
  /** Layout patterns extracted from screens */
  patterns: LayoutPatterns;
  /** Text styles extracted from screens */
  textStyles: TextStyles;
  /** Color palette extracted from screens */
  colors: {
    backgrounds: RGB[];
    foregrounds: RGB[];
    accents: RGB[];
    borders: RGB[];
  };
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

// --- Main Analysis Function ---

/**
 * Analyzes existing screens to extract reusable patterns and components.
 */
export async function analyzeScreens(frames: FrameNode[]): Promise<ScreenAnalysis> {
  const analysis: ScreenAnalysis = {
    instances: {
      buttons: [],
      inputs: [],
      cards: [],
      checkboxes: [],
      icons: [],
      navigation: [],
      other: [],
    },
    patterns: {
      paddings: [],
      gaps: [],
      contentWidths: [],
      elementHeights: [],
      alignment: "mixed",
      usesCards: false,
      hasHeaders: false,
    },
    textStyles: {
      heading: { fontSize: 24, fontWeight: "Semi Bold", fontFamily: "Inter" },
      subheading: { fontSize: 16, fontWeight: "Medium", fontFamily: "Inter" },
      body: { fontSize: 14, fontWeight: "Regular", fontFamily: "Inter" },
      label: { fontSize: 14, fontWeight: "Medium", fontFamily: "Inter" },
      button: { fontSize: 14, fontWeight: "Medium", fontFamily: "Inter" },
    },
    colors: {
      backgrounds: [],
      foregrounds: [],
      accents: [],
      borders: [],
    },
  };

  const paddingCounts = new Map<number, number>();
  const gapCounts = new Map<number, number>();
  const widthCounts = new Map<number, number>();
  const heightCounts = new Map<number, number>();
  let centeredCount = 0;
  let leftCount = 0;
  let cardCount = 0;
  let headerCount = 0;

  for (const frame of frames) {
    // Analyze layout patterns
    analyzeLayoutPatterns(frame, paddingCounts, gapCounts, widthCounts, heightCounts);

    // Check alignment
    const alignment = detectAlignment(frame);
    if (alignment === "centered") centeredCount++;
    else if (alignment === "left") leftCount++;

    // Check for cards
    if (hasCardPattern(frame)) cardCount++;

    // Check for headers
    if (hasHeaderPattern(frame)) headerCount++;

    // Discover component instances
    await discoverInstances(frame, frame.name, analysis.instances);

    // Extract text styles
    extractTextStyles(frame, analysis.textStyles);

    // Extract colors
    extractColors(frame, analysis.colors);
  }

  // Convert counts to sorted arrays
  analysis.patterns.paddings = sortByFrequency(paddingCounts).slice(0, 5);
  analysis.patterns.gaps = sortByFrequency(gapCounts).slice(0, 5);
  analysis.patterns.contentWidths = sortByFrequency(widthCounts).slice(0, 5);
  analysis.patterns.elementHeights = sortByFrequency(heightCounts).slice(0, 5);

  // Determine dominant alignment
  if (centeredCount > leftCount * 1.5) {
    analysis.patterns.alignment = "centered";
  } else if (leftCount > centeredCount * 1.5) {
    analysis.patterns.alignment = "left";
  } else {
    analysis.patterns.alignment = "mixed";
  }

  analysis.patterns.usesCards = cardCount >= frames.length / 2;
  analysis.patterns.hasHeaders = headerCount >= frames.length / 2;

  return analysis;
}

// --- Component Instance Discovery ---

// Map singular role to plural key
function getRoleKey(role: DiscoveredInstance["context"]["role"]): keyof ScreenAnalysis["instances"] {
  const mapping: Record<DiscoveredInstance["context"]["role"], keyof ScreenAnalysis["instances"]> = {
    button: "buttons",
    input: "inputs",
    card: "cards",
    checkbox: "checkboxes",
    icon: "icons",
    navigation: "navigation",
    other: "other",
  };
  return mapping[role];
}

async function discoverInstances(
  node: SceneNode,
  screenName: string,
  instances: ScreenAnalysis["instances"]
): Promise<void> {
  if (node.type === "INSTANCE") {
    const discovered = await processInstance(node, screenName);
    if (discovered) {
      const key = getRoleKey(discovered.context.role);
      if (instances[key]) {
        instances[key].push(discovered);
      }
    }
  }

  if ("children" in node) {
    for (const child of node.children) {
      if (child.type !== "INSTANCE" && child.type !== "COMPONENT") {
        await discoverInstances(child as SceneNode, screenName, instances);
      } else if (child.type === "INSTANCE") {
        const discovered = await processInstance(child, screenName);
        if (discovered) {
          const key = getRoleKey(discovered.context.role);
          if (instances[key]) {
            instances[key].push(discovered);
          }
        }
      }
    }
  }
}

async function processInstance(
  node: InstanceNode,
  screenName: string
): Promise<DiscoveredInstance | null> {
  try {
    const mainComponent = await node.getMainComponentAsync();
    if (!mainComponent) return null;

    let componentName = mainComponent.name;
    let componentSetName: string | undefined;
    let variantProperties: Record<string, string> | undefined;

    // Get component set info
    if (mainComponent.parent?.type === "COMPONENT_SET") {
      componentSetName = mainComponent.parent.name;
      componentName = componentSetName;
    }

    // Get variant properties
    try {
      const props = node.componentProperties;
      if (props && Object.keys(props).length > 0) {
        variantProperties = {};
        for (const [key, val] of Object.entries(props)) {
          if (val?.value !== undefined) {
            variantProperties[key] = String(val.value);
          }
        }
      }
    } catch {
      // Some instances may not have accessible properties
    }

    // Determine role based on component name
    const role = classifyComponentRole(componentName, componentSetName);

    // Extract colors from the instance (for buttons, cards, etc.)
    let fillColor: RGB | undefined;
    let textColor: RGB | undefined;

    // Extract fill color from the instance's fills
    if (node.fills !== figma.mixed && Array.isArray(node.fills)) {
      for (const fill of node.fills as Paint[]) {
        if (fill.type === "SOLID" && fill.visible !== false) {
          fillColor = { r: fill.color.r, g: fill.color.g, b: fill.color.b };
          break;
        }
      }
    }

    // If no fill on the instance, check immediate children (button backgrounds are often nested)
    if (!fillColor && "children" in node && node.children) {
      for (const child of node.children) {
        if ("fills" in child && child.fills !== figma.mixed && Array.isArray(child.fills)) {
          for (const fill of child.fills as Paint[]) {
            if (fill.type === "SOLID" && fill.visible !== false) {
              // Only use if it's not transparent white (background)
              const brightness = fill.color.r * 0.299 + fill.color.g * 0.587 + fill.color.b * 0.114;
              if (brightness < 0.95 || fill.color.r !== fill.color.g || fill.color.g !== fill.color.b) {
                fillColor = { r: fill.color.r, g: fill.color.g, b: fill.color.b };
                break;
              }
            }
          }
        }
        if (fillColor) break;
      }
    }

    // Extract text color from text nodes inside the instance
    const textNodes = node.findAll((n) => n.type === "TEXT") as TextNode[];
    for (const textNode of textNodes) {
      if (textNode.fills !== figma.mixed && Array.isArray(textNode.fills)) {
        for (const fill of textNode.fills as Paint[]) {
          if (fill.type === "SOLID" && fill.visible !== false) {
            textColor = { r: fill.color.r, g: fill.color.g, b: fill.color.b };
            break;
          }
        }
      }
      if (textColor) break;
    }

    return {
      node,
      componentName,
      componentSetName,
      variantProperties,
      context: {
        screenName,
        parentName: node.parent?.name || "unknown",
        role,
      },
      width: node.width,
      height: node.height,
      fillColor,
      textColor,
    };
  } catch {
    return null;
  }
}

function classifyComponentRole(
  name: string,
  setName?: string
): DiscoveredInstance["context"]["role"] {
  const searchName = (setName || name).toLowerCase();

  if (
    searchName.includes("button") ||
    searchName.includes("btn") ||
    searchName.includes("cta")
  ) {
    return "button";
  }

  if (
    searchName.includes("input") ||
    searchName.includes("textfield") ||
    searchName.includes("text-field") ||
    searchName.includes("textarea") ||
    searchName.includes("select") ||
    searchName.includes("combobox")
  ) {
    return "input";
  }

  if (searchName.includes("card") || searchName.includes("panel")) {
    return "card";
  }

  if (
    searchName.includes("checkbox") ||
    searchName.includes("check-box") ||
    searchName.includes("switch") ||
    searchName.includes("toggle") ||
    searchName.includes("radio")
  ) {
    return "checkbox";
  }

  if (searchName.includes("icon") || searchName.includes("icn")) {
    return "icon";
  }

  if (
    searchName.includes("nav") ||
    searchName.includes("tab") ||
    searchName.includes("menu") ||
    searchName.includes("header") ||
    searchName.includes("footer")
  ) {
    return "navigation";
  }

  return "other";
}

// --- Layout Pattern Analysis ---

function analyzeLayoutPatterns(
  node: SceneNode,
  paddingCounts: Map<number, number>,
  gapCounts: Map<number, number>,
  widthCounts: Map<number, number>,
  heightCounts: Map<number, number>
): void {
  if (!("children" in node) || !node.children) return;

  // Check for auto-layout
  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    const frame = node as FrameNode;

    // Extract padding
    const paddings = [
      frame.paddingTop,
      frame.paddingRight,
      frame.paddingBottom,
      frame.paddingLeft,
    ].filter((p): p is number => typeof p === "number" && p > 0 && p <= 48);

    for (const p of paddings) {
      const rounded = Math.round(p);
      paddingCounts.set(rounded, (paddingCounts.get(rounded) || 0) + 1);
    }

    // Extract gap
    if (typeof frame.itemSpacing === "number" && frame.itemSpacing > 0 && frame.itemSpacing <= 48) {
      const gap = Math.round(frame.itemSpacing);
      gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1);
    }
  }

  // Analyze children for widths and heights
  for (const child of node.children) {
    if ("width" in child && "height" in child) {
      // Track common widths (for buttons, inputs, etc.)
      if (child.width >= 50 && child.width <= 400) {
        const w = Math.round(child.width);
        widthCounts.set(w, (widthCounts.get(w) || 0) + 1);
      }

      // Track common heights
      if (child.height >= 24 && child.height <= 80) {
        const h = Math.round(child.height);
        heightCounts.set(h, (heightCounts.get(h) || 0) + 1);
      }

      // Recurse
      if ("children" in child) {
        analyzeLayoutPatterns(
          child as SceneNode,
          paddingCounts,
          gapCounts,
          widthCounts,
          heightCounts
        );
      }
    }
  }
}

function detectAlignment(frame: FrameNode): "centered" | "left" | "mixed" {
  if (!frame.children || frame.children.length === 0) return "mixed";

  const centerX = frame.width / 2;
  let centeredCount = 0;
  let leftCount = 0;

  for (const child of frame.children) {
    if (!("x" in child) || !("width" in child)) continue;

    const childCenterX = child.x + child.width / 2;
    const distFromCenter = Math.abs(childCenterX - centerX);
    const distFromLeft = child.x;

    if (distFromCenter < 20) {
      centeredCount++;
    } else if (distFromLeft < 40) {
      leftCount++;
    }
  }

  if (centeredCount > leftCount * 2) return "centered";
  if (leftCount > centeredCount * 2) return "left";
  return "mixed";
}

function hasCardPattern(frame: FrameNode): boolean {
  const nodes = frame.findAll((n) => {
    if (n.type !== "FRAME" && n.type !== "INSTANCE") return false;
    const name = n.name.toLowerCase();
    return (
      name.includes("card") ||
      name.includes("panel") ||
      name.includes("container")
    );
  });
  return nodes.length > 0;
}

function hasHeaderPattern(frame: FrameNode): boolean {
  const nodes = frame.findAll((n) => {
    const name = n.name.toLowerCase();
    return (
      name.includes("header") ||
      name.includes("navbar") ||
      name.includes("nav-bar") ||
      name.includes("top-bar") ||
      name.includes("topbar")
    );
  });
  return nodes.length > 0;
}

// --- Text Style Extraction ---

function extractTextStyles(
  node: SceneNode,
  styles: ScreenAnalysis["textStyles"]
): void {
  if (node.type === "TEXT") {
    const fontSize = node.fontSize !== figma.mixed ? node.fontSize : 14;
    const fontName = node.fontName !== figma.mixed
      ? node.fontName
      : { family: "Inter", style: "Regular" };

    const nodeName = node.name.toLowerCase();
    const content = node.characters;

    // Classify text by context
    if (
      fontSize >= 20 ||
      nodeName.includes("title") ||
      nodeName.includes("heading") ||
      nodeName.includes("header")
    ) {
      styles.heading = {
        fontSize,
        fontWeight: fontName.style,
        fontFamily: fontName.family,
      };
    } else if (
      fontSize >= 16 ||
      nodeName.includes("subtitle") ||
      nodeName.includes("subheading")
    ) {
      styles.subheading = {
        fontSize,
        fontWeight: fontName.style,
        fontFamily: fontName.family,
      };
    } else if (
      nodeName.includes("label") ||
      nodeName.includes("field") ||
      content.length < 30
    ) {
      styles.label = {
        fontSize,
        fontWeight: fontName.style,
        fontFamily: fontName.family,
      };
    } else {
      styles.body = {
        fontSize,
        fontWeight: fontName.style,
        fontFamily: fontName.family,
      };
    }
  }

  if ("children" in node && node.children) {
    for (const child of node.children) {
      extractTextStyles(child as SceneNode, styles);
    }
  }
}

// --- Color Extraction ---

function extractColors(
  node: SceneNode,
  colors: ScreenAnalysis["colors"]
): void {
  if ("fills" in node && node.fills !== figma.mixed && Array.isArray(node.fills)) {
    for (const fill of node.fills as Paint[]) {
      if (fill.type === "SOLID" && fill.visible !== false) {
        const rgb = { r: fill.color.r, g: fill.color.g, b: fill.color.b };

        // Classify by brightness and context
        const brightness = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;

        if (node.type === "FRAME" && brightness > 0.9) {
          colors.backgrounds.push(rgb);
        } else if (node.type === "TEXT" || brightness < 0.3) {
          colors.foregrounds.push(rgb);
        } else if (isAccentColor(rgb)) {
          colors.accents.push(rgb);
        }
      }
    }
  }

  if ("strokes" in node && node.strokes && Array.isArray(node.strokes)) {
    for (const stroke of node.strokes as Paint[]) {
      if (stroke.type === "SOLID" && stroke.visible !== false) {
        colors.borders.push({
          r: stroke.color.r,
          g: stroke.color.g,
          b: stroke.color.b,
        });
      }
    }
  }

  if ("children" in node && node.children) {
    for (const child of node.children) {
      extractColors(child as SceneNode, colors);
    }
  }
}

function isAccentColor(rgb: RGB): boolean {
  // Check if color is saturated (not gray)
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const saturation = max > 0 ? (max - min) / max : 0;

  return saturation > 0.3;
}

// --- Component Cloning ---

/**
 * Clones a discovered instance for use in a new screen.
 * Optionally applies text overrides.
 */
export async function cloneInstance(
  instance: DiscoveredInstance,
  textOverrides?: Record<string, string>
): Promise<InstanceNode> {
  const clone = instance.node.clone();

  // Apply text overrides (requires font loading)
  if (textOverrides) {
    await applyTextOverrides(clone, textOverrides);
  }

  return clone;
}

/**
 * Finds the best matching instance for a given role and optional variant.
 */
export function findBestInstance(
  instances: DiscoveredInstance[],
  preferredVariant?: string
): DiscoveredInstance | null {
  if (instances.length === 0) return null;

  if (preferredVariant) {
    const variantLower = preferredVariant.toLowerCase();

    // Try to find exact variant match
    const exactMatch = instances.find((i) => {
      if (i.variantProperties) {
        return Object.values(i.variantProperties).some(
          (v) => v.toLowerCase() === variantLower
        );
      }
      return i.componentName.toLowerCase().includes(variantLower);
    });
    if (exactMatch) return exactMatch;

    // Try partial match
    const partialMatch = instances.find((i) => {
      if (i.variantProperties) {
        return Object.values(i.variantProperties).some((v) =>
          v.toLowerCase().includes(variantLower) ||
          variantLower.includes(v.toLowerCase())
        );
      }
      return false;
    });
    if (partialMatch) return partialMatch;
  }

  // Return default/primary variant if available
  const defaultVariant = instances.find((i) => {
    if (i.variantProperties) {
      const values = Object.values(i.variantProperties).map((v) =>
        v.toLowerCase()
      );
      return (
        values.includes("default") ||
        values.includes("primary") ||
        values.includes("filled")
      );
    }
    return false;
  });

  return defaultVariant || instances[0];
}

async function applyTextOverrides(node: SceneNode, overrides: Record<string, string>): Promise<void> {
  if (node.type === "TEXT") {
    const name = node.name.toLowerCase();
    for (const [key, value] of Object.entries(overrides)) {
      if (name.includes(key.toLowerCase()) || key === "*") {
        try {
          // Load the font before modifying text
          const fontName = node.fontName;
          if (fontName !== figma.mixed) {
            await figma.loadFontAsync(fontName);
          } else {
            // For mixed fonts, load all unique fonts in the text
            const len = node.characters.length;
            const loadedFonts = new Set<string>();
            for (let i = 0; i < len; i++) {
              const font = node.getRangeFontName(i, i + 1) as FontName;
              const fontKey = `${font.family}-${font.style}`;
              if (!loadedFonts.has(fontKey)) {
                await figma.loadFontAsync(font);
                loadedFonts.add(fontKey);
              }
            }
          }
          node.characters = value;
        } catch (e) {
          console.warn("[edgy] Failed to apply text override:", e);
        }
        break;
      }
    }
  }

  if ("children" in node && node.children) {
    for (const child of node.children) {
      await applyTextOverrides(child as SceneNode, overrides);
    }
  }
}

// --- Smart Label Generation ---

/**
 * Generates contextual labels based on screen name and flow type.
 */
export function generateSmartLabels(
  screenName: string,
  flowType: string
): {
  title: string;
  subtitle: string;
  primaryButton: string;
  secondaryButton: string;
  inputs: Record<string, { label: string; placeholder: string }>;
} {
  const screenLower = screenName.toLowerCase();
  const flowLower = flowType.toLowerCase();

  // Default labels
  let title = toTitleCase(screenName);
  let subtitle = "";
  let primaryButton = "Continue";
  let secondaryButton = "Cancel";
  const inputs: Record<string, { label: string; placeholder: string }> = {};

  // Flow-specific labels
  if (flowLower === "authentication") {
    if (screenLower.includes("login") || screenLower.includes("sign in")) {
      title = "Welcome Back";
      subtitle = "Sign in to your account";
      primaryButton = "Sign In";
      secondaryButton = "Create Account";
      inputs["email"] = { label: "Email", placeholder: "Enter your email" };
      inputs["password"] = { label: "Password", placeholder: "Enter your password" };
    } else if (screenLower.includes("signup") || screenLower.includes("register")) {
      title = "Create Account";
      subtitle = "Start your journey with us";
      primaryButton = "Create Account";
      secondaryButton = "Sign In Instead";
      inputs["name"] = { label: "Full Name", placeholder: "Enter your name" };
      inputs["email"] = { label: "Email", placeholder: "Enter your email" };
      inputs["password"] = { label: "Password", placeholder: "Create a password" };
    } else if (screenLower.includes("forgot") || screenLower.includes("reset")) {
      title = "Reset Password";
      subtitle = "We'll send you reset instructions";
      primaryButton = "Send Reset Link";
      secondaryButton = "Back to Sign In";
      inputs["email"] = { label: "Email", placeholder: "Enter your email" };
    } else if (screenLower.includes("2fa") || screenLower.includes("verification")) {
      title = "Verification";
      subtitle = "Enter the code we sent you";
      primaryButton = "Verify";
      secondaryButton = "Resend Code";
      inputs["code"] = { label: "Code", placeholder: "Enter 6-digit code" };
    }
  } else if (flowLower === "onboarding") {
    if (screenLower.includes("welcome")) {
      title = "Welcome";
      subtitle = "Let's get you started";
      primaryButton = "Get Started";
      secondaryButton = "Skip";
    } else if (screenLower.includes("profile")) {
      title = "Set Up Your Profile";
      subtitle = "Tell us about yourself";
      primaryButton = "Continue";
      secondaryButton = "Skip for Now";
      inputs["name"] = { label: "Display Name", placeholder: "What should we call you?" };
    } else if (screenLower.includes("preference") || screenLower.includes("setting")) {
      title = "Your Preferences";
      subtitle = "Customize your experience";
      primaryButton = "Save Preferences";
      secondaryButton = "Use Defaults";
    } else if (screenLower.includes("notification")) {
      title = "Stay Updated";
      subtitle = "Choose how you want to be notified";
      primaryButton = "Enable Notifications";
      secondaryButton = "Maybe Later";
    } else if (screenLower.includes("complete") || screenLower.includes("done")) {
      title = "You're All Set!";
      subtitle = "Your account is ready to go";
      primaryButton = "Start Exploring";
      secondaryButton = "";
    }
  } else if (flowLower === "checkout") {
    if (screenLower.includes("cart") || screenLower.includes("basket")) {
      title = "Your Cart";
      subtitle = "Review your items";
      primaryButton = "Proceed to Checkout";
      secondaryButton = "Continue Shopping";
    } else if (screenLower.includes("shipping") || screenLower.includes("address")) {
      title = "Shipping Address";
      subtitle = "Where should we deliver?";
      primaryButton = "Continue";
      secondaryButton = "Back";
      inputs["address"] = { label: "Address", placeholder: "Enter your address" };
      inputs["city"] = { label: "City", placeholder: "Enter city" };
      inputs["zip"] = { label: "ZIP Code", placeholder: "Enter ZIP" };
    } else if (screenLower.includes("payment")) {
      title = "Payment";
      subtitle = "Choose your payment method";
      primaryButton = "Pay Now";
      secondaryButton = "Back";
    } else if (screenLower.includes("confirm") || screenLower.includes("review")) {
      title = "Order Review";
      subtitle = "Confirm your order";
      primaryButton = "Place Order";
      secondaryButton = "Edit Order";
    } else if (screenLower.includes("success") || screenLower.includes("complete")) {
      title = "Order Confirmed!";
      subtitle = "Thank you for your purchase";
      primaryButton = "Track Order";
      secondaryButton = "Continue Shopping";
    }
  } else if (flowLower === "settings") {
    title = toTitleCase(screenName);
    subtitle = "Manage your preferences";
    primaryButton = "Save Changes";
    secondaryButton = "Cancel";
  }

  return {
    title,
    subtitle,
    primaryButton,
    secondaryButton,
    inputs,
  };
}

// --- Utility Functions ---

function sortByFrequency(counts: Map<number, number>): number[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value);
}

function toTitleCase(str: string): string {
  return str
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
