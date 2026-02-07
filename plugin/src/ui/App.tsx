declare const __APP_VERSION__: string;

import React, { useState, useEffect } from "react";
import { SelectScreens } from "./pages/SelectScreens";
import { Analyzing } from "./pages/Analyzing";
import { Results } from "./pages/Results";
import { ApiKeySettings } from "./components/ApiKeySettings";
import { Info } from "./pages/Info";
import type {
  PluginMessage,
  UIMessage,
  AnalysisInput,
  AnalysisOutput,
} from "./lib/types";
import { runAnalysis } from "./lib/analyze";
import { getApiKey } from "./lib/api-key-store";
import { reviewWithLLM } from "./lib/llm-reviewer";
import { Settings, Info as InfoIcon } from "lucide-react";

type Page = "select" | "analyzing" | "results" | "settings" | "info";

export function App() {
  const [page, setPage] = useState<Page>("select");
  const [previousPage, setPreviousPage] = useState<Page>("select");
  const [screens, setScreens] = useState<{ id: string; name: string }[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState("");
  const [results, setResults] = useState<AnalysisOutput | null>(null);
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

        case "error":
          setError(msg.message);
          setPage("select");
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  async function handleExtractionComplete(data: AnalysisInput) {
    try {
      setStatusMessage("Analyzing edge cases...");
      const heuristicOutput = runAnalysis(data);

      // Check if API key is configured for LLM review
      const apiKey = await getApiKey();

      if (apiKey) {
        setStatusMessage("Reviewing with AI...");
        const llmResult = await reviewWithLLM(
          heuristicOutput,
          data,
          apiKey,
          (msg) => setStatusMessage(msg)
        );

        const output: AnalysisOutput = {
          ...llmResult.output,
          llm_enhanced: llmResult.wasEnhanced,
          llm_error: llmResult.error,
        };

        setResults(output);
      } else {
        setResults(heuristicOutput);
      }

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

  function handleOpenSettings() {
    setPreviousPage(page);
    setPage("settings");
  }

  function handleOpenInfo() {
    setPreviousPage(page);
    setPage("info");
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
          onClick={handleOpenSettings}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
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
          <ApiKeySettings
            onBack={() => setPage(previousPage)}
          />
        )}
        {page === "info" && (
          <Info
            onBack={() => setPage(previousPage)}
          />
        )}
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between px-4 py-2 border-t">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
            v {__APP_VERSION__}
          </span>
          <span className="text-[10px] text-muted-foreground">
            Made by Team Edgy with &lt;3
          </span>
        </div>
        <button
          onClick={handleOpenInfo}
          className="p-1.5 rounded-full border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Info"
        >
          <InfoIcon className="w-3.5 h-3.5" />
        </button>
      </footer>
    </div>
  );
}

function postToPlugin(msg: UIMessage) {
  parent.postMessage({ pluginMessage: msg }, "*");
}
