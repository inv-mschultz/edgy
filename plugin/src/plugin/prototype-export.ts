/**
 * Prototype Export
 *
 * Generates prototypes from existing and generated screens.
 * Supports two export modes:
 * 1. HTML (legacy): Static HTML with absolute positioning
 * 2. Next.js + shadcn (new): React components using shadcn/ui
 */

import type { ExtractedScreen, MissingScreenFinding, PrototypeFile, GeneratedScreenLayout } from "../ui/lib/types";
import type { DesignTokens, SemanticColorTokens } from "./screen-designer";
import {
  generateScreenPage,
  generateHtmlFromLayout,
  generateHtmlFromNodeTree,
  generateCssVariables,
  generateBaseStyles,
  generateInteractivePrototype,
  slugify,
  escapeHtml,
  rgbToCss,
} from "./html-renderer";
import { classifyNodeTree, type ClassifiedElement } from "./element-classifier";
import { generateScreenComponent, generateAllScreens, generateScreensFromLayouts, type GeneratedScreen } from "./shadcn-code-generator";
import { generateNextJsBundle, type BundleOptions } from "./nextjs-bundler";

// --- Types ---

export interface PrototypeScreen {
  id: string;
  name: string;
  slug: string;
  source: "existing" | "generated";
  width: number;
  height: number;
  htmlContent: string;
  thumbnail?: string;
  backgroundColor?: { r: number; g: number; b: number };
}

