import React from "react";
import { Check, Sparkles, Cog } from "lucide-react";

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
  isComplete: boolean;
  /** Whether AI is being used for screen generation */
  isAIGeneration?: boolean;
}

export function Exporting({
  steps,
  currentScreenName,
  currentScreenIndex,
  totalScreens,
  onDone,
  isComplete,
  isAIGeneration = true,
}: ExportingProps) {
  const generationStep = steps.find((s) => s.id === "ai-generation");
  const isGenerating = generationStep?.status === "in-progress";

  // Calculate progress percentage
  const completedSteps = steps.filter((s) => s.status === "complete").length;
  const inProgressSteps = steps.filter((s) => s.status === "in-progress").length;
  const progress = ((completedSteps + inProgressSteps * 0.5) / steps.length) * 100;

  // Content section (title, progress, steps, generation card)
  const content = (
    <>
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

      {/* Screen Generation card */}
      {isGenerating && (
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
                {isAIGeneration ? (
                  <Sparkles className="w-5 h-5 animate-pulse" style={{ color: '#4A1A6B' }} />
                ) : (
                  <Cog className="w-5 h-5 animate-spin" style={{ color: '#4A1A6B', animationDuration: '3s' }} />
                )}
              </div>
              <p className="text-sm font-medium" style={{ color: '#4A1A6B' }}>
                {isAIGeneration ? 'Designing' : 'Creating'} {currentScreenName || 'screens'}
              </p>
              {totalScreens && totalScreens > 1 && (
                <p className="text-xs mt-1" style={{ color: '#6B7280' }}>
                  Screen {currentScreenIndex || 1} of {totalScreens}
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
    </>
  );

  // Buttons section
  const buttons = (
    <div className="flex flex-col gap-2 animate-fade-in">
      <button
        onClick={onDone}
        className="w-full py-3 px-6 rounded-full text-sm font-semibold transition-all"
        style={{ backgroundColor: '#4A1A6B', color: 'white' }}
      >
        Done
      </button>
    </div>
  );

  // When complete: full height layout with content centered and buttons at bottom
  if (isComplete) {
    return (
      <div className="flex flex-col items-center px-6 py-8 h-full">
        <div className="w-full max-w-sm flex flex-col h-full">
          {/* Content centered vertically */}
          <div className="flex-1 flex flex-col justify-center">
            {content}
          </div>
          {/* Buttons at bottom */}
          <div className="pt-6">
            {buttons}
          </div>
        </div>
      </div>
    );
  }

  // When not complete: normal layout
  return (
    <div className="flex flex-col items-center px-6 py-8">
      <div className="w-full max-w-sm">
        {content}
      </div>
    </div>
  );
}
