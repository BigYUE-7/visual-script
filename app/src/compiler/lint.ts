import type { DirectorScript } from "../schema/director";
import type { VoiceMap } from "../schema/voice-map";
import { findAnchorMatches, parseAnchors } from "./anchors";
import { sha256OfText } from "./canonical-hash";

export type LintSeverity = "error" | "warning";

export type LintIssue = {
  severity: LintSeverity;
  code: string;
  message: string;
  path?: string;
};

function checkUniqueIds(items: { id: string }[], namespace: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      issues.push({
        severity: "error",
        code: "duplicate-id",
        message: `${namespace} id 重复：${item.id}`,
        path: `${namespace}.${item.id}`,
      });
    }
    seen.add(item.id);
  }
  return issues;
}

export type LintDirectorOptions = {
  /** 允许引用的素材库 id 集合；缺省时跳过素材库校验（如示例/单测） */
  libraryIds?: ReadonlySet<string>;
};

/** 导演稿自身的一致性检查（不依赖语音）。 */
export function lintDirector(
  director: DirectorScript,
  options: LintDirectorOptions = {},
): LintIssue[] {
  const issues: LintIssue[] = [];
  const elementIds = new Set(director.elements.map((e) => e.id));

  issues.push(...checkUniqueIds(director.narrations, "narrations"));
  issues.push(...checkUniqueIds(director.elements, "elements"));
  issues.push(...checkUniqueIds(director.cues, "cues"));

  for (const narration of director.narrations) {
    const parsed = parseAnchors(narration.text);
    for (const err of parsed.errors) {
      issues.push({
        severity: "error",
        code: "anchor-parse",
        message: `段落 ${narration.id}：${err}`,
        path: `narrations.${narration.id}`,
      });
    }
    const textCount = new Map<string, number>();
    for (const anchor of parsed.anchors) {
      textCount.set(anchor.text, (textCount.get(anchor.text) ?? 0) + 1);
    }
    for (const [text, count] of textCount) {
      if (count > 1) {
        issues.push({
          severity: "warning",
          code: "anchor-ambiguous-text",
          message: `段落 ${narration.id}：锚点文本「${text}」出现 ${count} 次，引用时需用「${text}#N」`,
          path: `narrations.${narration.id}`,
        });
      }
    }
    if (narration.minHoldMs > 60000) {
      issues.push({
        severity: "warning",
        code: "min-hold-too-large",
        message: `段落 ${narration.id}：minHoldMs=${narration.minHoldMs} 异常大`,
        path: `narrations.${narration.id}`,
      });
    }
  }

  for (const element of director.elements) {
    if (element.kind === "asset") {
      if (options.libraryIds && !options.libraryIds.has(element.asset)) {
        issues.push({
          severity: "error",
          code: "dangling-library-asset",
          message: `元素 ${element.id} 引用了素材库中不存在或未开放的资产：${element.asset}`,
          path: `elements.${element.id}`,
        });
      }
      continue;
    }
    if (element.kind === "text" && element.content.type === "narration") {
      const { narrationId, anchor } = element.content;
      const narration = director.narrations.find((n) => n.id === narrationId);
      if (!narration) {
        issues.push({
          severity: "error",
          code: "dangling-narration",
          message: `元素 ${element.id} 绑定不存在的段落：${narrationId}`,
          path: `elements.${element.id}`,
        });
        continue;
      }
      const matches = findAnchorMatches(parseAnchors(narration.text), anchor);
      if (matches.length === 0) {
        issues.push({
          severity: "error",
          code: "dangling-anchor",
          message: `元素 ${element.id} 绑定不存在的锚点：${narrationId}「${anchor}」`,
          path: `elements.${element.id}`,
        });
      } else if (matches.length > 1) {
        issues.push({
          severity: "error",
          code: "ambiguous-anchor",
          message: `元素 ${element.id} 绑定的锚点有歧义，需用「${anchor}#N」`,
          path: `elements.${element.id}`,
        });
      }
    }
  }

  for (const cue of director.cues) {
    const { narrationId, anchor } = cue.on;
    const narration = director.narrations.find((n) => n.id === narrationId);
    if (!narration) {
      issues.push({
        severity: "error",
        code: "dangling-narration",
        message: `cue ${cue.id} 引用不存在的段落：${narrationId}`,
        path: `cues.${cue.id}`,
      });
    } else {
      const matches = findAnchorMatches(parseAnchors(narration.text), anchor);
      if (matches.length === 0) {
        issues.push({
          severity: "error",
          code: "dangling-anchor",
          message: `cue ${cue.id} 引用不存在的锚点：${narrationId}「${anchor}」`,
          path: `cues.${cue.id}`,
        });
      } else if (matches.length > 1) {
        issues.push({
          severity: "error",
          code: "ambiguous-anchor",
          message: `cue ${cue.id} 的锚点有歧义，需用「${anchor}#N」`,
          path: `cues.${cue.id}`,
        });
      }
    }

    if (!elementIds.has(cue.action.element)) {
      issues.push({
        severity: "error",
        code: "dangling-element",
        message: `cue ${cue.id} 引用不存在的元素：${cue.action.element}`,
        path: `cues.${cue.id}`,
      });
    }

    if (cue.action.type === "move") {
      const targetId = cue.action.to.split(".")[0];
      if (!elementIds.has(targetId)) {
        issues.push({
          severity: "error",
          code: "dangling-element",
          message: `cue ${cue.id} 的 move.to 引用不存在的元素：${targetId}`,
          path: `cues.${cue.id}`,
        });
      }
    }
  }

  return issues;
}

/** 语音资产与导演稿的一致性检查（缓存过期、缺段等）。 */
export function lintVoiceMap(director: DirectorScript, voiceMap: VoiceMap): LintIssue[] {
  const issues: LintIssue[] = [];
  const segments = new Map(voiceMap.segments.map((s) => [s.narrationId, s]));

  for (const narration of director.narrations) {
    const segment = segments.get(narration.id);
    if (!segment) {
      issues.push({
        severity: "error",
        code: "voice-missing",
        message: `段落 ${narration.id} 缺少语音段`,
        path: `voiceMap.${narration.id}`,
      });
      continue;
    }
    const expected = sha256OfText(parseAnchors(narration.text).plainText);
    if (segment.textHash !== expected) {
      issues.push({
        severity: "warning",
        code: "voice-expired",
        message: `段落 ${narration.id} 文本已修改，语音过期（需重录）`,
        path: `voiceMap.${narration.id}`,
      });
    }
  }

  for (const segment of voiceMap.segments) {
    if (!director.narrations.some((n) => n.id === segment.narrationId)) {
      issues.push({
        severity: "warning",
        code: "voice-orphan",
        message: `语音段 ${segment.narrationId} 在导演稿中不存在`,
        path: `voiceMap.${segment.narrationId}`,
      });
    }
  }

  return issues;
}

/** 全量检查。 */
export function lintAll(
  director: DirectorScript,
  voiceMap?: VoiceMap,
  options: LintDirectorOptions = {},
): LintIssue[] {
  const issues = lintDirector(director, options);
  if (voiceMap) {
    issues.push(...lintVoiceMap(director, voiceMap));
  }
  return issues;
}

export function hasErrors(issues: LintIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
