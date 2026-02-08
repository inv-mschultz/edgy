import React, { useState, useEffect } from "react";
import { Check } from "lucide-react";

export interface AnalysisStep {
  id: string;
  label: string;
  status: "pending" | "in-progress" | "complete";
}

interface Props {
  steps: AnalysisStep[];
  screenCount?: number;
}

// Fun messages to show while AI is reviewing
const AI_REVIEW_MESSAGES = [
  "Consulting the design gods...",
  "Checking for missing edge cases...",
  "Looking for sneaky bugs...",
  "Analyzing user flows...",
  "Double-checking the details...",
  "Making sure nothing slipped through...",
  "Reviewing with fresh eyes...",
  "Finding opportunities to improve...",
  "Hunting for edge cases...",
  "Thinking really hard...",
];

export function Analyzing({ steps, screenCount }: Props) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Check if AI review step is active
  const aiReviewStep = steps.find((s) => s.id === "ai-review");
  const isAIReviewing = aiReviewStep?.status === "in-progress";

  // Rotate through messages when AI is reviewing
  useEffect(() => {
    if (!isAIReviewing) return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % AI_REVIEW_MESSAGES.length);
        setIsTransitioning(false);
      }, 200);
    }, 2500);

    return () => clearInterval(interval);
  }, [isAIReviewing]);

  // Calculate progress percentage
  const completedSteps = steps.filter((s) => s.status === "complete").length;
  const inProgressSteps = steps.filter((s) => s.status === "in-progress").length;
  const progress = ((completedSteps + inProgressSteps * 0.5) / steps.length) * 100;

  return (
    <div className="flex flex-col items-center px-6 py-8">
      <div className="w-full max-w-sm">
        {/* Title */}
        <h2 className="text-lg font-semibold text-center mb-6" style={{ color: '#4A1A6B' }}>
          Analysing your frames...
        </h2>

        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-200 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #4A1A6B 0%, #6B2D8A 100%)'
            }}
          />
        </div>

        {/* Steps list */}
        <div className="space-y-4">
          {steps.map((step) => (
            <div key={step.id}>
              <div className="flex items-center gap-3 transition-all duration-300">
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
                      : "text-gray-400"
                  }`}
                  style={{
                    color: step.status === "pending" ? '#9CA3AF' : '#4A1A6B'
                  }}
                >
                  {step.label}
                  {step.status === "in-progress" && "..."}
                </span>
              </div>

              {/* AI Review sub-messages carousel */}
              {step.id === "ai-review" && step.status === "in-progress" && (
                <div className="ml-9 mt-2 h-20 overflow-hidden">
                  <div className="space-y-1.5">
                    {[0, 1, 2].map((offset) => {
                      const index = (currentMessageIndex + offset) % AI_REVIEW_MESSAGES.length;
                      const isFirst = offset === 0;
                      const isSecond = offset === 1;
                      return (
                        <div
                          key={`${index}-${offset}`}
                          className={`text-xs transition-all duration-200 flex items-center gap-2 ${
                            isTransitioning ? "opacity-0 -translate-y-1" : "opacity-100 translate-y-0"
                          }`}
                          style={{
                            color: isFirst
                              ? '#6B7280'
                              : isSecond
                              ? '#9CA3AF'
                              : '#D1D5DB'
                          }}
                        >
                          <span
                            className="w-1 h-1 rounded-full"
                            style={{
                              backgroundColor: isFirst
                                ? '#4A1A6B'
                                : isSecond
                                ? '#9CA3AF'
                                : '#D1D5DB'
                            }}
                          />
                          {AI_REVIEW_MESSAGES[index]}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

