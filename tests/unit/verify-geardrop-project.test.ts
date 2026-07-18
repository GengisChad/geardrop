import { describe, expect, it, vi } from "vitest";
import { confirmProjectRemotely, maskRef, ProjectVerificationError, verifyGeardropProject } from "../../scripts/verify-geardrop-project";

const REF = "cvwigsymjlpulwgjkzix";

function expectCode(fn: () => void, code: string) {
  try {
    fn();
    throw new Error("expected verifyGeardropProject to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectVerificationError);
    expect((error as ProjectVerificationError).code).toBe(code);
  }
}

describe("verifyGeardropProject", () => {
  it("passes silently when the declared ref exactly matches the expected ref", () => {
    expect(() => verifyGeardropProject({ declaredRef: REF, expectedRef: REF })).not.toThrow();
  });

  it("fails when the declared ref is missing", () => {
    expectCode(() => verifyGeardropProject({ declaredRef: "", expectedRef: REF }), "GD_MISSING_DECLARED_REF");
  });

  it("fails when the declared ref is only whitespace", () => {
    expectCode(() => verifyGeardropProject({ declaredRef: "   ", expectedRef: REF }), "GD_MISSING_DECLARED_REF");
  });

  it("fails when EXPECTED_SUPABASE_PROJECT_REF is not set", () => {
    expectCode(() => verifyGeardropProject({ declaredRef: REF, expectedRef: "" }), "GD_MISSING_EXPECTED_REF");
  });

  it("fails when the declared ref does not match the expected ref — allowlist of exactly one", () => {
    expectCode(
      () => verifyGeardropProject({ declaredRef: "zzzzzzzzzzzzzzzzzzzz", expectedRef: REF }),
      "GD_PROJECT_REF_MISMATCH",
    );
  });

  it("rejects any other project ref, including one that used to be explicitly forbidden", () => {
    // No denylist to maintain any more: the allowlist-of-one already refuses everything but REF.
    expectCode(
      () => verifyGeardropProject({ declaredRef: "zhqxwcnnyqrlizlowtgd", expectedRef: REF }),
      "GD_PROJECT_REF_MISMATCH",
    );
  });

  it("trims whitespace before comparing", () => {
    expect(() => verifyGeardropProject({ declaredRef: `  ${REF}  `, expectedRef: `  ${REF}  ` })).not.toThrow();
  });

  it("is case-sensitive — refs are not normalised", () => {
    expectCode(() => verifyGeardropProject({ declaredRef: REF.toUpperCase(), expectedRef: REF }), "GD_PROJECT_REF_MISMATCH");
  });
});

describe("maskRef", () => {
  it("keeps the first four and last two characters visible", () => {
    expect(maskRef(REF)).toBe("cvwi**************ix");
  });

  it("fully masks a short value instead of exposing it", () => {
    expect(maskRef("abcdef")).toBe("******");
  });
});

describe("confirmProjectRemotely", () => {
  it("skips when no access token is provided", async () => {
    const fetchImpl = vi.fn();
    const result = await confirmProjectRemotely(REF, undefined, fetchImpl);
    expect(result).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("confirms when the API returns the same ref", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ref: REF }) });
    const result = await confirmProjectRemotely(REF, "token", fetchImpl);
    expect(result).toBe("confirmed");
  });

  it("confirms using the `id` field when `ref` is absent from the response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: REF }) });
    const result = await confirmProjectRemotely(REF, "token", fetchImpl);
    expect(result).toBe("confirmed");
  });

  it("fails when the project is not found (404) — the project must genuinely exist", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await expect(confirmProjectRemotely(REF, "token", fetchImpl)).rejects.toMatchObject({ code: "GD_PROJECT_REF_MISMATCH" });
  });

  it("fails when the token is unauthorized (401) — the token must genuinely have access", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(confirmProjectRemotely(REF, "token", fetchImpl)).rejects.toMatchObject({ code: "GD_PROJECT_REF_MISMATCH" });
  });

  it("fails when the token is forbidden (403) — the token must genuinely have access", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    await expect(confirmProjectRemotely(REF, "token", fetchImpl)).rejects.toMatchObject({ code: "GD_PROJECT_REF_MISMATCH" });
  });

  it("fails when the API echoes back a different ref than requested", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ref: "some-other-ref-000000" }) });
    await expect(confirmProjectRemotely(REF, "token", fetchImpl)).rejects.toMatchObject({ code: "GD_PROJECT_REF_MISMATCH" });
  });

  it("skips, never throws, on a server-side failure (5xx) — not proof of a wrong project", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const result = await confirmProjectRemotely(REF, "token", fetchImpl);
    expect(result).toBe("skipped");
  });

  it("skips, never throws, when the network call itself rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    const result = await confirmProjectRemotely(REF, "token", fetchImpl);
    expect(result).toBe("skipped");
  });

  it("skips, never throws, when the response body is not valid JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    const result = await confirmProjectRemotely(REF, "token", fetchImpl);
    expect(result).toBe("skipped");
  });
});
