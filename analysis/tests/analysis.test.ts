import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { detectPatterns } from "../src/pattern-detector.js";
import { loadRules, matchRules } from "../src/rule-engine.js";
import { checkExpectations } from "../src/expect-checker.js";
import { generateFindings } from "../src/finding-generator.js";
import {
  classifyColor,
  nodeHasVisualCue,
  subtreeHasVisualCue,
  siblingHasNewVisualCue,
} from "../src/visual-cues.js";
import type { AnalysisInput, ExtractedNode } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = resolve(__dirname, "../../knowledge");
const SAMPLE_INPUT = resolve(__dirname, "sample-input.json");

describe("Pattern Detector", () => {
  it("detects form fields in login screen", () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const loginScreen = input.screens[0];
    const patterns = detectPatterns(loginScreen.node_tree);

    const formPatterns = patterns.filter((p) => p.type === "form" || p.type === "form-field");
    expect(formPatterns.length).toBeGreaterThan(0);
  });

  it("detects buttons", () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const loginScreen = input.screens[0];
    const patterns = detectPatterns(loginScreen.node_tree);

    const buttonPatterns = patterns.filter((p) => p.type === "button");
    expect(buttonPatterns.length).toBeGreaterThan(0);
  });

  it("detects destructive actions", () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const dashboard = input.screens[2];
    const patterns = detectPatterns(dashboard.node_tree);

    const destructivePatterns = patterns.filter((p) => p.type === "destructive-action");
    expect(destructivePatterns.length).toBeGreaterThan(0);
  });

  it("detects list/repeating pattern in dashboard", () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const dashboard = input.screens[2];
    const patterns = detectPatterns(dashboard.node_tree);

    const listPatterns = patterns.filter((p) => p.type === "list");
    expect(listPatterns.length).toBeGreaterThan(0);
  });
});

describe("Rule Engine", () => {
  it("loads rules from knowledge directory", async () => {
    const rules = await loadRules(KNOWLEDGE_DIR);
    expect(rules.length).toBeGreaterThan(0);

    const categories = new Set(rules.map((r) => r.category));
    expect(categories.size).toBeGreaterThanOrEqual(5);
  });

  it("matches error-state rules against login screen", async () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const loginScreen = input.screens[0];
    const patterns = detectPatterns(loginScreen.node_tree);
    const rules = await loadRules(KNOWLEDGE_DIR);

    const triggered = matchRules(patterns, rules);
    const errorRules = triggered.filter((t) => t.rule.category.includes("error"));
    expect(errorRules.length).toBeGreaterThan(0);
  });

  it("matches destructive-action rules against dashboard", async () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const dashboard = input.screens[2];
    const patterns = detectPatterns(dashboard.node_tree);
    const rules = await loadRules(KNOWLEDGE_DIR);

    const triggered = matchRules(patterns, rules);
    const destructiveRules = triggered.filter((t) =>
      t.rule.category.includes("destructive")
    );
    expect(destructiveRules.length).toBeGreaterThan(0);
  });
});

describe("Expect Checker", () => {
  it("flags unmet expectations for login screen when checked alone", async () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const loginScreen = input.screens[0];
    const patterns = detectPatterns(loginScreen.node_tree);
    const rules = await loadRules(KNOWLEDGE_DIR);
    const triggered = matchRules(patterns, rules);

    // Check against only the login screen (no sibling screens to satisfy expectations)
    const unmet = checkExpectations(
      triggered,
      loginScreen.node_tree,
      [loginScreen.node_tree]
    );

    // Login screen alone has no error states, so form-field-errors should be unmet
    expect(unmet.length).toBeGreaterThan(0);
    expect(unmet.some((u) => u.rule.id === "form-field-errors")).toBe(true);
  });

  it("satisfies some expectations via flow sibling screens", async () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const loginScreen = input.screens[0];
    const patterns = detectPatterns(loginScreen.node_tree);
    const rules = await loadRules(KNOWLEDGE_DIR);
    const triggered = matchRules(patterns, rules);

    const allTrees = input.screens.map((s) => s.node_tree);
    const unmet = checkExpectations(triggered, loginScreen.node_tree, allTrees);

    // With all screens (including "Login - Error"), error rules should be satisfied
    // but other rules (text-overflow, guest-vs-authenticated) remain unmet
    expect(unmet.some((u) => u.rule.id === "form-field-errors")).toBe(false);
  });
});

