# app/AGENTS.md —— Visual Script 应用工程规划

> 本文件是 `app/` 目录的工程总规划，面向实现团队（或未来的自己）。
> 它把仓库根目录 `AGENTS.md` 中的比赛目标、架构决策、P0/P1/P2 计划翻译成本目录的**模块划分、数据流与落地节奏**。
> 若与根目录冲突，以根目录为准。

---

## 零、当前状态与命令（2026-10-08）

**状态：P0 最小闭环已落地并跑通真链路；P1 编辑器已对齐布局 C 并可交互。** 真 TTS + LLM 版样片已出片（`out/sky.mp4`，51.9s，含字幕与片头尾）；离线 mock 全链路（`out/demo.mp4`，22.4s）用于无密钥自测。编辑器支持：AI 对话窗口（主题 → LLM → 语音 → 编译，SSE 流式日志，生成后画布与音轨自动就绪）/ 资产框添加文字与几何 / 布局 C 轨道面板（语音轨 + 素材轨 + **按属性分组的动画子轨道**）/ **剪映式轨道编辑（选中、拖动片段、两端裁剪、拖动关键帧、吸附、时间缩放、剪辑工具条）** / 画布选中拖动与属性面板自动关键帧 / 播放头 + 音频同步预览 / 保存回 `ir.json`。

**资产与动画升级（第一批）已落地**：动画预设库（入场 fade/pop/slide×4/zoom；退场 fade/shrink；氛围 float/shake/bounce/wiggle）由 `src/compiler/animation-presets.ts` 生成关键帧，LLM 提示词与示例已同步；形状资产接入 `@remotion/shapes`（star/heart/triangle/arrow），编辑器与渲染器共用同一份 `IrObject` 渲染。

**字幕 / emoji / 文字编辑（第二批）已落地**：整句字幕（`src/compiler/subtitle.ts` 编译期测量分行 → IR `subtitles`，按音频区间出现，渲染与编辑器预览一致，不做逐字高亮）；内置 Twemoji emoji 资产（导演稿 `kind:"emoji"` → `EmojiAsset`；精选 27 个在 `public/twemoji/`，`npm run fetch-emoji` 拉取，CC-BY 4.0 署名随包）；文件型资产共用渲染分支（emoji / image，SVG 位图后续直接接入）；编辑器资产框 emoji 选择器 + 属性面板**文字内容编辑**（浏览器 canvas 测量，与编译端共享换行规则 `src/lib/text-wrap.ts`）；`ImageAsset` schema 作为 SVG/位图基石。

**出片质量冲刺（第三批）已落地**：真样片 `out/sky.mp4` 重出为 51.9s（6 条整句字幕 + 片头/片尾卡）；`timed-to-ir` 新增两条编译期确定性规则——片头尾卡（`bookends` 默认开，objects/audio/subtitles 在 IR 层整体平移，不动 TimedScript）与字幕安全区（越界元素编译期上移，`SUBTITLE_SAFE_ZONE`）；keyword 字号 64→84（`theme/tokens.ts`）；`demo.mp4` 同步重出（22.4s）；编辑器新增**只读 CC 字幕轨**（`TrackPanel` 右侧轨道 + `Timeline` 下方镜像，随语音区间显示）。**导演提示词 v2 已落地**（借鉴 Remotion 官方的场景密度）：每段=一个分镜、元素 14-20 个、cue ≥24、缺资产用文字占位、图形必须配标签、浅色氛围底（新增 `wash`/`soft` 令牌）、富 few-shot 示例（`examples/photosynthesis.director.json`，7 段/18 元素/45 cue）；实测 deepseek 输出 8 段/19-20 元素/51-52 cue（旧版 5/8/20）。**镜头语言与"画布-视频框-画面"三层次概念后置**（编辑器保留单层画布）。

