/**
 * Component Library
 *
 * Discovers and instantiates actual Figma components from the file.
 * Enables screen generation to use real design system components.
 */

// --- Types ---

export interface DiscoveredComponent {
  /** Component key for instantiation */
  key: string;
  /** Display name */
  name: string;
  /** Parent component set name (e.g., "Button" for "Button/Primary") */
  componentSetName?: string;
  /** Variant properties if part of a component set */
  variantProperties?: Record<string, string>;
  /** Default dimensions */
  width: number;
  height: number;
  /** Whether this is from a team library */
  isRemote: boolean;
  /** Component description if available */
  description?: string;
}

export interface ComponentLibrary {
  /** All discovered components */
  components: Map<string, DiscoveredComponent>;
  /** Components grouped by type (Button, Input, etc.) */
  byType: Map<string, DiscoveredComponent[]>;
  /** Quick lookup by common UI patterns */
  buttons: DiscoveredComponent[];
  inputs: DiscoveredComponent[];
  cards: DiscoveredComponent[];
  checkboxes: DiscoveredComponent[];
  toggles: DiscoveredComponent[]; // Switches/toggles for boolean states
  icons: DiscoveredComponent[];
}

// --- Discovery ---

/**
 * Discovers all available components in the file and team libraries.
 * Stores all variants so we can find specific ones (primary, secondary, destructive, etc.)
 */
export async function discoverComponents(): Promise<ComponentLibrary> {
  const library: ComponentLibrary = {
    components: new Map(),
    byType: new Map(),
    buttons: [],
    inputs: [],
    cards: [],
    checkboxes: [],
    toggles: [],
    icons: [],
  };

  // Load all pages first (required for findAllWithCriteria with dynamic page access)
  await figma.loadAllPagesAsync();

  // Track processed component sets to log them properly
  const processedSets = new Set<string>();

  // Get component sets - these contain the variants we need
  const componentSets = figma.root.findAllWithCriteria({
    types: ["COMPONENT_SET"],
  }) as ComponentSetNode[];

  for (const set of componentSets) {
    processedSets.add(set.name);
    // Process ALL variants in the set so we can find specific ones later
    for (const child of set.children) {
      if (child.type === "COMPONENT") {
        const discovered = await processComponent(child, false, set.name);
        if (discovered) {
          addToLibrary(library, discovered);
        }
      }
    }
  }

  // Get standalone local components (NOT inside component sets)
  const localComponents = figma.root.findAllWithCriteria({
    types: ["COMPONENT"],
  }) as ComponentNode[];

  for (const comp of localComponents) {
    // Skip if this component is inside a component set (already processed above)
    if (comp.parent?.type === "COMPONENT_SET") {
      continue;
    }
    const discovered = await processComponent(comp, false);
    if (discovered) {
      addToLibrary(library, discovered);
    }
  }

  // Also scan for used remote components (from team libraries)
  const instances = figma.root.findAllWithCriteria({
    types: ["INSTANCE"],
  }) as InstanceNode[];

  const processedRemoteKeys = new Set<string>();

  for (const instance of instances) {
    try {
      const mainComponent = await instance.getMainComponentAsync();
      if (mainComponent && mainComponent.remote && !processedRemoteKeys.has(mainComponent.key)) {
        processedRemoteKeys.add(mainComponent.key);
        const discovered = await processComponent(mainComponent, true);
        if (discovered) {
          addToLibrary(library, discovered);
        }
      }
    } catch {
      // Component not accessible
    }
  }

  // Log component SET counts (not variant counts)
  const buttonSets = new Set(library.buttons.map(b => b.componentSetName || b.name)).size;
  const inputSets = new Set(library.inputs.map(i => i.componentSetName || i.name)).size;
  const toggleSets = new Set(library.toggles.map(t => t.componentSetName || t.name)).size;

  console.log(`[edgy] Discovered ${processedSets.size} component sets, ${library.components.size} total variants`);
  console.log(`[edgy] - Button sets: ${buttonSets} (${library.buttons.length} variants)`);
  console.log(`[edgy] - Input sets: ${inputSets} (${library.inputs.length} variants)`);
  console.log(`[edgy] - Toggle/Switch sets: ${toggleSets} (${library.toggles.length} variants)`);

  return library;
}

