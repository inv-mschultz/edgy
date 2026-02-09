# Edgy

> AI-powered edge case analysis for Figma designs

Edgy is a Figma plugin that analyzes UI design flows for missing edge cases. It uses heuristic rules combined with AI (Claude/Gemini) to detect missing states like empty screens, loading indicators, error handling, and more — then generates actionable recommendations with component suggestions.

![Edgy Analysis](https://img.shields.io/badge/Analysis-Rule--Based-blue) ![AI Review](https://img.shields.io/badge/AI-Claude%20%7C%20Gemini-purple) ![Knowledge Base](https://img.shields.io/badge/Knowledge-Research--Backed-green)

---

## What Edgy Does Now

### ✅ 1. Comprehensive Edge Case Analysis

Analyzes your Figma designs across **8 edge case categories**:

1. **Empty States** — Detects missing zero-data/first-use states for lists, tables, dashboards
2. **Loading States** — Finds missing skeleton screens, spinners, progress indicators
3. **Error States** — Identifies missing form validation, submission errors, API error handling
4. **Edge Inputs** — Checks handling for long text, special characters, unusual formats
5. **Boundary Conditions** — Validates min/max/overflow states for counters, pagination, limits
6. **Permissions** — Verifies unauthorized/forbidden/disabled states for restricted actions
7. **Connectivity** — Confirms offline/network error/retry states
8. **Destructive Actions** — Ensures confirmation dialogs and undo options exist

**How it works:**
- **Rule-based detection**: Pattern matching against a curated knowledge base
- **3-tier checking**: Checks current screen → flow group → all screens
- **Flow type detection**: Auto-detects checkout, authentication, CRUD, onboarding, etc.
- **Component recommendations**: Suggests specific shadcn/ui components to address each finding

### ✅ 2. AI-Powered Review Layer

Enhances analysis using Claude or Gemini to:
- **Remove false positives**: Filters out incorrect findings based on visual analysis
- **Improve descriptions**: Makes findings more specific and actionable
- **Adjust severity**: Corrects priority levels based on research-backed impact
- **Add flow insights**: Identifies cross-screen patterns and missing flow screens

**Research-backed knowledge:**
- 29 scraped sources from Nielsen Norman Group, Baymard Institute, W3C/WCAG, IBM Carbon
- Structured training patterns for practical guidance
- Dynamic prompt building with relevant research per category

### ✅ 3. Interactive Report Generation

Generates a comprehensive Figma report with:
- **Summary statistics**: Total findings, severity breakdown, category distribution
- **Per-screen findings**: Organized by screen with thumbnails
- **Component recommendations**: Specific shadcn/ui components with usage guidance
- **Flow completeness**: Missing screens and suggested flows
- **Paste into Figma**: One-click report creation directly in your design file

### ✅ 4. Export Options

**Current exports:**
- **Paste Report**: Generate formatted report frames directly in Figma
- **Copy to Clipboard**: Export findings as formatted text
- **JSON Export**: Download complete analysis data

---

## What Edgy Will Do (Roadmap)

### 🚧 5. AI Screen Generation

**Status**: Server infrastructure complete, plugin integration pending

Generate missing edge case screens using AI:
- Analyze your existing designs and component library
- Generate React + shadcn/ui code for missing screens
- Create Figma frames from generated layouts
- Support for empty states, error screens, loading states, etc.

**Technical stack:**
- Claude/Gemini for code generation
- shadcn/ui component library
- Automatic component detection and token extraction

### 🚧 6. Interactive Prototype Deployment

**Status**: Server infrastructure complete, plugin integration pending

Deploy live, interactive prototypes:
- **Next.js + shadcn/ui**: Full React application with routing
- **Vercel deployment**: One-click deploy with automatic URL
- **Interactive navigation**: Working links between screens
- **Component library**: All shadcn/ui components pre-configured
- **Design tokens**: Colors, typography, spacing from your designs

**Features:**
- Shareable prototype URL
- Responsive layouts
- Working form interactions
- Client-side navigation
- Production-ready code

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FIGMA PLUGIN                           │
│  ┌─────────────────┐              ┌─────────────────┐       │
│  │  Plugin Sandbox │◄────────────►│    Plugin UI    │       │
│  │  (main thread)  │   messages   │  (React iframe) │       │
│  │                 │              │                 │       │
│  │ • Extract nodes │              │ • Analysis UI   │       │
│  │ • Generate      │              │ • Results view  │       │
│  │   reports       │              │ • Settings      │       │
│  │ • Paste frames  │              │ • shadcn/ui     │       │
│  └────────┬────────┘              └────────┬────────┘       │
│           │                                │                │
└───────────│────────────────────────────────│────────────────┘
            │ Figma API                      │ API calls
            ▼                                ▼
    ┌───────────────┐              ┌─────────────────────┐
    │ Figma Canvas  │              │  Edgy Server (Hono) │
    │ (read/write)  │              │  on Vercel          │
    └───────────────┘              └──────────┬──────────┘
                                              │
                                              ▼
                            ┌──────────────────────────────┐
                            │ • Pattern detection          │
                            │ • AI review (Claude/Gemini)  │
                            │ • Screen generation          │
                            │ • Prototype deployment       │
                            │ • Knowledge base (enriched)  │
                            │ • Postgres (job tracking)    │
                            └──────────────────────────────┘
```

### Key Technologies

**Plugin:**
- TypeScript, React, Vite
- shadcn/ui components
- Figma Plugin API
- In-browser analysis engine

**Server:**
- Hono (lightweight web framework)
- Drizzle ORM + Postgres
- Claude Opus 4.5 / Gemini 3 Flash
- Server-Sent Events (SSE) for real-time progress
- Vercel deployment

**Knowledge Base:**
- 29 research sources (NNG, Baymard, W3C, IBM Carbon)
- Structured training data
- YAML rule definitions
- Component mappings (shadcn/ui)

---

## Installation

### Prerequisites

- Figma Desktop app (required for plugin development)
- Node.js 18+
- Optional: Claude or Gemini API key for AI review

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/inversestudio/edgy.git
   cd edgy
   ```

2. **Install dependencies**
   ```bash
   # Plugin
   cd plugin
   npm install
   npm run dev

   # Server (optional, for AI features)
   cd ../server
   npm install
   npm run dev
   ```

3. **Load plugin in Figma**
   - Open Figma Desktop
   - Plugins → Development → Import plugin from manifest
   - Select `plugin/manifest.json`

4. **Configure API keys (optional)**
   - Open plugin settings
   - Add Claude or Gemini API key for AI review
   - Add Vercel token for prototype deployment

---

## Usage

### Running Analysis

1. **Select screens** in Figma (Frame nodes)
2. **Open Edgy plugin** (Plugins → Development → Edgy)
3. **Click "Analyze Selected Screens"**
4. **Wait for analysis** (heuristic + AI review)
5. **Review findings** in the results panel

### Understanding Results

**Severity levels:**
- 🔴 **Critical**: Must fix — blocks key user flows
- 🟡 **Warning**: Should fix — impacts UX quality
- 🔵 **Info**: Consider — nice-to-have improvements

**Categories:**
- Each finding is categorized (empty states, error states, etc.)
- Component recommendations show specific shadcn/ui components
- Flow completeness shows missing screens per flow type

### Exporting Results

**Paste Report:**
- Click "Paste Report to Canvas"
- Generates formatted report frames in Figma
- Includes summary, per-screen findings, and recommendations

**Copy to Clipboard:**
- Click "Copy Findings"
- Paste into docs, Notion, Linear, etc.

**JSON Export:**
- Download complete analysis data
- Use for tracking, automation, or integration

---

## Configuration

### Plugin Settings

**API Keys:**
- **Claude/Gemini**: Required for AI review
- **Vercel**: Required for prototype deployment
- **Edgy Server**: Optional for server-side analysis

**Analysis Options:**
- **Use Server Mode**: Run analysis on server vs. in-browser
- **AI Provider**: Choose Claude or Gemini
- **Generate Missing Screens**: Enable AI screen generation (coming soon)

### Knowledge Base

Located in `knowledge/`:
- `rules/` - YAML rule definitions for each category
- `flows/` - Flow type definitions (checkout, auth, etc.)
- `components/` - Component mappings and catalog
- `enriched/` - Scraped research sources (29 articles)

**To update:**
```bash
# Re-scrape research sources
node scripts/scrape-training-sources.js

# Edit rules
vim knowledge/rules/empty-states.yml
```

---

## Project Structure

```
edgy/
├── plugin/                 # Figma plugin
│   ├── src/
│   │   ├── plugin/        # Sandbox code (main thread)
│   │   │   ├── index.ts          # Message handlers
│   │   │   ├── extractor.ts      # Node tree extraction
│   │   │   ├── reporter.ts       # Report generation
│   │   │   ├── prototype-export.ts # Prototype generation
│   │   │   └── shadcn-code-generator.ts # React code gen
│   │   └── ui/            # React UI (iframe)
│   │       ├── App.tsx           # Main app component
│   │       ├── lib/
│   │       │   ├── analyze.ts    # In-browser analysis
│   │       │   ├── llm-reviewer.ts # AI review
│   │       │   └── types.ts      # Shared types
│   │       └── components/       # shadcn/ui components
│   └── manifest.json      # Plugin manifest
│
├── server/                 # Backend server
│   ├── src/
│   │   ├── routes/        # API endpoints
│   │   │   ├── analyze.ts        # POST /analyze
│   │   │   ├── deploy.ts         # POST /deploy
│   │   │   └── credentials.ts    # Credential management
│   │   ├── services/      # Business logic
│   │   │   ├── pipeline.ts       # Analysis pipeline
│   │   │   ├── analyzer.ts       # Pattern detection
│   │   │   ├── llm-reviewer.ts   # AI review
│   │   │   ├── screen-generator.ts # Screen generation
│   │   │   └── deployer.ts       # Vercel deployment
│   │   ├── db/            # Database
│   │   │   ├── schema.ts         # Drizzle schema
│   │   │   ├── jobs.ts           # Job tracking
│   │   │   └── credentials.ts    # Encrypted storage
│   │   └── lib/           # Utilities
│   │       ├── knowledge.ts      # Knowledge base loader
│   │       ├── enriched-knowledge.ts # Research content
│   │       ├── llm.ts            # Claude/Gemini client
│   │       └── sse.ts            # Server-sent events
│   └── vercel.json        # Vercel config
│
├── knowledge/              # Rule definitions
│   ├── rules/             # Edge case rules (YAML)
│   ├── flows/             # Flow definitions (YAML)
│   ├── components/        # Component mappings (YAML)
│   └── enriched/          # Research sources (scraped)
│
├── analysis/               # Shared analysis engine
│   └── src/
│       ├── pattern-detector.ts   # UI pattern detection
│       ├── rule-engine.ts        # Rule matching
│       ├── expect-checker.ts     # State verification
│       └── finding-generator.ts  # Finding generation
│
└── scripts/                # Utility scripts
    ├── scrape-training-sources.js # Web scraper
    └── README.md
```

---

## Development

### Building

```bash
# Plugin
cd plugin
npm run build    # Production build
npm run dev      # Development with watch

# Server
cd server
npm run build    # TypeScript compilation
npm run dev      # Local development
```

### Testing

```bash
# Run analysis with sample data
cd analysis
npm test

# Test knowledge base loading
cd server
npm run build && node dist/index.js
```

### Deployment

**Server:**
```bash
cd server
vercel deploy --prod
```

**Plugin:**
- Build plugin: `cd plugin && npm run build`
- Publish to Figma Community (manual process)

---

## Contributing

We welcome contributions! Areas of interest:

- **Additional rule definitions** for edge cases
- **Flow type definitions** for common patterns
- **Component mappings** for design systems beyond shadcn/ui
- **Research sources** to enhance the knowledge base
- **Bug fixes and improvements**

See [ROADMAP.md](ROADMAP.md) for planned features and integration steps.

---

## Knowledge Base

Edgy's recommendations are grounded in research from trusted sources:

### Research Sources (29 articles)
- **Nielsen Norman Group** (11 articles): Usability heuristics, empty states, error handling, edge cases
- **Baymard Institute** (4 articles): E-commerce UX, checkout optimization, form fields
- **W3C/WCAG** (3 sources): Accessibility standards, error prevention, form validation
- **IBM Carbon** (2 patterns): Empty states, loading patterns
- **DubBot** (1 article): Accessible destructive buttons

### Structured Training Data
- Practical patterns for all 8 categories
- Accessibility guidelines (vision, motor, hearing, cognitive)
- Localization patterns (RTL, text expansion, cultural formats)
- Process guidance for discovering edge cases
- Example scenarios for training

---

## License

MIT License - see [LICENSE](LICENSE) for details

---

## Acknowledgments

- Research sources: Nielsen Norman Group, Baymard Institute, W3C, IBM Carbon Design System
- Built with: Figma Plugin API, React, shadcn/ui, Hono, Claude AI, Gemini AI
- Hackathon: Created for the Edgy Hackathon — February 2026

---

## Links

- [Documentation](docs/)
- [Roadmap](ROADMAP.md)
- [Server README](server/README.md)
- [Knowledge Base](knowledge/)
- [GitHub](https://github.com/inversestudio/edgy)