export interface NavigationLink {
  fromScreen: string;
  toScreen: string;
  trigger: "button" | "link" | "tap";
  label?: string;
  hotspot?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PrototypeBundle {
  screens: PrototypeScreen[];
  navigation: NavigationLink[];
  designTokens: DesignTokens;
  indexHtml: string;
  stylesCSS: string;
}

export interface PrototypeExportOptions {
  includeNavigation?: boolean;
  imageBasedFallback?: boolean;
  flowType?: string;
}

// --- Default Design Tokens ---

const DEFAULT_TOKENS: DesignTokens = {
  primaryColor: { r: 0.09, g: 0.09, b: 0.09 },
  backgroundColor: { r: 1, g: 1, b: 1 },
  textColor: { r: 0.09, g: 0.09, b: 0.09 },
  mutedColor: { r: 0.45, g: 0.45, b: 0.45 },
  borderColor: { r: 0.9, g: 0.9, b: 0.9 },
  borderRadius: 8,
  fontFamily: "Inter",
  baseFontSize: 14,
  headingFontSize: 24,
};

// --- Flow Detection ---

/**
 * Detects the flow type from screen name.
 */
function detectFlowFromName(name: string): string | null {
  const lower = name.toLowerCase();

  if (/login|signup|sign.?up|register|auth|password|forgot|reset|verify|2fa|mfa/.test(lower)) {
    return "authentication";
  }
  if (/cart|checkout|payment|order|shipping|billing/.test(lower)) {
    return "checkout";
  }
  if (/onboard|welcome|tutorial|intro|getting.?started|setup/.test(lower)) {
    return "onboarding";
  }
  if (/search|filter|results|browse/.test(lower)) {
    return "search";
  }
  if (/setting|preference|config|profile|account/.test(lower)) {
    return "settings";
  }
  if (/upload|import|attach/.test(lower)) {
    return "upload";
  }
  if (/create|edit|new|add|delete|list|detail|view/.test(lower)) {
    return "crud";
  }

  return null;
}

/**
 * Infers navigation links between screens based on flow patterns.
 */
function inferNavigationLinks(screens: PrototypeScreen[]): NavigationLink[] {
  const links: NavigationLink[] = [];

  // Group screens by detected flow
  const flowGroups = new Map<string, PrototypeScreen[]>();
  for (const screen of screens) {
    const flow = detectFlowFromName(screen.name) || "general";
    if (!flowGroups.has(flow)) {
      flowGroups.set(flow, []);
    }
    flowGroups.get(flow)!.push(screen);
  }

  // Create links within each flow
  for (const [flow, flowScreens] of flowGroups) {
    if (flow === "authentication") {
      // Auth flow: login -> signup, login -> forgot password, forgot -> reset, etc.
      const login = flowScreens.find((s) => /login|sign.?in/i.test(s.name));
      const signup = flowScreens.find((s) => /signup|sign.?up|register/i.test(s.name));
      const forgot = flowScreens.find((s) => /forgot/i.test(s.name));
      const reset = flowScreens.find((s) => /reset/i.test(s.name));
      const verify = flowScreens.find((s) => /verify|2fa|mfa/i.test(s.name));

      if (login && signup) {
        links.push({ fromScreen: login.slug, toScreen: signup.slug, trigger: "link", label: "Sign up" });
        links.push({ fromScreen: signup.slug, toScreen: login.slug, trigger: "link", label: "Sign in" });
      }
      if (login && forgot) {
        links.push({ fromScreen: login.slug, toScreen: forgot.slug, trigger: "link", label: "Forgot password" });
      }
      if (forgot && reset) {
        links.push({ fromScreen: forgot.slug, toScreen: reset.slug, trigger: "button", label: "Reset" });
      }
      if (forgot && login) {
        links.push({ fromScreen: forgot.slug, toScreen: login.slug, trigger: "link", label: "Back to login" });
      }
      if (reset && login) {
        links.push({ fromScreen: reset.slug, toScreen: login.slug, trigger: "button", label: "Continue" });
      }
      if (login && verify) {
        links.push({ fromScreen: login.slug, toScreen: verify.slug, trigger: "button", label: "Sign in" });
      }
    }

    if (flow === "checkout") {
      // Checkout flow: cart -> checkout -> payment -> confirmation
      const cart = flowScreens.find((s) => /cart/i.test(s.name));
      const checkout = flowScreens.find((s) => /checkout/i.test(s.name) && !/cart/i.test(s.name));
      const payment = flowScreens.find((s) => /payment/i.test(s.name));
      const shipping = flowScreens.find((s) => /shipping/i.test(s.name));
      const confirm = flowScreens.find((s) => /confirm|success|complete/i.test(s.name));

      if (cart && checkout) {
        links.push({ fromScreen: cart.slug, toScreen: checkout.slug, trigger: "button", label: "Checkout" });
      }
      if (checkout && shipping) {
        links.push({ fromScreen: checkout.slug, toScreen: shipping.slug, trigger: "button", label: "Continue" });
      }
      if (shipping && payment) {
        links.push({ fromScreen: shipping.slug, toScreen: payment.slug, trigger: "button", label: "Continue" });
      }
      if (checkout && payment && !shipping) {
        links.push({ fromScreen: checkout.slug, toScreen: payment.slug, trigger: "button", label: "Continue" });
      }
      if (payment && confirm) {
        links.push({ fromScreen: payment.slug, toScreen: confirm.slug, trigger: "button", label: "Place order" });
      }
    }

    if (flow === "onboarding") {
      // Onboarding: sequential flow
      for (let i = 0; i < flowScreens.length - 1; i++) {
        links.push({
          fromScreen: flowScreens[i].slug,
          toScreen: flowScreens[i + 1].slug,
          trigger: "button",
          label: "Next",
        });
      }
    }

    if (flow === "crud") {
      // CRUD: list -> detail, list -> create, detail -> edit
      const list = flowScreens.find((s) => /list|index|all/i.test(s.name));
      const detail = flowScreens.find((s) => /detail|view|show/i.test(s.name));
      const create = flowScreens.find((s) => /create|new|add/i.test(s.name));
      const edit = flowScreens.find((s) => /edit|update/i.test(s.name));

      if (list && detail) {
        links.push({ fromScreen: list.slug, toScreen: detail.slug, trigger: "tap", label: "View item" });
      }
      if (list && create) {
        links.push({ fromScreen: list.slug, toScreen: create.slug, trigger: "button", label: "Create" });
      }
      if (detail && edit) {
        links.push({ fromScreen: detail.slug, toScreen: edit.slug, trigger: "button", label: "Edit" });
      }
      if (detail && list) {
        links.push({ fromScreen: detail.slug, toScreen: list.slug, trigger: "link", label: "Back" });
      }
      if (create && list) {
        links.push({ fromScreen: create.slug, toScreen: list.slug, trigger: "button", label: "Save" });
      }
      if (edit && detail) {
        links.push({ fromScreen: edit.slug, toScreen: detail.slug, trigger: "button", label: "Save" });
      }
    }
  }

  return links;
}

// --- Screen Processing ---

/**
 * Processes an existing screen into a PrototypeScreen.
 */
function processExistingScreen(
  screen: ExtractedScreen,
  tokens: DesignTokens,
  useImageFallback: boolean
): PrototypeScreen {
  const slug = slugify(screen.name);

  let htmlContent: string;
  if (useImageFallback && screen.thumbnail_base64) {
    // Use thumbnail as background image
    htmlContent = `    <div style="width: 100%; height: 100%; background-image: url('${screen.thumbnail_base64}'); background-size: contain; background-repeat: no-repeat; background-position: center;"></div>`;
  } else {
    // Convert node tree to HTML
    htmlContent = generateHtmlFromNodeTree(screen.node_tree, tokens);
  }

  return {
    id: screen.screen_id,
    name: screen.name,
    slug,
    source: "existing",
    width: screen.width,
    height: screen.height,
    htmlContent,
    thumbnail: screen.thumbnail_base64,
  };
}

/**
 * Processes a generated screen layout into a PrototypeScreen.
 */
function processGeneratedScreen(
  finding: MissingScreenFinding,
  layout: GeneratedScreenLayout,
  tokens: DesignTokens
): PrototypeScreen {
  const slug = slugify(finding.missing_screen.name);
  const htmlContent = generateHtmlFromLayout(layout, tokens);

  return {
    id: finding.id,
    name: finding.missing_screen.name,
    slug,
    source: "generated",
    width: layout.width,
    height: layout.height,
    htmlContent,
    backgroundColor: layout.backgroundColor,
  };
}

/**
 * Processes a missing screen finding without a generated layout (template fallback).
 */
function processPlaceholderScreen(
  finding: MissingScreenFinding,
  tokens: DesignTokens
): PrototypeScreen {
  const slug = slugify(finding.missing_screen.name);
  const width = finding.placeholder?.width || 375;
  const height = finding.placeholder?.height || 812;

  // Generate simple placeholder content
  const htmlContent = `    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px; text-align: center;">
      <h2 style="margin-bottom: 16px;">${escapeHtml(finding.missing_screen.name)}</h2>
      <p style="color: var(--muted-foreground); margin-bottom: 24px;">${escapeHtml(finding.missing_screen.description)}</p>
      <div style="padding: 12px 24px; background: var(--muted); border-radius: var(--border-radius); font-size: 12px; color: var(--muted-foreground);">
        Generated placeholder for ${escapeHtml(finding.flow_type)} flow
      </div>
    </div>`;

  return {
    id: finding.id,
    name: finding.missing_screen.name,
    slug,
    source: "generated",
    width,
    height,
    htmlContent,
  };
}

// --- Index Page Generation ---

/**
 * Generates the index.html page with screen grid.
 */
function generateIndexPage(
  screens: PrototypeScreen[],
  tokens: DesignTokens,
  navigation: NavigationLink[]
): string {
  const cssVars = generateCssVariables(tokens);
  const baseStyles = generateBaseStyles();

  const screenCards = screens
    .map((screen) => {
      const thumbnail = screen.thumbnail
        ? `<img src="${screen.thumbnail}" alt="${escapeHtml(screen.name)}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 8px 8px 0 0;">`
        : `<div style="width: 100%; height: 200px; background: var(--muted); border-radius: 8px 8px 0 0; display: flex; align-items: center; justify-content: center; color: var(--muted-foreground);">${escapeHtml(screen.name)}</div>`;

      const badge = screen.source === "generated"
        ? `<span style="position: absolute; top: 8px; right: 8px; padding: 2px 8px; background: var(--primary); color: var(--primary-foreground); font-size: 10px; border-radius: 4px;">AI Generated</span>`
        : "";

      return `      <a href="screens/${screen.slug}.html" class="screen-card">
        <div style="position: relative;">
          ${thumbnail}
          ${badge}
        </div>
        <div style="padding: 12px;">
          <div style="font-weight: 500;">${escapeHtml(screen.name)}</div>
          <div style="font-size: 12px; color: var(--muted-foreground);">${screen.width} x ${screen.height}</div>
        </div>
      </a>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prototype</title>
  <style>
    :root {
${cssVars}
    }
${baseStyles}

    .prototype-header {
      padding: 24px 32px;
      border-bottom: 1px solid var(--border);
      background: var(--background);
    }

    .prototype-title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .prototype-subtitle {
      color: var(--muted-foreground);
      font-size: 14px;
    }

    .screen-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
      padding: 32px;
    }

    .screen-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      transition: transform 0.15s, box-shadow 0.15s;
      text-decoration: none;
      color: inherit;
    }

    .screen-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    }

    .stats-bar {
      display: flex;
      gap: 24px;
      padding: 16px 32px;
      background: var(--muted);
      border-bottom: 1px solid var(--border);
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }

    .stat-value {
      font-weight: 600;
    }
  </style>
</head>
<body>
  <header class="prototype-header">
    <h1 class="prototype-title">Prototype</h1>
    <p class="prototype-subtitle">${screens.length} screens</p>
  </header>

  <div class="stats-bar">
    <div class="stat">
      <span class="stat-value">${screens.filter((s) => s.source === "existing").length}</span>
      <span>Existing screens</span>
    </div>
    <div class="stat">
      <span class="stat-value">${screens.filter((s) => s.source === "generated").length}</span>
      <span>Generated screens</span>
    </div>
    <div class="stat">
      <span class="stat-value">${navigation.length}</span>
      <span>Navigation links</span>
    </div>
  </div>

  <div class="screen-grid">
${screenCards}
  </div>
</body>
</html>`;
}

// --- Main Export Function ---

/**
 * Flow sequence definitions for ordering screens within a flow.
 */
const FLOW_SEQUENCES: Record<string, string[]> = {
  authentication: [
    "welcome", "login", "signin", "signup", "register", "forgot", "reset",
    "verify", "2fa", "mfa", "otp", "success", "confirmation"
  ],
  checkout: [
    "cart", "checkout", "shipping", "address", "delivery", "payment",
    "review", "confirmation", "success", "receipt"
  ],
  onboarding: [
    "welcome", "intro", "step1", "step2", "step3", "tutorial",
    "permissions", "notifications", "complete", "done"
  ],
  settings: [
    "settings", "profile", "account", "preferences", "notifications",
    "privacy", "security", "password", "delete"
  ],
  crud: [
    "list", "index", "browse", "search", "filter", "detail", "view",
    "create", "new", "add", "edit", "update", "delete", "confirm"
  ],
};

/**
 * Gets the sequence index for a screen name within its flow.
 */
function getFlowSequenceIndex(screenName: string, flowType: string): number {
  const sequence = FLOW_SEQUENCES[flowType] || [];
  const nameLower = screenName.toLowerCase();

  for (let i = 0; i < sequence.length; i++) {
    if (nameLower.includes(sequence[i])) {
      return i;
    }
  }
  return 999; // Unknown position, place at end
}

/**
 * Intelligently orders screens, inserting generated screens at the correct flow position.
 */
function orderScreensByFlow(
  existingScreens: PrototypeScreen[],
  generatedScreens: PrototypeScreen[],
  missingFindings: MissingScreenFinding[]
): PrototypeScreen[] {
  // Create a map of generated screen ID to its finding for flow info
  const findingMap = new Map<string, MissingScreenFinding>();
  for (const finding of missingFindings) {
    findingMap.set(finding.id, finding);
  }

  // Group all screens by flow type
  const flowGroups = new Map<string, PrototypeScreen[]>();
  const unclassified: PrototypeScreen[] = [];

  // Add existing screens to flow groups
  for (const screen of existingScreens) {
    const flow = detectFlowFromName(screen.name);
    if (flow) {
      if (!flowGroups.has(flow)) flowGroups.set(flow, []);
      flowGroups.get(flow)!.push(screen);
    } else {
      unclassified.push(screen);
    }
  }

  // Add generated screens to their respective flow groups
  for (const screen of generatedScreens) {
    const finding = findingMap.get(screen.id);
    const flow = finding?.flow_type || detectFlowFromName(screen.name) || "general";
    if (!flowGroups.has(flow)) flowGroups.set(flow, []);
    flowGroups.get(flow)!.push(screen);
  }

  // Sort screens within each flow group by their sequence position
  for (const [flowType, screens] of flowGroups) {
    screens.sort((a, b) => {
      const indexA = getFlowSequenceIndex(a.name, flowType);
      const indexB = getFlowSequenceIndex(b.name, flowType);
      return indexA - indexB;
    });
  }

  // Combine all screens: classified flows first (in a logical order), then unclassified
  const orderedFlows = ["authentication", "onboarding", "checkout", "crud", "settings", "search", "upload", "general"];
  const result: PrototypeScreen[] = [];

  for (const flowType of orderedFlows) {
    const screens = flowGroups.get(flowType);
    if (screens) {
      result.push(...screens);
      flowGroups.delete(flowType);
    }
  }

  // Add any remaining flow groups
  for (const screens of flowGroups.values()) {
    result.push(...screens);
  }

  // Add unclassified screens at the end
  result.push(...unclassified);

  return result;
}

/**
 * Generates a complete prototype bundle from existing and generated screens.
 */
export function generatePrototypeBundle(
  existingScreens: ExtractedScreen[],
  generatedLayouts: Record<string, GeneratedScreenLayout>,
  missingFindings: MissingScreenFinding[],
  tokens?: DesignTokens,
  options: PrototypeExportOptions = {}
): PrototypeBundle {
  const designTokens = tokens || DEFAULT_TOKENS;
  // Always use interactive HTML, not image fallback, for clickable elements
  const useImageFallback = false;

  // Process existing screens
  const existingProtoScreens = existingScreens.map((screen) =>
    processExistingScreen(screen, designTokens, useImageFallback)
  );

  // Process generated/missing screens
  const generatedProtoScreens: PrototypeScreen[] = [];
  for (const finding of missingFindings) {
    const layout = generatedLayouts[finding.id];
    if (layout) {
      generatedProtoScreens.push(processGeneratedScreen(finding, layout, designTokens));
    } else {
      generatedProtoScreens.push(processPlaceholderScreen(finding, designTokens));
    }
  }

  // Order screens intelligently, placing generated screens in their correct flow position
  const allScreens = orderScreensByFlow(existingProtoScreens, generatedProtoScreens, missingFindings);

  // Ensure unique slugs
  const slugCounts = new Map<string, number>();
  for (const screen of allScreens) {
    const count = slugCounts.get(screen.slug) || 0;
    if (count > 0) {
      screen.slug = `${screen.slug}-${count}`;
    }
    slugCounts.set(screen.slug, count + 1);
  }

  // Infer navigation
  const navigation = options.includeNavigation !== false
    ? inferNavigationLinks(allScreens)
    : [];

  // Generate CSS
  const stylesCSS = `:root {
${generateCssVariables(designTokens)}
}
${generateBaseStyles()}`;

  // Generate index page
  const indexHtml = generateIndexPage(allScreens, designTokens, navigation);

  return {
    screens: allScreens,
    navigation,
    designTokens,
    indexHtml,
    stylesCSS,
  };
}

/**
 * Generates individual screen HTML pages.
 */
export function generateScreenPages(
  bundle: PrototypeBundle
): Map<string, string> {
  const pages = new Map<string, string>();
  const screenList = bundle.screens.map((s) => ({ name: s.name, slug: s.slug }));

  for (const screen of bundle.screens) {
    const html = generateScreenPage(
      screen.name,
      screen.slug,
      screen.width,
      screen.height,
      screen.htmlContent,
      bundle.designTokens,
      screenList,
      screen.backgroundColor
    );
    pages.set(`screens/${screen.slug}.html`, html);
  }

  return pages;
}

/**
 * Generates navigation JSON for programmatic use.
 */
export function generateNavigationManifest(
  bundle: PrototypeBundle
): string {
  const manifest = {
    screens: bundle.screens.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      source: s.source,
      dimensions: { width: s.width, height: s.height },
    })),
    links: bundle.navigation,
  };