describe("Visual Cues", () => {
  it("classifies red colors as error cues", () => {
    // Tailwind red-500: rgb(239, 68, 68) → [0.937, 0.267, 0.267]
    expect(classifyColor(0.937, 0.267, 0.267)).toBe("error");
    // Dark red
    expect(classifyColor(0.86, 0.15, 0.15)).toBe("error");
    // Pure red
    expect(classifyColor(1, 0, 0)).toBe("error");
  });

  it("classifies amber colors as warning cues", () => {
    // Tailwind amber-500: rgb(245, 158, 11) → [0.96, 0.62, 0.04]
    expect(classifyColor(0.96, 0.62, 0.04)).toBe("warning");
  });

  it("classifies green colors as success cues", () => {
    // Tailwind green-500: rgb(34, 197, 94) → [0.13, 0.77, 0.37]
    expect(classifyColor(0.13, 0.77, 0.37)).toBe("success");
  });

  it("classifies blue colors as info cues", () => {
    // Tailwind blue-500: rgb(59, 130, 246) → [0.23, 0.51, 0.96]
    expect(classifyColor(0.23, 0.51, 0.96)).toBe("info");
  });

  it("returns null for neutral colors", () => {
    expect(classifyColor(0.5, 0.5, 0.5)).toBeNull();
    expect(classifyColor(1, 1, 1)).toBeNull();
    expect(classifyColor(0, 0, 0)).toBeNull();
    expect(classifyColor(0.9, 0.9, 0.9)).toBeNull();
  });

  it("detects visual cues on nodes with strokes", () => {
    const node: ExtractedNode = {
      id: "1", name: "Input", type: "INSTANCE", visible: true,
      x: 0, y: 0, width: 100, height: 40, children: [],
      strokes: [[0.937, 0.267, 0.267]],
      strokeWeight: 2,
    };
    expect(nodeHasVisualCue(node, "error")).toBe(true);
    expect(nodeHasVisualCue(node, "warning")).toBe(false);
  });

  it("detects visual cues on nodes with fills", () => {
    const node: ExtractedNode = {
      id: "1", name: "Error Text", type: "TEXT", visible: true,
      x: 0, y: 0, width: 100, height: 16, children: [],
      fills: [[0.937, 0.267, 0.267]],
    };
    expect(nodeHasVisualCue(node, "error")).toBe(true);
  });

  it("detects visual cues in subtree", () => {
    const parent: ExtractedNode = {
      id: "1", name: "Form", type: "FRAME", visible: true,
      x: 0, y: 0, width: 300, height: 200, children: [
        {
          id: "2", name: "Input", type: "INSTANCE", visible: true,
          x: 0, y: 0, width: 300, height: 40, children: [],
          strokes: [[0.937, 0.267, 0.267]],
          strokeWeight: 2,
        },
      ],
    };
    expect(subtreeHasVisualCue(parent, "error")).toBe(true);
  });

  it("detects new visual cues on sibling screen", () => {
    const baseNodes: ExtractedNode[] = [
      {
        id: "1", name: "Email Input", type: "INSTANCE", componentName: "Input",
        visible: true, x: 0, y: 0, width: 300, height: 40, children: [],
        // No strokes — normal state
      },
    ];
    const siblingNodes: ExtractedNode[] = [
      {
        id: "2", name: "Email Input", type: "INSTANCE", componentName: "Input",
        visible: true, x: 0, y: 0, width: 300, height: 40, children: [],
        strokes: [[0.937, 0.267, 0.267]], // Red stroke — error state
        strokeWeight: 2,
      },
    ];
    expect(siblingHasNewVisualCue(baseNodes, siblingNodes, "error")).toBe(true);
  });

  it("does NOT flag when both screens have same red color", () => {
    const baseNodes: ExtractedNode[] = [
      {
        id: "1", name: "Button", type: "INSTANCE", componentName: "Button",
        visible: true, x: 0, y: 0, width: 100, height: 40, children: [],
        fills: [[0.937, 0.267, 0.267]], // Brand red
      },
    ];
    const siblingNodes: ExtractedNode[] = [
      {
        id: "2", name: "Button", type: "INSTANCE", componentName: "Button",
        visible: true, x: 0, y: 0, width: 100, height: 40, children: [],
        fills: [[0.937, 0.267, 0.267]], // Same brand red
      },
    ];
    expect(siblingHasNewVisualCue(baseNodes, siblingNodes, "error")).toBe(false);
  });
});

