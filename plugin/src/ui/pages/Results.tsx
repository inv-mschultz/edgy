import React, { useState } from "react";
import type { AnalysisOutput, MissingScreenFinding, FlowType } from "../lib/types";
import { Sparkles, AlertTriangle } from "lucide-react";

interface Props {
  results: AnalysisOutput;
  onExportToCanvas: (includePlaceholders: boolean) => void;
  onStartOver: () => void;
}

export function Results({ results, onExportToCanvas, onStartOver }: Props) {
  const { summary } = results;
  const [includePlaceholders, setIncludePlaceholders] = useState(false);

  // Group missing screen findings by flow type
  const missingByFlow = groupByFlowType(results.missing_screen_findings || []);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Summary */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Analysis Complete</h2>
          <LLMBadge results={results} />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Found {summary.total_findings} edge case{summary.total_findings !== 1 ? "s" : ""} across{" "}
          {summary.screens_analyzed} screen{summary.screens_analyzed !== 1 ? "s" : ""}.
        </p>
      </div>

      {/* Stat cards - using accessible colors */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Critical" count={summary.critical} color="text-red-700 bg-red-50" />
        <StatCard label="Warning" count={summary.warning} color="text-amber-700 bg-amber-50" />
        <StatCard label="Info" count={summary.info} color="text-blue-700 bg-blue-50" />
      </div>

      {/* Missing screens by flow */}
      {missingByFlow.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            By Flow
          </div>
          {missingByFlow.map(([flowType, findings]) => (
            <FlowCard key={flowType} flowType={flowType} findings={findings} />
          ))}
        </div>
      )}

      {/* Per-screen findings - only show screens with findings */}
      {results.screens.filter(s => s.findings.length > 0).length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            By Screen
          </div>
          {results.screens
            .filter((screen) => screen.findings.length > 0)
            .map((screen) => (
              <div key={screen.screen_id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <span className="text-sm font-semibold">{screen.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {screen.findings.length} finding{screen.findings.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-3">
                  {screen.findings.map((finding) => (
                    <div key={finding.id} className="flex items-start gap-3">
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
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Flow-level findings */}
      {results.flow_findings.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Flow-Level
          </div>
          {results.flow_findings.map((finding) => (
            <div key={finding.id} className="flex items-start gap-3 rounded-lg border p-4">
              <SeverityIcon severity={finding.severity} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{finding.title}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{finding.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col pt-2">
        {missingByFlow.length > 0 && (
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
              Generate placeholder frames for missing screens
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
            className="w-full py-2.5 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80"
          >
            Analyze Another Flow
          </button>
        </div>
      </div>
    </div>
  );
}

function FlowCard({ flowType, findings }: { flowType: string; findings: MissingScreenFinding[] }) {
  const flowName = findings[0]?.flow_name || flowType.replace(/-/g, " ");

  return (
    <div className="rounded-lg border p-4">
      {/* Header: Flow name on left, count on right */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <span className="text-sm font-semibold">{flowName}</span>
        <span className="text-xs text-muted-foreground">
          {findings.length} missing screen{findings.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Findings list with severity icons */}
      <div className="mt-3 flex flex-col gap-3">
        {findings.map((finding) => (
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

function groupByFlowType(findings: MissingScreenFinding[]): [string, MissingScreenFinding[]][] {
  const groups = new Map<string, MissingScreenFinding[]>();

  for (const finding of findings) {
    const key = finding.flow_type;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(finding);
  }

  return Array.from(groups.entries());
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

