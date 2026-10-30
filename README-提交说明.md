# README-提交说明（源码包）

**作品**：Visual Script（可视脚本）—— LLM 驱动的结构化 2D 动画引擎（科普/知识类教育视频）
**版本**：0.1.0（`app/package.json` 中 `version` 字段）
**本包内容**：可直接构建、测试、出片的完整工程源码 + 配置示例 + 密钥管理脚本 + 内置资源（字体 / emoji / 素材库）。**本包是「源码方式」那一档**；免装环境的便携包与 Windows 安装器见提交材料 `06-可安装包/`。
**打包日期**：2026-10-30（同日重打包一次，仅更新本 README 的运行方式说明）　**来源基线**：`C:/Users/WIN11/Desktop/Visual_Script`（原版工程，打包过程未修改源工程任何文件）

---

## 1. 本包不含什么（先看这条，避免误判）

| 不含项 | 原因 | 你自己怎么得到 |
|---|---|---|
| `node_modules/` | 第三方依赖，体积 776 MB；且 Remotion 许可禁止再分发其代码 | 在 `app/` 内执行 `npm install`（版本由 `package-lock.json` 精确锁定） |
| `可参考开源项目/`（Remotion 4.0.533 源码 zip） | 冻结参考副本、非纯 MIT 许可、不可再分发 | 从 npm 安装 `remotion@4.0.533`；参考研究不随包提供 |
| `config/llm-api.json`、`config/tts.json` | **含 API 密钥与音色 id，绝不提供** | 用 `scripts/api-key.ps1` 自行配置（见 §5） |
| `app/public/workspaces/`、`app/out/` | 运行时产物（导演稿 / 音频 / IR / MP4） | 运行后自动生成；示例可由离线流水线重建 |
| Chrome Headless Shell | 渲染依赖的浏览器二进制（约 269 MB） | 首次 `npm run render` 时由 `@remotion/renderer` 自动下载（或用便携包，已内置） |
| Windows 安装包 / 便携包 / `dist/` | 二进制产物不在**源码包**内（源码包只含源码，约 11 MB） | 见提交材料 **`06-可安装包/`**：`VisualScript-Setup-0.1.0.exe`（安装器）、`visual-script-portable-0.1.0.zip`（便携包），由同一工程构建 |

> 说明：本包对应的**基线副本**没有 `app/server/` 目录（`/api/*` 逻辑位于 `app/editor/vite.config.ts`）；因此本包通过 `npm run editor`（Vite dev server，端口 5200）提供编辑界面。`06-可安装包/` 的构建产物来自同一工程的较新仓库副本，含 `app/server/`（生产入口），差异详见 `06-可安装包/说明.md` §3。

---

## 2. 三种运行方式（本包是第 ① 档，按需选择）

| # | 方式 | 在哪里 | 需要什么 | 适合谁 |
|---|---|---|---|---|
| ① | **源码方式（本包）** | `Visual_Script-源码包-v0.1.0.zip`（本文件所在包，约 11 MB） | Node.js **≥ 20**、`npm install`、首次渲染联网下载 Chrome Headless Shell；命令见 §4、§6 | 需要读源码 / 改代码 / 复现验证 |
| ② | **便携包** | `06-可安装包/visual-script-portable-0.1.0.zip`（274.09 MB） | **无需安装**：解压后双击 `visual-script\启动 Visual Script.cmd`；已内置 Node v22.23.3、Chrome Headless Shell、生产依赖 | 想快速「点开就看」 |
| ③ | **Windows 安装器** | `06-可安装包/VisualScript-Setup-0.1.0.exe`（164.46 MB，Inno Setup 6） | 双击安装（按用户装到 `%LOCALAPPDATA%\VisualScript`，**免管理员**），装完从开始菜单启动 | 想「像正常软件一样安装」 |

**差异要点**：

- ① 需要自备运行时与浏览器，首次 `npm install` + Chrome 下载约需数百 MB 与数分钟；
- ② ③ **免装 Node 与 Chrome**，运行与出片**不需要联网**（仅 AI 生成功能需联网调用 API）；
- **三档都不内置密钥**：均需使用者自行配置（源码方式按 §5；便携包/安装器在界面右上角「设置」里填写，配置目录 `%APPDATA%\VisualScript\config`）。
- ② ③ 的体积、SHA-256、构建命令与验证输出见 `06-可安装包/说明.md`（含 exe 与便携包哈希，可直接复核）。

---

