/**
 * Analyzer Service
 *
 * Runs the Edgy analysis pipeline on extracted screens.
 * Ported from plugin's analyze.ts to run server-side.
 */

import type {
  AnalysisInput,
  AnalysisOutput,
  ScreenResult,
  AnalysisFinding,
  ComponentSuggestion,
  DetectedPattern,
  MissingScreenFinding,
  FlowFinding,
  ExtractedNode,
  ExtractedScreen,
} from "../lib/types";
import { loadRules, loadMappings, loadFlowRules, type Rule, type MappingEntry, type FlowRule } from "../lib/knowledge";
import type { SSEStream } from "../lib/sse";

// Pattern detection and rule matching functions
// These are simplified versions - in production, you'd import from the analysis package

/**
 * Normalize Python-style regex patterns to JavaScript-compatible ones.
 * Removes (?i) inline flags since we pass 'i' to RegExp constructor.
 */
function normalizePattern(pattern: string): string {
  // Remove Python-style inline flags like (?i)
  return pattern.replace(/\(\?[imsx]+\)/g, "");
}

/**
 * Safely create a RegExp from a pattern that may contain Python-style flags.
 */
function safeRegExp(pattern: string, flags = "i"): RegExp {
  return new RegExp(normalizePattern(pattern), flags);
}

type PatternType =
  | "form"
  | "form-field"
  | "list"
  | "data-display"
  | "button"
  | "destructive-action"
  | "navigation"
  | "search"
  | "media"
  | "modal";

interface TriggeredRule {
  rule: Rule;
  matchedNodes: ExtractedNode[];
  pattern?: DetectedPattern;
  confidence: number;
}

interface UnmetExpectation {
  rule: Rule;
  matchedNodes: ExtractedNode[];
  reason: string;
}

// Finding counter for unique IDs
let findingCounter = 0;
let missingScreenCounter = 0;

function resetCounters() {
  findingCounter = 0;
  missingScreenCounter = 0;
}

/**
 * Run the full analysis pipeline
 */
export async function runAnalysis(
  input: AnalysisInput,
  stream?: SSEStream
): Promise<AnalysisOutput> {
  resetCounters();

  // Load knowledge base
  const rules = loadRules();
  const mappings = loadMappings();
  const flowRules = loadFlowRules();

  await stream?.sendProgress({
    stage: "patterns",
    message: "Detecting UI patterns...",
    progress: 0.15,
  });

  // Group screens by flow (shared name prefix)
  const flowGroups = groupScreensByFlow(input.screens);

  const screenResults: ScreenResult[] = [];
  const allPatterns = new Map<string, DetectedPattern[]>();

  for (const screen of input.screens) {
    // Step 1: Detect UI patterns in the node tree
    const patterns = detectPatterns(screen.node_tree);
    allPatterns.set(screen.screen_id, patterns);

    // Step 2: Match rules against detected patterns (with exclude + confidence)
    const triggeredRules = matchRules(patterns, rules, screen.node_tree, screen.name);

    // Step 3: Check expectations (with flow-aware checking)
    const flowSiblings = getFlowSiblings(screen, flowGroups);
    const flowGroupTrees = flowSiblings.map((s) => s.node_tree);
    const unmetExpectations = checkExpectations(
      triggeredRules,
      screen.node_tree,
      input.screens.map((s) => s.node_tree),
      flowGroupTrees
    );

    // Step 4: Generate findings
    const findings = generateFindings(unmetExpectations, screen);

    // Step 5: Enrich with component recommendations
    const findingsWithComponents = mapComponentsInline(findings, mappings);

    screenResults.push({
      screen_id: screen.screen_id,
      name: screen.name,
      findings: findingsWithComponents,
    });
  }

  await stream?.sendProgress({
    stage: "rules",
    message: "Matching rules against patterns...",
    progress: 0.25,
  });

  // Deduplicate findings within flow groups
  deduplicateFindings(screenResults, flowGroups);

  await stream?.sendProgress({
    stage: "expectations",
    message: "Checking expectations...",
    progress: 0.35,
  });

  // Flow-level findings
  const flowFindings = generateFlowFindings(input.screens, rules);

  await stream?.sendProgress({
    stage: "flows",
    message: "Detecting flow types and missing screens...",
    progress: 0.45,
  });

  // Flow type detection and missing screen findings
  const detectedFlowTypes = detectFlowTypes(input.screens, allPatterns);
  const missingScreenFindings = generateMissingScreenFindings(
    input.screens,
    detectedFlowTypes,
    flowRules
  );

  await stream?.sendProgress({
    stage: "findings",
    message: "Generating findings...",
    progress: 0.55,
  });

  const totalFindings =
    screenResults.reduce((sum, s) => sum + s.findings.length, 0) +
    flowFindings.length +
    missingScreenFindings.length;

  return {
    analysis_id: input.analysis_id,
    completed_at: new Date().toISOString(),
    summary: {
      screens_analyzed: input.screens.length,
      total_findings: totalFindings,
      critical: countBySeverityAll(screenResults, flowFindings, missingScreenFindings, "critical"),
      warning: countBySeverityAll(screenResults, flowFindings, missingScreenFindings, "warning"),
      info: countBySeverityAll(screenResults, flowFindings, missingScreenFindings, "info"),
    },
    screens: screenResults,
    flow_findings: flowFindings,
    missing_screen_findings: missingScreenFindings,
  };
}

