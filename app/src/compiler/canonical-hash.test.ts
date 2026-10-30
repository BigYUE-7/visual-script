import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Of, sha256OfText } from "./canonical-hash";

describe("canonical-hash", () => {
  it("对象键顺序不影响哈希", () => {
    const a = { b: 1, a: { d: 2, c: 3 } };
    const b = { a: { c: 3, d: 2 }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(sha256Of(a)).toBe(sha256Of(b));
  });

  it("数组顺序影响哈希", () => {
    expect(sha256Of([1, 2])).not.toBe(sha256Of([2, 1]));
  });

  it("文本哈希带 sha256 前缀", () => {
    const hash = sha256OfText("光合作用");
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(sha256OfText("光合作用")).toBe(hash);
    expect(sha256OfText("光合")).not.toBe(hash);
  });
});
