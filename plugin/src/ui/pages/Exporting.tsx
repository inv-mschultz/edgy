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
    <div className="flex flex-col items-center px-6 py-8">
      <div className="w-full max-w-sm">
        {/* Title */}
        <h2 className="text-lg font-semibold text-center mb-6" style={{ color: '#4A1A6B' }}>
          {isComplete ? "Export complete!" : "Exporting to canvas..."}
        </h2>

        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-200 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${isComplete ? 100 : progress}%`,
              background: 'linear-gradient(90deg, #4A1A6B 0%, #6B2D8A 100%)'
            }}
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
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center animate-scale-in"
                    style={{ backgroundColor: '#22C55E' }}
                  >
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  </div>
                ) : step.status === "in-progress" ? (
                  <div
                    className="w-3 h-3 rounded-full animate-pulse"
                    style={{ backgroundColor: '#4A1A6B' }}
                  />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-sm transition-all duration-300 ${
                  step.status === "complete"
                    ? "font-medium"
                    : step.status === "in-progress"
                    ? "font-semibold"
                    : ""
                }`}
                style={{
                  color: step.status === "pending" ? '#9CA3AF' : '#4A1A6B'
                }}
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
            <div
              className="relative overflow-hidden rounded-xl border p-5"
              style={{ borderColor: '#E9D5FF', backgroundColor: '#FAF5FF' }}
            >
              {/* Shimmer effect */}
              <div className="absolute inset-0 overflow-hidden">
                <div
                  className="absolute inset-0 animate-shimmer"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(124, 58, 237, 0.1), transparent)'
                  }}
                />
              </div>

              {/* Content */}
              <div className="relative flex flex-col items-center text-center">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
                  style={{ backgroundColor: '#EDE9FE' }}
                >
                  <Sparkles className="w-5 h-5 animate-pulse" style={{ color: '#4A1A6B' }} />
                </div>
                <p className="text-sm font-medium" style={{ color: '#4A1A6B' }}>
                  Designing {currentScreenName}
                </p>
                {totalScreens && totalScreens > 1 && (
                  <p className="text-xs mt-1" style={{ color: '#6B7280' }}>
                    Screen {currentScreenIndex} of {totalScreens}
                  </p>
                )}

                {/* Bouncing dots */}
                <div className="flex gap-1 mt-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ backgroundColor: '#4A1A6B', animationDelay: `${i * 150}ms` }}
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
                className="w-full py-3 px-6 rounded-full text-sm font-semibold transition-all flex items-center justify-center gap-2"
                style={{ backgroundColor: '#4A1A6B', color: 'white' }}
              >
                <Globe className="w-4 h-4" />
                Build Prototype
              </button>
            ) : onDeployLive ? (
              <button
                disabled
                title="Add Vercel token in Settings"
                className="w-full py-3 px-6 rounded-full text-sm font-semibold cursor-not-allowed flex items-center justify-center gap-2"
                style={{ backgroundColor: '#E5E7EB', color: '#9CA3AF' }}
              >
                <Globe className="w-4 h-4" />
                Build Prototype
              </button>
            ) : null}
            {onDeployLive && !hasVercelToken && (
              <p className="text-xs text-center" style={{ color: '#6B7280' }}>
                Add Vercel token in Settings to deploy
              </p>
            )}
            <button
              onClick={onDone}
              className="w-full py-3 px-6 rounded-full text-sm font-semibold transition-all border-2"
              style={{
                backgroundColor: '#FEF3C7',
                borderColor: '#FEF3C7',
                color: '#4A1A6B'
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

