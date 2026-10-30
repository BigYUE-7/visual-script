import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DirectorScript } from "../schema/director";
import { lintDirector } from "../compiler/lint";
import { APP_ROOT } from "../config";

describe("示例导演稿", () => {
  it("通过 Schema 校验且无 lint 错误", () => {
    const raw = readFileSync(
      join(APP_ROOT, "examples", "photosynthesis.director.json"),
      "utf-8",
    );
    const result = DirectorScript.safeParse(JSON.parse(raw));
    if (!result.success) {
      throw new Error(JSON.stringify(result.error.issues, null, 2));
    }
    const errors = lintDirector(result.data).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });
});
