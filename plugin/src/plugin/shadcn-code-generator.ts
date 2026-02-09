/**
 * shadcn Code Generator
 *
 * Takes classified UI elements and generates React/TSX code
 * using shadcn/ui components.
 */

import type { ClassifiedElement, UIElementType } from "./element-classifier";
import type { GeneratedElement, GeneratedScreenLayout } from "../ui/lib/types";

// --- Types ---

interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface GeneratedComponent {
  name: string;
  code: string;
  imports: Set<string>;
}

export interface GeneratedScreen {
  name: string;
  fileName: string;
  component: GeneratedComponent;
}

export interface DesignTokens {
  primaryColor?: RGB;
  backgroundColor?: RGB;
  foregroundColor?: RGB;
  mutedColor?: RGB;
  borderColor?: RGB;
  borderRadius?: number;
}

// --- Code Generation ---

/**
 * Generate a React component from a classified element tree.
 */
export function generateScreenComponent(
  screenName: string,
  root: ClassifiedElement,
  tokens?: DesignTokens
): GeneratedComponent {
  const imports = new Set<string>();
  const jsx = generateJSX(root, imports, 2);

  // Build import statements
  const shadcnImports = buildShadcnImports(imports);

  const componentName = pascalCase(screenName);
  const code = `${shadcnImports}

export default function ${componentName}() {
  return (
${jsx}
  );
}
`;

  return {
    name: componentName,
    code,
    imports,
  };
}

/**
 * Generate JSX for a classified element and its children.
 */
