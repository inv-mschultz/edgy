// ============================================================
// Shared types for the Edgy plugin
// ============================================================

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

export type PluginMessage =
  | { type: "selection-changed"; screens: { id: string; name: string }[] }
  | { type: "extraction-complete"; data: AnalysisInput }
  | { type: "thumbnail-progress"; current: number; total: number }
  | { type: "render-complete" }
  | { type: "error"; message: string };

export type UIMessage =
  | { type: "start-extraction" }
  | { type: "render-results"; results: AnalysisOutput };
