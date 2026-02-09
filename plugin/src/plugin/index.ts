/// <reference types="@figma/plugin-typings" />

import { extractScreens } from "./extractor";
import {
  renderHealthIndicator,
  generateFindingsReport,
  generatePlaceholderFrames,
  clearAllFindings,
  clearAllCanvasDocumentation,
  findFrameById,
  repositionAllBadges,
  extractDesignTokens,
  type StoredFindingsData,
} from "./health-indicator";
import { extractMultipleFrameContexts } from "./frame-context";
import {
  generatePrototypeBundle,
  generateAllPrototypeFiles,
  generateShadcnPrototype,
} from "./prototype-export";
import {
  discoverComponents,
  createComponentInstance,
  findBestComponent,
  serializeLibraryForLLM,
  type ComponentLibrary,
} from "./component-library";
import type {
  UIMessage,
  PluginMessage,
  AnalysisOutput,
} from "../ui/lib/types";

// Show the plugin UI
figma.showUI(__html__, { width: 400, height: 560, themeColors: true });

// --- Selection Handling ---

function sendSelectionUpdate() {
  const screens = figma.currentPage.selection
    .filter((node): node is FrameNode => node.type === "FRAME")
    .map((node) => ({ id: node.id, name: node.name }));

  const msg: PluginMessage = { type: "selection-changed", screens };
  figma.ui.postMessage(msg);
}

// Listen for selection changes
figma.on("selectionchange", sendSelectionUpdate);

// Send initial selection
sendSelectionUpdate();

// --- Component Library Cache ---

let cachedComponentLibrary: ComponentLibrary | null = null;

async function getComponentLibrary(): Promise<ComponentLibrary> {
  if (!cachedComponentLibrary) {
    cachedComponentLibrary = await discoverComponents();
  }
  return cachedComponentLibrary;
}

// Component discovery is now lazy - only triggered when user requests it
// This avoids blocking plugin startup with figma.loadAllPagesAsync()

// --- Message Handlers ---