  return JSON.stringify(manifest, null, 2);
}

/**
 * Generates a package.json for the prototype.
 */
export function generatePackageJson(name: string = "prototype"): string {
  return JSON.stringify(
    {
      name: slugify(name),
      version: "1.0.0",
      private: true,
      scripts: {
        dev: "npx serve .",
        preview: "open index.html",
      },
    },
    null,
    2
  );
}

/**
 * Generates a README for the prototype.
 */
export function generateReadme(bundle: PrototypeBundle): string {
  const existingCount = bundle.screens.filter((s) => s.source === "existing").length;
  const generatedCount = bundle.screens.filter((s) => s.source === "generated").length;

  return `# Prototype

This prototype was generated by Edgy.

## Screens

- **${existingCount}** existing screens (from Figma)
- **${generatedCount}** generated screens (AI-designed)
- **${bundle.navigation.length}** navigation links

## Running Locally

\`\`\`bash
# Option 1: Using serve
npx serve .

# Option 2: Using Python
python -m http.server 3000

# Option 3: Just open the file
open index.html
\`\`\`

## Screen List

${bundle.screens.map((s) => `- [${s.name}](screens/${s.slug}.html) (${s.source})`).join("\n")}

## Navigation

${bundle.navigation.map((n) => `- ${n.fromScreen} → ${n.toScreen} (${n.trigger}${n.label ? `: "${n.label}"` : ""})`).join("\n")}
`;
}

