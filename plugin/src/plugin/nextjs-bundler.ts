/**
 * Next.js Bundler
 *
 * Generates a complete Next.js project structure with shadcn/ui setup.
 */

import type { GeneratedScreen, DesignTokens } from "./shadcn-code-generator";
import type { PrototypeFile } from "../ui/lib/types";

interface RGB {
  r: number;
  g: number;
  b: number;
}

// --- Types ---

export interface BundleOptions {
  projectName: string;
  screens: GeneratedScreen[];
  tokens?: DesignTokens;
  includeNavigation?: boolean;
}

// --- Main Bundle Function ---

/**
 * Generate a complete Next.js project bundle.
 */
export function generateNextJsBundle(options: BundleOptions): PrototypeFile[] {
  const { projectName, screens, tokens, includeNavigation = true } = options;
  const files: PrototypeFile[] = [];

  // Collect all imports used across all screens
  const allImports = new Set<string>();
  for (const screen of screens) {
    for (const imp of screen.component.imports) {
      allImports.add(imp);
    }
  }

  // 1. Package files
  files.push(generatePackageJson(projectName));
  files.push(generateTsConfig());
  files.push(generateTailwindConfig(tokens));
  files.push(generatePostCssConfig());
  files.push(generateComponentsJson());
  files.push(generateNextConfig());

  // 2. Lib files
  files.push(generateUtilsLib());

  // 3. Global styles
  files.push(generateGlobalsCss(tokens));

  // 4. Layout
  files.push(generateLayout(projectName));

  // 5. Index page (screen gallery)
  files.push(generateIndexPage(screens, projectName));

  // 6. Screen pages
  for (const screen of screens) {
    files.push(generateScreenPage(screen));
  }

  // 7. shadcn components (only the ones used)
  const componentFiles = generateShadcnComponents(allImports);
  files.push(...componentFiles);

  // 8. Navigation component (if enabled)
  if (includeNavigation) {
    files.push(generateNavigationComponent(screens));
  }

  // 9. README
  files.push(generateReadme(projectName, screens));

  return files;
}

// --- Package Configuration ---

function generatePackageJson(projectName: string): PrototypeFile {
  const slug = slugify(projectName);
  const content = {
    name: slug,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "next lint",
    },
    dependencies: {
      next: "14.2.0",
      react: "^18.2.0",
      "react-dom": "^18.2.0",
      "class-variance-authority": "^0.7.0",
      clsx: "^2.1.0",
      "tailwind-merge": "^2.2.0",
      "lucide-react": "^0.344.0",
      "@radix-ui/react-avatar": "^1.0.4",
      "@radix-ui/react-checkbox": "^1.0.4",
      "@radix-ui/react-dialog": "^1.0.5",
      "@radix-ui/react-label": "^2.0.2",
      "@radix-ui/react-radio-group": "^1.1.3",
      "@radix-ui/react-select": "^2.0.0",
      "@radix-ui/react-separator": "^1.0.3",
      "@radix-ui/react-slot": "^1.0.2",
      "@radix-ui/react-switch": "^1.0.3",
      "@radix-ui/react-tabs": "^1.0.4",
    },
    devDependencies: {
      "@types/node": "^20.11.0",
      "@types/react": "^18.2.0",
      "@types/react-dom": "^18.2.0",
      autoprefixer: "^10.4.17",
      postcss: "^8.4.35",
      tailwindcss: "^3.4.1",
      typescript: "^5.3.0",
    },
  };

  return {
    path: "package.json",
    content: JSON.stringify(content, null, 2),
  };
}