## 3. 环境要求（仅源码方式）

| 项 | 要求 |
|---|---|
| Node.js | **≥ 20**（`app/package.json` 的 `engines`；本次验证环境 v24.15.0） |
| npm | 随 Node 提供（实测 11.12.1） |
| 网络（首次） | `npm install` 访问 registry.npmjs.org；首次渲染下载 Chrome Headless Shell |
| 磁盘 | `node_modules` 约 776 MB + 浏览器约 269 MB |
| 可选 | DeepSeek API key（导演稿 / 素材生成）、DashScope CosyVoice 业务空间与音色（真实语音） |

---

## 4. 五分钟跑通（全部离线、零额度）

```powershell
cd app
npm install
npm run typecheck                     # 类型检查，期望无输出、退出码 0
npm run test                          # 单元测试，期望 15 个文件 / 89 个用例全通过
npm run pipeline -- --example --workspace demo --provider mock   # 示例导演稿 → 离线语音 → IR → MP4
npm run render -- --workspace demo --still --frame 90            # 抽单帧检查画面
npm run editor                        # 浏览器打开 http://localhost:5200
```

- 内置字体与 emoji **已随包**（`app/public/fonts/`、`app/public/twemoji/`），通常无需再执行拉取；若目录缺失再运行 `npm run fetch-fonts` / `npm run fetch-emoji`。
- 产物：`app/public/workspaces/<workspace>/`（导演稿 / 语音 / `ir.json`）与 `app/out/<workspace>.mp4`。

---

## 5. 配置密钥（由使用者本人操作，本包不含任何密钥）

```powershell
# 在解压后的仓库根目录执行（与 scripts/ 同级）
powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 init              # 初始化空配置 config/llm-api.json
powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 add deepseek      # 交互式录入密钥（输入不回显）
powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 list              # 查看已配置项（密钥打码）
powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 remove deepseek   # 删除某个 provider
```

TTS 配置：复制 `config/tts.example.json` 为 `config/tts.json`，填写 `wsEndpoint` / `model` / `voice`（必填），`format` 默认 mp3、`sampleRate` 可选。
也可用环境变量临时提供密钥：`DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY`（优先于配置文件）。

> 合规提醒：克隆音色须为本人声音或已获授权的声音；`config/llm-api.json` 与 `config/tts.json` **不得提交到任何仓库或网盘**。

---

## 6. 可用命令（共 15 条，均取自本包 `app/package.json` 的 `scripts`）

