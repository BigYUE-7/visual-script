import { EMOJI_DEFAULT_SIZE, EMOJI_FILES } from "../asset/emoji";
import { measureText } from "../asset/measure-text";
import type {
  AnimationIR,
  Asset,
  Keyframe,
  SceneObject,
  Transform,
} from "../schema/animation-ir";
import type {
  Bounds,
  NormalizedPoint,
  TextStylePreset,
} from "../schema/common";
import type {
  DirectorElement,
  DirectorScript,
  AssetElement,
  EmojiElement,
  ShapeElement,
  TextElement,
} from "../schema/director";
import type { LibraryAsset } from "../schema/library";
import type { TimedBlock, TimedScript } from "../schema/timed-script";
import type { VoiceMap } from "../schema/voice-map";
import { presetColor, resolveColor, TEXT_PRESETS } from "../theme/tokens";
import {
  ambientKeyframes,
  enterKeyframes,
  exitKeyframes,
  type BaseTransform,
} from "./animation-presets";
import { findAnchor, parseAnchors, resolveAnchorTime } from "./anchors";
import {
  anchorToWorld,
  boxAnchors,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  circleAnchors,
  clampAboveSubtitleZone,
  lineAnchors,
  slotToWorld,
} from "./layout";
import type { LintIssue } from "./lint";
import { buildSubtitles } from "./subtitle";
import { msToFrames } from "./time";

export { msToFrames };

/** 出入场淡入淡出时长 */
export const FADE_MS = 250;
/** 强调动效的峰值位置（时长比例） */
const EMPHASIS_PEAK_RATIO = 0.4;

/** 片头卡时长（帧）：题图先于口播出现 */
export const INTRO_FRAMES = 75;
/** 片尾卡时长（帧）：全部内容结束后出现 */
export const OUTRO_FRAMES = 90;
/** 卡片的淡入/淡出时长（帧） */
const CARD_FADE_FRAMES = 12;

type ElementGeometry = {
  element: DirectorElement;
  asset: Asset;
  bounds: Bounds;
  /** 画布世界坐标（元素中心） */
  center: { x: number; y: number };
  worldAnchors: Record<string, { x: number; y: number }>;
  /** 文字绑定口播锚点时的引用 */
  narrationBinding?: { narrationId: string; anchor: string };
};

export type TimedToIrResult = {
  ir: AnimationIR;
  issues: LintIssue[];
};

export type TimedToIrOptions = {
  /** 音频路径前缀（渲染端 staticFile 相对 public/ 的路径） */
  audioPrefix?: string;
  /** 是否生成片头卡与片尾卡（默认 true；测试可关闭） */
  bookends?: boolean;
  /** 素材库解析器：asset 元素按 id 解析为库条目（缺省时 asset 元素报错跳过） */
  assetResolver?: (id: string) => LibraryAsset | undefined;
};

/**
 * 时间脚本 → Animation IR（帧语义）。
 * - 元素通过 slot 决定默认位置；
 * - appear/disappear 决定对象生命周期（文字绑定口播锚点时有隐式出入场）；
 * - emphasize/move 编译为关键帧；
 * - 资产（文字实测分行结果、图形尺寸与锚点）内联进 IR。
 */
