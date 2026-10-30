import { create } from "zustand";
import { EMOJI_DEFAULT_SIZE, EMOJI_FILES } from "@app/asset/emoji";
import {
  ambientKeyframes,
  enterKeyframes,
  exitKeyframes,
  type BaseTransform,
} from "@app/compiler/animation-presets";
import { boxAnchors } from "@app/compiler/layout";
import {
  applyTransformAtFrame,
  movePropertyKeyframe,
  removeKeyframe,
  removePropertyKeyframe,
  setKeyframeEasing as setKeyframeEasingPure,
  setKeyframeValue as setKeyframeValuePure,
  upsertKeyframe,
  type TransformProp,
} from "@app/lib/keyframes";
import { interpolateTransform } from "@app/remotion/interpolate";
import {
  AnimationIR,
  type Asset,
  type Keyframe,
  type PartialTransform,
  type SceneObject,
  type ShapeAsset,
} from "@app/schema/animation-ir";
import type { EmojiId, TextStylePreset } from "@app/schema/common";
import type { LibraryAsset } from "@app/schema/library";
import { presetColor, TEXT_PRESETS } from "@app/theme/tokens";
import { measureTextInBrowser } from "./measure-text-browser";
import { dataUrlToBase64, renderSvgThumbnail } from "./svg-thumbnail";

export type Status = { kind: "info" | "error"; message: string } | null;

export type GenerationState = {
  running: boolean;
  logs: string[];
  error: string | null;
};

/** AI 素材面板状态：生成中 / 预览中的 SVG + LLM 生成的元数据。 */
export type AssetGenState = {
  running: boolean;
  svg: string | null;
  viewBox: { width: number; height: number } | null;
  /** LLM 生成的名称 / 介绍 / 集合 / 标签（面板可改后再保存） */
  name: string;
  description: string;
  collection: string;
  tags: string[];
  /** 本次生成的输入描述（记录到库条目的 generator.prompt） */
  prompt: string;
  error: string | null;
};

/** 保存生成素材时的选项。 */
export type SaveAssetOptions = {
  size: number;
  name: string;
  description: string;
  collection: string;
  tags: string[];
  applyToCanvas: boolean;
};

/** 「为选中对象更换素材」的拾取模式。 */
export type LibraryPick = { objectId: string } | null;

/** 画布与轨道面板之间的 AI 面板：脚本 / 素材 / 素材库 / 收起。 */
export type AiPanelMode = "script" | "asset" | "library" | null;

export type AddElementSpec =
  | { kind: "text"; preset: TextStylePreset; text: string }
  | {
      kind: "shape";
      shape: ShapeAsset["shape"];
      color: string;
      width: number;
      height: number;
    }
  | { kind: "emoji"; emoji: EmojiId };

/** 选中的关键帧（对象局部帧 + 属性）。 */
export type KeyframeSelection = {
  objectId: string;
  frame: number;
  property: TransformProp;
} | null;

/** 可添加到选中元素的动画预设（效果库）。 */
export type EffectId =
  | "emphasize"
  | "float"
  | "bounce"
  | "shake"
  | "wiggle"
  | "enter_fade"
  | "enter_pop"
  | "enter_slide_up"
  | "exit_fade"
  | "exit_shrink";

/** 各效果的默认时长（毫秒）。 */
const EFFECT_DURATION_MS: Record<EffectId, number> = {
  emphasize: 800,
  float: 1500,
  bounce: 1200,
  shake: 600,
  wiggle: 900,
  enter_fade: 300,
  enter_pop: 400,
  enter_slide_up: 400,
  exit_fade: 300,
  exit_shrink: 300,
};

