declare const __APP_VERSION__: string;

import React, { useState, useEffect, useRef, useCallback } from "react";
import { SelectScreens } from "./pages/SelectScreens";
import { Analyzing, type AnalysisStep } from "./pages/Analyzing";
import { Results } from "./pages/Results";
import { Exporting, type ExportStep } from "./pages/Exporting";
import { ApiKeySettings } from "./components/ApiKeySettings";
import { Info } from "./pages/Info";
import type {
  PluginMessage,
  UIMessage,
  AnalysisInput,
  AnalysisOutput,
  PrototypeFile,
  PrototypeExportRequest,
} from "./lib/types";
import { runAnalysis } from "./lib/analyze";
import { getApiKey, getProvider, getAIScreenGeneration, getVercelToken } from "./lib/api-key-store";
import { reviewWithLLM } from "./lib/llm-reviewer";
import { generateScreensBatch, analyzeExistingScreens, type GeneratedScreenLayout, type ScreenGenerationRequest } from "./lib/llm-screen-generator";
import { getComponentLibrary, type ComponentLibraryData } from "./lib/component-library-client";
import { deployToVercel, type DeployResult } from "./lib/vercel-deploy";
import type { DesignTokens } from "./lib/llm-screen-generator";

// Helper to get design tokens from plugin
function getDesignTokens(screenIds: string[]): Promise<DesignTokens> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "design-tokens-result") {
        window.removeEventListener("message", handler);
        resolve(msg.tokens);
      }
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "get-design-tokens", screenIds } }, "*");
  });
}
import { useCustomScrollbar } from "./hooks/useCustomScrollbar";
import { Settings, Info as InfoIcon, X, ExternalLink, Copy, Check } from "lucide-react";

type Page = "select" | "analyzing" | "results" | "exporting" | "exporting-prototype" | "deploying-vercel" | "settings" | "info";