// --- Pattern Detection ---

/**
 * Map client-side element classifications to server-side pattern types.
 * This bridges the 43-type classifier to the 10-type pattern system.
 */
const CLASSIFICATION_TO_PATTERN: Record<string, PatternType> = {
  button: "button",
  input: "form-field",
  textarea: "form-field",
  select: "form-field",
  checkbox: "form-field",
  radio: "form-field",
  list: "list",
  "list-item": "list",
  table: "list",
  dialog: "modal",
  nav: "navigation",
  image: "media",
};

function detectPatterns(node: ExtractedNode): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  function walk(n: ExtractedNode, depth: number = 0) {
    if (!n.visible) return;

    // PRIORITY: Use client-side classification if available (more accurate)
    if (n.classification && n.classification.confidence >= 0.7) {
      const mappedType = CLASSIFICATION_TO_PATTERN[n.classification.elementType];
      if (mappedType) {
        // Check for destructive variant on buttons
        if (mappedType === "button" && n.classification.variant === "destructive") {
          patterns.push({
            type: "destructive-action",
            nodes: [n],
            confidence: "high",
            context: `Classified destructive button: ${n.name}`,
          });
        } else {
          patterns.push({
            type: mappedType,
            nodes: [n],
            confidence: n.classification.confidence >= 0.9 ? "high" : "medium",
            context: `Classified ${n.classification.elementType}: ${n.name}`,
          });
        }

        // Also detect form containers from classified form fields
        if (mappedType === "form-field") {
          const parent = n; // Check if parent is a form container
          // (handled by form container detection below)
        }
      }
    } else {
      // FALLBACK: Use heuristic detection when no classification
      if (isFormField(n)) {
        patterns.push({
          type: "form-field",
          nodes: [n],
          confidence: "high",
          context: `Form field: ${n.name}`,
        });
      }

      if (isButton(n)) {
        const isDestructive = isDestructiveAction(n);
        patterns.push({
          type: isDestructive ? "destructive-action" : "button",
          nodes: [n],
          confidence: "high",
          context: `Button: ${n.name}`,
        });
      }

      if (isList(n)) {
        patterns.push({
          type: "list",
          nodes: [n],
          confidence: "medium",
          context: `List: ${n.name}`,
        });
      }

      if (isModal(n)) {
        patterns.push({
          type: "modal",
          nodes: [n],
          confidence: "high",
          context: `Modal: ${n.name}`,
        });
      }
    }

    // Always detect these (classification doesn't cover them well)
    if (isFormContainer(n)) {
      patterns.push({
        type: "form",
        nodes: [n],
        confidence: "high",
        context: `Form detected: ${n.name}`,
      });
    }

    if (isSearch(n)) {
      patterns.push({
        type: "search",
        nodes: [n],
        confidence: "high",
        context: `Search: ${n.name}`,
      });
    }

    // Recurse into children
    for (const child of n.children || []) {
      walk(child, depth + 1);
    }
  }

  walk(node);
  return patterns;
}

