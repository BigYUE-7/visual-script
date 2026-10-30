import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { TRANSFORM_PROPS, keyframeMoveBounds, type TransformProp } from "@app/lib/keyframes";
import type { Keyframe, SceneObject } from "@app/schema/animation-ir";
import { useEditor } from "../store";

const GUTTER = 92;

/** 刻度自适应：选出使相邻刻度间距 ≥56px 的“秒”档位。 */
function tickSeconds(pxPerSecond: number): number {
  const candidates = [0.5, 1, 2, 5, 10, 30, 60, 120, 300];
  for (const c of candidates) {
    if (c * pxPerSecond >= 56) return c;
  }
  return candidates[candidates.length - 1];
}

const PROP_LABEL: Record<TransformProp, string> = {
  x: "x",
  y: "y",
  scale: "缩放",
  rotation: "旋转",
  opacity: "透明度",
};

function collectProps(keyframes: Keyframe[]): TransformProp[] {
  const present = new Set<TransformProp>();
  for (const k of keyframes) {
    for (const p of TRANSFORM_PROPS) {
      if (k.transform[p] !== undefined) present.add(p);
    }
  }
  return TRANSFORM_PROPS.filter((p) => present.has(p));
}

/**
 * 右侧轨道面板（布局 C）：
 * - 剪辑工具条：打关键帧 / 删除 / 展开折叠 / 吸附 / 时间缩放；
 * - 素材轨可拖动（移动整段）、可拖两端（改出入场）；
 * - 每个素材下有动画子轨道（x/y/缩放/旋转/透明度），关键帧可拖动；
 * - 标尺与轨道点击定位；播放时自动跟随播放头。
 */
