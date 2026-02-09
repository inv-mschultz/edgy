/**
 * Screen Generator Service
 *
 * Generates screen layouts using Claude or Gemini based on design context
 * and reference screenshots.
 */

import type {
  MissingScreenFinding,
  ComponentSuggestion,
  FlowType,
  AIProvider,
  ExtractedScreen,
  ExtractedNode,
  GeneratedScreenLayout,
  GeneratedElement,
  DesignTokens,
  DiscoveredComponentInfo,
} from "../lib/types";
import { callLLMForGeneration, sleep, type ContentPart } from "../lib/llm";
import type { SSEStream } from "../lib/sse";

// --- Types ---

interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface ScreenAnalysis {
  componentsUsed: { name: string; count: number; contexts: string[] }[];
  layoutPatterns: {
    commonPadding: number[];
    commonGaps: number[];
    commonWidths: number[];
  };
  textStyles: {
    fontSize: number;
    fontWeight: string;
    usage: string;
  }[];
}

export interface ScreenGenerationRequest {
  missingScreen: MissingScreenFinding;
  designTokens: DesignTokens;
  referenceScreenshots: string[];
  flowContext: {
    flowType: FlowType;
    existingScreenNames: string[];
    suggestedComponents: ComponentSuggestion[];
  };
  availableComponents?: {
    serialized: string;
    componentKeys: Map<string, string>;
  };
  screenAnalysis?: ScreenAnalysis;
}

export interface ScreenGenerationResult {
  layout: GeneratedScreenLayout | null;
  wasGenerated: boolean;
  error?: string;
}

// --- Constants ---

const MAX_REFERENCE_SCREENSHOTS = 4;
const CLAUDE_REQUEST_DELAY_MS = 500;
const GEMINI_REQUEST_DELAY_MS = 2000;

const SYSTEM_PROMPT = `You are a professional UI designer creating Figma screen layouts. Generate polished, production-ready designs that match the existing design system perfectly.

## Input Context
You will receive:
1. Screenshots of existing screens (study their visual style carefully)
2. Extracted design tokens with exact colors, fonts, and spacing
3. The screen type to create (e.g., "Profile Setup" in Onboarding flow)
4. Available components from the Figma design system

## CRITICAL RULES - Read Carefully

### Rule 1: ALWAYS Use Contextual, Meaningful Labels
**NEVER use generic text like "Button", "Label", or "Text".** Every piece of text must be meaningful for the specific screen context.

BAD (generic - DO NOT DO THIS):
- textContent: "Button"
- textContent: "Label"
- textContent: "Enter value..."

GOOD (contextual):
- For a Profile Setup screen: "Save Profile", "Upload Photo", "What should we call you?"
- For a Preferences screen: "Enable Notifications", "Dark Mode", "Save Preferences"
- For a Skip Confirmation: "Go Back", "Skip for Now", "Are you sure?"

### Rule 2: Use Proper Background Colors
- Screen backgrounds: Use the Background color from tokens (usually white or near-white)
- Cards/dialogs: Use Card color (usually white with subtle border)
- **NEVER use solid black backgrounds** unless explicitly designing a dark theme

### Rule 3: Match the Reference Screenshots Style
Study the reference screenshots carefully. Match button styles, input field appearance, spacing patterns, and typography hierarchy.

### Rule 4: Proper Screen Structure
Follow logical UI hierarchy:
1. Title/header at top (24-28px, Semi Bold or Bold)
2. Subtitle/description below title (14px, Regular, muted color)
3. Main content in middle (forms, options, etc.)
4. Primary action button near bottom
5. Secondary actions (links, skip) below primary button

## JSON Response Format
Respond with ONLY valid JSON (no markdown fences, no explanation):

{
  "name": "Screen Name",
  "width": 375,
  "height": 812,
  "backgroundColor": { "r": 1, "g": 1, "b": 1 },
  "elements": [
    {
      "type": "text",
      "name": "title",
      "x": 24,
      "y": 60,
      "width": 327,
      "height": "hug",
      "textContent": "Set Up Your Profile",
      "style": {
        "fontSize": 24,
        "fontWeight": "Semi Bold",
        "textColor": { "r": 0.09, "g": 0.09, "b": 0.09 }
      }
    },
    {
      "type": "button",
      "name": "continue-button",
      "x": 24,
      "y": 700,
      "width": 327,
      "height": 48,
      "textContent": "Continue",
      "variant": "primary"
    }
  ]
}

## Element Types

### text
For headings, paragraphs, labels. MUST have meaningful textContent.

### button
For action buttons. MUST have descriptive textContent like "Save Changes", "Continue", "Skip for Now".
Variants: "primary" (filled), "secondary" (gray), "outline" (bordered), "ghost" (text only), "destructive" (red)

**CRITICAL RULE - Button Hierarchy**: When multiple buttons appear together, they MUST have different variants:
- NEVER use two "primary" buttons together
- In vertical stacks: top button = primary, bottom button = outline/ghost/secondary

### input
For text inputs. textContent is the placeholder - make it helpful like "Enter your email" not "Enter value...".

### checkbox
For toggles/checkboxes. textContent is the label like "Receive notifications" not "Option".

### card
For grouped content. Use for dialogs, info cards. Style with white background and border, NOT solid black.

### frame
For layout containers. Use layoutMode: "VERTICAL" or "HORIZONTAL" for auto-layout.

### separator
For divider lines. Thin horizontal line using border color.

Remember: Create polished, realistic UI that looks like it was designed by a professional, not placeholder wireframes.`;

