/**
 * LLM Reviewer Service
 *
 * Reviews heuristic analysis findings using Claude or Gemini to remove
 * false positives, improve descriptions, and adjust severity.
 */

import type {
  AnalysisInput,
  AnalysisOutput,
  ExtractedNode,
  AIProvider,
} from "../lib/types";
import { callLLMForReview, type ContentPart } from "../lib/llm";
import type { SSEStream } from "../lib/sse";
import { getGuidelinesForCategory } from "../lib/enriched-knowledge";
import { getEnrichedFindings } from "../lib/knowledge";

// --- Types ---

export interface LLMReviewResult {
  output: AnalysisOutput;
  wasEnhanced: boolean;
  error?: string;
}

interface CondensedNode {
  id: string;
  name: string;
  type: string;
  componentName?: string;
  textContent?: string;
  children: CondensedNode[];
}

interface FindingRefinement {
  id: string;
  action: "keep"; // Additive-only: heuristic findings are locked
}

interface AdditionalFinding {
  category: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  recommendation: string;
  ai_generated: true;
}

interface LLMRefinement {
  screens: Array<{
    screen_id: string;
    findings: FindingRefinement[];
    additional_findings?: AdditionalFinding[];
  }>;
  flow_findings: FindingRefinement[];
  missing_screen_findings?: FindingRefinement[];
  flow_insights?: string[];
  suggested_flows?: Array<{
    flow_type: string;
    reason: string;
    missing_screens: string[];
  }>;
}

// --- Constants ---

const SCREENS_PER_BATCH = 4;
const MAX_CONCURRENT_BATCHES = 3;

/**
 * Build enhanced system prompt with research-backed guidelines
 */
function buildEnhancedSystemPrompt(categories: Set<string>): string {
  const basePrompt = `You are Edgy's AI review layer — a UX edge case analysis assistant integrated into a Figma plugin.

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

## Research-Backed Guidelines

Your recommendations should be grounded in established UX research from Nielsen Norman Group, Baymard Institute, W3C/WCAG, and other trusted sources. Below are key guidelines relevant to the findings you'll be reviewing:`;

  // Add research-backed guidelines for each category found
  const guidelines: string[] = [];

  for (const category of categories) {
    const categoryGuidelines = getGuidelinesForCategory(category, 1500);
    if (categoryGuidelines) {
      guidelines.push(`\n### ${category}\n${categoryGuidelines}`);
    }
  }

  // Add structured research findings from enriched-rules
  const patternTypes = [...categories].map((c) => c.replace("-", " "));
  const enrichedFindings = getEnrichedFindings(undefined, patternTypes);
  if (enrichedFindings.length > 0) {
    guidelines.push("\n### Structured Research Findings");
    for (const f of enrichedFindings.slice(0, 10)) {
      guidelines.push(`- **${f.title}** (${f.source}): ${f.evidence}`);
    }
  }

  const guidelinesSection = guidelines.length > 0
    ? guidelines.join("\n\n")
    : "\n*No specific guidelines loaded for these categories.*";

  return `${basePrompt}${guidelinesSection}

## Your Role — ADDITIVE ONLY
You receive heuristic analysis findings along with screen thumbnails and node trees.
**Heuristic findings are STABLE and LOCKED.** You CANNOT remove or modify them.

Your job is ADDITIVE — you can only:
1. **Add new findings** the heuristics missed that are visually evident in the screenshots
2. **Add flow-level insights** connecting findings across screens
3. **Suggest additional missing flows** the heuristics didn't detect

## Flow Completeness Analysis
1. **Review missing screen findings**: Assess if screens are truly missing.
2. **Suggest additional flows**: If you see patterns suggesting a flow type the heuristics missed, add to suggested_flows.

## Response Format
Respond with a JSON object (no markdown code fences, just raw JSON):

{
  "screens": [
    {
      "screen_id": "the screen ID",
      "findings": [
        {
          "id": "original finding ID",
          "action": "keep"
        }
      ],
      "additional_findings": [
        {
          "category": "error-states",
          "severity": "warning",
          "title": "concise finding title",
          "description": "what is missing and user impact",
          "recommendation": "concrete action to fix it",
          "ai_generated": true
        }
      ]
    }
  ],
  "flow_findings": [],
  "missing_screen_findings": [
    {
      "id": "mf-001",
      "action": "keep"
    }
  ],
  "flow_insights": ["Cross-screen observations"],
  "suggested_flows": [
    {
      "flow_type": "subscription",
      "reason": "Detected pricing table but no subscription management screens",
      "missing_screens": ["Cancel Subscription", "Billing History"]
    }
  ]
}

## Important Rules
- **NEVER use action "remove" or "modify" — only "keep"**
- Heuristic findings are deterministic and locked. Do not second-guess them.
- You MAY add new findings via additional_findings — these are clearly labeled as AI suggestions
- Only add findings about things **visually evident or missing** from the design
- Be VERY concise — keep descriptions under 100 characters
- Skip flow_insights and suggested_flows unless truly valuable
- Ground your recommendations in the research-backed guidelines provided above

## What to ADD (via additional_findings)
Only add findings about things visually evident in the screenshots:
- Missing UI states (empty, error, loading) that heuristics missed
- Missing confirmation dialogs for destructive actions
- Missing visual feedback elements (spinners, progress bars, success states)
- Missing navigation paths (no "back" button, no way to cancel)
- Truncation/overflow issues visible in the layout

## What NOT to add
- Runtime/code behavior: i18n, input sanitization, XSS
- Data validation logic not visible in design
- API/backend concerns: rate limiting, timeouts
- Accessibility code: screen reader behavior (unless visually evident)
- Performance: loading time, caching`;
}

