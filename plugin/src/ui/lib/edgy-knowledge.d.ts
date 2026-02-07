declare module "virtual:edgy-knowledge" {
  export const rules: Record<string, { name?: string; rules?: any[] }>;
  export const componentMappings: { mappings?: Record<string, any> };
}
