# Enriched Knowledge Base

This directory contains scraped content from all trusted sources referenced in `edgy-ai-training-reference.md`.

## Contents

After running the scraper, you'll find:

- `*.txt` - Individual scraped content files (one per source)
- `metadata.json` - Metadata about all sources (URLs, titles, publishers, status)
- `content-index.json` - Full content index with all scraped text

## Usage

To scrape all sources:

```bash
# From project root
npx tsx scripts/scrape-training-sources.ts
```

Or using tsx from server:

```bash
./server/node_modules/.bin/tsx scripts/scrape-training-sources.ts
```

## Integration

This enriched content can be:

1. **Referenced in system prompts** - Include key excerpts in LLM prompts for more context
2. **Used for RAG** - If implementing retrieval-augmented generation, use this as a knowledge base
3. **Referenced in rules** - Link YAML rules to specific source content
4. **Training data** - Use for fine-tuning or few-shot examples

## Source Categories

- **Nielsen Norman Group** - UX Research articles
- **Baymard Institute** - E-commerce UX research
- **W3C/WCAG** - Accessibility standards
- **IBM Carbon** - Design system patterns
- **DubBot** - Accessibility best practices
