import {
  Composition,
  staticFile,
  type CalculateMetadataFunction,
} from "remotion";
import type { AnimationIR } from "../schema/animation-ir";
import { Video } from "./Video";

export type VideoCompositionProps = { ir: AnimationIR | null };

const FALLBACK = {
  durationInFrames: 300,
  fps: 30,
  width: 1920,
  height: 1080,
};

/**
 * 若未通过 inputProps 传入 IR，则尝试读取 public/workspaces/demo/ir.json
 * （便于 Remotion Studio 里直接预览最近一次编译结果）。
 */
const calculateMetadata: CalculateMetadataFunction<
  VideoCompositionProps
> = async ({ props }) => {
  if (!props.ir) {
    try {
      const response = await fetch(staticFile("workspaces/demo/ir.json"));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const ir = (await response.json()) as AnimationIR;
      return {
        durationInFrames: ir.totalFrames,
        fps: ir.fps,
        width: ir.width,
        height: ir.height,
        props: { ir },
      };
    } catch {
      console.warn(
        "[studio] 未找到 public/workspaces/demo/ir.json；先运行 npm run compile -- --workspace demo",
      );
      return { ...FALLBACK, props: { ir: null } };
    }
  }

  const ir = props.ir;
  return {
    durationInFrames: ir.totalFrames,
    fps: ir.fps,
    width: ir.width,
    height: ir.height,
    props: { ir },
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="VisualScript"
      component={Video}
      durationInFrames={FALLBACK.durationInFrames}
      fps={FALLBACK.fps}
      width={FALLBACK.width}
      height={FALLBACK.height}
      defaultProps={{ ir: null }}
      calculateMetadata={calculateMetadata}
    />
  );
};
