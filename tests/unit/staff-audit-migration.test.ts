import { readFileSync } from "node:fs";import { join } from "node:path";import { describe,expect,it } from "vitest";
const path=join(process.cwd(),"supabase/migrations/20260718221500_add_staff_lifecycle_and_audit_context.sql");
describe("staff lifecycle and audit migration",()=>{
  it("adds invite, status, revoke, and last-login fields",()=>{const sql=readFileSync(path,"utf8");for(const value of ["staff_invite_status","invite_email","invited_at","accepted_at","revoked_at","last_login_at"])expect(sql).toContain(value);});
  it("adds only allowlisted typed request context",()=>{const sql=readFileSync(path,"utf8");for(const value of ["request_id","request_method","request_path","request_user_agent","sanitize_audit_context"])expect(sql).toContain(value);expect(sql).not.toContain("authorization");expect(sql).not.toContain("cookie");});
  it("provides guarded owner-only lifecycle RPCs",()=>{const sql=readFileSync(path,"utf8");for(const fn of ["change_staff_role","set_staff_active","revoke_staff_access"])expect(sql).toContain(`function public.${fn}`);for(const code of ["GD_STAFF_OWNER_REQUIRED","GD_STAFF_LAST_OWNER","GD_STAFF_SELF_CHANGE"])expect(sql).toContain(code);});
});
