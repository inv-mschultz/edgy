/**
 * Enriched Knowledge Base Loader
 * 
 * Loads and provides access to scraped content from trusted sources
 * referenced in edgy-ai-training-reference.md
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENRICHED_DIR = resolve(__dirname, "../../../knowledge/enriched");

interface SourceMetadata {
  url: string;
  title: string;
  category?: string;
  publisher: string;
  scrapedAt: string;
  status: "success" | "failed" | "pending";
  error?: string;
  contentLength?: number;
}

interface EnrichedContent {
  url: string;
  title: string;
  content: string;
  metadata: SourceMetadata;
}

let metadataCache: SourceMetadata[] | null = null;
let contentIndexCache: EnrichedContent[] | null = null;

/**
 * Load metadata about all sources
 */
export function loadMetadata(): SourceMetadata[] {
  if (metadataCache) return metadataCache;

  const metadataPath = join(ENRICHED_DIR, "metadata.json");
  if (!existsSync(metadataPath)) {
    console.warn("[enriched-knowledge] Metadata file not found");
    return [];
  }

  try {
    const content = readFileSync(metadataPath, "utf-8");
    metadataCache = JSON.parse(content) as SourceMetadata[];
    return metadataCache;
  } catch (error) {
    console.error("[enriched-knowledge] Error loading metadata:", error);
    return [];
  }
}

/**
 * Load full content index
 */
export function loadContentIndex(): EnrichedContent[] {
  if (contentIndexCache) return contentIndexCache;

  const indexPath = join(ENRICHED_DIR, "content-index.json");
  if (!existsSync(indexPath)) {
    console.warn("[enriched-knowledge] Content index not found");
    return [];
  }

  try {
    const content = readFileSync(indexPath, "utf-8");
    contentIndexCache = JSON.parse(content) as EnrichedContent[];
    return contentIndexCache;
  } catch (error) {
    console.error("[enriched-knowledge] Error loading content index:", error);
    return [];
  }
}

/**
 * Get content by category (e.g., "Empty States", "Error States")
 */
export function getContentByCategory(category: string): EnrichedContent[] {
  const index = loadContentIndex();
  const categoryLower = category.toLowerCase();

  return index.filter((item) => {
    // Match by category name or publisher
    const titleLower = item.title.toLowerCase();
    const categoryMatch = item.metadata.category?.toLowerCase().includes(categoryLower);
    const titleMatch = titleLower.includes(categoryLower);

    // Map our 8 categories to source content
    const categoryMappings: Record<string, string[]> = {
      "empty states": ["empty state", "empty", "zero data", "first use"],
      "loading states": ["skeleton", "loading", "spinner", "progress"],
      "error states": ["error", "validation", "form", "hostile"],
      "edge inputs": ["edge case", "input", "boundary", "special character"],
      "boundary conditions": ["boundary", "limit", "max", "min", "overflow"],
      "permissions": ["permission", "access", "disabled", "unauthorized"],
      "connectivity": ["offline", "network", "connection", "sync"],
      "destructive actions": ["destructive", "delete", "confirmation", "undo"],
    };

    const keywords = categoryMappings[categoryLower] || [categoryLower];
    const keywordMatch = keywords.some((keyword) => titleLower.includes(keyword));

    return categoryMatch || titleMatch || keywordMatch;
  });
}

/**
 * Load training data patterns (structured guidelines)
 */
function loadTrainingData(): string {
  const trainingPath = join(ENRICHED_DIR, "training-data-01.md");
  if (!existsSync(trainingPath)) {
    return "";
  }

  try {
    return readFileSync(trainingPath, "utf-8");
  } catch (error) {
    console.error("[enriched-knowledge] Error loading training data:", error);
    return "";
  }
}

/**
 * Get training patterns for a specific category
 */
