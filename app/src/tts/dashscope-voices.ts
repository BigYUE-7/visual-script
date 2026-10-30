import { getProvider, loadTtsConfig } from "../config";

export type VoiceInfo = {
  voice_id?: string;
  status?: string;
  gmt_create?: string;
  gmt_modified?: string;
  [key: string]: unknown;
};

/** 由 wsEndpoint 推出 HTTP API 地址（业务空间专属域名 + /api/v1）。 */
export function enrollmentUrl(wsEndpoint: string): string {
  const httpBase = wsEndpoint
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://")
    .replace(/\/api-ws\/v1\/inference\/?$/, "/api/v1");
  return `${httpBase}/services/audio/tts/customization`;
}

async function callEnrollment(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const tts = loadTtsConfig();
  const { apiKey } = getProvider("dashscope");

  const response = await fetch(enrollmentUrl(tts.wsEndpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "voice-enrollment", input }),
    signal: AbortSignal.timeout(60_000),
  });

  const json = (await response.json()) as {
    code?: string;
    message?: string;
    output?: Record<string, unknown>;
  };

  if (!response.ok || (json.code !== undefined && json.code !== "")) {
    throw new Error(
      `音色服务调用失败：HTTP ${response.status} ${json.code ?? ""} ${json.message ?? ""}`,
    );
  }
  return json;
}

/** 列出已克隆音色（找回 voice id 用）。 */
export async function listVoices(prefix?: string): Promise<VoiceInfo[]> {
  const json = await callEnrollment({
    action: "list_voice",
    ...(prefix ? { prefix } : {}),
    page_index: 0,
    page_size: 100,
  });
  const output = json.output as { voice_list?: unknown } | undefined;
  const list = output?.voice_list;
  return Array.isArray(list) ? (list as VoiceInfo[]) : [];
}