**AI 素材生成（SVG，2026-10-08）已落地**：`npm run generate-asset -- --workspace <ws> --description "…"` 让 deepseek 直接写 SVG（提示词强制：**无背景**、`viewBox="0 0 200 200"`、受限色板、扁平矢量、不写文字/外链）；`src/asset/svg-asset.ts` 消毒校验（拒 `<script>`/事件属性/外链/`<image>`/异常比例，去固定 width/height）并解析 viewBox；IR 新增 **`form:"svg"` 资产**（`SvgAsset`，与 emoji/image 共用 `FileView` 渲染）。编辑器右上角新增合并入口「**AI 生成 ▼**」（AI 脚本生成 / AI 素材生成）；素材面板流程：描述 → 生成 → 预览（棋盘底显示透明背景）→ 设尺寸 → 保存入库。后端接口：`/api/generate-asset`（生成不落盘）、`/api/save-asset`（二次消毒后写入）。

**素材库与 LLM 挑选（第五批，2026-10-09）已落地**：每次生成的 SVG 都由 LLM 自动产出**名称/介绍/集合/标签**（`src/llm/asset-meta-prompt.ts`，第二步 `chatJson` 调用），入库到**全局素材库** `public/library/`（`index.json` 唯一事实源 + `svg/<id>.svg` + `thumbs/<id>.png` 轻量缩略图，`src/schema/library.ts` + `src/asset/library.ts`，随应用打包）。缩略图在保存时由浏览器 `canvas` 渲染（`editor/src/svg-thumbnail.ts`，128px PNG），CLI 生成的资产在打开素材库时自动回填。导演稿支持新元素 `kind:"asset"`（引用库 id）；生成时提示词注入【可用素材库】列表（id「名称」：介绍），并把可用 id 写入 JSON Schema 枚举（空库直接移除 asset 分支），`lintDirector` 增加 `dangling-library-asset` 兜底。编辑器「**素材库**」面板为**缩略图网格、按集合分组**：集合头勾选 = 整组可用、卡片勾选 = 单个（默认全选，按工作区持久化到 `workspaces/<ws>/asset-selection.json`）；卡上「＋画布/编辑/删除」；**轨道块显示素材缩略图与名称**（行高已加大）；AI 素材面板生成前**提示库中相似素材但不阻止生成**（`src/lib/similar-assets.ts`）；选中 SVG 元素可在属性面板点「**更换素材**」→ 素材库同页展开拾取（时间与关键帧保留，旧无引用资产自动清理）。「AI 脚本生成」按勾选集传给 `generate-director --assets`。真链路验证：deepseek 导演稿引用 mito 素材 2 次 → 编译 → 抽帧确认渲染。

```bash
npm install            # 安装依赖（仅在本目录运行；仓库根目录保持无构建）
npm run fetch-fonts    # 下载内置字体（Noto Sans SC，首次运行）
npm run fetch-emoji    # 下载内置 Twemoji 精选（public/twemoji/，首次运行）
npm run typecheck      # TypeScript 全量检查
npm test               # 单元测试（vitest）
npm run studio         # Remotion Studio 预览（读取 public/workspaces/demo/ir.json）
npm run editor         # P1 编辑器（Vite + React，自动打开 http://localhost:5200）

# 编辑器保存后可随时出片（验证"UI 编辑 → 渲染"闭环）
node editor/scripts/screenshot.mjs 400   # 编辑器自动化截图（需先启动 editor）

# 一键流水线（离线示例）
npm run pipeline -- --example --workspace demo --provider mock

# 分步执行
npm run director -- --topic "为什么天空是蓝色的" --workspace sky   # 主题 → LLM → 导演稿（需 deepseek 密钥）
npm run director -- --topic "…" --workspace x --assets mito       # 限定可用素材（缺省=全部；none=不用）
npm run generate-asset -- --description "线粒体扁平示意图"          # LLM 写 SVG+元数据 → public/library/（需 deepseek 密钥；--stdout 只输出 JSON；--name/--tags 可覆盖）
npm run voice -- --workspace demo                                  # 分段 TTS（需 config/tts.json + dashscope 密钥）
npm run voice -- --workspace demo --provider mock                  # 离线静音语音（自测用）
npm run compile -- --workspace demo                                # 导演稿+VoiceMap → TimedScript → IR
npm run render -- --workspace demo                                 # IR → MP4（out/demo.mp4）
npm run render -- --workspace demo --still --frame 90              # 抽单帧 PNG（画面检查）

# 辅助
npm run tts:test -- --text "测试文本"    # TTS 单段冒烟（校验时长与字级时间戳）
npm run tts:voices                      # 列出已克隆音色（找回 voice id）

# 密钥与配置（由用户操作，agent 不读取密钥文件）
powershell -ExecutionPolicy Bypass -File ../scripts/api-key.ps1 add dashscope
powershell -ExecutionPolicy Bypass -File ../scripts/api-key.ps1 add deepseek
# config/tts.json：复制 config/tts.example.json，填 wsEndpoint / voice
```