function getTrainingPatternsForCategory(category: string): string {
  const trainingData = loadTrainingData();
  if (!trainingData) return "";

  const categoryMappings: Record<string, string[]> = {
    "empty states": ["2.1 Empty states", "empty states", "empty state"],
    "loading states": ["2.2 Loading states", "loading states", "loading state"],
    "error states": ["2.3 Error states", "error states", "error state"],
    "edge inputs": ["3. Input and Form Edge Cases", "3.1", "3.2", "3.3", "3.4", "3.5"],
    "boundary conditions": ["2.4 Overfilled", "overfilled", "conflicting content"],
    "permissions": [], // Not explicitly covered in training data
    "connectivity": ["6.1 Network conditions", "network", "offline", "connection"],
    "destructive actions": [], // Not explicitly covered in training data
  };

  const keywords = categoryMappings[category.toLowerCase()] || [];
  if (keywords.length === 0) return "";

  // Extract relevant sections
  const lines = trainingData.split("\n");
  const relevantSections: string[] = [];
  let inRelevantSection = false;
  let currentSection: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();

    // Check if we're entering a relevant section
    if (keywords.some((keyword) => lineLower.includes(keyword.toLowerCase()))) {
      inRelevantSection = true;
      currentSection = [line];
      continue;
    }

    // Check if we're leaving the section (new numbered section)
    if (inRelevantSection && /^\d+\./.test(line.trim())) {
      if (currentSection.length > 0) {
        relevantSections.push(currentSection.join("\n"));
      }
      inRelevantSection = false;
      currentSection = [];
      // Check if this new section is also relevant
      if (keywords.some((keyword) => lineLower.includes(keyword.toLowerCase()))) {
        inRelevantSection = true;
        currentSection = [line];
      }
      continue;
    }

    if (inRelevantSection) {
      currentSection.push(line);
      // Stop at next major section (numbered or empty line before numbered)
      if (line.trim() === "" && i + 1 < lines.length && /^\d+\./.test(lines[i + 1]?.trim())) {
        if (currentSection.length > 0) {
          relevantSections.push(currentSection.join("\n"));
        }
        inRelevantSection = false;
        currentSection = [];
      }
    }
  }

  if (currentSection.length > 0) {
    relevantSections.push(currentSection.join("\n"));
  }

  return relevantSections.join("\n\n").substring(0, 1000);
}

/**
 * Get research-backed guidelines for a specific edge case category
 * Returns a formatted string with key excerpts
 */
export function getGuidelinesForCategory(category: string, maxLength: number = 2000): string {
  const content = getContentByCategory(category);
  const guidelines: string[] = [];

  // Add training data patterns first (structured, practical)
  const trainingPatterns = getTrainingPatternsForCategory(category);
  if (trainingPatterns) {
    guidelines.push(`**Training Patterns:**\n${trainingPatterns}`);
  }

  // Then add research content
  for (const item of content) {
    if (item.metadata.status !== "success") continue;

    // Extract key excerpts (first 500 chars + any key phrases)
    let excerpt = item.content.substring(0, 500);
    
    // Try to find key guideline sections
    const guidelinePatterns = [
      /guideline[s]?:?\s*([^\n]{50,200})/gi,
      /recommendation[s]?:?\s*([^\n]{50,200})/gi,
      /best practice[s]?:?\s*([^\n]{50,200})/gi,
      /should\s+([^\n]{50,200})/gi,
      /must\s+([^\n]{50,200})/gi,
    ];

    const foundGuidelines: string[] = [];
    for (const pattern of guidelinePatterns) {
      const matches = item.content.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 30) {
          foundGuidelines.push(match[1].trim());
        }
      }
    }

    if (foundGuidelines.length > 0) {
      excerpt = foundGuidelines.slice(0, 3).join(" | ");
    }

    guidelines.push(
      `**${item.title}** (${item.metadata.publisher}):\n${excerpt}...`
    );

    // Limit total length
    const currentLength = guidelines.join("\n\n").length;
    if (currentLength > maxLength) {
      guidelines.pop();
      break;
    }
  }

  return guidelines.join("\n\n");
}

/**
 * Get all successful sources grouped by publisher
 */
export function getSourcesByPublisher(): Record<string, SourceMetadata[]> {
  const metadata = loadMetadata();
  const successful = metadata.filter((m) => m.status === "success");

  const grouped: Record<string, SourceMetadata[]> = {};
  for (const source of successful) {
    if (!grouped[source.publisher]) {
      grouped[source.publisher] = [];
    }
    grouped[source.publisher].push(source);
  }

  return grouped;
}

/**
 * Get summary statistics
 */
export function getKnowledgeStats() {
  const metadata = loadMetadata();
  const successful = metadata.filter((m) => m.status === "success");
  const failed = metadata.filter((m) => m.status === "failed");

  const byPublisher = getSourcesByPublisher();

  return {
    total: metadata.length,
    successful: successful.length,
    failed: failed.length,
    byPublisher: Object.fromEntries(
      Object.entries(byPublisher).map(([publisher, sources]) => [
        publisher,
        sources.length,
      ])
    ),
  };
}