function isFormContainer(node: ExtractedNode): boolean {
  const name = node.name.toLowerCase();
  return (
    name.includes("form") ||
    name.includes("login") ||
    name.includes("signup") ||
    name.includes("register") ||
    (node.children?.some(isFormField) ?? false)
  );
}

function isFormField(node: ExtractedNode): boolean {
  const name = node.name.toLowerCase();
  const compName = node.componentName?.toLowerCase() || "";
  return (
    name.includes("input") ||
    name.includes("field") ||
    name.includes("textfield") ||
    name.includes("textarea") ||
    compName.includes("input") ||
    compName.includes("textfield")
  );
}

function isButton(node: ExtractedNode): boolean {
  const name = node.name.toLowerCase();
  const compName = node.componentName?.toLowerCase() || "";
  return (
    name.includes("button") ||
    name.includes("btn") ||
    name.includes("cta") ||
    compName.includes("button") ||
    (node.type === "INSTANCE" && compName.includes("button"))
  );
}

function isDestructiveAction(node: ExtractedNode): boolean {
  const name = node.name.toLowerCase();
  const text = node.textContent?.toLowerCase() || "";
  return (
    name.includes("delete") ||
    name.includes("remove") ||
    name.includes("cancel") ||
    name.includes("destructive") ||
    text.includes("delete") ||
    text.includes("remove")
  );
}

function isList(node: ExtractedNode): boolean {
  const name = node.name.toLowerCase();
  return (
    name.includes("list") ||
    name.includes("table") ||
    name.includes("grid") ||
    name.includes("items") ||
    (node.children && node.children.length > 2 && areChildrenSimilar(node.children))
  );
}

function areChildrenSimilar(children: ExtractedNode[]): boolean {
  if (children.length < 3) return false;
  const firstType = children[0].type;
  const firstCompName = children[0].componentName;
  return children.every(
    (c) => c.type === firstType && c.componentName === firstCompName
  );
}

function isSearch(node: ExtractedNode): boolean {
  const name = node.name.toLowerCase();
  return name.includes("search") || name.includes("filter");
}

function isModal(node: ExtractedNode): boolean {
  const name = node.name.toLowerCase();
  return (
    name.includes("modal") ||
    name.includes("dialog") ||
    name.includes("popup") ||
    name.includes("overlay")
  );
}

// --- Rule Matching ---

/**
 * Build a map of node ID → parent node for exclude condition checking
 */
function buildParentMap(root: ExtractedNode): Map<string, ExtractedNode> {
  const parentMap = new Map<string, ExtractedNode>();
  function walk(node: ExtractedNode) {
    for (const child of node.children || []) {
      parentMap.set(child.id, node);
      walk(child);
    }
  }
  walk(root);
  return parentMap;
}

/**
 * Check if a node should be excluded from a rule match based on exclude conditions
 */
function shouldExclude(
  rule: Rule,
  node: ExtractedNode,
  parentMap: Map<string, ExtractedNode>,
  screenName: string
): boolean {
  if (!rule.exclude) return false;

  // Check screen name exclusion
  if (rule.exclude.screen_name_patterns?.some((p) => safeRegExp(p).test(screenName))) {
    return true;
  }

  // Check parent name exclusion
  const parent = parentMap.get(node.id);
  if (parent && rule.exclude.parent_name_patterns?.some((p) => safeRegExp(p).test(parent.name))) {
    return true;
  }

  // Check parent component name exclusion
  if (
    parent?.componentName &&
    rule.exclude.parent_component_names?.some(
      (c) => parent.componentName!.toLowerCase().includes(c.toLowerCase())
    )
  ) {
    return true;
  }

  // Check ancestor element types
  if (rule.exclude.ancestor_element_types) {
    let current = parentMap.get(node.id);
    while (current) {
      const currentName = current.name.toLowerCase();
      if (rule.exclude.ancestor_element_types.some((t) => currentName.includes(t))) {
        return true;
      }
      current = parentMap.get(current.id);
    }
  }

  return false;
}

/**
 * Calculate confidence score for a rule match using multi-signal scoring
 */