// --- Public API ---

export async function generateScreen(
  request: ScreenGenerationRequest,
  apiKey: string,
  provider: AIProvider = "claude"
): Promise<ScreenGenerationResult> {
  try {
    const userContent = buildUserMessage(request);

    const response = await callLLMForGeneration(
      apiKey,
      provider,
      SYSTEM_PROMPT,
      userContent
    );

    const layout = parseLayoutResponse(response.text);

    return {
      layout,
      wasGenerated: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Screen generation failed";
    console.error("[screen-generator] Failed:", errorMessage, error);

    return {
      layout: null,
      wasGenerated: false,
      error: errorMessage,
    };
  }
}

/**
 * Generate multiple screens with rate limiting and progress updates
 */
export async function generateScreensBatch(
  requests: ScreenGenerationRequest[],
  apiKey: string,
  provider: AIProvider = "claude",
  stream?: SSEStream
): Promise<Map<string, ScreenGenerationResult>> {
  const results = new Map<string, ScreenGenerationResult>();

  if (requests.length === 0) {
    return results;
  }

  let completed = 0;
  const total = requests.length;

  for (const request of requests) {
    const screenId = request.missingScreen.missing_screen.id;
    const screenName = request.missingScreen.missing_screen.name;

    await stream?.sendProgress({
      stage: "generating",
      message: `Generating ${screenName}...`,
      progress: 0.75 + (completed / total) * 0.15,
      screen: screenName,
      current: completed + 1,
      total,
    });

    try {
      const result = await generateScreen(request, apiKey, provider);
      completed++;
      results.set(screenId, result);
    } catch (error) {
      completed++;
      results.set(screenId, {
        layout: null,
        wasGenerated: false,
        error: error instanceof Error ? error.message : "Generation failed",
      });
    }

    // Rate limiting delay between requests
    if (completed < total) {
      const delayMs =
        provider === "gemini" ? GEMINI_REQUEST_DELAY_MS : CLAUDE_REQUEST_DELAY_MS;
      await sleep(delayMs);
    }
  }

  await stream?.sendProgress({
    stage: "generation_complete",
    message: `Generated ${completed} screen${completed !== 1 ? "s" : ""}`,
    progress: 0.9,
  });

  return results;
}

// --- Build User Message ---

function buildUserMessage(request: ScreenGenerationRequest): ContentPart[] {
  const content: ContentPart[] = [];

  // Add reference screenshots
  const screenshotCount = Math.min(
    request.referenceScreenshots.length,
    MAX_REFERENCE_SCREENSHOTS
  );
  for (let i = 0; i < screenshotCount; i++) {
    const screenshot = request.referenceScreenshots[i];
    const isPng = screenshot.startsWith("data:image/png");
    const mediaType: "image/jpeg" | "image/png" = isPng
      ? "image/png"
      : "image/jpeg";
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: base64Data,
      },
    });
  }

  if (screenshotCount > 0) {
    console.log(
      `[screen-generator] Sending ${screenshotCount} reference screenshots`
    );
  }

  // Build text context
  const tokens = request.designTokens;
  const sem = tokens.semanticColors || {};

  const colorTokensText = `
## Design Tokens

### Colors (RGB values 0-1)
- Primary: ${formatRGB(sem.primary || tokens.primaryColor)}
- Primary Foreground: ${formatRGB(sem.primaryForeground || { r: 1, g: 1, b: 1 })}
- Background: ${formatRGB(sem.background || tokens.backgroundColor)}
- Foreground: ${formatRGB(sem.foreground || tokens.textColor)}
- Muted: ${formatRGB(sem.muted || { r: 0.96, g: 0.96, b: 0.96 })}
- Muted Foreground: ${formatRGB(sem.mutedForeground || tokens.mutedColor)}
- Border: ${formatRGB(sem.border || tokens.borderColor)}
- Destructive: ${formatRGB(sem.destructive || { r: 0.94, g: 0.27, b: 0.27 })}
- Card: ${formatRGB(sem.card || tokens.backgroundColor)}
- Card Foreground: ${formatRGB(sem.cardForeground || tokens.textColor)}

### Typography
- Font Family: ${tokens.fontFamily}
- Base Font Size: ${tokens.baseFontSize}px
- Heading Font Size: ${tokens.headingFontSize}px

### Layout
- Border Radius: ${tokens.borderRadius}px
`;

  const screenContext = `
## Screen to Generate

**Flow Type**: ${request.flowContext.flowType}
**Screen Name**: ${request.missingScreen.missing_screen.name}
**Description**: ${request.missingScreen.missing_screen.description}

**Other screens in this flow**: ${request.flowContext.existingScreenNames.join(", ") || "None detected"}

**Suggested components for this screen**:
${request.flowContext.suggestedComponents
  .map(
    (c) =>
      `- ${c.name} (${c.shadcn_id}${c.variant ? `, variant: ${c.variant}` : ""})`
  )
  .join("\n")}
${
  request.availableComponents?.serialized
    ? `
