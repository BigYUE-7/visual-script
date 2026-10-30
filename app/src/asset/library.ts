import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { APP_ROOT } from "../config";
import {
  AssetLibrary,
  LibraryAsset,
  type LibraryAsset as LibraryAssetType,
} from "../schema/library";

/** 素材库目录（随应用打包；避免用 public/assets/ 与 Vite 构建产物冲突）。 */
export const LIBRARY_DIR = join(APP_ROOT, "public", "library");

/** 索引文件（唯一事实源；root 可注入便于测试）。 */
export function libraryIndexPath(root?: string): string {
  return join(root ?? LIBRARY_DIR, "index.json");
}

export function librarySvgDir(root?: string): string {
  return join(root ?? LIBRARY_DIR, "svg");
}

/** 缩略图目录（小图 PNG）。 */
export function libraryThumbDir(root?: string): string {
  return join(root ?? LIBRARY_DIR, "thumbs");
}

/** 读取全部条目；索引不存在时视为空库。 */
export function loadAssetLibrary(root?: string): LibraryAssetType[] {
  const index = libraryIndexPath(root);
  if (!existsSync(index)) return [];
  const parsed = AssetLibrary.parse(JSON.parse(readFileSync(index, "utf-8")));
  return parsed.assets;
}

/** id → 条目 的映射（编译期解析 asset 元素用）。 */
export function loadAssetLibraryMap(
  root?: string,
): Map<string, LibraryAssetType> {
  return new Map(loadAssetLibrary(root).map((a) => [a.id, a]));
}

function writeLibrary(assets: LibraryAssetType[], root?: string): void {
  const index = libraryIndexPath(root);
  mkdirSync(root ?? LIBRARY_DIR, { recursive: true });
  const tmp = `${index}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify({ version: 1, assets } satisfies AssetLibrary, null, 2) + "\n",
    "utf-8",
  );
  renameSync(tmp, index);
}

/** 新增或覆盖条目；默认拒绝重复 id。 */
export function upsertLibraryAsset(
  asset: LibraryAssetType,
  options: { root?: string; overwrite?: boolean } = {},
): LibraryAssetType {
  const parsed = LibraryAsset.parse(asset);
  const assets = loadAssetLibrary(options.root);
  const index = assets.findIndex((a) => a.id === parsed.id);
  if (index >= 0) {
    if (!options.overwrite) {
      throw new Error(`素材库已存在同名 id：${parsed.id}`);
    }
    assets[index] = parsed;
  } else {
    assets.push(parsed);
  }
  writeLibrary(assets, options.root);
  return parsed;
}

/**
 * 保存一个新素材：写 SVG 文件 + 入库。
 * 文件路径固定为 library/svg/<id>.svg（相对 public/）；
 * 可选传入缩略图（PNG base64，不带 data URI 前缀）→ library/thumbs/<id>.png。
 */
export function saveLibraryAsset(
  input: {
    svg: string;
    id: string;
    name: string;
    description: string;
    collection?: string;
    tags?: string[];
    viewBox: { width: number; height: number };
    defaultWidth?: number;
    source?: "ai" | "user" | "builtin";
    generator?: { provider: string; prompt: string };
    /** PNG 的 base64（不含 data:image/png;base64, 前缀） */
    thumbnailPngBase64?: string;
  },
  options: { root?: string } = {},
): LibraryAssetType {
  const svgDir = librarySvgDir(options.root);
  mkdirSync(svgDir, { recursive: true });
  writeFileSync(join(svgDir, `${input.id}.svg`), input.svg + "\n", "utf-8");

  let thumbnail: string | undefined;
  if (input.thumbnailPngBase64) {
    const buffer = Buffer.from(input.thumbnailPngBase64, "base64");
    if (buffer.length === 0 || buffer.length > 300_000) {
      throw new Error("缩略图数据异常（空或过大）");
    }
    const thumbDir = libraryThumbDir(options.root);
    mkdirSync(thumbDir, { recursive: true });
    writeFileSync(join(thumbDir, `${input.id}.png`), buffer);
    thumbnail = `library/thumbs/${input.id}.png`;
  }

  return upsertLibraryAsset(
    {
      id: input.id,
      name: input.name,
      description: input.description,
      collection: input.collection ?? "未分组",
      tags: input.tags ?? [],
      file: `library/svg/${input.id}.svg`,
      ...(thumbnail ? { thumbnail } : {}),
      viewBox: input.viewBox,
      defaultWidth: input.defaultWidth ?? 360,
      source: input.source ?? "ai",
      createdAt: new Date().toISOString(),
      generator: input.generator,
    },
    options,
  );
}

/** 写入/覆盖缩略图并更新条目（用于 CLI 生成资产的浏览器端补齐）。 */
export function setLibraryAssetThumbnail(
  id: string,
  thumbnailPngBase64: string,
  options: { root?: string } = {},
): LibraryAssetType {
  const assets = loadAssetLibrary(options.root);
  const index = assets.findIndex((a) => a.id === id);
  if (index < 0) throw new Error(`素材库中不存在：${id}`);
  const buffer = Buffer.from(thumbnailPngBase64, "base64");
  if (buffer.length === 0 || buffer.length > 300_000) {
    throw new Error("缩略图数据异常（空或过大）");
  }
  const thumbDir = libraryThumbDir(options.root);
  mkdirSync(thumbDir, { recursive: true });
  writeFileSync(join(thumbDir, `${id}.png`), buffer);
  const updated = LibraryAsset.parse({
    ...assets[index],
    thumbnail: `library/thumbs/${id}.png`,
  });
  assets[index] = updated;
  writeLibrary(assets, options.root);
  return updated;
}

/** 修改名称 / 介绍 / 集合 / 标签。 */
export function updateLibraryAssetMeta(
  id: string,
  patch: {
    name?: string;
    description?: string;
    collection?: string;
    tags?: string[];
  },
  options: { root?: string } = {},
): LibraryAssetType {
  const assets = loadAssetLibrary(options.root);
  const index = assets.findIndex((a) => a.id === id);
  if (index < 0) throw new Error(`素材库中不存在：${id}`);
  const updated = LibraryAsset.parse({ ...assets[index], ...patch });
  assets[index] = updated;
  writeLibrary(assets, options.root);
  return updated;
}

/** 删除条目（可选同时删除 svg 文件）。 */
export function removeLibraryAsset(
  id: string,
  options: { root?: string; deleteFile?: boolean } = {},
): LibraryAssetType | undefined {
  const assets = loadAssetLibrary(options.root);
  const entry = assets.find((a) => a.id === id);
  if (!entry) return undefined;

  writeLibrary(
    assets.filter((a) => a.id !== id),
    options.root,
  );

  if (options.deleteFile) {
    const publicDir = options.root
      ? join(options.root, "..")
      : join(APP_ROOT, "public");
    for (const rel of [entry.file, entry.thumbnail]) {
      if (!rel) continue;
      const abs = join(publicDir, rel);
      if (existsSync(abs)) {
        try {
          unlinkSync(abs);
        } catch {
          // 文件删除失败不影响索引一致性；下次覆盖保存即可
        }
      }
    }
  }
  return entry;
}
