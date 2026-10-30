# Visual Script · 浮帧

> LLM 驱动的结构化 2D 动画引擎（科普 / 知识讲解视频方向）。
> 2026 AIC · AI+开源 参赛作品。作品名：**浮帧 Visual Script**。

## 一句话

把视频表达为一份受 Schema 约束、可读可改的中间表示（Animation IR）；MP4 只是这份"视频程序"的一次运行结果。
LLM 只写语义（场景、元素、标签、字幕锚点），时间与几何由确定性编译器计算。

## 四层链路

```
主题 / 文案
   └─ LLM 导演层  → DirectorScript   语义：场景、样式预设、slot、稳定 id、内联锚点
        └─ 语音层  → VoiceMap        真实 TTS 的逐句实测时长
             └─ 编译器 → TimedScript → AnimationIR   帧级，frame = round(ms × fps / 1000)
                  └─ 渲染层 → MP4
```

单向数据流：下游只读上游。毫秒只存在于语音/编排层，进入 IR 即换算为帧。
编辑器与渲染器共用同一套组件与插值实现，因此"预览"与"成片"不会不一致。

## 快速开始

需要 Node.js ≥ 20。

```bash
cd app
npm install
npm run fetch-fonts      # 首次：拉取内置字体（Noto Sans SC，OFL 1.1）
npm run fetch-emoji      # 首次：拉取 Twemoji 资源（CC-BY 4.0）
npm run typecheck        # 期望退出码 0
npm test                 # 期望 15 文件 / 89 用例全通过
```

**离线跑通全链（不消耗任何 API 额度）**

```bash
npm run pipeline -- --example --workspace demo --provider mock
npm run render -- --workspace demo --still --frame 90     # 抽帧核对画面
```

**编辑器**

```bash
npm run editor           # http://localhost:5200
```

**真实链路**（需要自备 LLM 与 TTS 密钥）

```bash
# Windows PowerShell：交互式写入 app/config/llm-api.json 与 app/config/tts.json
powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 add deepseek
powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 add dashscope

npm run director -- --topic "为什么天空是蓝色的" --workspace sky
npm run voice    -- --workspace sky
npm run compile  -- --workspace sky
npm run render   -- --workspace sky
```

密钥文件已被 `.gitignore` 排除，仓库内不含任何密钥。

## 目录结构

| 路径 | 内容 |
|---|---|
| `app/src/schema/` | Zod + 手写 JSON Schema 契约（DirectorScript / VoiceMap / TimedScript / AnimationIR） |
| `app/src/llm/` | 导演稿提示词与结构化输出调用 |
| `app/src/tts/` | DashScope CosyVoice 与离线 mock provider（同一接口） |
| `app/src/compiler/` | 锚点解析、时间链式推导、布局与字幕安全区、lint、帧级 IR 生成 |
| `app/src/remotion/` | 帧驱动渲染组件（对象、字幕、背景） |
| `app/editor/` | Vite + React 编辑器（画布 / 轨道 / 关键帧 / 属性面板 / 时间轴） |
| `app/schemas/` | 手写 JSON Schema，直接作为模型 response_format |
| `app/public/library/` | 素材库（AI 生成 + 复用，`index.json` 为唯一事实源） |

## 证据与合规

- 使用与修改方式、第三方依赖版本与许可、AI 使用披露、原创与授权边界，见 [授权说明.md](授权说明.md)。
- 内置字体 Noto Sans SC（SIL OFL 1.1）、Twemoji（CC-BY 4.0）随包分发并保留其署名文件。
- Remotion 为专属许可（非 MIT），本项目仅通过 npm 依赖调用其公开 API，不复制、不修改、不再分发其源码。

## 许可

本项目自研代码的开源许可证**尚待定稿**，在此之前不视为已授予分发许可；如需引用请先联系作者。

## 联系

参赛编号：AIC-2026-20142166