async function processComponent(
  comp: ComponentNode,
  isRemote: boolean,
  componentSetName?: string
): Promise<DiscoveredComponent | null> {
  try {
    // Get variant properties if part of a component set
    let variantProperties: Record<string, string> | undefined;
    if (comp.parent?.type === "COMPONENT_SET") {
      variantProperties = {};
      const parts = comp.name.split(",").map((s) => s.trim());
      for (const part of parts) {
        const [key, value] = part.split("=").map((s) => s.trim());
        if (key && value) {
          variantProperties[key] = value;
        }
      }
    }

    return {
      key: comp.key,
      name: comp.name,
      componentSetName: componentSetName || (comp.parent?.type === "COMPONENT_SET" ? comp.parent.name : undefined),
      variantProperties,
      width: comp.width,
      height: comp.height,
      isRemote,
      description: comp.description || undefined,
    };
  } catch {
    return null;
  }
}

function addToLibrary(library: ComponentLibrary, comp: DiscoveredComponent): void {
  library.components.set(comp.key, comp);

  // Categorize by type based on name patterns
  const nameLower = (comp.componentSetName || comp.name).toLowerCase();

  // Add to byType map
  const typeName = comp.componentSetName || comp.name;
  if (!library.byType.has(typeName)) {
    library.byType.set(typeName, []);
  }
  library.byType.get(typeName)!.push(comp);

  // Categorize by common patterns - check component SET name for type classification
  if (nameLower.includes("button") || nameLower.includes("btn") || nameLower.includes("cta")) {
    library.buttons.push(comp);
  }
  // Input detection - exclude OTP-specific inputs from general input list
  if (
    (nameLower.includes("input") || nameLower.includes("textfield") || nameLower.includes("text field") || nameLower.includes("text-field")) &&
    !nameLower.includes("otp")
  ) {
    library.inputs.push(comp);
  }
  if (nameLower.includes("card") || nameLower.includes("container") || nameLower.includes("panel")) {
    library.cards.push(comp);
  }
  // Toggles and switches are for boolean on/off - prefer over checkboxes for settings
  if (nameLower.includes("toggle") || nameLower.includes("switch")) {
    library.toggles.push(comp);
  } else if (nameLower.includes("checkbox") || nameLower.includes("check box") || nameLower.includes("check-box")) {
    library.checkboxes.push(comp);
  }
  if (nameLower.includes("icon") || nameLower.includes("icn")) {
    library.icons.push(comp);
  }
}

// --- Instantiation ---

/**
 * Creates an instance of a component by key.
 */
export async function createComponentInstance(
  key: string
): Promise<InstanceNode | null> {
  try {
    // Try to import the component by key
    const component = await figma.importComponentByKeyAsync(key);
    if (component) {
      return component.createInstance();
    }
  } catch (e) {
    console.warn(`[edgy] Failed to instantiate component ${key}:`, e);
  }
  return null;
}

/**
 * Variant aliases - different names for similar button styles
 */
const VARIANT_ALIASES: Record<string, string[]> = {
  link: ["link", "ghost", "text", "tertiary"],
  ghost: ["ghost", "link", "text", "tertiary"],
  secondary: ["secondary", "outline", "bordered"],
  outline: ["outline", "secondary", "bordered"],
  destructive: ["destructive", "danger", "error", "delete"],
  primary: ["primary", "default", "filled", "solid"],
};

/**
 * Finds the best matching component for a given type and variant.
 */
export function findBestComponent(
  library: ComponentLibrary,
  type: "button" | "input" | "card" | "checkbox" | "toggle" | "icon",
  variant?: string
): DiscoveredComponent | null {
  let candidates: DiscoveredComponent[];

  switch (type) {
    case "button":
      candidates = library.buttons;
      break;
    case "input":
      candidates = library.inputs;
      break;
    case "card":
      candidates = library.cards;
      break;
    case "checkbox":
      candidates = library.checkboxes;
      break;
    case "toggle":
      candidates = library.toggles;
      break;
    case "icon":
      candidates = library.icons;
      break;
    default:
      return null;
  }

  if (candidates.length === 0) return null;

  // If variant specified, try to find matching variant
  if (variant) {
    const variantLower = variant.toLowerCase();
    // Get aliases for this variant
    const aliasesToCheck = VARIANT_ALIASES[variantLower] || [variantLower];

    for (const alias of aliasesToCheck) {
      const match = candidates.find((c) => {
        // Check variant properties
        if (c.variantProperties) {
          const values = Object.values(c.variantProperties).map((v) => v.toLowerCase());
          if (values.some((v) => v.includes(alias) || alias.includes(v))) {
            return true;
          }
        }
        // Check component name (variant name like "Style=Ghost")
        return c.name.toLowerCase().includes(alias);
      });
      if (match) {
        console.log(`[edgy] Found ${type} variant "${variant}" as "${match.name}"`);
        return match;
      }
    }
  }

  // Return first candidate (usually the default)
  // Prefer non-variant components or "default" variants
  const defaultComp = candidates.find(
    (c) =>
      !c.variantProperties ||
      Object.values(c.variantProperties).some((v) =>
        ["default", "primary", "filled", "solid"].includes(v.toLowerCase())
      )
  );

  return defaultComp || candidates[0];
}

