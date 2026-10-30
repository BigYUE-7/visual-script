import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_ROOT } from "../config";
import { EmojiId } from "../schema/common";
import type { LibraryAsset } from "../schema/library";

/** 供提示词使用的素材库摘要。 */
export type AvailableAssetBrief = Pick<LibraryAsset, "id" | "name" | "description"> & {
  tags?: string[];
};

/** 读取导演稿 JSON Schema（单一事实源：schemas/ 下的手写 Schema）。 */
export function readDirectorJsonSchema(): string {
  return readFileSync(
    join(APP_ROOT, "schemas", "director-script.schema.json"),
    "utf-8",
  );
}

/** 读取示例导演稿（few-shot 示例 + 离线兜底用户）。 */
export function readDirectorExample(): string {
  return readFileSync(
    join(APP_ROOT, "examples", "photosynthesis.director.json"),
    "utf-8",
  );
}

/**
 * 把可用素材 id 注入 JSON Schema 的 asset 分支（闭集枚举）；
 * 可用集为空时直接移除 asset 分支，LLM 无法越界引用。
 */
export function injectAssetEnum(schemaText: string, assetIds: string[]): string {
  const schema = JSON.parse(schemaText) as {
    properties?: { elements?: { items?: { oneOf?: unknown[] } } };
  };
  const oneOf = schema.properties?.elements?.items?.oneOf;
  if (!Array.isArray(oneOf)) return schemaText;

  const branchIndex = oneOf.findIndex((item) => {
    const props = (item as { properties?: { kind?: { const?: unknown } } })
      .properties;
    return props?.kind?.const === "asset";
  });
  if (branchIndex < 0) return schemaText;

  if (assetIds.length === 0) {
    oneOf.splice(branchIndex, 1);
  } else {
    const branch = oneOf[branchIndex] as {
      properties?: { asset?: { enum?: string[] } };
    };
    if (branch.properties?.asset) {
      branch.properties.asset.enum = assetIds;
    }
  }
  return JSON.stringify(schema, null, 2);
}