export function timedToIr(
  director: DirectorScript,
  voiceMap: VoiceMap,
  timedScript: TimedScript,
  options: TimedToIrOptions = {},
): TimedToIrResult {
  const issues: LintIssue[] = [];
  const fps = timedScript.fps;
  const totalMs = timedScript.totalMs;
  const audioPrefix = options.audioPrefix ?? "";

  const blockByNarration = new Map<string, TimedBlock>(
    timedScript.blocks.map((b) => [b.narrationId, b]),
  );
  const segmentByNarration = new Map(
    voiceMap.segments.map((s) => [s.narrationId, s]),
  );
  const cueTimeById = new Map<string, number>();
  for (const block of timedScript.blocks) {
    for (const cue of block.cues) {
      cueTimeById.set(cue.id, cue.atMs);
    }
  }

  const geometry = new Map<string, ElementGeometry>();

  for (const element of director.elements) {
    if (element.kind === "text") {
      geometry.set(element.id, buildTextGeometry(element, director, issues));
    } else if (element.kind === "emoji") {
      geometry.set(element.id, buildEmojiGeometry(element));
    } else if (element.kind === "asset") {
      const geo = buildAssetGeometry(element, options.assetResolver, issues);
      if (geo) geometry.set(element.id, geo);
    } else {
      geometry.set(element.id, buildShapeGeometry(element));
    }
  }

  const objects: SceneObject[] = [];

  for (const element of director.elements) {
    const geo = geometry.get(element.id);
    if (!geo) continue;
    const object = buildObject({
      element,
      geo,
      geometry,
      director,
      blockByNarration,
      segmentByNarration,
      cueTimeById,
      totalMs,
      fps,
      issues,
    });
    if (object) objects.push(object);
  }

  objects.sort((a, b) => a.layer - b.layer || (a.id < b.id ? -1 : 1));

  const audio = timedScript.blocks.map((block) => {
    const fromFrame = msToFrames(block.startMs, fps);
    const endFrame = msToFrames(block.endMs, fps);
    return {
      file: `${audioPrefix}${block.audio.file}`,
      fromFrame,
      durationInFrames: Math.max(1, endFrame - fromFrame),
    };
  });
  const subtitles = buildSubtitles(director, timedScript);

  const bookends = options.bookends ?? true;
  const cardAssets: Asset[] = [];
  if (bookends) {
    cardAssets.push(
      ...applyBookends(director, objects, audio, subtitles, fps, totalMs),
    );
  }

  let maxFrame = msToFrames(totalMs, fps) + (bookends ? INTRO_FRAMES : 0);
  for (const object of objects) {
    maxFrame = Math.max(maxFrame, object.from + object.durationInFrames);
  }
  for (const a of audio) {
    maxFrame = Math.max(maxFrame, a.fromFrame + a.durationInFrames);
  }
  for (const s of subtitles) {
    maxFrame = Math.max(maxFrame, s.fromFrame + s.durationInFrames);
  }

  const ir: AnimationIR = {
    version: 1,
    fps,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    totalFrames: Math.max(1, maxFrame),
    assets: [...geometry.values()].map((g) => g.asset).concat(cardAssets),
    objects,
    camera: [],
    audio,
    subtitles,
  };

  return { ir, issues };
}

/**
 * 片头尾卡（编译期确定性规则，见《视频生成流水线设计》§6.4）：
 * - 片头卡：以 meta.title 作题图，先于全部内容出现；
 * - 片尾卡：内容结束后出现，标题 + 署名；
 * - 全部内容（对象 / 音频 / 字幕）在 IR 层整体平移片头帧数，TimedScript 不受影响。
 * 返回新增卡片的资产（由调用方并入 IR assets）。
 */
function applyBookends(
  director: DirectorScript,
  objects: SceneObject[],
  audio: AnimationIR["audio"],
  subtitles: AnimationIR["subtitles"],
  fps: number,
  totalMs: number,
): Asset[] {
  for (const object of objects) object.from += INTRO_FRAMES;
  for (const a of audio) a.fromFrame += INTRO_FRAMES;
  for (const s of subtitles) s.fromFrame += INTRO_FRAMES;

  const intro = buildCard({
    id: "card-intro-title",
    text: director.meta.title,
    preset: "title",
    center: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
    fromFrame: 0,
    durationInFrames: INTRO_FRAMES,
  });
  objects.push(intro.object);

  let contentEnd = msToFrames(totalMs, fps) + INTRO_FRAMES;
  for (const object of objects) {
    contentEnd = Math.max(contentEnd, object.from + object.durationInFrames);
  }
  for (const a of audio) {
    contentEnd = Math.max(contentEnd, a.fromFrame + a.durationInFrames);
  }
  for (const s of subtitles) {
    contentEnd = Math.max(contentEnd, s.fromFrame + s.durationInFrames);
  }

  const outroTitle = buildCard({
    id: "card-outro-title",
    text: director.meta.title,
    preset: "heading",
    center: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 - 60 },
    fromFrame: contentEnd,
    durationInFrames: OUTRO_FRAMES,
  });
  const outroNote = buildCard({
    id: "card-outro-note",
    text: "由 Visual Script 生成",
    preset: "caption",
    center: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 + 70 },
    fromFrame: contentEnd,
    durationInFrames: OUTRO_FRAMES,
  });
  objects.push(outroTitle.object, outroNote.object);
  objects.sort((a, b) => a.layer - b.layer || (a.id < b.id ? -1 : 1));

  return [intro.asset, outroTitle.asset, outroNote.asset];
}

