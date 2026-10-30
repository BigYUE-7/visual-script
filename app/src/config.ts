import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = join(here, "..");
export const REPO_ROOT = join(APP_ROOT, "..");
const CONFIG_DIR = join(REPO_ROOT, "config");

export type ProviderConfig = {
  apiKey: string;
  baseURL?: string;
  models?: string[];
};

export type LlmApiConfig = {
  version: number;
  providers: Record<string, ProviderConfig>;
};

export type TtsConfig = {
  provider: "dashscope";
  /** 业务空间专属 WebSocket Endpoint */
  wsEndpoint: string;
  model: string;
  /** 克隆音色 id（VoiceEnrollmentService 生成） */
  voice: string;
  /** 合成音频格式，默认 mp3 */
  format?: "mp3" | "wav" | "pcm";
  sampleRate?: number;
};

function readJson(path: string, hint: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    throw new Error(`${hint}\n（读取失败：${path}，${(err as Error).message}）`);
  }
}

/** 读取 config/llm-api.json（密钥文件；运行时读取，绝不打印内容）。 */
export function loadLlmApiConfig(): LlmApiConfig {
  const path = join(CONFIG_DIR, "llm-api.json");
  const parsed = readJson(
    path,
    "未找到 LLM 密钥配置。请运行：powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 add deepseek",
  ) as LlmApiConfig;
  if (!parsed || typeof parsed !== "object" || !parsed.providers) {
    throw new Error(`LLM 密钥配置格式不正确：${path}`);
  }
  return parsed;
}

/** 取某个 provider 的配置（支持环境变量覆盖，便于不落盘的小规模实验）。 */
export function getProvider(name: string): ProviderConfig {
  const envKey =
    name === "dashscope"
      ? process.env.DASHSCOPE_API_KEY
      : name === "deepseek"
        ? process.env.DEEPSEEK_API_KEY
        : undefined;

  let fromFile: ProviderConfig | undefined;
  try {
    fromFile = loadLlmApiConfig().providers[name];
  } catch (err) {
    if (!envKey) throw err;
  }

  const apiKey = envKey ?? fromFile?.apiKey;
  if (!apiKey) {
    throw new Error(
      `未配置 provider「${name}」。请运行：powershell -ExecutionPolicy Bypass -File scripts/api-key.ps1 add ${name}`,
    );
  }
  return {
    apiKey,
    baseURL: fromFile?.baseURL,
    models: fromFile?.models,
  };
}

/** 读取 config/tts.json（非密钥；endpoint / model / voice）。 */
export function loadTtsConfig(): TtsConfig {
  const path = join(CONFIG_DIR, "tts.json");
  let parsed: TtsConfig;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as TtsConfig;
  } catch {
    throw new Error(
      `未找到 TTS 配置：${path}\n` +
        "请复制 config/tts.example.json 为 config/tts.json，并填入 wsEndpoint 与 voice。",
    );
  }
  if (!parsed.wsEndpoint || !parsed.model || !parsed.voice) {
    throw new Error(`TTS 配置缺少字段（wsEndpoint / model / voice）：${path}`);
  }
  return parsed;
}
