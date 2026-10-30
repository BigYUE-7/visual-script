/**
 * 素材元数据生成提示（名称 / 介绍 / 标签）。
 * 第二步调用：输入已消毒的 SVG 与生成描述，输出 JSON，供素材库归档与 LLM 挑选。
 */

export function buildAssetMetaSystemPrompt(): string {
  return `你是素材库管理员。根据给定的 SVG 素材与生成描述，为它起一个中文名、写一句介绍、给出集合与标签。
只输出 JSON 对象（不要 markdown 围栏），结构：
{"name":"中文名（2-8 字）","description":"一句话介绍（15-40 字，说明它是什么、能表达什么概念）","collection":"集合名（2-6 字）","tags":["标签1","标签2"]}
要求：
1. name 简短好认，是名词短语（如"线粒体""能量齿轮"）；
2. description 面向导演挑选素材时快速理解用途（如"细胞的能量工厂，适合表达供能/转化"）；
3. collection 是它所属的素材集合（同类素材归到一起，如"生物细胞""科技图标""人物情感"；全库集合数尽量少）；
4. tags 2-4 个，中文短词，偏领域与类别（如"生物""细胞""图标""科技"）；
5. 全中文，不要客套话。`;
}

export function buildAssetMetaUserPrompt(svg: string, description: string): string {
  return `素材生成描述：${description}

SVG 源码：
${svg}`;
}
