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


