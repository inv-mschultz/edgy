import React from "react";

interface Props {
  statusMessage: string;
  progress: { current: number; total: number };
}

export function Analyzing({ statusMessage, progress }: Props) {
  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-8 h-full min-h-[300px]">
      {/* Spinner */}
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div
          className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"
        />
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium">{statusMessage}</p>

        {progress.total > 0 && (
          <div className="w-48">
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {progress.current} / {progress.total}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