function generateJSX(
  element: ClassifiedElement,
  imports: Set<string>,
  indent: number
): string {
  const pad = "  ".repeat(indent);
  const { elementType, shadcnComponent, props, textContent, children, variant, node } = element;

  // Generate based on element type
  switch (elementType) {
    case "button":
      imports.add("Button");
      return `${pad}<Button${variant && variant !== "default" ? ` variant="${variant}"` : ""}>${escapeJSX(textContent || "Button")}</Button>`;

    case "input":
      imports.add("Input");
      const placeholder = props.placeholder as string || "Enter value...";
      return `${pad}<Input placeholder="${escapeJSX(placeholder)}" />`;

    case "textarea":
      imports.add("Textarea");
      const textareaPlaceholder = props.placeholder as string || "Enter text...";
      return `${pad}<Textarea placeholder="${escapeJSX(textareaPlaceholder)}" />`;

    case "select":
      imports.add("Select");
      imports.add("SelectTrigger");
      imports.add("SelectValue");
      imports.add("SelectContent");
      imports.add("SelectItem");
      return `${pad}<Select>
${pad}  <SelectTrigger>
${pad}    <SelectValue placeholder="Select..." />
${pad}  </SelectTrigger>
${pad}  <SelectContent>
${pad}    <SelectItem value="option1">Option 1</SelectItem>
${pad}    <SelectItem value="option2">Option 2</SelectItem>
${pad}  </SelectContent>
${pad}</Select>`;

    case "checkbox":
      imports.add("Checkbox");
      const checkboxLabel = textContent || element.node.name || "";
      if (checkboxLabel) {
        imports.add("Label");
        return `${pad}<div className="flex items-center space-x-2">
${pad}  <Checkbox id="${slugify(checkboxLabel)}" />
${pad}  <Label htmlFor="${slugify(checkboxLabel)}">${escapeJSX(checkboxLabel)}</Label>
${pad}</div>`;
      }
      return `${pad}<Checkbox />`;

    case "radio":
      imports.add("RadioGroup");
      imports.add("RadioGroupItem");
      imports.add("Label");
      return `${pad}<RadioGroup defaultValue="option1">
${pad}  <div className="flex items-center space-x-2">
${pad}    <RadioGroupItem value="option1" id="option1" />
${pad}    <Label htmlFor="option1">Option 1</Label>
${pad}  </div>
${pad}  <div className="flex items-center space-x-2">
${pad}    <RadioGroupItem value="option2" id="option2" />
${pad}    <Label htmlFor="option2">Option 2</Label>
${pad}  </div>
${pad}</RadioGroup>`;

    case "switch":
      imports.add("Switch");
      const switchLabel = textContent || element.node.name || "";
      if (switchLabel) {
        imports.add("Label");
        return `${pad}<div className="flex items-center space-x-2">
${pad}  <Switch id="${slugify(switchLabel)}" />
${pad}  <Label htmlFor="${slugify(switchLabel)}">${escapeJSX(switchLabel)}</Label>
${pad}</div>`;
      }
      return `${pad}<Switch />`;

    case "card":
      imports.add("Card");
      imports.add("CardContent");
      if (children.length === 0) {
        return `${pad}<Card>
${pad}  <CardContent className="p-6">
${pad}    <p className="text-muted-foreground">Card content</p>
${pad}  </CardContent>
${pad}</Card>`;
      }
      // Card with children
      imports.add("CardHeader");
      imports.add("CardTitle");
      const cardChildren = children.map(child => generateJSX(child, imports, indent + 2)).join("\n");
      return `${pad}<Card>
${pad}  <CardContent className="p-6">
${cardChildren}
${pad}  </CardContent>
${pad}</Card>`;

    case "badge":
      imports.add("Badge");
      return `${pad}<Badge${variant ? ` variant="${variant}"` : ""}>${escapeJSX(textContent || "Badge")}</Badge>`;

    case "avatar":
      imports.add("Avatar");
      imports.add("AvatarImage");
      imports.add("AvatarFallback");
      return `${pad}<Avatar>
${pad}  <AvatarImage src="/placeholder-avatar.jpg" alt="Avatar" />
${pad}  <AvatarFallback>AB</AvatarFallback>
${pad}</Avatar>`;

    case "separator":
      imports.add("Separator");
      const orientation = props.orientation as string || "horizontal";
      return `${pad}<Separator${orientation === "vertical" ? ' orientation="vertical"' : ""} />`;

    case "heading":
      const level = props.level as number || 2;
      const HeadingTag = `h${level}`;
      const headingClass = level === 1 ? "text-4xl font-bold" : level === 2 ? "text-2xl font-semibold" : "text-xl font-medium";
      return `${pad}<${HeadingTag} className="${headingClass}">${escapeJSX(textContent || "Heading")}</${HeadingTag}>`;

    case "paragraph":
      return `${pad}<p className="text-muted-foreground">${escapeJSX(textContent || "")}</p>`;

    case "label":
      imports.add("Label");
      return `${pad}<Label>${escapeJSX(textContent || "Label")}</Label>`;

    case "link":
      const href = props.href as string || "#";
      return `${pad}<a href="${href}" className="text-primary underline-offset-4 hover:underline">${escapeJSX(textContent || "Link")}</a>`;

    case "image":
      const src = props.src as string || "/placeholder.jpg";
      const alt = node.name || "Image";
      const imgWidth = Math.round(node.width);
      const imgHeight = Math.round(node.height);
      return `${pad}<img src="${src}" alt="${escapeJSX(alt)}" width={${imgWidth}} height={${imgHeight}} className="object-cover" />`;

    case "icon":
      // Use Lucide icons placeholder
      const iconName = props.name as string || "Circle";
      return `${pad}<div className="w-6 h-6 flex items-center justify-center">
${pad}  {/* Icon: ${escapeJSX(iconName)} */}
${pad}  <span className="text-muted-foreground">●</span>
${pad}</div>`;

    case "tabs":
      imports.add("Tabs");
      imports.add("TabsList");
      imports.add("TabsTrigger");
      imports.add("TabsContent");
      return `${pad}<Tabs defaultValue="tab1">
${pad}  <TabsList>
${pad}    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
${pad}    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
${pad}  </TabsList>
${pad}  <TabsContent value="tab1">Tab 1 content</TabsContent>
${pad}  <TabsContent value="tab2">Tab 2 content</TabsContent>
${pad}</Tabs>`;

    case "dialog":
      imports.add("Dialog");
      imports.add("DialogTrigger");
      imports.add("DialogContent");
      imports.add("DialogHeader");
      imports.add("DialogTitle");
      imports.add("DialogDescription");
      imports.add("Button");
      return `${pad}<Dialog>
${pad}  <DialogTrigger asChild>
${pad}    <Button variant="outline">Open Dialog</Button>
${pad}  </DialogTrigger>
${pad}  <DialogContent>
${pad}    <DialogHeader>
${pad}      <DialogTitle>Dialog Title</DialogTitle>
${pad}      <DialogDescription>Dialog description goes here.</DialogDescription>
${pad}    </DialogHeader>
${pad}  </DialogContent>
${pad}</Dialog>`;

    case "header":
    case "nav":
      // Generate a header/nav container with children
      const headerChildren = children.map(child => generateJSX(child, imports, indent + 1)).join("\n");
      return `${pad}<header className="flex items-center justify-between p-4 border-b">
${headerChildren || `${pad}  <span>Header</span>`}
${pad}</header>`;

    case "footer":
      const footerChildren = children.map(child => generateJSX(child, imports, indent + 1)).join("\n");
      return `${pad}<footer className="p-4 border-t text-center text-muted-foreground">
${footerChildren || `${pad}  <span>Footer</span>`}
${pad}</footer>`;

    case "list":
    case "list-item":
      // Render as flex container with children
      const listChildren = children.map(child => generateJSX(child, imports, indent + 1)).join("\n");
      return `${pad}<div className="flex flex-col gap-2">
${listChildren}
${pad}</div>`;

    case "container":
    default:
      // Container - render children with layout
      if (children.length === 0) {
        // Empty container - skip or render placeholder
        if (textContent) {
          return `${pad}<div>${escapeJSX(textContent)}</div>`;
        }
        return "";
      }

      // Determine layout from autoLayout
      const layoutClass = getLayoutClass(element);
      const containerChildren = children
        .map(child => generateJSX(child, imports, indent + 1))
        .filter(jsx => jsx.trim() !== "")
        .join("\n");

      if (!containerChildren.trim()) {
        return "";
      }

      return `${pad}<div className="${layoutClass}">
${containerChildren}
${pad}</div>`;
  }
}

