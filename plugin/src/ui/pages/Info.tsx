import React from "react";

const EDGE_CASE_CATEGORIES = [
  {
    name: "Empty States",
    description: "Missing zero-data or first-use states for lists, tables, dashboards",
  },
  {
    name: "Loading States",
    description: "Missing skeleton screens, spinners, or progress indicators",
  },
  {
    name: "Error States",
    description: "Missing form validation, submission errors, or API error handling",
  },
  {
    name: "Edge Inputs",
    description: "Missing handling for long text, special characters, unusual formats",
  },
  {
    name: "Boundary Conditions",
    description: "Missing min/max/overflow states for counters, pagination, limits",
  },
  {
    name: "Permissions",
    description: "Missing unauthorized, forbidden, or disabled states",
  },
  {
    name: "Connectivity",
    description: "Missing offline, network error, or retry states",
  },
  {
    name: "Destructive Actions",
    description: "Missing confirmation dialogs or undo options for delete/remove",
  },
];

export function Info() {
  return (
    <div className="flex flex-col gap-4 px-4 py-7">
      <p className="text-sm text-muted-foreground">
        Edgy analyzes your UI designs for missing edge cases, helping you catch issues before development.
      </p>

      {/* Edge case categories */}
      <div className="flex flex-col gap-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          What We Check For
        </div>
        <div className="flex flex-col gap-2">
          {EDGE_CASE_CATEGORIES.map((category) => (
            <div key={category.name} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary font-medium">
                  {category.name}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {category.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-muted-foreground pt-4">
        <p>
          Edgy uses pattern detection to identify UI components and check for expected states.
          Enable AI review in Settings for improved accuracy.
        </p>
      </div>
    </div>
  );
}
