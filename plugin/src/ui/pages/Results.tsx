import React, { useState } from "react";
import type { AnalysisOutput, MissingScreenFinding, ScreenResult, AnalysisFinding } from "../lib/types";
import { Sparkles, AlertTriangle } from "lucide-react";
import { HealthGauge } from "../components/HealthGauge";

interface Props {
  results: AnalysisOutput;
  onExportToCanvas: (includePlaceholders: boolean) => void;
  onStartOver: () => void;
}

/**
 * Calculate health score from 0-100 based on findings.
 * Starts at 100 and deducts points based on severity.
 */
function calculateHealth(results: AnalysisOutput): number {
  let health = 100;

  // Deduct for screen findings
  health -= results.summary.critical * 15;
  health -= results.summary.warning * 8;
  health -= results.summary.info * 3;

  // Deduct for missing screens
  const missingScreens = results.missing_screen_findings || [];
  for (const finding of missingScreens) {
    if (finding.severity === "critical") health -= 10;
    else if (finding.severity === "warning") health -= 5;
    else health -= 2;
  }

  // Deduct for flow-level findings
  for (const finding of results.flow_findings) {
    if (finding.severity === "critical") health -= 12;
    else if (finding.severity === "warning") health -= 6;
    else health -= 2;
  }

  return Math.max(0, Math.min(100, Math.round(health)));
}

// --- Flow Grouping ---

interface FlowGroup {
  screenFindings: ScreenResult[];
  flowFindings: AnalysisFinding[];
  missingScreens: MissingScreenFinding[];
}

/**
 * Detects flow type from screen name patterns.
 */
function detectFlowTypeFromScreen(screen: ScreenResult): string {
  const name = screen.name.toLowerCase();

  if (name.includes("login") || name.includes("signup") || name.includes("sign up") ||
      name.includes("register") || name.includes("auth") || name.includes("password") ||
      name.includes("forgot") || name.includes("reset") || name.includes("verify") ||
      name.includes("2fa") || name.includes("mfa")) {
    return "authentication";
  }
  if (name.includes("cart") || name.includes("checkout") || name.includes("payment") ||
      name.includes("order") || name.includes("shipping") || name.includes("billing")) {
    return "checkout";
  }
  if (name.includes("onboard") || name.includes("welcome") || name.includes("tutorial") ||
      name.includes("intro") || name.includes("getting started") || name.includes("setup")) {
    return "onboarding";
  }
  if (name.includes("search") || name.includes("filter") || name.includes("results") ||
      name.includes("browse")) {
    return "search";
  }
  if (name.includes("setting") || name.includes("preference") || name.includes("config") ||
      name.includes("profile") || name.includes("account")) {
    return "settings";
  }
  if (name.includes("upload") || name.includes("import") || name.includes("attach")) {
    return "upload";
  }
  if (name.includes("create") || name.includes("edit") || name.includes("new") ||
      name.includes("add") || name.includes("delete") || name.includes("list") ||
      name.includes("detail") || name.includes("view")) {
    return "crud";
  }

  return "general";
}

/**
 * Detects flow type from finding content.
 */
function detectFlowTypeFromFinding(finding: AnalysisFinding): string {
  const text = `${finding.title} ${finding.description}`.toLowerCase();

  if (text.includes("login") || text.includes("auth") || text.includes("password") ||
      text.includes("session") || text.includes("signup") || text.includes("register")) {
    return "authentication";
  }
  if (text.includes("cart") || text.includes("checkout") || text.includes("payment") ||
      text.includes("order")) {
    return "checkout";
  }
  if (text.includes("onboard") || text.includes("welcome") || text.includes("tutorial")) {
    return "onboarding";
  }
  if (text.includes("search") || text.includes("filter")) {
    return "search";
  }
  if (text.includes("setting") || text.includes("preference")) {
    return "settings";
  }
  if (text.includes("upload") || text.includes("file")) {
    return "upload";
  }

  return "general";
}

/**
 * Formats flow type into human-readable name.
 */
