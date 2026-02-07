// Shared types for the analysis engine — mirrors plugin types

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

export interface AnalysisInput {
  analysis_id: string;
  timestamp: string;
  file_name: string;
  screens: ExtractedScreen[];
}

export interface AnalysisFinding {
  id: string;
  rule_id: string;
  category: string;
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
  category: string;
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

// --- Rule definitions ---

export interface DetectedPattern {
  type: PatternType;
  nodes: ExtractedNode[];
  confidence: "high" | "medium" | "low";
  context: string; // Description of what was detected
}

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

export interface Rule {
  id: string;
  category: string;
  name: string;
  severity: "critical" | "warning" | "info";
  annotation_target?: "element" | "screen";
  description: string;
  triggers: {
    component_names?: string[];
    layer_name_patterns?: string[];
    pattern_types?: PatternType[];
  };
  expects: {
    in_screen?: ExpectCondition[];
    in_flow?: ExpectCondition[];
  };
  recommendation: {
    message: string;
    components: { shadcn_id: string; variant?: string; label: string }[];
  };
}

export type VisualCueType = "error" | "warning" | "success" | "info";

export interface ExpectCondition {
  component_names?: string[];
  with_properties?: Record<string, string>;
  layer_name_patterns?: string[];
  /** Visual cue types to detect via color classification (e.g., ["error"]) */
  with_visual_cues?: VisualCueType[];
}

export interface TriggeredRule {
  rule: Rule;
  matchedNodes: ExtractedNode[];
  pattern?: DetectedPattern;
}

export interface UnmetExpectation {
  rule: Rule;
  matchedNodes: ExtractedNode[];
  reason: string;
}