/**
 * Serializes the component library for passing to LLM.
 */
export function serializeLibraryForLLM(library: ComponentLibrary): string {
  const sections: string[] = [];

  if (library.buttons.length > 0) {
    sections.push("### Buttons");
    sections.push("Use these for ALL button elements. Pick the appropriate variant:");
    const buttonSets = groupByComponentSet(library.buttons);
    for (const [setName, variants] of buttonSets) {
      if (variants.length === 1) {
        sections.push(`- ${setName}`);
      } else {
        // List each variant on its own line for clarity
        sections.push(`- ${setName}:`);
        for (const v of variants) {
          if (v.variantProperties) {
            const variantStr = Object.entries(v.variantProperties)
              .map(([k, val]) => `${k}=${val}`)
              .join(", ");
            // Add usage hints based on variant name
            const valuesLower = Object.values(v.variantProperties).map(val => val.toLowerCase()).join(" ");
            let hint = "";
            if (valuesLower.includes("primary") || valuesLower.includes("filled") || valuesLower.includes("solid")) {
              hint = " (use for main/primary actions)";
            } else if (valuesLower.includes("secondary") || valuesLower.includes("outline") || valuesLower.includes("bordered")) {
              hint = " (use for secondary/cancel actions)";
            } else if (valuesLower.includes("ghost") || valuesLower.includes("text") || valuesLower.includes("link")) {
              hint = " (use for tertiary/skip actions)";
            } else if (valuesLower.includes("destructive") || valuesLower.includes("danger") || valuesLower.includes("delete")) {
              hint = " (use for delete/destructive actions)";
            }
            sections.push(`    - ${variantStr}${hint}`);
          } else {
            sections.push(`    - ${v.name}`);
          }
        }
      }
    }
  }

  if (library.inputs.length > 0) {
    sections.push("\n### Inputs");
    const inputSets = groupByComponentSet(library.inputs);
    for (const [setName, variants] of inputSets) {
      if (variants.length === 1) {
        sections.push(`- ${setName}`);
      } else {
        sections.push(`- ${setName} (${variants.length} variants)`);
      }
    }
  }

  if (library.cards.length > 0) {
    sections.push("\n### Cards/Containers");
    const cardSets = groupByComponentSet(library.cards);
    for (const [setName] of cardSets) {
      sections.push(`- ${setName}`);
    }
  }

  if (library.toggles.length > 0) {
    sections.push("\n### Toggles/Switches");
    sections.push("Use these for boolean on/off settings:");
    const toggleSets = groupByComponentSet(library.toggles);
    for (const [setName] of toggleSets) {
      sections.push(`- ${setName}`);
    }
  }

  if (library.checkboxes.length > 0) {
    sections.push("\n### Checkboxes");
    sections.push("Use these for multi-select options or consent:");
    const checkboxSets = groupByComponentSet(library.checkboxes);
    for (const [setName] of checkboxSets) {
      sections.push(`- ${setName}`);
    }
  }

  return sections.join("\n");
}

function groupByComponentSet(
  components: DiscoveredComponent[]
): Map<string, DiscoveredComponent[]> {
  const groups = new Map<string, DiscoveredComponent[]>();

  for (const comp of components) {
    const setName = comp.componentSetName || comp.name;
    if (!groups.has(setName)) {
      groups.set(setName, []);
    }
    groups.get(setName)!.push(comp);
  }

  return groups;
}