function calculateConfidence(
  rule: Rule,
  node: ExtractedNode,
  matchType: "pattern_type" | "component_name" | "layer_name"
): number {
  const signals = rule.confidence_signals || {
    name_match: 0.5,
    component_match: 0.3,
    visual_match: 0.2,
    threshold: 0.4,
  };

  let score = 0;

  // Name-based match (always present for a triggered rule)
  if (matchType === "layer_name") {
    score += signals.name_match ?? 0.5;
  }

  // Component type match
  if (matchType === "component_name" || node.componentName) {
    score += signals.component_match ?? 0.3;
  }

  // Pattern type match (strongest signal — component composition analysis)
  if (matchType === "pattern_type") {
    score += (signals.name_match ?? 0.5) + (signals.component_match ?? 0.3);
  }

  // Visual characteristics boost
  const hasStroke = node.strokes && node.strokes.length > 0;
  const hasFill = node.fills && node.fills.length > 0;
  const hasChildren = node.children && node.children.length > 0;
  if (hasStroke || hasFill || hasChildren) {
    score += (signals.visual_match ?? 0.2) * 0.5;
  }

  return Math.min(score, 1.0);
}

function matchRules(
  patterns: DetectedPattern[],
  rules: Rule[],
  screenTree: ExtractedNode,
  screenName: string
): TriggeredRule[] {
  const triggered: TriggeredRule[] = [];
  const parentMap = buildParentMap(screenTree);

  for (const rule of rules) {
    for (const pattern of patterns) {
      // Check pattern type match
      if (rule.triggers.pattern_types?.includes(pattern.type)) {
        const node = pattern.nodes[0];
        if (!shouldExclude(rule, node, parentMap, screenName)) {
          const confidence = calculateConfidence(rule, node, "pattern_type");
          const threshold = rule.confidence_signals?.threshold ?? 0.4;
          if (confidence >= threshold) {
            triggered.push({ rule, matchedNodes: pattern.nodes, pattern, confidence });
          }
        }
        continue;
      }

      // Check component name match & layer name patterns
      for (const node of pattern.nodes) {
        if (shouldExclude(rule, node, parentMap, screenName)) continue;

        const compMatch = rule.triggers.component_names?.some(
          (c) =>
            node.componentName?.toLowerCase().includes(c.toLowerCase()) ||
            node.name.toLowerCase().includes(c.toLowerCase())
        );

        if (compMatch) {
          const confidence = calculateConfidence(rule, node, "component_name");
          const threshold = rule.confidence_signals?.threshold ?? 0.4;
          if (confidence >= threshold) {
            triggered.push({ rule, matchedNodes: [node], pattern, confidence });
          }
        }

        const nameMatch = rule.triggers.layer_name_patterns?.some((p) =>
          safeRegExp(p).test(node.name)
        );

        if (nameMatch && !compMatch) {
          const confidence = calculateConfidence(rule, node, "layer_name");
          const threshold = rule.confidence_signals?.threshold ?? 0.4;
          if (confidence >= threshold) {
            triggered.push({ rule, matchedNodes: [node], pattern, confidence });
          }
        }
      }
    }
  }

  return triggered;
}

// --- Expectation Checking ---

function checkExpectations(
  triggeredRules: TriggeredRule[],
  screenTree: ExtractedNode,
  allScreenTrees: ExtractedNode[],
  flowGroupTrees: ExtractedNode[]
): UnmetExpectation[] {
  const unmet: UnmetExpectation[] = [];

  for (const triggered of triggeredRules) {
    const { rule, matchedNodes } = triggered;

    // Check in_screen expectations
    if (rule.expects.in_screen) {
      const foundInScreen = rule.expects.in_screen.some((expect) =>
        checkExpectCondition(expect, screenTree)
      );
      if (!foundInScreen) {
        // Check in flow group
        const foundInFlow =
          rule.expects.in_flow?.some((expect) =>
            flowGroupTrees.some((tree) => checkExpectCondition(expect, tree))
          ) ?? false;

        if (!foundInFlow) {
          unmet.push({
            rule,
            matchedNodes,
            reason: "Missing expected state in screen or flow",
          });
        }
      }
    }
  }

  return unmet;
}

