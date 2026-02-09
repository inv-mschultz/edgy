# Edgy Scripts

Utility scripts for maintaining and enriching the Edgy knowledge base.

## scrape-training-sources.ts

Scrapes all URLs from `edgy-ai-training-reference.md` and stores the content in `knowledge/enriched/`.

**Usage:**
```bash
# From project root
npx tsx scripts/scrape-training-sources.ts
```

**Output:**
- `knowledge/enriched/*.txt` - Individual scraped content files
- `knowledge/enriched/metadata.json` - Metadata about all sources
- `knowledge/enriched/content-index.json` - Full content index

**Features:**
- Extracts unique URLs from markdown
- Scrapes content with proper rate limiting (1s delay)
- Categorizes sources by publisher (NNG, Baymard, W3C, etc.)
- Handles errors gracefully
- Creates structured output for easy reference