type CardOptions = {
  id: string;
  text: string;
  preset: TextStylePreset;
  center: { x: number; y: number };
  fromFrame: number;
  durationInFrames: number;
};

/** 构建一张定时机卡片：测量文字 → 资产 → 带淡入淡出的场景对象。 */
function buildCard(options: CardOptions): { asset: Asset; object: SceneObject } {
  const preset = TEXT_PRESETS[options.preset];
  const measured = measureText(options.text, {
    fontSize: preset.fontSize,
    weight: preset.weight,
  });
  const bounds: Bounds = { width: measured.width, height: measured.height };
  const anchors = boxAnchors();

  const asset: Asset = {
    form: "text",
    id: options.id,
    text: options.text,
    preset: options.preset,
    fontSize: preset.fontSize,
    fontWeight: preset.weight,
    color: presetColor(options.preset),
    align: "center",
    lines: measured.lines,
    lineHeight: measured.lineHeight,
    bounds,
    anchors,
  };

  const fade = Math.min(CARD_FADE_FRAMES, options.durationInFrames - 2);
  const initial: Transform = {
    x: options.center.x,
    y: options.center.y,
    scale: 1,
    rotation: 0,
    opacity: 1,
  };
  const keyframes: Keyframe[] = [
    {
      frame: 0,
      transform: { opacity: 0, y: options.center.y + 16 },
      easing: "ease-out",
    },
    {
      frame: fade,
      transform: { opacity: 1, y: options.center.y },
      easing: "linear",
    },
    {
      frame: options.durationInFrames - fade - 1,
      transform: { opacity: 1 },
      easing: "ease-in",
    },
    {
      frame: options.durationInFrames - 1,
      transform: { opacity: 0 },
      easing: "linear",
    },
  ];

  const object: SceneObject = {
    id: options.id,
    asset: options.id,
    from: options.fromFrame,
    durationInFrames: options.durationInFrames,
    layer: 10,
    initial,
    keyframes,
  };

  return { asset, object };
}

function buildTextGeometry(
  element: TextElement,
  director: DirectorScript,
  issues: LintIssue[],
): ElementGeometry {
  let text = "";
  let narrationBinding: ElementGeometry["narrationBinding"];

  if (element.content.type === "literal") {
    text = element.content.text;
  } else {
    const { narrationId, anchor: anchorRef } = element.content;
    narrationBinding = { narrationId, anchor: anchorRef };
    const narration = director.narrations.find((n) => n.id === narrationId);
    const found = narration
      ? findAnchor(parseAnchors(narration.text), anchorRef)
      : undefined;
    if (found) {
      text = found.text;
    } else {
      text = anchorRef;
      issues.push({
        severity: "error",
        code: "dangling-anchor",
        message: `元素 ${element.id} 无法解析锚点文字：${narrationId}「${anchorRef}」`,
        path: `elements.${element.id}`,
      });
    }
  }

  const preset = TEXT_PRESETS[element.preset];
  const measured = measureText(text, {
    fontSize: preset.fontSize,
    weight: preset.weight,
    maxWidth: element.maxWidth,
  });
  const bounds: Bounds = { width: measured.width, height: measured.height };
  const anchors = boxAnchors();
  const center = clampAboveSubtitleZone(slotToWorld(element.slot), bounds);

  const asset: Asset = {
    form: "text",
    id: element.id,
    text,
    preset: element.preset,
    fontSize: preset.fontSize,
    fontWeight: preset.weight,
    color: presetColor(element.preset),
    align: element.align,
    lines: measured.lines,
    lineHeight: measured.lineHeight,
    bounds,
    anchors,
  };

  return {
    element,
    asset,
    bounds,
    center,
    worldAnchors: toWorldAnchors(center, bounds, anchors),
    narrationBinding,
  };
}

