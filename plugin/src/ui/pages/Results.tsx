import React from "react";
import type { AnalysisOutput } from "../lib/types";

interface Props {
  results: AnalysisOutput;
  onRenderToCanvas: () => void;
  onStartOver: () => void;
}

export function Results({ results, onRenderToCanvas, onStartOver }: Props) {
  const { summary } = results;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Summary */}
      <div>
        <h2 className="text-lg font-semibold">Analysis Complete</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Found {summary.total_findings} edge case{summary.total_findings !== 1 ? "s" : ""} across{" "}
          {summary.screens_analyzed} screen{summary.screens_analyzed !== 1 ? "s" : ""}.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Critical" count={summary.critical} color="text-destructive bg-destructive/10" />
        <StatCard label="Warning" count={summary.warning} color="text-yellow-600 bg-yellow-50" />
        <StatCard label="Info" count={summary.info} color="text-blue-600 bg-blue-50" />
      </div>

      {/* Per-screen findings */}
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          By Screen
        </div>
        {results.screens.map((screen) => (
          <div key={screen.screen_id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{screen.name}</span>
              <span className="text-xs text-muted-foreground">
                {screen.findings.length} finding{screen.findings.length !== 1 ? "s" : ""}
              </span>
            </div>
            {screen.findings.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {screen.findings.map((finding) => (
                  <div key={finding.id} className="flex items-start gap-2 text-xs">
                    <SeverityDot severity={finding.severity} />
                    <span>{finding.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Flow-level findings */}
      {results.flow_findings.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Flow-Level
          </div>
          {results.flow_findings.map((finding) => (
            <div key={finding.id} className="flex items-start gap-2 text-xs rounded-lg border p-3">
              <SeverityDot severity={finding.severity} />
              <div>
                <span className="font-medium">{finding.title}</span>
                <p className="text-muted-foreground mt-0.5">{finding.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-2">
        <button
          onClick={onRenderToCanvas}
          className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          Place Findings on Canvas
        </button>
        <button
          onClick={onStartOver}
          className="w-full py-2.5 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80"
        >
          Analyze Another Flow
        </button>
      </div>
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

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-destructive",
    warning: "bg-yellow-500",
    info: "bg-blue-500",
  };
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${colors[severity] || colors.info}`} />
  );
}