// --- Import Building ---

function buildShadcnImports(imports: Set<string>): string {
  const componentGroups: Record<string, string[]> = {
    button: ["Button"],
    input: ["Input"],
    textarea: ["Textarea"],
    label: ["Label"],
    checkbox: ["Checkbox"],
    switch: ["Switch"],
    separator: ["Separator"],
    badge: ["Badge"],
    avatar: ["Avatar", "AvatarImage", "AvatarFallback"],
    card: ["Card", "CardContent", "CardHeader", "CardTitle", "CardDescription", "CardFooter"],
    select: ["Select", "SelectTrigger", "SelectValue", "SelectContent", "SelectItem", "SelectGroup"],
    "radio-group": ["RadioGroup", "RadioGroupItem"],
    tabs: ["Tabs", "TabsList", "TabsTrigger", "TabsContent"],
    dialog: ["Dialog", "DialogTrigger", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription", "DialogFooter"],
  };

  const importLines: string[] = [];
  const usedGroups = new Set<string>();

  // Group imports by component file
  for (const [group, components] of Object.entries(componentGroups)) {
    const usedComponents = components.filter(c => imports.has(c));
    if (usedComponents.length > 0) {
      usedGroups.add(group);
      importLines.push(
        `import { ${usedComponents.join(", ")} } from "@/components/ui/${group}";`
      );
    }
  }

  if (importLines.length === 0) {
    return "";
  }

  return importLines.join("\n");
}

// --- Layout Helpers ---

function getLayoutClass(element: ClassifiedElement): string {
  const { node } = element;
  const classes: string[] = [];

  if (node.autoLayout) {
    const { direction, gap, alignItems, justifyContent, padding } = node.autoLayout;

    classes.push("flex");
    classes.push(direction === "horizontal" ? "flex-row" : "flex-col");

    if (gap > 0) {
      classes.push(`gap-${gapToTailwind(gap)}`);
    }

    if (alignItems === "center") {
      classes.push("items-center");
    } else if (alignItems === "end") {
      classes.push("items-end");
    }

    if (justifyContent === "center") {
      classes.push("justify-center");
    } else if (justifyContent === "end") {
      classes.push("justify-end");
    } else if (justifyContent === "space-between") {
      classes.push("justify-between");
    }

    // Add padding if present
    const uniformPadding = padding.top === padding.right && padding.right === padding.bottom && padding.bottom === padding.left;
    if (uniformPadding && padding.top > 0) {
      classes.push(`p-${paddingToTailwind(padding.top)}`);
    } else {
      if (padding.top > 0) classes.push(`pt-${paddingToTailwind(padding.top)}`);
      if (padding.right > 0) classes.push(`pr-${paddingToTailwind(padding.right)}`);
      if (padding.bottom > 0) classes.push(`pb-${paddingToTailwind(padding.bottom)}`);
      if (padding.left > 0) classes.push(`pl-${paddingToTailwind(padding.left)}`);
    }
  } else {
    // Default layout
    classes.push("flex", "flex-col", "gap-4");
  }

  return classes.join(" ");
}

function gapToTailwind(gap: number): string {
  if (gap <= 0) return "0";
  if (gap <= 4) return "1";
  if (gap <= 8) return "2";
  if (gap <= 12) return "3";
  if (gap <= 16) return "4";
  if (gap <= 20) return "5";
  if (gap <= 24) return "6";
  if (gap <= 32) return "8";
  if (gap <= 40) return "10";
  if (gap <= 48) return "12";
  return "16";
}

function paddingToTailwind(padding: number): string {
  return gapToTailwind(padding);
}

// --- Utility Functions ---

function pascalCase(str: string): string {
  const result = str
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
  // Ensure it doesn't start with a number (invalid JS identifier)
  if (/^\d/.test(result)) {
    return "Screen" + result;
  }
  return result;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeJSX(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/{/g, "&#123;")
    .replace(/}/g, "&#125;");
}

/**
 * Generate all screen components from classified trees.
 */
export function generateAllScreens(
  screens: Array<{ name: string; classifiedTree: ClassifiedElement }>,
  tokens?: DesignTokens
): GeneratedScreen[] {
  return screens.map(({ name, classifiedTree }) => {
    const component = generateScreenComponent(name, classifiedTree, tokens);
    const fileName = slugify(name) + ".tsx";

    return {
      name,
      fileName,
      component,
    };
  });
}

// --- Generated Layout Support ---

/**
 * Generate a React component from a GeneratedScreenLayout (AI-generated).
 */
export function generateComponentFromLayout(
  screenName: string,
  layout: GeneratedScreenLayout,
  tokens?: DesignTokens
): GeneratedComponent {
  const imports = new Set<string>();
  const jsx = generateJSXFromElements(layout.elements || [], imports, 2);

  const shadcnImports = buildShadcnImports(imports);
  const componentName = pascalCase(screenName);

  const code = `${shadcnImports}

export default function ${componentName}() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
${jsx || '      <div className="flex-1 p-4" />'}
    </div>
  );
}
`;

  return {
    name: componentName,
    code,
    imports,
  };
}

/**
 * Generate JSX from GeneratedElement array.
 */
function generateJSXFromElements(
  elements: GeneratedElement[],
  imports: Set<string>,
  indent: number
): string {
  if (!elements || !Array.isArray(elements)) return "";
  return elements
    .map((el) => generateJSXFromElement(el, imports, indent))
    .filter((jsx) => jsx.trim() !== "")
    .join("\n");
}

/**
 * Generate JSX from a single GeneratedElement.
 */
function generateJSXFromElement(
  element: GeneratedElement,
  imports: Set<string>,
  indent: number
): string {
  const pad = "  ".repeat(indent);
  const { type, textContent, children, variant } = element;

  switch (type) {
    case "button":
      imports.add("Button");
      const btnVariant = variant && variant !== "default" ? ` variant="${variant}"` : "";
      return `${pad}<Button${btnVariant}>${escapeJSX(textContent || "Button")}</Button>`;

    case "input":
      imports.add("Input");
      return `${pad}<Input placeholder="${escapeJSX(textContent || "Enter value...")}" />`;

    case "checkbox":
      imports.add("Checkbox");
      if (textContent) {
        imports.add("Label");
        const id = slugify(textContent);
        return `${pad}<div className="flex items-center space-x-2">
${pad}  <Checkbox id="${id}" />
${pad}  <Label htmlFor="${id}">${escapeJSX(textContent)}</Label>
${pad}</div>`;
      }
      return `${pad}<Checkbox />`;

    case "card":
      imports.add("Card");
      imports.add("CardContent");
      if (children && children.length > 0) {
        const cardChildren = generateJSXFromElements(children, imports, indent + 2);
        return `${pad}<Card>
${pad}  <CardContent className="p-6">
${cardChildren}
${pad}  </CardContent>
${pad}</Card>`;
      }
      return `${pad}<Card>
${pad}  <CardContent className="p-6">
${pad}    <p className="text-muted-foreground">${escapeJSX(textContent || "Card content")}</p>
${pad}  </CardContent>
${pad}</Card>`;

    case "separator":
      imports.add("Separator");
      return `${pad}<Separator />`;

    case "icon":
      return `${pad}<div className="w-6 h-6 rounded bg-muted" />`;

    case "image":
      return `${pad}<div className="rounded-lg bg-muted aspect-video" />`;

    case "text":
      if (!textContent) return "";
      // Detect heading vs paragraph based on style
      const style = element.style || {};
      const fontSize = (style.fontSize as number) || 14;
      if (fontSize >= 24) {
        return `${pad}<h1 className="text-3xl font-bold">${escapeJSX(textContent)}</h1>`;
      } else if (fontSize >= 20) {
        return `${pad}<h2 className="text-2xl font-semibold">${escapeJSX(textContent)}</h2>`;
      } else if (fontSize >= 16) {
        return `${pad}<h3 className="text-lg font-medium">${escapeJSX(textContent)}</h3>`;
      }
      return `${pad}<p className="text-muted-foreground">${escapeJSX(textContent)}</p>`;

    case "frame":
    case "component":
    default:
      // Container - render children
      if (children && children.length > 0) {
        const childrenJsx = generateJSXFromElements(children, imports, indent + 1);
        return `${pad}<div className="flex flex-col gap-4">
${childrenJsx}
${pad}</div>`;
      }
      if (textContent) {
        return `${pad}<div>${escapeJSX(textContent)}</div>`;
      }
      return "";
  }
}

/**
 * Generate screen components from GeneratedScreenLayout array.
 */
export function generateScreensFromLayouts(
  layouts: Array<{ name: string; layout: GeneratedScreenLayout }>,
  tokens?: DesignTokens
): GeneratedScreen[] {
  return layouts.map(({ name, layout }) => {
    const component = generateComponentFromLayout(name, layout, tokens);
    const fileName = slugify(name) + ".tsx";

    return {
      name,
      fileName,
      component,
    };
  });
}
