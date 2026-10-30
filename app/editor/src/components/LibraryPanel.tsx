import { useEffect, useState } from "react";
import type { LibraryAsset } from "@app/schema/library";
import { useEditor } from "../store";

const parseTags = (raw: string): string[] =>
  raw
    .split(/[，,、;；]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);

/**
 * 素材库面板（缩略图网格，按集合分组）：
 * - 集合头勾选 = 整组"允许生成使用"；卡片勾选 = 单个；
 * - 缩略图轻量预览；
 * - 更换素材模式（libraryPick）：点击缩略图替换选中对象，保持在画布/轨道同一页面。
 */
export const LibraryPanel = () => {
  const library = useEditor((s) => s.library);
  const enabledAssetIds = useEditor((s) => s.enabledAssetIds);
  const libraryPick = useEditor((s) => s.libraryPick);
  const loadLibrary = useEditor((s) => s.loadLibrary);
  const toggleAssetEnabled = useEditor((s) => s.toggleAssetEnabled);
  const toggleCollectionEnabled = useEditor((s) => s.toggleCollectionEnabled);
  const updateLibraryAsset = useEditor((s) => s.updateLibraryAsset);
  const deleteLibraryAsset = useEditor((s) => s.deleteLibraryAsset);
  const addLibraryAssetToCanvas = useEditor((s) => s.addLibraryAssetToCanvas);
  const replaceObjectAsset = useEditor((s) => s.replaceObjectAsset);
  const cancelLibraryPick = useEditor((s) => s.cancelLibraryPick);
  const backfillThumbnails = useEditor((s) => s.backfillThumbnails);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    collection: "",
    tags: "",
  });

  useEffect(() => {
    void (async () => {
      await loadLibrary();
      void backfillThumbnails();
    })();
  }, [loadLibrary, backfillThumbnails]);

  const isEnabled = (id: string) =>
    enabledAssetIds === null || enabledAssetIds.includes(id);

  const startEdit = (entry: LibraryAsset) => {
    setEditingId(entry.id);
    setDraft({
      name: entry.name,
      description: entry.description,
      collection: entry.collection,
      tags: entry.tags.join("，"),
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await updateLibraryAsset(editingId, {
      name: draft.name,
      description: draft.description,
      collection: draft.collection,
      tags: parseTags(draft.tags),
    });
    setEditingId(null);
  };

  const enabledCount =
    enabledAssetIds === null
      ? library.length
      : enabledAssetIds.filter((id) => library.some((a) => a.id === id)).length;

  // 按集合分组（保持库内顺序）
  const groups = new Map<string, LibraryAsset[]>();
  for (const entry of library) {
    const key = entry.collection || "未分组";
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  return (
    <div className="panel ai-panel">
      <h3>素材库</h3>

      {libraryPick && (
        <div className="lib-pick-banner">
          <span>
            正在为 <b>{libraryPick.objectId}</b> 选择素材：点击缩略图即可替换
          </span>
          <button className="tool-btn" onClick={cancelLibraryPick}>
            取消
          </button>
        </div>
      )}

      <div className="lib-toolbar">
        <span className="dim">
          {library.length === 0
            ? "暂无素材"
            : `生成可用：${enabledCount}/${library.length}`}
        </span>
        <button className="tool-btn" onClick={() => void loadLibrary()}>
          刷新
        </button>
      </div>

      {library.length === 0 && (
        <div className="dim">
          暂无素材。用「AI 生成 ▼ → AI 素材生成」生成第一个 SVG
          素材；保存后即可在此勾选并供导演稿引用。
        </div>
      )}

      <div className="lib-groups">
        {[...groups.entries()].map(([collection, entries]) => {
          const onCount = entries.filter((e) => isEnabled(e.id)).length;
          const allOn = onCount === entries.length;
          const noneOn = onCount === 0;
          return (
            <div className="lib-group" key={collection}>
              <div className="lib-group-head">
                <label title="整组勾选/取消：允许导演稿生成时引用">
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => {
                      if (el) el.indeterminate = !allOn && !noneOn;
                    }}
                    onChange={() => toggleCollectionEnabled(collection)}
                  />
                  <span className="lib-group-name">{collection}</span>
                </label>
                <span className="dim">
                  {onCount}/{entries.length}
                </span>
              </div>

              <div className="lib-grid">
                {entries.map((entry) =>
                  editingId === entry.id ? (
                    <div className="lib-edit" key={entry.id}>
                      <input
                        value={draft.name}
                        onChange={(e) =>
                          setDraft({ ...draft, name: e.target.value })
                        }
                        placeholder="名称"
                        maxLength={24}
                      />
                      <input
                        value={draft.description}
                        onChange={(e) =>
                          setDraft({ ...draft, description: e.target.value })
                        }
                        placeholder="介绍"
                        maxLength={120}
                      />
                      <input
                        value={draft.collection}
                        onChange={(e) =>
                          setDraft({ ...draft, collection: e.target.value })
                        }
                        placeholder="集合（如：生物细胞）"
                        maxLength={24}
                      />
                      <input
                        value={draft.tags}
                        onChange={(e) =>
                          setDraft({ ...draft, tags: e.target.value })
                        }
                        placeholder="标签（逗号分隔）"
                      />
                      <div className="lib-actions">
                        <button
                          className="lib-mini"
                          onClick={() => void saveEdit()}
                        >
                          保存
                        </button>
                        <button
                          className="lib-mini"
                          onClick={() => setEditingId(null)}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={
                        "lib-card" + (libraryPick ? " picking" : "")
                      }
                      key={entry.id}
                    >
                      <label
                        className="lib-check"
                        title={
                          isEnabled(entry.id)
                            ? "生成时可用（点击停用）"
                            : "生成时停用（点击启用）"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isEnabled(entry.id)}
                          onChange={() => toggleAssetEnabled(entry.id)}
                        />
                      </label>
                      <button
                        className="lib-thumb-btn"
                        title={
                          libraryPick
                            ? `用「${entry.name}」替换当前对象`
                            : entry.description
                        }
                        onClick={() => {
                          if (libraryPick) {
                            replaceObjectAsset(libraryPick.objectId, entry);
                          }
                        }}
                      >
                        <img
                          src={`/${entry.thumbnail ?? entry.file}`}
                          alt={entry.name}
                          loading="lazy"
                          draggable={false}
                        />
                      </button>
                      <div className="lib-name" title={`${entry.id} · ${entry.name}`}>
                        {entry.name}
                      </div>
                      <div className="lib-desc" title={entry.description}>
                        {entry.description}
                      </div>
                      {!libraryPick && (
                        <div className="lib-actions">
                          <button
                            className="lib-mini"
                            onClick={() => addLibraryAssetToCanvas(entry)}
                            title="按默认宽度加到画布（播放头处）"
                          >
                            ＋画布
                          </button>
                          <button
                            className="lib-mini"
                            onClick={() => startEdit(entry)}
                          >
                            编辑
                          </button>
                          <button
                            className="lib-mini danger"
                            onClick={() => {
                              if (window.confirm(`删除素材「${entry.name}」？`)) {
                                void deleteLibraryAsset(entry.id);
                              }
                            }}
                          >
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="ai-hint">
        集合头勾选 = 整组可用；卡片勾选 = 单个；默认全选。点缩略图
        {libraryPick ? "替换当前选中对象的素材（时间与关键帧保留）" : "查看介绍（用「＋画布」放入画面）"}。
      </div>
    </div>
  );
};
