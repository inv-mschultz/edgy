/**
 * SSE (Server-Sent Events) Helper
 *
 * Provides utilities for streaming progress updates to clients.
 */

import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { SSEProgressEvent, SSECompleteEvent, SSEErrorEvent } from "./types";

export interface SSEStream {
  sendProgress(event: SSEProgressEvent): Promise<void>;
  sendComplete(event: SSECompleteEvent): Promise<void>;
  sendError(event: SSEErrorEvent): Promise<void>;
  close(): void;
}

/**
 * Create an SSE response and return a stream interface
 */
export function createSSEStream(c: Context): {
  response: Response;
  stream: SSEStream;
} {
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let isClosed = false;

  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
    cancel() {
      isClosed = true;
    },
  });

  const sendEvent = async (
    eventType: string,
    data: SSEProgressEvent | SSECompleteEvent | SSEErrorEvent
  ) => {
    if (isClosed || !streamController) return;

    try {
      const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
      streamController.enqueue(encoder.encode(message));
    } catch (error) {
      console.error("[sse] Error sending event:", error);
    }
  };

  const stream: SSEStream = {
    async sendProgress(event: SSEProgressEvent) {
      await sendEvent("progress", event);
    },
    async sendComplete(event: SSECompleteEvent) {
      await sendEvent("complete", event);
      this.close();
    },
    async sendError(event: SSEErrorEvent) {
      await sendEvent("error", event);
      this.close();
    },
    close() {
      if (!isClosed && streamController) {
        isClosed = true;
        try {
          streamController.close();
        } catch {
          // Already closed
        }
      }
    },
  };

  const response = new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });

  return { response, stream };
}

/**
 * Higher-level SSE helper using Hono's streamSSE
 */
export async function withSSE(
  c: Context,
  handler: (stream: SSEStream) => Promise<void>
): Promise<Response> {
  return streamSSE(c, async (stream) => {
    const sseStream: SSEStream = {
      async sendProgress(event: SSEProgressEvent) {
        await stream.writeSSE({
          event: "progress",
          data: JSON.stringify(event),
        });
      },
      async sendComplete(event: SSECompleteEvent) {
        await stream.writeSSE({
          event: "complete",
          data: JSON.stringify(event),
        });
      },
      async sendError(event: SSEErrorEvent) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify(event),
        });
      },
      close() {
        // Hono handles closing
      },
    };

    try {
      await handler(sseStream);
    } catch (error) {
      console.error("[sse] Handler error:", error);
      await sseStream.sendError({
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
