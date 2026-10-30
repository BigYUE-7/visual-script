import { saveLibraryAsset } from "../asset/library";
import { sanitizeSvg } from "../asset/svg-asset";
import {
  buildAssetMetaSystemPrompt,
  buildAssetMetaUserPrompt,
} from "../llm/asset-meta-prompt";
import { buildSvgSystemPrompt } from "../llm/asset-prompt";
import { chatJson, chatText, extractJson, type ChatMessage } from "../llm/chat";
import { optionalString, parseArgs, requireString } from "./args";
import { isDirectRun } from "./run-guard";

const MAX_ATTEMPTS = 3;

/** 把任意字符串规整为合法元素 id（^[a-z][a-z0-9-]*$）。 */
export function normalizeAssetId(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (/^[a-z]/.test(cleaned)) return cleaned;
  return `a-${cleaned || Date.now().toString(36)}`;
}

type AssetMeta = {
  name: string;
  description: string;
  collection: string;
  tags: string[];
};

/** 第二步：LLM 生成名称 / 介绍 / 标签（失败返回 null，由调用方兜底）。 */
async function generateAssetMeta(options: {
  svg: string;
  description: string;
  provider: string;
  model?: string;
  log: (line: string) => void;
}): Promise<AssetMeta | null> {
  try {
    const raw = await chatJson({
      provider: options.provider,
      model: options.model,
      temperature: 0.3,
      messages: [
        { role: "system", content: buildAssetMetaSystemPrompt() },
        {
          role: "user",
          content: buildAssetMetaUserPrompt(options.svg, options.description),
        },
      ],
    });
    const parsed = JSON.parse(extractJson(raw)) as {
      name?: unknown;
      description?: unknown;
      collection?: unknown;
      tags?: unknown;
    };
    const name =
      typeof parsed.name === "string" ? parsed.name.trim().slice(0, 24) : "";
    const description =
      typeof parsed.description === "string"
        ? parsed.description.trim().slice(0, 120)
        : "";
    if (!name || !description) return null;
    const collection =
      typeof parsed.collection === "string" && parsed.collection.trim()
        ? parsed.collection.trim().slice(0, 24)
        : "未分组";
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((t): t is string => typeof t === "string" && t.trim() !== "")
          .map((t) => t.trim().slice(0, 16))
          .slice(0, 6)
      : [];
    return { name, description, collection, tags };
  } catch (err) {
    options.log(
      `[asset] 元数据生成失败（${(err as Error).message}），使用描述兜底`,
    );
    return null;
  }
}

/**
 * 元素描述 → LLM 写 SVG → 消毒校验 → LLM 起名/写介绍 → 入库 public/library/。
 * 用法：
 *   npm run generate-asset -- --description "线粒体扁平示意图" [--name 线粒体] [--collection 生物细胞] [--tags 生物,细胞]
 *   npm run generate-asset -- --description "..." --stdout   # 只输出 JSON（编辑器调用）
 */
export async function runGenerateAsset(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const description = requireString(args, "description");
  const id = normalizeAssetId(
    optionalString(args, "id") ?? `ai-${Date.now().toString(36)}`,
  );
  const provider = optionalString(args, "provider") ?? "deepseek";
  const model = optionalString(args, "model");
  const stdoutMode = args.stdout === true;
  const defaultWidthRaw = optionalString(args, "default-width");
  const defaultWidth = defaultWidthRaw ? Number(defaultWidthRaw) : 360;

  // stdout 模式：stdout 只留给最终 JSON，日志走 stderr
  const log = stdoutMode ? console.error : console.log;

  const messages: ChatMessage[] = [
    { role: "system", content: buildSvgSystemPrompt() },
    { role: "user", content: `元素描述：${description}` },
  ];

  let svg: string | undefined;
  let width = 0;
  let height = 0;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    log(`[asset] 第 ${attempt}/${MAX_ATTEMPTS} 次生成（provider=${provider}）…`);
    const raw = await chatText({
      provider,
      model,
      messages,
      temperature: 0.4,
    });
    try {
      const meta = sanitizeSvg(raw);
      svg = meta.svg;
      width = meta.width;
      height = meta.height;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      log(`[asset] 输出不合规：${lastError}，反馈模型重试…`);
      messages.push(
        { role: "assistant", content: raw },
        {
          role: "user",
          content: `输出不合规：${lastError}。请只输出修正后的完整 SVG 代码（不要解释、不要围栏）。`,
        },
      );
    }
  }

  if (!svg) {
    throw new Error(`SVG 生成失败（已尝试 ${MAX_ATTEMPTS} 次）：${lastError}`);
  }

  // 第二步：元数据（名称 / 介绍 / 集合 / 标签）；失败时用描述兜底
  log("[asset] 生成元数据（名称/介绍/集合/标签）…");
  const generated =
    (await generateAssetMeta({ svg, description, provider, model, log })) ?? {
      name: description.trim().slice(0, 12),
      description: description.trim().slice(0, 120),
      collection: "未分组",
      tags: [] as string[],
    };
  const nameOverride = optionalString(args, "name");
  const collectionOverride = optionalString(args, "collection");
  const tagsOverride = optionalString(args, "tags");
  const meta: AssetMeta = {
    name: (nameOverride ?? generated.name).slice(0, 24),
    description: generated.description,
    collection: (collectionOverride ?? generated.collection).slice(0, 24),
    tags: tagsOverride
      ? tagsOverride
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 6)
      : generated.tags,
  };

  let file: string | undefined;
  if (!stdoutMode) {
    const entry = saveLibraryAsset({
      svg,
      id,
      name: meta.name,
      description: meta.description,
      collection: meta.collection,
      tags: meta.tags,
      viewBox: { width, height },
      defaultWidth,
      source: "ai",
      generator: { provider, prompt: description },
    });
    file = entry.file;
    log(`[asset] 已入库 ${entry.file}（${meta.collection} / ${meta.name}）`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      id,
      svg,
      viewBox: { width, height },
      name: meta.name,
      description: meta.description,
      collection: meta.collection,
      tags: meta.tags,
      defaultWidth,
      ...(file ? { file } : {}),
    }),
  );
}

if (isDirectRun(import.meta.url)) {
  runGenerateAsset(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