// --- File Bundle Generation ---

/**
 * Generates all files needed for the prototype bundle.
 */
export function generateAllPrototypeFiles(
  bundle: PrototypeBundle,
  projectName: string = "prototype"
): PrototypeFile[] {
  const files: PrototypeFile[] = [];

  // Generate interactive phone-framed prototype as main index
  const interactiveHtml = generateInteractivePrototype(
    bundle.screens,
    bundle.navigation,
    bundle.designTokens
  );
  files.push({ path: "index.html", content: interactiveHtml });

  // Also include a grid view for overview
  files.push({ path: "overview.html", content: bundle.indexHtml });

  // Styles
  files.push({ path: "styles/main.css", content: bundle.stylesCSS });

  // Individual screen pages (for direct linking)
  const screenPages = generateScreenPages(bundle);
  for (const [path, content] of screenPages) {
    files.push({ path, content });
  }

  // Navigation manifest
  files.push({
    path: "navigation.json",
    content: generateNavigationManifest(bundle),
  });

  // Package.json (simplified for Vercel static deployment)
  files.push({
    path: "package.json",
    content: generatePackageJson(projectName),
  });

  return files;
}

// --- shadcn/Next.js Export ---

export type ExportMode = "html" | "nextjs";

export interface ShadcnExportOptions {
  projectName: string;
  includeNavigation?: boolean;
}