function buildEmojiGeometry(element: EmojiElement): ElementGeometry {
  const size = EMOJI_DEFAULT_SIZE;
  const bounds: Bounds = { width: size, height: size };
  const anchors = boxAnchors();
  const center = clampAboveSubtitleZone(slotToWorld(element.slot), bounds);

  const asset: Asset = {
    form: "emoji",
    id: element.id,
    emoji: element.emoji,
    file: EMOJI_FILES[element.emoji].file,
    bounds,
    anchors,
  };

  return {
    element,
    asset,
    bounds,
    center,
    worldAnchors: toWorldAnchors(center, bounds, anchors),
  };
}

function buildAssetGeometry(
  element: AssetElement,
  resolver: ((id: string) => LibraryAsset | undefined) | undefined,
  issues: LintIssue[],
): ElementGeometry | null {
  const entry = resolver?.(element.asset);
  if (!entry) {
    issues.push({
      severity: "error",
      code: "dangling-library-asset",
      message: `元素 ${element.id} 引用的素材库资产不存在：${element.asset}`,
      path: `elements.${element.id}`,
    });
    return null;
  }
  const width = element.width ?? entry.defaultWidth;
  const height = Math.max(
    1,
    Math.round((width * entry.viewBox.height) / entry.viewBox.width),
  );
  const bounds: Bounds = { width, height };
  const anchors = boxAnchors();
  const center = slotToWorld(element.slot);

  const asset: Asset = {
    form: "svg",
    id: element.id,
    file: entry.file,
    bounds,
    anchors,
  };

  return {
    element,
    asset,
    bounds,
    center,
    worldAnchors: toWorldAnchors(center, bounds, anchors),
  };
}

function buildShapeGeometry(element: ShapeElement): ElementGeometry {
  const bounds: Bounds = { width: element.width, height: element.height };
  const anchors =
    element.shape === "circle"
      ? circleAnchors()
      : element.shape === "line" || element.shape === "arrow"
        ? lineAnchors(element.shape === "arrow")
        : boxAnchors();
  const center = clampAboveSubtitleZone(slotToWorld(element.slot), bounds);

  const asset: Asset = {
    form: "shape",
    id: element.id,
    shape: element.shape,
    color: resolveColor(element.color),
    bounds,
    anchors,
  };

  return {
    element,
    asset,
    bounds,
    center,
    worldAnchors: toWorldAnchors(center, bounds, anchors),
  };
}

function toWorldAnchors(
  center: { x: number; y: number },
  bounds: Bounds,
  anchors: Record<string, NormalizedPoint>,
): Record<string, { x: number; y: number }> {
  const result: Record<string, { x: number; y: number }> = {};
  for (const [name, anchor] of Object.entries(anchors)) {
    result[name] = anchorToWorld(center, bounds, anchor);
  }
  return result;
}

type BuildObjectOptions = {
  element: DirectorElement;
  geo: ElementGeometry;
  geometry: Map<string, ElementGeometry>;
  director: DirectorScript;
  blockByNarration: Map<string, TimedBlock>;
  segmentByNarration: Map<string, VoiceMap["segments"][number]>;
  cueTimeById: Map<string, number>;
  totalMs: number;
  fps: number;
  issues: LintIssue[];
};

