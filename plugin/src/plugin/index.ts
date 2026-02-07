/// <reference types="@figma/plugin-typings" />

import { extractScreens } from "./extractor";
import {
  renderHealthIndicator,
  generateFindingsReport,
  clearAllFindings,
  clearAllCanvasDocumentation,
  findFrameById,
  type StoredFindingsData,
} from "./health-indicator";
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

// --- Message Handlers ---

figma.ui.onmessage = async (msg: UIMessage) => {
  switch (msg.type) {
    case "start-extraction": {
      try {
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

    case "save-findings": {
      try {
        const results: AnalysisOutput = msg.results;

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
  }
};
