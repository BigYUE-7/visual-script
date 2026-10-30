import { makeArrow, makeHeart, makeStar, makeTriangle } from "@remotion/shapes";
import type { CSSProperties } from "react";
import { staticFile } from "remotion";
import { FONT_FAMILY } from "../asset/font-constants";
import type { Asset, SceneObject } from "../schema/animation-ir";
import { interpolateTransform } from "./interpolate";

type Props = {
  object: SceneObject;
  asset: Asset;
  /** 相对对象出场帧的局部帧号 */
  localFrame: number;
};

export const IrObject: React.FC<Props> = ({ object, asset, localFrame }) => {
  const transform = interpolateTransform(
    object.initial,
    object.keyframes,
    localFrame,
  );

  const base: CSSProperties = {
    position: "absolute",
    left: transform.x,
    top: transform.y,
    width: asset.bounds.width,
    height: asset.bounds.height,
    transform: `translate(-50%, -50%) scale(${transform.scale}) rotate(${transform.rotation}deg)`,
    opacity: transform.opacity,
  };

  return (
    <div style={base}>
      {asset.form === "text" ? (
        <TextView asset={asset} />
      ) : asset.form === "shape" ? (
        <ShapeView asset={asset} />
      ) : (
        <FileView asset={asset} />
      )}
    </div>
  );
};

/**
 * 文件型资产视图（emoji / 图片 / SVG 共用）：
 * 文件路径相对 public/，编辑器与渲染器同构。
 */
const FileView: React.FC<{
  asset: Extract<Asset, { form: "emoji" | "image" | "svg" }>;
}> = ({ asset }) => (
  <img
    src={staticFile(asset.file)}
    draggable={false}
    alt=""
    style={{
      width: "100%",
      height: "100%",
      objectFit: "contain",
      display: "block",
    }}
  />
);

const TextView: React.FC<{ asset: Extract<Asset, { form: "text" }> }> = ({
  asset,
}) => {
  const justify =
    asset.align === "left"
      ? "flex-start"
      : asset.align === "right"
        ? "flex-end"
        : "center";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: justify,
        fontFamily: FONT_FAMILY,
        fontSize: asset.fontSize,
        fontWeight: asset.fontWeight,
        color: asset.color,
        lineHeight: `${asset.lineHeight}px`,
        textAlign: asset.align,
      }}
    >
      {asset.lines.map((line, index) => (
        <div key={index} style={{ whiteSpace: "pre" }}>
          {line === "" ? "\u00A0" : line}
        </div>
      ))}
    </div>
  );
};

type ShapeInfoLike = { path: string; width: number; height: number };

const SvgPath: React.FC<{ info: ShapeInfoLike; color: string }> = ({
  info,
  color,
}) => (
  <svg
    viewBox={`0 0 ${info.width} ${info.height}`}
    width="100%"
    height="100%"
    preserveAspectRatio="xMidYMid meet"
    style={{ display: "block" }}
  >
    <path d={info.path} fill={color} />
  </svg>
);

// 形状路径由 @remotion/shapes 的纯函数生成（编辑器与渲染器共用）
const ARROW_INFO = makeArrow({
  length: 200,
  headWidth: 80,
  headLength: 64,
  shaftWidth: 32,
  direction: "right",
});
const TRIANGLE_INFO = makeTriangle({ length: 100, direction: "up" });
const STAR_INFO = makeStar({ points: 5, innerRadius: 50, outerRadius: 100 });
const HEART_INFO = makeHeart({ height: 100 });

const ShapeView: React.FC<{ asset: Extract<Asset, { form: "shape" }> }> = ({
  asset,
}) => {
  if (asset.shape === "circle") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          backgroundColor: asset.color,
        }}
      />
    );
  }
  if (asset.shape === "arrow") {
    return <SvgPath info={ARROW_INFO} color={asset.color} />;
  }
  if (asset.shape === "triangle") {
    return <SvgPath info={TRIANGLE_INFO} color={asset.color} />;
  }
  if (asset.shape === "star") {
    return <SvgPath info={STAR_INFO} color={asset.color} />;
  }
  if (asset.shape === "heart") {
    return <SvgPath info={HEART_INFO} color={asset.color} />;
  }
  // rect / line：色块（line 由用户设置较小高度）
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: asset.color,
      }}
    />
  );
};
