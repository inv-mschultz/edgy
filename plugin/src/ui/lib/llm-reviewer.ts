/**
 * LLM Reviewer
 *
 * Reviews heuristic analysis findings using Claude to remove false
 * positives, improve descriptions, and adjust severity.
 */

import type {
  AnalysisInput,
  AnalysisOutput,
  AnalysisFinding,
  FlowFinding,
  ExtractedNode,
  ExtractedScreen,
} from "./types";

// --- Types ---

export interface LLMReviewResult {
  output: AnalysisOutput;
  wasEnhanced: boolean;
  error?: string;
}

type AnthropicContent =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string };
    };

interface CondensedNode {
  id: string;
  name: string;
  type: string;
  componentName?: string;
  textContent?: string;
  children: CondensedNode[];
}

interface LLMRefinement {
  screens: Array<{
    screen_id: string;
    findings: Array<{
      id: string;
      action: "keep" | "remove" | "modify";
      severity?: "critical" | "warning" | "info";
      title?: string;
      description?: string;
      recommendation_message?: string;
      removal_reason?: string;
    }>;
  }>;
  flow_findings: Array<{
    id: string;
    action: "keep" | "remove" | "modify";
    severity?: "critical" | "warning" | "info";
    title?: string;
    description?: string;
    recommendation_message?: string;
    removal_reason?: string;
  }>;
  flow_insights?: string[];
}

// --- Constants ---

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-4-5-20251101";
const MAX_TOKENS = 8192;

const SYSTEM_PROMPT = `You are Edgy's AI review layer — a UX edge case analysis assistant integrated into a Figma plugin.

## What Edgy Does
Edgy analyzes UI design flows for missing edge cases. It uses heuristic rules to detect UI patterns (forms, lists, buttons, data displays) in Figma designs, then checks whether expected states exist (error states, empty states, loading states, etc.). When expected states are missing, it generates findings.

## The 8 Edge Case Categories
1. **Empty States** — Missing zero-data/first-use states for lists, tables, dashboards
2. **Loading States** — Missing skeleton screens, spinners, progress indicators
3. **Error States** — Missing form validation, submission error handling, API error states
4. **Edge Inputs** — Missing handling for long text, special characters, unusual formats
5. **Boundary Conditions** — Missing min/max/overflow states for counters, pagination, limits
6. **Permissions** — Missing unauthorized/forbidden/disabled states for restricted actions
7. **Connectivity** — Missing offline/network error/retry states
8. **Destructive Actions** — Missing confirmation dialogs, undo options for delete/remove actions

## Your Role
You receive the heuristic analysis results along with screen thumbnails and relevant node tree context. Your job is to REVIEW and REFINE the existing findings — NOT generate entirely new ones. Specifically:

1. **Remove false positives**: If a finding is clearly wrong based on what you see in the thumbnail (e.g., the heuristic flagged "destructive action has no confirmation" but the button is clearly just a "Cancel" button for a form, not a data-destructive action), mark it for removal.

2. **Improve descriptions**: Make finding descriptions more specific and actionable by referencing what you actually see in the screen. Instead of generic "Form fields missing error states", say "The Email and Password inputs on the Login screen have no visible error variants — add inline validation with FormMessage below each field."

3. **Adjust severity**: If the heuristic assigned the wrong severity level, correct it. For example, a missing empty state on a settings page might be "info" rather than "warning".

4. **Add flow-level insights**: When findings across multiple screens are related, note the connection. For example, "Screen 2 shows an error state for the email field, but the password field on Screen 1 still lacks one."

## Response Format
Respond with a JSON object (no markdown code fences, just raw JSON). The schema:

{
  "screens": [
    {
      "screen_id": "the screen ID",
      "findings": [
        {
          "id": "original finding ID",
          "action": "keep" | "remove" | "modify",
          "severity": "critical" | "warning" | "info",
          "title": "refined title (only if action is modify)",
          "description": "refined description (only if action is modify)",
          "recommendation_message": "refined recommendation (only if action is modify)",
          "removal_reason": "why this is a false positive (only if action is remove)"
        }
      ]
    }
  ],
  "flow_findings": [
    {
      "id": "original flow finding ID",
      "action": "keep" | "remove" | "modify",
      "severity": "critical" | "warning" | "info",
      "title": "refined title",
      "description": "refined description",
      "recommendation_message": "refined recommendation",
      "removal_reason": "why this is a false positive"
    }
  ],
  "flow_insights": [
    "Any cross-screen observations worth noting"
  ]
}

## Important Rules
- Do NOT invent new findings — only review existing ones
- Do NOT change finding IDs, rule_ids, categories, affected_nodes, or affected_area
- Do NOT change the component recommendations (those come from a curated knowledge base)
- When in doubt, KEEP the finding — it's better to flag a potential issue than miss one
- Be VERY concise — keep descriptions under 100 characters
- Only use "modify" when truly necessary; prefer "keep" or "remove"
- Skip flow_insights unless critical`;

// --- Public API ---

