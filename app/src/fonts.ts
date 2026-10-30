import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import { FONT_FAMILY, FONT_FILE_NAME } from "./asset/font-constants";

export { FONT_FAMILY };

/**
 * 内置字体加载（渲染端）。
 * loadFont 内部使用 delayRender，渲染器会等待字体就绪后才截图；
 * 变量字体一次加载覆盖 100–900 字重（v1 使用 400 / 500 / 700）。
 */
export const fontsReady: Promise<unknown> = loadFont({
  family: FONT_FAMILY,
  url: staticFile(`fonts/${FONT_FILE_NAME}`),
  weight: "100 900",
  style: "normal",
  display: "block",
});