figma.ui.onmessage = async (msg: UIMessage) => {
  switch (msg.type) {
    case "start-extraction": {
      try {
        // Get selected frames for context extraction
        const selectedFrames = figma.currentPage.selection
          .filter((node): node is FrameNode => node.type === "FRAME");

        // Extract and store frame context for design token analysis
        if (selectedFrames.length > 0) {
          await extractMultipleFrameContexts(selectedFrames);
        }

        const data = await extractScreens(figma.currentPage.selection, (current, total) => {
          const progressMsg: PluginMessage = {
            type: "thumbnail-progress",
            current,
            total,
          };
          figma.ui.postMessage(progressMsg);
        });

        const completeMsg: PluginMessage = {
          type: "extraction-complete",
          data,
        };
        figma.ui.postMessage(completeMsg);
      } catch (error) {
        const errorMsg: PluginMessage = {
          type: "error",
          message: error instanceof Error ? error.message : "Extraction failed",
        };
        figma.ui.postMessage(errorMsg);
      }
      break;
    }

    case "get-api-key": {
      const key = await figma.clientStorage.getAsync("edgy-anthropic-api-key");
      figma.ui.postMessage({ type: "api-key-result", key: key || null });
      break;
    }

    case "set-api-key": {
      await figma.clientStorage.setAsync("edgy-anthropic-api-key", msg.key);
      figma.ui.postMessage({ type: "api-key-saved" });
      break;
    }

    case "clear-api-key": {
      await figma.clientStorage.deleteAsync("edgy-anthropic-api-key");
      figma.ui.postMessage({ type: "api-key-saved" });
      break;
    }

    case "get-provider": {
      const provider = await figma.clientStorage.getAsync("edgy-ai-provider");
      figma.ui.postMessage({ type: "provider-result", provider: provider || "claude" });
      break;
    }

    case "set-provider": {
      await figma.clientStorage.setAsync("edgy-ai-provider", msg.provider);
      figma.ui.postMessage({ type: "provider-saved" });
      break;
    }

    case "get-ai-screen-gen": {
      const enabled = await figma.clientStorage.getAsync("edgy-ai-screen-gen");
      figma.ui.postMessage({ type: "ai-screen-gen-result", enabled: enabled ?? false });
      break;
    }

    case "set-ai-screen-gen": {
      await figma.clientStorage.setAsync("edgy-ai-screen-gen", msg.enabled);
      figma.ui.postMessage({ type: "ai-screen-gen-saved" });
      break;
    }

    case "get-vercel-token": {
      const token = await figma.clientStorage.getAsync("edgy-vercel-token");
      figma.ui.postMessage({ type: "vercel-token-result", token: token || null });
      break;
    }

    case "set-vercel-token": {
      await figma.clientStorage.setAsync("edgy-vercel-token", msg.token);
      figma.ui.postMessage({ type: "vercel-token-saved" });
      break;
    }

    case "clear-vercel-token": {
      await figma.clientStorage.deleteAsync("edgy-vercel-token");
      figma.ui.postMessage({ type: "vercel-token-saved" });
      break;
    }

    case "get-edgy-api-key": {
      const key = await figma.clientStorage.getAsync("edgy-api-key");
      figma.ui.postMessage({ type: "edgy-api-key-result", key: key || null });
      break;
    }

    case "set-edgy-api-key": {
      await figma.clientStorage.setAsync("edgy-api-key", msg.key);
      figma.ui.postMessage({ type: "edgy-api-key-saved" });
      break;
    }

    case "clear-edgy-api-key": {
      await figma.clientStorage.deleteAsync("edgy-api-key");
      figma.ui.postMessage({ type: "edgy-api-key-saved" });
      break;
    }


    case "get-component-library": {
      try {
        const library = await getComponentLibrary();
        const serialized = serializeLibraryForLLM(library);
        const componentList = Array.from(library.components.values()).map((c) => ({
          key: c.key,
          name: c.name,
          componentSetName: c.componentSetName,
          variantProperties: c.variantProperties,
          width: c.width,
          height: c.height,
        }));
        figma.ui.postMessage({
          type: "component-library-result",
          serialized,
          components: componentList,
          stats: {
            total: library.components.size,
            buttons: library.buttons.length,
            inputs: library.inputs.length,
            cards: library.cards.length,
            checkboxes: library.checkboxes.length,
          },
        });
      } catch (error) {
        figma.ui.postMessage({
          type: "component-library-result",
          serialized: "",
          components: [],
          stats: { total: 0, buttons: 0, inputs: 0, cards: 0, checkboxes: 0 },
        });
      }
      break;
    }

    case "instantiate-component": {
      try {
        const instance = await createComponentInstance(msg.componentKey);
        if (instance) {
          figma.ui.postMessage({
            type: "component-instantiated",
            success: true,
            nodeId: instance.id,
          });
        } else {
          figma.ui.postMessage({
            type: "component-instantiated",
            success: false,
            error: "Failed to create instance",
          });
        }
      } catch (error) {
        figma.ui.postMessage({
          type: "component-instantiated",
          success: false,
          error: error instanceof Error ? error.message : "Instantiation failed",
        });
      }
      break;
    }

    case "get-design-tokens": {
      try {
        const frames: FrameNode[] = [];
        for (const screenId of msg.screenIds) {
          const frame = findFrameById(screenId);
          if (frame) frames.push(frame);
        }

        if (frames.length === 0) {
          // Return default tokens if no frames found
          figma.ui.postMessage({
            type: "design-tokens-result",
            tokens: {
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
          });
        } else {
          const tokens = await extractDesignTokens(frames);
          figma.ui.postMessage({
            type: "design-tokens-result",
            tokens,
          });
        }
      } catch (error) {
        console.error("[edgy] Failed to extract design tokens:", error);
        // Return default tokens on error
        figma.ui.postMessage({
          type: "design-tokens-result",
          tokens: {
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
        });
      }
      break;
    }

    case "save-findings": {
      try {
        const results: AnalysisOutput = msg.results;
        const includePlaceholders = msg.includePlaceholders ?? false;
        const generatedLayouts = msg.generatedLayouts;

        // Collect frames for each screen
        const frames: FrameNode[] = [];
        for (const screenResult of results.screens) {
          const frame = findFrameById(screenResult.screen_id);
          if (frame) frames.push(frame);
        }

        if (frames.length === 0) {
          throw new Error("No frames found for the analyzed screens");
        }

        // Render health indicator badges for each screen
        for (const screenResult of results.screens) {
          const frame = findFrameById(screenResult.screen_id);
          if (frame) {
            const storageData: StoredFindingsData = {
              version: 1,
              analyzed_at: results.completed_at,
              llm_enhanced: results.llm_enhanced,
              summary: {
                total: screenResult.findings.length,
                critical: screenResult.findings.filter((f) => f.severity === "critical").length,
                warning: screenResult.findings.filter((f) => f.severity === "warning").length,
                info: screenResult.findings.filter((f) => f.severity === "info").length,
              },
              findings: screenResult.findings,
            };

            await renderHealthIndicator(frame, storageData);
          }
        }

        // Generate findings report frame
        await generateFindingsReport(results, frames);

        // Generate placeholder frames for missing screens if requested
        if (includePlaceholders && results.missing_screen_findings?.length > 0) {
          const placeholders = await generatePlaceholderFrames(
            results.missing_screen_findings,
            frames,
            generatedLayouts,
            (currentIndex, totalCount, screenName) => {
              const progressMsg: PluginMessage = {
                type: "placeholder-progress",
                currentIndex,
                totalCount,
                screenName,
              };
              figma.ui.postMessage(progressMsg);
            }
          );

          // Select the new placeholder frames to show the user
          if (placeholders.length > 0) {
            figma.currentPage.selection = placeholders;
            figma.viewport.scrollAndZoomIntoView(placeholders);
          }
        }

        // Reposition any existing badges to ensure correct placement
        repositionAllBadges();

        const doneMsg: PluginMessage = { type: "render-complete" };
        figma.ui.postMessage(doneMsg);
      } catch (error) {
        const errorMsg: PluginMessage = {
          type: "error",
          message: error instanceof Error ? error.message : "Saving findings failed",
        };
        figma.ui.postMessage(errorMsg);
      }
      break;
    }

    case "clear-findings": {
      try {
        const frames: FrameNode[] = [];
        for (const screenId of msg.screenIds) {
          const frame = findFrameById(screenId);
          if (frame) frames.push(frame);
        }
        clearAllFindings(frames);
        const doneMsg: PluginMessage = { type: "findings-cleared" };
        figma.ui.postMessage(doneMsg);
      } catch (error) {
        const errorMsg: PluginMessage = {
          type: "error",
          message: error instanceof Error ? error.message : "Clearing findings failed",
        };
        figma.ui.postMessage(errorMsg);
      }
      break;
    }

    case "resize": {
      const width = Math.max(300, Math.min(800, msg.width));
      const height = Math.max(400, Math.min(900, msg.height));
      figma.ui.resize(width, height);
      break;
    }

    case "clear-canvas-documentation": {
      const removed = clearAllCanvasDocumentation();
      const doneMsg: PluginMessage = {
        type: "canvas-documentation-cleared",
        removedCount: removed,
      };
      figma.ui.postMessage(doneMsg);
      break;
    }

    case "export-prototype": {
      try {
        const { request } = msg;
        const exportMode = request.options?.exportMode || "nextjs";

        // Send progress update
        const progressMsg: PluginMessage = {
          type: "prototype-progress",
          message: exportMode === "nextjs"
            ? "Generating Next.js + shadcn prototype..."
            : "Generating HTML prototype...",
        };
        figma.ui.postMessage(progressMsg);

        let files;

        if (exportMode === "nextjs") {
          // New shadcn-based export (includes AI-generated screens)
          files = generateShadcnPrototype(
            request.existingScreens,
            request.generatedLayouts || {},
            request.missingFindings || [],
            request.designTokens,
            {
              projectName: request.options?.projectName || "prototype",
              includeNavigation: request.options?.includeNavigation,
            }
          );
        } else {
          // Legacy HTML export
          const bundle = generatePrototypeBundle(
            request.existingScreens,
            request.generatedLayouts,
            request.missingFindings,
            request.designTokens,
            request.options
          );
          files = generateAllPrototypeFiles(
            bundle,
            request.options?.projectName || "prototype"
          );
        }

        // Send files back to UI
        const readyMsg: PluginMessage = {
          type: "prototype-ready",
          files,
        };
        figma.ui.postMessage(readyMsg);
      } catch (error) {
        const errorMsg: PluginMessage = {
          type: "error",
          message: error instanceof Error ? error.message : "Prototype export failed",
        };
        figma.ui.postMessage(errorMsg);
      }
      break;
    }
  }
};
