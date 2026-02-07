import React, { useState } from "react";
import type { PluginSettings } from "../lib/types";

interface Props {
  initialSettings: PluginSettings | null;
  onSave: (settings: PluginSettings) => void;
}

export function Settings({ initialSettings, onSave }: Props) {
  const [pat, setPat] = useState(initialSettings?.github_pat || "");
  const [repo, setRepo] = useState(initialSettings?.github_repo || "");

  function handleSave() {
    if (!pat.trim() || !repo.trim()) return;
    onSave({ github_pat: pat.trim(), github_repo: repo.trim() });
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure the GitHub connection for the analysis backend.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">GitHub Personal Access Token</label>
          <input
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxx"
            className="w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Needs <code>repo</code> scope. Shared across your team.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium">Repository</label>
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="org/edgy"
            className="w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            The GitHub repo where the analysis engine runs.
          </p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!pat.trim() || !repo.trim()}
        className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Save Settings
      </button>
    </div>
  );
}
