# Edgy Roadmap

> Integration plan for AI screen generation and interactive prototype deployment

This document details the steps needed to complete Edgy's remaining features: AI-powered screen generation and interactive prototype deployment.

---

## Overview

### ✅ Completed Features

1. **Edge Case Analysis** - Comprehensive 8-category analysis with rule-based detection
2. **AI Review Layer** - Claude/Gemini enhancement with research-backed guidelines
3. **Report Generation** - Paste-to-canvas reports with findings and recommendations
4. **Knowledge Base** - 29 scraped research sources + structured training data
5. **Server Infrastructure** - Hono server with SSE, job tracking, credential storage
6. **Screen Generation API** - Server endpoint for AI screen generation (`/api/v1/analyze`)
7. **Prototype Deployment API** - Server endpoint for Vercel deployment (`/api/v1/deploy`)

### 🚧 Pending Integration

1. **AI Screen Generation** - Plugin integration for generating missing screens
2. **Interactive Prototypes** - Plugin integration for deploying Next.js prototypes

---

## Feature 1: AI Screen Generation

### Current State

**Server (✅ Complete):**
- `screen-generator.ts` - Generates React + shadcn/ui code for missing screens
- Analyzes component library and design tokens
- Creates structured layouts with proper components
- Returns `GeneratedScreenLayout` objects

**Plugin (⚠️ Partial):**
- `shadcn-code-generator.ts` - Converts layouts to Figma nodes
- `screen-designer.ts` - Design token extraction
- `component-library.ts` - Component discovery
- Missing: UI flow to trigger generation and place generated screens

### Integration Steps

#### Step 1: Update Analysis Pipeline
**Location:** `plugin/src/ui/App.tsx`

Add screen generation option to analysis flow:

```typescript
// After analysis completes, offer to generate missing screens
interface AnalysisOptions {
  enableAIReview: boolean;
  generateMissingScreens: boolean; // NEW
  provider: AIProvider;
}
```

**Tasks:**
- [ ] Add checkbox to analysis screen: "Generate missing screens with AI"
- [ ] Store option in component state
- [ ] Pass option to server during analysis

#### Step 2: Handle Generated Layouts
**Location:** `plugin/src/ui/App.tsx`, `plugin/src/plugin/index.ts`

When server returns `generated_layouts`:

```typescript
// In analysis complete handler
if (result.generated_layouts) {
  setGeneratedLayouts(result.generated_layouts);
  setPage("review-generated"); // NEW page
}
```

**Tasks:**
- [ ] Create "Review Generated Screens" page
- [ ] Display preview of each generated screen
- [ ] Show component breakdown (which shadcn components used)
- [ ] Allow user to select which screens to create
- [ ] Add "Create Selected Screens" button

#### Step 3: Create Figma Frames from Layouts
**Location:** `plugin/src/plugin/screen-renderer.ts` (NEW FILE)

```typescript
/**
 * Converts GeneratedScreenLayout to Figma FrameNode
 */
export async function renderLayoutToFigma(
  layout: GeneratedScreenLayout,
  componentLibrary: ComponentLibrary
): Promise<FrameNode> {
  // 1. Create frame with layout dimensions
  // 2. For each element in layout:
  //    - If it's a shadcn component, instantiate from library
  //    - If it's a primitive, create shape
  //    - Apply styles (colors, typography, spacing)
  // 3. Position elements according to layout
  // 4. Return completed frame
}
```

**Tasks:**
- [ ] Create `screen-renderer.ts` with `renderLayoutToFigma()`
- [ ] Implement component instantiation from library
- [ ] Implement style application (colors, fonts, spacing)
- [ ] Handle layout positioning (flex, grid, absolute)
- [ ] Add error handling for missing components

#### Step 4: Message Handlers
**Location:** `plugin/src/plugin/index.ts`

Add message handler for creating screens:

