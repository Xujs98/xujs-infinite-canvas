import axios from "axios";

import { buildApiUrl, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { nanoid } from "nanoid";
import { dataUrlToFile } from "@/lib/image-utils";
import { buildImageReferencePromptText } from "@/lib/image-reference-prompt";
import { imageToDataUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";

export type ChatCompletionMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

export type ResponseToolCall = {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
    thoughtSignature?: string;
};

export type ResponseInputMessage =
    | ChatCompletionMessage
    | { type: "function_call"; call_id: string; name: string; arguments: string; thoughtSignature?: string }
    | { role: "tool"; tool_call_id: string; content: string };

export type ResponseFunctionTool = {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>;
        strict?: boolean;
    };
};

export type ToolResponseResult = {
    content: string;
    toolCalls: ResponseToolCall[];
};

type ImageApiResponse = {
    data?: Array<Record<string, unknown>>;
    error?: { message?: string };
    code?: number;
    msg?: string;
};
type ApiEnvelope<T> = T | { code?: number; data?: T; msg?: string };

export type ImageGenerationTask = {
    id: string;
    type: "image";
    status: "running" | "succeeded" | "failed";
    model: string;
    resultImages?: string[];
    errorMsg?: string;
};

export type ImageGenerationTaskContext = { canvasId?: string; nodeId?: string };
export type ImageGenerationTaskState = { status: "pending"; progress?: number } | { status: "completed"; images: Array<{ id: string; dataUrl: string }> } | { status: "failed"; error: string };

const QUALITY_BASE: Record<string, number> = {
    low: 1024,
    medium: 2048,
    high: 2880,
    standard: 1024,
    hd: 2048,
};
const QUALITY_ALIASES: Record<string, string> = {
    "1k": "low",
    "2k": "medium",
    "4k": "high",
};
const DEFAULT_IMAGE_SHORT_SIDE = 1024;
const IMAGE_SIZE_STEP = 16;
const IMAGE_MIN_PIXELS = 655360;
const IMAGE_MAX_PIXELS = 8294400;
const IMAGE_MAX_EDGE = 3840;
const IMAGE_MAX_RATIO = 3;
const IMAGE_OUTPUT_FORMAT = "png";

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    const normalized = QUALITY_ALIASES[value] || value;
    return QUALITY_BASE[normalized] ? normalized : undefined;
}