- 运行时数据在 `public/workspaces/<工作区>/`（`director.json` / `voice-map.json` / `timed-script.json` / `ir.json` / `audio/` / `asset-selection.json`），已被 gitignore。
- 素材库在 `public/library/`（`index.json` + `svg/` + `thumbs/` 轻量缩略图，**随应用打包提交**，不 gitignore）；渲染产物在 `out/`；字体在 `public/fonts/`；内置 emoji 在 `public/twemoji/`（Twemoji，CC-BY 4.0，署名见 `ATTRIBUTION.md`）。

---

## 一、项目定位

Visual Script 是一个 **LLM 驱动的结构化 2D 动画引擎**，用于科普/知识类教育视频。应用层核心价值在"Animation IR + 编译器 + 编辑器"三层，首次 Demo 的渲染后端走 Remotion。

本目录负责产出**可运行、可测试、可部署**的应用代码，最终交付：

- 命令行/脚本：主题/文案 → VoiceMap → TimedScript → Animation IR → MP4
- Web 编辑器：AI 脚本面板 + 画布 + 轨道 + 时间轴 + 属性面板
- 可安装二进制包 + 公网部署能力

---

## 二、核心工作流程

应用按以下单向数据流工作。任何功能都要先回答：它属于哪一层、输入输出是什么、会不会破坏这条单向流。

```
用户主题 / 文案
    │
    ▼
┌─────────────────┐
│ 1. 导演稿生成    │  ← LLM 结构化输出（JSON Schema 约束）
│ DirectorScript  │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐  ┌─────────────────┐
│ 2. 语音 │  │ 2'. 素材合成稿   │  ← 与语音并行
│ VoiceMap│  │ MaterialScript  │
└───┬────┘  └─────────────────┘
    │
    ▼
┌─────────────────┐
│ 3. 时间脚本      │  ← 纯函数编译，无 LLM、无随机
│ TimedScript     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. 动画 IR       │  ← 帧级对象、关键帧、镜头、音频
│ Animation IR    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. 渲染 / 预览   │  ← Remotion → MP4 / 编辑器预览
│ Render/Preview  │
└─────────────────┘
```

**铁则**：

1. 单向流：下游只读上游，不允许反向修改。
2. 时间只由语音实测时长 + 导演稿中的 `gapAfterMs/minHoldMs` 链式推导；LLM 不估算秒数。
3. 绑定靠稳定 id + 内联锚点 `[[...]]`，不靠数组下标或绝对时间。
4. 所有产物必须先过 Schema 校验，未知字段拒绝。

---

## 三、阶段规划

### P0：最小可运行闭环（出 30–60 秒样片）

目标：证明"主题 → 导演稿 → 语音 → 时间 → IR → MP4"整条链路能跑通。

| # | 任务 | 交付物 | 说明 |
|---|------|--------|------|
| P0-1 | 定义四层 + IR Schema | `src/schema/` + `schemas/*.json` | ✅ 已完成；Zod + JSON Schema 已对齐；IR 内联 assets（自包含） |
| P0-2 | 编译器 `compileTimeline()` | `src/compiler/compile-timeline.ts` + 测试 | ✅ 链式推导 / L2 锚点 / 悬空检查；32+ 单测 |
| P0-3 | TTSProvider 接口 + Dashscope | `src/tts/` | ✅ 已真跑（9.744s / 字级对齐 35 条） |
| P0-4 | 语音生成 CLI | `src/cli/generate-voice.ts` | ✅ 已真跑（6 段全对齐）；缓存按 provider 隔离 |
| P0-5 | TimedScript → Animation IR | `src/compiler/timed-to-ir.ts` | ✅ 出现/强调/移动/隐式出入场；slot 布局 |
| P0-6 | 字体 + 文字占位符 | `src/fonts.ts`、`src/asset/measure-text.ts` | ✅ Noto Sans SC 内置；fontkit 实测包围盒 + 分行 |
| P0-7 | Remotion 渲染 | `src/remotion/`、`src/cli/render.ts` | ✅ bundle → renderMedia → MP4；抽帧验证通过 |
| P0-8 | 样片验证 | `out/sky.mp4`（真 TTS 46.5s）+ 抽帧检查 | 🟡 已出片并抽帧验证；Docker 复验待做 |
| P0-9 | LLM 导演稿生成（新增） | `src/llm/`、`src/cli/generate-director.ts` | ✅ 已真跑（deepseek 一次通过） |

