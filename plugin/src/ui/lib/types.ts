// ============================================================
// Shared types for the Edgy plugin
// ============================================================

// --- Flow Types ---

export type FlowType =
  | "authentication"
  | "checkout"
  | "onboarding"
  | "crud"
  | "search"
  | "settings"
  | "upload"
  | "subscription"
  | "messaging"
  | "booking";

export interface DetectedFlowType {
  type: FlowType;
  confidence: "high" | "medium" | "low";
  triggerScreens: string[];
  triggerPatterns: string[];
}

export interface MissingScreenFinding {
  id: string;
  flow_type: FlowType;
  flow_name: string;
  severity: "critical" | "warning" | "info";
  missing_screen: {
    id: string;
    name: string;
    description: string;
  };
  recommendation: {
    message: string;
    components: ComponentSuggestion[];
  };
  placeholder?: {
    suggested_name: string;
    width: number;
    height: number;
  };
}

// --- Pattern Detection ---

export type PatternType =
  | "form"
  | "form-field"
  | "list"
  | "data-display"
  | "button"
  | "destructive-action"
  | "navigation"
  | "search"
  | "media"
  | "modal";

export interface DetectedPattern {
  type: PatternType;
  nodes: ExtractedNode[];
  confidence: "high" | "medium" | "low";
  context: string;
}

// --- Screen Extraction ---

// --- Rich Styling Types ---

export interface RichColor {
  r: number;
  g: number;
  b: number;
  a: number; // opacity 0-1
}

export interface RichFill {
  type: "solid" | "gradient" | "image";
  color?: RichColor;
  gradient?: {
    type: "linear" | "radial";
    stops: { position: number; color: RichColor }[];
    angle?: number; // for linear gradients
  };
  imageUrl?: string; // base64 data URL for images
  opacity: number;
}

export interface RichStroke {
  color: RichColor;
  weight: number;
  align: "inside" | "outside" | "center";
  dashPattern?: number[];
}

export interface RichShadow {
  type: "drop" | "inner";
  color: RichColor;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
}

export interface RichTextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number | "auto";
  letterSpacing: number;
  textAlign: "left" | "center" | "right" | "justify";
  textDecoration: "none" | "underline" | "line-through";
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
  color: RichColor;
}

export interface RichAutoLayout {
  direction: "horizontal" | "vertical";
  padding: { top: number; right: number; bottom: number; left: number };
  gap: number;
  alignItems: "start" | "center" | "end" | "stretch";
  justifyContent: "start" | "center" | "end" | "space-between";
  wrap: boolean;
}

export interface RichBorderRadius {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface ExtractedNode {
  id: string;
  name: string;
  type: string;
  componentName?: string;
  componentProperties?: Record<string, { value: string }>;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  children: ExtractedNode[];
  textContent?: string;

  // --- Rich styling (new) ---
  opacity?: number;
  blendMode?: string;
  fills?: RichFill[];
  strokes?: RichStroke[];
  effects?: RichShadow[];
  borderRadius?: RichBorderRadius;
  textStyle?: RichTextStyle;
  autoLayout?: RichAutoLayout;
  clipsContent?: boolean;

  /** Base64 image data for nodes with image fills or complex vector content */
  imageBase64?: string;
  /** Whether this node has an image fill that was exported */
  hasImageFill?: boolean;

