import { randomUUID } from "node:crypto";
import WebSocket, { type RawData } from "ws";

export type DashscopeWord = {
  text: string;
  beginMs: number;
  endMs: number;
};

export type DashscopeSynthResult = {
  audio: Buffer;
  words: DashscopeWord[];
};

type SentenceState = {
  index: number;
  words: DashscopeWord[];
};

type DashscopeEvent = {
  header?: {
    event?: string;
    error_code?: string;
    error_message?: string;
  };
  payload?: {
    output?: {
      sentence?: {
        index?: number;
        type?: string;
        words?: {
          text?: string;
          begin_time?: number;
          end_time?: number;
        }[];
      };
    };
  };
};

/**
 * DashScope CosyVoice v2 协议（WebSocket）。
 * 报文结构镜像官方 Python SDK（tts_v2/SpeechSynthesizer）：
 *   run-task → task-started → continue-task(text) → finish-task
 *   音频走二进制帧；result-generated 里带逐字时间戳（word_timestamp_enabled）。
 */
export async function synthesizeWithDashscope(options: {
  apiKey: string;
  wsEndpoint: string;
  model: string;
  voice: string;
  text: string;
  format?: "mp3" | "wav" | "pcm";
  sampleRate?: number;
  timeoutMs?: number;
}): Promise<DashscopeSynthResult> {
  const taskId = randomUUID().replace(/-/g, "");
  const format = options.format ?? "mp3";
  const sampleRate = options.sampleRate ?? 22050;
  const timeoutMs = options.timeoutMs ?? 180_000;

  return new Promise<DashscopeSynthResult>((resolve, reject) => {
    const ws = new WebSocket(options.wsEndpoint, {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "user-agent": "visual-script/0.1 (+node)",
      },
    });

    const audioChunks: Buffer[] = [];
    const sentences = new Map<number, SentenceState>();
    let settled = false;

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // 忽略关闭异常
      }
      if (error) {
        reject(error);
        return;
      }
      const words = [...sentences.values()]
        .sort((a, b) => a.index - b.index)
        .flatMap((s) => s.words);
      resolve({ audio: Buffer.concat(audioChunks), words });
    };

    const timer = setTimeout(
      () => finish(new Error(`TTS 超时（${timeoutMs}ms 未完成）`)),
      timeoutMs,
    );

    const send = (payload: unknown): void => ws.send(JSON.stringify(payload));

    ws.on("open", () => {
      send({
        header: { action: "run-task", task_id: taskId, streaming: "duplex" },
        payload: {
          model: options.model,
          task_group: "audio",
          task: "tts",
          function: "SpeechSynthesizer",
          input: {},
          parameters: {
            voice: options.voice,
            volume: 50,
            text_type: "PlainText",
            sample_rate: sampleRate,
            rate: 1.0,
            format,
            pitch: 1.0,
            seed: 0,
            type: 0,
            word_timestamp_enabled: true,
            enable_ssml: true,
          },
        },
      });
    });

    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (settled) return;

      if (isBinary) {
        const chunk = Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.isBuffer(data)
            ? data
            : Buffer.from(data);
        audioChunks.push(chunk);
        return;
      }

      let event: DashscopeEvent;
      try {
        event = JSON.parse(data.toString("utf-8")) as DashscopeEvent;
      } catch {
        return;
      }

      const name = event.header?.event;
      if (name === "task-started") {
        send({
          header: { action: "continue-task", task_id: taskId, streaming: "duplex" },
          payload: {
            model: options.model,
            task_group: "audio",
            task: "tts",
            function: "SpeechSynthesizer",
            input: { text: options.text },
          },
        });
        send({
          header: { action: "finish-task", task_id: taskId, streaming: "duplex" },
          payload: { input: {} },
        });
        return;
      }

      if (name === "result-generated") {
        const sentence = event.payload?.output?.sentence;
        const rawWords = sentence?.words;
        if (sentence && typeof sentence.index === "number" && rawWords && rawWords.length > 0) {
          const words = rawWords.map((w) => ({
            text: w.text ?? "",
            beginMs: w.begin_time ?? 0,
            endMs: w.end_time ?? 0,
          }));
          const prev = sentences.get(sentence.index);
          if (!prev || prev.words.length < words.length) {
            sentences.set(sentence.index, { index: sentence.index, words });
          }
        }
        return;
      }

      if (name === "task-finished") {
        finish();
        return;
      }

      if (name === "task-failed") {
        const code = event.header?.error_code ?? "unknown";
        const message = event.header?.error_message ?? "无错误详情";
        finish(new Error(`TTS 任务失败：${code} ${message}`));
      }
    });

    ws.on("error", (err) => finish(err instanceof Error ? err : new Error(String(err))));
    ws.on("close", () => {
      if (!settled) finish(new Error("WebSocket 在任务完成前关闭"));
    });
  });
}