### 出片质量冲刺（第三批，2026-10-08）

| # | 任务 | 交付物 | 状态 |
|---|------|--------|------|
| Q-1 | sky 真样片补字幕重出 + 抽帧验证 | `out/sky.mp4`（51.9s）、`out/demo.mp4`（22.4s） | ✅ |
| Q-2 | 关键词字号与字幕安全区（编译期规则） | `src/theme/tokens.ts`、`src/compiler/layout.ts` | ✅ 单测覆盖 |
| Q-3 | 片头/片尾卡（编译期确定性生成） | `src/compiler/timed-to-ir.ts`（`bookends` 默认开） | ✅ 规格 §6.4 已记录 |
| Q-4 | 一键真链路复跑（新主题 → MP4） | `npm run pipeline -- --topic ... --workspace ...` | ⬜ 待跑（消耗真实额度） |
| Q-5 | Docker 容器复验（S1） | 见 `部署与打包方案.md` 第六节 | ⬜ 待做 |

### P1：可交互编辑器（Demo 加分项）

目标：让用户能在浏览器里手动调整 AI 生成的动画，形成"AI 生成 + 人工修正"闭环。

| # | 任务 | 交付物 | 状态 |
|---|------|--------|------|
| P1-1 | IR 单一状态（Zustand） | `editor/src/store.ts` | ✅ |
| P1-2 | 画布：选中 / 拖动自动关键帧 / 录制运动（拖动中空格续播+滚轮微调）/ 视图缩放平移 | `editor/src/components/Canvas.tsx` | 🟡 锚点吸附未做；**画布-视频框-画面三层次概念后置**（仅布局 C 原型展示过，与镜头语言一并推迟，编辑器保留单层画布） |
| P1-3 | 属性面板（双区块）：选中属性 + 可添加的效果库（动画/过渡/关键帧预设，从播放头应用）+ 文字内容编辑（浏览器测量回写 lines/bounds） | `editor/src/components/PropertyPanel.tsx`、`editor/src/measure-text-browser.ts`、效果库动作在 `editor/src/store.ts` `applyEffect` | ✅ |
| P1-4 | 布局 C 轨道面板 + 剪映式编辑（片段拖动/两端裁剪/子轨道关键帧拖动与增删/吸附/工具条/双击加帧/右键删除/关键帧作用区间细线）+ 下方精调时间轴（镜像行数/自适应刻度/高度自适应行数） | `editor/src/components/TrackPanel.tsx`、`Timeline.tsx` | ✅ 双时间轴共享缩放；AI/轨道面板宽度可拖分隔条；轨道块缩略图与素材名；行高加大；**关键帧拖动绝对跟手 + 相邻帧夹取不越位（`keyframeMoveBounds`）+ 同帧重复归一化** |
| P1-5 | 播放预览（rAF 播放头 + 音频同步） | `editor/src/App.tsx`、`editor/src/audio.ts` | ✅ |
| P1-6 | AI 对话窗口（主题 → LLM → 语音 → 编译，SSE 流式日志，自动应用） | `editor/src/components/AiPanel.tsx` + `vite.config.ts` /api/generate | ✅ |
| P1-7 | 资产框：画布内添加文字/几何/emoji（放在播放头） | `editor/src/components/AssetBar.tsx` | ✅ emoji 选择器（Twemoji 网格） |

### P2：镜头语言、素材生产与部署

目标：丰富表现力，完成比赛交付物（PDF、源码、二进制包、演示 MP4、公网访问）。