// Legacy SYSTEM_PROMPT kept for reference — the enhanced prompt builder above is used instead
const SYSTEM_PROMPT = "";

// --- Public API ---

export async function reviewWithLLM(
  heuristicOutput: AnalysisOutput,
  input: AnalysisInput,
  apiKey: string,
  provider: AIProvider = "claude",
  stream?: SSEStream
): Promise<LLMReviewResult> {
  if (heuristicOutput.summary.total_findings === 0) {
    return { output: heuristicOutput, wasEnhanced: false };
  }

  try {
    await stream?.sendProgress({
      stage: "llm_review",
      message: "Preparing context for AI review...",
      progress: 0.6,
    });

    // Extract unique categories from findings to load relevant research
    const categories = new Set<string>();
    for (const screen of heuristicOutput.screens) {
      for (const finding of screen.findings) {
        if (finding.category) {
          categories.add(finding.category);
        }
      }
    }
    for (const finding of heuristicOutput.flow_findings || []) {
      if (finding.category) {
        categories.add(finding.category);
      }
    }

    const enhancedPrompt = buildEnhancedSystemPrompt(categories);

    // Batch ALL screens (not just those with findings) so the LLM sees the full flow
    const allScreens = input.screens;
    const batches: (typeof allScreens)[] = [];
    for (let i = 0; i < allScreens.length; i += SCREENS_PER_BATCH) {
      batches.push(allScreens.slice(i, i + SCREENS_PER_BATCH));
    }

    const providerName = provider === "claude" ? "Claude" : "Gemini";
    await stream?.sendProgress({
      stage: "llm_review",
      message: `Reviewing ${allScreens.length} screens with ${providerName} (${batches.length} batch${batches.length > 1 ? "es" : ""})...`,
      progress: 0.65,
    });

    console.log(
      `[llm-reviewer] Sending ${batches.length} batch(es): ${batches.map((b) => b.length).join(", ")} screens each`
    );

    // Run batches with concurrency limit
    const responses = await runWithConcurrency(
      batches.map((batchScreens, idx) => async () => {
        const userContent = buildBatchUserMessage(
          heuristicOutput,
          input,
          batchScreens,
          idx === 0 // Include flow/missing findings only in first batch
        );
        const start = Date.now();
        const result = await callLLMForReview(apiKey, provider, enhancedPrompt, userContent);
        console.log(
          `[llm-reviewer] Batch ${idx + 1}/${batches.length} done in ${Date.now() - start}ms`
        );

        // Update progress as batches complete
        const completedFraction = (idx + 1) / batches.length;
        await stream?.sendProgress({
          stage: "llm_review",
          message: `Reviewed batch ${idx + 1}/${batches.length}...`,
          progress: 0.65 + completedFraction * 0.05,
        });

        return result;
      }),
      MAX_CONCURRENT_BATCHES
    );

    await stream?.sendProgress({
      stage: "llm_review",
      message: "Applying AI refinements...",
      progress: 0.7,
    });

    // Parse and merge all batch refinements
    const mergedRefinement: LLMRefinement = {
      screens: [],
      flow_findings: [],
      missing_screen_findings: [],
    };

    for (let i = 0; i < responses.length; i++) {
      try {
        const refinement = parseAndValidateResponse(responses[i].text);
        mergedRefinement.screens.push(...refinement.screens);
        mergedRefinement.flow_findings.push(...refinement.flow_findings);
        if (refinement.missing_screen_findings) {
          mergedRefinement.missing_screen_findings!.push(
            ...refinement.missing_screen_findings
          );
        }
      } catch (e) {
        console.warn(`[llm-reviewer] Batch ${i + 1} parse failed, skipping:`, e);
      }
    }

    console.log(
      `[llm-reviewer] All batches merged: ${mergedRefinement.screens.length} screens refined`
    );

    const enhancedOutput = mergeRefinements(heuristicOutput, mergedRefinement);

    return {
      output: enhancedOutput,
      wasEnhanced: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "LLM review failed";
    console.error("[llm-reviewer] LLM review failed:", errorMessage, error);
    return {
      output: heuristicOutput,
      wasEnhanced: false,
      error: errorMessage,
    };
  }
}

// --- Concurrency Helper ---

/**
 * Run async tasks with a concurrency limit.
 * Returns results in the same order as the input tasks.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      results[idx] = await tasks[idx]();
    }
  }

  // Start up to `limit` workers
  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => runNext()
  );
  await Promise.all(workers);

  return results;
}

// --- Node Tree Condensation ---

function condenseNodeTree(
  rootNode: ExtractedNode,
  affectedNodeIds: Set<string>
): CondensedNode {
  const parentMap = new Map<string, string>();
  const nodeMap = new Map<string, ExtractedNode>();

  function buildMaps(node: ExtractedNode, parentId?: string) {
    if (!node) return;
    nodeMap.set(node.id, node);
    if (parentId) parentMap.set(node.id, parentId);
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        buildMaps(child, node.id);
      }
    }
  }
  buildMaps(rootNode);

  const keepIds = new Set<string>();

  for (const nodeId of affectedNodeIds) {
    if (!nodeMap.has(nodeId)) continue;
    keepIds.add(nodeId);

    let current = nodeId;
    while (parentMap.has(current)) {
      current = parentMap.get(current)!;
      keepIds.add(current);
    }

    const pid = parentMap.get(nodeId);
    if (pid) {
      const p = nodeMap.get(pid);
      if (p && p.children && Array.isArray(p.children)) {
        for (const sibling of p.children) {
          keepIds.add(sibling.id);
        }
      }
    }
  }

  function condense(node: ExtractedNode): CondensedNode | null {
    if (!node || !keepIds.has(node.id)) return null;

    const condensedChildren: CondensedNode[] = [];
    let skippedCount = 0;
    const children = node.children || [];
    for (const child of children) {
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

/**
 * Build the LLM user message for a batch of screens.
 *
 * ALL screens in the batch get their screenshot sent — no cap.
 * Screens with findings get full detail (findings JSON + condensed node tree).
 * Screens without findings get screenshot + a "(no findings)" note so the LLM
 * has visual context for cross-screen reasoning.
 *
 * Flow-level and missing-screen findings are only included in the first batch.
 */
function buildBatchUserMessage(
  heuristicOutput: AnalysisOutput,
  input: AnalysisInput,
  batchScreens: AnalysisInput["screens"],
  includeFlowFindings: boolean
): ContentPart[] {
  const content: ContentPart[] = [];

  const screensWithFindings = batchScreens.filter((s) => {
    const r = heuristicOutput.screens.find((sr) => sr.screen_id === s.screen_id);
    return r && r.findings.length > 0;
  });

  content.push({
    type: "text",
    text: `I've run Edgy's heuristic analysis on screens from "${input.file_name}". This batch contains ${batchScreens.length} screen(s) (${screensWithFindings.length} with findings). Review all findings and use the other screenshots for visual context.\n`,
  });

  for (const screen of batchScreens) {
    const screenResult = heuristicOutput.screens.find(
      (s) => s.screen_id === screen.screen_id
    );
    const hasFindings = screenResult && screenResult.findings.length > 0;

    content.push({
      type: "text",
      text: `\n--- Screen: "${screen.name}" (ID: ${screen.screen_id})${hasFindings ? "" : " [no findings — context only]"} ---\n`,
    });

    // Every screen gets its screenshot
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

    // Only include findings + node tree for screens that have findings
    if (hasFindings && screenResult) {
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

      const affectedIds = new Set(
        screenResult.findings.flatMap((f) => f.affected_nodes)
      );
      const condensed = condenseNodeTree(screen.node_tree, affectedIds);
      content.push({
        type: "text",
        text: `\nNode tree (condensed):\n${JSON.stringify(condensed, null, 2)}\n`,
      });
    }
  }

  // Flow-level findings (first batch only)
  if (includeFlowFindings && heuristicOutput.flow_findings.length > 0) {
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

  // Missing screen findings (first batch only)
  if (includeFlowFindings && heuristicOutput.missing_screen_findings?.length > 0) {
    content.push({
      type: "text",
      text: `\n--- Missing Screen Findings ---\n${JSON.stringify(
        heuristicOutput.missing_screen_findings.map((f) => ({
          id: f.id,
          flow_type: f.flow_type,
          flow_name: f.flow_name,
          severity: f.severity,
          missing_screen: f.missing_screen,
          recommendation: f.recommendation.message,
        })),
        null,
        2
      )}\n`,
    });
  }

  content.push({
    type: "text",
    text: "\nPlease review all findings and respond with your refinements in the specified JSON format. For screens marked [context only], do not generate findings — they are included for visual reference.",
  });

  return content;
}

// --- Response Parsing ---

function parseAndValidateResponse(responseText: string): LLMRefinement {
  let jsonStr = responseText.trim();

  // Handle potential markdown fences
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: LLMRefinement;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseError) {
    console.warn("[llm-reviewer] JSON parse failed, attempting recovery:", parseError);

    const lastScreensEnd = jsonStr.lastIndexOf('"action"');
    if (lastScreensEnd > 0) {
      const screensStart = jsonStr.indexOf('"screens"');
      if (screensStart > 0) {
        console.warn("[llm-reviewer] LLM response truncated, skipping refinements");
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
  if (!parsed.missing_screen_findings) {
    parsed.missing_screen_findings = [];
  }

  return parsed as LLMRefinement;
}

// --- Merge Refinements (Additive Only) ---

/** Counter for AI-generated finding IDs */
let aiCounter = 0;

function mergeRefinements(
  original: AnalysisOutput,
  refinements: LLMRefinement
): AnalysisOutput {
  const output = structuredClone(original);
  aiCounter = 0;

  // Heuristic findings are LOCKED — never removed or modified.
  // Only ADD new AI-generated findings from the LLM.
  for (const screenRef of refinements.screens) {
    const screen = output.screens.find(
      (s) => s.screen_id === screenRef.screen_id
    );
    if (!screen) continue;

    // Add AI-generated findings (clearly tagged)
    if (screenRef.additional_findings && screenRef.additional_findings.length > 0) {
      for (const af of screenRef.additional_findings) {
        screen.findings.push({
          id: `ai-finding-${++aiCounter}`,
          rule_id: `ai-${af.category}`,
          category: af.category as any,
          severity: af.severity,
          title: af.title,
          description: af.description,
          affected_nodes: [],
          recommendation: {
            message: af.recommendation,
            components: [],
          },
        });
      }
    }
  }

  // Flow findings are also locked — no removal, no modification.
  // Missing screen findings are locked too.

  // Recalculate summary
  const allFindings = [
    ...output.screens.flatMap((s) => s.findings),
    ...output.flow_findings,
    ...(output.missing_screen_findings || []),
  ];

  output.summary = {
    screens_analyzed: output.summary.screens_analyzed,
    total_findings: allFindings.length,
    critical: allFindings.filter((f) => f.severity === "critical").length,
    warning: allFindings.filter((f) => f.severity === "warning").length,
    info: allFindings.filter((f) => f.severity === "info").length,
  };

  output.llm_enhanced = true;

  return output;
}
