import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { IrObject } from "@app/remotion/IrObject";
import { interpolateTransform } from "@app/remotion/interpolate";
import { FONT_FAMILY } from "@app/asset/font-constants";
import type { Asset, SceneObject } from "@app/schema/animation-ir";
import { COLOR_TOKENS, SUBTITLE_BOTTOM_MARGIN } from "@app/theme/tokens";
import { useEditor } from "../store";

const FRAME_W = 1920;
const FRAME_H = 1080;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * 选中框 + 拖动打关键帧：
 * - 拖动元素：在播放头处写关键帧；
 * - 拖动中按空格：继续播放，元素随播放头自动连续打帧（"录运动"）；
 * - 拖动中滚轮：逐帧微调播放头（Shift 加速 ×10），可边拖边校时。
 */
const SelectionBox = ({
  object,
  asset,
  currentFrame,
  scale,
  selected,
}: {
  object: SceneObject;
  asset: Asset;
  currentFrame: number;
  scale: number;
  selected: boolean;
}) => {
  const select = useEditor((s) => s.select);
  const setPlaying = useEditor((s) => s.setPlaying);
  const removeSelected = useEditor((s) => s.removeSelected);
  const updateSelectedTransform = useEditor((s) => s.updateSelectedTransform);
  const playing = useEditor((s) => s.playing);
  const [dragging, setDragging] = useState(false);
  const dragInfo = useRef<{ objectX: number; objectY: number } | null>(null);
  const startPointer = useRef({ x: 0, y: 0 });
  const lastDelta = useRef({ dx: 0, dy: 0 });
  const removeWheelListener = useRef<(() => void) | null>(null);

  const localFrame = currentFrame - object.from;
  const transform = interpolateTransform(
    object.initial,
    object.keyframes,
    localFrame,
  );
  const width = asset.bounds.width * transform.scale;
  const height = asset.bounds.height * transform.scale;

  const endDrag = () => {
    setDragging(false);
    dragInfo.current = null;
    removeWheelListener.current?.();
    removeWheelListener.current = null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    select(object.id);
    setPlaying(false);
    dragInfo.current = { objectX: transform.x, objectY: transform.y };
    startPointer.current = { x: e.clientX, y: e.clientY };
    lastDelta.current = { dx: 0, dy: 0 };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);

    // 拖动中滚轮 = 逐帧微调播放头（capture 拦截，避免同时平移画布）
    const onWheelScrub = (ev: WheelEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const state = useEditor.getState();
      const step = (ev.shiftKey ? 10 : 1) * (ev.deltaY > 0 ? 1 : -1);
      state.setPlaying(false);
      state.setFrame(state.currentFrame + step);
    };
    window.addEventListener("wheel", onWheelScrub, {
      passive: false,
      capture: true,
    });
    removeWheelListener.current = () =>
      window.removeEventListener("wheel", onWheelScrub, { capture: true });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragInfo.current;
    if (!drag || e.buttons === 0) return;
    lastDelta.current = {
      dx: e.clientX - startPointer.current.x,
      dy: e.clientY - startPointer.current.y,
    };
    updateSelectedTransform({
      x: drag.objectX + lastDelta.current.dx / scale,
      y: drag.objectY + lastDelta.current.dy / scale,
    });
  };

  // 拖动中且正在播放：播放头每前进一帧，就在新时刻续写位置（连续打帧）
  useEffect(() => {
    if (!dragging || !playing || !dragInfo.current) return;
    const drag = dragInfo.current;
    updateSelectedTransform({
      x: drag.objectX + lastDelta.current.dx / scale,
      y: drag.objectY + lastDelta.current.dy / scale,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrame]);

  const style: CSSProperties = {
    position: "absolute",
    left: transform.x,
    top: transform.y,
    width,
    height,
    transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)`,
    outline: selected ? "2px solid #2563eb" : "none",
    cursor: "move",
    pointerEvents: "auto",
    zIndex: 1000 + object.layer,
  };

  return (
    <div
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {selected && (
        <button
          className="del-btn"
          title="删除元素（Delete）"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            removeSelected();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};

/**
 * 素材画布：编辑区即最终画面（WYSIWYG）。
 * 「画布 / 视频框 / 画面」三层次与镜头运动留待 P2 镜头语言阶段实现。
 */
export const Canvas = () => {
  const ir = useEditor((s) => s.ir);
  const currentFrame = useEditor((s) => s.currentFrame);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.4);
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth - 32;
      const h = el.clientHeight - 32;
      setFitScale(Math.max(0.05, Math.min(w / FRAME_W, h / FRAME_H)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const effectiveScale = fitScale * view.zoom;

  // 原生 wheel（非 passive）：Ctrl+滚轮 缩放视图（鼠标锚点）；滚轮 平移；Shift+滚轮 横向
  const wheelState = useRef({ view, fitScale });
  wheelState.current = { view, fitScale };
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view: v, fitScale: fs } = wheelState.current;
      const s = fs * v.zoom;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left - rect.width / 2;
        const my = e.clientY - rect.top - rect.height / 2;
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const zoom = clamp(v.zoom * factor, 0.3, 6);
        const s2 = fs * zoom;
        setView({
          zoom,
          panX: mx - (mx - v.panX) * (s2 / s),
          panY: my - (my - v.panY) * (s2 / s),
        });
      } else if (e.shiftKey) {
        setView((st) => ({ ...st, panX: st.panX - e.deltaY }));
      } else {
        setView((st) => ({ ...st, panY: st.panY - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /** 平移：拖画布空白 / 中键拖动 */
  const startPan = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPanX = view.panX;
    const startPanY = view.panY;
    const move = (ev: PointerEvent) => {
      setView((v) => ({
        ...v,
        panX: startPanX + (ev.clientX - startX),
        panY: startPanY + (ev.clientY - startY),
      }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const deselectIfBackground = (
    e: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    if (e.target === e.currentTarget) {
      select(null);
      startPan(e);
    }
  };

  const assetById = new Map<string, Asset>(
    (ir?.assets ?? []).map((a) => [a.id, a]),
  );
  const active = (ir?.objects ?? []).filter(
    (o) => currentFrame >= o.from && currentFrame < o.from + o.durationInFrames,
  );

  const isMoved = view.zoom !== 1 || view.panX !== 0 || view.panY !== 0;

  return (
    <div className="panel canvas-panel">
      <div className="canvas-title">
        素材画布
        <span className="zoom">{Math.round(effectiveScale * 100)}%</span>
        {isMoved && (
          <button
            className="loc-btn"
            onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}
            title="恢复居中并适配"
          >
            定位到画面
          </button>
        )}
        <span className="title-hint">
          Ctrl+滚轮 缩放视图 · 拖空白/中键 平移 · 拖动元素自动关键帧 ·
          拖动中：空格续播 / 滚轮微调
        </span>
      </div>
      <div
        className="stage-wrap"
        ref={containerRef}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!ir && (
          <div className="canvas-empty">
            暂无 IR —— 用 AI 面板生成，或选择工作区
          </div>
        )}
        {ir && (
          <div
            className="canvas-frame"
            style={{
              transform: `translate(${view.panX}px, ${view.panY}px) scale(${effectiveScale})`,
            }}
            onPointerDown={deselectIfBackground}
          >
            <div className="canvas-content">
              {active.map((o) => {
                const asset = assetById.get(o.asset);
                if (!asset) return null;
                return (
                  <div
                    className="canvas-item"
                    key={o.id}
                    style={{ zIndex: o.layer + 1 }}
                  >
                    <IrObject
                      object={o}
                      asset={asset}
                      localFrame={currentFrame - o.from}
                    />
                  </div>
                );
              })}
              {(ir?.subtitles ?? [])
                .filter(
                  (cue) =>
                    currentFrame >= cue.fromFrame &&
                    currentFrame < cue.fromFrame + cue.durationInFrames,
                )
                .map((cue) => (
                  <div
                    key={`sub-${cue.narrationId}`}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: SUBTITLE_BOTTOM_MARGIN,
                      display: "flex",
                      justifyContent: "center",
                      pointerEvents: "none",
                      zIndex: 2000,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: FONT_FAMILY,
                        fontSize: cue.fontSize,
                        fontWeight: cue.fontWeight,
                        lineHeight: `${cue.lineHeight}px`,
                        color: COLOR_TOKENS.subtitle,
                        textAlign: "center",
                        whiteSpace: "pre",
                      }}
                    >
                      {cue.lines.map((line, index) => (
                        <div key={index}>{line === "" ? "\u00A0" : line}</div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
            <div className="canvas-overlay">
              {active.map((o) => {
                const asset = assetById.get(o.asset);
                if (!asset) return null;
                return (
                  <SelectionBox
                    key={o.id}
                    object={o}
                    asset={asset}
                    currentFrame={currentFrame}
                    scale={effectiveScale}
                    selected={o.id === selectedId}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
