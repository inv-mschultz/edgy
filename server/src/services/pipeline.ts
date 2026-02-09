/**
 * Pipeline Service
 *
 * Orchestrates the full analysis → review pipeline.
 * Stateless — no database, results streamed via SSE.
 */

import type {
  AnalysisInput,
  AnalysisOutput,
  GeneratedScreenLayout,
  DesignTokens,
  DiscoveredComponentInfo,
  AIProvider,
} from "../lib/types";
import type { SSEStream } from "../lib/sse";
import { runAnalysis } from "./analyzer";
import { reviewWithLLM } from "./llm-reviewer";

// --- Types ---

export interface PipelineOptions {
  llmProvider?: AIProvider;
  llmApiKey?: string;
  generateMissingScreens?: boolean;
}

export interface PipelineInput {
  fileName: string;
  screens: AnalysisInput["screens"];
  designTokens?: DesignTokens;
  componentLibrary?: {
    serialized: string;
    components: DiscoveredComponentInfo[];
  };
}

export interface PipelineResult {
  analysis: AnalysisOutput;
  generatedLayouts?: Record<string, GeneratedScreenLayout>;
}

// --- Main Pipeline ---

/**
 * Run the full analysis pipeline with SSE progress updates.
 * Fully stateless — streams results, stores nothing.
 */
export async function runPipeline(
  userId: string,
  input: PipelineInput,
  options: PipelineOptions,
  stream: SSEStream
): Promise<void> {
  try {
    const pipelineStart = Date.now();
    const jobId = crypto.randomUUID();

    // Build analysis input
    const analysisInput: AnalysisInput = {
      analysis_id: jobId,
      timestamp: new Date().toISOString(),
      file_name: input.fileName,
      screens: input.screens,
    };

    // Step 1: Run heuristic analysis
    await stream.sendProgress({
      stage: "patterns",
      message: "Starting analysis...",
      progress: 0.1,
    });

    let analysisOutput = await runAnalysis(analysisInput, stream);
    console.log(`[pipeline] Heuristic analysis done in ${Date.now() - pipelineStart}ms`);

    // Step 2: LLM Review (if API key available)
    const llmApiKey = options.llmApiKey;

    if (llmApiKey) {
      const llmStart = Date.now();
      const reviewResult = await reviewWithLLM(
        analysisOutput,
        analysisInput,
        llmApiKey,
        options.llmProvider || "claude",
        stream
      );
      console.log(`[pipeline] LLM review done in ${Date.now() - llmStart}ms (enhanced: ${reviewResult.wasEnhanced})`);

      analysisOutput = reviewResult.output;

      if (reviewResult.error) {
        analysisOutput.llm_error = reviewResult.error;
        console.warn(`[pipeline] LLM review error: ${reviewResult.error}`);
      }
    } else {
      console.log("[pipeline] No LLM API key available, skipping review");
    }

    // Send complete event
    await stream.sendComplete({
      analysis: analysisOutput,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Pipeline failed";
    console.error("[pipeline] Error:", error);

    await stream.sendError({
      code: "PIPELINE_ERROR",
      message: errorMessage,
    });
  }
}
