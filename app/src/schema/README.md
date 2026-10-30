# Schema 设计说明

> 本目录按根目录 `AGENTS.md` 的 P0-1 任务产出，定义视频生成流水线四层数据 + Animation IR 的 Zod Schema，并导出 JSON Schema 供 LLM 结构化输出使用。

## 数据流

```
DirectorScript（导演稿）
    │
    ├─→ VoiceMap（语音资产）
    │      │
    │      ▼
    │   TimedScript（时间脚本）
    │      │
    │      ▼
    │   Animation IR（动画中间表示）
    │      │
    │      ▼
    │   Remotion 组件 / MP4
    │
    └─→ MaterialScript（素材合成稿）
```

## 文件说明

| 文件 | 产物 | 说明 |
|------|------|------|
| `common.ts` | 通用类型：id、归一化坐标、颜色、缓动 | 被其他 schema 复用 |
| `director.ts` | `DirectorScript` | 导演稿：口播分段、元素（text/shape/emoji/asset）、cues |
| `material.ts` | `MaterialScript` | 素材合成稿：要生产哪些资产 |
| `library.ts` | `LibraryAsset` / `AssetLibrary` | 素材库条目与索引（`public/library/index.json` 的唯一形状） |
| `voice-map.ts` | `VoiceMap` | 语音资产：每段音频、时长、字级对齐 |
| `timed-script.ts` | `TimedScript` | 时间脚本：链式推导后的绝对毫秒 |
| `animation-ir.ts` | `AnimationIR` | 动画 IR：帧级对象、关键帧、镜头 |
| `index.ts` | 统一导出 | 便于编译器与编辑器引用 |

## JSON Schema 导出

每个 TypeScript Schema 文件同时导出一个 `*JsonSchema` 对象（符合 JSON Schema Draft 7）。这些对象会被写入 `app/schemas/*.schema.json`，直接用于 LLM 的 `response_format` / `tools` 约束。

导出方式（待本目录引入 `zod-to-json-schema` 后自动化）：

```ts
import { zodToJsonSchema } from "zod-to-json-schema";
import { DirectorScript } from "./director";

export const directorJsonSchema = zodToJsonSchema(DirectorScript, "DirectorScript");
```

当前阶段先手写 JSON Schema 文件，确保 LLM 调用端可立即使用；TS 文件中的 `*JsonSchema` 为与手写 JSON 对齐的静态对象。

## 设计原则

1. **id 全局唯一**：`^[a-z][a-z0-9-]*$`，稳定引用，不依赖数组下标。
2. **时间不跨层**：毫秒只存在于 `VoiceMap` / `TimedScript`；`AnimationIR` 用帧。
3. **LLM 只写受限词汇**：样式用预设名（如 `keyword`），不写字号 / 颜色 / 坐标。
4. **未知字段拒绝**：所有对象默认 `strict()`，防止 LLM 编造字段。
5. **锚点归一化**：`{ x: 0..1, y: 0..1 }`，相对资产包围盒。

## v1 范围

- DirectorScript：口播 + 文字/几何/emoji/素材库 SVG 元素 + 简单 cue（appear / disappear / emphasize / move / animate）；元素用 `slot` 语义槽位指定初始位置（LLM 不写坐标）。
- MaterialScript：仅定义文字/几何资产，SVG/图片生产后置（emoji 走内置 Twemoji；SVG 走素材库 + AI 生成）。
- VoiceMap：单 provider（dashscope / cosyvoice-v2），分段音频。
- TimedScript：块级 + cue 级绝对毫秒。
- AnimationIR：**自包含**（内联 `assets`：文字实测分行结果 / 图形尺寸与锚点 / emoji 与 SVG 文件路径 / 图片文件路径）+ 场景对象 + 关键帧 + 音频 + 整句字幕；镜头结构预留，P2 完整实现。

## 关键实现注意

- 关键帧的 `transform` 是 `PartialTransform`（字段无默认值）；**不要用 `Transform.partial()`**——zod 会把 `.default()` 物化进缺失字段，破坏"仅动画部分属性"的语义（曾导致渲染端元素全部跑到原点）。
