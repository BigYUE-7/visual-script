import type { NormalizedPoint } from "../schema/common";
import type { Slot } from "../schema/common";
import type { Bounds } from "../schema/common";
import { SUBTITLE_SAFE_ZONE } from "../theme/tokens";

/** 画布尺寸（1080p 设计基准）。 */
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

/** 语义槽位 → 归一化画布位置（元素中心点）。 */
export const SLOT_POSITIONS: Record<Slot, { x: number; y: number }> = {
  center: { x: 0.5, y: 0.5 },
  top: { x: 0.5, y: 0.16 },
  bottom: { x: 0.5, y: 0.84 },
  left: { x: 0.18, y: 0.5 },
  right: { x: 0.82, y: 0.5 },
  top_left: { x: 0.2, y: 0.2 },
  top_right: { x: 0.8, y: 0.2 },
  bottom_left: { x: 0.2, y: 0.8 },
  bottom_right: { x: 0.8, y: 0.8 },
};

/** 槽位 → 画布世界坐标（中心点）。 */
export function slotToWorld(slot: Slot): { x: number; y: number } {
  const p = SLOT_POSITIONS[slot];
  return { x: p.x * CANVAS_WIDTH, y: p.y * CANVAS_HEIGHT };
}

/** 默认 9 锚点：中心、四边中点、四角（归一化 0–1，相对包围盒）。 */
export function boxAnchors(): Record<string, NormalizedPoint> {
  return {
    center: { x: 0.5, y: 0.5 },
    top: { x: 0.5, y: 0 },
    bottom: { x: 0.5, y: 1 },
    left: { x: 0, y: 0.5 },
    right: { x: 1, y: 0.5 },
    top_left: { x: 0, y: 0 },
    top_right: { x: 1, y: 0 },
    bottom_left: { x: 0, y: 1 },
    bottom_right: { x: 1, y: 1 },
  };
}

/** 圆形锚点：中心 + 上下左右。 */
export function circleAnchors(): Record<string, NormalizedPoint> {
  return {
    center: { x: 0.5, y: 0.5 },
    top: { x: 0.5, y: 0 },
    bottom: { x: 0.5, y: 1 },
    left: { x: 0, y: 0.5 },
    right: { x: 1, y: 0.5 },
  };
}

/** 直线/箭头锚点：start、mid、end（箭头另有 tip）。 */
export function lineAnchors(isArrow: boolean): Record<string, NormalizedPoint> {
  const anchors: Record<string, NormalizedPoint> = {
    start: { x: 0, y: 0.5 },
    mid: { x: 0.5, y: 0.5 },
    end: { x: 1, y: 0.5 },
  };
  if (isArrow) {
    anchors.tip = { x: 1, y: 0.5 };
  }
  return anchors;
}

/**
 * 把元素中心钳制到字幕安全区上方：包围盒下沿不得进入底部字幕区。
 * 编译期确定性规则；已放入 IR 的位置不再受编辑器拖动影响。
 */
export function clampAboveSubtitleZone(
  center: { x: number; y: number },
  bounds: Bounds,
): { x: number; y: number } {
  const maxCenterY = CANVAS_HEIGHT - SUBTITLE_SAFE_ZONE - bounds.height / 2;
  if (center.y <= maxCenterY) return center;
  return { x: center.x, y: maxCenterY };
}

/** 归一化锚点 → 世界坐标（bounds 为元素包围盒，center 为元素中心）。 */
export function anchorToWorld(
  center: { x: number; y: number },
  bounds: Bounds,
  anchor: NormalizedPoint,
): { x: number; y: number } {
  return {
    x: center.x + (anchor.x - 0.5) * bounds.width,
    y: center.y + (anchor.y - 0.5) * bounds.height,
  };
}
