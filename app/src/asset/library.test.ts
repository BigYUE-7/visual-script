import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadAssetLibrary,
  loadAssetLibraryMap,
  removeLibraryAsset,
  saveLibraryAsset,
  setLibraryAssetThumbnail,
  updateLibraryAssetMeta,
  upsertLibraryAsset,
} from "./library";

let root: string;

/** 1×1 透明 PNG。 */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const makeAsset = (id: string) => ({
  id,
  name: `素材${id}`,
  description: "测试素材介绍",
  collection: "测试集合",
  tags: ["测试"],
  file: `library/svg/${id}.svg`,
  viewBox: { width: 200, height: 200 },
  defaultWidth: 360,
  source: "ai" as const,
  createdAt: new Date().toISOString(),
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "vs-library-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("asset library", () => {
  it("空库返回空数组", () => {
    expect(loadAssetLibrary(root)).toEqual([]);
  });

  it("saveLibraryAsset 写文件并入库", () => {
    const entry = saveLibraryAsset(
      {
        svg: '<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="60"/></svg>',
        id: "mito",
        name: "线粒体",
        description: "细胞的能量工厂",
        tags: ["生物", "细胞"],
        viewBox: { width: 200, height: 200 },
      },
      { root },
    );
    expect(entry.file).toBe("library/svg/mito.svg");
    const list = loadAssetLibrary(root);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("线粒体");
    const map = loadAssetLibraryMap(root);
    expect(map.get("mito")?.description).toBe("细胞的能量工厂");
  });

  it("重复 id 默认拒绝，可显式覆盖", () => {
    upsertLibraryAsset(makeAsset("a1"), { root });
    expect(() => upsertLibraryAsset(makeAsset("a1"), { root })).toThrow(
      /已存在/,
    );
    const updated = upsertLibraryAsset(
      { ...makeAsset("a1"), name: "改名" },
      { root, overwrite: true },
    );
    expect(updated.name).toBe("改名");
    expect(loadAssetLibrary(root)).toHaveLength(1);
  });

  it("updateLibraryAssetMeta 改名称/介绍/标签", () => {
    upsertLibraryAsset(makeAsset("a1"), { root });
    const updated = updateLibraryAssetMeta(
      "a1",
      { name: "新名字", description: "新介绍", tags: ["生物"] },
      { root },
    );
    expect(updated.name).toBe("新名字");
    expect(updated.tags).toEqual(["生物"]);
    expect(() => updateLibraryAssetMeta("nope", { name: "x" }, { root })).toThrow(
      /不存在/,
    );
  });

  it("removeLibraryAsset 删除条目", () => {
    upsertLibraryAsset(makeAsset("a1"), { root });
    upsertLibraryAsset(makeAsset("a2"), { root });
    const removed = removeLibraryAsset("a1", { root });
    expect(removed?.id).toBe("a1");
    expect(loadAssetLibrary(root).map((a) => a.id)).toEqual(["a2"]);
    expect(removeLibraryAsset("nope", { root })).toBeUndefined();
  });

  it("saveLibraryAsset 保存缩略图并在条目中记录路径", () => {
    const entry = saveLibraryAsset(
      {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="60"/></svg>',
        id: "thumb1",
        name: "缩略图测试",
        description: "带缩略图",
        viewBox: { width: 200, height: 200 },
        thumbnailPngBase64: PNG_1PX,
      },
      { root },
    );
    expect(entry.thumbnail).toBe("library/thumbs/thumb1.png");
    expect(existsSync(join(root, "thumbs", "thumb1.png"))).toBe(true);
    expect(loadAssetLibrary(root)[0].thumbnail).toBe("library/thumbs/thumb1.png");
  });

  it("setLibraryAssetThumbnail 回填缩略图", () => {
    upsertLibraryAsset(makeAsset("a1"), { root });
    const updated = setLibraryAssetThumbnail("a1", PNG_1PX, { root });
    expect(updated.thumbnail).toBe("library/thumbs/a1.png");
    expect(existsSync(join(root, "thumbs", "a1.png"))).toBe(true);
    expect(() => setLibraryAssetThumbnail("nope", PNG_1PX, { root })).toThrow(
      /不存在/,
    );
  });
});
