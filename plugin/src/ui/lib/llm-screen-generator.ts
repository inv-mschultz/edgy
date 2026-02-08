/**
 * LLM Screen Generator
 *
 * Generates screen layouts using Claude or Gemini based on design context
 * and reference screenshots. Extends existing LLM infrastructure.
 */

import type {
  MissingScreenFinding,
  ComponentSuggestion,
  FlowType,
  AIProvider,
  ExtractedScreen,
  ExtractedNode,
} from "./types";
import type { DesignTokens, SemanticColorTokens } from "../../plugin/screen-designer";

// Re-export DesignTokens for use in UI
export type { DesignTokens };

// --- Types ---

interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Analysis of existing screens for context */
export interface ScreenAnalysis {
  /** Components used in existing screens with frequency */
  componentsUsed: { name: string; count: number; contexts: string[] }[];
  /** Layout patterns observed */
  layoutPatterns: {
    commonPadding: number[];
    commonGaps: number[];
    commonWidths: number[];
  };
  /** Text styles found */
  textStyles: {
    fontSize: number;
    fontWeight: string;
    usage: string; // e.g., "heading", "body", "label", "button"
  }[];
}

export interface ScreenGenerationRequest {
  missingScreen: MissingScreenFinding;
  designTokens: DesignTokens;
  referenceScreenshots: string[]; // base64 JPGs (2-3 screens)
  flowContext: {
    flowType: FlowType;
    existingScreenNames: string[];
    suggestedComponents: ComponentSuggestion[];
  };
  /** Available components from the Figma file */
  availableComponents?: {
    serialized: string; // Human-readable list for LLM
    componentKeys: Map<string, string>; // name -> key mapping
  };
  /** Analysis of existing screens */
  screenAnalysis?: ScreenAnalysis;
}

export interface GeneratedScreenLayout {
  name: string;
  width: number;
  height: number;
  backgroundColor: RGB;
  elements: GeneratedElement[];
}

export interface GeneratedElement {
  type: "frame" | "text" | "button" | "input" | "card" | "icon" | "separator" | "checkbox" | "image" | "component";
  name: string;
  x: number;
  y: number;
  width: number | "fill";
  height: number | "hug";
  style?: ElementStyle;
  children?: GeneratedElement[];
  textContent?: string;
  variant?: string;
  /** For type="component": reference to a Figma component */
  componentRef?: {
    name: string; // Component name to look up
    overrides?: Record<string, string>; // Text overrides
  };
}

export interface ElementStyle {
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
}

export interface ScreenGenerationResult {
  layout: GeneratedScreenLayout | null;
  wasGenerated: boolean;
  error?: string;
}

type AnthropicContent =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string };
    };

// --- Constants ---

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
// Use Sonnet for good balance of speed and quality
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const GEMINI_MODEL = "gemini-2.0-flash";
const MAX_TOKENS = 4096;
// Maximum concurrent LLM requests to avoid rate limiting
// Process requests sequentially to avoid rate limits
const MAX_CONCURRENT_REQUESTS = 1;
// Delay between requests in milliseconds
const REQUEST_DELAY_MS = 1000;

// --- System Prompt ---

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
- For modal overlays, use semi-transparent backgrounds: { "r": 0, "g": 0, "b": 0 } with opacity handled separately

### Rule 3: Match the Reference Screenshots Style
Study the reference screenshots carefully. Match:
- Button styles (rounded corners, fill colors)
- Input field appearance (borders, placeholders)
- Spacing patterns (padding, gaps between elements)
- Typography hierarchy (heading vs body text sizes)

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

## Example: Preferences Screen

