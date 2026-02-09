/**
 * Vercel Deploy
 *
 * Deploys prototype files directly to Vercel using their API.
 * Returns a live URL for the deployed prototype.
 */

import type { PrototypeFile } from "./types";

// --- Types ---

interface VercelFile {
  file: string;
  data: string;
  encoding: "base64";
}

interface VercelDeploymentRequest {
  name: string;
  files: VercelFile[];
  projectSettings?: {
    framework?: "nextjs" | null;
  };
  target?: "production" | "preview";
}

interface VercelDeploymentResponse {
  id: string;
  url: string;
  readyState: "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED";
  alias?: string[];
  createdAt: number;
}

interface VercelError {
  error: {
    code: string;
    message: string;
  };
}

export interface DeployResult {
  success: boolean;
  url?: string;
  error?: string;
  deploymentId?: string;
}

// --- Constants ---

const VERCEL_API_URL = "https://api.vercel.com/v13/deployments";
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_ATTEMPTS = 30; // 60 seconds max wait

// --- Helpers ---

/**
 * Encode string content to base64.
 */
function encodeBase64(content: string): string {
  // Use TextEncoder for proper UTF-8 handling
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Generate a unique project name based on timestamp.
 */
function generateProjectName(baseName: string): string {
  const slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const timestamp = Date.now().toString(36);
  return `${slug || "prototype"}-${timestamp}`;
}

// --- Main Deploy Function ---

/**
 * Deploy prototype files to Vercel.
 */
export async function deployToVercel(
  files: PrototypeFile[],
  vercelToken: string,
  projectName: string = "prototype",
  onProgress?: (message: string) => void
): Promise<DeployResult> {
  try {
    onProgress?.("Preparing deployment...");

    // Convert files to Vercel format
    const vercelFiles: VercelFile[] = files.map((file) => ({
      file: file.path,
      data: encodeBase64(file.content),
      encoding: "base64" as const,
    }));

    const deploymentName = generateProjectName(projectName);
    onProgress?.(`Creating deployment: ${deploymentName}...`);

    // Create deployment - detect if it's a Next.js project
    const hasNextConfig = files.some((f) => f.path === "next.config.mjs" || f.path === "next.config.js");

    const deployRequest: VercelDeploymentRequest = {
      name: deploymentName,
      files: vercelFiles,
      projectSettings: {
        framework: hasNextConfig ? "nextjs" : null,
      },
      target: "production",
    };

    const response = await fetch(VERCEL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${vercelToken}`,
      },
      body: JSON.stringify(deployRequest),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as VercelError;

      if (response.status === 401) {
        return {
          success: false,
          error: "Invalid Vercel token. Please check your token in settings.",
        };
      }

      if (response.status === 403) {
        return {
          success: false,
          error: "Access denied. Make sure your token has deployment permissions.",
        };
      }

      return {
        success: false,
        error: errorData.error?.message || `Deployment failed (${response.status})`,
      };
    }

    const deployment = (await response.json()) as VercelDeploymentResponse;
    onProgress?.("Deployment created, waiting for build...");

    // Poll for ready state
    const finalDeployment = await waitForDeployment(
      deployment.id,
      vercelToken,
      onProgress
    );

    if (finalDeployment.readyState === "READY") {
      const liveUrl = `https://${finalDeployment.url}`;
      onProgress?.("Deployment complete!");

      return {
        success: true,
        url: liveUrl,
        deploymentId: finalDeployment.id,
      };
    } else if (finalDeployment.readyState === "ERROR") {
      return {
        success: false,
        error: "Deployment failed during build. Please try again.",
        deploymentId: finalDeployment.id,
      };
    } else {
      return {
        success: false,
        error: `Deployment ended in unexpected state: ${finalDeployment.readyState}`,
        deploymentId: finalDeployment.id,
      };
    }
  } catch (error) {
    console.error("[edgy] Vercel deployment error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Deployment failed",
    };
  }
}

/**
 * Poll deployment status until ready or error.
 */
async function waitForDeployment(
  deploymentId: string,
  token: string,
  onProgress?: (message: string) => void
): Promise<VercelDeploymentResponse> {
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    const response = await fetch(
      `https://api.vercel.com/v13/deployments/${deploymentId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to check deployment status: ${response.status}`);
    }

    const deployment = (await response.json()) as VercelDeploymentResponse;

    if (deployment.readyState === "READY" || deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") {
      return deployment;
    }

    onProgress?.(`Building... (${deployment.readyState})`);

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    attempts++;
  }

  throw new Error("Deployment timed out waiting for build to complete");
}

/**
 * Validate a Vercel token by making a simple API call.
 */
export async function validateVercelToken(token: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.vercel.com/v2/user", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
