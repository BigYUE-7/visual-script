import { describe, expect, it } from "vitest";
import {
  sanitizeSvg,
  svgToDataUrl,
  SvgValidationError,
} from "./svg-asset";

const OK_SVG = `<svg viewBox="0 0 200 200" width="200" height="200">
  <circle cx="100" cy="100" r="60" fill="#D97706"/>
</svg>`;

describe("sanitizeSvg", () => {
  it("剥离 markdown 围栏并解析 viewBox", () => {
    const meta = sanitizeSvg("```svg\n" + OK_SVG + "\n```");
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(200);
    expect(meta.svg.startsWith("<svg")).toBe(true);
  });

  it("规范化根元素：补 xmlns、去掉固定 width/height", () => {
    const meta = sanitizeSvg(OK_SVG);
    expect(meta.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(/<svg[^>]*\swidth\s*=/.test(meta.svg)).toBe(false);
    expect(/<svg[^>]*\sheight\s*=/.test(meta.svg)).toBe(false);
    expect(meta.svg).toContain('viewBox="0 0 200 200"');
  });

  it("缺失 viewBox 时退回 width/height 属性", () => {
    const meta = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect x="10" y="10" width="100" height="60" fill="#2563EB"/></svg>`,
    );
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(80);
  });

  it("拒绝 <script> 与事件属性", () => {
    expect(() =>
      sanitizeSvg(`<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>`),
    ).toThrow(SvgValidationError);
    expect(() =>
      sanitizeSvg(`<svg viewBox="0 0 10 10"><rect onclick="x()" width="5" height="5"/></svg>`),
    ).toThrow(SvgValidationError);
  });

  it("拒绝外链引用与 <image>", () => {
    expect(() =>
      sanitizeSvg(
        `<svg viewBox="0 0 10 10"><image href="https://example.com/a.png"/></svg>`,
      ),
    ).toThrow(SvgValidationError);
    expect(() =>
      sanitizeSvg(`<svg viewBox="0 0 10 10"><use href="#a"/></svg>`),
    ).not.toThrow();
  });

  it("拒绝非法内容与异常比例", () => {
    expect(() => sanitizeSvg("这不是 SVG")).toThrow(SvgValidationError);
    expect(() =>
      sanitizeSvg(`<svg viewBox="0 0 900 100"><rect width="10" height="10"/></svg>`),
    ).toThrow(SvgValidationError);
  });
});

describe("svgToDataUrl", () => {
  it("生成可预览的 data URL", () => {
    const url = svgToDataUrl(OK_SVG);
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.split(",")[1])).toBe(OK_SVG);
  });
});
