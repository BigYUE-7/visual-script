import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAssetLibrary } from "../asset/library";
import { DirectorScript } from "../schema/director";
import { lintDirector } from "../compiler/lint";
import { APP_ROOT } from "../config";
import { chatJson, extractJson, type ChatMessage } from "../llm/chat";
import {
  buildDirectorSystemPrompt,
  type AvailableAssetBrief,
} from "../llm/director-prompt";
import { optionalString, parseArgs, requireString } from "./args";
import { isDirectRun } from "./run-guard";

const MAX_ATTEMPTS = 3;

/** 主题 → LLM → 导演稿 JSON。 */
export async function runGenerateDirector(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const topic = requireString(args, "topic");
  const workspace = optionalString(args, "workspace") ?? "demo";
  const title = optionalString(args, "title");
  const audience = optionalString(args, "audience");
  const provider = optionalString(args, "provider") ?? "deepseek";
  const model = optionalString(args, "model");
  const assetsArg = optionalString(args, "assets");

  // 素材库：默认全部可用；--assets id1,id2 限定子集，--assets none 表示不使用
  const library = loadAssetLibrary();
  const libraryById = new Map(library.map((a) => [a.id, a]));
  let selectedIds: string[];
  if (assetsArg === undefined) {
    selectedIds = library.map((a) => a.id);
  } else if (assetsArg === "none") {
    selectedIds = [];
  } else {
    selectedIds = assetsArg
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const id of selectedIds) {
      if (!libraryById.has(id)) {
        console.warn(`[director] --assets 中的「${id}」不在素材库中，已忽略`);
      }
    }
    selectedIds = selectedIds.filter((id) => libraryById.has(id));
  }
  const briefs: AvailableAssetBrief[] = selectedIds.map((id) => {
    const a = libraryById.get(id)!;
    return { id: a.id, name: a.name, description: a.description, tags: a.tags };
  });
  const libraryIds = new Set(selectedIds);
  console.log(`[director] 可用素材库资产：${briefs.length} 个`);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildDirectorSystemPrompt({ audience, title, assets: briefs }),
    },
    { role: "user", content: `主题：${topic}` },
  ];

  let director: DirectorScript | undefined;
  let lastIssues: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      console.warn("[director] 上次输出有问题，反馈模型重试...");
    }
    console.log(`[director] 第 ${attempt}/${MAX_ATTEMPTS} 次生成（provider=${provider}）...`);
    const raw = await chatJson({ provider, model, messages, temperature: 0.8 });
    const jsonText = extractJson(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      lastIssues = [`JSON 解析失败：${(err as Error).message}`];
      messages.push(
        { role: "assistant", content: raw },
        {
          role: "user",
          content: `你的输出不是合法 JSON（${(err as Error).message}）。请重新输出完整 JSON，只输出 JSON 本身。`,
        },
      );
      continue;
    }

    const result = DirectorScript.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".") || "(根)"}: ${i.message}`)
        .slice(0, 20);
      lastIssues = issues.map((i) => `schema: ${i}`);
      console.warn(`[director] Schema 校验失败（${issues.length} 项）`);
      messages.push(
        { role: "assistant", content: raw },
        {
          role: "user",
          content: `输出未通过 Schema 校验，共 ${issues.length} 项问题：\n${issues.join("\n")}\n请修正后重新输出完整 JSON（只输出 JSON）。`,
        },
      );
      continue;
    }

    const errors = lintDirector(result.data, { libraryIds }).filter(
      (i) => i.severity === "error",
    );
    if (errors.length > 0) {
      lastIssues = errors.map((i) => `${i.code}: ${i.message}`);
      console.warn(`[director] 一致性检查失败（${errors.length} 项）`);
      messages.push(
        { role: "assistant", content: raw },
        {
          role: "user",
          content:
            `导演稿存在以下问题：\n${lastIssues.join("\n")}\n` +
            "请修正后重新输出完整 JSON。特别注意：cue 绑定的锚点必须以内联 [[锚点]] 的形式出现在对应段落文本中，" +
            "元素 id 必须存在；kind=\"asset\" 的 asset 字段只能从可用素材库列表中选。",
        },
      );
      continue;
    }

    director = result.data;
    break;
  }

  if (!director) {
    throw new Error(`导演稿生成失败（已尝试 ${MAX_ATTEMPTS} 次）：\n${lastIssues.join("\n")}`);
  }

  const dir = join(APP_ROOT, "public", "workspaces", workspace);
  mkdirSync(dir, { recursive: true });
  const outPath = optionalString(args, "out") ?? join(dir, "director.json");
  writeFileSync(outPath, JSON.stringify(director, null, 2) + "\n", "utf-8");

  console.log(`[director] 已写入 ${outPath}`);
  console.log(
    `[director] ${director.narrations.length} 段口播 / ${director.elements.length} 个元素 / ${director.cues.length} 个 cue`,
  );
  const assetElements = director.elements.filter((e) => e.kind === "asset");
  if (assetElements.length > 0) {
    console.log(
      `[director] 引用素材库资产：${assetElements.map((e) => (e.kind === "asset" ? e.asset : "")).join(", ")}`,
    );
  }
  for (const warning of lintDirector(director, { libraryIds }).filter(
    (i) => i.severity === "warning",
  )) {
    console.warn(`[director][warning] ${warning.message}`);
  }
}

if (isDirectRun(import.meta.url)) {
  runGenerateDirector(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