| # | 任务 | 交付物 | 状态 |
|---|------|--------|------|
| P2-1 | 镜头轨道 | `src/compiler/camera.ts` | ⬜ **后置**（先保样片质量与部署，暂缓；仅 IR 预留 `camera` 结构） |
| P2-2 | 素材合成稿 | `src/asset/material-script.ts` | ⬜ 仅 Schema（`src/schema/material.ts`） |
| P2-3 | SVG / 图片资产 | `src/asset/svg-asset.ts`、`image-asset.ts`、`src/asset/library.ts` | 🟡 `form:"svg"`/`image` 资产 + 文件渲染（FileView）+ AI 生成 + **素材库（index.json/元数据/LLM 引用）已落地**；SVG 命名元素锚点解析与图元生产后置 |
| P2-4 | emoji 资产 | `src/asset/emoji.ts`、`scripts/fetch-twemoji.mjs` | ✅ Twemoji 精选 27 个（`public/twemoji/`）；LLM/编译器/渲染器/编辑器全链路 |
| P2-5 | 字幕 | `src/compiler/subtitle.ts` | 🟡 整句字幕已落地（IR `subtitles`，音频区间显示）；编辑器 CC 字幕轨（只读）；逐字高亮（卡拉 OK）未做 |
| P2-6 | 主题令牌 | `src/theme/` | ⬜ 仅默认令牌（`tokens.ts`；keyword 84 / 字幕安全区已调） |
| P2-7 | 打包与部署 | Dockerfile、server、可安装二进制包 | ⬜ |
| P2-8 | 资产可用集 / 素材包（生成前预览勾选 → LLM allowlist） | 编辑器「素材库」面板、`/api/selection`、`src/llm/director-prompt.ts`（动态 enum）；设计见 `资产与锚点系统设计.md` §5.4 | ✅ 默认全选 + 按工作区持久化；导演生成按勾选集注入提示词与 JSON Schema |
| P2-9 | AI 素材生成（LLM 写 SVG → 校验标准化 → 人工确认入库） | `src/cli/generate-asset.ts`、`src/asset/svg-asset.ts`、`src/llm/asset-meta-prompt.ts`、编辑器「AI 生成 → AI 素材生成」面板；设计见 `资产与锚点系统设计.md` §6.1 | ✅ LLM 生成 SVG + 名称/介绍/标签 → 消毒 → 预览 → 入库 `public/library/`；真跑验证（mito 被导演稿引用并渲染进帧） |

---

## 四、模块划分

```
app/
├── package.json / tsconfig.json / vitest.config.ts
├── src/
│   ├── schema/          # 四层 + IR 的 Zod / JSON Schema 类型（已完成）
│   ├── compiler/        # 纯函数：anchors / layout / lint / canonical-hash /
│   │                    #   animation-presets（动画预设库）/ time（msToFrames）/
│   │                    #   subtitle（整句字幕编译）/
│   │                    #   compile-timeline / timed-to-ir（+ 单测）
│   ├── asset/           # font-constants / measure-text（fontkit 测量 + 换行）/
│   │                    #   emoji（Twemoji 精选注册表）/ svg-asset（SVG 消毒校验 + 元信息 + 色板）/
│   │                    #   library（素材库读写：index.json 原子写、增删改、按 id 解析）
│   ├── theme/           # tokens.ts：字号预设 + 颜色令牌 + 字幕版式常量
│   ├── tts/             # tts-provider / dashscope-ws / dashscope-provider /
│   │                    #   mock-provider / dashscope-voices（enrollment）
│   ├── llm/             # chat.ts（JSON / 文本双模式）/ director-prompt.ts（素材库注入+动态 enum）/
│   │                    #   asset-prompt.ts（SVG 生成）/ asset-meta-prompt.ts（名称/介绍/标签）
│   ├── remotion/        # Root / Video（对象层 + 字幕层）/ IrObject
│   │                    #   （文字 / 形状 @remotion/shapes / 文件型 FileView）/
│   │                    #   interpolate（编辑器与渲染共用）
│   ├── lib/             # keyframes.ts（关键帧编辑）/ text-wrap.ts（浏览器安全的
│   │                    #   共享换行规则：Node 与编辑器注入各自测量）
│   └── cli/             # director / generate-asset / voice / compile / render / pipeline /
│                        #   tts-test / tts-voices（+ args / run-guard）
├── editor/              # P1 Web 编辑器（Vite + React + Zustand，布局 C）
│   ├── index.html / vite.config.ts   # 开发期小后端：/api/workspaces、/api/save、/api/generate(SSE)
│   │                                 #   /api/generate-asset、/api/library、/api/save-asset、
│   │                                 #   /api/update-asset、/api/delete-asset、/api/thumbnail、/api/selection
│   ├── src/             # App / store / audio（音频同步）/ measure-text-browser
│   │                    #   （canvas 2D 测量）/ svg-thumbnail（canvas 渲染 128px 缩略图）/ components：
│   │                    #   AssetBar（资产框+emoji 选择器+素材库+AI 生成▼）/ AiPanel（AI 脚本）/
│   │                    #   AssetGenPanel（AI 素材：预览/元数据/入库）/ LibraryPanel（缩略图/勾选/管理）/
│   │                    #   Canvas（含字幕叠加）/ TrackPanel / Timeline / PropertyPanel
│   └── scripts/screenshot.mjs        # 自动化截图冒烟（CDP，支持指定工作区）
├── schemas/             # 供 LLM 使用的 JSON Schema（手写，与 Zod 对齐）
├── examples/            # 示例导演稿（离线兜底 + LLM few-shot）
├── public/
│   ├── fonts/           # 内置字体（npm run fetch-fonts 下载）
│   ├── twemoji/         # 内置 emoji（npm run fetch-emoji 下载，CC-BY 4.0 署名）
│   ├── library/         # 素材库（index.json + svg/ + thumbs/，随应用打包提交）
│   └── workspaces/      # 运行时工作区（gitignore）
├── out/                 # 渲染输出（gitignore）
├── scripts/fetch-fonts.mjs
├── scripts/fetch-twemoji.mjs
└── Dockerfile           # Linux 渲染容器（P2）
```