function generateTsConfig(): PrototypeFile {
  const content = {
    compilerOptions: {
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      plugins: [{ name: "next" }],
      paths: {
        "@/*": ["./*"],
      },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"],
  };

  return {
    path: "tsconfig.json",
    content: JSON.stringify(content, null, 2),
  };
}

function generateTailwindConfig(tokens?: DesignTokens): PrototypeFile {
  const primaryHsl = tokens?.primaryColor ? rgbToHsl(tokens.primaryColor) : "222.2 47.4% 11.2%";
  const bgHsl = tokens?.backgroundColor ? rgbToHsl(tokens.backgroundColor) : "0 0% 100%";
  const fgHsl = tokens?.foregroundColor ? rgbToHsl(tokens.foregroundColor) : "222.2 47.4% 11.2%";
  const mutedHsl = tokens?.mutedColor ? rgbToHsl(tokens.mutedColor) : "210 40% 96.1%";
  const borderHsl = tokens?.borderColor ? rgbToHsl(tokens.borderColor) : "214.3 31.8% 91.4%";
  const radius = tokens?.borderRadius ?? 0.5;

  const content = `${imp} type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(${borderHsl})",
        input: "hsl(${borderHsl})",
        ring: "hsl(${primaryHsl})",
        background: "hsl(${bgHsl})",
        foreground: "hsl(${fgHsl})",
        primary: {
          DEFAULT: "hsl(${primaryHsl})",
          foreground: "hsl(210 40% 98%)",
        },
        secondary: {
          DEFAULT: "hsl(${mutedHsl})",
          foreground: "hsl(${fgHsl})",
        },
        destructive: {
          DEFAULT: "hsl(0 84.2% 60.2%)",
          foreground: "hsl(210 40% 98%)",
        },
        muted: {
          DEFAULT: "hsl(${mutedHsl})",
          foreground: "hsl(215.4 16.3% 46.9%)",
        },
        accent: {
          DEFAULT: "hsl(${mutedHsl})",
          foreground: "hsl(${fgHsl})",
        },
        popover: {
          DEFAULT: "hsl(${bgHsl})",
          foreground: "hsl(${fgHsl})",
        },
        card: {
          DEFAULT: "hsl(${bgHsl})",
          foreground: "hsl(${fgHsl})",
        },
      },
      borderRadius: {
        lg: "${radius}rem",
        md: "${Math.max(0, radius - 0.125)}rem",
        sm: "${Math.max(0, radius - 0.25)}rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
`;

  return {
    path: "tailwind.config.ts",
    content,
  };
}

function generatePostCssConfig(): PrototypeFile {
  return {
    path: "postcss.config.js",
    content: `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
  };
}

function generateComponentsJson(): PrototypeFile {
  const content = {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "default",
    rsc: true,
    tsx: true,
    tailwind: {
      config: "tailwind.config.ts",
      css: "app/globals.css",
      baseColor: "slate",
      cssVariables: false,
    },
    aliases: {
      components: "@/components",
      utils: "@/lib/utils",
    },
  };

  return {
    path: "components.json",
    content: JSON.stringify(content, null, 2),
  };
}

function generateNextConfig(): PrototypeFile {
  // Note: Using string concat to avoid Vite parsing import() in template
  const typeAnnotation = `/** @type {${imp}('next').NextConfig} */`;
  return {
    path: "next.config.mjs",
    content: `${typeAnnotation}
const nextConfig = {
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
`,
  };
}

// --- Lib Files ---

function generateUtilsLib(): PrototypeFile {
  return {
    path: "lib/utils.ts",
    content: `${imp} { type ClassValue, clsx } from "clsx";
${imp} { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,
  };
}

// --- Global Styles ---

function generateGlobalsCss(tokens?: DesignTokens): PrototypeFile {
  return {
    path: "app/globals.css",
    content: `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`,
  };
}

// --- Layout ---

function generateLayout(projectName: string): PrototypeFile {
  return {
    path: "app/layout.tsx",
    content: `${imp} type { Metadata } from "next";
${imp} { Inter } from "next/font/google";
${imp} "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "${projectName}",
  description: "Prototype generated from Figma design",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
`,
  };
}

// --- Index Page ---

function generateIndexPage(screens: GeneratedScreen[], projectName: string): PrototypeFile {
  const screenLinks = screens
    .map(
      (s) =>
        `        <a
          href="/screens/${slugify(s.name)}"
          className="group block rounded-lg border p-4 transition-colors hover:border-primary"
        >
          <h2 className="font-semibold group-hover:text-primary">${s.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">View screen</p>
        </a>`
    )
    .join("\n");

  return {
    path: "app/page.tsx",
    content: `export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold">${projectName}</h1>
        <p className="mt-2 text-muted-foreground">
          Prototype with ${screens.length} screen${screens.length !== 1 ? "s" : ""}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
${screenLinks}
        </div>
      </div>
    </main>
  );
}
`,
  };
}

// --- Screen Pages ---

function generateScreenPage(screen: GeneratedScreen): PrototypeFile {
  const slug = slugify(screen.name);

  return {
    path: `app/screens/${slug}/page.tsx`,
    content: screen.component.code,
  };
}

// --- Navigation Component ---

function generateNavigationComponent(screens: GeneratedScreen[]): PrototypeFile {
  const navLinks = screens
    .map((s) => `    { name: "${s.name}", href: "/screens/${slugify(s.name)}" },`)
    .join("\n");

  return {
    path: "components/navigation.tsx",
    content: `"use client";

${imp} Link from "next/link";
${imp} { usePathname } from "next/navigation";
${imp} { cn } from "@/lib/utils";

const screens = [
${navLinks}
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full border bg-background/80 px-4 py-2 shadow-lg backdrop-blur-sm">
      <ul className="flex items-center gap-2">
        <li>
          <Link
            href="/"
            className={cn(
              "rounded-full px-3 py-1 text-sm transition-colors hover:bg-muted",
              pathname === "/" && "bg-primary text-primary-foreground"
            )}
          >
            Home
          </Link>
        </li>
        {screens.map((screen) => (
          <li key={screen.href}>
            <Link
              href={screen.href}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition-colors hover:bg-muted",
                pathname === screen.href && "bg-primary text-primary-foreground"
              )}
            >
              {screen.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
`,
  };
}

// --- shadcn Components ---

function generateShadcnComponents(imports: Set<string>): PrototypeFile[] {
  const files: PrototypeFile[] = [];

  // Determine which component files we need
  const neededComponents = new Set<string>();

  if (imports.has("Button")) neededComponents.add("button");
  if (imports.has("Input")) neededComponents.add("input");
  if (imports.has("Textarea")) neededComponents.add("textarea");
  if (imports.has("Label")) neededComponents.add("label");
  if (imports.has("Checkbox")) neededComponents.add("checkbox");
  if (imports.has("Switch")) neededComponents.add("switch");
  if (imports.has("Separator")) neededComponents.add("separator");
  if (imports.has("Badge")) neededComponents.add("badge");
  if (imports.has("Avatar") || imports.has("AvatarImage") || imports.has("AvatarFallback")) neededComponents.add("avatar");
  if (imports.has("Card") || imports.has("CardContent") || imports.has("CardHeader")) neededComponents.add("card");
  if (imports.has("Select") || imports.has("SelectTrigger") || imports.has("SelectContent")) neededComponents.add("select");
  if (imports.has("RadioGroup") || imports.has("RadioGroupItem")) neededComponents.add("radio-group");
  if (imports.has("Tabs") || imports.has("TabsList") || imports.has("TabsTrigger")) neededComponents.add("tabs");
  if (imports.has("Dialog") || imports.has("DialogTrigger") || imports.has("DialogContent")) neededComponents.add("dialog");

  // Generate each component file
  for (const comp of neededComponents) {
    const componentCode = SHADCN_COMPONENTS[comp];
    if (componentCode) {
      files.push({
        path: `components/ui/${comp}.tsx`,
        content: componentCode,
      });
    }
  }

  return files;
}

// --- README ---

function generateReadme(projectName: string, screens: GeneratedScreen[]): PrototypeFile {
  const screenList = screens.map((s) => `- ${s.name}`).join("\n");

  return {
    path: "README.md",
    content: `# ${projectName}

This is a Next.js prototype generated from a Figma design.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) to view the prototype.

## Screens

${screenList}

## Built With

- [Next.js](https://nextjs.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
`,
  };
}

// --- Utility Functions ---

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function rgbToHsl(color: RGB): string {
  const r = color.r;
  const g = color.g;
  const b = color.b;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// --- shadcn Component Templates ---

// Helper to prevent Vite from parsing import statements in strings
const imp = "import";

const SHADCN_COMPONENTS: Record<string, string> = {
  button: `${imp} * as React from "react";
${imp} { Slot } from "@radix-ui/react-slot";
${imp} { cva, type VariantProps } from "class-variance-authority";
${imp} { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
`,

  input: `${imp} * as React from "react";
${imp} { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
`,

  textarea: `${imp} * as React from "react";
${imp} { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
`,

  label: `"use client";

${imp} * as React from "react";
${imp} * as LabelPrimitive from "@radix-ui/react-label";
${imp} { cva, type VariantProps } from "class-variance-authority";
${imp} { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
`,

  checkbox: `"use client";

${imp} * as React from "react";
${imp} * as CheckboxPrimitive from "@radix-ui/react-checkbox";
${imp} { Check } from "lucide-react";
${imp} { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
`,

  switch: `"use client";

${imp} * as React from "react";
${imp} * as SwitchPrimitives from "@radix-ui/react-switch";
${imp} { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
`,

  separator: `"use client";

${imp} * as React from "react";
${imp} * as SeparatorPrimitive from "@radix-ui/react-separator";
${imp} { cn } from "@/lib/utils";

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(
  (
    { className, orientation = "horizontal", decorative = true, ...props },
    ref
  ) => (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      )}
      {...props}
    />
  )
);
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
`,

  badge: `${imp} * as React from "react";
${imp} { cva, type VariantProps } from "class-variance-authority";
${imp} { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
`,

  avatar: `"use client";

${imp} * as React from "react";
${imp} * as AvatarPrimitive from "@radix-ui/react-avatar";
${imp} { cn } from "@/lib/utils";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
`,

  card: `${imp} * as React from "react";
${imp} { cn } from "@/lib/utils";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
`,

  select: `"use client";

${imp} * as React from "react";
${imp} * as SelectPrimitive from "@radix-ui/react-select";
${imp} { Check, ChevronDown, ChevronUp } from "lucide-react";
${imp} { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem };
`,

  "radio-group": `"use client";

${imp} * as React from "react";
${imp} * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
${imp} { Circle } from "lucide-react";
${imp} { cn } from "@/lib/utils";

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn("grid gap-2", className)}
      {...props}
      ref={ref}
    />
  );
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
`,

  tabs: `"use client";

${imp} * as React from "react";
${imp} * as TabsPrimitive from "@radix-ui/react-tabs";
${imp} { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
`,

  dialog: `"use client";

${imp} * as React from "react";
${imp} * as DialogPrimitive from "@radix-ui/react-dialog";
${imp} { X } from "lucide-react";
${imp} { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
`,
};