function checkExpectCondition(
  condition: { component_names?: string[]; layer_name_patterns?: string[] },
  tree: ExtractedNode
): boolean {
  const allNodes = flattenNodes(tree);

  // Check component names
  if (condition.component_names) {
    const found = condition.component_names.some((name) =>
      allNodes.some(
        (n) =>
          n.componentName?.toLowerCase().includes(name.toLowerCase()) ||
          n.name.toLowerCase().includes(name.toLowerCase())
      )
    );
    if (found) return true;
  }

  // Check layer name patterns
  if (condition.layer_name_patterns) {
    const found = condition.layer_name_patterns.some((pattern) =>
      allNodes.some((n) => safeRegExp(pattern).test(n.name))
    );
    if (found) return true;
  }

  return false;
}

function flattenNodes(node: ExtractedNode): ExtractedNode[] {
  const result: ExtractedNode[] = [node];
  for (const child of node.children || []) {
    result.push(...flattenNodes(child));
  }
  return result;
}

// --- Finding Generation ---

/**
 * Interpolate template variables like {{element_name}}, {{element_text}}, {{flow_context}}
 */
function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || key);
}

function generateFindings(
  unmetExpectations: UnmetExpectation[],
  screen: ExtractedScreen
): AnalysisFinding[] {
  return unmetExpectations.map((unmet) => {
    const { rule, matchedNodes } = unmet;
    const affectedArea = computeAffectedArea(matchedNodes, screen);

    // Build template variables from the matched context
    const primaryNode = matchedNodes[0];
    const templateVars: Record<string, string> = {
      element_name: primaryNode?.componentName || primaryNode?.name || "element",
      element_text: primaryNode?.textContent || primaryNode?.name || "action",
      screen_name: screen.name,
      flow_context: screen.name.split(/[-–—]/)[0]?.trim() || "this",
    };

    // Use finding_template if available, otherwise fall back to rule fields
    const template = rule.finding_template;
    const title = template
      ? interpolateTemplate(template.title, templateVars)
      : rule.name;
    const description = template
      ? interpolateTemplate(template.description, templateVars)
      : rule.description;
    const recMessage = template
      ? interpolateTemplate(template.recommendation, templateVars)
      : rule.recommendation.message;

    return {
      id: `finding-${++findingCounter}`,
      rule_id: rule.id,
      category: rule.category as any,
      severity: rule.severity,
      annotation_target: rule.annotation_target,
      title,
      description,
      affected_nodes: matchedNodes.map((n) => n.id),
      affected_area: affectedArea,
      recommendation: {
        message: recMessage,
        components: rule.recommendation.components.map((c) => ({
          name: c.label,
          shadcn_id: c.shadcn_id,
          variant: c.variant,
          description: c.label,
        })),
      },
    };
  });
}