describe("Visual Inference in Expect Checker", () => {
  it("satisfies form-field-errors via visual cues on sibling screen", async () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const loginScreen = input.screens[0]; // "Login Screen" (no visual cues)
    const loginErrorScreen = input.screens[1]; // "Login - Error" (red strokes/fills)
    const rules = await loadRules(KNOWLEDGE_DIR);
    const patterns = detectPatterns(loginScreen.node_tree);
    const triggered = matchRules(patterns, rules);

    // Without flow siblings: form-field-errors should be unmet
    const unmetAlone = checkExpectations(
      triggered,
      loginScreen.node_tree,
      [loginScreen.node_tree]
    );
    const errorRuleUnmet = unmetAlone.some((u) => u.rule.id === "form-field-errors");
    expect(errorRuleUnmet).toBe(true);

    // With flow sibling that has visual error cues: should satisfy expectation
    const loginFlowTrees = [loginScreen.node_tree, loginErrorScreen.node_tree];
    const allTrees = input.screens.map((s) => s.node_tree);
    const unmetWithSibling = checkExpectations(
      triggered,
      loginScreen.node_tree,
      allTrees,
      loginFlowTrees
    );
    const errorRuleStillUnmet = unmetWithSibling.some(
      (u) => u.rule.id === "form-field-errors"
    );
    expect(errorRuleStillUnmet).toBe(false);
  });
});

describe("End-to-End", () => {
  it("generates findings for sample input", async () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const rules = await loadRules(KNOWLEDGE_DIR);

    // Test against Dashboard (screen index 2) which has no edge case handling
    const dashboard = input.screens[2];
    const patterns = detectPatterns(dashboard.node_tree);
    const triggered = matchRules(patterns, rules);
    const allTrees = input.screens.map((s) => s.node_tree);
    const unmet = checkExpectations(triggered, dashboard.node_tree, allTrees);
    const findings = generateFindings(unmet, dashboard);

    expect(findings.length).toBeGreaterThan(0);

    for (const finding of findings) {
      expect(finding.id).toBeTruthy();
      expect(finding.category).toBeTruthy();
      expect(finding.severity).toMatch(/critical|warning|info/);
      expect(finding.title).toBeTruthy();
      expect(finding.recommendation.message).toBeTruthy();
    }
  });
});

