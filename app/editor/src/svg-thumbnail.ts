/**
 * 浏览器端把 SVG 渲染成小图 PNG（轻量缩略图）。
 * 素材经过消毒（无脚本/外链），可安全用于 Image + canvas。
 */

/** 渲染 128px 方形缩略图（contain，透明底），返回 PNG data URL。 */
export async function renderSvgThumbnail(
  svg: string,
  viewBox: { width: number; height: number },
  size = 128,
): Promise<string> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("SVG 缩略图渲染失败"));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建 canvas 2D 上下文");

  const scale = Math.min(size / viewBox.width, size / viewBox.height);
  const width = viewBox.width * scale;
  const height = viewBox.height * scale;
  ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
  return canvas.toDataURL("image/png");
}

/** 从 data URL 中取出纯 base64（供接口传输）。 */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