> 编辑器与渲染器**同构**：画布直接复用 `src/remotion/IrObject` 与 `src/remotion/interpolate`，
> 改数值/拖动 = `src/lib/keyframes.ts` 在播放头处写关键帧；保存写回 `ir.json`，CLI 渲染即出片。

### 各模块职责

| 模块 | 职责 | 禁止做的事 |
|------|------|------------|
| `schema` | 定义所有数据层的 Zod Schema + JSON Schema | 不处理业务逻辑 |
| `compiler` | 纯函数：`compileTimeline`、`timed-to-ir`、锚点解析、校验 | 不调用 LLM、不读写文件、不用随机数 |
| `tts` | `TTSProvider` 接口；Dashscope 首个实现；音频时长测量 | 不依赖具体编排逻辑 |
| `asset` | 资产库索引、字体加载、文字占位符测量、默认锚点生成 | 不处理时间轴 |
| `remotion` | 把 Animation IR 渲染为 Remotion 组件；导出 MP4 | 不直接依赖导演稿/时间脚本 |
| `editor` | 可视化编辑 IR；画布、轨道、时间轴、属性面板 | 不引入 IR 之外的图形状态 |
| `store` | IR 单一事实源 + 撤销/重做 | 不做渲染、不直接调用 LLM |
| `cli` | 串联整条 Pipeline 的命令行入口 | 不替代编译器的纯函数逻辑 |

---

## 五、关键工程约定

### 5.1 依赖管理

- 所有依赖在 `app/` 目录内通过 `package.json` 管理，**不在仓库根目录**运行 `npm install` / `pnpm`。
- v1 核心依赖：
  - `zod`：Schema 定义与运行时校验
  - `typescript`：类型系统
  - `remotion`、`@remotion/cli`、`@remotion/renderer`：渲染
  - `@remotion/fonts`、`@remotion/layout-utils`：字体与文字测量
  - `vitest`：单元测试
  - （可选）`tsx`：CLI 脚本直接运行 TS

### 5.2 数据校验

- 任何从外部（LLM、用户上传、磁盘读取）进入系统的 JSON，必须先过对应 Zod Schema。
- 所有 Zod 对象默认 `.strict()`，JSON Schema 对应 `additionalProperties: false`。
- 编译器输出（TimedScript / AnimationIR）也要自校验，确保中间产物合法。

### 5.3 时间单位