{
  "name": "Preferences",
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
      "textContent": "Your Preferences",
      "style": { "fontSize": 24, "fontWeight": "Semi Bold", "textColor": { "r": 0.09, "g": 0.09, "b": 0.09 } }
    },
    {
      "type": "text",
      "name": "subtitle",
      "x": 24,
      "y": 96,
      "width": 327,
      "height": "hug",
      "textContent": "Customize your experience",
      "style": { "fontSize": 14, "fontWeight": "Regular", "textColor": { "r": 0.45, "g": 0.45, "b": 0.45 } }
    },
    {
      "type": "checkbox",
      "name": "notifications-toggle",
      "x": 24,
      "y": 150,
      "width": 327,
      "height": 48,
      "textContent": "Push Notifications"
    },
    {
      "type": "checkbox",
      "name": "theme-toggle",
      "x": 24,
      "y": 210,
      "width": 327,
      "height": 48,
      "textContent": "Dark Mode"
    },
    {
      "type": "button",
      "name": "save-button",
      "x": 24,
      "y": 700,
      "width": 327,
      "height": 48,
      "textContent": "Save Preferences",
      "variant": "primary"
    },
    {
      "type": "text",
      "name": "skip-link",
      "x": 24,
      "y": 760,
      "width": 327,
      "height": "hug",
      "textContent": "Skip for now",
      "style": { "fontSize": 14, "fontWeight": "Medium", "textColor": { "r": 0.45, "g": 0.45, "b": 0.45 }, "textAlign": "CENTER" }
    }
  ]
}

Remember: Create polished, realistic UI that looks like it was designed by a professional, not placeholder wireframes.`;

// --- Public API ---

export async function generateScreenWithLLM(
  request: ScreenGenerationRequest,
  apiKey: string,
  provider: AIProvider = "claude",
  onProgress?: (message: string) => void
): Promise<ScreenGenerationResult> {
  try {
    onProgress?.("Preparing screen generation context...");

    const userContent = buildUserMessage(request);

    const providerName = provider === "claude" ? "Claude" : "Gemini";
    onProgress?.(`Generating screen layout with ${providerName}...`);

    let responseText: string;
    if (provider === "gemini") {
      responseText = await callGeminiAPI(apiKey, SYSTEM_PROMPT, userContent);
    } else {
      responseText = await callAnthropicAPI(apiKey, SYSTEM_PROMPT, userContent);
    }

    onProgress?.("Parsing generated layout...");

    const layout = parseLayoutResponse(responseText);

    return {
      layout,
      wasGenerated: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Screen generation failed";
    console.error("[edgy] LLM screen generation failed:", errorMessage, error);

    return {
      layout: null,
      wasGenerated: false,
      error: errorMessage,
    };
  }
}

/**
 * Generate multiple screens in parallel for faster processing
 * Uses batching to avoid rate limits while maximizing throughput
 */
export async function generateScreensBatch(
  requests: ScreenGenerationRequest[],
  apiKey: string,
  provider: AIProvider = "claude",
  onProgress?: (completed: number, total: number, currentName: string) => void
): Promise<Map<string, ScreenGenerationResult>> {
  const results = new Map<string, ScreenGenerationResult>();

  if (requests.length === 0) {
    return results;
  }

  // Process in batches to avoid rate limiting
  const batches: ScreenGenerationRequest[][] = [];
  for (let i = 0; i < requests.length; i += MAX_CONCURRENT_REQUESTS) {
    batches.push(requests.slice(i, i + MAX_CONCURRENT_REQUESTS));
  }

  let completed = 0;

  for (const batch of batches) {
    // Run batch concurrently
    const batchPromises = batch.map(async (request) => {
      const screenId = request.missingScreen.missing_screen.id;
      const screenName = request.missingScreen.missing_screen.name;

      try {
        const result = await generateScreenWithLLM(request, apiKey, provider);
        completed++;
        onProgress?.(completed, requests.length, screenName);
        return { screenId, result };
      } catch (error) {
        completed++;
        onProgress?.(completed, requests.length, screenName);
        return {
          screenId,
          result: {
            layout: null,
            wasGenerated: false,
            error: error instanceof Error ? error.message : "Generation failed",
          } as ScreenGenerationResult,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    for (const { screenId, result } of batchResults) {
      results.set(screenId, result);
    }

    // Add delay between batches to avoid rate limiting
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }
  }

  return results;
}

// --- Build User Message ---

// Maximum screenshots to send to LLM (reduced to avoid rate limits)
const MAX_REFERENCE_SCREENSHOTS = 4;

function buildUserMessage(request: ScreenGenerationRequest): AnthropicContent[] {
  const content: AnthropicContent[] = [];

  // Add reference screenshots from all existing screens for better context
  const screenshotCount = Math.min(request.referenceScreenshots.length, MAX_REFERENCE_SCREENSHOTS);
  for (let i = 0; i < screenshotCount; i++) {
    const screenshot = request.referenceScreenshots[i];
    // Detect media type from data URL prefix
    const isPng = screenshot.startsWith("data:image/png");
    const mediaType: "image/jpeg" | "image/png" = isPng ? "image/png" : "image/jpeg";
    // Strip data URL prefix if present
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

  // Log how many screenshots we're sending
  if (screenshotCount > 0) {
    console.log(`[edgy] Sending ${screenshotCount} reference screenshots to LLM`);
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
  .map((c) => `- ${c.name} (${c.shadcn_id}${c.variant ? `, variant: ${c.variant}` : ""})`)
  .join("\n")}
${request.availableComponents?.serialized ? `
## Available Components from Design System (USE THESE!)

