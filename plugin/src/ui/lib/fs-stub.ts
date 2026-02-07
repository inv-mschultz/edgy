// Stubs for Node.js modules that are imported by analysis engine files
// but never called in the browser code path. These prevent Vite from
// erroring on unresolvable Node.js built-in imports.

export function readFileSync(): never {
  throw new Error("readFileSync is not available in the browser");
}

export function readdirSync(): never {
  throw new Error("readdirSync is not available in the browser");
}

export function writeFileSync(): never {
  throw new Error("writeFileSync is not available in the browser");
}

export function existsSync(): boolean {
  return false;
}

export function renameSync(): never {
  throw new Error("renameSync is not available in the browser");
}

// path stubs
export function resolve(...args: string[]): string {
  return args.join("/");
}

export function join(...args: string[]): string {
  return args.join("/");
}

export function dirname(p: string): string {
  return p;
}

// url stubs
export function fileURLToPath(url: string): string {
  return url;
}

// yaml stub (the parse function — only needed if yaml package import leaks through)
export function parse(content: string): unknown {
  return {};
}

export default {};
