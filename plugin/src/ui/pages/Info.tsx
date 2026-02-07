import React from "react";

export function Info({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Back
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold">About Edgy</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Information coming soon.
        </p>
      </div>
    </div>
  );
}
