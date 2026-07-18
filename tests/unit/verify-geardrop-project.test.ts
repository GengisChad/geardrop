import { describe, expect, it, vi } from "vitest";
import { confirmProjectRemotely, maskRef, ProjectVerificationError, verifyGeardropProject } from "../../scripts/verify-geardrop-project";

const EXPECTED = { ref: "abcdefghijklmnop1234", name: "GearDrop Development" };

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
  it("passes silently when declared matches expected exactly", () => {
    expect(() =>
      verifyGeardropProject({ declared: { ...EXPECTED }, expected: { ...EXPECTED } }),
    ).not.toThrow();
  });

  it("fails when the declared ref is missing", () => {
    expectCode(
      () => verifyGeardropProject({ declared: { ref: "", name: EXPECTED.name }, expected: EXPECTED }),
      "GD_MISSING_DECLARED_REF",
    );
  });

  it("fails when the declared name is missing", () => {
    expectCode(
      () => verifyGeardropProject({ declared: { ref: EXPECTED.ref, name: "  " }, expected: EXPECTED }),
      "GD_MISSING_DECLARED_NAME",
    );
  });

  it("fails when EXPECTED_SUPABASE_PROJECT_REF is not set", () => {
    expectCode(
      () => verifyGeardropProject({ declared: EXPECTED, expected: { ref: "", name: EXPECTED.name } }),
      "GD_MISSING_EXPECTED_REF",
    );
  });

  it("fails when EXPECTED_SUPABASE_PROJECT_NAME is not set", () => {
    expectCode(
      () => verifyGeardropProject({ declared: EXPECTED, expected: { ref: EXPECTED.ref, name: "" } }),
      "GD_MISSING_EXPECTED_NAME",
    );
  });

  it("fails when the project name does not match", () => {
    expectCode(
      () =>
        verifyGeardropProject({
          declared: { ref: EXPECTED.ref, name: "GearDrop Staging" },
          expected: EXPECTED,
        }),
      "GD_PROJECT_NAME_MISMATCH",
    );
  });

  it("fails when the project ref does not match", () => {
    expectCode(
      () =>
        verifyGeardropProject({
          declared: { ref: "zzzzzzzzzzzzzzzzzzzz", name: EXPECTED.name },
          expected: EXPECTED,
        }),
      "GD_PROJECT_REF_MISMATCH",
    );
  });

  it("fails on a forbidden ref even if it happens to equal the expected ref", () => {
    // Defence in depth: a forbidden ref (e.g. IBNApp) must never pass, even if someone
    // accidentally set EXPECTED_SUPABASE_PROJECT_REF to it by mistake.
    expectCode(
      () =>
        verifyGeardropProject({
          declared: EXPECTED,
          expected: EXPECTED,
          forbiddenRefs: [EXPECTED.ref],
        }),
      "GD_FORBIDDEN_PROJECT_REF",
    );
  });

  it("fails on a forbidden ref that differs from the expected ref", () => {
    expectCode(
      () =>
        verifyGeardropProject({
          declared: { ref: "ibnapp0000000000000x", name: EXPECTED.name },
          expected: EXPECTED,
          forbiddenRefs: ["ibnapp0000000000000x"],
        }),
      "GD_FORBIDDEN_PROJECT_REF",
    );
  });

  it("ignores blank entries in the forbidden ref list", () => {
    expect(() =>
      verifyGeardropProject({
        declared: EXPECTED,
        expected: EXPECTED,
        forbiddenRefs: ["", "   ", "some-other-ref"],
      }),
    ).not.toThrow();
  });

  it("trims whitespace before comparing", () => {
    expect(() =>
      verifyGeardropProject({
        declared: { ref: `  ${EXPECTED.ref}  `, name: `  ${EXPECTED.name}  ` },
        expected: EXPECTED,
      }),
    ).not.toThrow();
  });
});

describe("maskRef", () => {
  it("keeps the first four and last two characters visible", () => {
    expect(maskRef("abcdefghijklmnop1234")).toBe("abcd**************34");
  });

  it("fully masks a short value instead of exposing it", () => {
    expect(maskRef("abcdef")).toBe("******");
  });
});

describe("confirmProjectRemotely", () => {
  it("skips when no access token is provided", async () => {
    const fetchImpl = vi.fn();
    const result = await confirmProjectRemotely({ ref: EXPECTED.ref, expectedName: EXPECTED.name }, undefined, fetchImpl);
    expect(result).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("confirms when the remote name matches", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name: EXPECTED.name }) });
    const result = await confirmProjectRemotely({ ref: EXPECTED.ref, expectedName: EXPECTED.name }, "token", fetchImpl);
    expect(result).toBe("confirmed");
  });

  it("throws when the remote name does not match", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name: "Some Other Project" }) });
    await expect(
      confirmProjectRemotely({ ref: EXPECTED.ref, expectedName: EXPECTED.name }, "token", fetchImpl),
    ).rejects.toMatchObject({ code: "GD_PROJECT_NAME_MISMATCH" });
  });

  it("skips, never throws, when the API response is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const result = await confirmProjectRemotely({ ref: EXPECTED.ref, expectedName: EXPECTED.name }, "token", fetchImpl);
    expect(result).toBe("skipped");
  });

  it("skips, never throws, when the network call itself rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    const result = await confirmProjectRemotely({ ref: EXPECTED.ref, expectedName: EXPECTED.name }, "token", fetchImpl);
    expect(result).toBe("skipped");
  });

  it("skips, never throws, when the response body is not valid JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    const result = await confirmProjectRemotely({ ref: EXPECTED.ref, expectedName: EXPECTED.name }, "token", fetchImpl);
    expect(result).toBe("skipped");
  });
});