export function App() {
  const [page, setPage] = useState<Page>("select");
  const [previousPage, setPreviousPage] = useState<Page>("select");
  const [screens, setScreens] = useState<{ id: string; name: string }[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState("");
  const [results, setResults] = useState<AnalysisOutput | null>(null);
  const [extractionData, setExtractionData] = useState<AnalysisInput | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Analysis steps state
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>([]);

  // Exporting state
  const [exportSteps, setExportSteps] = useState<ExportStep[]>([]);
  const [currentScreenName, setCurrentScreenName] = useState<string>();
  const [currentScreenIndex, setCurrentScreenIndex] = useState<number>();
  const [totalScreensToGenerate, setTotalScreensToGenerate] = useState<number>();
  const [exportComplete, setExportComplete] = useState(false);
  // Store generated layouts from export to reuse for prototype/deploy
  const [exportedLayouts, setExportedLayouts] = useState<Record<string, GeneratedScreenLayout>>({});
  const [exportIncludedPlaceholders, setExportIncludedPlaceholders] = useState(false);

  // Prototype export state
  const [prototypeFiles, setPrototypeFiles] = useState<PrototypeFile[]>([]);
  const [prototypeExportStatus, setPrototypeExportStatus] = useState<string>("");
  const [prototypeExportComplete, setPrototypeExportComplete] = useState(false);

  // Vercel deployment state
  const [vercelToken, setVercelToken] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<string>("");
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);

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

  // Load Vercel token on mount
  useEffect(() => {
    getVercelToken().then(setVercelToken);
  }, []);

  // Reload Vercel token when returning from settings
  useEffect(() => {
    if (page === "results") {
      getVercelToken().then(setVercelToken);
    }
  }, [page]);

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

        case "prototype-progress":
          setPrototypeExportStatus(msg.message);
          break;

        case "prototype-ready":
          setPrototypeFiles(msg.files);
          setPrototypeExportComplete(true);
          setPrototypeExportStatus("Prototype ready!");
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [page]);

  async function handleExtractionComplete(data: AnalysisInput) {
    // Helper to update step status
    const updateStep = (id: string, status: AnalysisStep["status"]) => {
      setAnalysisSteps((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status } : s))
      );
    };

    try {
      // Store extraction data for later use (thumbnails needed for AI generation)
      setExtractionData(data);

      // Mark extraction complete, start patterns
      updateStep("extract", "complete");
      updateStep("patterns", "in-progress");

      setStatusMessage("Detecting UI patterns...");
      await new Promise((r) => setTimeout(r, 100)); // Allow UI to update

      // Mark patterns complete, start states check
      updateStep("patterns", "complete");
      updateStep("states", "in-progress");

      setStatusMessage("Checking for missing states...");
      await new Promise((r) => setTimeout(r, 100));

      // Mark states complete, start inputs check
      updateStep("states", "complete");
      updateStep("inputs", "in-progress");

      setStatusMessage("Checking edge inputs...");
      const heuristicOutput = runAnalysis(data);

      // Mark inputs complete, start recommendations
      updateStep("inputs", "complete");
      updateStep("recommendations", "in-progress");

      // Check if API key is configured for LLM review
      const [apiKey, provider] = await Promise.all([getApiKey(), getProvider()]);
      console.log("[edgy] API key retrieved:", apiKey ? `${apiKey.slice(0, 10)}...` : "null", "provider:", provider);

      let output: AnalysisOutput;

      if (apiKey) {
        const providerName = provider === "gemini" ? "Gemini" : "Claude";
        setStatusMessage(`Reviewing with ${providerName}...`);

        // Add AI review step
        setAnalysisSteps((prev) => [
          ...prev.map((s) => (s.id === "recommendations" ? { ...s, status: "complete" as const } : s)),
          { id: "ai-review", label: `Reviewing with ${providerName}`, status: "in-progress" as const },
        ]);

        const llmResult = await reviewWithLLM(
          heuristicOutput,
          data,
          apiKey,
          provider,
          (msg) => setStatusMessage(msg)
        );

        // Mark AI review complete
        updateStep("ai-review", "complete");

        console.log("[edgy] LLM review returned, wasEnhanced:", llmResult.wasEnhanced);
        output = {
          ...llmResult.output,
          llm_enhanced: llmResult.wasEnhanced,
          llm_error: llmResult.error,
        };
      } else {
        updateStep("recommendations", "complete");
        output = heuristicOutput;
      }

      console.log("[edgy] Setting results...");
      setResults(output);
      console.log("[edgy] Setting page to results...");
      setPage("results");
      console.log("[edgy] Done!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setPage("select");
    }
  }

  function handleAnalyze() {
    setError(null);
    setResults(null);

    // Initialize analysis steps
    const initialSteps: AnalysisStep[] = [
      { id: "extract", label: `Extracting ${screens.length} frame${screens.length !== 1 ? "s" : ""}`, status: "in-progress" },
      { id: "patterns", label: "Detecting UI patterns", status: "pending" },
      { id: "states", label: "Checking for missing states", status: "pending" },
      { id: "inputs", label: "Checking edge inputs & permissions", status: "pending" },
      { id: "recommendations", label: "Generating recommendations", status: "pending" },
    ];
    setAnalysisSteps(initialSteps);

    setPage("analyzing");
    setStatusMessage("Extracting screens...");
    postToPlugin({ type: "start-extraction" });
  }

  async function handleExportToCanvas(includePlaceholders: boolean = false) {
    if (!results) return;

    // Reset export state
    setExportComplete(false);
    setCurrentScreenName(undefined);
    setCurrentScreenIndex(undefined);
    setTotalScreensToGenerate(undefined);

    // Check if we should use AI for screen generation
    const missingScreens = results.missing_screen_findings || [];
    const [apiKey, provider, useAIGeneration] = await Promise.all([
      getApiKey(),
      getProvider(),
      getAIScreenGeneration(),
    ]);

    const willGenerateWithAI = includePlaceholders && missingScreens.length > 0 && apiKey && useAIGeneration && extractionData;

    // Build initial steps
    const steps: ExportStep[] = [
      {
        id: "health-indicators",
        label: "Adding health indicators",
        status: "pending",
      },
      {
        id: "report",
        label: "Creating findings report",
        status: "pending",
      },
    ];

    if (includePlaceholders && missingScreens.length > 0) {
      steps.push({
        id: "ai-generation",
        label: willGenerateWithAI
          ? `Designing ${missingScreens.length} missing screen${missingScreens.length !== 1 ? "s" : ""} with AI`
          : `Creating ${missingScreens.length} placeholder screen${missingScreens.length !== 1 ? "s" : ""}`,
        status: "pending",
      });
    }

    setExportSteps(steps);
    setPage("exporting");

    // Helper to update step status
    const updateStep = (id: string, status: ExportStep["status"], detail?: string) => {
      setExportSteps((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status, detail } : s))
      );
    };

    try {
      // Step 1 & 2: Export health indicators and report (without placeholders first)
      updateStep("health-indicators", "in-progress");

      // Send save-findings without placeholders first to get immediate visual feedback
      postToPlugin({
        type: "save-findings",
        results,
        includePlaceholders: false,
      });

      // Wait for render-complete
      await new Promise<void>((resolve) => {
        const handler = (event: MessageEvent) => {
          const msg = event.data.pluginMessage as PluginMessage;
          if (msg?.type === "render-complete") {
            window.removeEventListener("message", handler);
            resolve();
          }
        };
        window.addEventListener("message", handler);
      });

      updateStep("health-indicators", "complete");
      updateStep("report", "complete");

      // Step 3: Generate missing screens if requested
      if (includePlaceholders && missingScreens.length > 0) {
        updateStep("ai-generation", "in-progress");

        let generatedLayouts: Record<string, GeneratedScreenLayout> | undefined;

        if (willGenerateWithAI && extractionData) {
          generatedLayouts = {};
          setTotalScreensToGenerate(missingScreens.length);

          // Fetch design tokens from actual Figma screens
          const screenIds = extractionData.screens.map((s) => s.screen_id);
          const designTokens = await getDesignTokens(screenIds);
          console.log(`[edgy] Extracted design tokens:`, designTokens);

          // Fetch available components from the Figma file
          let componentLibrary: ComponentLibraryData | undefined;
          try {
            componentLibrary = await getComponentLibrary();
            console.log(`[edgy] Found ${componentLibrary.stats.total} components in design system`);
          } catch (e) {
            console.warn("[edgy] Failed to fetch component library:", e);
          }

          // Get reference thumbnails from all screens for better context
          const thumbnails = extractionData.screens
            .filter((s) => s.thumbnail_base64)
            .map((s) => s.thumbnail_base64!);

          // Analyze existing screens for patterns (components, layouts, text styles)
          const screenAnalysis = analyzeExistingScreens(extractionData.screens);
          console.log(`[edgy] Screen analysis:`, screenAnalysis);

          // Build all generation requests with extracted design tokens and screen analysis
          const requests: ScreenGenerationRequest[] = missingScreens.map((finding) => ({
            missingScreen: finding,
            designTokens,
            referenceScreenshots: thumbnails,
            flowContext: {
              flowType: finding.flow_type,
              existingScreenNames: extractionData.screens.map((s) => s.name),
              suggestedComponents: finding.recommendation.components,
            },
            // Pass available components for LLM to reference
            availableComponents: componentLibrary ? {
              serialized: componentLibrary.serialized,
              componentKeys: componentLibrary.componentKeys,
            } : undefined,
            // Pass screen analysis for pattern matching
            screenAnalysis,
          }));

          // Generate all screens in parallel batches (3-5x faster)
          const batchResults = await generateScreensBatch(
            requests,
            apiKey!,
            provider,
            (completed, total, currentName) => {
              setCurrentScreenIndex(completed);
              setCurrentScreenName(currentName);
            }
          );

          // Collect successful layouts
          for (const finding of missingScreens) {
            const result = batchResults.get(finding.missing_screen.id);
            if (result?.layout) {
              generatedLayouts[finding.id] = result.layout;
            }
          }
        }

        // Now send the placeholders to canvas
        postToPlugin({
          type: "save-findings",
          results,
          includePlaceholders: true,
          generatedLayouts,
        });

        // Wait for render-complete
        await new Promise<void>((resolve) => {
          const handler = (event: MessageEvent) => {
            const msg = event.data.pluginMessage as PluginMessage;
            if (msg?.type === "render-complete") {
              window.removeEventListener("message", handler);
              resolve();
            }
          };
          window.addEventListener("message", handler);
        });

        updateStep("ai-generation", "complete");
        setCurrentScreenName(undefined);

        // Store generated layouts for reuse in prototype/deploy
        setExportedLayouts(generatedLayouts || {});
      }

      // Store export settings for prototype/deploy
      setExportIncludedPlaceholders(includePlaceholders);
      setExportComplete(true);
    } catch (err) {
      console.error("[edgy] Export failed:", err);
      setError(err instanceof Error ? err.message : "Export failed");
      setPage("results");
    }
  }

  async function handleExportPrototype(_includeGenerated: boolean = true) {
    if (!results || !extractionData) return;

    // Reset prototype export state
    setPrototypeFiles([]);
    setPrototypeExportComplete(false);
    setPrototypeExportStatus("Generating prototype files...");
    setPage("exporting-prototype");

    try {
      const missingScreens = results.missing_screen_findings || [];

      // Reuse layouts from the export step - no need to regenerate
      const request: PrototypeExportRequest = {
        existingScreens: extractionData.screens,
        generatedLayouts: exportedLayouts,
        missingFindings: exportIncludedPlaceholders ? missingScreens : [],
        designTokens: {
          primaryColor: { r: 0.09, g: 0.09, b: 0.09 },
          backgroundColor: { r: 1, g: 1, b: 1 },
          textColor: { r: 0.09, g: 0.09, b: 0.09 },
          mutedColor: { r: 0.45, g: 0.45, b: 0.45 },
          borderColor: { r: 0.9, g: 0.9, b: 0.9 },
          borderRadius: 8,
          fontFamily: "Inter",
          baseFontSize: 14,
          headingFontSize: 24,
        },
        options: {
          includeNavigation: true,
          imageBasedFallback: true,
          projectName: extractionData.file_name || "prototype",
        },
      };

      // Send to plugin for processing
      postToPlugin({ type: "export-prototype", request });

    } catch (err) {
      console.error("[edgy] Prototype export failed:", err);
      setError(err instanceof Error ? err.message : "Prototype export failed");
      setPage("results");
    }
  }

  function handleDownloadPrototype() {
    if (prototypeFiles.length === 0) return;

    // Download the main index.html
    const mainHtml = prototypeFiles.find((f) => f.path === "index.html")?.content || "";
    const blob = new Blob([mainHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prototype-index.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Also download as a JSON bundle for full prototype
    const bundleJson = JSON.stringify(prototypeFiles, null, 2);
    const bundleBlob = new Blob([bundleJson], { type: "application/json" });
    const bundleUrl = URL.createObjectURL(bundleBlob);
    const bundleA = document.createElement("a");
    bundleA.href = bundleUrl;
    bundleA.download = "prototype-bundle.json";
    document.body.appendChild(bundleA);
    bundleA.click();
    document.body.removeChild(bundleA);
    URL.revokeObjectURL(bundleUrl);
  }

  async function handleDeployToVercel(_includeGenerated: boolean = true) {
    if (!results || !extractionData || !vercelToken) return;

    // Reset deployment state
    setDeployResult(null);
    setDeployStatus("Generating prototype files...");
    setPage("deploying-vercel");

    try {
      const missingScreens = results.missing_screen_findings || [];

      // Reuse layouts from the export step - no need to regenerate
      const request: PrototypeExportRequest = {
        existingScreens: extractionData.screens,
        generatedLayouts: exportedLayouts,
        missingFindings: exportIncludedPlaceholders ? missingScreens : [],
        designTokens: {
          primaryColor: { r: 0.09, g: 0.09, b: 0.09 },
          backgroundColor: { r: 1, g: 1, b: 1 },
          textColor: { r: 0.09, g: 0.09, b: 0.09 },
          mutedColor: { r: 0.45, g: 0.45, b: 0.45 },
          borderColor: { r: 0.9, g: 0.9, b: 0.9 },
          borderRadius: 8,
          fontFamily: "Inter",
          baseFontSize: 14,
          headingFontSize: 24,
        },
        options: {
          includeNavigation: true,
          imageBasedFallback: true,
          projectName: extractionData.file_name || "prototype",
        },
      };

      // Wait for prototype files from plugin
      const files = await new Promise<PrototypeFile[]>((resolve, reject) => {
        const handler = (event: MessageEvent) => {
          const msg = event.data.pluginMessage as PluginMessage;
          if (msg?.type === "prototype-ready") {
            window.removeEventListener("message", handler);
            resolve(msg.files);
          } else if (msg?.type === "error") {
            window.removeEventListener("message", handler);
            reject(new Error(msg.message));
          }
        };
        window.addEventListener("message", handler);
        postToPlugin({ type: "export-prototype", request });
      });

      setDeployStatus("Deploying to Vercel...");

      // Deploy to Vercel
      const result = await deployToVercel(
        files,
        vercelToken,
        extractionData.file_name || "prototype",
        (message) => setDeployStatus(message)
      );

      setDeployResult(result);

    } catch (err) {
      console.error("[edgy] Vercel deployment failed:", err);
      setDeployResult({
        success: false,
        error: err instanceof Error ? err.message : "Deployment failed",
      });
    }
  }

  function handleCopyUrl() {
    if (deployResult?.url) {
      navigator.clipboard.writeText(deployResult.url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    }
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
              steps={analysisSteps}
              screenCount={screens.length}
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
          {page === "exporting" && (
            <Exporting
              steps={exportSteps}
              currentScreenName={currentScreenName}
              currentScreenIndex={currentScreenIndex}
              totalScreens={totalScreensToGenerate}
              isComplete={exportComplete}
              hasVercelToken={!!vercelToken}
              onDone={() => {
                setResults(null);
                setPage("select");
              }}
              onDownloadPrototype={() => handleExportPrototype(true)}
              onDeployLive={() => handleDeployToVercel(true)}
            />
          )}
          {page === "exporting-prototype" && (
            <div className="flex flex-col items-center justify-center p-8 min-h-[300px]">
              {!prototypeExportComplete ? (
                <>
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-sm text-muted-foreground text-center">
                    {prototypeExportStatus}
                  </p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Prototype Ready!</h3>
                  <p className="text-sm text-muted-foreground text-center mb-4">
                    {prototypeFiles.length} files generated
                  </p>
                  <div className="flex flex-col gap-2 w-full max-w-xs">
                    <button
                      onClick={handleDownloadPrototype}
                      className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                    >
                      Download Prototype
                    </button>
                    <button
                      onClick={() => {
                        setPage("results");
                        setPrototypeExportComplete(false);
                        setPrototypeFiles([]);
                      }}
                      className="w-full py-2.5 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80"
                    >
                      Back to Results
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {page === "deploying-vercel" && (
            <div className="flex flex-col items-center justify-center p-8 min-h-[300px]">
              {!deployResult ? (
                <>
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-sm text-muted-foreground text-center">
                    {deployStatus}
                  </p>
                </>
              ) : deployResult.success ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Deployed!</h3>
                  <p className="text-sm text-muted-foreground text-center mb-4">
                    Your prototype is live
                  </p>
                  <div className="w-full max-w-xs bg-secondary rounded-lg p-3 mb-4">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-primary break-all">
                        {deployResult.url}
                      </code>
                      <button
                        onClick={handleCopyUrl}
                        className="p-1.5 rounded hover:bg-background transition-colors"
                        title="Copy URL"
                      >
                        {urlCopied ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full max-w-xs">
                    <a
                      href={deployResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open Prototype
                    </a>
                    <button
                      onClick={() => {
                        setPage("results");
                        setDeployResult(null);
                      }}
                      className="w-full py-2.5 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80"
                    >
                      Back to Results
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                    <X className="w-6 h-6 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Deployment Failed</h3>
                  <p className="text-sm text-destructive text-center mb-4">
                    {deployResult.error}
                  </p>
                  <div className="flex flex-col gap-2 w-full max-w-xs">
                    <button
                      onClick={() => handleDeployToVercel(true)}
                      className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={() => {
                        setPage("results");
                        setDeployResult(null);
                      }}
                      className="w-full py-2.5 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80"
                    >
                      Back to Results
                    </button>
                  </div>
                </>
              )}
            </div>
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