/**
 * Generates a Next.js + shadcn prototype from extracted screens.
 * This is the new, higher-quality export path.
 */
export function generateShadcnPrototype(
  existingScreens: ExtractedScreen[],
  generatedLayouts: Record<string, GeneratedScreenLayout>,
  missingFindings: MissingScreenFinding[],
  tokens?: DesignTokens,
  options: ShadcnExportOptions = { projectName: "prototype" }
): PrototypeFile[] {
  // Classify each screen's node tree
  const classifiedScreens: Array<{ name: string; classifiedTree: ClassifiedElement }> = [];

  for (const screen of existingScreens) {
    const classifiedTree = classifyNodeTree(screen.node_tree);
    classifiedScreens.push({
      name: screen.name,
      classifiedTree,
    });
  }

  // Helper to extract RGB from color (strip alpha if present)
  const toRGB = (color: { r: number; g: number; b: number }) => ({
    r: color.r,
    g: color.g,
    b: color.b,
  });

  // Generate React components for each screen
  const shadcnTokens = tokens ? {
    primaryColor: toRGB(tokens.semanticColors?.primary || tokens.primaryColor),
    backgroundColor: toRGB(tokens.semanticColors?.background || tokens.backgroundColor),
    foregroundColor: toRGB(tokens.semanticColors?.foreground || tokens.textColor),
    mutedColor: toRGB(tokens.semanticColors?.muted || tokens.mutedColor),
    borderColor: toRGB(tokens.semanticColors?.border || tokens.borderColor),
    borderRadius: tokens.borderRadius / 16, // Convert px to rem
  } : undefined;

  // Generate components from existing Figma screens
  const existingGenerated = generateAllScreens(classifiedScreens, shadcnTokens);

  // Generate components from AI-generated layouts
  const layoutsToProcess: Array<{ name: string; layout: GeneratedScreenLayout }> = [];
  const findings = missingFindings || [];
  const layouts = generatedLayouts || {};
  for (const finding of findings) {
    const layout = layouts[finding.id];
    if (layout) {
      layoutsToProcess.push({
        name: finding.missing_screen.name,
        layout,
      });
    }
  }
  const generatedFromLayouts = generateScreensFromLayouts(layoutsToProcess, shadcnTokens);

  // Combine all screens
  const allScreens = [...existingGenerated, ...generatedFromLayouts];

  // Bundle into Next.js project
  const bundleOptions: BundleOptions = {
    projectName: options.projectName,
    screens: allScreens,
    tokens: shadcnTokens,
    includeNavigation: options.includeNavigation ?? true,
  };

  return generateNextJsBundle(bundleOptions);
}

/**
 * Main export function that supports both modes.
 */
export function generatePrototype(
  mode: ExportMode,
  existingScreens: ExtractedScreen[],
  generatedLayouts: Record<string, GeneratedScreenLayout>,
  missingFindings: MissingScreenFinding[],
  tokens?: DesignTokens,
  options: PrototypeExportOptions & ShadcnExportOptions = { projectName: "prototype" }
): PrototypeFile[] {
  if (mode === "nextjs") {
    // New shadcn-based export (includes AI-generated screens)
    return generateShadcnPrototype(existingScreens, generatedLayouts, missingFindings, tokens, options);
  }

  // Legacy HTML export
  const bundle = generatePrototypeBundle(
    existingScreens,
    generatedLayouts,
    missingFindings,
    tokens,
    options
  );

  return generateAllPrototypeFiles(bundle, options.projectName);
}

export type { DesignTokens, SemanticColorTokens };