export async function reviewWithLLM(
  heuristicOutput: AnalysisOutput,
  input: AnalysisInput,
  apiKey: string,
  onProgress?: (message: string) => void
): Promise<LLMReviewResult> {
  if (heuristicOutput.summary.total_findings === 0) {
    return { output: heuristicOutput, wasEnhanced: false };
  }

  try {
    onProgress?.("Preparing context for AI review...");

    const userContent = buildUserMessage(heuristicOutput, input);

    onProgress?.("Reviewing findings with AI...");

    const responseText = await callAnthropicAPI(
      apiKey,
      SYSTEM_PROMPT,
      userContent
    );

    onProgress?.("Applying AI refinements...");

    const refinements = parseAndValidateResponse(responseText);
    const enhancedOutput = mergeRefinements(heuristicOutput, refinements);

    return {
      output: enhancedOutput,
      wasEnhanced: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "LLM review failed";
    console.error("[edgy] LLM review failed:", errorMessage, error);
    return {
      output: heuristicOutput,
      wasEnhanced: false,
      error: errorMessage,
    };
  }
}

// --- Node Tree Condensation ---

function condenseNodeTree(
  rootNode: ExtractedNode,
  affectedNodeIds: Set<string>
): CondensedNode {
  const parentMap = new Map<string, string>();
  const nodeMap = new Map<string, ExtractedNode>();

  function buildMaps(node: ExtractedNode, parentId?: string) {
    nodeMap.set(node.id, node);
    if (parentId) parentMap.set(node.id, parentId);
    for (const child of node.children) {
      buildMaps(child, node.id);
    }
  }
  buildMaps(rootNode);

  // Determine which nodes to keep: affected + ancestors + siblings
  const keepIds = new Set<string>();

  for (const nodeId of affectedNodeIds) {
    if (!nodeMap.has(nodeId)) continue;
    keepIds.add(nodeId);

    // Walk up to root
    let current = nodeId;
    while (parentMap.has(current)) {
      current = parentMap.get(current)!;
      keepIds.add(current);
    }

    // Add siblings
    const pid = parentMap.get(nodeId);
    if (pid) {
      const p = nodeMap.get(pid);
      if (p) {
        for (const sibling of p.children) {
          keepIds.add(sibling.id);
        }
      }
    }
  }

  function condense(node: ExtractedNode): CondensedNode | null {
    if (!keepIds.has(node.id)) return null;

    const condensedChildren: CondensedNode[] = [];
    let skippedCount = 0;
    for (const child of node.children) {
      const condensedChild = condense(child);
      if (condensedChild) {
        condensedChildren.push(condensedChild);
      } else {
        skippedCount++;
      }
    }

    if (skippedCount > 0) {
      condensedChildren.push({
        id: "_omitted",
        name: `[${skippedCount} other children omitted]`,
        type: "OMITTED",
        children: [],
      });
    }

    return {
      id: node.id,
      name: node.name,
      type: node.type,
      ...(node.componentName && { componentName: node.componentName }),
      ...(node.textContent && { textContent: node.textContent }),
      children: condensedChildren,
    };
  }

  return (
    condense(rootNode) ?? {
      id: rootNode.id,
      name: rootNode.name,
      type: rootNode.type,
      children: [],
    }
  );
}

// --- Message Construction ---

function buildUserMessage(
  heuristicOutput: AnalysisOutput,
  input: AnalysisInput
): AnthropicContent[] {
  const content: AnthropicContent[] = [];

  content.push({
    type: "text",
    text: `I've run Edgy's heuristic analysis on ${input.screens.length} screen(s) from "${input.file_name}". Below are the screen thumbnails, findings, and relevant node tree context. Please review each finding.\n`,
  });

  for (const screen of input.screens) {
    const screenResult = heuristicOutput.screens.find(
      (s) => s.screen_id === screen.screen_id
    );

    if (!screenResult || screenResult.findings.length === 0) continue;

    content.push({
      type: "text",
      text: `\n--- Screen: "${screen.name}" (ID: ${screen.screen_id}) ---\n`,
    });

    // Thumbnail
    if (screen.thumbnail_base64) {
      const isJpeg = screen.thumbnail_base64.startsWith("data:image/jpeg");
      const base64Data = screen.thumbnail_base64.replace(
        /^data:image\/(jpeg|png);base64,/,
        ""
      );
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: isJpeg ? "image/jpeg" : "image/png",
          data: base64Data,
        },
      });
    }

    // Findings
    content.push({
      type: "text",
      text: `\nFindings:\n${JSON.stringify(
        screenResult.findings.map((f) => ({
          id: f.id,
          rule_id: f.rule_id,
          category: f.category,
          severity: f.severity,
          title: f.title,
          description: f.description,
          affected_nodes: f.affected_nodes,
          recommendation: f.recommendation.message,
        })),
        null,
        2
      )}\n`,
    });

    // Condensed node tree
    const affectedIds = new Set(
      screenResult.findings.flatMap((f) => f.affected_nodes)
    );
    const condensed = condenseNodeTree(screen.node_tree, affectedIds);
    content.push({
      type: "text",
      text: `\nNode tree (condensed):\n${JSON.stringify(condensed, null, 2)}\n`,
    });
  }

  // Flow-level findings
  if (heuristicOutput.flow_findings.length > 0) {
    content.push({
      type: "text",
      text: `\n--- Flow-Level Findings ---\n${JSON.stringify(
        heuristicOutput.flow_findings.map((f) => ({
          id: f.id,
          rule_id: f.rule_id,
          category: f.category,
          severity: f.severity,
          title: f.title,
          description: f.description,
          recommendation: f.recommendation.message,
        })),
        null,
        2
      )}\n`,
    });
  }

  content.push({
    type: "text",
    text: "\nPlease review all findings and respond with your refinements in the specified JSON format.",
  });

  return content;
}

