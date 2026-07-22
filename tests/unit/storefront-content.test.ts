import { readFileSync } from "node:fs";import { join } from "node:path";import { describe,expect,it } from "vitest";
describe("dynamic storefront content",()=>{
  it("reads content and settings through request-scoped repositories",()=>{const content=readFileSync(join(process.cwd(),"src/lib/storefront/content-repository.ts"),"utf8");const settings=readFileSync(join(process.cwd(),"src/lib/storefront/settings-repository.ts"),"utf8");expect(content).toContain("createSupabaseServerClient");expect(content).toContain("requireStaffRole");expect(settings).toContain('.from("site_settings")');expect(content).not.toContain("service_role");});
  it("keeps preview reads authenticated and never mutates publication",()=>{const source=readFileSync(join(process.cwd(),"src/app/api/preview/route.ts"),"utf8");expect(source).toContain("requireStaffRole");expect(source).toContain("draftMode");expect(source).not.toMatch(/\.from\([^)]*\)\.(update|insert|delete)/);});
  it("keeps content provider mock by default",()=>{const source=readFileSync(join(process.cwd(),"src/lib/content/provider.ts"),"utf8");expect(source).toContain('process.env["CONTENT_PROVIDER"] ?? "mock"');});
});
