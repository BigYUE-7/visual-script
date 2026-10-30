import { useEffect, useMemo, useState } from "react";
import { svgToDataUrl } from "@app/asset/svg-asset";
import { findSimilarAssets } from "@app/lib/similar-assets";
import { useEditor } from "../store";

const parseTags = (raw: string): string[] =>
  raw
    .split(/[，,、;；]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);

/**
 * AI 素材面板：元素描述 → LLM 写 SVG + 元数据 → 预览 → 定尺寸 → 保存入库（可同时放画布）。
 * 生成前提示库中相似素材（不阻止生成新的）；生成阶段不落盘，点保存才写入 public/library/。
 */
export const AssetGenPanel = () => {
  const assetGen = useEditor((s) => s.assetGen);
  const library = useEditor((s) => s.library);
  const generateAsset = useEditor((s) => s.generateAsset);
  const saveGeneratedAsset = useEditor((s) => s.saveGeneratedAsset);
  const discardAsset = useEditor((s) => s.discardAsset);
  const setAiPanel = useEditor((s) => s.setAiPanel);
  const [description, setDescription] = useState("线粒体的扁平示意图");
  const [size, setSize] = useState(360);
  const [name, setName] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [collection, setCollection] = useState("");
  const [tagsText, setTagsText] = useState("");

  // 生成完成后同步 LLM 元数据（可在保存前修改）
  useEffect(() => {
    if (assetGen.svg) {
      setName(assetGen.name);
      setMetaDescription(assetGen.description);
      setCollection(assetGen.collection);
      setTagsText(assetGen.tags.join("，"));
    }
  }, [assetGen.svg]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = assetGen.svg && assetGen.viewBox;
  const canSave = !!preview && name.trim() !== "" && metaDescription.trim() !== "";

  // 相似素材提示（仅提示，不阻止生成新的）
  const similar = useMemo(
    () =>
      assetGen.running ? [] : findSimilarAssets(description, library, 3),
    [description, library, assetGen.running],
  );

  const save = (applyToCanvas: boolean) => {
    if (!canSave) return;
    void saveGeneratedAsset({
      size,
      name: name.trim(),
      description: metaDescription.trim(),
      collection: collection.trim() || "未分组",
      tags: parseTags(tagsText),
      applyToCanvas,
    });
  };

  return (
    <div className="panel ai-panel">
      <h3>AI 素材面板</h3>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="描述要生成的素材，例如：线粒体解剖示意图，扁平风格、无背景"
        disabled={assetGen.running}
      />

      {similar.length > 0 && (
        <div className="similar-hint">
          <span className="dim">
            库中已有相似素材（可直接使用，也可继续生成新的）：
          </span>
          <div className="similar-row">
            {similar.map((entry) => (
              <button
                key={entry.id}
                className="similar-chip"
                title={`${entry.name}：${entry.description}（点击打开素材库）`}
                onClick={() => setAiPanel("library")}
              >
                <img
                  src={`/${entry.thumbnail ?? entry.file}`}
                  alt={entry.name}
                  draggable={false}
                />
                <span>{entry.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        className="ai-btn"
        disabled={assetGen.running || description.trim() === ""}
        onClick={() => void generateAsset(description.trim())}
      >
        {assetGen.running ? "生成中…（10-60 秒）" : preview ? "重新生成" : "生成素材"}
      </button>

      {assetGen.error && <div className="err-line">✗ {assetGen.error}</div>}

      {preview && (
        <div className="asset-preview">
          <div className="asset-preview-canvas">
            <img src={svgToDataUrl(assetGen.svg!)} alt="素材预览" />
          </div>
          <div className="asset-meta">
            <label>
              名称
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：线粒体"
                maxLength={24}
              />
            </label>
            <label>
              介绍
              <input
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="一句话说明它是什么/能表达什么"
                maxLength={120}
              />
            </label>
            <label>
              集合
              <input
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                placeholder="如：生物细胞"
                maxLength={24}
              />
            </label>
            <label>
              标签
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="逗号分隔，如：生物，细胞"
              />
            </label>
            <label>
              默认宽度
              <input
                type="number"
                min={40}
                max={1200}
                step={20}
                value={size}
                onChange={(e) => setSize(Number(e.target.value) || 360)}
              />
              px
              {assetGen.viewBox && (
                <span className="dim">
                  （高{" "}
                  {Math.round(
                    size * (assetGen.viewBox.height / assetGen.viewBox.width),
                  )}
                  px）
                </span>
              )}
            </label>
          </div>
          <div className="asset-actions">
            <button className="ai-btn" disabled={!canSave} onClick={() => save(false)}>
              保存到素材库
            </button>
            <button
              className="tool-btn"
              disabled={!canSave}
              onClick={() => save(true)}
            >
              保存并放到画布
            </button>
            <button className="tool-btn" onClick={discardAsset}>
              丢弃
            </button>
          </div>
        </div>
      )}

      <div className="ai-hint">
        {preview
          ? "保存后进入素材库（勾选后导演稿生成时可被 LLM 引用）；「保存并放到画布」会同时按默认宽度加入当前画面。"
          : "生成无背景的矢量素材（SVG），适合图标、示意图形、简单插画；文字请用资产框单独添加。"}
      </div>
    </div>
  );
};
