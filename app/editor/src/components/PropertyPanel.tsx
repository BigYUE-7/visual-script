import { useEffect, useState } from "react";
import { interpolateTransform } from "@app/remotion/interpolate";
import type { PartialTransform } from "@app/schema/animation-ir";
import { useEditor, type EffectId } from "../store";

const PROP_LABEL: Record<string, string> = {
  x: "x",
  y: "y",
  scale: "缩放",
  rotation: "旋转",
  opacity: "透明度",
};

const EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out"] as const;

/** 文字内容编辑：提交时在浏览器端重新测量（预览与出片一致）。 */
const TextContentField = ({ id, text }: { id: string; text: string }) => {
  const updateAssetText = useEditor((s) => s.updateAssetText);
  const [value, setValue] = useState(text);

  useEffect(() => {
    setValue(text);
  }, [text]);

  const commit = () => {
    if (value.trim() && value !== text) {
      void updateAssetText(id, value);
    }
  };

  return (
    <div className="text-edit-row">
      <label htmlFor={`text-${id}`}>文字内容</label>
      <textarea
        id={`text-${id}`}
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
      <span className="p-hint">Enter 提交 · Shift+Enter 换行 · 回车后自动重新测量</span>
    </div>
  );
};

type EffectItem = { id: EffectId; label: string; title: string };

const ANIM_EFFECTS: EffectItem[] = [
  { id: "emphasize", label: "放大强调", title: "放大到 1.3 倍再回到原样（800ms）" },
  { id: "bounce", label: "弹跳", title: "上下弹跳一次（1200ms）" },
  { id: "shake", label: "摇晃", title: "左右快速摇晃（600ms）" },
  { id: "wiggle", label: "摆动", title: "左右摆动（900ms）" },
  { id: "float", label: "漂浮", title: "上下漂浮（1500ms）" },
];

const TRANSITION_EFFECTS: EffectItem[] = [
  { id: "enter_fade", label: "淡入", title: "从播放头处淡入（300ms）" },
  { id: "enter_pop", label: "弹出", title: "从播放头处弹出（400ms）" },
  { id: "enter_slide_up", label: "滑入↑", title: "从下方滑入（400ms）" },
  { id: "exit_fade", label: "淡出", title: "从播放头处开始淡出（300ms）" },
  { id: "exit_shrink", label: "缩小消失", title: "缩小并淡出（300ms）" },
];

const EffectLibrary = ({ enabled }: { enabled: boolean }) => {
  const applyEffect = useEditor((s) => s.applyEffect);
  const addPoseKeyframeAtPlayhead = useEditor(
    (s) => s.addPoseKeyframeAtPlayhead,
  );

  const chips = (items: EffectItem[]) =>
    items.map((item) => (
      <button
        key={item.id}
        className="fx-chip"
        disabled={!enabled}
        title={enabled ? item.title : "先选中一个元素"}
        onClick={() => applyEffect(item.id)}
      >
        {item.label}
      </button>
    ));

  return (
    <div className="pp-block pp-right">
      <h3>
        可添加的效果
        <span className="fx-hint">作用于选中元素 · 从播放头开始</span>
      </h3>
      <div className="fx-row">
        <span className="fx-label">动画</span>
        {chips(ANIM_EFFECTS)}
      </div>
      <div className="fx-row">
        <span className="fx-label">过渡</span>
        {chips(TRANSITION_EFFECTS)}
      </div>
      <div className="fx-row">
        <span className="fx-label">关键帧</span>
        <button
          className="fx-chip"
          disabled={!enabled}
          title={enabled ? "在播放头为选中元素打一个完整姿态关键帧" : "先选中一个元素"}
          onClick={addPoseKeyframeAtPlayhead}
        >
          ＋姿态关键帧
        </button>
        <span className="fx-note">
          预设会按默认时长生成关键帧，可在轨道子轨道中继续拖动微调
        </span>
      </div>
    </div>
  );
};