## Available Components from Design System (MUST USE!)

The following real components exist in the Figma file. You MUST use them:

${request.availableComponents.serialized}

**CRITICAL**: For buttons, inputs, cards, and checkboxes - if a matching component exists above, you MUST use type="component" with componentRef.name set to the exact component name (including variant).
`
    : ""
}
${
  request.screenAnalysis
    ? `
## Patterns Found in Existing Screens (MATCH THESE!)

### Components Already Used in This Design
${
  request.screenAnalysis.componentsUsed.length > 0
    ? request.screenAnalysis.componentsUsed
        .slice(0, 10)
        .map(
          (c) =>
            `- **${c.name}** (used ${c.count}x) - contexts: ${c.contexts.slice(0, 3).join(", ")}`
        )
        .join("\n")
    : "No component instances detected"
}

### Layout Patterns
- Common padding values: ${request.screenAnalysis.layoutPatterns.commonPadding.slice(0, 5).join("px, ") || "24"}px
- Common gap/spacing values: ${request.screenAnalysis.layoutPatterns.commonGaps.slice(0, 5).join("px, ") || "16"}px
- Common element widths: ${request.screenAnalysis.layoutPatterns.commonWidths.slice(0, 5).join("px, ") || "327"}px

### Text Styles Used
${
  request.screenAnalysis.textStyles.length > 0
    ? request.screenAnalysis.textStyles
        .slice(0, 8)
        .map((s) => `- ${s.usage}: ${s.fontSize}px ${s.fontWeight}`)
        .join("\n")
    : "- Headings: 24px Semi Bold\n- Body: 14px Regular\n- Labels: 14px Medium"
}