function computeAffectedArea(
  nodes: ExtractedNode[],
  screen: ExtractedScreen
): { x: number; y: number; width: number; height: number } | undefined {
  if (nodes.length === 0) return undefined;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  return {
    x: minX - screen.x,
    y: minY - screen.y,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// --- Component Mapping ---

function mapComponentsInline(
  findings: AnalysisFinding[],
  mappings: Map<string, MappingEntry>
): AnalysisFinding[] {
  return findings.map((finding) => {
    const mapping = mappings.get(finding.category);
    if (!mapping) return finding;

    const enrichedComponents: ComponentSuggestion[] = [
      ...mapping.primary.map((m) => ({
        name: `${m.shadcn_id}${m.variant ? ` (${m.variant})` : ""}`,
        shadcn_id: m.shadcn_id,
        variant: m.variant,
        description: m.usage,
      })),
      ...(mapping.supporting || []).map((m) => ({
        name: `${m.shadcn_id}${m.variant ? ` (${m.variant})` : ""}`,
        shadcn_id: m.shadcn_id,
        variant: m.variant,
        description: m.usage,
      })),
    ];

    const existingIds = new Set(
      finding.recommendation.components.map(
        (c) => `${c.shadcn_id}-${c.variant || ""}`
      )
    );

    return {
      ...finding,
      recommendation: {
        ...finding.recommendation,
        components: [
          ...finding.recommendation.components,
          ...enrichedComponents.filter(
            (c) => !existingIds.has(`${c.shadcn_id}-${c.variant || ""}`)
          ),
        ],
      },
    };
  });
}

// --- Flow Grouping ---

function groupScreensByFlow(
  screens: ExtractedScreen[]
): Map<string, ExtractedScreen[]> {
  const groups = new Map<string, ExtractedScreen[]>();

  for (const screen of screens) {
    // Extract flow prefix (e.g., "Login - Step 1" -> "Login")
    const match = screen.name.match(/^([^-–—]+)/);
    const prefix = match ? match[1].trim() : screen.name;

    const existing = groups.get(prefix) || [];
    existing.push(screen);
    groups.set(prefix, existing);
  }

  return groups;
}

function getFlowSiblings(
  screen: ExtractedScreen,
  flowGroups: Map<string, ExtractedScreen[]>
): ExtractedScreen[] {
  for (const [, screens] of flowGroups) {
    if (screens.some((s) => s.screen_id === screen.screen_id)) {
      return screens;
    }
  }
  return [screen];
}

// --- Deduplication (Deterministic Fingerprinting) ---

/**
 * Generate a deterministic fingerprint for a finding.
 * Same design → same fingerprints → same dedup results, regardless of processing order.
 */
function findingFingerprint(finding: AnalysisFinding): string {
  const parts = [
    finding.rule_id,
    finding.category,
    finding.severity,
    // Sort affected nodes for order independence
    [...finding.affected_nodes].sort().join(","),
  ];
  return parts.join("|");
}

function deduplicateFindings(
  screenResults: ScreenResult[],
  flowGroups: Map<string, ExtractedScreen[]>
): void {
  for (const [, screens] of flowGroups) {
    if (screens.length <= 1) continue;

    const screenIds = new Set(screens.map((s) => s.screen_id));

    // Sort screens by name for deterministic order
    const sortedScreenIds = [...screenIds].sort();

    const seenFingerprints = new Set<string>();

    // Process screens in deterministic sorted order
    for (const screenId of sortedScreenIds) {
      const result = screenResults.find((r) => r.screen_id === screenId);
      if (!result) continue;

      result.findings = result.findings.filter((f) => {
        // Use rule_id as the dedup key within flow groups (simpler, deterministic)
        const key = `${f.rule_id}`;
        if (seenFingerprints.has(key)) return false;
        seenFingerprints.add(key);
        return true;
      });
    }
  }
}

// --- Flow Findings ---

function generateFlowFindings(
  screens: ExtractedScreen[],
  rules: Rule[]
): FlowFinding[] {
  // Simple implementation - could be extended
  return [];
}

// --- Flow Type Detection (Multi-Signal) ---

/**
 * Flow signatures: each flow type has name patterns, component compositions,
 * and inter-screen link text that can identify it.
 */
interface FlowSignature {
  type: string;
  namePatterns: RegExp[];
  /** Component compositions that suggest this flow (from element classifier) */
  componentSignatures: string[][];
  /** Button/link text that connects screens within this flow */
  interScreenLinkText: RegExp[];
}

const FLOW_SIGNATURES: FlowSignature[] = [
  {
    type: "authentication",
    namePatterns: [/login/i, /sign.?in/i, /sign.?up/i, /register/i, /auth/i],
    componentSignatures: [
      ["input", "input", "button"], // email + password + submit
      ["input", "checkbox", "button"], // remember me pattern
    ],
    interScreenLinkText: [
      /forgot.?password/i, /sign.?up/i, /create.?account/i, /log.?in/i,
      /register/i, /reset.?password/i,
    ],
  },
  {
    type: "onboarding",
    namePatterns: [/onboard/i, /welcome/i, /getting.?started/i, /setup/i, /intro/i, /tour/i],
    componentSignatures: [
      ["button", "button"], // back + next
      ["image", "heading", "button"], // illustration + text + CTA
    ],
    interScreenLinkText: [
      /next/i, /skip/i, /get.?started/i, /continue/i, /let.?s.?go/i,
    ],
  },
  {
    type: "checkout",
    namePatterns: [/checkout/i, /payment/i, /cart/i, /order/i, /billing/i, /shipping/i],
    componentSignatures: [
      ["input", "input", "input", "button"], // card number + expiry + cvv + pay
      ["card", "button"], // order summary + place order
    ],
    interScreenLinkText: [
      /place.?order/i, /pay.?now/i, /continue.?to/i, /checkout/i,
      /add.?to.?cart/i, /proceed/i, /complete.?purchase/i,
    ],
  },
  {
    type: "crud",
    namePatterns: [/detail/i, /edit/i, /create/i, /new\b/i, /add\b/i],
    componentSignatures: [
      ["input", "textarea", "button"], // form fields + save
      ["list", "button"], // list + create button
    ],
    interScreenLinkText: [
      /save/i, /create/i, /edit/i, /delete/i, /add.?new/i, /update/i,
    ],
  },
  {
    type: "search",
    namePatterns: [/search/i, /browse/i, /explore/i, /discover/i, /filter/i],
    componentSignatures: [
      ["input", "list"], // search bar + results
    ],
    interScreenLinkText: [
      /search/i, /filter/i, /sort/i, /clear/i,
    ],
  },
  {
    type: "settings",
    namePatterns: [/settings/i, /preferences/i, /account/i, /profile/i, /config/i],
    componentSignatures: [
      ["switch", "switch"], // toggle settings
      ["input", "button"], // edit profile
    ],
    interScreenLinkText: [
      /save.?changes/i, /update/i, /notification/i, /privacy/i, /security/i,
    ],
  },
  {
    type: "upload",
    namePatterns: [/upload/i, /import/i, /attach/i],
    componentSignatures: [
      ["button", "card"], // upload button + preview
    ],
    interScreenLinkText: [
      /upload/i, /select.?file/i, /drag/i, /drop/i, /browse/i,
    ],
  },
  {
    type: "subscription",
    namePatterns: [/pricing/i, /plan/i, /subscribe/i, /billing/i, /upgrade/i, /tier/i],
    componentSignatures: [
      ["card", "card", "card", "button"], // pricing cards + CTA
    ],
    interScreenLinkText: [
      /subscribe/i, /upgrade/i, /downgrade/i, /cancel/i, /start.?trial/i,
    ],
  },
  {
    type: "messaging",
    namePatterns: [/chat/i, /message/i, /inbox/i, /conversation/i, /dm/i],
    componentSignatures: [
      ["list", "input", "button"], // messages list + compose + send
    ],
    interScreenLinkText: [
      /send/i, /reply/i, /new.?message/i, /compose/i,
    ],
  },
  {
    type: "booking",
    namePatterns: [/book/i, /reserv/i, /schedule/i, /appointment/i],
    componentSignatures: [
      ["input", "input", "button"], // date + time + confirm
    ],
    interScreenLinkText: [
      /book.?now/i, /confirm/i, /schedule/i, /select.?date/i, /select.?time/i,
    ],
  },
];

interface DetectedFlowType {
  type: string;
  confidence: "high" | "medium" | "low";
  triggerScreens: string[];
  triggerPatterns: string[];
  /** Multi-signal confidence score (0-1) */
  score: number;
}

/**
 * Extract all text content from a node tree (for inter-screen link detection)
 */
function extractAllText(node: ExtractedNode): string[] {
  const texts: string[] = [];
  function walk(n: ExtractedNode) {
    if (n.textContent) texts.push(n.textContent);
    for (const child of n.children || []) walk(child);
  }
  walk(node);
  return texts;
}

/**
 * Get component types from a screen's patterns
 */
function getComponentTypes(patterns: DetectedPattern[]): string[] {
  return patterns.map((p) => p.type);
}

/**
 * Check if a component signature matches the screen's patterns
 */
function matchesComponentSignature(screenTypes: string[], signature: string[][]): boolean {
  for (const sig of signature) {
    const sigCounts = new Map<string, number>();
    for (const t of sig) sigCounts.set(t, (sigCounts.get(t) || 0) + 1);

    const screenCounts = new Map<string, number>();
    for (const t of screenTypes) screenCounts.set(t, (screenCounts.get(t) || 0) + 1);

    let allMatch = true;
    for (const [type, count] of sigCounts) {
      if ((screenCounts.get(type) || 0) < count) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
  }
  return false;
}

function detectFlowTypes(
  screens: ExtractedScreen[],
  allPatterns: Map<string, DetectedPattern[]>
): DetectedFlowType[] {
  const detected: DetectedFlowType[] = [];

  for (const sig of FLOW_SIGNATURES) {
    let totalScore = 0;
    const triggerScreens: string[] = [];
    const triggerPatterns: string[] = [];

    for (const screen of screens) {
      let screenScore = 0;
      const name = screen.name.toLowerCase();
      const patterns = allPatterns.get(screen.screen_id) || [];
      const componentTypes = getComponentTypes(patterns);
      const allText = extractAllText(screen.node_tree);

      // Signal 1: Name match (weight: 0.3)
      const nameMatch = sig.namePatterns.some((p) => p.test(name));
      if (nameMatch) {
        screenScore += 0.3;
        triggerPatterns.push("name");
      }

      // Signal 2: Component composition (weight: 0.4)
      if (matchesComponentSignature(componentTypes, sig.componentSignatures)) {
        screenScore += 0.4;
        triggerPatterns.push("components");
      }

      // Signal 3: Inter-screen link text (weight: 0.3)
      const linkMatch = sig.interScreenLinkText.some((p) =>
        allText.some((t) => p.test(t))
      );
      if (linkMatch) {
        screenScore += 0.3;
        triggerPatterns.push("links");
      }

      if (screenScore > 0) {
        totalScore = Math.max(totalScore, screenScore);
        triggerScreens.push(screen.screen_id);
      }
    }

    // Only detect flows with a meaningful score
    if (totalScore >= 0.3 && triggerScreens.length > 0) {
      const confidence: "high" | "medium" | "low" =
        totalScore >= 0.7 ? "high" : totalScore >= 0.4 ? "medium" : "low";

      detected.push({
        type: sig.type,
        confidence,
        triggerScreens,
        triggerPatterns: [...new Set(triggerPatterns)],
        score: totalScore,
      });
    }
  }

  // Sort by score descending
  detected.sort((a, b) => b.score - a.score);

  return detected;
}

// --- Missing Screen Findings ---

function generateMissingScreenFindings(
  screens: ExtractedScreen[],
  detectedFlowTypes: DetectedFlowType[],
  flowRules: FlowRule[]
): MissingScreenFinding[] {
  const findings: MissingScreenFinding[] = [];

  for (const detected of detectedFlowTypes) {
    const flowRule = flowRules.find((r) => r.flow_type === detected.type);
    if (!flowRule) continue;

    for (const expected of flowRule.expected_screens) {
      // Check if screen exists
      const exists = screens.some((s) => {
        const name = s.name.toLowerCase();
        return (
          expected.detection.layer_name_patterns?.some((p) =>
            safeRegExp(p).test(name)
          ) ?? false
        );
      });

      if (!exists && expected.required) {
        findings.push({
          id: `mf-${++missingScreenCounter}`,
          flow_type: detected.type as any,
          flow_name: flowRule.name,
          severity: expected.severity || "warning",
          missing_screen: {
            id: expected.id,
            name: expected.name,
            description: expected.description,
          },
          recommendation: {
            message: `Add a "${expected.name}" screen to complete the ${flowRule.name} flow.`,
            components: expected.components.map((c) => ({
              name: c.label,
              shadcn_id: c.shadcn_id,
              variant: c.variant,
              description: c.label,
            })),
          },
          placeholder: {
            suggested_name: expected.name,
            width: 375,
            height: 812,
          },
        });
      }
    }
  }

  return findings;
}

// --- Helpers ---

function countBySeverity(
  screens: ScreenResult[],
  flowFindings: FlowFinding[],
  severity: string
): number {
  let count = 0;
  for (const screen of screens) {
    count += screen.findings.filter((f) => f.severity === severity).length;
  }
  count += flowFindings.filter((f) => f.severity === severity).length;
  return count;
}

function countBySeverityAll(
  screens: ScreenResult[],
  flowFindings: FlowFinding[],
  missingScreenFindings: MissingScreenFinding[],
  severity: string
): number {
  let count = countBySeverity(screens, flowFindings, severity);
  count += missingScreenFindings.filter((f) => f.severity === severity).length;
  return count;
}