export const TrackPanel = () => {
  const ir = useEditor((s) => s.ir);
  const currentFrame = useEditor((s) => s.currentFrame);
  const selectedId = useEditor((s) => s.selectedId);
  const selectedKeyframe = useEditor((s) => s.selectedKeyframe);
  const select = useEditor((s) => s.select);
  const selectKeyframe = useEditor((s) => s.selectKeyframe);
  const setFrame = useEditor((s) => s.setFrame);
  const setPlaying = useEditor((s) => s.setPlaying);
  const updateObjectTiming = useEditor((s) => s.updateObjectTiming);
  const moveKeyframe = useEditor((s) => s.moveKeyframe);
  const addKeyframeAt = useEditor((s) => s.addKeyframeAt);
  const removeKeyframeProperty = useEditor((s) => s.removeKeyframeProperty);
  const addPoseKeyframeAtPlayhead = useEditor(
    (s) => s.addPoseKeyframeAtPlayhead,
  );
  const removeSelected = useEditor((s) => s.removeSelected);
  const zoom = useEditor((s) => s.timelineZoom);
  const setTimelineZoom = useEditor((s) => s.setTimelineZoom);
  const library = useEditor((s) => s.library);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [baseLaneWidth, setBaseLaneWidth] = useState(300);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () =>
      setBaseLaneWidth(Math.max(80, el.clientWidth - GUTTER - 2));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ir]);

  const totalFrames = ir?.totalFrames ?? 0;
  const pxPerFrame =
    totalFrames > 0 ? (baseLaneWidth * zoom) / totalFrames : 0.1;
  const lanePx = Math.max(80, totalFrames * pxPerFrame);

  // 播放 / 定位（含从下方时间轴拖动）时，自动横向跟随播放头保持可见
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || totalFrames === 0) return;
    const x = GUTTER + currentFrame * pxPerFrame;
    const right = el.scrollLeft + el.clientWidth;
    if (x > right - 60) {
      el.scrollLeft = x - el.clientWidth + 120;
    } else if (x < el.scrollLeft + GUTTER + 40) {
      el.scrollLeft = Math.max(0, x - GUTTER - 80);
    }
  }, [currentFrame, pxPerFrame, totalFrames]);

  // 原生 wheel（非 passive）：Ctrl+滚轮 缩放（鼠标处时间为锚点）；Alt/Shift+滚轮 横向滚动
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !ir) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const contentX = el.scrollLeft + mouseX - GUTTER;
        const time = contentX / pxPerFrame;
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const nextZoom = Math.max(1, Math.min(16, zoom * factor));
        const nextPxPerFrame = (baseLaneWidth * nextZoom) / ir.totalFrames;
        const nextScroll = time * nextPxPerFrame - mouseX + GUTTER;
        setTimelineZoom(nextZoom);
        requestAnimationFrame(() => {
          el.scrollLeft = Math.max(0, nextScroll);
        });
      } else if (e.altKey || e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ir, pxPerFrame, zoom, baseLaneWidth, setTimelineZoom]);

  // 拖标尺到边缘：自动横滚（一次拖动覆盖整条时间轴）
  const rulerPointerX = useRef(0);
  const edgeRaf = useRef<number | null>(null);
  const rulerSeekRef = useRef<(clientX: number) => void>(() => {});

  const stopEdgeScroll = () => {
    if (edgeRaf.current !== null) {
      cancelAnimationFrame(edgeRaf.current);
      edgeRaf.current = null;
    }
  };

  const startEdgeScroll = (dir: number) => {
    if (edgeRaf.current !== null) return;
    const step = () => {
      const el = scrollRef.current;
      if (!el) {
        stopEdgeScroll();
        return;
      }
      const before = el.scrollLeft;
      el.scrollLeft = Math.max(0, el.scrollLeft + dir * 10);
      if (el.scrollLeft === before) {
        stopEdgeScroll();
        return;
      }
      rulerSeekRef.current(rulerPointerX.current);
      edgeRaf.current = requestAnimationFrame(step);
    };
    edgeRaf.current = requestAnimationFrame(step);
  };

  useEffect(() => stopEdgeScroll, []);

  const seekFromRuler = (clientX: number) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPlaying(false);
    setFrame((clientX - rect.left) / pxPerFrame);
  };
  rulerSeekRef.current = seekFromRuler;

  const onRulerPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    rulerPointerX.current = e.clientX;
    seekFromRuler(e.clientX);
    checkRulerEdge(e.clientX);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onRulerPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.buttons & 1) !== 1) return;
    rulerPointerX.current = e.clientX;
    seekFromRuler(e.clientX);
    checkRulerEdge(e.clientX);
  };

  const checkRulerEdge = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (clientX < rect.left + 44) startEdgeScroll(-1);
    else if (clientX > rect.right - 44) startEdgeScroll(1);
    else stopEdgeScroll();
  };

  if (!ir) {
    return (
      <div className="panel tracks-panel">
        <div className="tracks-head">
          <span className="tk-title">轨道</span>
        </div>
      </div>
    );
  }

  const assetById = new Map(ir.assets.map((a) => [a.id, a]));
  const libraryById = new Map(library.map((e) => [e.id, e]));
  const ordered = [...ir.objects].sort((a, b) => b.layer - a.layer);
  const pxPerSecond = pxPerFrame * ir.fps;
  const tickEveryFrames = Math.max(
    1,
    Math.round(tickSeconds(pxPerSecond) * ir.fps),
  );
  const tickCount = Math.floor(ir.totalFrames / tickEveryFrames) + 1;

  const snap = (value: number, candidates: number[]): number => {
    if (!snapEnabled) return value;
    const threshold = Math.max(1, Math.round(6 / pxPerFrame));
    let best = value;
    let bestDist = threshold + 1;
    for (const c of candidates) {
      const d = Math.abs(c - value);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return bestDist <= threshold ? best : value;
  };

  const beginDrag = (
    e: ReactPointerEvent<HTMLElement>,
    onMove: (deltaPx: number) => void,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setPlaying(false);
    const startX = e.clientX;
    const move = (ev: PointerEvent) => onMove(ev.clientX - startX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /** 其他元素的边界帧（吸附候选）。 */
  const otherEdges = (excludeId: string): number[] =>
    ir.objects
      .filter((o) => o.id !== excludeId)
      .flatMap((o) => [o.from, o.from + o.durationInFrames]);

  const seekOnElement = (
    e: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPlaying(false);
    setFrame((e.clientX - rect.left) / pxPerFrame);
  };

  // ---- 片段：拖动 / 裁剪 ----
  const startSegmentMove = (
    e: ReactPointerEvent<HTMLDivElement>,
    object: SceneObject,
  ) => {
    select(object.id);
    const startFrom = object.from;
    const candidates = [currentFrame, 0, ...otherEdges(object.id)];
    beginDrag(e, (dx) => {
      const delta = Math.round(dx / pxPerFrame);
      let next = Math.max(
        0,
        Math.min(startFrom + delta, totalFrames - object.durationInFrames),
      );
      next = snap(next, candidates);
      updateObjectTiming(object.id, { from: next });
    });
  };

  const startTrimLeft = (
    e: ReactPointerEvent<HTMLDivElement>,
    object: SceneObject,
  ) => {
    select(object.id);
    const startFrom = object.from;
    const end = object.from + object.durationInFrames;
    const candidates = [currentFrame, 0, ...otherEdges(object.id)];
    beginDrag(e, (dx) => {
      const delta = Math.round(dx / pxPerFrame);
      let next = Math.max(0, Math.min(startFrom + delta, end - 2));
      next = snap(next, candidates);
      updateObjectTiming(object.id, {
        from: next,
        durationInFrames: end - next,
      });
    });
  };

  const startTrimRight = (
    e: ReactPointerEvent<HTMLDivElement>,
    object: SceneObject,
  ) => {
    select(object.id);
    const startFrom = object.from;
    const startEnd = object.from + object.durationInFrames;
    const candidates = [currentFrame, totalFrames, ...otherEdges(object.id)];
    beginDrag(e, (dx) => {
      const delta = Math.round(dx / pxPerFrame);
      let nextEnd = Math.max(
        startFrom + 2,
        Math.min(startEnd + delta, totalFrames),
      );
      nextEnd = snap(nextEnd, candidates);
      updateObjectTiming(object.id, {
        durationInFrames: nextEnd - startFrom,
      });
    });
  };

  // ---- 子轨道：关键帧拖动 ----
  const startKeyframeDrag = (
    e: ReactPointerEvent<HTMLDivElement>,
    object: SceneObject,
    startFrame: number,
    property: TransformProp,
  ) => {
    selectKeyframe({
      objectId: object.id,
      frame: startFrame,
      property,
    });

    // 拖动前一次性计算边界：前一个关键帧 +1 ~ 后一个关键帧 -1（不越位、不重叠）
    const bounds = keyframeMoveBounds(
      object.keyframes,
      startFrame,
      property,
      object.durationInFrames - 1,
    );

    let last = startFrame;
    beginDrag(e, (dx) => {
      const fresh = useEditor
        .getState()
        .ir?.objects.find((o) => o.id === object.id);
      if (!fresh) return;
      // 绝对跟手：目标 = 起点 + 像素位移换算帧数（不做累计叠加，避免越拖越飞）
      const deltaFrames = Math.round(dx / pxPerFrame);
      let target = Math.max(
        bounds.minFrame,
        Math.min(startFrame + deltaFrames, bounds.maxFrame),
      );
      // 吸附（播放头 / 两端）后再夹一次边界，避免吸附导致越位
      const localPlayhead = currentFrame - fresh.from;
      const candidates = [
        ...(localPlayhead >= 0 && localPlayhead < fresh.durationInFrames
          ? [localPlayhead]
          : []),
        0,
        fresh.durationInFrames - 1,
      ];
      target = snap(target, candidates);
      target = Math.max(bounds.minFrame, Math.min(target, bounds.maxFrame));
      if (target === last) return;
      moveKeyframe(object.id, last, target, property);
      last = target;
      useEditor
        .getState()
        .selectKeyframe({ objectId: object.id, frame: target, property });
    });
  };

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="panel tracks-panel">
      <div className="tracks-head">
        <span className="tk-title">轨道</span>
        <span className="tip">拖动片段移动 · 拖两端裁剪 · 拖 ◆ 移动关键帧</span>
      </div>

      <div className="tr-tools">
        <button
          className="tool-mini"
          disabled={!selectedId}
          onClick={addPoseKeyframeAtPlayhead}
          title="在播放头为选中元素打一个完整姿态关键帧"
        >
          ＋关键帧
        </button>
        <button
          className="tool-mini"
          disabled={!selectedId}
          onClick={removeSelected}
          title="删除选中的关键帧或元素（Delete）"
        >
          删除
        </button>
        <span className="sep" />
        <button
          className="tool-mini"
          onClick={() => setCollapsedIds(new Set())}
        >
          展开全部
        </button>
        <button
          className="tool-mini"
          onClick={() =>
            setCollapsedIds(new Set(ir.objects.map((o) => o.id)))
          }
        >
          折叠全部
        </button>
        <span className="sep" />
        <label className="tool-check">
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={(e) => setSnapEnabled(e.target.checked)}
          />
          吸附
        </label>
        <span className="sep" />
        <button
          className="tool-mini"
          onClick={() =>
            setTimelineZoom(Math.max(1, +(zoom / 1.5).toFixed(2)))
          }
          title="时间轴缩小（Ctrl+滚轮）"
        >
          －
        </button>
        <span className="zoom-label">{zoom.toFixed(1)}×</span>
        <button
          className="tool-mini"
          onClick={() =>
            setTimelineZoom(Math.min(16, +(zoom * 1.5).toFixed(2)))
          }
          title="时间轴放大（Ctrl+滚轮）"
        >
          ＋
        </button>
      </div>

      <div className="tracks-scroll" ref={scrollRef}>
        <div className="tracks-inner" style={{ width: GUTTER + lanePx }}>
          <div
            className="tr-playhead"
            style={{ left: GUTTER + currentFrame * pxPerFrame }}
          />
          <div className="tr-ruler-row">
            <div className="tr-gutter" />
            <div
              className="tr-ruler"
              ref={rulerRef}
              style={{ width: lanePx }}
              onPointerDown={onRulerPointerDown}
              onPointerMove={onRulerPointerMove}
              onPointerUp={stopEdgeScroll}
              onPointerCancel={stopEdgeScroll}
            >
              {Array.from({ length: tickCount }, (_, i) => (
                <div
                  key={i}
                  className="rk-tick"
                  style={{ left: i * tickEveryFrames * pxPerFrame }}
                >
                  {i % 2 === 0 && (
                    <span className="rk-label">
                      {Math.round((i * tickEveryFrames) / ir.fps)}s
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="tr-row audio">
            <div className="tr-name">
              <span className="tr-id">TTS</span> 语音轨
            </div>
            <div
              className="tr-lane"
              style={{ width: lanePx }}
              onPointerDown={seekOnElement}
            >
              {ir.audio.map((segment) => {
                const left = segment.fromFrame * pxPerFrame;
                const width = Math.max(2, segment.durationInFrames * pxPerFrame);
                const label =
                  segment.file.split("/").pop()?.replace(/\.\w+$/, "") ?? "";
                return (
                  <div
                    key={segment.file}
                    className="seg audio-seg"
                    style={{ left, width }}
                    title={`${label} · ${(segment.durationInFrames / ir.fps).toFixed(2)}s`}
                  >
                    {width > 36 ? label : ""}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tr-row subtitle">
            <div className="tr-name">
              <span className="tr-id">CC</span> 字幕轨
            </div>
            <div
              className="tr-lane"
              style={{ width: lanePx }}
              onPointerDown={seekOnElement}
            >
              {(ir.subtitles ?? []).map((cue) => {
                const left = cue.fromFrame * pxPerFrame;
                const width = Math.max(2, cue.durationInFrames * pxPerFrame);
                return (
                  <div
                    key={cue.narrationId}
                    className="seg subtitle-seg"
                    style={{ left, width }}
                    title={`${cue.text} · ${(cue.durationInFrames / ir.fps).toFixed(2)}s（随语音区间，只读）`}
                  >
                    {width > 56 ? cue.text.slice(0, 12) : ""}
                  </div>
                );
              })}
            </div>
          </div>

          {ordered.map((object) => {
            const asset = assetById.get(object.asset);
            const label =
              asset?.form === "text"
                ? `文字「${asset.text.slice(0, 6)}」`
                : asset?.form === "shape"
                  ? `图形「${asset.shape}」`
                  : object.asset;
            const collapsed = collapsedIds.has(object.id);
            const props = collectProps(object.keyframes);
            const left = object.from * pxPerFrame;
            const width = Math.max(2, object.durationInFrames * pxPerFrame);

            return (
              <Fragment key={object.id}>
                <div
                  className={
                    "tr-row asset" +
                    (object.id === selectedId ? " selected" : "")
                  }
                >
                  <div className="tr-name">
                    <span
                      className="twist"
                      onClick={() => toggleCollapsed(object.id)}
                      title={collapsed ? "展开子轨道" : "折叠子轨道"}
                    >
                      {collapsed ? "▸" : "▾"}
                    </span>
                    <span
                      className="tr-label"
                      title={`${object.id} · ${label}`}
                      onClick={() => select(object.id)}
                    >
                      <span className="tr-id">L{object.layer}</span>
                      {object.id}
                    </span>
                    <span className="tr-kfcount">
                      {object.keyframes.length}◆
                    </span>
                  </div>
                  <div
                    className="tr-lane"
                    style={{ width: lanePx }}
                    onPointerDown={seekOnElement}
                  >
                    <div
                      className="seg asset-seg"
                      style={{ left, width }}
                      title={`${label} · ${(object.durationInFrames / ir.fps).toFixed(2)}s（拖动移动 / 两端裁剪）`}
                      onPointerDown={(e) => startSegmentMove(e, object)}
                    >
                      {(() => {
                        const libEntry = libraryById.get(object.asset);
                        const thumbSrc =
                          libEntry?.thumbnail ??
                          (asset &&
                          asset.form !== "text" &&
                          asset.form !== "shape"
                            ? asset.file
                            : undefined);
                        return thumbSrc && width > 30 ? (
                          <img
                            className="seg-thumb"
                            src={`/${thumbSrc}`}
                            alt=""
                            draggable={false}
                          />
                        ) : null;
                      })()}
                      {width > 64 && (
                        <span className="seg-label">
                          {libraryById.get(object.asset)?.name ?? object.id}
                        </span>
                      )}
                      <div
                        className="seg-handle left"
                        onPointerDown={(e) => startTrimLeft(e, object)}
                      />
                      <div
                        className="seg-handle right"
                        onPointerDown={(e) => startTrimRight(e, object)}
                      />
                    </div>
                  </div>
                </div>

                {!collapsed &&
                  props.map((property) => (
                    <div className="tr-row sub" key={property}>
                      <div className="tr-name sub">
                        <span className="prop-glyph">◆</span>
                        动画 · {PROP_LABEL[property]}
                      </div>
                      <div
                        className="tr-lane sub"
                        style={{ width: lanePx }}
                        onPointerDown={seekOnElement}
                        onDoubleClick={(e) => {
                          const rect = (
                            e.currentTarget as HTMLDivElement
                          ).getBoundingClientRect();
                          const localFrame = Math.round(
                            (e.clientX - rect.left) / pxPerFrame,
                          );
                          addKeyframeAt(object.id, localFrame, property);
                        }}
                        title="双击空白处：在该帧打关键帧"
                      >
                        {object.keyframes
                          .filter(
                            (k) => k.transform[property] !== undefined,
                          )
                          .map((k, index, list) => {
                            const frame = object.from + k.frame;
                            const next = list[index + 1];
                            const isSelected =
                              selectedKeyframe !== null &&
                              selectedKeyframe.objectId === object.id &&
                              selectedKeyframe.frame === k.frame &&
                              selectedKeyframe.property === property;
                            return (
                              <Fragment key={k.frame}>
                                {next && (
                                  <div
                                    className={
                                      "kf-link" + (isSelected ? " selected" : "")
                                    }
                                    style={{
                                      left: frame * pxPerFrame,
                                      width: Math.max(
                                        2,
                                        (next.frame - k.frame) * pxPerFrame,
                                      ),
                                    }}
                                    title={`作用区间 ${(k.frame / ir.fps).toFixed(2)}s → ${(next.frame / ir.fps).toFixed(2)}s · 缓动 ${k.easing ?? "linear"}`}
                                  />
                                )}
                                <div
                                  className={"kf" + (isSelected ? " selected" : "")}
                                  style={{ left: frame * pxPerFrame }}
                                  data-kf-object={object.id}
                                  data-kf-prop={property}
                                  data-kf-frame={k.frame}
                                  title={`关键帧 ${k.frame}（${(frame / ir.fps).toFixed(2)}s）· 拖动移动 · 右键删除`}
                                  onPointerDown={(e) =>
                                    startKeyframeDrag(
                                      e,
                                      object,
                                      k.frame,
                                      property,
                                    )
                                  }
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    removeKeyframeProperty(
                                      object.id,
                                      k.frame,
                                      property,
                                    );
                                  }}
                                />
                              </Fragment>
                            );
                          })}
                      </div>
                    </div>
                  ))}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