function formatFlowName(flowType: string): string {
  const names: Record<string, string> = {
    "authentication": "Authentication",
    "checkout": "Checkout",
    "onboarding": "Onboarding",
    "search": "Search",
    "settings": "Settings",
    "upload": "Upload",
    "crud": "Data Management",
    "general": "General",
  };
  return names[flowType] || flowType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Groups all findings by flow type.
 */
function groupAllFindingsByFlow(results: AnalysisOutput): Map<string, FlowGroup> {
  const groups = new Map<string, FlowGroup>();

  const getGroup = (flowType: string): FlowGroup => {
    if (!groups.has(flowType)) {
      groups.set(flowType, {
        screenFindings: [],
        flowFindings: [],
        missingScreens: [],
      });
    }
    return groups.get(flowType)!;
  };

  // Group screen findings by detected flow type
  for (const screen of results.screens) {
    const flowType = detectFlowTypeFromScreen(screen);
    const group = getGroup(flowType);
    if (screen.findings.length > 0) {
      group.screenFindings.push(screen);
    }
  }

  // Group flow-level findings
  for (const finding of results.flow_findings) {
    const flowType = detectFlowTypeFromFinding(finding);
    const group = getGroup(flowType);
    group.flowFindings.push(finding);
  }

  // Group missing screen findings by their explicit flow_type
  for (const finding of results.missing_screen_findings || []) {
    const group = getGroup(finding.flow_type);
    group.missingScreens.push(finding);
  }

  return groups;
}

/**
 * Count total findings in a flow group.
 */
function countFlowFindings(group: FlowGroup): number {
  let count = 0;
  for (const screen of group.screenFindings) {
    count += screen.findings.length;
  }
  count += group.flowFindings.length;
  count += group.missingScreens.length;
  return count;
}

export function Results({ results, onExportToCanvas, onStartOver }: Props) {
  const { summary } = results;
  const [includePlaceholders, setIncludePlaceholders] = useState(false);

  // Group all findings by flow type
  const flowGroups = groupAllFindingsByFlow(results);
  const hasMissingScreens = (results.missing_screen_findings || []).length > 0;

  // Calculate health score
  const health = calculateHealth(results);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Health Gauge */}
      <div className="flex flex-col items-center py-2">
        <HealthGauge health={health} />
        <div className="flex items-center gap-2 mt-3">
          <LLMBadge results={results} />
        </div>
      </div>

      {/* Stat cards - using accessible colors */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Critical" count={summary.critical} color="text-red-700 bg-red-50" />
        <StatCard label="Warning" count={summary.warning} color="text-amber-700 bg-amber-50" />
        <StatCard label="Info" count={summary.info} color="text-blue-700 bg-blue-50" />
      </div>

      {/* Findings grouped by flow */}
      {flowGroups.size > 0 && (
        <div className="flex flex-col gap-3">
          {Array.from(flowGroups.entries()).map(([flowType, group]) => {
            const totalFindings = countFlowFindings(group);
            if (totalFindings === 0) return null;

            return (
              <FlowGroupCard
                key={flowType}
                flowType={flowType}
                group={group}
              />
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col pt-2">
        {hasMissingScreens && (
          <label
            className="flex items-center gap-2 text-xs cursor-pointer select-none group mb-4"
            onClick={() => setIncludePlaceholders(!includePlaceholders)}
          >
            <span
              className={`
                flex items-center justify-center w-4 h-4 rounded transition-colors shrink-0
                ${includePlaceholders
                  ? 'bg-primary'
                  : 'bg-background border border-border group-hover:border-muted-foreground'
                }
              `}
            >
              {includePlaceholders && (
                <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            <span className="text-muted-foreground">
              Generate missing screens
            </span>
          </label>
        )}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onExportToCanvas(includePlaceholders)}
            className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Export to Canvas
          </button>

          <button
            onClick={onStartOver}
            className="w-full py-2.5 px-4 rounded-lg text-muted-foreground text-sm font-medium hover:bg-secondary/50 mt-1"
          >
            Analyze Another Flow
          </button>
        </div>
      </div>
    </div>
  );
}

function FlowGroupCard({ flowType, group }: { flowType: string; group: FlowGroup }) {
  const totalFindings = countFlowFindings(group);
  const hasScreenFindings = group.screenFindings.length > 0;
  const hasFlowFindings = group.flowFindings.length > 0;
  const hasMissingScreens = group.missingScreens.length > 0;

  return (
    <div className="rounded-lg border p-4">
      {/* Flow header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <span className="text-xs font-semibold text-primary uppercase tracking-wide">
          {formatFlowName(flowType)}
        </span>
        <span className="text-xs text-muted-foreground">
          {totalFindings} finding{totalFindings !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {/* Screen findings */}
        {group.screenFindings.map((screen, idx) => (
          <div key={screen.screen_id} className="flex flex-col gap-2">
            {idx > 0 && <div className="border-t border-border -mx-4 my-1" />}
            <div className="text-sm font-medium text-foreground">{screen.name}</div>
            <div className="flex flex-col gap-2">
              {screen.findings.map((finding) => (
                <FindingItem key={finding.id} finding={finding} />
              ))}
            </div>
          </div>
        ))}

        {/* Divider before flow findings */}
        {hasScreenFindings && hasFlowFindings && (
          <div className="border-t border-border -mx-4 my-1" />
        )}

        {/* Flow-level findings */}
        {hasFlowFindings && (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-muted-foreground">Flow Issues</div>
            {group.flowFindings.map((finding) => (
              <FindingItem key={finding.id} finding={finding} />
            ))}
          </div>
        )}

        {/* Divider before missing screens */}
        {(hasScreenFindings || hasFlowFindings) && hasMissingScreens && (
          <div className="border-t border-border -mx-4 my-1" />
        )}

        {/* Missing screens */}
        {hasMissingScreens && (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-muted-foreground">Missing Screens</div>
            {group.missingScreens.map((finding) => (
              <div key={finding.id} className="flex items-start gap-3">
                <SeverityIcon severity={finding.severity} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{finding.missing_screen.name}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {finding.missing_screen.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FindingItem({ finding }: { finding: AnalysisFinding }) {
  return (
    <div className="flex items-start gap-3">
      <SeverityIcon severity={finding.severity} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{finding.title}</div>
        {finding.description && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {finding.description}
          </p>
        )}
      </div>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  const config: Record<string, { bg: string; text: string; symbol: string }> = {
    critical: { bg: "bg-red-50", text: "text-red-700", symbol: "×" },
    warning: { bg: "bg-amber-50", text: "text-amber-700", symbol: "!" },
    info: { bg: "bg-blue-50", text: "text-blue-700", symbol: "i" },
  };
  const { bg, text, symbol } = config[severity] || config.info;

  return (
    <div
      className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${bg}`}
    >
      <span className={`text-xs font-bold ${text}`}>{symbol}</span>
    </div>
  );
}

function LLMBadge({ results }: { results: AnalysisOutput }) {
  if (!results.llm_enhanced && !results.llm_error) return null;

  if (results.llm_enhanced) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 text-violet-700">
        <Sparkles className="w-3 h-3" />
        AI-enhanced
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-700">
        <AlertTriangle className="w-3 h-3" />
        Heuristic only
      </span>
      {results.llm_error && (
        <span className="text-[10px] text-destructive">
          {results.llm_error}
        </span>
      )}
    </div>
  );
}

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`rounded-lg p-3 text-center ${color}`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}
