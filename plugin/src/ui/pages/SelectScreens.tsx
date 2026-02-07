import React from "react";

interface Props {
  screens: { id: string; name: string }[];
  onAnalyze: () => void;
  hasSettings: boolean;
  onOpenSettings: () => void;
}

export function SelectScreens({ screens, onAnalyze, hasSettings, onOpenSettings }: Props) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">Analyze Flow</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select screens on the canvas to analyze for missing edge cases.
        </p>
      </div>

      {/* Selected screens list */}
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Selected Screens ({screens.length})
        </div>

        {screens.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Select one or more frames on the canvas
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {screens.map((screen, i) => (
              <div
                key={screen.id}
                className="flex items-center gap-3 px-3 py-2 rounded-md bg-secondary"
              >
                <span className="text-xs font-mono text-muted-foreground w-5">
                  {i + 1}
                </span>
                <span className="text-sm truncate">{screen.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edge case categories */}
      <div className="flex flex-col gap-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Checking for
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            "Empty States",
            "Loading States",
            "Error States",
            "Edge Inputs",
            "Boundary Conditions",
            "Permissions",
            "Connectivity",
            "Destructive Actions",
          ].map((category) => (
            <span
              key={category}
              className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary font-medium"
            >
              {category}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      {!hasSettings ? (
        <button
          onClick={onOpenSettings}
          className="w-full py-2.5 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80"
        >
          Configure GitHub Settings First
        </button>
      ) : (
        <button
          onClick={onAnalyze}
          disabled={screens.length === 0}
          className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Analyze {screens.length} Screen{screens.length !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