  // --- Legacy (kept for backwards compatibility) ---
  /** @deprecated Use fills instead */
  legacyFills?: [number, number, number][];
  /** @deprecated Use strokes instead */
  legacyStrokes?: [number, number, number][];
  strokeWeight?: number;
}

export interface ExtractedScreen {
  screen_id: string;
  name: string;
  order: number;
  thumbnail_base64?: string;
  width: number;
  height: number;
  x: number;
  y: number;
  node_tree: ExtractedNode;
}

// --- Analysis Input/Output ---

export interface AnalysisInput {
  analysis_id: string;
  timestamp: string;
  file_name: string;
  screens: ExtractedScreen[];
}

export interface AnalysisFinding {
  id: string;
  rule_id: string;
  category: EdgeCaseCategory;
  severity: "critical" | "warning" | "info";
  annotation_target?: "element" | "screen";
  title: string;
  description: string;
  affected_nodes: string[];
  affected_area?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  recommendation: {
    message: string;
    components: ComponentSuggestion[];
  };
}

export interface ComponentSuggestion {
  name: string;
  shadcn_id: string;
  variant?: string;
  description: string;
}

export interface ScreenResult {
  screen_id: string;
  name: string;
  findings: AnalysisFinding[];
}

export interface FlowFinding {
  id: string;
  rule_id: string;
  category: EdgeCaseCategory;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  recommendation: {
    message: string;
    components: ComponentSuggestion[];
  };
}

export interface AnalysisOutput {
  analysis_id: string;
  completed_at: string;
  summary: {
    screens_analyzed: number;
    total_findings: number;
    critical: number;
    warning: number;
    info: number;
  };
  screens: ScreenResult[];
  flow_findings: FlowFinding[];
  missing_screen_findings: MissingScreenFinding[];
  llm_enhanced?: boolean;
  llm_error?: string;
}

// --- Edge Case Categories ---

export type EdgeCaseCategory =
  | "empty-states"
  | "loading-states"
  | "error-states"
  | "edge-inputs"
  | "boundary-conditions"
  | "permissions"
  | "connectivity"
  | "destructive-actions";

// --- AI Provider ---

export type AIProvider = "claude" | "gemini";

// --- Plugin ↔ UI Messages ---

// --- Plugin -> UI Messages ---

export type PluginMessage =
  | { type: "selection-changed"; screens: { id: string; name: string }[] }
  | { type: "extraction-complete"; data: AnalysisInput }
  | { type: "thumbnail-progress"; current: number; total: number }
  | { type: "render-complete" }
  | { type: "error"; message: string }
  | { type: "api-key-result"; key: string | null }
  | { type: "api-key-saved" }
  | { type: "provider-result"; provider: AIProvider }
  | { type: "provider-saved" }
  | { type: "ai-screen-gen-result"; enabled: boolean }
  | { type: "ai-screen-gen-saved" }
  | { type: "findings-cleared" }
  | { type: "canvas-documentation-cleared"; removedCount: number }
  | { type: "prototype-ready"; files: PrototypeFile[] }
  | { type: "prototype-progress"; message: string }
  | { type: "vercel-token-result"; token: string | null }
  | { type: "vercel-token-saved" }
  | {
      type: "component-library-result";
      serialized: string;
      components: DiscoveredComponentInfo[];
      stats: { total: number; buttons: number; inputs: number; cards: number; checkboxes: number };
    }
  | { type: "component-instantiated"; success: boolean; nodeId?: string; error?: string }
  | {
      type: "design-tokens-result";
      tokens: {
        primaryColor: { r: number; g: number; b: number };
        backgroundColor: { r: number; g: number; b: number };
        textColor: { r: number; g: number; b: number };
        mutedColor: { r: number; g: number; b: number };
        borderColor: { r: number; g: number; b: number };
        borderRadius: number;
        fontFamily: string;
        baseFontSize: number;
        headingFontSize: number;
        semanticColors?: {
          primary?: { r: number; g: number; b: number };
          primaryForeground?: { r: number; g: number; b: number };
          secondary?: { r: number; g: number; b: number };
          secondaryForeground?: { r: number; g: number; b: number };
          destructive?: { r: number; g: number; b: number };
          destructiveForeground?: { r: number; g: number; b: number };
          muted?: { r: number; g: number; b: number };
          mutedForeground?: { r: number; g: number; b: number };
          background?: { r: number; g: number; b: number };
          foreground?: { r: number; g: number; b: number };
          border?: { r: number; g: number; b: number };
          card?: { r: number; g: number; b: number };
          cardForeground?: { r: number; g: number; b: number };
        };
      };
    };

// Component info from plugin
export interface DiscoveredComponentInfo {
  key: string;
  name: string;
  componentSetName?: string;
  variantProperties?: Record<string, string>;
  width: number;
  height: number;
}

// --- UI -> Plugin Messages ---

// Generated layout type (matches llm-screen-generator.ts)
export interface GeneratedScreenLayout {
  name: string;
  width: number;
  height: number;
  backgroundColor: { r: number; g: number; b: number };
  elements: GeneratedElement[];
}

export interface GeneratedElement {
  type: "frame" | "text" | "button" | "input" | "card" | "icon" | "separator" | "checkbox" | "image" | "component";
  name: string;
  x: number;
  y: number;
  width: number | "fill";
  height: number | "hug";
  style?: Record<string, unknown>;
  children?: GeneratedElement[];
  textContent?: string;
  variant?: string;
  /** For type="component": reference to a Figma component */
  componentRef?: {
    name: string;
    overrides?: Record<string, string>;
  };
}

// Prototype export types
export interface PrototypeExportRequest {
  existingScreens: ExtractedScreen[];
  generatedLayouts: Record<string, GeneratedScreenLayout>;
  missingFindings: MissingScreenFinding[];
  designTokens?: {
    primaryColor: { r: number; g: number; b: number };
    backgroundColor: { r: number; g: number; b: number };
    textColor: { r: number; g: number; b: number };
    mutedColor: { r: number; g: number; b: number };
    borderColor: { r: number; g: number; b: number };
    borderRadius: number;
    fontFamily: string;
    baseFontSize: number;
    headingFontSize: number;
  };
  options?: {
    includeNavigation?: boolean;
    imageBasedFallback?: boolean;
    projectName?: string;
  };
}

export interface PrototypeFile {
  path: string;
  content: string;
}

export type UIMessage =
  | { type: "start-extraction" }
  | { type: "save-findings"; results: AnalysisOutput; includePlaceholders?: boolean; generatedLayouts?: Record<string, GeneratedScreenLayout> }
  | { type: "get-api-key" }
  | { type: "set-api-key"; key: string }
  | { type: "clear-api-key" }
  | { type: "get-provider" }
  | { type: "set-provider"; provider: AIProvider }
  | { type: "get-ai-screen-gen" }
  | { type: "set-ai-screen-gen"; enabled: boolean }
  | { type: "get-vercel-token" }
  | { type: "set-vercel-token"; token: string }
  | { type: "clear-vercel-token" }
  | { type: "clear-findings"; screenIds: string[] }
  | { type: "clear-canvas-documentation" }
  | { type: "resize"; width: number; height: number }
  | { type: "export-prototype"; request: PrototypeExportRequest }
  | { type: "get-component-library" }
  | { type: "instantiate-component"; componentKey: string }
  | { type: "get-design-tokens"; screenIds: string[] };
