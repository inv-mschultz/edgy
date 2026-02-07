import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { detectPatterns } from "../src/pattern-detector.js";
import { loadRules, matchRules } from "../src/rule-engine.js";
import { checkExpectations } from "../src/expect-checker.js";
import { generateFindings } from "../src/finding-generator.js";
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
    const dashboard = input.screens[1];
    const patterns = detectPatterns(dashboard.node_tree);

    const destructivePatterns = patterns.filter((p) => p.type === "destructive-action");
    expect(destructivePatterns.length).toBeGreaterThan(0);
  });

  it("detects list/repeating pattern in dashboard", () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const dashboard = input.screens[1];
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
    const dashboard = input.screens[1];
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
  it("flags unmet expectations for login screen (no error states)", async () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const loginScreen = input.screens[0];
    const patterns = detectPatterns(loginScreen.node_tree);
    const rules = await loadRules(KNOWLEDGE_DIR);
    const triggered = matchRules(patterns, rules);

    const allTrees = input.screens.map((s) => s.node_tree);
    const unmet = checkExpectations(triggered, loginScreen.node_tree, allTrees);

    // Login screen has no error states, so we should have unmet expectations
    expect(unmet.length).toBeGreaterThan(0);
  });
});

describe("End-to-End", () => {
  it("generates findings for sample input", async () => {
    const input: AnalysisInput = JSON.parse(readFileSync(SAMPLE_INPUT, "utf-8"));
    const rules = await loadRules(KNOWLEDGE_DIR);

    for (const screen of input.screens) {
      const patterns = detectPatterns(screen.node_tree);
      const triggered = matchRules(patterns, rules);
      const allTrees = input.screens.map((s) => s.node_tree);
      const unmet = checkExpectations(triggered, screen.node_tree, allTrees);
      const findings = generateFindings(unmet, screen);

      // Both screens should have findings since neither has edge case handling
      expect(findings.length).toBeGreaterThan(0);

      // Each finding should have required fields
      for (const finding of findings) {
        expect(finding.id).toBeTruthy();
        expect(finding.category).toBeTruthy();
        expect(finding.severity).toMatch(/critical|warning|info/);
        expect(finding.title).toBeTruthy();
        expect(finding.recommendation.message).toBeTruthy();
      }
    }
  });
});
