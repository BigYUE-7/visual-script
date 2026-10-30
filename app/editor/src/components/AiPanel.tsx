import { useState } from "react";
import { useEditor } from "../store";

/**
 * AI 脚本面板（LLM 对话窗口）：
 * 输入主题 → 服务端跑「导演稿 → 语音 → 编译」→ 流式日志 → 自动刷新画布与音轨。
 */
export const AiPanel = () => {
  const open = useEditor((s) => s.aiPanel === "script");
  const generation = useEditor((s) => s.generation);
  const generate = useEditor((s) => s.generate);
  const library = useEditor((s) => s.library);
  const enabledAssetIds = useEditor((s) => s.enabledAssetIds);
  const [topic, setTopic] = useState("为什么天空是蓝色的");

  if (!open) return null;

  const enabledCount =
    enabledAssetIds === null
      ? library.length
      : enabledAssetIds.filter((id) => library.some((a) => a.id === id)).length;

  return (
    <div className="panel ai-panel">
      <h3>AI 脚本面板</h3>
      <textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="输入主题或口播文案，例如：为什么树叶秋天会变黄"
        disabled={generation.running}
      />
      <button
        className="ai-btn"
        disabled={generation.running || topic.trim() === ""}
        onClick={() => void generate(topic.trim())}
      >
        {generation.running ? "生成中…（1-3 分钟）" : "生成动画"}
      </button>
      <div className="ai-out">
        {generation.logs.length === 0 && (
          <div className="dim">
            输入主题后点击「生成动画」。
            {"\n"}流水线：LLM 导演稿 → CosyVoice 语音 → 时间编译 → 画布与音轨自动就绪。
          </div>
        )}
        {generation.logs.map((line, index) => (
          <div
            key={index}
            className={
              line.startsWith(">")
                ? "user-line"
                : line.startsWith("✓")
                  ? "ok-line"
                  : ""
            }
          >
            {line}
          </div>
        ))}
        {generation.error && <div className="err-line">✗ {generation.error}</div>}
      </div>
      <div className="ai-hint">
        生成完成后可直接在画布/轨道上微调，点「保存」写回 ir.json
        {library.length > 0
          ? ` · 素材库：${enabledCount}/${library.length} 个可用（在「素材库」中勾选）`
          : ""}
      </div>
    </div>
  );
};
