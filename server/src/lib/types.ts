/**
 * Shared types for the Edgy server
 *
 * These mirror the plugin types but are self-contained for the server.
 */

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

// --- Rich Styling Types ---

export interface RichColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface RichFill {
  type: "solid" | "gradient" | "image";
  color?: RichColor;
  gradient?: {
    type: "linear" | "radial";
    stops: { position: number; color: RichColor }[];
    angle?: number;
  };
  imageUrl?: string;
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

/** Element classification from the client-side classifier */
export interface ElementClassification {
  elementType: string;
  confidence: number;
  shadcnComponent?: string;
  variant?: string;
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
  opacity?: number;
  blendMode?: string;
  fills?: RichFill[];
  strokes?: RichStroke[];
  effects?: RichShadow[];
  borderRadius?: RichBorderRadius;
  textStyle?: RichTextStyle;
  autoLayout?: RichAutoLayout;
  clipsContent?: boolean;
  imageBase64?: string;
  hasImageFill?: boolean;
  legacyFills?: [number, number, number][];
  legacyStrokes?: [number, number, number][];
  strokeWeight?: number;
  /** Client-side element classification (from element-classifier.ts) */
  classification?: ElementClassification;
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

// --- Generated Screens ---

export interface GeneratedScreenLayout {
  name: string;
  width: number;
  height: number;
  backgroundColor: { r: number; g: number; b: number };
  elements: GeneratedElement[];
}

export interface GeneratedElement {
  type:
    | "frame"
    | "text"
    | "button"
    | "input"
    | "card"
    | "icon"
    | "separator"
    | "checkbox"
    | "image"
    | "component";
  name: string;
  x: number;
  y: number;
  width: number | "fill";
  height: number | "hug";
  style?: Record<string, unknown>;
  children?: GeneratedElement[];
  textContent?: string;
  variant?: string;
  componentRef?: {
    name: string;
    overrides?: Record<string, string>;
  };
}

// --- Design Tokens ---

export interface DesignTokens {
  primaryColor: { r: number; g: number; b: number };
  backgroundColor: { r: number; g: number; b: number };
  textColor: { r: number; g: number; b: number };
  mutedColor: { r: number; g: number; b: number };
  borderColor: { r: number; g: number; b: number };
  borderRadius: number;
  fontFamily: string;
  baseFontSize: number;
  headingFontSize: number;
  semanticColors?: SemanticColorTokens;
}

export interface SemanticColorTokens {
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
}

// --- Component Library ---

export interface DiscoveredComponentInfo {
  key: string;
  name: string;
  componentSetName?: string;
  variantProperties?: Record<string, string>;
  width: number;
  height: number;
}

// --- API Request/Response Types ---

export interface AnalyzeRequest {
  file_name: string;
  screens: ExtractedScreen[];
  design_tokens?: DesignTokens;
  component_library?: {
    serialized: string;
    components: DiscoveredComponentInfo[];
  };
  options?: {
    llm_provider?: AIProvider;
    llm_api_key?: string;
    generate_missing_screens?: boolean;
    auto_deploy?: boolean;
  };
}

export interface AnalyzeResponse {
  job_id: string;
  stream_url: string;
}

export interface JobStatus {
  id: string;
  status: "pending" | "processing" | "complete" | "error";
  created_at: string;
  completed_at?: string;
  result?: AnalysisOutput;
  generated_layouts?: Record<string, GeneratedScreenLayout>;
  prototype_url?: string;
  error?: string;
}

// --- SSE Event Types ---

export type SSEProgressEvent = {
  stage:
    | "patterns"
    | "rules"
    | "expectations"
    | "findings"
    | "flows"
    | "llm_review"
    | "generating"
    | "generation_complete"
    | "prototype"
    | "deploying";
  message: string;
  progress: number;
  screen?: string;
  current?: number;
  total?: number;
};

export type SSECompleteEvent = {
  analysis: AnalysisOutput;
  generated_layouts?: Record<string, GeneratedScreenLayout>;
  prototype_url?: string;
};

export type SSEErrorEvent = {
  code: string;
  message: string;
};

// --- Prototype Types ---

export interface PrototypeFile {
  path: string;
  content: string;
}

export interface PrototypeExportRequest {
  existingScreens: ExtractedScreen[];
  generatedLayouts: Record<string, GeneratedScreenLayout>;
  missingFindings: MissingScreenFinding[];
  designTokens?: DesignTokens;
  options?: {
    includeNavigation?: boolean;
    imageBasedFallback?: boolean;
    projectName?: string;
    exportMode?: "html" | "nextjs";
  };
}