The following real components are available in the Figma file. **USE THEM** by setting type="component" and componentRef.name to the component name:

${request.availableComponents.serialized}

**IMPORTANT**: When a component exists in this list, use type="component" with componentRef instead of creating a primitive button/input/card!
` : ""}
${request.screenAnalysis ? `
## Patterns Found in Existing Screens (MATCH THESE!)

### Components Already Used in This Design
${request.screenAnalysis.componentsUsed.length > 0
  ? request.screenAnalysis.componentsUsed
      .slice(0, 10)
      .map((c) => `- **${c.name}** (used ${c.count}x) - contexts: ${c.contexts.slice(0, 3).join(", ")}`)
      .join("\n")
  : "No component instances detected"}

### Layout Patterns
- Common padding values: ${request.screenAnalysis.layoutPatterns.commonPadding.slice(0, 5).join("px, ") || "24"}px
- Common gap/spacing values: ${request.screenAnalysis.layoutPatterns.commonGaps.slice(0, 5).join("px, ") || "16"}px
- Common element widths: ${request.screenAnalysis.layoutPatterns.commonWidths.slice(0, 5).join("px, ") || "327"}px

### Text Styles Used
${request.screenAnalysis.textStyles.length > 0
  ? request.screenAnalysis.textStyles
      .slice(0, 8)
      .map((s) => `- ${s.usage}: ${s.fontSize}px ${s.fontWeight}`)
      .join("\n")
  : "- Headings: 24px Semi Bold\n- Body: 14px Regular\n- Labels: 14px Medium"}

**IMPORTANT**: Use these EXACT patterns to match the existing design!
` : ""}
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

// --- API Calls ---

async function callAnthropicAPI(
  apiKey: string,
  systemPrompt: string,
  userContent: AnthropicContent[]
): Promise<string> {
  console.log("[edgy] Calling Anthropic API for screen generation");

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 401) {
      throw new Error("Invalid API key. Please check your Anthropic API key in settings.");
    }
    if (response.status === 429) {
      throw new Error("Rate limited by Anthropic API. Please try again in a moment.");
    }
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();

  const textBlock = data.content?.find((block: { type: string }) => block.type === "text");
  if (!textBlock?.text) {
    throw new Error("No text content in Anthropic API response");
  }

  return textBlock.text;
}

async function callGeminiAPI(
  apiKey: string,
  systemPrompt: string,
  userContent: AnthropicContent[]
): Promise<string> {
  console.log("[edgy] Calling Gemini API for screen generation");

  // Convert Anthropic content format to Gemini format
  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];

  for (const content of userContent) {
    if (content.type === "text") {
      parts.push({ text: content.text });
    } else if (content.type === "image") {
      parts.push({
        inline_data: {
          mime_type: content.source.media_type,
          data: content.source.data,
        },
      });
    }
  }

  const response = await fetch(`${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          parts,
        },
      ],
      generationConfig: {
        maxOutputTokens: MAX_TOKENS,
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 400 && errorBody.includes("API_KEY_INVALID")) {
      throw new Error("Invalid API key. Please check your Gemini API key in settings.");
    }
    if (response.status === 429) {
      throw new Error("Rate limited by Gemini API. Please try again in a moment.");
    }
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();

  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error("No text content in Gemini API response");
  }

  return textContent;
}