// --- API Call ---

async function callAnthropicAPI(
  apiKey: string,
  systemPrompt: string,
  userContent: AnthropicContent[]
): Promise<string> {
  console.log("[edgy] Calling Anthropic API with model:", MODEL);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
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
      throw new Error(
        "Invalid API key. Please check your Anthropic API key in settings."
      );
    }
    if (response.status === 429) {
      throw new Error(
        "Rate limited by Anthropic API. Please try again in a moment."
      );
    }
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();

  const textBlock = data.content?.find(
    (block: { type: string }) => block.type === "text"
  );
  if (!textBlock?.text) {
    throw new Error("No text content in Anthropic API response");
  }

  return textBlock.text;
}

// --- Response Parsing ---

function parseAndValidateResponse(responseText: string): LLMRefinement {
  let jsonStr = responseText.trim();

  // Handle potential markdown fences
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  // Try to parse, with fallback for truncated JSON
  let parsed: LLMRefinement;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseError) {
    // Response may be truncated - try to salvage what we can
    console.warn("[edgy] JSON parse failed, attempting recovery:", parseError);

    // Try to find a valid partial response by truncating at last complete object
    const lastScreensEnd = jsonStr.lastIndexOf('"action"');
    if (lastScreensEnd > 0) {
      // Find the start of screens array
      const screensStart = jsonStr.indexOf('"screens"');
      if (screensStart > 0) {
        // Return minimal valid structure - skip LLM refinements
        console.warn("[edgy] LLM response truncated, skipping refinements");
        return { screens: [], flow_findings: [] };
      }
    }
    throw new Error(`Failed to parse LLM response: ${parseError}`);
  }

  if (!parsed.screens || !Array.isArray(parsed.screens)) {
    throw new Error("Invalid LLM response: missing 'screens' array");
  }
  if (!parsed.flow_findings) {
    parsed.flow_findings = [];
  }

  return parsed as LLMRefinement;
}

// --- Merge Refinements ---

function mergeRefinements(
  original: AnalysisOutput,
  refinements: LLMRefinement
): AnalysisOutput {
  const output = structuredClone(original);

  // Process screen findings
  for (const screenRef of refinements.screens) {
    const screen = output.screens.find(
      (s) => s.screen_id === screenRef.screen_id
    );
    if (!screen) continue;

    const findingActions = new Map(
      screenRef.findings.map((f) => [f.id, f])
    );

    screen.findings = screen.findings
      .filter((finding) => {
        const action = findingActions.get(finding.id);
        return !action || action.action !== "remove";
      })
      .map((finding) => {
        const action = findingActions.get(finding.id);
        if (!action || action.action !== "modify") return finding;

        return {
          ...finding,
          severity: action.severity ?? finding.severity,
          title: action.title ?? finding.title,
          description: action.description ?? finding.description,
          recommendation: {
            ...finding.recommendation,
            message:
              action.recommendation_message ?? finding.recommendation.message,
          },
        };
      });
  }

  // Process flow findings
  const flowActions = new Map(
    refinements.flow_findings.map((f) => [f.id, f])
  );

  output.flow_findings = (output.flow_findings as FlowFinding[])
    .filter((finding) => {
      const action = flowActions.get(finding.id);
      return !action || action.action !== "remove";
    })
    .map((finding) => {
      const action = flowActions.get(finding.id);
      if (!action || action.action !== "modify") return finding;

      return {
        ...finding,
        severity: action.severity ?? finding.severity,
        title: action.title ?? finding.title,
        description: action.description ?? finding.description,
        recommendation: {
          ...finding.recommendation,
          message:
            action.recommendation_message ?? finding.recommendation.message,
        },
      };
    });

  // Recalculate summary
  const allFindings = [
    ...output.screens.flatMap((s) => s.findings),
    ...output.flow_findings,
  ];

  output.summary = {
    screens_analyzed: output.summary.screens_analyzed,
    total_findings: allFindings.length,
    critical: allFindings.filter((f) => f.severity === "critical").length,
    warning: allFindings.filter((f) => f.severity === "warning").length,
    info: allFindings.filter((f) => f.severity === "info").length,
  };

  return output;
}
