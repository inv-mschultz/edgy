/// <reference types="@figma/plugin-typings" />

import { extractScreens } from "./extractor";
import { renderFindings } from "./annotator";
import { generateReport } from "./reporter";
import { placeComponentSuggestions } from "./component-placer";
import type { UIMessage, PluginMessage, AnalysisOutput } from "../ui/lib/types";

// Show the plugin UI
figma.showUI(__html__, { width: 400, height: 560, themeColors: true });

// Track the current selection
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

// Handle messages from UI
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

    case "render-results": {
      try {
        const results: AnalysisOutput = msg.results;

        // Get original selected frames for positioning
        const selectedFrames = figma.currentPage.selection.filter(
          (node): node is FrameNode => node.type === "FRAME"
        );

        // Render finding annotations next to each screen
        await renderFindings(results, selectedFrames);

        // Generate the summary report frame
        await generateReport(results, selectedFrames);

        // Place component suggestion frames
        await placeComponentSuggestions(results);

        const doneMsg: PluginMessage = { type: "render-complete" };
        figma.ui.postMessage(doneMsg);
      } catch (error) {
        const errorMsg: PluginMessage = {
          type: "error",
          message: error instanceof Error ? error.message : "Rendering failed",
        };
        figma.ui.postMessage(errorMsg);
      }
      break;
    }

  }
};