// --- Response Parsing ---

function parseLayoutResponse(responseText: string): GeneratedScreenLayout | null {
  try {
    // Try to extract JSON from the response (handle markdown fences)
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
      console.warn("[edgy] Invalid layout response: missing required fields");
      return null;
    }

    // Provide defaults for optional fields
    return {
      name: parsed.name,
      width: parsed.width || 375,
      height: parsed.height || 812,
      backgroundColor: parsed.backgroundColor || { r: 1, g: 1, b: 1 },
      elements: parsed.elements,
    };
  } catch (error) {
    console.error("[edgy] Failed to parse layout response:", error);
    console.error("[edgy] Response text:", responseText.slice(0, 500));
    return null;
  }
}

// --- Screen Analysis ---

/**
 * Analyzes existing screens to extract patterns for the LLM.
 * This helps the LLM generate screens that match the existing design.
 */
export function analyzeExistingScreens(screens: ExtractedScreen[]): ScreenAnalysis {
  // Return empty analysis if no screens provided
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
      analyzeNode(screen.node_tree, screen.name || "Screen", componentCounts, paddings, gaps, widths, textStyles, seenTextStyles);
    }
  }

  // Convert component map to sorted array
  const componentsUsed = Array.from(componentCounts.entries())
    .map(([name, data]) => ({ name, count: data.count, contexts: data.contexts }))
    .sort((a, b) => b.count - a.count);

  // Get unique, sorted layout values
  const uniquePaddings = [...new Set(paddings)].sort((a, b) => a - b).filter(v => v > 0 && v <= 48);
  const uniqueGaps = [...new Set(gaps)].sort((a, b) => a - b).filter(v => v > 0 && v <= 48);
  const uniqueWidths = [...new Set(widths)].sort((a, b) => a - b).filter(v => v > 50 && v < 400);

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
  // Skip if node is null/undefined
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
  if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") {
    // Common element widths (for content areas)
    if (node.width > 50 && node.width < 400) {
      widths.push(Math.round(node.width));
    }

    // Infer padding from position of first child
    if (node.children && node.children.length > 0) {
      const firstChild = node.children[0];
      if (firstChild.x > 0 && firstChild.x <= 48) {
        paddings.push(Math.round(firstChild.x));
      }
      if (firstChild.y > 0 && firstChild.y <= 48) {
        paddings.push(Math.round(firstChild.y));
      }

      // Infer gaps from spacing between children
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
    // Infer usage from node name or content
    let usage = "body";
    const nameLower = node.name.toLowerCase();
    const contentLength = node.textContent.length;

    if (nameLower.includes("title") || nameLower.includes("heading") || nameLower.includes("header")) {
      usage = "heading";
    } else if (nameLower.includes("label") || nameLower.includes("field")) {
      usage = "label";
    } else if (nameLower.includes("button") || nameLower.includes("btn") || nameLower.includes("cta")) {
      usage = "button";
    } else if (nameLower.includes("caption") || nameLower.includes("hint") || nameLower.includes("helper")) {
      usage = "caption";
    } else if (contentLength < 30 && node.height && node.height > 20) {
      usage = "heading";
    }

    // We don't have direct access to font size in ExtractedNode, but we can infer from height
    // This is a rough approximation - actual font size would be better
    const inferredSize = node.height ? Math.round(node.height * 0.7) : 14;
    const styleKey = `${inferredSize}-${usage}`;

    if (!seenTextStyles.has(styleKey) && inferredSize >= 10 && inferredSize <= 48) {
      seenTextStyles.add(styleKey);
      textStyles.push({
        fontSize: inferredSize,
        fontWeight: usage === "heading" ? "Semi Bold" : usage === "button" ? "Medium" : "Regular",
        usage,
      });
    }
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      analyzeNode(child, screenName, componentCounts, paddings, gaps, widths, textStyles, seenTextStyles);
    }
  }
}