**IMPORTANT**: Use these EXACT patterns to match the existing design!
`
    : ""
}
## Instructions

You have been provided with ${request.referenceScreenshots.length} screenshot${request.referenceScreenshots.length !== 1 ? "s" : ""} of existing screens in this design. **STUDY THEM CAREFULLY** - they show the exact visual style you need to match.

Generate a layout for "${request.missingScreen.missing_screen.name}" that:
1. **LOOKS LIKE IT BELONGS** with the reference screenshots - same visual style, spacing, and feel
2. **USES REAL COMPONENTS** from the Available Components list when possible
3. **MATCHES THE LAYOUT PATTERNS** exactly - same padding, spacing, and element widths
4. **USES THE SAME TEXT STYLES** - same font sizes and weights as the existing screens
5. **USES THE EXACT COLORS** from the design tokens - no invented colors
6. Includes the suggested components in a sensible arrangement

The generated screen should be indistinguishable from the existing screens in terms of quality and style.

Generate the JSON layout now:
`;

  content.push({
    type: "text",
    text: colorTokensText + screenContext,
  });

  return content;
}

function formatRGB(color: RGB): string {
  return `{ r: ${color.r.toFixed(2)}, g: ${color.g.toFixed(2)}, b: ${color.b.toFixed(2)} }`;
}

// --- Response Parsing ---

function parseLayoutResponse(responseText: string): GeneratedScreenLayout | null {
  try {
    let jsonText = responseText.trim();

    // Remove markdown code fences if present
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith("```")) {
      jsonText = jsonText.slice(0, -3);
    }

    jsonText = jsonText.trim();

    const parsed = JSON.parse(jsonText);

    // Validate required fields
    if (!parsed.name || !parsed.elements || !Array.isArray(parsed.elements)) {
      console.warn("[screen-generator] Invalid layout response: missing required fields");
      return null;
    }

    return {
      name: parsed.name,
      width: parsed.width || 375,
      height: parsed.height || 812,
      backgroundColor: parsed.backgroundColor || { r: 1, g: 1, b: 1 },
      elements: parsed.elements,
    };
  } catch (error) {
    console.error("[screen-generator] Failed to parse layout response:", error);
    console.error("[screen-generator] Response text:", responseText.slice(0, 500));
    return null;
  }
}

// --- Screen Analysis ---

export function analyzeExistingScreens(screens: ExtractedScreen[]): ScreenAnalysis {
  if (!screens || !Array.isArray(screens) || screens.length === 0) {
    return {
      componentsUsed: [],
      layoutPatterns: {
        commonPadding: [24],
        commonGaps: [16],
        commonWidths: [327],
      },
      textStyles: [
        { fontSize: 24, fontWeight: "Semi Bold", usage: "heading" },
        { fontSize: 14, fontWeight: "Regular", usage: "body" },
        { fontSize: 14, fontWeight: "Medium", usage: "label" },
      ],
    };
  }

  const componentCounts = new Map<string, { count: number; contexts: string[] }>();
  const paddings: number[] = [];
  const gaps: number[] = [];
  const widths: number[] = [];
  const textStyles: ScreenAnalysis["textStyles"] = [];
  const seenTextStyles = new Set<string>();

  for (const screen of screens) {
    if (screen && screen.node_tree) {
      analyzeNode(
        screen.node_tree,
        screen.name || "Screen",
        componentCounts,
        paddings,
        gaps,
        widths,
        textStyles,
        seenTextStyles
      );
    }
  }

  const componentsUsed = Array.from(componentCounts.entries())
    .map(([name, data]) => ({ name, count: data.count, contexts: data.contexts }))
    .sort((a, b) => b.count - a.count);

  const uniquePaddings = [...new Set(paddings)]
    .sort((a, b) => a - b)
    .filter((v) => v > 0 && v <= 48);
  const uniqueGaps = [...new Set(gaps)]
    .sort((a, b) => a - b)
    .filter((v) => v > 0 && v <= 48);
  const uniqueWidths = [...new Set(widths)]
    .sort((a, b) => a - b)
    .filter((v) => v > 50 && v < 400);

  return {
    componentsUsed,
    layoutPatterns: {
      commonPadding: uniquePaddings.slice(0, 5),
      commonGaps: uniqueGaps.slice(0, 5),
      commonWidths: uniqueWidths.slice(0, 5),
    },
    textStyles: textStyles.slice(0, 10),
  };
}

