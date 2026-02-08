declare const __APP_VERSION__: string;

import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { useCustomScrollbar } from "./hooks/useCustomScrollbar";
import { Settings, Info as InfoIcon, X } from "lucide-react";

type Page = "select" | "analyzing" | "results" | "settings" | "info";

export function App() {
  const [page, setPage] = useState<Page>("select");
  const [previousPage, setPreviousPage] = useState<Page>("select");
  const [screens, setScreens] = useState<{ id: string; name: string }[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState("");
  const [results, setResults] = useState<AnalysisOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Custom scrollbar - pass page as dependency to recalculate on navigation
  const scrollRef = useRef<HTMLDivElement>(null);
  const customScrollbar = useCustomScrollbar(scrollRef, page);

  // Resize handling
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = window.innerWidth;
    const startHeight = window.innerHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const newWidth = startWidth + deltaX;
      const newHeight = startHeight + deltaY;
      postToPlugin({ type: "resize", width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

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
          setStatusMessage("Done! Findings exported to canvas.");
          break;

        case "error":
          setError(msg.message);
          if (page === "analyzing") setPage("select");
          break;

        case "findings-cleared":
          setResults(null);
          setPage("select");
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [page]);

  async function handleExtractionComplete(data: AnalysisInput) {
    try {
      setStatusMessage("Analyzing edge cases...");
      const heuristicOutput = runAnalysis(data);

      // Check if API key is configured for LLM review
      const apiKey = await getApiKey();
      console.log("[edgy] API key retrieved:", apiKey ? `${apiKey.slice(0, 10)}...` : "null");

      let output: AnalysisOutput;

      if (apiKey) {
        setStatusMessage("Reviewing with AI...");
        const llmResult = await reviewWithLLM(
          heuristicOutput,
          data,
          apiKey,
          (msg) => setStatusMessage(msg)
        );

        output = {
          ...llmResult.output,
          llm_enhanced: llmResult.wasEnhanced,
          llm_error: llmResult.error,
        };
      } else {
        output = heuristicOutput;
      }

      setResults(output);
      setPage("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setPage("select");
    }
  }

  function handleAnalyze() {
    setError(null);
    setResults(null);
    setPage("analyzing");
    setStatusMessage("Extracting screens...");
    postToPlugin({ type: "start-extraction" });
  }

  function handleExportToCanvas(includePlaceholders: boolean = false) {
    if (!results) return;
    setStatusMessage("Exporting findings to canvas...");
    postToPlugin({ type: "save-findings", results, includePlaceholders });
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
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Navigation */}
      <nav className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b bg-background">
        {page === "settings" ? (
          <>
            <span className="text-sm font-semibold">Settings</span>
            <button
              onClick={() => setPage("select")}
              type="button"
              className="p-1.5 rounded border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              style={{ borderRadius: 4 }}
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : page === "info" ? (
          <>
            <span className="text-sm font-semibold">About Edgy</span>
            <button
              onClick={() => setPage("select")}
              type="button"
              className="p-1.5 rounded border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              style={{ borderRadius: 4 }}
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-primary">EDGY</span>
              <span className="text-xs text-muted-foreground">Find missing edge cases</span>
            </div>
            <button
              onClick={handleOpenSettings}
              type="button"
              className="p-1.5 rounded border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              style={{ borderRadius: 4 }}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </>
        )}
      </nav>

      {/* Error banner */}
      {error && (
        <div className="flex-shrink-0 px-4 py-2 bg-destructive/10 text-destructive text-xs">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Scrollable content area with custom scrollbar */}
      <div className="custom-scroll-container" style={{ flex: 1, minHeight: 0 }}>
        <div ref={scrollRef} className="custom-scroll-content">
          {page === "select" && (
            <SelectScreens screens={screens} />
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
              onExportToCanvas={handleExportToCanvas}
              onStartOver={() => {
                setResults(null);
                setPage("select");
              }}
            />
          )}
          {page === "settings" && <ApiKeySettings />}
          {page === "info" && <Info />}
        </div>

        {customScrollbar.showScrollbar && (
          <div
            className={`custom-scrollbar-track ${customScrollbar.isDragging ? "dragging" : ""}`}
            onClick={customScrollbar.handleTrackClick as any}
          >
            <div
              className={`custom-scrollbar-thumb ${customScrollbar.isDragging ? "dragging" : ""}`}
              style={{
                height: `${customScrollbar.thumbHeight}px`,
                top: `${customScrollbar.thumbTop}px`,
              }}
              onMouseDown={customScrollbar.handleThumbMouseDown as any}
            />
          </div>
        )}
      </div>

      {/* Sticky analyze button - only on select page */}
      {page === "select" && (
        <div className="flex-shrink-0 p-4 pt-2 border-t bg-background">
          <button
            onClick={handleAnalyze}
            disabled={screens.length === 0}
            className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Analyze {screens.length} Screen{screens.length !== 1 ? "s" : ""}
          </button>
        </div>
      )}

      {/* Footer - sticky at bottom */}
      <footer className="flex-shrink-0 relative flex items-center justify-between px-4 py-2 border-t bg-background">
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
          className="p-1.5 border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          style={{ borderRadius: 4 }}
          title="Info"
        >
          <InfoIcon className="w-3.5 h-3.5" />
        </button>

        {/* Resize handle */}
        <div
          className="resize-handle"
          title="Resize"
          onMouseDown={handleResizeMouseDown}
        >
          <svg viewBox="0 0 10 10" fill="currentColor" className="text-muted-foreground">
            <path d="M0 10L10 0V10H0Z" />
          </svg>
        </div>
      </footer>
    </div>
  );
}

function postToPlugin(msg: UIMessage) {
  parent.postMessage({ pluginMessage: msg }, "*");
}
