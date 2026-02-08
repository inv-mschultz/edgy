declare module "virtual:edgy-knowledge" {
  export const rules: Record<string, { name?: string; rules?: any[] }>;
  export const flows: Record<string, {
    name?: string;
    flow_type?: string;
    description?: string;
    triggers?: { any_of?: any[] };
    expected_screens?: any[];
  }>;
  export const componentMappings: { mappings?: Record<string, any> };
}