```typescript
case "create-generated-screens": {
  const { layouts, screenIds } = msg;
  const library = await getComponentLibrary();
  
  for (const screenId of screenIds) {
    const layout = layouts[screenId];
    const frame = await renderLayoutToFigma(layout, library);
    
    // Place next to original screens
    frame.x = /* calculate position */;
    frame.y = /* calculate position */;
  }
  
  figma.ui.postMessage({ type: "screens-created", count: screenIds.length });
  break;
}
```

**Tasks:**
- [ ] Add `create-generated-screens` message handler
- [ ] Implement positioning logic (place generated screens next to originals)
- [ ] Add progress reporting for multiple screens
- [ ] Handle errors gracefully

#### Step 5: UI Updates
**Location:** `plugin/src/ui/pages/` (NEW FILES)

Create new page for reviewing generated screens:

```typescript
// ReviewGeneratedScreens.tsx
export function ReviewGeneratedScreens({
  layouts,
  onCreateScreens,
  onCancel
}: ReviewGeneratedScreensProps) {
  const [selectedScreens, setSelectedScreens] = useState<string[]>([]);
  
  return (
    <div>
      <h2>Generated Screens</h2>
      {Object.entries(layouts).map(([id, layout]) => (
        <ScreenPreview
          key={id}
          layout={layout}
          selected={selectedScreens.includes(id)}
          onToggle={(id) => /* toggle selection */}
        />
      ))}
      <Button onClick={() => onCreateScreens(selectedScreens)}>
        Create {selectedScreens.length} Screens
      </Button>
    </div>
  );
}
```

**Tasks:**
- [ ] Create `ReviewGeneratedScreens.tsx` page
- [ ] Create `ScreenPreview.tsx` component
- [ ] Show component breakdown per screen
- [ ] Allow selection/deselection of screens
- [ ] Show progress during creation

#### Step 6: Testing
**Tasks:**
- [ ] Test with empty state generation
- [ ] Test with error state generation
- [ ] Test with loading state generation
- [ ] Test with missing flow screens
- [ ] Verify component instantiation works
- [ ] Verify styles are applied correctly
- [ ] Test error handling for missing components

---

## Feature 2: Interactive Prototype Deployment

### Current State

**Server (✅ Complete):**
- `deployer.ts` - Deploys to Vercel via API
- `nextjs-bundler.ts` - Generates Next.js project structure
- Handles existing + generated screens
- Returns deployment URL

**Plugin (⚠️ Partial):**
- `prototype-export.ts` - Generates HTML/Next.js code
- `html-renderer.ts` - Converts nodes to HTML
- `shadcn-code-generator.ts` - Generates React components
- Missing: UI flow to trigger deployment

### Integration Steps

#### Step 1: Add Export Page
**Location:** `plugin/src/ui/App.tsx`

Add new page state for prototype export:

```typescript
type Page = 
  | "select" 
  | "analyzing" 
  | "results" 
  | "export-prototype" // NEW
  | "deploying"        // NEW
  | "settings";
```

**Tasks:**
- [ ] Add "Export Prototype" button to results page
- [ ] Create `export-prototype` page
- [ ] Show options:
  - [ ] Include generated screens (if any)
  - [ ] Include navigation links
  - [ ] Framework: HTML or Next.js
- [ ] Add "Deploy to Vercel" button (if Next.js selected)

#### Step 2: Generate Prototype Files
**Location:** `plugin/src/plugin/index.ts`

Add message handler for prototype generation:

```typescript
case "generate-prototype": {
  const { screens, generatedLayouts, options } = msg;
  
  // Extract all screens (existing + generated)
  const existingScreens = screens.map(extractScreen);
  
  // Generate prototype files
  const files = options.framework === "nextjs"
    ? generateNextJsPrototype(existingScreens, generatedLayouts, options)
    : generateHtmlPrototype(existingScreens, options);
  
  figma.ui.postMessage({ 
    type: "prototype-ready", 
    files 
  });
  break;
}
```

**Tasks:**
- [ ] Add `generate-prototype` message handler
- [ ] Implement `generateNextJsPrototype()` wrapper
- [ ] Implement `generateHtmlPrototype()` wrapper
- [ ] Extract design tokens for CSS variables
- [ ] Generate navigation between screens
- [ ] Handle component library references

