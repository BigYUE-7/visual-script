import { useEffect, useState } from "react";
import { EMOJI_FILES } from "@app/asset/emoji";
import type { EmojiId } from "@app/schema/common";
import { useEditor } from "../store";

const SHAPE_BUTTONS = [
  { shape: "circle", label: "圆", color: "#2563EB", width: 220, height: 220 },
  { shape: "rect", label: "矩形", color: "#1F2937", width: 280, height: 200 },
  { shape: "triangle", label: "三角", color: "#1F2937", width: 260, height: 230 },
  { shape: "star", label: "星形", color: "#D97706", width: 260, height: 260 },
  { shape: "heart", label: "心形", color: "#E11D48", width: 240, height: 220 },
  { shape: "arrow", label: "箭头", color: "#D97706", width: 340, height: 120 },
] as const;

const EMOJI_IDS = Object.keys(EMOJI_FILES) as EmojiId[];

export const AssetBar = () => {
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const workspace = useEditor((s) => s.workspace);
  const dirty = useEditor((s) => s.dirty);
  const aiPanel = useEditor((s) => s.aiPanel);
  const loadWorkspace = useEditor((s) => s.loadWorkspace);
  const reload = useEditor((s) => s.reload);
  const save = useEditor((s) => s.save);
  const addElement = useEditor((s) => s.addElement);
  const setAiPanel = useEditor((s) => s.setAiPanel);

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((list: string[]) => setWorkspaces(list))
      .catch(() => setWorkspaces([]));
  }, []);

  return (
    <div className="panel asset-bar">
      <span className="label">资产框</span>
      <button
        className={"ai-toggle" + (aiPanel === "library" ? " on" : "")}
        onClick={() => setAiPanel("library")}
        title="素材库：预览 / 勾选生成可用 / 管理"
      >
        素材库
      </button>
      <button
        className="mat"
        title="在播放头添加文字"
        onClick={() =>
          addElement({ kind: "text", preset: "body", text: "示例文字" })
        }
      >
        文字
      </button>
      <button
        className="mat"
        title="在播放头添加关键词"
        onClick={() =>
          addElement({ kind: "text", preset: "keyword", text: "关键词" })
        }
      >
        关键词
      </button>
      <details className="emoji-menu">
        <summary className="mat" title="在播放头添加内置表情（Twemoji）">
          表情
        </summary>
        <div className="emoji-grid">
          {EMOJI_IDS.map((emojiId) => (
            <button
              key={emojiId}
              className="emoji-chip"
              title={EMOJI_FILES[emojiId].label}
              onClick={() => addElement({ kind: "emoji", emoji: emojiId })}
            >
              <img
                src={`/${EMOJI_FILES[emojiId].file}`}
                alt={EMOJI_FILES[emojiId].label}
                draggable={false}
              />
            </button>
          ))}
        </div>
      </details>
      {SHAPE_BUTTONS.map((b) => (
        <button
          key={b.shape}
          className="mat"
          title={`在播放头添加${b.label}`}
          onClick={() =>
            addElement({
              kind: "shape",
              shape: b.shape,
              color: b.color,
              width: b.width,
              height: b.height,
            })
          }
        >
          {b.label}
        </button>
      ))}
      <span className="spacer" />
      <select
        value={workspace}
        onChange={(e) => void loadWorkspace(e.target.value)}
        title="切换工作区"
      >
        {!workspaces.includes(workspace) && (
          <option value={workspace}>{workspace}</option>
        )}
        {workspaces.map((ws) => (
          <option key={ws} value={ws}>
            {ws}
          </option>
        ))}
      </select>
      <button className="lib" onClick={() => void reload()}>
        重新加载
      </button>
      <button
        className={"lib" + (dirty ? " dirty" : "")}
        onClick={() => void save()}
      >
        保存{dirty ? " *" : ""}
      </button>
      <details className="ai-menu">
        <summary className={"ai-toggle" + (aiPanel ? " on" : "")}>
          AI 生成 ▼
        </summary>
        <div className="ai-menu-list">
          <button
            className={"ai-menu-item" + (aiPanel === "script" ? " on" : "")}
            onClick={(e) => {
              setAiPanel("script");
              e.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            AI 脚本生成
          </button>
          <button
            className={"ai-menu-item" + (aiPanel === "asset" ? " on" : "")}
            onClick={(e) => {
              setAiPanel("asset");
              e.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            AI 素材生成
          </button>
        </div>
      </details>
    </div>
  );
};