function analyzeNode(
  node: ExtractedNode,
  screenName: string,
  componentCounts: Map<string, { count: number; contexts: string[] }>,
  paddings: number[],
  gaps: number[],
  widths: number[],
  textStyles: ScreenAnalysis["textStyles"],
  seenTextStyles: Set<string>
): void {
  if (!node) return;

  // Track component usage
  if (node.componentName) {
    const existing = componentCounts.get(node.componentName);
    if (existing) {
      existing.count++;
      if (!existing.contexts.includes(screenName)) {
        existing.contexts.push(screenName);
      }
    } else {
      componentCounts.set(node.componentName, { count: 1, contexts: [screenName] });
    }
  }

  // Track layout patterns from frames
  if (
    node.type === "FRAME" ||
    node.type === "COMPONENT" ||
    node.type === "INSTANCE"
  ) {
    if (node.width > 50 && node.width < 400) {
      widths.push(Math.round(node.width));
    }

    if (node.children && node.children.length > 0) {
      const firstChild = node.children[0];
      if (firstChild.x > 0 && firstChild.x <= 48) {
        paddings.push(Math.round(firstChild.x));
      }
      if (firstChild.y > 0 && firstChild.y <= 48) {
        paddings.push(Math.round(firstChild.y));
      }

      for (let i = 1; i < node.children.length; i++) {
        const prev = node.children[i - 1];
        const curr = node.children[i];
        const verticalGap = curr.y - (prev.y + prev.height);
        const horizontalGap = curr.x - (prev.x + prev.width);

        if (verticalGap > 0 && verticalGap <= 48) {
          gaps.push(Math.round(verticalGap));
        }
        if (horizontalGap > 0 && horizontalGap <= 48) {
          gaps.push(Math.round(horizontalGap));
        }
      }
    }
  }

  // Track text styles
  if (node.type === "TEXT" && node.textContent) {
    let usage = "body";
    const nameLower = node.name.toLowerCase();
    const contentLength = node.textContent.length;

    if (
      nameLower.includes("title") ||
      nameLower.includes("heading") ||
      nameLower.includes("header")
    ) {
      usage = "heading";
    } else if (nameLower.includes("label") || nameLower.includes("field")) {
      usage = "label";
    } else if (
      nameLower.includes("button") ||
      nameLower.includes("btn") ||
      nameLower.includes("cta")
    ) {
      usage = "button";
    } else if (
      nameLower.includes("caption") ||
      nameLower.includes("hint") ||
      nameLower.includes("helper")
    ) {
      usage = "caption";
    } else if (contentLength < 30 && node.height && node.height > 20) {
      usage = "heading";
    }

    const inferredSize = node.height ? Math.round(node.height * 0.7) : 14;
    const styleKey = `${inferredSize}-${usage}`;

    if (!seenTextStyles.has(styleKey) && inferredSize >= 10 && inferredSize <= 48) {
      seenTextStyles.add(styleKey);
      textStyles.push({
        fontSize: inferredSize,
        fontWeight:
          usage === "heading"
            ? "Semi Bold"
            : usage === "button"
              ? "Medium"
              : "Regular",
        usage,
      });
    }
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      analyzeNode(
        child,
        screenName,
        componentCounts,
        paddings,
        gaps,
        widths,
        textStyles,
        seenTextStyles
      );
    }
  }
}
