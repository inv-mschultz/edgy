/**
 * LLM Response Cache
 *
 * Content-addressable cache for LLM responses.
 * SHA-256 hashes the input (system prompt + content) and caches the response.
 * Makes re-runs of identical designs 100% deterministic and faster.
 */

import { createHash } from "crypto";
import type { LLMResponse, ContentPart } from "./llm";

// --- Types ---

interface CacheEntry {
  response: LLMResponse;
  createdAt: number;
  hitCount: number;
}

// --- Configuration ---

/** Cache entries expire after 1 hour */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Maximum number of cache entries (LRU eviction) */
const MAX_CACHE_SIZE = 200;

// --- Cache Store ---

const cache = new Map<string, CacheEntry>();

// --- Public API ---

/**
 * Generate a deterministic hash for an LLM request.
 * Hashes system prompt + text content (ignores images to keep hashes fast).
 */
export function hashLLMRequest(
  systemPrompt: string,
  content: ContentPart[]
): string {
  const hasher = createHash("sha256");
  hasher.update(systemPrompt);

  for (const part of content) {
    if (part.type === "text") {
      hasher.update(part.text);
    } else if (part.type === "image") {
      // Hash a fingerprint of the image (first 200 chars of base64 + length)
      // Full image hashing would be too slow
      const data = part.source.data;
      hasher.update(`img:${part.source.media_type}:${data.length}:${data.slice(0, 200)}`);
    }
  }

  return hasher.digest("hex");
}

/**
 * Get a cached response for the given request hash.
 * Returns undefined if not cached or expired.
 */
export function getCachedResponse(hash: string): LLMResponse | undefined {
  const entry = cache.get(hash);
  if (!entry) return undefined;

  // Check TTL
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    cache.delete(hash);
    return undefined;
  }

  entry.hitCount++;
  return entry.response;
}

/**
 * Store an LLM response in the cache.
 */
export function setCachedResponse(hash: string, response: LLMResponse): void {
  // Evict oldest entries if at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of cache) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  cache.set(hash, {
    response,
    createdAt: Date.now(),
    hitCount: 0,
  });
}

/**
 * Clear the entire cache.
 */
export function clearLLMCache(): void {
  cache.clear();
}

/**
 * Get cache statistics.
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  ttlMs: number;
} {
  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    ttlMs: CACHE_TTL_MS,
  };
}