type EditorState = {
  workspace: string;
  ir: AnimationIR | null;
  currentFrame: number;
  playing: boolean;
  selectedId: string | null;
  selectedKeyframe: KeyframeSelection;
  dirty: boolean;
  status: Status;
  aiPanel: AiPanelMode;
  generation: GenerationState;
  assetGen: AssetGenState;
  /** 素材库（public/library/index.json） */
  library: LibraryAsset[];
  /** 生成可用集：null = 全部可用；数组 = 显式勾选 */
  enabledAssetIds: string[] | null;
  /** 素材拾取模式（为选中对象更换素材） */
  libraryPick: LibraryPick;
  /** 双时间轴共享的时间缩放（1× = 适配宽度） */
  timelineZoom: number;
  loadWorkspace: (ws: string) => Promise<void>;
  reload: () => Promise<void>;
  setFrame: (frame: number) => void;
  setPlaying: (playing: boolean) => void;
  select: (id: string | null) => void;
  selectKeyframe: (selection: KeyframeSelection) => void;
  updateSelectedTransform: (partial: PartialTransform) => void;
  updateObject: (
    id: string,
    updater: (object: SceneObject) => SceneObject,
  ) => void;
  /** 属性面板：编辑文字资产内容（浏览器测量后写回 lines / bounds）。 */
  updateAssetText: (id: string, text: string) => Promise<void>;
  updateObjectTiming: (
    id: string,
    patch: { from?: number; durationInFrames?: number },
  ) => void;
  removeKeyframeAt: (id: string, localFrame: number) => void;
  moveKeyframe: (
    id: string,
    fromLocalFrame: number,
    toLocalFrame: number,
    property: TransformProp,
  ) => void;
  removeKeyframeProperty: (
    id: string,
    localFrame: number,
    property: TransformProp,
  ) => void;
  /** 子轨道双击：在指定帧为指定属性打关键帧（取该帧插值结果）。 */
  addKeyframeAt: (
    id: string,
    localFrame: number,
    property: TransformProp,
  ) => void;
  setKeyframeValueAt: (
    id: string,
    localFrame: number,
    property: TransformProp,
    value: number,
  ) => void;
  setKeyframeEasingAt: (
    id: string,
    localFrame: number,
    easing: "linear" | "ease-in" | "ease-out" | "ease-in-out",
  ) => void;
  setTimelineZoom: (zoom: number) => void;
  addPoseKeyframeAtPlayhead: () => void;
  /** 效果库：从播放头开始为选中元素生成/合并关键帧。 */
  applyEffect: (effect: EffectId) => void;
  addElement: (spec: AddElementSpec) => void;
  removeSelected: () => void;
  /** 切换 AI 面板（脚本 / 素材 / 收起）。 */
  setAiPanel: (panel: AiPanelMode) => void;
  generate: (topic: string) => Promise<void>;
  /** AI 素材：描述 → LLM 写 SVG（预览用，不落盘）。 */
  generateAsset: (description: string) => Promise<void>;
  /** 保存生成素材到素材库（可选同时挂到画布）。 */
  saveGeneratedAsset: (options: SaveAssetOptions) => Promise<void>;
  /** 丢弃预览中的素材。 */
  discardAsset: () => void;
  /** 读取素材库 + 当前工作区的生成可用集。 */
  loadLibrary: () => Promise<void>;
  /** 勾选/取消某个素材的"允许生成使用"。 */
  toggleAssetEnabled: (id: string) => void;
  /** 修改素材元数据（名称/介绍/集合/标签）。 */
  updateLibraryAsset: (
    id: string,
    patch: {
      name?: string;
      description?: string;
      collection?: string;
      tags?: string[];
    },
  ) => Promise<void>;
  /** 删除素材（索引+文件）。 */
  deleteLibraryAsset: (id: string) => Promise<void>;
  /** 把素材库条目按默认宽度加到画布（播放头处）。 */
  addLibraryAssetToCanvas: (entry: LibraryAsset) => void;
  /** 为缺缩略图的素材补齐小图（浏览器渲染 → /api/thumbnail）。 */
  backfillThumbnails: () => Promise<void>;
  /** 进入素材拾取模式：素材库面板中选择后替换选中对象的资产。 */
  startLibraryPick: (objectId: string) => void;
  /** 退出素材拾取模式。 */
  cancelLibraryPick: () => void;
  /** 用素材库条目替换对象资产（保持时间与关键帧）。 */
  replaceObjectAsset: (objectId: string, entry: LibraryAsset) => void;
  /** 按集合整组勾选/取消生成可用。 */
  toggleCollectionEnabled: (collection: string) => void;
  save: () => Promise<void>;
  setStatus: (status: Status) => void;
};

let elementCounter = 0;

/** 已尝试回填缩略图的素材 id（避免重复请求）。 */
const thumbnailBackfillAttempted = new Set<string>();

/** 把资产挂到 IR：在播放头处创建淡入对象（同一资产可挂多个实例）。 */
function attachAssetToIr(
  ir: AnimationIR,
  asset: Asset,
  currentFrame: number,
  objectId?: string,
): AnimationIR {
  const id = objectId ?? asset.id;
  const layer = ir.objects.reduce((max, o) => Math.max(max, o.layer), 0) + 1;
  const from = Math.max(0, Math.min(currentFrame, ir.totalFrames - 2));
  const object: SceneObject = {
    id,
    asset: asset.id,
    from,
    durationInFrames: Math.max(1, ir.totalFrames - from),
    layer,
    initial: { x: 960, y: 540, scale: 1, rotation: 0, opacity: 1 },
    keyframes: [
      { frame: 0, transform: { opacity: 0 }, easing: "linear" },
      { frame: 8, transform: { opacity: 1 }, easing: "linear" },
    ],
  };
  const hasAsset = ir.assets.some((a) => a.id === asset.id);
  return {
    ...ir,
    assets: hasAsset ? ir.assets : [...ir.assets, asset],
    objects: [...ir.objects, object],
  };
}

