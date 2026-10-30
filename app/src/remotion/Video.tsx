import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { FONT_FAMILY } from "../asset/font-constants";
import type { Asset, SceneObject, SubtitleCue } from "../schema/animation-ir";
import type { AnimationIR } from "../schema/animation-ir";
import {
  BACKGROUND_COLOR,
  COLOR_TOKENS,
  SUBTITLE_BOTTOM_MARGIN,
} from "../theme/tokens";
import { IrObject } from "./IrObject";
import "../fonts";

const ObjectLayer: React.FC<{ object: SceneObject; asset: Asset }> = ({
  object,
  asset,
}) => {
  const localFrame = useCurrentFrame();
  return <IrObject object={object} asset={asset} localFrame={localFrame} />;
};

/** 整句字幕层：底部居中，逐行摆放（分行由编译期给出）。 */
const SubtitleLayer: React.FC<{ cue: SubtitleCue }> = ({ cue }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: SUBTITLE_BOTTOM_MARGIN,
      display: "flex",
      justifyContent: "center",
    }}
  >
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontSize: cue.fontSize,
        fontWeight: cue.fontWeight,
        lineHeight: `${cue.lineHeight}px`,
        color: COLOR_TOKENS.subtitle,
        textAlign: "center",
        whiteSpace: "pre",
      }}
    >
      {cue.lines.map((line, index) => (
        <div key={index}>{line === "" ? "\u00A0" : line}</div>
      ))}
    </div>
  </div>
);

export const Video: React.FC<{ ir: AnimationIR | null }> = ({ ir }) => {
  if (!ir) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: BACKGROUND_COLOR,
          color: "#9CA3AF",
          justifyContent: "center",
          alignItems: "center",
          fontSize: 42,
          fontFamily: "sans-serif",
        }}
      >
        请在 Props 面板粘贴 Animation IR JSON，或先运行 npm run compile
      </AbsoluteFill>
    );
  }

  const assetById = new Map<string, Asset>(ir.assets.map((a) => [a.id, a]));

  return (
    <AbsoluteFill style={{ backgroundColor: BACKGROUND_COLOR }}>
      {ir.objects.map((object) => {
        const asset = assetById.get(object.asset);
        if (!asset) return null;
        return (
          <Sequence
            key={object.id}
            from={object.from}
            durationInFrames={object.durationInFrames}
          >
            <ObjectLayer object={object} asset={asset} />
          </Sequence>
        );
      })}
      {ir.subtitles.map((cue) => (
        <Sequence
          key={`sub-${cue.narrationId}`}
          from={cue.fromFrame}
          durationInFrames={cue.durationInFrames}
        >
          <SubtitleLayer cue={cue} />
        </Sequence>
      ))}
      {ir.audio.map((segment, index) => (
        <Sequence
          key={`${segment.file}-${index}`}
          from={segment.fromFrame}
          durationInFrames={segment.durationInFrames}
        >
          <Audio src={staticFile(segment.file)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
