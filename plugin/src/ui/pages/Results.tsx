import React, { useState } from "react";
import type { AnalysisOutput, MissingScreenFinding, ScreenResult, AnalysisFinding } from "../lib/types";
import { Sparkles, AlertTriangle, X, Info as InfoIcon } from "lucide-react";
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

  // Total findings count
  const totalFindings = summary.critical + summary.warning + summary.info;
  const screenCount = results.screens.length;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Health Gauge */}
      <div className="flex flex-col items-center py-2">
        <HealthGauge health={health} />
        <div className="flex items-center gap-2 mt-2">
          <LLMBadge results={results} />
        </div>
      </div>

      {/* Summary text */}
      <div className="text-center">
        <span className="text-sm font-semibold" style={{ color: '#4A1A6B' }}>
          {totalFindings} edge case{totalFindings !== 1 ? 's' : ''} across {screenCount} screen{screenCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Severity cards - full width colored bars */}
      <div className="flex flex-col gap-2">
        <SeverityCard
          icon={<X className="w-5 h-5" strokeWidth={3} />}
          count={summary.critical}
          label="essential changes"
          bgColor="#FEE2E2"
          textColor="#991B1B"
          iconColor="#DC2626"
        />
        <SeverityCard
          icon={<AlertTriangle className="w-5 h-5" />}
          count={summary.warning}
          label="advisable changes"
          bgColor="#FEF3C7"
          textColor="#92400E"
          iconColor="#D97706"
        />
        <SeverityCard
          icon={<InfoIcon className="w-5 h-5" />}
          count={summary.info}
          label="optional change"
          bgColor="#DBEAFE"
          textColor="#1E40AF"
          iconColor="#2563EB"
        />
      </div>

      {/* Findings grouped by flow */}
      {flowGroups.size > 0 && (
        <div className="flex flex-col gap-3 mt-2">
          <h3 className="text-sm font-semibold" style={{ color: '#4A1A6B' }}>By flow</h3>
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
            className="flex items-center gap-2 text-sm cursor-pointer select-none group mb-4"
            onClick={() => setIncludePlaceholders(!includePlaceholders)}
          >
            <span
              className={`
                flex items-center justify-center w-5 h-5 rounded transition-colors shrink-0 border-2
                ${includePlaceholders
                  ? 'bg-primary border-primary'
                  : 'bg-white border-gray-300 group-hover:border-gray-400'
                }
              `}
            >
              {includePlaceholders && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            <span className="text-muted-foreground">
              Generate placeholder for missing screens
            </span>
          </label>
        )}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onExportToCanvas(includePlaceholders)}
            className="w-full py-3 px-6 rounded-full text-sm font-semibold transition-all"
            style={{ backgroundColor: '#4A1A6B', color: 'white' }}
          >
            Export to canvas
          </button>

          <button
            onClick={onStartOver}
            className="w-full py-3 px-6 rounded-full text-sm font-semibold transition-all border-2"
            style={{
              backgroundColor: '#FEF3C7',
              borderColor: '#FEF3C7',
              color: '#4A1A6B'
            }}
          >
            Analyse another flow
          </button>
        </div>
      </div>
    </div>
  );
}

function SeverityCard({
  icon,
  count,
  label,
  bgColor,
  textColor,
  iconColor
}: {
  icon: React.ReactNode;
  count: number;
  label: string;
  bgColor: string;
  textColor: string;
  iconColor: string;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg"
      style={{ backgroundColor: bgColor }}
    >
      <span style={{ color: iconColor }}>{icon}</span>
      <span className="text-sm font-semibold" style={{ color: textColor }}>
        {count} {label}
      </span>
    </div>
  );
}

function FlowGroupCard({ flowType, group }: { flowType: string; group: FlowGroup }) {
  const hasScreenFindings = group.screenFindings.length > 0;
  const hasFlowFindings = group.flowFindings.length > 0;
  const hasMissingScreens = group.missingScreens.length > 0;

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      {/* Flow header */}
      <div className="pb-2 border-b border-gray-100">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#4A1A6B' }}>
          {formatFlowName(flowType)} Flow
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {/* Screen findings */}
        {group.screenFindings.map((screen, idx) => (
          <div key={screen.screen_id} className="flex flex-col gap-2">
            {idx > 0 && <div className="border-t border-gray-100 -mx-4 my-1" />}
            <div className="flex flex-col gap-2">
              {screen.findings.map((finding) => (
                <FindingItem key={finding.id} finding={finding} screenName={screen.name} />
              ))}
            </div>
          </div>
        ))}

        {/* Divider before flow findings */}
        {hasScreenFindings && hasFlowFindings && (
          <div className="border-t border-gray-100 -mx-4 my-1" />
        )}

        {/* Flow-level findings */}
        {hasFlowFindings && (
          <div className="flex flex-col gap-2">
            {group.flowFindings.map((finding) => (
              <FindingItem key={finding.id} finding={finding} />
            ))}
          </div>
        )}

        {/* Divider before missing screens */}
        {(hasScreenFindings || hasFlowFindings) && hasMissingScreens && (
          <div className="border-t border-gray-100 -mx-4 my-1" />
        )}

        {/* Missing screens */}
        {hasMissingScreens && (
          <div className="flex flex-col gap-2">
            {group.missingScreens.map((finding) => (
              <div key={finding.id} className="flex items-start gap-3">
                <SeverityIcon severity={finding.severity} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: '#4A1A6B' }}>
                    {finding.missing_screen.name}
                  </div>
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

function FindingItem({ finding, screenName }: { finding: AnalysisFinding; screenName?: string }) {
  return (
    <div className="flex items-start gap-3">
      <SeverityIcon severity={finding.severity} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: '#4A1A6B' }}>
          {screenName || finding.title}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {screenName ? finding.title : finding.description}
        </p>
      </div>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  const config: Record<string, { bg: string; icon: React.ReactNode }> = {
    critical: {
      bg: "#FEE2E2",
      icon: <X className="w-3.5 h-3.5" strokeWidth={3} style={{ color: '#DC2626' }} />
    },
    warning: {
      bg: "#FEF3C7",
      icon: <AlertTriangle className="w-3.5 h-3.5" style={{ color: '#D97706' }} />
    },
    info: {
      bg: "#DBEAFE",
      icon: <InfoIcon className="w-3.5 h-3.5" style={{ color: '#2563EB' }} />
    },
  };
  const { bg, icon } = config[severity] || config.info;

  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
      style={{ backgroundColor: bg }}
    >
      {icon}
    </div>
  );
}

function LLMBadge({ results }: { results: AnalysisOutput }) {
  if (!results.llm_enhanced && !results.llm_error) return null;

  if (results.llm_enhanced) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
        style={{ backgroundColor: '#EDE9FE', color: '#6D28D9' }}
      >
        <Sparkles className="w-3 h-3" />
        AI-enhanced
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
        style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}
      >
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