| 命令 | 实际执行 | 用途 |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` | 类型检查（覆盖 src / tests / editor） |
| `npm run test` | `vitest run` | 单元测试（只收集 `src/**/*.test.ts`） |
| `npm run test:watch` | `vitest` | 监听模式 |
| `npm run studio` | `remotion studio src/remotion/index.ts` | Remotion Studio 预览合成 |
| `npm run editor` | `vite editor` | 编辑器（http://localhost:5200） |
| `npm run fetch-fonts` | `node scripts/fetch-fonts.mjs` | 拉取内置字体 + OFL |
| `npm run fetch-emoji` | `node scripts/fetch-twemoji.mjs` | 拉取 Twemoji svg + 署名 |
| `npm run director` | `tsx src/cli/generate-director.ts` | 主题 → 导演稿（`--topic` 必填） |
| `npm run generate-asset` | `tsx src/cli/generate-asset.ts` | 描述 → SVG 素材（`--description` 必填） |
| `npm run voice` | `tsx src/cli/generate-voice.ts` | 导演稿 → 语音 + VoiceMap（`--provider mock` 可离线） |
| `npm run tts:test` | `tsx src/cli/tts-test.ts` | 单段合成冒烟测试 |
| `npm run tts:voices` | `tsx src/cli/tts-voices.ts` | 列出已克隆音色 |
| `npm run compile` | `tsx src/cli/compile.ts` | 导演稿 + VoiceMap → `ir.json` |
| `npm run render` | `tsx src/cli/render.ts` | IR → MP4；`--still --frame N` 出单帧 |
| `npm run pipeline` | `tsx src/cli/pipeline.ts` | 一键全链路 |

传参写法：`npm run <script> -- --flag value`。

> 本包是基线副本，**没有** `package:win` / `build:editor` / `serve` 三个脚本（它们在工程仓库里）；因此无法在本包内一条命令产出安装器 —— 已有的安装器/便携包见 §2 与 `06-可安装包/说明.md`。

---

## 7. 目录结构

```text
.
├─ AGENTS.md                  工程硬规则与目录导览（根的与 app/ 下各一份）
├─ README-提交说明.md         本文件
├─ 授权说明.md                自研授权范围 + 第三方边界
├─ scripts/api-key.ps1        密钥管理脚本（写 config/llm-api.json，不入库）
├─ config/
│  ├─ llm-api.example.json    配置示例（占位符，无真实密钥）
│  └─ tts.example.json        TTS 配置示例
└─ app/
   ├─ package.json / package-lock.json    依赖声明与精确锁定（363 条顶层包）
   ├─ tsconfig.json / vitest.config.ts    编译与测试配置
   ├─ src/                                编译器 / Schema / TTS / LLM / 渲染组件 / CLI
   ├─ editor/                             编辑器（Vite + React，含 /api/* 处理）
   ├─ schemas/                            5 份手写 JSON Schema（LLM response_format 用）
   ├─ examples/                           导演稿示例
   ├─ scripts/                            fetch-fonts / fetch-twemoji
   └─ public/
      ├─ fonts/    NotoSansSC-VF.ttf + OFL.txt（SIL OFL 1.1）
      ├─ twemoji/  27 个 SVG + ATTRIBUTION.md（CC-BY 4.0）
      └─ library/  素材库 index.json + svg/ + thumbs/（含 3 条 AI 生成资产）
```

---

## 8. 授权与第三方边界（摘要）

完整的资源清单、许可义务与合规状态见随包根目录的 **`授权说明.md`**；比赛材料中另有《开源声明与资源使用清单.md》《AI使用披露.md》《原创性与授权边界说明.md》。三条要点：

1. **Remotion 4.0.533 不是 MIT**（Remotion License，Free / Company 双轨）：本项目仅通过 npm 依赖调用其公开 API，不复制、不修改；**本源码包不含 Remotion 代码**，运行前由 `npm install` 自行获取。（`06-可安装包/` 的二进制产物内置了运行时依赖，其许可口径见 `06-可安装包/说明.md` §9。）
2. **字体与 emoji** 为第三方资源，随包并附许可/署名文件（`OFL.txt`、`ATTRIBUTION.md`），请勿删除。
3. **素材库 3 条 SVG 为 AI 生成**（`index.json` 记录 `generator.provider` 与提示词）；按赛事规则，AI 生成内容不当然构成团队自主知识产权。

---

## 9. 已验证事实（本次提交实测）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | 退出码 **0**，无错误输出 |
| `npm run test` | 退出码 **0**，**15 个测试文件 / 89 个用例全部通过**（3.43s） |
| 代码规模 | 手写 TS/TSX **83 文件 / 11,657 行**（`app/src` 68 文件 6,971 行；`app/editor` 15 个 `.ts/.tsx` 4,686 行） |
| 依赖 | 21 条直接依赖、**363 条顶层包**，全部来自 registry.npmjs.org，版本由 lockfile 精确锁定 |
| 成片 | `app/out/` 6 个 MP4（16.939s–68.437s，合计约 15.66 MB），不在本包内，作为验证材料单独提交 |
| 二进制产物 | 安装器 `VisualScript-Setup-0.1.0.exe`（164.46 MB，SHA-256 `70DDE7…E83C3`）与便携包 `visual-script-portable-0.1.0.zip`（274.09 MB，SHA-256 `67C133…3D95`），见 `06-可安装包/` |

---

## 10. 常见问题

| 现象 | 处理 |
|---|---|
| `未找到 LLM 密钥配置` | 按 §5 用 `scripts/api-key.ps1` 配置，或设 `DEEPSEEK_API_KEY` |
| `未找到 TTS 配置` / `TTS 配置缺少字段` | 复制 `config/tts.example.json` 为 `config/tts.json` 并填 `wsEndpoint` / `model` / `voice` |
| 首次 `render` 卡住 | 需联网下载 Chrome Headless Shell（约 269 MB）；不想装环境可直接用 `06-可安装包/` 的便携包（已内置） |
| 中文显示为方块 | 确认 `app/public/fonts/NotoSansSC-VF.ttf` 存在（17,772,300 字节） |
| 编辑器端口冲突 | 5200 被占用，关闭占用进程后重试 |
| 想要「装好就能用」的形态 | 用 `06-可安装包/VisualScript-Setup-0.1.0.exe`（安装器）或便携 zip，二者免装 Node 与 Chrome |

