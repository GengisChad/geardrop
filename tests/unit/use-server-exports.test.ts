import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A "use server" module may export only async functions (types are erased). A constant exported
 * from one passes tsc, eslint and vitest but fails `next build`, which is how the express
 * checkout's first draft broke the production build (2026-10-12). This catches it in seconds.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe('"use server" modules', () => {
  const files = sourceFiles(join(process.cwd(), "src")).filter((file) =>
    /^\s*["']use server["'];?/.test(readFileSync(file, "utf8").replace(/^(\s*\/\/.*\n|\s*\/\*[\s\S]*?\*\/\s*)*/, "")),
  );

  it("are found", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("export nothing but async functions and types", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const offending = source
        .split(/\r?\n/)
        .filter((line) => /^export\s+(const|let|var|class|function\s|default\s|enum\s|\{)/.test(line));
      expect(offending, file).toEqual([]);
    }
  });
});