#### Step 3: Deploy to Vercel
**Location:** `plugin/src/ui/lib/vercel-deploy.ts` (NEW FILE)

```typescript
export async function deployToVercel(
  files: PrototypeFile[],
  token: string,
  projectName: string
): Promise<{ url: string; deploymentId: string }> {
  // Call server endpoint
  const response = await fetch(`${SERVER_URL}/api/v1/deploy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": edgyApiKey
    },
    body: JSON.stringify({
      files,
      projectName,
      vercelToken: token
    })
  });
  
  return response.json();
}
```

**Tasks:**
- [ ] Create `vercel-deploy.ts` with `deployToVercel()`
- [ ] Handle SSE progress updates from server
- [ ] Show deployment progress in UI
- [ ] Handle deployment errors
- [ ] Store deployment URL

#### Step 4: Deployment UI
**Location:** `plugin/src/ui/pages/` (NEW FILES)

Create deployment progress page:

```typescript
// DeployingPrototype.tsx
export function DeployingPrototype({
  status,
  progress,
  onComplete
}: DeployingPrototypeProps) {
  return (
    <div>
      <h2>Deploying to Vercel</h2>
      <Progress value={progress} />
      <p>{status}</p>
      {deployResult && (
        <div>
          <h3>Deployment Complete!</h3>
          <a href={deployResult.url} target="_blank">
            Open Prototype
          </a>
          <Button onClick={() => copyToClipboard(deployResult.url)}>
            Copy URL
          </Button>
        </div>
      )}
    </div>
  );
}
```

**Tasks:**
- [ ] Create `DeployingPrototype.tsx` page
- [ ] Show real-time deployment progress
- [ ] Show deployment URL when complete
- [ ] Add copy-to-clipboard button
- [ ] Add open-in-browser button
- [ ] Handle deployment errors gracefully

#### Step 5: Prototype Download (Alternative)
**Location:** `plugin/src/ui/lib/download.ts`

For users without Vercel:

```typescript
export function downloadPrototypeZip(files: PrototypeFile[]): void {
  // Generate ZIP file containing all prototype files
  const zip = new JSZip();
  
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  
  zip.generateAsync({ type: "blob" }).then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "edgy-prototype.zip";
    a.click();
  });
}
```

**Tasks:**
- [ ] Add JSZip dependency
- [ ] Implement `downloadPrototypeZip()`
- [ ] Add "Download Prototype" button
- [ ] Include README with setup instructions
- [ ] Test ZIP extraction and running locally

#### Step 6: Testing
**Tasks:**
- [ ] Test HTML prototype generation
- [ ] Test Next.js prototype generation
- [ ] Test with existing screens only
- [ ] Test with existing + generated screens
- [ ] Test Vercel deployment flow
- [ ] Test download ZIP flow
- [ ] Verify deployed prototype works
- [ ] Test navigation between screens
- [ ] Verify components render correctly

---

## Timeline Estimate

### Phase 1: AI Screen Generation (16-24 hours)
- **Step 1-2**: Analysis pipeline updates (4 hours)
- **Step 3**: Screen rendering logic (6-8 hours)
- **Step 4**: Message handlers (2-3 hours)
- **Step 5**: UI pages (3-4 hours)
- **Step 6**: Testing (1-2 hours)

### Phase 2: Prototype Deployment (12-16 hours)
- **Step 1-2**: Prototype generation (4-5 hours)
- **Step 3**: Vercel deployment (3-4 hours)
- **Step 4**: Deployment UI (2-3 hours)
- **Step 5**: Download alternative (2-3 hours)
- **Step 6**: Testing (1-2 hours)

**Total: 28-40 hours**

---

## Dependencies

### Required
- `jszip` - For ZIP file generation (prototype download)
- None new for screen generation (all dependencies already installed)

### Optional
- Better preview rendering for generated screens
- Advanced layout algorithms (grid, flexbox simulation)

---

## Risk & Mitigation

### Risk 1: Component Instantiation Failures
**Issue:** Generated layouts reference components that don't exist in user's file

**Mitigation:**
- Fallback to basic shapes if component not found
- Show warning in UI listing missing components
- Provide option to skip screens with missing components

### Risk 2: Style Application Complexity
**Issue:** Translating design tokens to Figma styles is complex

**Mitigation:**
- Start with basic styling (colors, fonts, spacing)
- Incremental improvement of style fidelity
- Document limitations clearly to users

### Risk 3: Deployment Failures
**Issue:** Vercel API errors, quota limits, network issues

**Mitigation:**
- Robust error handling with clear error messages
- Always offer download as backup option
- Retry logic for transient failures
- Clear documentation of Vercel requirements

### Risk 4: Generated Code Quality
**Issue:** AI-generated code may have issues or not match design perfectly

**Mitigation:**
- Review layer to validate generated code structure
- Provide editing capabilities for generated screens
- Document that generated screens are starting points
- Allow regeneration with different parameters

---

## Success Criteria

### AI Screen Generation
- [ ] Can generate empty state screens from findings
- [ ] Can generate error state screens from findings
- [ ] Can generate loading state screens from findings
- [ ] Generated screens use actual components from library
- [ ] Generated screens match design system (colors, typography, spacing)
- [ ] Users can review and select which screens to create
- [ ] Screens are placed logically next to originals
- [ ] Process completes in <30 seconds for 5 screens

### Prototype Deployment
- [ ] Can generate Next.js prototype from screens
- [ ] Can deploy to Vercel successfully
- [ ] Deployed prototype loads and displays all screens
- [ ] Navigation between screens works
- [ ] Components render correctly
- [ ] Styling matches original designs
- [ ] Process completes in <2 minutes
- [ ] Users receive working deployment URL
- [ ] Alternative download works for offline use

---

## Future Enhancements

### Post-MVP
1. **Advanced Layout Support**
   - Grid layouts
   - Responsive breakpoints
   - Complex nested structures

2. **Component Customization**
   - Edit generated screens in plugin
   - Adjust spacing and sizing
   - Swap components

3. **Multiple Design Systems**
   - Support beyond shadcn/ui
   - Material UI, Chakra, etc.
   - Custom component libraries

4. **Interactive Behaviors**
   - Form validation in prototypes
   - Modal/dialog interactions
   - Tab/accordion functionality

5. **Collaboration Features**
   - Share analysis results
   - Comment on findings
   - Track resolution status

6. **Analytics Integration**
   - Track which edge cases are most common
   - Learn from user feedback
   - Improve detection accuracy

---

## Questions & Decisions

### Q1: Should generated screens be editable in Figma?
**Decision**: Yes, they should be standard Figma frames that users can edit freely.

### Q2: How should we handle component variants?
**Decision**: Use default variants for MVP, add variant selection in future.

### Q3: Should prototypes include backend functionality?
**Decision**: No, client-side only for MVP. Static data/mock responses.

### Q4: How to handle responsive layouts?
**Decision**: Single breakpoint for MVP (desktop), add responsive in future.

### Q5: Should we support custom domains for deployments?
**Decision**: No for MVP, use Vercel default URLs. Add custom domains in future.

---

## Getting Started

To begin integration:

1. **Review server code**
   - `server/src/services/screen-generator.ts`
   - `server/src/services/deployer.ts`
   - `server/src/routes/analyze.ts`
   - `server/src/routes/deploy.ts`

2. **Review existing plugin code**
   - `plugin/src/plugin/shadcn-code-generator.ts`
   - `plugin/src/plugin/prototype-export.ts`
   - `plugin/src/plugin/component-library.ts`

3. **Start with Phase 1**
   - Follow steps 1-6 for AI Screen Generation
   - Test thoroughly before moving to Phase 2

4. **Reference implementation**
   - Server endpoints already handle the heavy lifting
   - Plugin primarily needs UI and message passing

---

## Support

For questions or issues during integration:
- Review server README: `server/README.md`
- Check API documentation in server route files
- Test with sample data in `analysis/tests/`
- Reference existing UI patterns in `plugin/src/ui/`

---

This roadmap is a living document. Update as integration progresses and new insights emerge.
