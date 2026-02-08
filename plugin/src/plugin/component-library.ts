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
  icons: DiscoveredComponent[];
}

// --- Discovery ---

/**
 * Discovers all available components in the file and team libraries.
 */
export async function discoverComponents(): Promise<ComponentLibrary> {
  const library: ComponentLibrary = {
    components: new Map(),
    byType: new Map(),
    buttons: [],
    inputs: [],
    cards: [],
    checkboxes: [],
    icons: [],
  };

  // Load all pages first (required for findAllWithCriteria with dynamic page access)
  await figma.loadAllPagesAsync();

  // Get local components
  const localComponents = figma.root.findAllWithCriteria({
    types: ["COMPONENT"],
  }) as ComponentNode[];

  for (const comp of localComponents) {
    const discovered = await processComponent(comp, false);
    if (discovered) {
      addToLibrary(library, discovered);
    }
  }

  // Get component sets (for variants)
  const componentSets = figma.root.findAllWithCriteria({
    types: ["COMPONENT_SET"],
  }) as ComponentSetNode[];

  for (const set of componentSets) {
    for (const child of set.children) {
      if (child.type === "COMPONENT") {
        const discovered = await processComponent(child, false, set.name);
        if (discovered) {
          addToLibrary(library, discovered);
        }
      }
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

  console.log(`[edgy] Discovered ${library.components.size} components`);
  console.log(`[edgy] - Buttons: ${library.buttons.length}`);
  console.log(`[edgy] - Inputs: ${library.inputs.length}`);
  console.log(`[edgy] - Cards: ${library.cards.length}`);

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

  // Categorize by common patterns
  if (nameLower.includes("button") || nameLower.includes("btn") || nameLower.includes("cta")) {
    library.buttons.push(comp);
  }
  if (nameLower.includes("input") || nameLower.includes("textfield") || nameLower.includes("text field") || nameLower.includes("text-field")) {
    library.inputs.push(comp);
  }
  if (nameLower.includes("card") || nameLower.includes("container") || nameLower.includes("panel")) {
    library.cards.push(comp);
  }
  if (nameLower.includes("checkbox") || nameLower.includes("check box") || nameLower.includes("check-box") || nameLower.includes("toggle")) {
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
 * Finds the best matching component for a given type and variant.
 */
export function findBestComponent(
  library: ComponentLibrary,
  type: "button" | "input" | "card" | "checkbox" | "icon",
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
    const match = candidates.find((c) => {
      // Check variant properties
      if (c.variantProperties) {
        const values = Object.values(c.variantProperties).map((v) => v.toLowerCase());
        if (values.some((v) => v.includes(variantLower) || variantLower.includes(v))) {
          return true;
        }
      }
      // Check name
      return c.name.toLowerCase().includes(variantLower);
    });
    if (match) return match;
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
    const buttonSets = groupByComponentSet(library.buttons);
    for (const [setName, variants] of buttonSets) {
      if (variants.length === 1) {
        sections.push(`- ${setName}`);
      } else {
        const variantNames = variants
          .map((v) => {
            if (v.variantProperties) {
              return Object.entries(v.variantProperties)
                .map(([k, val]) => `${k}=${val}`)
                .join(", ");
            }
            return v.name;
          })
          .join(" | ");
        sections.push(`- ${setName}: ${variantNames}`);
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

  if (library.checkboxes.length > 0) {
    sections.push("\n### Checkboxes/Toggles");
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