/** Map "quality + ratio" to an explicit pixel dimension like "3840x2160". */
function resolveSize(quality: string | undefined, ratio: string): string {
    const parsedRatio = parseImageRatio(ratio);
    const basePixels = quality ? QUALITY_BASE[quality] : undefined;
    const isLandscape = parsedRatio.width >= parsedRatio.height;
    const longRatio = isLandscape ? parsedRatio.width / parsedRatio.height : parsedRatio.height / parsedRatio.width;
    let longSide: number;
    let shortSide: number;

    if (basePixels) {
        const targetPixels = basePixels * basePixels;
        const longSideRaw = Math.sqrt(targetPixels * longRatio);
        longSide = Math.floor(longSideRaw / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
        shortSide = Math.round(longSide / longRatio / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    } else {
        shortSide = DEFAULT_IMAGE_SHORT_SIDE;
        longSide = Math.round((shortSide * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    }

    const width = isLandscape ? longSide : shortSide;
    const height = isLandscape ? shortSide : longSide;
    validateImageSize(width, height);
    return `${width}x${height}`;
}

function parseImageRatio(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error("图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error("图像比例必须是正数，例如 9:16");
    if (Math.max(w, h) / Math.min(w, h) > IMAGE_MAX_RATIO) throw new Error("图像宽高比不能超过 3:1，请调整尺寸");
    return { width: w, height: h };
}

function parseImageDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

function validateImageSize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("图像尺寸必须是正整数，例如 1024x1024");
    if (width % IMAGE_SIZE_STEP !== 0 || height % IMAGE_SIZE_STEP !== 0) throw new Error("图像尺寸的宽高必须是 16 的倍数，请调整尺寸");
    if (Math.max(width, height) > IMAGE_MAX_EDGE) throw new Error("图像尺寸最长边不能超过 3840px，请调整尺寸");
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new Error("图像宽高比不能超过 3:1，请调整尺寸");
    const pixels = width * height;
    if (pixels < IMAGE_MIN_PIXELS || pixels > IMAGE_MAX_PIXELS) throw new Error("图像总像素需在 655360 到 8294400 之间，请调整尺寸");
}

function resolveRequestSize(quality: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const dimensions = parseImageDimensions(value);
    if (dimensions) {
        validateImageSize(dimensions.width, dimensions.height);
        return `${dimensions.width}x${dimensions.height}`;
    }
    if (value.includes(":")) return resolveSize(quality, value);
    throw new Error("图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
}

function resolveImageDataUrl(item: Record<string, unknown>) {
    if (typeof item.b64_json === "string" && item.b64_json) {
        return `data:image/png;base64,${item.b64_json}`;
    }
    if (typeof item.url === "string" && item.url) {
        return item.url;
    }
    return null;
}

function parseImagePayload(payload: ImageApiResponse) {
    if (typeof payload.code === "number" && payload.code !== 0) {
        throw new Error(payload.msg || "请求失败");
    }
    const images =
        payload.data
            ?.map(resolveImageDataUrl)
            .filter((value): value is string => Boolean(value))
            .map((dataUrl) => ({ id: nanoid(), dataUrl })) || [];

    if (images.length === 0) {
        throw new Error("接口没有返回图片");
    }

    return images;
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; code?: number }>(error)) {
        const responseData = error.response?.data;
        return responseData?.msg || responseData?.error?.message || readStatusError(error.response?.status, fallback);
    }
    return error instanceof Error ? error.message : fallback;
}

function readStatusError(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}：${status}` : fallback;
}

function parseStreamChunk(chunk: string, onDelta: (value: string) => void) {
    let deltaText = "";
    for (const eventBlock of chunk.split("\n\n")) {
        const data = eventBlock
            .split("\n")
            .find((line) => line.startsWith("data: "))
            ?.slice(6);
        if (!data || data === "[DONE]") continue;
        const delta = (JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content || "";
        deltaText += delta;
    }
    if (deltaText) onDelta(deltaText);
}

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function aiApiUrl(config: AiConfig, path: string) {
    return config.channelMode === "remote" ? `/api/v1${path}` : buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    const token = useUserStore.getState().token;
    return config.channelMode === "remote"
        ? {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(contentType ? { "Content-Type": contentType } : {}),
          }
        : {
              Authorization: `Bearer ${config.apiKey}`,
              ...(contentType ? { "Content-Type": contentType } : {}),
          };
}

function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode === "remote") void useUserStore.getState().hydrateUser();
}

function withSystemMessage(config: AiConfig, messages: ChatCompletionMessage[]) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
}

export async function requestGeneration(config: AiConfig, prompt: string) {
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const quality = normalizeQuality(config.quality);
    const requestSize = resolveRequestSize(quality, config.size);
    try {
        const response = await axios.post<ImageApiResponse>(
            aiApiUrl(config, "/images/generations"),
            {
                model: config.model,
                prompt: withSystemPrompt(config, prompt),
                n,
                ...(quality ? { quality } : {}),
                ...(requestSize ? { size: requestSize } : {}),
                response_format: "b64_json",
                output_format: IMAGE_OUTPUT_FORMAT,
            },
            {
                headers: aiHeaders(config, "application/json"),
            },
        );
        const images = parseImagePayload(response.data);
        refreshRemoteUser(config);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export async function createImageGenerationTask(config: AiConfig, prompt: string, context?: ImageGenerationTaskContext) {
    if (config.channelMode !== "remote") {
        throw new Error("当前配置不是服务端模式，图片刷新恢复需要使用服务端渠道");
    }
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const quality = normalizeQuality(config.quality);
    const requestSize = resolveRequestSize(quality, config.size);
    try {
        const response = await axios.post<ApiEnvelope<ImageGenerationTask>>(
            aiApiUrl(config, "/image-tasks/generations"),
            {
                model: config.model,
                prompt: withSystemPrompt(config, prompt),
                n,
                ...(quality ? { quality } : {}),
                ...(requestSize ? { size: requestSize } : {}),
                response_format: "b64_json",
                output_format: IMAGE_OUTPUT_FORMAT,
            },
            {
                headers: aiHeaders(config, "application/json"),
                params: imageTaskQueryParams(context),
            },
        );
        return unwrapApiEnvelope(response.data);
    } catch (error) {
        throw new Error(readAxiosError(error, "图片任务创建失败"));
    }
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], mask?: ReferenceImage) {
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const quality = normalizeQuality(config.quality);
    const requestSize = resolveRequestSize(quality, config.size);
    const requestPrompt = buildImageReferencePromptText(prompt, references);
    const formData = new FormData();
    formData.set("model", config.model);
    formData.set("prompt", withSystemPrompt(config, requestPrompt));
    formData.set("n", String(n));
    formData.set("response_format", "b64_json");
    formData.set("output_format", IMAGE_OUTPUT_FORMAT);
    if (quality) {
        formData.set("quality", quality);
    }
    if (requestSize) {
        formData.set("size", requestSize);
    }
    const files = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => formData.append("image", file));
    if (mask) formData.set("mask", dataUrlToFile(mask));

    try {
        const response = await axios.post<ImageApiResponse>(aiApiUrl(config, "/images/edits"), formData, { headers: aiHeaders(config) });
        const images = parseImagePayload(response.data);
        refreshRemoteUser(config);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export async function createImageEditTask(config: AiConfig, prompt: string, references: ReferenceImage[], context?: ImageGenerationTaskContext, mask?: ReferenceImage) {
    if (config.channelMode !== "remote") {
        throw new Error("当前配置不是服务端模式，图片刷新恢复需要使用服务端渠道");
    }
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const quality = normalizeQuality(config.quality);
    const requestSize = resolveRequestSize(quality, config.size);
    const requestPrompt = buildImageReferencePromptText(prompt, references);
    const formData = new FormData();
    formData.set("model", config.model);
    formData.set("prompt", withSystemPrompt(config, requestPrompt));
    formData.set("n", String(n));
    formData.set("response_format", "b64_json");
    formData.set("output_format", IMAGE_OUTPUT_FORMAT);
    if (quality) formData.set("quality", quality);
    if (requestSize) formData.set("size", requestSize);
    const files = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => formData.append("image", file));
    if (mask) formData.set("mask", dataUrlToFile(mask));

    try {
        const response = await axios.post<ApiEnvelope<ImageGenerationTask>>(aiApiUrl(config, "/image-tasks/edits"), formData, { headers: aiHeaders(config), params: imageTaskQueryParams(context) });
        return unwrapApiEnvelope(response.data);
    } catch (error) {
        throw new Error(readAxiosError(error, "图片任务创建失败"));
    }
}

export async function pollImageGenerationTask(config: AiConfig, taskId: string): Promise<ImageGenerationTaskState> {
    if (config.channelMode !== "remote") {
        throw new Error("当前配置不是服务端模式，图片刷新恢复需要使用服务端渠道");
    }
    try {
        const task = unwrapApiEnvelope((await axios.get<ApiEnvelope<ImageGenerationTask>>(aiApiUrl(config, `/generation-tasks/${encodeURIComponent(taskId)}`), { headers: aiHeaders(config) })).data);
        if (task.status === "succeeded") {
            const images = (task.resultImages || []).map((dataUrl) => ({ id: nanoid(), dataUrl }));
            if (!images.length) return { status: "failed", error: "图片任务完成但没有返回图片" };
            refreshRemoteUser(config);
            return { status: "completed", images };
        }
        if (task.status === "failed") return { status: "failed", error: task.errorMsg || "图片生成失败" };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "图片任务查询失败"));
    }
}

function imageTaskQueryParams(context?: ImageGenerationTaskContext) {
    return {
        ...(context?.canvasId ? { canvasId: context.canvasId } : {}),
        ...(context?.nodeId ? { nodeId: context.nodeId } : {}),
    };
}

function unwrapApiEnvelope<T>(payload: ApiEnvelope<T>): T {
    if (payload && typeof payload === "object" && "code" in payload) {
        const envelope = payload as { code?: number; data?: T; msg?: string };
        if (typeof envelope.code === "number" && envelope.code !== 0) throw new Error(envelope.msg || "请求失败");
        if (envelope.data === undefined) throw new Error(envelope.msg || "接口返回异常");
        return envelope.data;
    }
    return payload as T;
}

export async function requestImageQuestion(config: AiConfig, messages: ChatCompletionMessage[], onDelta: (text: string) => void) {
    let buffer = "";
    let answer = "";
    let processedLength = 0;

    try {
        const response = await axios.post(
            aiApiUrl(config, "/chat/completions"),
            {
                model: config.model,
                messages: withSystemMessage(config, messages),
                stream: true,
            },
            {
                headers: {
                    ...aiHeaders(config, "application/json"),
                } as Record<string, string>,
                responseType: "text",
                onDownloadProgress: (event) => {
                    const responseText = String(event.event?.target?.responseText || "");
                    const nextText = responseText.slice(processedLength);
                    processedLength = responseText.length;
                    buffer += nextText;
                    const chunks = buffer.split("\n\n");
                    buffer = chunks.pop() || "";
                    for (const chunk of chunks) {
                        parseStreamChunk(chunk, (delta) => {
                            answer += delta;
                            onDelta(answer);
                        });
                    }
                },
            },
        );
        if (typeof response.data === "object" && response.data && "code" in response.data && (response.data as { code?: number; msg?: string }).code !== 0) {
            throw new Error((response.data as { msg?: string }).msg || "请求失败");
        }
        if (typeof response.data === "string") {
            let apiError = "";
            try {
                const payload = JSON.parse(response.data) as { code?: number; msg?: string };
                if (typeof payload.code === "number" && payload.code !== 0) {
                    apiError = payload.msg || "请求失败";
                }
            } catch {
                // ignore plain text stream content
            }
            if (apiError) throw new Error(apiError);
        }
        if (buffer) {
            parseStreamChunk(buffer, (delta) => {
                answer += delta;
                onDelta(answer);
            });
        }
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
    refreshRemoteUser(config);
    return answer || "没有返回内容";
}

export async function fetchImageModels(config: AiConfig) {
    if (config.channelMode === "remote") return config.models;
    try {
        const response = await axios.get<{ data?: Array<{ id?: string }>; error?: { message?: string } }>(buildApiUrl(config.baseUrl, "/models"), {
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
            },
        });
        return (response.data.data || [])
            .map((model) => model.id)
            .filter((id): id is string => Boolean(id))
            .sort((a, b) => a.localeCompare(b));
    } catch (error) {
        throw new Error(readAxiosError(error, "读取模型失败"));
    }
}

export async function requestToolResponse(config: AiConfig, messages: ResponseInputMessage[], tools: ResponseFunctionTool[], toolChoice: "auto" | "required" = "auto", onDelta?: (text: string) => void): Promise<ToolResponseResult> {
    const body = {
        model: config.model,
        input: toResponseInput(messages),
        tools: tools.map(toResponseTool),
        tool_choice: toolChoice,
        stream: true,
    };
    let buffer = "";
    let text = "";
    let processedLength = 0;
    let toolCalls: ResponseToolCall[] = [];
    let payload: Record<string, unknown> | undefined;

    try {
        await axios.post(aiApiUrl(config, "/responses"), body, {
            headers: { ...aiHeaders(config, "application/json") } as Record<string, string>,
            responseType: "text",
            onDownloadProgress: (event) => {
                const responseText = String(event.event?.target?.responseText || "");
                const nextText = responseText.slice(processedLength);
                processedLength = responseText.length;
                buffer += nextText;
                const chunks = buffer.split("\n\n");
                buffer = chunks.pop() || "";
                for (const chunk of chunks) {
                    consumeToolStreamBlock(chunk, (delta) => { text += delta; onDelta?.(text); }, (tc) => { toolCalls = tc; }, (p) => { payload = p; });
                }
            },
        });
        if (buffer.trim()) consumeToolStreamBlock(buffer, (delta) => { text += delta; onDelta?.(text); }, (tc) => { toolCalls = tc; }, (p) => { payload = p; });
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }

    if (payload) {
        const output = (payload.output as Array<Record<string, unknown>> | undefined) || [];
        if (!text && typeof payload.output_text === "string") text = payload.output_text;
        if (!toolCalls.length) {
            toolCalls = output
                .filter((item) => item.type === "function_call")
                .map((item) => ({ id: String(item.call_id || item.id || ""), type: "function" as const, function: { name: String(item.name || ""), arguments: String(item.arguments || "{}") } }))
                .filter((item) => item.id && item.function.name);
        }
    }

    refreshRemoteUser(config);
    return { content: text, toolCalls };
}

type ToolStreamCallbacks = { onDelta: (text: string) => void; onToolCalls: (calls: ResponseToolCall[]) => void; onPayload: (payload: Record<string, unknown>) => void };

function consumeToolStreamBlock(block: string, onDelta: (text: string) => void, onToolCalls: (calls: ResponseToolCall[]) => void, onPayload: (payload: Record<string, unknown>) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    try {
        const event = JSON.parse(data) as Record<string, unknown>;
        const type = String(event.type || "");
        if (type === "response.output_text.delta" && typeof event.delta === "string") onDelta(event.delta);
        if (type === "response.output_text.done" && typeof event.text === "string") onDelta(event.text);
        if (type === "response.completed" && event.response && typeof event.response === "object") onPayload(event.response as Record<string, unknown>);
        if (Array.isArray(event.output)) onPayload(event as Record<string, unknown>);
    } catch {
        // ignore parse errors in stream
    }
}

function toResponseInput(messages: ResponseInputMessage[]): Array<Record<string, unknown>> {
    return messages.flatMap((message): Array<Record<string, unknown>> => {
        if ("type" in message && message.type === "function_call") return [{ type: "function_call", call_id: message.call_id, name: message.name, arguments: message.arguments }];
        if ("role" in message && message.role === "tool") return [{ type: "function_call_output", call_id: message.tool_call_id, output: message.content }];
        return [{ role: message.role, content: message.content }];
    });
}

function toResponseTool(tool: ResponseFunctionTool): Record<string, unknown> {
    return { type: "function", name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters, strict: tool.function.strict };
}
