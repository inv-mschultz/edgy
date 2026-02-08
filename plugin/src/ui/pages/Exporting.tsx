import React from "react";
import { Check, Sparkles, Globe } from "lucide-react";

export interface ExportStep {
  id: string;
  label: string;
  status: "pending" | "in-progress" | "complete" | "error";
  detail?: string;
}

interface ExportingProps {
  steps: ExportStep[];
  currentScreenName?: string;
  currentScreenIndex?: number;
  totalScreens?: number;
  onDone: () => void;
  onDeployLive?: () => void;
  onDownloadPrototype?: () => void;
  hasVercelToken?: boolean;
  isComplete: boolean;
}

export function Exporting({
  steps,
  currentScreenName,
  currentScreenIndex,
  totalScreens,
  onDone,
  onDeployLive,
  onDownloadPrototype,
  hasVercelToken,
  isComplete,
}: ExportingProps) {
  const aiStep = steps.find((s) => s.id === "ai-generation");
  const isGenerating = aiStep?.status === "in-progress";

  // Calculate progress percentage
  const completedSteps = steps.filter((s) => s.status === "complete").length;
  const inProgressSteps = steps.filter((s) => s.status === "in-progress").length;
  const progress = ((completedSteps + inProgressSteps * 0.5) / steps.length) * 100;

  return (
    <div className="flex flex-col items-center px-6 py-10">
      <div className="w-full max-w-sm">
        {/* Title */}
        <h2 className="text-lg font-semibold text-primary text-center mb-6">
          {isComplete ? "Export complete!" : "Exporting to canvas..."}
        </h2>

        {/* Progress bar */}
        <div className="w-full h-2 bg-secondary rounded-full mb-10 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${isComplete ? 100 : progress}%` }}
          />
        </div>

        {/* Steps list */}
        <div className="space-y-4 mb-8">
          {steps.map((step) => (
            <div
              key={step.id}
              className="flex items-center gap-3 transition-all duration-300"
            >
              {/* Status indicator */}
              <div className="flex-shrink-0 w-6 flex justify-center">
                {step.status === "complete" ? (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center animate-scale-in">
                    <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                  </div>
                ) : step.status === "in-progress" ? (
                  <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-sm transition-all duration-300 ${
                  step.status === "complete"
                    ? "text-foreground font-medium"
                    : step.status === "in-progress"
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground/50"
                }`}
              >
                {step.label}
                {step.status === "in-progress" && !isGenerating && "..."}
              </span>
            </div>
          ))}
        </div>

        {/* AI Generation card */}
        {isGenerating && currentScreenName && (
          <div className="mb-8 animate-fade-in">
            <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-primary/5 p-5">
              {/* Shimmer effect */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-shimmer" />
              </div>

              {/* Content */}
              <div className="relative flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  Designing {currentScreenName}
                </p>
                {totalScreens && totalScreens > 1 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Screen {currentScreenIndex} of {totalScreens}
                  </p>
                )}

                {/* Bouncing dots */}
                <div className="flex gap-1 mt-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Completion actions */}
        {isComplete && (
          <div className="flex flex-col gap-2 animate-fade-in">
            {onDeployLive && hasVercelToken ? (
              <button
                onClick={onDeployLive}
                className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <Globe className="w-4 h-4" />
                Build Prototype
              </button>
            ) : onDeployLive ? (
              <button
                disabled
                title="Add Vercel token in Settings"
                className="w-full py-2.5 px-4 rounded-lg bg-muted text-muted-foreground text-sm font-medium cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Globe className="w-4 h-4" />
                Build Prototype
              </button>
            ) : null}
            {onDeployLive && !hasVercelToken && (
              <p className="text-xs text-muted-foreground text-center">
                Add Vercel token in Settings to deploy
              </p>
            )}
            <button
              onClick={onDone}
              className="w-full py-2.5 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