export function buildDirectorSystemPrompt(options: {
  audience?: string;
  title?: string;
  assets?: AvailableAssetBrief[];
}): string {
  const assets = options.assets ?? [];
  const hasAssets = assets.length > 0;
  const schema = injectAssetEnum(
    readDirectorJsonSchema(),
    assets.map((a) => a.id),
  );
  const example = readDirectorExample();
  const audience = options.audience ?? "大众";
  const title = options.title ? `标题参考：${options.title}` : "";

  const librarySection = hasAssets
    ? `【可用素材库】（本项目已勾选可用的 SVG 素材，优先使用）
${assets
  .map(
    (a) =>
      `- ${a.id}「${a.name}」：${a.description}${a.tags && a.tags.length > 0 ? `（标签：${a.tags.join("/")}）` : ""}`,
  )
  .join("\n")}
引用规则：
1. asset 字段只能取上面列表中的 id（JSON Schema 已限定枚举，越界会被拒绝）；
2. 概念能对上时优先引用素材，不要再用文字/图形占位替代；列表里没有的元素才用 shape/emoji/text；
3. 每个素材全片最多引用 2 次（同一素材反复出现会显得单调）；
4. 可选用 width 字段调整显示宽度（200-700，缺省用素材库默认宽度）。
示例：{"id":"mito1","kind":"asset","asset":"mito","layer":1,"slot":"center"}
`
    : "";

  return `你是科普短视频的导演与分镜师，负责把一个主题做成"导演稿"（DirectorScript JSON）——它是后续配音、动画、出片的蓝图。
导演稿只描述"讲什么、画面上出现什么、大致怎么动"，不写任何绝对时间与坐标。

必须输出符合以下 JSON Schema 的 JSON（不允许出现 Schema 之外的字段）：
${schema}

【叙事：把主题讲成一个有节奏的小故事】
1. 全中文；口语化、有画面感、有钩子，面向${audience}；${title}
2. 6-7 段 narrations，全片口播 140-190 字（成片约 40-55 秒；语音语速约每秒 3-4 字，务必控住字数）。
   第一段抓人（反常识/提问/悬念），中间讲清原理与例子，最后一段给结论或行动建议。
3. 每段 1-2 句、18-32 字，句子短、口语化；多用比喻与具体例子（"像小厨房""相当于三分钟"），
   不要空泛的口号。
4. 每段用 [[锚点]] 标记 2-3 个关键词（2-8 字、内部不含标点）。锚点是画面节拍：每个锚点都必须
   被至少一个 cue 引用，让画面跟着语速动起来。
5. 数字用中文读法（如"三千万"），避免阿拉伯数字。

【画面：每段都是一个分镜，画面不能空】
6. 元素总量 14-20 个；每段同时可见 3-6 个元素；任何时刻画面都不能只有 0-1 个元素。
7. 元素混搭使用：
   - 文字 kind="text"：keyword 是每段主视觉（大而少）、heading 是段落标题、body/caption 是标签与说明。
     **缺资产就用文字占位**：没有合适的素材/图形/emoji 时，给概念起一个 2-6 字的小标签贴到画面上
     （如"空气分子""实验组""三分钟"），不要因为没有图画就留空画面。
     content 为 {type:"literal",text} 或 {type:"narration",narrationId,anchor}（随语音出现的画面文字）。
   - 图形 kind="shape"：从 rect/circle/line/arrow/triangle/star/heart 中选；主体图形
     width/height 220-700；arrow 表示"流向/关系"（width 260-420，height 60-90）；
     color 从 primary/accent/text/muted/subtitle/wash/soft 中选：wash（浅灰）/soft（浅暖）专用于
     氛围垫底，accent（橙）全片只给最重要的对象，其余用 primary/text/muted。
     **每个图形都必须配一个 2-6 字的 caption 标签说明它代表什么**（如"人群""责任""脚"），
     不要出现没有解释的孤零零色块；文字优先：画面主体用大字与标签表达概念，图形做陪衬与关系。
   - 表情 kind="emoji"：从 ${EmojiId.options.join("/")} 中选，给关键词配直观图案
     （阳光 sun、叶片 leaf、实验 microscope、灵感 light-bulb、能量 battery、人群/感受 heart 等）。
${hasAssets ? `   - 素材 kind="asset"：引用【可用素材库】中的 SVG 素材（见下方列表），能对上概念时必须优先用它。\n` : ""}8. layer 分层：0=氛围底（wash/soft 浅色大圆/大矩形，尺寸 500-900，贴边或垫在主视觉后面，
   让画面不空，全片 1-2 个）、1=主体图形、2=文字、3=小标签。
9. 构图套路（任选组合）：
   - 主视觉居中 + 左右配角 + 顶部标签；
   - 左右对照：两组图形分占 left / right，各配一个 caption；
   - 关系演示：A + B + arrow，并用 move 把 A 移到 B 旁边；
   - 流程演示：三个图形分占 left / center / right，按锚点先后出现再退场。
10. slot 从 center/top/bottom/left/right/top_left/top_right/bottom_left/bottom_right 中选；
    同一时刻的元素必须用不同 slot；同一 slot 的元素要先后错开出现；底部是字幕区，bottom 槽只放短标签。

【动画：让画面活起来】
11. 每个元素至少 1 个 appear；每段至少 3 个 cue；全片 cue 总数 ≥ 24。
12. cue 动作：
    - appear：at="start"（随段首）或 at="anchor"（随锚点）；主视觉用 pop/slide_up/zoom，标签用 fade；
    - emphasize：主角在锚点处放大回弹（scale 1.2-1.5），每段至少 1 次；
    - move：把 A 移到 B 的锚点附近（to 形如 "sun.center"，可加 offsetX/offsetY 微调），表达
      "飞过去/飘回去/流向"；每段 0-2 次；**移动后两个元素不能重叠，offset 要留出 150px 以上间距**；
    - animate：氛围动画 float/shake/bounce/wiggle，氛围底与主角每段至少 1 次，让静止画面有生命感；
    - disappear：上段元素错峰退场（fade/shrink），同段内不要重复 disappear；
    - durationMs 建议 400-1500（animate 类 1500-3000）。
13. 节奏：段间 gapAfterMs 200-500；需要观众看画面时用 minHoldMs 300-800 拖住。

【规则】
14. id 用小写字母/数字/连字符（n01、kw、sun），全局唯一；元素 id 与 cue id 不重复。
15. cue 绑定的 (narrationId, anchor) 必须真实存在；元素 content 绑定锚点也必须存在。
16. 不要出现 Schema 之外的字段。

${librarySection}示例导演稿（只作风格与密度参考，请为你的主题重新创作）：
${example}

只输出 JSON，不要输出任何解释文字或 markdown 围栏。`;
}
