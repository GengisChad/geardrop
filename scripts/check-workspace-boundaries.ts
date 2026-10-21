import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const workspacePackages = new Map([
  ["@geardrop/runtime-contract", "packages/runtime-contract"],
  ["@geardrop/data-contract", "packages/data-contract"],
]);
const inside = (file: string, directory: string) => {
  const path = relative(directory, file);
  return path === "" || (!path.startsWith(`..`) && !isAbsolute(path));
};

/** Resolve the compiler's actual target, including symlinks, rather than checking spelling. */
export function checkSourceImports(source: string, filename: string, root: string): string[] {
  const dataPath = resolve(root, "packages/data-contract");
  const dataPackage = existsSync(dataPath) ? realpathSync(dataPath) : dataPath;
  const neutral = inside(resolve(filename), dataPackage);
  const app = neutral ? dataPackage : realpathSync(resolve(root, "apps/management"));
  const configFile = ts.readConfigFile(join(app, "tsconfig.json"), ts.sys.readFile);
  if (configFile.error) throw new Error("GD_BOUNDARY_CONFIG_INVALID");
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, app);
  const pkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  const declared = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
  const errors: string[] = [];
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  function check(specifier: string) {
    // Next owns this generated declaration; it is absent on a fresh checkout.
    // Resolve its existing parent through realpath to retain the symlink boundary.
    if (filename === join(app, "next-env.d.ts") && specifier === "./.next/types/routes.d.ts" && !existsSync(resolve(app, specifier))) {
      let parent = dirname(resolve(app, specifier));
      while (!existsSync(parent)) parent = dirname(parent);
      if (inside(realpathSync(parent), app)) return;
    }
    const dependency = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!;
    const resolved = ts.resolveModuleName(specifier, filename, config.options, ts.sys).resolvedModule;
    // TypeScript intentionally does not resolve CSS, but a local stylesheet still has an owner.
    const candidate = resolved?.resolvedFileName
      ?? (specifier.startsWith(".") && specifier.endsWith(".css") ? resolve(dirname(filename), specifier) : null)
      ?? (specifier.startsWith("@/") && specifier.endsWith(".css") ? resolve(app, "src", specifier.slice(2)) : null);
    let valid = false;
    if (candidate && existsSync(candidate)) {
      const target = realpathSync(candidate);
      if (specifier.startsWith(".") || specifier.startsWith("@/")) {
        valid = inside(target, app);
      } else if (workspacePackages.has(dependency)) {
        const expected = realpathSync(resolve(root, workspacePackages.get(dependency)!));
        valid = declared.has(dependency) && specifier === dependency && inside(target, expected);
      } else {
        valid = declared.has(dependency) && (!neutral || dependency === "@supabase/supabase-js") && target.replaceAll("\\", "/").includes("/node_modules/");
      }
    }
    if (!valid) errors.push(`${relative(root, filename)}: GD_WORKSPACE_IMPORT_FORBIDDEN ${specifier}`);
  }
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) check(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) check(arg.text);
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) check(node.moduleReference.expression.text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) check(node.argument.literal.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return errors;
}

export function checkWorkspaceBoundaries(root: string): string[] {
  const app = resolve(root, "apps/management");
  const errors: string[] = [];
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".next"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:[cm]?ts|tsx|mjs|js)$/.test(entry.name)) errors.push(...checkSourceImports(readFileSync(path, "utf8"), path, root));
    }
  }
  walk(app);
  walk(resolve(root, "packages/data-contract/src"));
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = checkWorkspaceBoundaries(process.cwd());
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else console.log("Workspace boundaries: PASS");
}
