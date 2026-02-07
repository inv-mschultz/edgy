import React, { useState, useEffect } from "react";
import { SelectScreens } from "./pages/SelectScreens";
import { Analyzing } from "./pages/Analyzing";
import { Results } from "./pages/Results";
import { Settings } from "./pages/Settings";
import type {
  PluginMessage,
  UIMessage,
  AnalysisInput,
  AnalysisOutput,
  PluginSettings,
} from "./lib/types";
import { submitAnalysis, pollForResults } from "./lib/github";

type Page = "select" | "analyzing" | "results" | "settings";

export function App() {
  const [page, setPage] = useState<Page>("select");
  const [screens, setScreens] = useState<{ id: string; name: string }[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState("");
  const [results, setResults] = useState<AnalysisOutput | null>(null);
  const [settings, setSettings] = useState<PluginSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Listen for messages from plugin sandbox
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage as PluginMessage;
      if (!msg) return;

      switch (msg.type) {
        case "selection-changed":
          setScreens(msg.screens);
          break;

        case "thumbnail-progress":
          setProgress({ current: msg.current, total: msg.total });
          setStatusMessage(`Extracting screen ${msg.current}/${msg.total}...`);
          break;

        case "extraction-complete":
          handleExtractionComplete(msg.data);
          break;

        case "render-complete":
          setStatusMessage("Done! Findings are on your canvas.");
          break;

        case "settings-loaded":
          setSettings(msg.settings);
          break;

        case "error":
          setError(msg.message);
          setPage("select");
          break;
      }
    };

    window.addEventListener("message", handler);

    // Load settings on mount
    postToPlugin({ type: "load-settings" });

    return () => window.removeEventListener("message", handler);
  }, []);

  async function handleExtractionComplete(data: AnalysisInput) {
    if (!settings?.github_pat || !settings?.github_repo) {
      setError("Please configure GitHub settings first.");
      setPage("settings");
      return;
    }

    try {
      setStatusMessage("Uploading to GitHub...");
      await submitAnalysis(data, settings);

      setStatusMessage("Analysis running... Waiting for results.");
      const output = await pollForResults(data.analysis_id, settings);

      setResults(output);
      setPage("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setPage("select");
    }
  }

  function handleAnalyze() {
    setError(null);
    setPage("analyzing");
    setStatusMessage("Extracting screens...");
    postToPlugin({ type: "start-extraction" });
  }

  function handleRenderResults() {
    if (!results) return;
    setStatusMessage("Rendering findings on canvas...");
    postToPlugin({ type: "render-results", results });
  }

  function handleSaveSettings(newSettings: PluginSettings) {
    setSettings(newSettings);
    postToPlugin({ type: "save-settings", settings: newSettings });
    setPage("select");
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-primary">EDGY</span>
          <span className="text-xs text-muted-foreground">Edge Case Analyzer</span>
        </div>
        <button
          onClick={() => setPage(page === "settings" ? "select" : "settings")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {page === "settings" ? "Back" : "Settings"}
        </button>
      </nav>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-xs">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Pages */}
      <div className="flex-1 overflow-auto">
        {page === "select" && (
          <SelectScreens
            screens={screens}
            onAnalyze={handleAnalyze}
            hasSettings={!!settings?.github_pat}
            onOpenSettings={() => setPage("settings")}
          />
        )}
        {page === "analyzing" && (
          <Analyzing
            statusMessage={statusMessage}
            progress={progress}
          />
        )}
        {page === "results" && results && (
          <Results
            results={results}
            onRenderToCanvas={handleRenderResults}
            onStartOver={() => {
              setResults(null);
              setPage("select");
            }}
          />
        )}
        {page === "settings" && (
          <Settings
            initialSettings={settings}
            onSave={handleSaveSettings}
          />
        )}
      </div>
    </div>
  );
}

function postToPlugin(msg: UIMessage) {
  parent.postMessage({ pluginMessage: msg }, "*");
}
