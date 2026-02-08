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
  /** Solid fill colors as [r, g, b] tuples (0-1 range). Only visible solid fills. */
  fills?: [number, number, number][];
  /** Solid stroke colors as [r, g, b] tuples (0-1 range). Only visible solid strokes. */
  strokes?: [number, number, number][];
  /** Stroke weight in pixels. Only present when strokes exist. */
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
  | { type: "findings-cleared" }
  | { type: "canvas-documentation-cleared"; removedCount: number };

// --- UI -> Plugin Messages ---

export type UIMessage =
  | { type: "start-extraction" }
  | { type: "save-findings"; results: AnalysisOutput; includePlaceholders?: boolean }
  | { type: "get-api-key" }
  | { type: "set-api-key"; key: string }
  | { type: "clear-api-key" }
  | { type: "clear-findings"; screenIds: string[] }
  | { type: "clear-canvas-documentation" }
  | { type: "resize"; width: number; height: number };