function buildObject(options: BuildObjectOptions): SceneObject | null {
  const {
    element,
    geo,
    geometry,
    director,
    blockByNarration,
    segmentByNarration,
    cueTimeById,
    totalMs,
    fps,
    issues,
  } = options;

  const elementCues = director.cues.filter(
    (c) => c.action.element === element.id,
  );

  // ---- 出场时刻 ----
  let fromMs: number | undefined;
  const appearCue = elementCues.find((c) => c.action.type === "appear");
  if (appearCue) {
    if (appearCue.action.type === "appear" && appearCue.action.at === "start") {
      const block = blockByNarration.get(appearCue.on.narrationId);
      fromMs = block ? block.startMs : cueTimeById.get(appearCue.id);
    } else {
      fromMs = cueTimeById.get(appearCue.id);
    }
  } else if (geo.narrationBinding) {
    fromMs = resolveImplicitAnchorTime(
      geo.narrationBinding,
      director,
      blockByNarration,
      segmentByNarration,
    );
  }

  if (fromMs === undefined) {
    issues.push({
      severity: "warning",
      code: "element-never-appears",
      message: `元素 ${element.id} 没有任何 appear cue，已跳过`,
      path: `elements.${element.id}`,
    });
    return null;
  }

  // ---- 退场时刻 ----
  let endMs: number | undefined;
  const disappearCue = elementCues.find((c) => c.action.type === "disappear");
  if (disappearCue) {
    endMs = cueTimeById.get(disappearCue.id);
  } else if (geo.narrationBinding) {
    endMs = blockByNarration.get(geo.narrationBinding.narrationId)?.endMs;
  }
  endMs ??= totalMs;
  endMs = Math.min(endMs, totalMs);

  const fromFrame = msToFrames(fromMs, fps);
  const endFrame = msToFrames(endMs, fps);
  const durationFrames = Math.max(1, endFrame - fromFrame);

  if (endMs <= fromMs) {
    issues.push({
      severity: "warning",
      code: "element-empty-lifespan",
      message: `元素 ${element.id} 的存活区间为空，已跳过`,
      path: `elements.${element.id}`,
    });
    return null;
  }

  // ---- 关键帧 ----
  const keyframes: Keyframe[] = [];
  const maxFade = Math.max(0, durationFrames - 1);
  const fadeFrames = Math.min(msToFrames(FADE_MS, fps), maxFade);
  const base: BaseTransform = {
    x: geo.center.x,
    y: geo.center.y,
    scale: 1,
    rotation: 0,
    opacity: 1,
  };

  if (fadeFrames > 0) {
    const enterPreset =
      appearCue && appearCue.action.type === "appear"
        ? appearCue.action.preset
        : "fade";
    const distancePx =
      appearCue && appearCue.action.type === "appear"
        ? appearCue.action.distancePx
        : 80;
    keyframes.push(
      ...enterKeyframes(enterPreset, base, fadeFrames, distancePx),
    );
  }

  const disappearsEarly = endMs < totalMs - 1000 / fps;
  if (disappearsEarly && fadeFrames > 0) {
    const exitPreset =
      disappearCue && disappearCue.action.type === "disappear"
        ? disappearCue.action.preset
        : "fade";
    const exitOffset = durationFrames - 1 - fadeFrames;
    keyframes.push(
      ...exitKeyframes(exitPreset, base, fadeFrames).map((k) => ({
        ...k,
        frame: k.frame + exitOffset,
      })),
    );
  }

  let lastPosition = { x: geo.center.x, y: geo.center.y };
  let lastRotation = 0;
  const baseScale = 1;

  for (const cue of elementCues) {
    if (cue.action.type === "appear" || cue.action.type === "disappear") {
      continue;
    }
    const atMs = cueTimeById.get(cue.id);
    if (atMs === undefined) continue;
    const offset = msToFrames(atMs, fps) - fromFrame;
    const durationInFrames = Math.max(1, msToFrames(cue.durationMs, fps));
    if (offset < 0) {
      issues.push({
        severity: "warning",
        code: "cue-before-appear",
        message: `cue ${cue.id} 早于元素 ${element.id} 出场，已跳过`,
        path: `cues.${cue.id}`,
      });
      continue;
    }

    if (cue.action.type === "emphasize") {
      const peakOffset = Math.max(
        1,
        Math.round(durationInFrames * EMPHASIS_PEAK_RATIO),
      );
      keyframes.push({
        frame: offset,
        transform: { scale: baseScale },
        easing: cue.action.easing,
      });
      keyframes.push({
        frame: offset + peakOffset,
        transform: { scale: baseScale * cue.action.scale },
        easing: cue.action.easing,
      });
      keyframes.push({
        frame: offset + durationInFrames,
        transform: { scale: baseScale },
        easing: "linear",
      });
    }

    if (cue.action.type === "move") {
      const [targetId, anchorName] = cue.action.to.split(".");
      const targetGeometry = geometry.get(targetId);
      if (!targetGeometry) continue;
      const anchorWorld = targetGeometry.worldAnchors[anchorName];
      if (!anchorWorld) {
        issues.push({
          severity: "warning",
          code: "dangling-anchor-target",
          message: `cue ${cue.id} 的目标锚点不存在：${cue.action.to}`,
          path: `cues.${cue.id}`,
        });
        continue;
      }
      const target = {
        x: anchorWorld.x + cue.action.offsetX,
        y: anchorWorld.y + cue.action.offsetY,
      };
      keyframes.push({
        frame: offset,
        transform: { x: lastPosition.x, y: lastPosition.y },
        easing: cue.action.easing,
      });
      keyframes.push({
        frame: offset + durationInFrames,
        transform: { x: target.x, y: target.y },
        easing: "linear",
      });
      lastPosition = target;
    }

    if (cue.action.type === "animate") {
      const ambientBase: BaseTransform = {
        x: lastPosition.x,
        y: lastPosition.y,
        scale: baseScale,
        rotation: lastRotation,
        opacity: 1,
      };
      keyframes.push(
        ...ambientKeyframes(
          cue.action.preset,
          ambientBase,
          durationInFrames,
        ).map((k) => ({ ...k, frame: k.frame + offset })),
      );
    }
  }

  const initial: Transform = {
    x: geo.center.x,
    y: geo.center.y,
    scale: 1,
    rotation: 0,
    opacity: 1,
  };

  return {
    id: element.id,
    asset: element.id,
    from: fromFrame,
    durationInFrames: durationFrames,
    layer: element.layer,
    initial,
    keyframes: mergeKeyframes(keyframes),
  };
}

function resolveImplicitAnchorTime(
  binding: { narrationId: string; anchor: string },
  director: DirectorScript,
  blockByNarration: Map<string, TimedBlock>,
  segmentByNarration: Map<string, VoiceMap["segments"][number]>,
): number | undefined {
  const block = blockByNarration.get(binding.narrationId);
  const segment = segmentByNarration.get(binding.narrationId);
  const narration = director.narrations.find((n) => n.id === binding.narrationId);
  if (!block || !segment || !narration) return undefined;
  const parsed = parseAnchors(narration.text);
  const anchor = findAnchor(parsed, binding.anchor);
  if (!anchor) return undefined;
  return resolveAnchorTime({
    parsed,
    anchor,
    alignment: segment.alignment,
    blockStartMs: block.startMs,
  }).atMs;
}

function mergeKeyframes(keyframes: Keyframe[]): Keyframe[] {
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  const merged: Keyframe[] = [];
  for (const kf of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.frame === kf.frame) {
      last.transform = { ...last.transform, ...kf.transform };
      if (kf.easing) last.easing = kf.easing;
    } else {
      merged.push({
        frame: kf.frame,
        transform: { ...kf.transform },
        easing: kf.easing,
      });
    }
  }
  return merged;
}
