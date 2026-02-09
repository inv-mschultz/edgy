/**
 * Scrape Training Sources Script (JavaScript version)
 * 
 * Extracts all URLs from edgy-ai-training-reference.md and scrapes their content
 * to enrich Edgy's knowledge base with research-backed guidelines.
 * 
 * Usage: node scripts/scrape-training-sources.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");

// Extract URLs from markdown file
function extractUrls(markdownContent) {
  const urlPattern = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
  const urls = [];
  let match;

  while ((match = urlPattern.exec(markdownContent)) !== null) {
    const title = match[1];
    const url = match[2];
    const lines = markdownContent.split("\n");
    const lineIndex = markdownContent.substring(0, match.index).split("\n").length - 1;
    const context = lineIndex > 0 ? lines[lineIndex - 1] : "";
    
    urls.push({ url, title, context });
  }

  // Remove duplicates
  const uniqueUrls = new Map();
  for (const item of urls) {
    if (!uniqueUrls.has(item.url)) {
      uniqueUrls.set(item.url, item);
    }
  }

  return Array.from(uniqueUrls.values());
}

// Scrape a single URL
async function scrapeUrl(url, title) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EdgyBot/1.0; +https://github.com/inversestudio/edgy)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return {
        content: "",
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();
    
    // Basic HTML to text extraction
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Extract title from HTML if available
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      text = `Title: ${titleMatch[1]}\n\n${text}`;
    }

    return {
      content: text.substring(0, 50000), // Limit to 50k chars
      success: true,
    };
  } catch (error) {
    return {
      content: "",
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Determine publisher and category from URL
function categorizeUrl(url, title) {
  if (url.includes("nngroup.com") || url.includes("nielsen")) {
    return { publisher: "Nielsen Norman Group", category: "UX Research" };
  }
  if (url.includes("baymard.com")) {
    return { publisher: "Baymard Institute", category: "E-commerce UX" };
  }
  if (url.includes("w3.org") || url.includes("webaim.org") || url.includes("wcag")) {
    return { publisher: "W3C/WCAG", category: "Accessibility" };
  }
  if (url.includes("carbondesignsystem.com")) {
    return { publisher: "IBM Carbon", category: "Design System" };
  }
  if (url.includes("dubbot.com")) {
    return { publisher: "DubBot", category: "Accessibility" };
  }
  return { publisher: "Unknown", category: "General" };
}

// Main execution
async function main() {
  console.log("📚 Edgy Training Sources Scraper\n");

  // Read the training reference file
  const referencePath = join(ROOT_DIR, "edgy-ai-training-reference.md");
  if (!existsSync(referencePath)) {
    console.error(`❌ File not found: ${referencePath}`);
    process.exit(1);
  }

  const referenceContent = readFileSync(referencePath, "utf-8");
  const urls = extractUrls(referenceContent);

  console.log(`Found ${urls.length} unique URLs to scrape\n`);

  // Create output directory
  const outputDir = join(ROOT_DIR, "knowledge", "enriched");
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const metadata = [];
  const scrapedContent = [];

  // Scrape each URL with rate limiting
  for (let i = 0; i < urls.length; i++) {
    const { url, title, context } = urls[i];
    const { publisher, category } = categorizeUrl(url, title);

    console.log(`[${i + 1}/${urls.length}] Scraping: ${title}`);
    console.log(`   URL: ${url}`);

    const result = await scrapeUrl(url, title);

    const sourceMetadata = {
      url,
      title,
      category,
      publisher,
      scrapedAt: new Date().toISOString(),
      status: result.success ? "success" : "failed",
      error: result.error,
      contentLength: result.content.length,
    };

    metadata.push(sourceMetadata);

    if (result.success) {
      scrapedContent.push({
        url,
        title,
        content: result.content,
        metadata: sourceMetadata,
      });

      // Save individual file
      const safeFilename = title
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase()
        .substring(0, 100);
      const filePath = join(outputDir, `${safeFilename}.txt`);
      writeFileSync(
        filePath,
        `URL: ${url}\nTitle: ${title}\nPublisher: ${publisher}\nCategory: ${category}\nScraped: ${sourceMetadata.scrapedAt}\n\n${result.content}`,
        "utf-8"
      );
      console.log(`   ✅ Saved to ${safeFilename}.txt (${result.content.length} chars)\n`);
    } else {
      console.log(`   ❌ Failed: ${result.error}\n`);
    }

    // Rate limiting: wait 1 second between requests
    if (i < urls.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Save metadata index
  const metadataPath = join(outputDir, "metadata.json");
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  console.log(`\n📊 Metadata saved to ${metadataPath}`);

  // Save combined content index
  const contentIndexPath = join(outputDir, "content-index.json");
  writeFileSync(contentIndexPath, JSON.stringify(scrapedContent, null, 2), "utf-8");
  console.log(`📑 Content index saved to ${contentIndexPath}`);

  // Generate summary
  const successCount = metadata.filter((m) => m.status === "success").length;
  const failedCount = metadata.filter((m) => m.status === "failed").length;

  console.log(`\n✅ Scraping complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Failed: ${failedCount}`);
  console.log(`   Total: ${metadata.length}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