describe("Pattern Detector - Extended", () => {
  it("detects data display via layer name fallback", () => {
    const tree: ExtractedNode = {
      id: "1", name: "Screen", type: "FRAME", visible: true,
      x: 0, y: 0, width: 390, height: 844,
      children: [
        {
          id: "2", name: "Stats Panel", type: "FRAME", visible: true,
          x: 0, y: 0, width: 390, height: 200, children: [],
        },
        {
          id: "3", name: "KPI Widget", type: "FRAME", visible: true,
          x: 0, y: 0, width: 180, height: 100, children: [],
        },
      ],
    };
    const patterns = detectPatterns(tree);
    const dataPatterns = patterns.filter((p) => p.type === "data-display");
    expect(dataPatterns.length).toBeGreaterThan(0);
  });

  it("detects modal/dialog patterns", () => {
    const tree: ExtractedNode = {
      id: "1", name: "Screen", type: "FRAME", visible: true,
      x: 0, y: 0, width: 390, height: 844,
      children: [
        {
          id: "2", name: "Confirmation", type: "INSTANCE",
          componentName: "AlertDialog", visible: true,
          x: 50, y: 300, width: 290, height: 200, children: [],
        },
      ],
    };
    const patterns = detectPatterns(tree);
    const modalPatterns = patterns.filter((p) => p.type === "modal");
    expect(modalPatterns.length).toBeGreaterThan(0);
  });

  it("detects modal via layer name", () => {
    const tree: ExtractedNode = {
      id: "1", name: "Screen", type: "FRAME", visible: true,
      x: 0, y: 0, width: 390, height: 844,
      children: [
        {
          id: "2", name: "Delete Popup", type: "FRAME", visible: true,
          x: 50, y: 300, width: 290, height: 200, children: [],
        },
      ],
    };
    const patterns = detectPatterns(tree);
    const modalPatterns = patterns.filter((p) => p.type === "modal");
    expect(modalPatterns.length).toBeGreaterThan(0);
  });

  it("detects navigation patterns", () => {
    const tree: ExtractedNode = {
      id: "1", name: "Screen", type: "FRAME", visible: true,
      x: 0, y: 0, width: 390, height: 844,
      children: [
        {
          id: "2", name: "Main Nav", type: "INSTANCE",
          componentName: "Tabs", visible: true,
          x: 0, y: 0, width: 390, height: 48, children: [],
        },
      ],
    };
    const patterns = detectPatterns(tree);
    const navPatterns = patterns.filter((p) => p.type === "navigation");
    expect(navPatterns.length).toBeGreaterThan(0);
  });

  it("detects search via component name", () => {
    const tree: ExtractedNode = {
      id: "1", name: "Screen", type: "FRAME", visible: true,
      x: 0, y: 0, width: 390, height: 844,
      children: [
        {
          id: "2", name: "Header Search", type: "INSTANCE",
          componentName: "SearchInput", visible: true,
          x: 16, y: 60, width: 358, height: 40, children: [],
        },
      ],
    };
    const patterns = detectPatterns(tree);
    const searchPatterns = patterns.filter((p) => p.type === "search");
    expect(searchPatterns.length).toBeGreaterThan(0);
  });

  it("does NOT detect screen-level frames as buttons", () => {
    const tree: ExtractedNode = {
      id: "1", name: "Login Screen", type: "FRAME", visible: true,
      x: 0, y: 0, width: 390, height: 844,
      children: [
        { id: "2", name: "Email Input", type: "INSTANCE", componentName: "Input",
          visible: true, x: 24, y: 300, width: 342, height: 48, children: [] },
        { id: "3", name: "Password Input", type: "INSTANCE", componentName: "Input",
          visible: true, x: 24, y: 370, width: 342, height: 48, children: [] },
        { id: "4", name: "Sign In Button", type: "INSTANCE", componentName: "Button",
          visible: true, x: 24, y: 450, width: 342, height: 48, children: [] },
      ],
    };
    const patterns = detectPatterns(tree);
    const buttonNodes = patterns
      .filter((p) => p.type === "button")
      .flatMap((p) => p.nodes);
    // "Login Screen" frame should NOT be in button nodes
    expect(buttonNodes.some((n) => n.name === "Login Screen")).toBe(false);
  });
});

describe("Rule Engine - Regex Handling", () => {
  it("handles (?i) prefix in layer_name_patterns", async () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const loginScreen = input.screens[0];
    const patterns = detectPatterns(loginScreen.node_tree);
    const rules = await loadRules(KNOWLEDGE_DIR);
    const triggered = matchRules(patterns, rules);

    // submit-error-feedback uses (?i)(submit|...|sign.?in|...) in layer_name_patterns
    // "Sign In Button" should match it now that (?i) stripping is in place
    const submitRule = triggered.find((t) => t.rule.id === "submit-error-feedback");
    expect(submitRule).toBeDefined();
  });

  it("triggers delete-no-confirmation on destructive-action without triple AND", async () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const dashboard = input.screens[2];
    const patterns = detectPatterns(dashboard.node_tree);
    const rules = await loadRules(KNOWLEDGE_DIR);
    const triggered = matchRules(patterns, rules);

    // delete-no-confirmation now only requires pattern_types: [destructive-action]
    const deleteRule = triggered.find((t) => t.rule.id === "delete-no-confirmation");
    expect(deleteRule).toBeDefined();
  });

  it("no-offline-indicator does NOT trigger on form-only screens", async () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const loginScreen = input.screens[0];
    const patterns = detectPatterns(loginScreen.node_tree);
    const rules = await loadRules(KNOWLEDGE_DIR);
    const triggered = matchRules(patterns, rules);

    // Login screen has only form/button patterns, no data-display/list
    // And no data-fetching layer names — so no-offline-indicator should NOT trigger
    const offlineRule = triggered.find((t) => t.rule.id === "no-offline-indicator");
    expect(offlineRule).toBeUndefined();
  });
});