export const PropertyPanel = () => {
  const ir = useEditor((s) => s.ir);
  const currentFrame = useEditor((s) => s.currentFrame);
  const selectedId = useEditor((s) => s.selectedId);
  const selectedKeyframe = useEditor((s) => s.selectedKeyframe);
  const updateSelectedTransform = useEditor((s) => s.updateSelectedTransform);
  const updateObject = useEditor((s) => s.updateObject);
  const removeKeyframeAt = useEditor((s) => s.removeKeyframeAt);
  const removeSelected = useEditor((s) => s.removeSelected);
  const startLibraryPick = useEditor((s) => s.startLibraryPick);
  const removeKeyframeProperty = useEditor((s) => s.removeKeyframeProperty);
  const setKeyframeValueAt = useEditor((s) => s.setKeyframeValueAt);
  const setKeyframeEasingAt = useEditor((s) => s.setKeyframeEasingAt);

  // ---- 选中关键帧：左侧显示该帧参数 + 缓动 ----
  if (ir && selectedKeyframe) {
    const kfObject = ir.objects.find(
      (o) => o.id === selectedKeyframe.objectId,
    );
    const kf = kfObject?.keyframes.find(
      (k) => k.frame === selectedKeyframe.frame,
    );
    if (kfObject && kf) {
      const { property, frame } = selectedKeyframe;
      const globalFrame = kfObject.from + frame;
      const step = property === "scale" || property === "opacity" ? 0.01 : 1;
      return (
        <div className="panel property-panel">
          <div className="pp-block pp-left">
            <h3>属性面板</h3>
            <span className="cur-sel">
              关键帧：{kfObject.id} · 动画·{PROP_LABEL[property]} · 局部帧{" "}
              {frame}（全局 {globalFrame} /{" "}
              {(globalFrame / ir.fps).toFixed(2)}s）
            </span>
            <div className="p-grid">
              <label>
                {PROP_LABEL[property]} 值
                <input
                  type="number"
                  step={step}
                  value={Number((kf.transform[property] ?? 0).toFixed(3))}
                  onChange={(e) =>
                    setKeyframeValueAt(
                      kfObject.id,
                      frame,
                      property,
                      Number(e.target.value),
                    )
                  }
                />
              </label>
              <label>
                缓动（到下一帧）
                <select
                  value={kf.easing ?? "linear"}
                  onChange={(e) =>
                    setKeyframeEasingAt(
                      kfObject.id,
                      frame,
                      e.target.value as (typeof EASINGS)[number],
                    )
                  }
                >
                  {EASINGS.map((easing) => (
                    <option key={easing} value={easing}>
                      {easing}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="tool-btn danger"
                onClick={() =>
                  removeKeyframeProperty(kfObject.id, frame, property)
                }
              >
                删除此关键帧
              </button>
              <span className="p-hint">
                缓动作用于该帧到下一帧之间的插值 · 拖动 ◆ 可改变时间
              </span>
            </div>
          </div>
          <EffectLibrary enabled />
        </div>
      );
    }
  }

  const object = ir?.objects.find((o) => o.id === selectedId);
  const asset = ir?.assets.find((a) => a.id === selectedId);

  if (!ir || !object) {
    return (
      <div className="panel property-panel">
        <div className="pp-block pp-left">
          <h3>属性面板</h3>
          <span className="cur-sel">
            当前选中：无（在画布或轨道点击选中；改数值 = 在播放头自动打关键帧）
          </span>
        </div>
        <EffectLibrary enabled={false} />
      </div>
    );
  }

  const localFrame = Math.max(
    0,
    Math.min(currentFrame - object.from, object.durationInFrames - 1),
  );
  const transform = interpolateTransform(
    object.initial,
    object.keyframes,
    localFrame,
  );
  const hasKeyframeHere = object.keyframes.some((k) => k.frame === localFrame);

  const field = (
    label: string,
    key: "x" | "y" | "scale" | "rotation" | "opacity",
    step: number,
  ) => (
    <label key={key}>
      {label}
      <input
        type="number"
        step={step}
        value={Number(transform[key].toFixed(3))}
        onChange={(e) => {
          const patch: PartialTransform = {};
          patch[key] = Number(e.target.value);
          updateSelectedTransform(patch);
        }}
      />
    </label>
  );

  return (
    <div className="panel property-panel">
      <div className="pp-block pp-left">
        <h3>选中属性</h3>
        <span className="cur-sel">
          {object.id}
          {asset?.form === "text" ? ` · 文字「${asset.text.slice(0, 8)}」` : ""}
          {asset?.form === "shape" ? ` · 图形「${asset.shape}」` : ""}
          {asset?.form === "emoji" ? ` · 表情「${asset.emoji}」` : ""}
          {asset?.form === "image" ? ` · 图片「${asset.file}」` : ""}
          {asset?.form === "svg"
            ? ` · SVG「${asset.file.split("/").pop() ?? asset.file}」`
            : ""}{" "}
          · 局部帧{" "}
          {localFrame}/{object.durationInFrames - 1}
          {hasKeyframeHere ? " · 此帧有关键帧" : ""}
        </span>
        {asset?.form === "text" && (
          <TextContentField id={object.id} text={asset.text} />
        )}
        <div className="p-grid">
          <label>
            图层
            <input
              type="number"
              step={1}
              value={object.layer}
              onChange={(e) =>
                updateObject(object.id, (o) => ({
                  ...o,
                  layer: Number(e.target.value),
                }))
              }
            />
          </label>
          {field("x", "x", 1)}
          {field("y", "y", 1)}
          {field("缩放", "scale", 0.01)}
          {field("旋转", "rotation", 1)}
          {field("透明度", "opacity", 0.01)}
          <button
            className="tool-btn"
            disabled={!hasKeyframeHere}
            onClick={() => removeKeyframeAt(object.id, localFrame)}
          >
            删除此帧关键帧
          </button>
          {asset?.form === "svg" && (
            <button
              className="tool-btn"
              title="打开素材库，为当前对象更换素材（同页展开，时间/关键帧保留）"
              onClick={() => startLibraryPick(object.id)}
            >
              更换素材
            </button>
          )}
          <button className="tool-btn danger" onClick={removeSelected}>
            删除元素
          </button>
          <span className="p-hint">改数值/拖动画布 = 在播放头处打关键帧</span>
        </div>
      </div>
      <EffectLibrary enabled />
    </div>
  );
};
