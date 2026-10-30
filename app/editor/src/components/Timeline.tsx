import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { syncAudio } from "../audio";
import { useEditor } from "../store";

function tickSeconds(pxPerSecond: number): number {
  const candidates = [0.5, 1, 2, 5, 10, 30, 60, 120, 300];
  for (const c of candidates) {
    if (c * pxPerSecond >= 56) return c;
  }
  return candidates[candidates.length - 1];
}

const EDGE_ZONE = 44;
const EDGE_SPEED = 10;

/**
 * 下方精调时间轴（布局 C）：
 * - 播放控制 + 点击/拖动任意位置定位；
 * - 细线镜像：语音轨 + 前 N 条素材轨（N 可调，默认 4；选中轨始终显示）；
 * - Ctrl+滚轮 缩放（鼠标锚点，与右侧轨道共享）；Alt/Shift+滚轮 横向滚动；
 * - 拖动指针到边缘自动横滚：一次拖动即可覆盖整条时间轴；
 * - 播放 / 定位时自动滚动保持指针可见。
 */
export const Timeline = () => {
  const ir = useEditor((s) => s.ir);
  const currentFrame = useEditor((s) => s.currentFrame);
  const playing = useEditor((s) => s.playing);
  const selectedId = useEditor((s) => s.selectedId);
  const setFrame = useEditor((s) => s.setFrame);
  const setPlaying = useEditor((s) => s.setPlaying);
  const zoom = useEditor((s) => s.timelineZoom);
  const setTimelineZoom = useEditor((s) => s.setTimelineZoom);

  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [baseWidth, setBaseWidth] = useState(800);
  const [mirrorRows, setMirrorRows] = useState(4);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setBaseWidth(Math.max(120, el.clientWidth - 2));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ir]);

  const totalFrames = ir?.totalFrames ?? 0;
  const pxPerFrame =
    totalFrames > 0 ? (baseWidth * zoom) / totalFrames : 0.1;
  const innerWidth = Math.max(80, totalFrames * pxPerFrame);

  // 播放/定位时自动横向跟随播放头（保持指针可见）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = currentFrame * pxPerFrame;
    const right = el.scrollLeft + el.clientWidth;
    if (x > right - 60) {
      el.scrollLeft = Math.max(0, x - el.clientWidth + 120);
    } else if (x < el.scrollLeft + 60) {
      el.scrollLeft = Math.max(0, x - 80);
    }
  }, [currentFrame, pxPerFrame]);

  // 原生 wheel（非 passive）：Ctrl 缩放 / Alt·Shift 横滚
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || totalFrames === 0) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const time = (el.scrollLeft + mouseX) / pxPerFrame;
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const nextZoom = Math.max(1, Math.min(16, zoom * factor));
        const nextPxPerFrame = (baseWidth * nextZoom) / totalFrames;
        const nextScroll = time * nextPxPerFrame - mouseX;
        setTimelineZoom(nextZoom);
        requestAnimationFrame(() => {
          el.scrollLeft = Math.max(0, nextScroll);
        });
      } else if (e.altKey || e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
      // 普通滚轮：默认纵向滚动（行数多时）
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [totalFrames, pxPerFrame, zoom, baseWidth, setTimelineZoom]);

  // 拖动指针到边缘：自动横滚（一次拖动覆盖整条时间轴）
  const pointerClientX = useRef(0);
  const edgeRaf = useRef<number | null>(null);
  const seekRef = useRef<(clientX: number) => void>(() => {});

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
      el.scrollLeft = Math.max(0, el.scrollLeft + dir * EDGE_SPEED);
      if (el.scrollLeft === before) {
        stopEdgeScroll();
        return;
      }
      seekRef.current(pointerClientX.current);
      edgeRaf.current = requestAnimationFrame(step);
    };
    edgeRaf.current = requestAnimationFrame(step);
  };

  useEffect(() => stopEdgeScroll, []);

  if (!ir) {
    return <div className="panel bottom-tl" />;
  }

  const ordered = [...ir.objects].sort((a, b) => b.layer - a.layer);
  const shown = ordered.slice(0, mirrorRows);
  if (selectedId && !shown.some((o) => o.id === selectedId)) {
    const selected = ordered.find((o) => o.id === selectedId);
    if (selected) shown.push(selected);
  }

  const pxPerSecond = pxPerFrame * ir.fps;
  const tickEveryFrames = Math.max(
    1,
    Math.round(tickSeconds(pxPerSecond) * ir.fps),
  );
  const tickCount = Math.floor(ir.totalFrames / tickEveryFrames) + 1;

  const togglePlay = () => {
    const state = useEditor.getState();
    const next = !state.playing;
    state.setPlaying(next);
    if (next && state.ir) {
      syncAudio(state.ir, state.currentFrame, true);
    }
  };

  const seekAtClientX = (clientX: number) => {
    const rect = innerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPlaying(false);
    setFrame((clientX - rect.left) / pxPerFrame);
  };
  seekRef.current = seekAtClientX;

  const handleEdge = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (clientX < rect.left + EDGE_ZONE) startEdgeScroll(-1);
    else if (clientX > rect.right - EDGE_ZONE) startEdgeScroll(1);
    else stopEdgeScroll();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    pointerClientX.current = e.clientX;
    seekAtClientX(e.clientX);
    handleEdge(e.clientX);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.buttons & 1) !== 1) return;
    pointerClientX.current = e.clientX;
    seekAtClientX(e.clientX);
    handleEdge(e.clientX);
  };
  const onPointerUp = () => {
    stopEdgeScroll();
  };

  return (
    <div className="panel bottom-tl">
      <div className="tp-row">
        <button className="tp-btn" onClick={togglePlay} title="播放 / 暂停（空格）">
          {playing ? "⏸" : "▶"}
        </button>
        <button
          className="tp-btn"
          title="回到起点"
          onClick={() => {
            setPlaying(false);
            setFrame(0);
          }}
        >
          ⏮
        </button>
        <button
          className="tp-btn"
          title="上一帧"
          onClick={() => {
            setPlaying(false);
            setFrame(currentFrame - 1);
          }}
        >
          ◀|
        </button>
        <button
          className="tp-btn"
          title="下一帧"
          onClick={() => {
            setPlaying(false);
            setFrame(currentFrame + 1);
          }}
        >
          |▶
        </button>
        <span className="tp-time">
          {(currentFrame / ir.fps).toFixed(2)}s /{" "}
          {(ir.totalFrames / ir.fps).toFixed(2)}s · 帧 {currentFrame}/
          {ir.totalFrames - 1}
        </span>
        <label className="tp-mirror">
          显示行数
          <input
            type="number"
            min={1}
            max={30}
            value={mirrorRows}
            onChange={(e) =>
              setMirrorRows(
                Math.max(1, Math.min(30, Number(e.target.value) || 1)),
              )
            }
          />
        </label>
        <span className="tp-hint">
          点击/拖动定位（拖到边缘自动横滚）· Ctrl+滚轮 缩放 · Alt/Shift+滚轮
          横滚 · 与右侧轨道共享缩放
        </span>
      </div>

      <div className="bt-scroll" ref={scrollRef}>
        <div
          className="bt-inner"
          ref={innerRef}
          style={{ width: innerWidth }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="bt-ruler">
            {Array.from({ length: tickCount }, (_, i) => (
              <div
                key={i}
                className="bt-tick"
                style={{ left: i * tickEveryFrames * pxPerFrame }}
              >
                {i % 2 === 0 && (
                  <span className="bt-tick-label">
                    {Math.round((i * tickEveryFrames) / ir.fps)}s
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="bt-line audio-line">
            {ir.audio.map((segment) => (
              <div
                key={segment.file}
                className="seg audio-seg"
                style={{
                  left: segment.fromFrame * pxPerFrame,
                  width: Math.max(2, segment.durationInFrames * pxPerFrame),
                }}
              />
            ))}
          </div>

          <div className="bt-line subtitle-line">
            {(ir.subtitles ?? []).map((cue) => (
              <div
                key={cue.narrationId}
                className="seg subtitle-seg"
                style={{
                  left: cue.fromFrame * pxPerFrame,
                  width: Math.max(2, cue.durationInFrames * pxPerFrame),
                }}
              />
            ))}
          </div>

          {shown.map((object) => (
            <div
              className={
                "bt-line" + (object.id === selectedId ? " selected" : "")
              }
              key={object.id}
            >
              <div
                className="seg asset-seg"
                style={{
                  left: object.from * pxPerFrame,
                  width: Math.max(2, object.durationInFrames * pxPerFrame),
                }}
              />
              {object.keyframes.map((k) => (
                <div
                  key={k.frame}
                  className="bl-dot"
                  style={{ left: (object.from + k.frame) * pxPerFrame }}
                />
              ))}
            </div>
          ))}

          <div
            className="ph-line"
            style={{ left: currentFrame * pxPerFrame }}
          />
        </div>
      </div>
    </div>
  );
};