| 层级 | 单位 | 说明 |
|------|------|------|
| DirectorScript | 无 | 只有 `gapAfterMs`、`durationMs`、`minHoldMs` 等相对间隔 |
| VoiceMap | 毫秒 | 音频实测时长、字级对齐 |
| TimedScript | 毫秒 | 绝对时间线 |
| Animation IR | 帧 | `from`、`durationInFrames`、`frame` |
| Editor | 秒/帧 | 显示用秒，内部用帧 |

换算：`frame = round(ms * fps / 1000)`，显式取整，保证单调。

### 5.4 引用稳定性

- 所有可引用对象使用稳定 id：`^[a-z][a-z0-9-]*$`。
- 锚点语法：`[[锚点文本]]` 或 `[[anchorId|锚点文本]]`。
- 动作引用锚点：`assetId.anchorName`。
- 删除/重命名时由 linter 检测悬空引用，不静默丢弃。

### 5.5 缓存与重算

- VoiceMap 按 `textHash` 缓存，文本变化标记为"过期"，不自动重录。
- TimedScript 按 `sourceHash(director, voiceMap)` 缓存。
- 任何一层源数据变化，下游链式重算。

### 5.6 AI 使用披露

- 代码中关键文件头部标注"AI 生成 / 人工修改"比例与使用的模型。
- 比赛要求的披露文档在 P2 收尾阶段统一生成。

---

## 六、与根目录设计文档的映射

| 根目录文档 | 本目录对应实现 |
|------------|----------------|
| `0 针对比赛的创作设计/0-2 架构总览.md` | `src/schema/animation-ir.ts`、`src/compiler/`、`src/editor/` |
| `项目设计与实现文档/视频生成流水线设计-导演稿到动画.md` | `src/schema/` 四层数据、`src/compiler/compile-timeline.ts`、`src/tts/` |
| `项目设计与实现文档/资产与锚点系统设计.md` | `src/asset/` |
| `项目设计与实现文档/文字占位符与字体设计.md` | `src/fonts.ts`、`src/asset/text-placeholder.ts` |
| `项目设计与实现文档/web界面功能与实现设计.md` | `src/editor/` |
| `项目设计与实现文档/部署与打包方案.md` | `Dockerfile`、server、打包脚本（P2） |

---

## 七、质量与验证

### 7.1 单元测试

- `compiler/` 下每个纯函数配 `.test.ts`：空段、超长 hold、取整边界、悬空引用、锚点缺失。
- `schema/` 下测试：合法 JSON 通过、未知字段拒绝、默认值填充。

### 7.2 集成验证

- P0-8：跑一条 30–60 秒样片，人工检查音画同步、改字重录后时间自动重排。
- P0-8 后：在 Linux 容器（Docker Desktop）复跑渲染，提前暴露部署环境问题。

### 7.3 Linter / Guardrails

- 悬空引用检测：`cues[].on.narrationId/anchor`、`action.element/to`、narration 绑定。
- 语音过期检测：`textHash` 不匹配。
- 时间异常检测：负间隔、区间重叠、取整后冲突。
- 精度降级提示：L2 锚点无对齐时降级为段首。

---

## 八、本周节奏（假设 7 天）

| 天数 | 重点 | 产出 |
|------|------|------|
| 第 1 天 | P0-2 | `compileTimeline` + 测试通过 |
| 第 2 天 | P0-3 / P0-4 | TTSProvider、批量生成 VoiceMap |
| 第 3 天 | P0-5 / P0-6 | TimedScript → IR、字体与文字占位符 |
| 第 4–5 天 | P0-7 / P0-8 | Remotion 渲染打通、第一条样片 |
| 第 6–7 天 | P1-1 → P1-3 | 编辑器画布 + 属性面板 |

---

## 九、遇到新想法时的处理

1. 想加功能 → 先看它属于 P0/P1/P2；不属于 P0 先记 TODO，不切换主线。
2. 发现设计要改 → 先在根目录对应 `.md` 规格里改，再回本目录调实现。
3. 时间不够 → 砍掉 P1/P2，保 P0；P0 内部保 `P0-2 → P0-5 → P0-7`（能出片）。
4. 每完成一个里程碑 → 回本文件和根目录 `AGENTS.md` 更新状态。
