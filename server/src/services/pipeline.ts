/**
 * Pipeline Service
 *
 * Orchestrates the full analysis → generation → deployment pipeline.
 */

import type {
  AnalysisInput,
  AnalysisOutput,
  GeneratedScreenLayout,
  DesignTokens,
  DiscoveredComponentInfo,
  AIProvider,
  PrototypeFile,
} from "../lib/types";
import type { SSEStream } from "../lib/sse";
import { runAnalysis } from "./analyzer";
import { reviewWithLLM } from "./llm-reviewer";
import {
  generateScreensBatch,
  analyzeExistingScreens,
  type ScreenGenerationRequest,
} from "./screen-generator";
import { deployToVercel } from "./deployer";
import { createJob, updateJobStatus, setJobResult, setJobError } from "../db/jobs";
import { getCredential } from "../db/credentials";

// --- Types ---

export interface PipelineOptions {
  llmProvider?: AIProvider;
  llmApiKey?: string; // LLM API key passed from client
  generateMissingScreens?: boolean;
  autoDeploy?: boolean;
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
  prototypeUrl?: string;
}

// --- Main Pipeline ---

/**
 * Run the full analysis pipeline with SSE progress updates
 */
export async function runPipeline(
  userId: string,
  input: PipelineInput,
  options: PipelineOptions,
  stream: SSEStream
): Promise<void> {
  // Create job for tracking
  const job = await createJob(userId, input.fileName);

  try {
    const pipelineStart = Date.now();
    await updateJobStatus(job.id, "processing");

    // Build analysis input
    const analysisInput: AnalysisInput = {
      analysis_id: job.id,
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
    // Use key from options (passed from client) or fall back to stored credential
    const llmApiKey = options.llmApiKey || await getCredential(
      userId,
      options.llmProvider === "gemini" ? "gemini" : "anthropic"
    );

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

    // Step 3: Generate missing screens (if enabled and findings exist)
    let generatedLayouts: Record<string, GeneratedScreenLayout> | undefined;

    if (
      options.generateMissingScreens &&
      llmApiKey &&
      analysisOutput.missing_screen_findings.length > 0
    ) {
      await stream.sendProgress({
        stage: "generating",
        message: "Preparing to generate missing screens...",
        progress: 0.75,
      });

      // Analyze existing screens for patterns
      const screenAnalysis = analyzeExistingScreens(input.screens);

      // Get reference thumbnails
      const thumbnails = input.screens
        .filter((s) => s.thumbnail_base64)
        .map((s) => s.thumbnail_base64!);

      // Build generation requests
      const requests: ScreenGenerationRequest[] =
        analysisOutput.missing_screen_findings.map((finding) => ({
          missingScreen: finding,
          designTokens: input.designTokens || getDefaultDesignTokens(),
          referenceScreenshots: thumbnails,
          flowContext: {
            flowType: finding.flow_type,
            existingScreenNames: input.screens.map((s) => s.name),
            suggestedComponents: finding.recommendation.components,
          },
          availableComponents: input.componentLibrary
            ? {
                serialized: input.componentLibrary.serialized,
                componentKeys: new Map(
                  input.componentLibrary.components.map((c) => [c.name, c.key])
                ),
              }
            : undefined,
          screenAnalysis,
        }));

      // Generate screens
      const results = await generateScreensBatch(
        requests,
        llmApiKey,
        options.llmProvider || "claude",
        stream
      );

      // Collect successful layouts
      generatedLayouts = {};
      for (const finding of analysisOutput.missing_screen_findings) {
        const result = results.get(finding.missing_screen.id);
        if (result?.layout) {
          generatedLayouts[finding.id] = result.layout;
        }
      }
    }

    // Step 4: Deploy to Vercel (if enabled and token available)
    let prototypeUrl: string | undefined;

    if (options.autoDeploy) {
      const vercelToken = await getCredential(userId, "vercel");

      if (vercelToken) {
        await stream.sendProgress({
          stage: "prototype",
          message: "Building prototype...",
          progress: 0.9,
        });

        // Build prototype files
        const prototypeFiles = buildPrototypeFiles(
          input,
          analysisOutput,
          generatedLayouts
        );

        // Deploy
        const deployResult = await deployToVercel(
          prototypeFiles,
          vercelToken,
          input.fileName,
          stream
        );

        if (deployResult.success) {
          prototypeUrl = deployResult.url;
        }
      }
    }

    // Send complete event immediately (don't block on DB save)
    await stream.sendComplete({
      analysis: analysisOutput,
      generated_layouts: generatedLayouts,
      prototype_url: prototypeUrl,
    });

    // Save results to database in background
    setJobResult(job.id, analysisOutput, generatedLayouts, prototypeUrl).catch(
      (err) => console.error("[pipeline] Failed to save job result:", err)
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Pipeline failed";
    console.error("[pipeline] Error:", error);

    await setJobError(job.id, errorMessage);

    await stream.sendError({
      code: "PIPELINE_ERROR",
      message: errorMessage,
    });
  }
}

// --- Helpers ---

function getDefaultDesignTokens(): DesignTokens {
  return {
    primaryColor: { r: 0.09, g: 0.09, b: 0.09 },
    backgroundColor: { r: 1, g: 1, b: 1 },
    textColor: { r: 0.09, g: 0.09, b: 0.09 },
    mutedColor: { r: 0.45, g: 0.45, b: 0.45 },
    borderColor: { r: 0.9, g: 0.9, b: 0.9 },
    borderRadius: 8,
    fontFamily: "Inter",
    baseFontSize: 14,
    headingFontSize: 24,
  };
}

/**
 * Build prototype files from analysis results
 * This is a simplified version - in production, you'd use the full prototype builder
 */
function buildPrototypeFiles(
  input: PipelineInput,
  analysis: AnalysisOutput,
  generatedLayouts?: Record<string, GeneratedScreenLayout>
): PrototypeFile[] {
  const files: PrototypeFile[] = [];

  // Create a simple HTML prototype that displays the screens
  const screenNames = input.screens.map((s) => s.name);
  const generatedScreenNames = generatedLayouts
    ? Object.values(generatedLayouts).map((l) => l.name)
    : [];
  const allScreens = [...screenNames, ...generatedScreenNames];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${input.fileName} - Prototype</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    h1 { margin-bottom: 24px; color: #111; }
    .screens { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
    .screen { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .screen h2 { font-size: 14px; color: #666; margin-bottom: 12px; }
    .screen-content { background: #fafafa; border-radius: 8px; height: 400px; display: flex; align-items: center; justify-content: center; color: #999; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .badge-generated { background: #e7f5e7; color: #2d7a2d; }
    .badge-existing { background: #e7e7f5; color: #2d2d7a; }
    .findings { margin-top: 24px; }
    .finding { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin-bottom: 8px; border-radius: 4px; }
    .finding.critical { background: #f8d7da; border-color: #dc3545; }
    .finding.warning { background: #fff3cd; border-color: #ffc107; }
    .finding.info { background: #d1ecf1; border-color: #17a2b8; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${input.fileName}</h1>
    <p style="color: #666; margin-bottom: 24px;">
      ${analysis.summary.screens_analyzed} screens analyzed,
      ${analysis.summary.total_findings} findings
    </p>

    <div class="screens">
      ${allScreens
        .map(
          (name, i) => `
        <div class="screen">
          <h2>
            ${name}
            <span class="badge ${i < screenNames.length ? "badge-existing" : "badge-generated"}">
              ${i < screenNames.length ? "Existing" : "Generated"}
            </span>
          </h2>
          <div class="screen-content">
            ${i < screenNames.length && input.screens[i]?.thumbnail_base64 ? `<img src="${input.screens[i].thumbnail_base64}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />` : "Preview"}
          </div>
        </div>
      `
        )
        .join("")}
    </div>

    <div class="findings">
      <h2 style="margin: 24px 0 16px;">Findings</h2>
      ${analysis.screens
        .flatMap((s) => s.findings)
        .map(
          (f) => `
        <div class="finding ${f.severity}">
          <strong>${f.title}</strong>
          <p style="margin-top: 4px; font-size: 14px;">${f.description}</p>
        </div>
      `
        )
        .join("")}
    </div>
  </div>
</body>
</html>`;

  files.push({ path: "index.html", content: html });

  return files;
}
