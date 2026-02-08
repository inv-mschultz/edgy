/**
 * API Key Store
 *
 * Persists the API key and provider via figma.clientStorage, which is only
 * accessible from the plugin sandbox. Communicates through postMessage.
 */

import type { AIProvider } from "./types";

export function getApiKey(): Promise<string | null> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "api-key-result") {
        window.removeEventListener("message", handler);
        resolve(msg.key);
      }
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "get-api-key" } }, "*");
  });
}

export function setApiKey(key: string): Promise<void> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "api-key-saved") {
        window.removeEventListener("message", handler);
        resolve();
      }
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "set-api-key", key } }, "*");
  });
}

export function clearApiKey(): Promise<void> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "api-key-saved") {
        window.removeEventListener("message", handler);
        resolve();
      }
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "clear-api-key" } }, "*");
  });
}

export function getProvider(): Promise<AIProvider> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "provider-result") {
        window.removeEventListener("message", handler);
        resolve(msg.provider);
      }
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "get-provider" } }, "*");
  });
}

export function setProvider(provider: AIProvider): Promise<void> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "provider-saved") {
        window.removeEventListener("message", handler);
        resolve();
      }
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "set-provider", provider } }, "*");
  });
}

export function getAIScreenGeneration(): Promise<boolean> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "ai-screen-gen-result") {
        window.removeEventListener("message", handler);
        resolve(msg.enabled);
      }
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "get-ai-screen-gen" } }, "*");
  });
}

export function setAIScreenGeneration(enabled: boolean): Promise<void> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "ai-screen-gen-saved") {
        window.removeEventListener("message", handler);
        resolve();
      }
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "set-ai-screen-gen", enabled } }, "*");
  });
}

// --- Vercel Token ---

export function getVercelToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "vercel-token-result") {
        window.removeEventListener("message", handler);
        resolve(msg.token);
      }
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "get-vercel-token" } }, "*");
  });
}

export function setVercelToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "vercel-token-saved") {
        window.removeEventListener("message", handler);
        resolve();
      }
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "set-vercel-token", token } }, "*");
  });
}

export function clearVercelToken(): Promise<void> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (msg?.type === "vercel-token-saved") {
        window.removeEventListener("message", handler);
        resolve();
      }
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "clear-vercel-token" } }, "*");
  });
}
