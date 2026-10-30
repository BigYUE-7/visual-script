import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { stopAllAudio, syncAudio } from "./audio";
import { AiPanel } from "./components/AiPanel";
import { AssetBar } from "./components/AssetBar";
import { AssetGenPanel } from "./components/AssetGenPanel";
import { Canvas } from "./components/Canvas";
import { LibraryPanel } from "./components/LibraryPanel";
import { PropertyPanel } from "./components/PropertyPanel";
import { Timeline } from "./components/Timeline";
import { TrackPanel } from "./components/TrackPanel";
import { useEditor } from "./store";

const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return !!el && ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const persisted = (key: string, fallback: number): number => {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const num = raw ? Number(raw) : NaN;
  return Number.isFinite(num) ? num : fallback;
};

/** 分隔条拖动：返回 window 级拖拽监听（松手自动清理）。 */
const startResize = (
  e: ReactPointerEvent<HTMLElement>,
  onDelta: (dx: number, dy: number) => void,
): void => {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const move = (ev: PointerEvent) => onDelta(ev.clientX - startX, ev.clientY - startY);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
};

export const App = () => {
  const playing = useEditor((s) => s.playing);
  const aiPanel = useEditor((s) => s.aiPanel);

  // 面板尺寸（可拖动分隔条调整，持久化；下时间轴高度自适应行数，不在此列）
  const [aiWidth, setAiWidth] = useState(() =>
    persisted("vs.editor.aiWidth", 300),
  );
  const [tracksWidth, setTracksWidth] = useState(() =>
    persisted("vs.editor.tracksWidth", 410),
  );

  useEffect(() => {
    window.localStorage.setItem("vs.editor.aiWidth", String(aiWidth));
  }, [aiWidth]);
  useEffect(() => {
    window.localStorage.setItem("vs.editor.tracksWidth", String(tracksWidth));
  }, [tracksWidth]);

  // 启动时自动加载默认工作区
  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((list: string[]) => {
        if (useEditor.getState().ir) return;
        const ws = list.includes("leaves") ? "leaves" : list[0];
        if (ws) void useEditor.getState().loadWorkspace(ws);
      })
      .catch(() => {});
  }, []);

  // 播放循环：rAF 推进帧 + 音轨同步
  useEffect(() => {
    if (!playing) {
      stopAllAudio();
      return;
    }
    let raf = 0;
    let last = performance.now();
    let position = useEditor.getState().currentFrame;

    const tick = (now: number) => {
      const state = useEditor.getState();
      if (!state.playing || !state.ir) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      position += dt * state.ir.fps;
      if (position >= state.ir.totalFrames - 1) {
        state.setFrame(state.ir.totalFrames - 1);
        state.setPlaying(false);
        return;
      }
      state.setFrame(position);
      if (state.ir) syncAudio(state.ir, Math.floor(position), true);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      stopAllAudio();
    };
  }, [playing]);

  // 空格 播放/暂停；Delete 删除选中元素/关键帧
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        const state = useEditor.getState();
        const next = !state.playing;
        state.setPlaying(next);
        if (next && state.ir) syncAudio(state.ir, state.currentFrame, true);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const state = useEditor.getState();
        if (state.selectedId) {
          e.preventDefault();
          state.removeSelected();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="app">
      <AssetBar />
      <div className="mid-row">
        <div className="mid-left">
          <Canvas />
        </div>

        {aiPanel && (
          <>
            <div
              className="h-splitter"
              title="拖动调整 AI 面板宽度"
              onPointerDown={(e) => {
                const startW = aiWidth;
                startResize(e, (dx) =>
                  setAiWidth(clamp(startW - dx, 240, 480)),
                );
              }}
            />
            <div className="pane" style={{ width: aiWidth }}>
              {aiPanel === "asset" ? (
                <AssetGenPanel />
              ) : aiPanel === "library" ? (
                <LibraryPanel />
              ) : (
                <AiPanel />
              )}
            </div>
          </>
        )}

        <div
          className="h-splitter"
          title="拖动调整轨道面板宽度"
          onPointerDown={(e) => {
            const startW = tracksWidth;
            startResize(e, (dx) =>
              setTracksWidth(clamp(startW - dx, 260, 680)),
            );
          }}
        />
        <div className="pane" style={{ width: tracksWidth }}>
          <TrackPanel />
        </div>
      </div>

      <Timeline />

      <PropertyPanel />
    </div>
  );
};
