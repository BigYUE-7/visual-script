import { getProvider } from "../config";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatJsonOptions = {
  provider: string;
  /** 不传时取 provider 配置的第一个模型 */
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  /** 网络/限流重试次数（默认 2） */
  maxRetries?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * OpenAI 兼容协议的调用（DeepSeek / DashScope 兼容模式等）。
 * jsonMode = true 时要求 JSON 输出（导演稿等结构化产物）；
 * jsonMode = false 时返回原始文本（SVG 代码生成等）。
 */
async function chat(
  options: ChatJsonOptions & { jsonMode: boolean },
): Promise<string> {
  const { apiKey, baseURL, models } = getProvider(options.provider);
  const base = (baseURL ?? "https://api.deepseek.com").replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const model =
    options.model ?? models?.[0] ?? (options.provider === "deepseek" ? "deepseek-chat" : "");

  if (!model) {
    throw new Error(`provider「${options.provider}」未配置模型名，请用 --model 指定`);
  }

  const maxRetries = options.maxRetries ?? 2;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      await sleep(1500 * attempt);
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          ...(options.jsonMode
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
        signal: AbortSignal.timeout(180_000),
      });

      if (!response.ok) {
        const body = (await response.text()).slice(0, 500);
        const err = new Error(`LLM 调用失败：HTTP ${response.status} ${body}`);
        if (response.status === 429 || response.status >= 500) {
          lastError = err;
          continue;
        }
        throw err;
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim() === "") {
        throw new Error("LLM 返回内容为空");
      }
      return content;
    } catch (err) {
      lastError = err as Error;
      const isNetwork =
        (err as Error).name === "TimeoutError" ||
        (err as Error).name === "AbortError" ||
        (err as Error).message.includes("fetch failed");
      if (!isNetwork || attempt === maxRetries) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error("LLM 调用失败");
}

/** JSON 模式调用：输出应为 JSON 文本（结构化产物）。 */
export async function chatJson(options: ChatJsonOptions): Promise<string> {
  return chat({ ...options, jsonMode: true });
}

/** 文本模式调用：返回原始文本（代码 / SVG 等）。 */
export async function chatText(options: ChatJsonOptions): Promise<string> {
  return chat({ ...options, jsonMode: false });
}

/** 去掉可能的 markdown 代码围栏，提取 JSON 文本。 */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  if (fence) return fence[1];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}
