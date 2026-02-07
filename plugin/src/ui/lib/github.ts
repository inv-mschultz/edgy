import type { AnalysisInput, AnalysisOutput, PluginSettings } from "./types";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120000; // 2 minutes max

/**
 * Submits analysis input to GitHub by creating a file in the analyses/ folder.
 * This triggers the GitHub Action via push path filter.
 */
export async function submitAnalysis(
  data: AnalysisInput,
  settings: PluginSettings
): Promise<void> {
  const { github_pat, github_repo } = settings;
  const path = `analyses/${data.analysis_id}/input.json`;
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

  const response = await fetch(
    `https://api.github.com/repos/${github_repo}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${github_pat}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        message: `[edgy] Submit analysis ${data.analysis_id}`,
        content,
        branch: "main",
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to submit analysis: ${response.status} ${error.message || response.statusText}`
    );
  }
}

/**
 * Polls GitHub for the analysis output file.
 * The GitHub Action creates this file when analysis is complete.
 */
export async function pollForResults(
  analysisId: string,
  settings: PluginSettings
): Promise<AnalysisOutput> {
  const { github_pat, github_repo } = settings;
  const path = `analyses/${analysisId}/output.json`;
  const startTime = Date.now();

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const response = await fetch(
        `https://api.github.com/repos/${github_repo}/contents/${path}?ref=main`,
        {
          headers: {
            Authorization: `Bearer ${github_pat}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (response.status === 404) {
        // Not ready yet — continue polling
        continue;
      }

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();
      const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
      return JSON.parse(decoded) as AnalysisOutput;
    } catch (err) {
      // Network errors during polling are expected — retry
      if (err instanceof SyntaxError) {
        throw new Error("Failed to parse analysis results");
      }
      // Continue polling on transient errors
    }
  }

  throw new Error("Analysis timed out. The GitHub Action may have failed — check the Actions tab.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
