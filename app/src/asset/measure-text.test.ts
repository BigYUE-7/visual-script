import { describe, expect, it } from "vitest";
import { measureText, measureTextWidth } from "./measure-text";

describe("measureText（fontkit 实测）", () => {
  it("测量单行关键词", () => {
    const measured = measureText("光合作用", { fontSize: 64, weight: 700 });
    expect(measured.lines).toEqual(["光合作用"]);
    expect(measured.width).toBeGreaterThan(64 * 3);
    expect(measured.width).toBeLessThan(64 * 5);
    expect(measured.height).toBe(measured.lineHeight);
  });

  it("超出 maxWidth 自动换行，且每行不超宽", () => {
    const text = "光合作用".repeat(30);
    const measured = measureText(text, { fontSize: 64, weight: 700, maxWidth: 600 });
    expect(measured.lines.length).toBeGreaterThan(1);
    for (const line of measured.lines) {
      expect(measureTextWidth(line, 64, 700)).toBeLessThanOrEqual(601);
    }
    expect(measured.height).toBe(measured.lines.length * measured.lineHeight);
  });

  it("700 字重比 400 字重更宽或相等", () => {
    const w400 = measureTextWidth("Visual Script", 48, 400);
    const w700 = measureTextWidth("Visual Script", 48, 700);
    expect(w700).toBeGreaterThanOrEqual(w400);
  });
});