export const useEditor = create<EditorState>((set, get) => ({
  workspace: "leaves",
  ir: null,
  currentFrame: 0,
  playing: false,
  selectedId: null,
  selectedKeyframe: null,
  dirty: false,
  status: null,
  aiPanel: "script",
  generation: { running: false, logs: [], error: null },
  assetGen: {
    running: false,
    svg: null,
    viewBox: null,
    name: "",
    description: "",
    collection: "",
    tags: [],
    prompt: "",
    error: null,
  },
  library: [],
  enabledAssetIds: null,
  libraryPick: null,
  timelineZoom: 1,

  async loadWorkspace(ws) {
    set({
      workspace: ws,
      status: { kind: "info", message: `加载工作区 ${ws} ...` },
    });
    try {
      const res = await fetch(`/workspaces/${ws}/ir.json`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ir = AnimationIR.parse(await res.json());
      set({
        ir,
        currentFrame: 0,
        playing: false,
        selectedId: ir.objects[0]?.id ?? null,
        dirty: false,
        status: {
          kind: "info",
          message: `已加载 ${ws}：${ir.assets.length} 资产 / ${ir.objects.length} 对象 / ${ir.totalFrames} 帧`,
        },
      });
      void get().loadLibrary();
    } catch (err) {
      set({
        ir: null,
        status: {
          kind: "error",
          message: `加载失败：${(err as Error).message}`,
        },
      });
    }
  },

  async reload() {
    await get().loadWorkspace(get().workspace);
  },

  setFrame(frame) {
    const { ir } = get();
    if (!ir) return;
    const clamped = Math.max(
      0,
      Math.min(Math.floor(frame), Math.max(0, ir.totalFrames - 1)),
    );
    set({ currentFrame: clamped });
  },

  setPlaying(playing) {
    set({ playing });
  },

  select(id) {
    set({ selectedId: id, selectedKeyframe: null });
  },

  selectKeyframe(selection) {
    set({
      selectedKeyframe: selection,
      selectedId: selection ? selection.objectId : get().selectedId,
    });
  },

  /** 在播放头处写入变换 → 自动打关键帧（"界面 = IR 编辑器"的核心规则） */
  updateSelectedTransform(partial) {
    const { ir, selectedId, currentFrame } = get();
    if (!ir || !selectedId) return;
    set({
      ir: {
        ...ir,
        objects: ir.objects.map((o) =>
          o.id === selectedId
            ? applyTransformAtFrame(o, currentFrame, partial)
            : o,
        ),
      },
      dirty: true,
    });
  },

  updateObject(id, updater) {
    const { ir } = get();
    if (!ir) return;
    set({
      ir: {
        ...ir,
        objects: ir.objects.map((o) => (o.id === id ? updater(o) : o)),
      },
      dirty: true,
    });
  },

  /** 文字内容编辑：浏览器端测量（与编译端同规则）后写回资产。 */
  async updateAssetText(id, text) {
    const { ir } = get();
    if (!ir) return;
    const asset = ir.assets.find((a) => a.id === id);
    if (!asset || asset.form !== "text") return;
    if (!text.trim()) {
      set({ status: { kind: "error", message: "文字内容不能为空" } });
      return;
    }

    try {
      const measured = await measureTextInBrowser(text, {
        fontSize: asset.fontSize,
        weight: asset.fontWeight,
      });
      const latest = get().ir;
      if (!latest) return;
      set({
        ir: {
          ...latest,
          assets: latest.assets.map((a) =>
            a.id === id && a.form === "text"
              ? {
                  ...a,
                  text,
                  lines: measured.lines,
                  lineHeight: measured.lineHeight,
                  bounds: { width: measured.width, height: measured.height },
                }
              : a,
          ),
        },
        dirty: true,
        status: { kind: "info", message: `已更新文字「${text.slice(0, 12)}」` },
      });
    } catch (err) {
      set({
        status: {
          kind: "error",
          message: `文字测量失败：${(err as Error).message}`,
        },
      });
    }
  },

  removeKeyframeAt(id, localFrame) {
    get().updateObject(id, (o) => ({
      ...o,
      keyframes: removeKeyframe(o.keyframes, localFrame),
    }));
  },

  /** 轨道编辑：调整对象的出场帧 / 持续时间（带边界夹取）。 */
  updateObjectTiming(id, patch) {
    const { ir } = get();
    if (!ir) return;
    set({
      ir: {
        ...ir,
        objects: ir.objects.map((o) => {
          if (o.id !== id) return o;
          const total = ir.totalFrames;
          const from = Math.max(
            0,
            Math.min(patch.from ?? o.from, total - 2),
          );
          const durationInFrames = Math.max(
            2,
            Math.min(
              patch.durationInFrames ?? o.durationInFrames,
              total - from,
            ),
          );
          return { ...o, from, durationInFrames };
        }),
      },
      dirty: true,
    });
  },

  /** 子轨道：移动单个属性的关键帧。 */
  moveKeyframe(id, fromLocalFrame, toLocalFrame, property) {
    get().updateObject(id, (o) => ({
      ...o,
      keyframes: movePropertyKeyframe(
        o.keyframes,
        fromLocalFrame,
        toLocalFrame,
        property,
      ),
    }));
  },

  /** 子轨道：删除单个属性的关键帧。 */
  removeKeyframeProperty(id, localFrame, property) {
    get().updateObject(id, (o) => ({
      ...o,
      keyframes: removePropertyKeyframe(o.keyframes, localFrame, property),
    }));
    set({ selectedKeyframe: null });
  },

  /** 子轨道双击：在指定帧为指定属性打关键帧（取该帧插值结果）。 */
  addKeyframeAt(id, localFrame, property) {
    const { ir } = get();
    if (!ir) return;
    const object = ir.objects.find((o) => o.id === id);
    if (!object) return;
    const frame = Math.max(
      0,
      Math.min(localFrame, object.durationInFrames - 1),
    );
    const t = interpolateTransform(object.initial, object.keyframes, frame);
    const patch: PartialTransform = {};
    patch[property] = t[property];
    get().updateObject(id, (o) => ({
      ...o,
      keyframes: upsertKeyframe(o.keyframes, frame, patch),
    }));
    set({ selectedKeyframe: { objectId: id, frame, property } });
  },

  setKeyframeValueAt(id, localFrame, property, value) {
    get().updateObject(id, (o) => ({
      ...o,
      keyframes: setKeyframeValuePure(
        o.keyframes,
        localFrame,
        property,
        value,
      ),
    }));
  },

  setKeyframeEasingAt(id, localFrame, easing) {
    get().updateObject(id, (o) => ({
      ...o,
      keyframes: setKeyframeEasingPure(o.keyframes, localFrame, easing),
    }));
  },

  setTimelineZoom(zoom) {
    set({ timelineZoom: Math.max(1, Math.min(16, zoom)) });
  },

  /** 工具条：在播放头为选中对象打一个"完整姿态"关键帧。 */
  addPoseKeyframeAtPlayhead() {
    const { ir, selectedId, currentFrame } = get();
    if (!ir || !selectedId) return;
    const object = ir.objects.find((o) => o.id === selectedId);
    if (!object) return;
    if (
      currentFrame < object.from ||
      currentFrame >= object.from + object.durationInFrames
    ) {
      set({
        status: {
          kind: "error",
          message: "播放头不在该元素的存活区间内，无法打关键帧",
        },
      });
      return;
    }
    const localFrame = currentFrame - object.from;
    const t = interpolateTransform(
      object.initial,
      object.keyframes,
      localFrame,
    );
    const patch: PartialTransform = {
      x: t.x,
      y: t.y,
      scale: t.scale,
      rotation: t.rotation,
      opacity: t.opacity,
    };
    get().updateObject(selectedId, (o) => ({
      ...o,
      keyframes: upsertKeyframe(o.keyframes, localFrame, patch),
    }));
  },

  /** 效果库：从播放头开始为选中元素生成关键帧并合并进对象。 */
  applyEffect(effect) {
    const { ir, selectedId, currentFrame } = get();
    if (!ir || !selectedId) return;
    const object = ir.objects.find((o) => o.id === selectedId);
    if (!object) return;

    const localFrame = Math.max(
      0,
      Math.min(currentFrame - object.from, object.durationInFrames - 1),
    );
    const t = interpolateTransform(
      object.initial,
      object.keyframes,
      localFrame,
    );
    const base: BaseTransform = {
      x: t.x,
      y: t.y,
      scale: t.scale,
      rotation: t.rotation,
      opacity: t.opacity,
    };
    const toFrames = (ms: number) =>
      Math.max(1, Math.round((ms * ir.fps) / 1000));
    const duration = toFrames(EFFECT_DURATION_MS[effect]);

    let generated: Keyframe[];
    switch (effect) {
      case "emphasize": {
        const peak = Math.max(1, Math.round(duration * 0.4));
        generated = [
          { frame: 0, transform: { scale: base.scale }, easing: "ease-out" },
          {
            frame: peak,
            transform: { scale: base.scale * 1.3 },
            easing: "ease-in-out",
          },
          {
            frame: duration,
            transform: { scale: base.scale },
            easing: "linear",
          },
        ];
        break;
      }
      case "float":
        generated = ambientKeyframes("float", base, duration);
        break;
      case "bounce":
        generated = ambientKeyframes("bounce", base, duration);
        break;
      case "shake":
        generated = ambientKeyframes("shake", base, duration);
        break;
      case "wiggle":
        generated = ambientKeyframes("wiggle", base, duration);
        break;
      case "enter_fade":
        generated = enterKeyframes("fade", base, duration, 80);
        break;
      case "enter_pop":
        generated = enterKeyframes("pop", base, duration, 80);
        break;
      case "enter_slide_up":
        generated = enterKeyframes("slide_up", base, duration, 80);
        break;
      case "exit_fade":
        generated = exitKeyframes("fade", base, duration);
        break;
      case "exit_shrink":
        generated = exitKeyframes("shrink", base, duration);
        break;
    }

    let keyframes = object.keyframes;
    for (const k of generated) {
      const frame = Math.min(
        localFrame + k.frame,
        object.durationInFrames - 1,
      );
      keyframes = upsertKeyframe(keyframes, frame, k.transform, k.easing);
    }
    get().updateObject(selectedId, (o) => ({ ...o, keyframes }));
  },

  /** 资产框：在当前播放头添加文字 / 图形元素（含淡入关键帧）。 */
  addElement(spec) {
    const { ir, currentFrame } = get();
    if (!ir) return;
    elementCounter += 1;
    const id = `el-${Date.now().toString(36)}-${elementCounter}`;
    const layer =
      ir.objects.reduce((max, o) => Math.max(max, o.layer), 0) + 1;

    let asset: Asset;
    if (spec.kind === "text") {
      const preset = TEXT_PRESETS[spec.preset];
      const lineHeight = Math.round(preset.fontSize * 1.4);
      asset = {
        form: "text",
        id,
        text: spec.text,
        preset: spec.preset,
        fontSize: preset.fontSize,
        fontWeight: preset.weight,
        color: presetColor(spec.preset),
        align: "center",
        lines: [spec.text],
        lineHeight,
        bounds: {
          width: Math.max(120, spec.text.length * preset.fontSize),
          height: lineHeight,
        },
        anchors: boxAnchors(),
      };
    } else if (spec.kind === "emoji") {
      asset = {
        form: "emoji",
        id,
        emoji: spec.emoji,
        file: EMOJI_FILES[spec.emoji].file,
        bounds: {
          width: EMOJI_DEFAULT_SIZE,
          height: EMOJI_DEFAULT_SIZE,
        },
        anchors: boxAnchors(),
      };
    } else {
      asset = {
        form: "shape",
        id,
        shape: spec.shape,
        color: spec.color,
        bounds: { width: spec.width, height: spec.height },
        anchors: boxAnchors(),
      };
    }

    const from = Math.max(0, Math.min(currentFrame, ir.totalFrames - 2));
    const object: SceneObject = {
      id,
      asset: id,
      from,
      durationInFrames: Math.max(1, ir.totalFrames - from),
      layer,
      initial: { x: 960, y: 540, scale: 1, rotation: 0, opacity: 1 },
      keyframes: [
        { frame: 0, transform: { opacity: 0 }, easing: "linear" },
        { frame: 8, transform: { opacity: 1 }, easing: "linear" },
      ],
    };

    set({
      ir: {
        ...ir,
        assets: [...ir.assets, asset],
        objects: [...ir.objects, object],
      },
      selectedId: id,
      dirty: true,
    });
  },

  removeSelected() {
    const { ir, selectedId, selectedKeyframe } = get();
    if (!ir) return;

    // 选中了关键帧：只删该属性
    if (selectedKeyframe) {
      get().removeKeyframeProperty(
        selectedKeyframe.objectId,
        selectedKeyframe.frame,
        selectedKeyframe.property,
      );
      return;
    }

    if (!selectedId) return;
    set({
      ir: {
        ...ir,
        objects: ir.objects.filter((o) => o.id !== selectedId),
        assets: ir.assets.filter((a) => a.id !== selectedId),
      },
      selectedId: null,
      dirty: true,
    });
  },

  setAiPanel(panel) {
    set((s) => ({ aiPanel: s.aiPanel === panel ? null : panel }));
  },

  /** AI 对话：主题 → LLM 导演稿 → 语音 → 编译（SSE 流式日志）。 */
  async generate(topic) {
    const { workspace, generation } = get();
    if (generation.running) return;

    // 安全策略：示例/手工工作区不被覆盖；AI 生成的结果放进 ai- 前缀工作区，
    // 对同一 AI 工作区再次生成 = 重新生成。
    const target = workspace.startsWith("ai-")
      ? workspace
      : `ai-${Date.now().toString(36)}`;

    const append = (line: string) =>
      set((s) => ({
        generation: { ...s.generation, logs: [...s.generation.logs, line] },
      }));

    set({
      generation: {
        running: true,
        logs: [`> ${topic}`, `▶ 生成到工作区 ${target}`],
        error: null,
      },
    });

    try {
      const { enabledAssetIds } = get();
      const assetParam =
        enabledAssetIds === null
          ? ""
          : enabledAssetIds.length === 0
            ? "&assets=none"
            : `&assets=${encodeURIComponent(enabledAssetIds.join(","))}`;
      const res = await fetch(
        `/api/generate?topic=${encodeURIComponent(topic)}&workspace=${target}&provider=dashscope${assetParam}`,
      );
      if (!res.ok || !res.body) {
        throw new Error((await res.text()) || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          if (!raw.startsWith("data: ")) continue;
          const payload = JSON.parse(raw.slice(6)) as {
            line?: string;
            done?: boolean;
            error?: string;
          };
          if (payload.line) append(payload.line);
          if (payload.done) done = true;
          if (payload.error) throw new Error(payload.error);
        }
      }

      append("✓ 完成：已应用到画布与音轨");
      await get().loadWorkspace(target);
      set((s) => ({ generation: { ...s.generation, running: false } }));
    } catch (err) {
      set((s) => ({
        generation: {
          ...s.generation,
          running: false,
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  },

  /** AI 素材：元素描述 → LLM 写 SVG + 元数据（服务端消毒，返回预览）。 */
  async generateAsset(description) {
    const prompt = description.trim();
    if (!prompt || get().assetGen.running) return;
    set({
      assetGen: {
        running: true,
        svg: null,
        viewBox: null,
        name: "",
        description: "",
        collection: "",
        tags: [],
        prompt,
        error: null,
      },
    });
    try {
      const res = await fetch(
        `/api/generate-asset?description=${encodeURIComponent(prompt)}`,
      );
      if (!res.ok) {
        throw new Error((await res.text()) || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        svg?: string;
        viewBox?: { width: number; height: number };
        name?: string;
        description?: string;
        collection?: string;
        tags?: string[];
      };
      if (!data.svg || !data.viewBox) {
        throw new Error("服务端未返回有效的 SVG");
      }
      set({
        assetGen: {
          running: false,
          svg: data.svg,
          viewBox: data.viewBox,
          name: data.name?.trim() || prompt.slice(0, 12),
          description: data.description?.trim() || prompt,
          collection: data.collection?.trim() || "未分组",
          tags: Array.isArray(data.tags) ? data.tags : [],
          prompt,
          error: null,
        },
      });
    } catch (err) {
      set({
        assetGen: {
          running: false,
          svg: null,
          viewBox: null,
          name: "",
          description: "",
          collection: "",
          tags: [],
          prompt,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },

  /** 保存生成素材到素材库（可选同时挂到画布）。 */
  async saveGeneratedAsset(options) {
    const { assetGen } = get();
    if (!assetGen.svg || !assetGen.viewBox) return;
    set({ status: { kind: "info", message: "保存素材到库中..." } });
    try {
      // 浏览器端渲染轻量缩略图（失败不阻塞入库，打开素材库时会自动回填）
      let thumbnailPng: string | undefined;
      try {
        const dataUrl = await renderSvgThumbnail(
          assetGen.svg,
          assetGen.viewBox,
          128,
        );
        thumbnailPng = dataUrlToBase64(dataUrl);
      } catch {
        thumbnailPng = undefined;
      }

      const res = await fetch("/api/save-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          svg: assetGen.svg,
          name: options.name,
          description: options.description,
          collection: options.collection,
          tags: options.tags,
          width: options.size,
          generatorPrompt: assetGen.prompt,
          ...(thumbnailPng ? { thumbnailPng } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error((await res.text()) || `HTTP ${res.status}`);
      }
      const { entry } = (await res.json()) as { entry: LibraryAsset };

      set({
        assetGen: {
          running: false,
          svg: null,
          viewBox: null,
          name: "",
          description: "",
          collection: "",
          tags: [],
          prompt: "",
          error: null,
        },
      });
      await get().loadLibrary();
      if (options.applyToCanvas) {
        get().addLibraryAssetToCanvas(entry);
      } else {
        set({
          status: {
            kind: "info",
            message: `已入库「${entry.name}」（${entry.file}）`,
          },
        });
      }
    } catch (err) {
      set({
        status: {
          kind: "error",
          message: `素材保存失败：${(err as Error).message}`,
        },
      });
    }
  },

  discardAsset() {
    set({
      assetGen: {
        running: false,
        svg: null,
        viewBox: null,
        name: "",
        description: "",
        collection: "",
        tags: [],
        prompt: "",
        error: null,
      },
    });
  },

  /** 读素材库 + 当前工作区的生成可用集。 */
  async loadLibrary() {
    try {
      const res = await fetch("/api/library", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { assets?: LibraryAsset[] };
      const library = data.assets ?? [];

      let enabled: string[] | null = null;
      try {
        const selRes = await fetch(
          `/api/selection?workspace=${encodeURIComponent(get().workspace)}`,
          { cache: "no-store" },
        );
        if (selRes.ok) {
          const sel = (await selRes.json()) as { ids?: string[] | null };
          enabled = Array.isArray(sel.ids) ? sel.ids : null;
        }
      } catch {
        enabled = null;
      }
      // 过滤已删除的 id；过滤后与全量一致时回退为 null（全选，未来新增资产自动可用）
      if (enabled) {
        enabled = enabled.filter((id) => library.some((a) => a.id === id));
        if (enabled.length === library.length) enabled = null;
      }
      set({ library, enabledAssetIds: enabled });
    } catch (err) {
      set({
        library: [],
        enabledAssetIds: null,
        status: {
          kind: "error",
          message: `素材库加载失败：${(err as Error).message}`,
        },
      });
    }
  },

  toggleAssetEnabled(id) {
    const { library, enabledAssetIds } = get();
    const allIds = library.map((a) => a.id);
    const current = enabledAssetIds ?? allIds;
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    const normalized = next.length === allIds.length ? null : next;
    set({ enabledAssetIds: normalized });
    void fetch(
      `/api/selection?workspace=${encodeURIComponent(get().workspace)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: normalized }),
      },
    ).catch(() => {});
  },

  async updateLibraryAsset(id, patch) {
    try {
      const res = await fetch("/api/update-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) {
        throw new Error((await res.text()) || `HTTP ${res.status}`);
      }
      await get().loadLibrary();
      set({ status: { kind: "info", message: `已更新素材「${id}」` } });
    } catch (err) {
      set({
        status: {
          kind: "error",
          message: `素材更新失败：${(err as Error).message}`,
        },
      });
    }
  },

  async deleteLibraryAsset(id) {
    try {
      const res = await fetch("/api/delete-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        throw new Error((await res.text()) || `HTTP ${res.status}`);
      }
      const { enabledAssetIds } = get();
      if (enabledAssetIds && enabledAssetIds.includes(id)) {
        const next = enabledAssetIds.filter((x) => x !== id);
        set({ enabledAssetIds: next });
        void fetch(
          `/api/selection?workspace=${encodeURIComponent(get().workspace)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: next }),
          },
        ).catch(() => {});
      }
      await get().loadLibrary();
      set({ status: { kind: "info", message: `已删除素材「${id}」` } });
    } catch (err) {
      set({
        status: {
          kind: "error",
          message: `素材删除失败：${(err as Error).message}`,
        },
      });
    }
  },

  /** 把素材库条目按默认宽度加到画布（允许同一素材多个实例）。 */
  addLibraryAssetToCanvas(entry) {
    const { ir, currentFrame } = get();
    if (!ir) return;
    let objectId = entry.id;
    let n = 2;
    while (ir.objects.some((o) => o.id === objectId)) {
      objectId = `${entry.id}-${n}`;
      n += 1;
    }
    const ratio = entry.viewBox.height / entry.viewBox.width;
    const width = entry.defaultWidth;
    const height = Math.max(40, Math.round(width * ratio));
    const asset: Asset = {
      form: "svg",
      id: entry.id,
      file: entry.file,
      bounds: { width, height },
      anchors: boxAnchors(),
    };
    set({
      ir: attachAssetToIr(ir, asset, currentFrame, objectId),
      selectedId: objectId,
      dirty: true,
      status: {
        kind: "info",
        message: `已把素材「${entry.name}」放到画布（${width}×${height}）`,
      },
    });
  },

  /** 为缺缩略图的素材补齐小图（CLI 生成的资产在打开素材库时自动回填）。 */
  async backfillThumbnails() {
    const missing = get().library.filter((a) => !a.thumbnail);
    if (missing.length === 0) return;
    let changed = false;
    for (const entry of missing) {
      if (thumbnailBackfillAttempted.has(entry.id)) continue;
      thumbnailBackfillAttempted.add(entry.id);
      try {
        const res = await fetch(`/${entry.file}`, { cache: "no-store" });
        if (!res.ok) continue;
        const svg = await res.text();
        const dataUrl = await renderSvgThumbnail(svg, entry.viewBox, 128);
        const post = await fetch("/api/thumbnail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: entry.id,
            thumbnailPng: dataUrlToBase64(dataUrl),
          }),
        });
        if (post.ok) changed = true;
      } catch {
        // 单个失败跳过（本次会话不再重试，避免循环请求）
      }
    }
    if (changed) {
      thumbnailBackfillAttempted.clear();
      await get().loadLibrary();
    }
  },

  /** 按集合整组勾选/取消生成可用。 */
  toggleCollectionEnabled(collection) {
    const { library, enabledAssetIds } = get();
    const allIds = library.map((a) => a.id);
    const ids = library
      .filter((a) => (a.collection ?? "未分组") === collection)
      .map((a) => a.id);
    if (ids.length === 0) return;
    const current = enabledAssetIds ?? allIds;
    const allOn = ids.every((id) => current.includes(id));
    const next = allOn
      ? current.filter((id) => !ids.includes(id))
      : [...new Set([...current, ...ids])];
    const normalized = next.length === allIds.length ? null : next;
    set({ enabledAssetIds: normalized });
    void fetch(
      `/api/selection?workspace=${encodeURIComponent(get().workspace)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: normalized }),
      },
    ).catch(() => {});
  },

  /** 进入素材拾取模式（素材库面板展开，保持在当前页面）。 */
  startLibraryPick(objectId) {
    set({ libraryPick: { objectId }, aiPanel: "library" });
  },

  cancelLibraryPick() {
    set({ libraryPick: null });
  },

  /** 用素材库条目替换对象资产：保留时间与关键帧，仅换引用。 */
  replaceObjectAsset(objectId, entry) {
    const { ir } = get();
    if (!ir) return;
    const object = ir.objects.find((o) => o.id === objectId);
    if (!object) return;
    const oldAssetId = object.asset;

    const ratio = entry.viewBox.height / entry.viewBox.width;
    const width = entry.defaultWidth;
    const height = Math.max(40, Math.round(width * ratio));
    const nextAsset: Asset = {
      form: "svg",
      id: entry.id,
      file: entry.file,
      bounds: { width, height },
      anchors: boxAnchors(),
    };

    const hasAsset = ir.assets.some((a) => a.id === entry.id);
    let assets = hasAsset
      ? ir.assets
      : [...ir.assets, nextAsset];

    // 旧资产不再被任何对象引用时清理（仅清理库型资产，避免误删）
    const oldReferenced = ir.objects.some(
      (o) => o.id !== objectId && o.asset === oldAssetId,
    );
    if (!oldReferenced) {
      assets = assets.filter(
        (a) =>
          a.id !== oldAssetId ||
          (a.form !== "svg" && a.form !== "image"),
      );
    }

    set({
      ir: {
        ...ir,
        assets,
        objects: ir.objects.map((o) =>
          o.id === objectId ? { ...o, asset: entry.id } : o,
        ),
      },
      selectedId: objectId,
      dirty: true,
      libraryPick: null,
      status: {
        kind: "info",
        message: `已将 ${objectId} 更换为素材「${entry.name}」`,
      },
    });
  },

  async save() {
    const { ir, workspace } = get();
    if (!ir) return;
    set({ status: { kind: "info", message: "保存中..." } });
    try {
      const res = await fetch(`/api/save?workspace=${workspace}`, {
        method: "POST",
        body: JSON.stringify(ir),
      });
      if (!res.ok) throw new Error(await res.text());
      set({
        dirty: false,
        status: {
          kind: "info",
          message: `已保存 workspaces/${workspace}/ir.json —— 运行 npm run render -- --workspace ${workspace} 即可出片`,
        },
      });
    } catch (err) {
      set({
        status: {
          kind: "error",
          message: `保存失败：${(err as Error).message}`,
        },
      });
    }
  },

  setStatus(status) {
    set({ status });
  },
}));

// 开发调试钩子：供控制台 / 自动化脚本操作编辑器状态
if (typeof window !== "undefined") {
  (window as unknown as { __vsEditor?: typeof useEditor }).__vsEditor =
    useEditor;
}
