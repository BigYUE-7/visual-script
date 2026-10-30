import type { WordAlignment } from "../schema/voice-map";

export type ParsedAnchor = {
  /** 显式 id 或自动生成（anchor-1、anchor-2…） */
  id: string;
  /** 锚点文本（cue 的 on.anchor 引用它） */
  text: string;
  /** 在剥离标记后的纯文本中的起始字符下标 */
  charIndex: number;
  /** 同一文本内第几次出现（从 1 开始） */
  occurrence: number;
};

export type ParsedText = {
  /** 剥离 [[...]] 标记后的纯文本（送 TTS 的文本） */
  plainText: string;
  anchors: ParsedAnchor[];
  /** 解析错误（未闭合标记、重复 id 等） */
  errors: string[];
};

/**
 * 解析导演稿文本中的锚点标记。
 * 语法：[[锚点文本]] 或 [[anchorId|锚点文本]]。
 * 同一段内重复的锚点文本按出现顺序编号（occurrence 从 1 开始）。
 */
export function parseAnchors(raw: string): ParsedText {
  let i = 0;
  let plainText = "";
  const anchors: ParsedAnchor[] = [];
  const errors: string[] = [];
  const counters = new Map<string, number>();
  const usedIds = new Set<string>();

  while (i < raw.length) {
    if (raw.startsWith("[[", i)) {
      const close = raw.indexOf("]]", i + 2);
      if (close === -1) {
        errors.push(`未闭合的锚点标记（位置 ${i}）`);
        plainText += raw.slice(i);
        break;
      }
      const inner = raw.slice(i + 2, close);
      let text = inner;
      let explicitId: string | null = null;
      const sep = inner.indexOf("|");
      if (sep !== -1) {
        explicitId = inner.slice(0, sep).trim();
        text = inner.slice(sep + 1).trim();
      } else {
        text = inner.trim();
      }

      if (!text) {
        errors.push(`锚点文本为空（位置 ${i}）`);
        i = close + 2;
        continue;
      }

      const occurrence = (counters.get(text) ?? 0) + 1;
      counters.set(text, occurrence);
      const id = explicitId || `anchor-${anchors.length + 1}`;

      if (usedIds.has(id)) {
        errors.push(`锚点 id 重复：${id}`);
      }
      usedIds.add(id);

      anchors.push({ id, text, charIndex: plainText.length, occurrence });
      plainText += text;
      i = close + 2;
    } else {
      plainText += raw[i];
      i += 1;
    }
  }

  return { plainText, anchors, errors };
}

/** 剥离锚点标记，得到送 TTS 的纯文本。 */
export function stripAnchors(raw: string): string {
  return parseAnchors(raw).plainText;
}

/**
 * 按引用查找锚点：支持 id、文本、或 "文本#N"（第 N 次出现）。
 * 文本重复且未指定 #N 时视为歧义，返回 undefined。
 */
export function findAnchor(parsed: ParsedText, ref: string): ParsedAnchor | undefined {
  const numbered = /^(.*)#(\d+)$/.exec(ref);
  if (numbered) {
    const [, target, numStr] = numbered;
    const n = Number(numStr);
    return parsed.anchors.find(
      (a) => (a.text === target || a.id === target) && a.occurrence === n,
    );
  }
  const byId = parsed.anchors.find((a) => a.id === ref);
  if (byId) return byId;
  const byText = parsed.anchors.filter((a) => a.text === ref);
  if (byText.length === 1) return byText[0];
  return undefined;
}

/** 查找与引用匹配的所有锚点（用于歧义与悬空检查）。 */
export function findAnchorMatches(parsed: ParsedText, ref: string): ParsedAnchor[] {
  const numbered = /^(.*)#(\d+)$/.exec(ref);
  if (numbered) {
    const [, target, numStr] = numbered;
    const n = Number(numStr);
    return parsed.anchors.filter(
      (a) => (a.text === target || a.id === target) && a.occurrence === n,
    );
  }
  return parsed.anchors.filter((a) => a.id === ref || a.text === ref);
}

const NOT_SPEAKABLE = /[\p{P}\p{Z}\p{C}]/u;

/** 是否可发声字符（标点、空白、控制字符不进入 TTS 对齐）。 */
export function isSpeakable(char: string): boolean {
  return !NOT_SPEAKABLE.test(char);
}

/**
 * 建立"纯文本码元下标 → 第 k 个可发声字符"的映射。
 * 返回数组，下标为码元位置；不可发声位置为 -1。
 */
export function speakableIndexMap(plainText: string): number[] {
  const result: number[] = new Array(plainText.length).fill(-1);
  let k = 0;
  let i = 0;
  while (i < plainText.length) {
    const cp = plainText.codePointAt(i);
    if (cp === undefined) break;
    const char = String.fromCodePoint(cp);
    const speakable = isSpeakable(char);
    for (let u = 0; u < char.length; u += 1) {
      result[i + u] = speakable ? k : -1;
    }
    if (speakable) k += 1;
    i += char.length;
  }
  return result;
}

export type AnchorTime = {
  atMs: number;
  /** L2 = 字级对齐命中；L0 = 降级为段首 */
  precision: "L2" | "L0";
  note?: string;
};

/**
 * 把锚点解析为绝对时刻（相对段首的毫秒 + 段首偏移）。
 * - 有字级对齐且能命中：L2，取锚点首字开始时间；
 * - 无对齐 / 对不上（数字、多音字归一化等）：L0，降级为段首并给出 note。
 */
export function resolveAnchorTime(options: {
  parsed: ParsedText;
  anchor: ParsedAnchor;
  alignment: WordAlignment[];
  blockStartMs: number;
}): AnchorTime {
  const { parsed, anchor, alignment, blockStartMs } = options;

  if (alignment.length === 0) {
    return {
      atMs: blockStartMs,
      precision: "L0",
      note: "无字级对齐，锚点降级为段首",
    };
  }

  const map = speakableIndexMap(parsed.plainText);

  // 锚点文本内第一个可发声字符的位置
  let targetIndex = -1;
  const anchorEnd = anchor.charIndex + anchor.text.length;
  for (let i = anchor.charIndex; i < anchorEnd && i < parsed.plainText.length; i += 1) {
    if (map[i] !== -1) {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex === -1) {
    return {
      atMs: blockStartMs,
      precision: "L0",
      note: "锚点文本不含可发声字符",
    };
  }

  // 沿纯文本推进对齐指针；允许最多 3 条的前视重同步（数字/多音字扩展）
  let a = 0;
  for (let i = 0; i <= targetIndex; i += 1) {
    if (map[i] === -1) continue;
    const char = String.fromCodePoint(parsed.plainText.codePointAt(i)!);
    if (a >= alignment.length) break;

    if (alignment[a].text === char) {
      if (i === targetIndex) {
        return { atMs: blockStartMs + alignment[a].startMs, precision: "L2" };
      }
      a += 1;
      continue;
    }

    let resync = -1;
    for (let j = 1; j <= 3 && a + j < alignment.length; j += 1) {
      if (alignment[a + j].text === char) {
        resync = j;
        break;
      }
    }
    if (resync === -1) {
      return {
        atMs: blockStartMs,
        precision: "L0",
        note: `对齐文本与原文不匹配（"${char}"），锚点降级为段首`,
      };
    }
    a += resync;
    if (i === targetIndex) {
      return { atMs: blockStartMs + alignment[a].startMs, precision: "L2" };
    }
    a += 1;
  }

  return {
    atMs: blockStartMs,
    precision: "L0",
    note: "锚点时刻未能命中对齐数据",
  };
}
