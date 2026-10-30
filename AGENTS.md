# AGENTS.md

Visual Script / 可视脚本：LLM 驱动的结构化 2D 动画引擎（科普教育视频），比赛参赛项目（大模型与智能体应用赛道）。定位"代码化媒体"——Animation IR 是可执行的"视频程序源码"，MP4 只是它的一次运行结果。设计已定稿，`app/` 工程已跑通真链路（主题 → deepseek 导演稿 → CosyVoice 语音 → IR → Remotion 出片）。

**权威来源**：命令与逐项状态以 `app/AGENTS.md` 为准；需求以 `0 针对比赛的创作设计/`、`项目设计与实现文档/` 的规格为准。本文件只放容易踩坑的硬规则与指针。

## 硬性规则

- **根目录没有构建系统**：所有命令都在 `app/` 内跑（`npm install` / `typecheck` / `test` / `editor` / `pipeline`…）。不要在根目录执行 npm、tsc、pytest。临时实验代码放 `%TEMP%\opencode\`。
- **密钥**：`config/llm-api.json`（LLM）与 `config/tts.json`（TTS）已被 gitignore。**不得读取其内容，也不得要求用户把密钥粘贴进对话**；若密钥已出现在对话或文件中，提醒用户去控制台轮换。增删改由用户运行 `powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 add deepseek|dashscope`（另有 `init` / `list` / `remove`）。
- **不要修改 `可参考开源项目/remotion-4.0.533/`**（冻结参考副本）。Remotion 许可非纯 MIT：只按 npm 依赖使用公开 API，不要把参考副本源码复制进本仓库或再分发。
- **文档一律中文**；要改设计时先改对应规格 `.md`，再改代码。
- **界面布局 C 已定稿**（右侧轨道面板含子轨道 + 下方精调时间轴，双时间轴同步）：不要把轨道挪回时间轴下方。

## 架构要点（容易做错的地方）

- 单向数据流：主题 → 导演稿 `DirectorScript` → 语音 `VoiceMap` → 时间 `TimedScript` → `AnimationIR` → Remotion。下游只读上游，不允许反向修改。
- 时间只由"语音实测时长 + `gapAfterMs`"链式推导；**毫秒只存在于语音/编排层，IR 起用帧**（`frame = round(ms * fps / 1000)`）。
- LLM 只写语义：样式预设名、slot、稳定 id、emoji id、素材库 id，cue 用内联锚点 `[[...]]` 绑定；不写绝对时间与最终像素坐标。所有 Zod Schema `.strict()`，未知字段拒绝。
- **编辑器与渲染器同构**：共用 `app/src/remotion/IrObject` + `interpolate`；编辑器保存 `ir.json` 后由 CLI 渲染出片。渲染行为的改动要同时在两条路径生效；编辑器不得引入 IR 之外的状态。
- **手写 JSON Schema 需手工同步**：`app/schemas/*.schema.json` 是手写文件（LLM 的 response_format 直接用）。改 Zod（新增元素 kind、枚举等）时必须同步 JSON Schema 与提示词文案（素材库候选是生成时动态注入 enum）。例：新增 emoji 要同步 `src/schema/common.ts`（EmojiId）、`src/asset/emoji.ts`、`schemas/director-script.schema.json`、`scripts/fetch-twemoji.mjs` 四处。
- **确定性渲染**：禁止墙上时钟、无种子随机、CSS transition；只用内置字体（不依赖系统字体）；emoji 走 Twemoji 图片，不用字体渲染。
- **测试位置有硬约束**：vitest 只收集 `app/src/**/*.test.ts`；编辑器里的纯逻辑要放 `app/src/lib/`（如 `text-wrap.ts`、`similar-assets.ts`）才能被测试；浏览器代码不得 import Node 专属模块（如 fontkit）。
- **文件归属**：`app/public/library/`（素材库：`index.json` 唯一事实源 + `svg/` + `thumbs/`）随包提交；`app/public/workspaces/`（运行时工作区）与 `app/out/` 已 gitignore。素材库资产是 `form:"svg"`，与 emoji/image 共用 `IrObject` 的文件渲染分支。
- **编辑器 dev server（:5200）自带小后端**（`app/editor/vite.config.ts` 的 `/api/*`，会 spawn `tsx` 跑 CLI）：改了 CLI 行为要意识到编辑器接口同步受影响。

## 目录导览

| 路径 | 用途 |
|------|------|
| `app/` | 应用工程：`src/`（schema / compiler / tts / llm / remotion / asset / cli）+ `editor/`（Vite + React 编辑器）；命令见 `app/AGENTS.md` |
| `0 针对比赛的创作设计/` | 比赛定位、架构总览、代码化媒体定位（需求权威） |
| `项目设计与实现文档/` | 五份规格 + `部署与打包方案.md`；`草稿1/2` 权威性低于规格 |
| `界面原型/` | 静态 HTML 原型（无构建，浏览器直接打开）；`layout-c.html` 为定稿 |
| `设计草图/` | Excalidraw 线框与手绘稿 |
| `config/` + `scripts/api-key.ps1` | 密钥配置与增删改脚本 |
| `比赛交付清单/` | 交付物清单、第三方依赖与 AI 使用披露 |
| `可参考开源项目/` | 冻结 Remotion 参考树 + Remotion 架构研究（只读） |

## 常用命令（完整清单见 `app/AGENTS.md`）

```bash
cd app
npm install                     # 依赖只装在 app/
npm run fetch-fonts             # 首次（或 public/fonts 缺失时）
npm run fetch-emoji             # 首次（或 public/twemoji 缺失时）
npm run typecheck && npm test   # 改动的最低验证（typecheck 覆盖 app 与 editor）
npm run editor                  # 编辑器，http://localhost:5200
npm run pipeline -- --example --workspace demo --provider mock   # 离线全链路（不耗额度）
npm run render -- --workspace demo --still --frame 90            # 抽帧检查画面
node editor/scripts/screenshot.mjs 350 out/shot.png <workspace>  # 编辑器截图（需先起 editor）
```

- 完成标准：`npm run typecheck` + `npm test` 全绿；画面相关改动用抽帧/截图人工确认。
- `director` / `voice` / `generate-asset` 会消耗用户真实额度；验证优先走 `--provider mock` 或 `--stdout`。

## 当前状态（快照，仅作方向感，详情见 `app/AGENTS.md`）

- 已落地：真链路出片（`app/out/sky.mp4` 51.9s、`demo.mp4` 22.4s）、P1 编辑器（画布 / 轨道 / 关键帧编辑 / 属性面板 / 播放预览 / AI 面板）、整句字幕、Twemoji、AI 素材生成 + 全局素材库（名称/介绍/集合/标签 + 缩略图 + LLM 挑选 allowlist）。
- 主线下一步：真实链路新主题复跑、Docker 容器复验（部署硬要求）、编辑器锚点吸附、逐字字幕；镜头语言（P2-1）与"画布-视频框-画面"三层次概念后置。
- 每完成一项：更新 `app/AGENTS.md` 的状态表（根目录不再维护大表）。

## 比赛约束（勿忘）

- 交付物：设计文档（PDF）、源代码、可安装二进制包、≤5 分钟演示 MP4；软件须公网可访问。
- 必须披露 AI 使用情况（哪些模型/工具、AI 代码比例）；关键文件保留"AI 生成 / 人工修改"标注。
