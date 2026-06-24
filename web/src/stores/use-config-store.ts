"use client";

import { useMemo, useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { apiGet } from "@/services/api/request";
import type { AdminPublicSettings } from "@/services/api/admin";

export type ModelCostItem = { model: string; credits: number; alias: string };

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    systemPrompt: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    modelCosts: ModelCostItem[];
    quality: string;
    size: string;
    count: string;
    canvasImageCount: string;
};

export type WebdavSyncConfig = {
    proxyMode: "direct" | "nextjs";
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
export type ModelCapability = "image" | "video" | "text" | "audio";

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: "https://api.openai.com",
    apiKey: "",
    model: "gpt-image-2",
    imageModel: "gpt-image-2",
    videoModel: "grok-imagine-video",
    textModel: "gpt-5.5",
    audioModel: "gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    models: [],
    imageModels: [],
    videoModels: [],
    textModels: [],
    audioModels: [],
    modelCosts: [],
    quality: "auto",
    size: "1:1",
    count: "1",
    canvasImageCount: "3",
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    proxyMode: "direct",
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

export type PublicSystemSettings = {
    siteName: string;
    siteSubtitle: string;
    siteLogo: string;
    serviceContact: string;
    inviteRewardCredits: number;
    checkInEnabled: boolean;
    checkInRewardMin: number;
    checkInRewardMax: number;
    videoMaxTimeoutSeconds: number;
    agentEnabled: boolean;
    agentVisible: boolean;
    agentAccessLevel: string;
    assistantEnabled: boolean;
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    publicSettings: AdminPublicSettings | null;
    publicSystemSettings: PublicSystemSettings | null;
    isPublicSettingsLoading: boolean;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    loadPublicSettings: () => Promise<void>;
    loadPublicSystemSettings: () => Promise<void>;
    loadModelClassifications: () => Promise<void>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

function resolveEffectiveConfig(config: AiConfig, modelChannel: AdminPublicSettings["modelChannel"] | null) {
    const channelMode = modelChannel?.allowCustomChannel ? config.channelMode : "remote";
    if (channelMode === "local" || !modelChannel) return { ...config, channelMode };
    const models = modelChannel.availableModels;
    const textModels = filterModelsByCapability(models, "text");
    const imageModels = filterModelsByCapability(models, "image");
    const videoModels = filterModelsByCapability(models, "video");
    const audioModels = filterModelsByCapability(models, "audio");
    const fallbackTextModel = validDefault(modelChannel.defaultTextModel, textModels) || preferredModel(textModels, isTextModelName);
    const fallbackModel = validDefault(modelChannel.defaultModel, textModels) || fallbackTextModel;
    const fallbackImageModel = validDefault(modelChannel.defaultImageModel, imageModels) || preferredModel(imageModels, isImageModelName);
    const fallbackVideoModel = validDefault(modelChannel.defaultVideoModel, videoModels) || preferredModel(videoModels, isVideoModelName);
    const fallbackAudioModel = preferredModel(audioModels, isAudioModelName);

    // 自动适配视频秒数：用户选择 > 模型分类配置 > 默认 "6"
    const effectiveVideoModel = videoModels.includes(config.videoModel) ? config.videoModel : fallbackVideoModel;
    const videoDetail = modelClassificationsCache[effectiveVideoModel];
    const durations = videoDetail?.videoConfig?.durations;
    let videoSeconds: string;
    if (durations?.length) {
        // 有分类配置时：当前值有效就用当前值，否则用第一个配置
        videoSeconds = (config.videoSeconds && durations.includes(config.videoSeconds)) ? config.videoSeconds : durations[0];
    } else {
        // 无分类配置：用当前值或兜底 "6"
        videoSeconds = config.videoSeconds || "6";
    }

    return {
        ...config,
        channelMode,
        models,
        imageModels,
        videoModels,
        textModels,
        audioModels,
        modelCosts: modelChannel.modelCosts || [],
        model: textModels.includes(config.model) ? config.model : fallbackModel,
        imageModel: imageModels.includes(config.imageModel) ? config.imageModel : fallbackImageModel,
        videoModel: effectiveVideoModel,
        textModel: textModels.includes(config.textModel) ? config.textModel : fallbackTextModel || fallbackModel,
        audioModel: audioModels.includes(config.audioModel) ? config.audioModel : fallbackAudioModel,
        videoSeconds,
        systemPrompt: modelChannel.systemPrompt,
    };
}

function validDefault(model: string, models: string[]) {
    return models.includes(model) ? model : "";
}

function preferredModel(models: string[], predicate: (model: string) => boolean) {
    return models.find(predicate) || "";
}

// 自定义模型分类映射（从后端加载）
let modelClassificationsMap: Record<string, string> = {};

export function setModelClassificationsMap(map: Record<string, string>) {
    modelClassificationsMap = map;
}

export function getModelClassificationsMap() {
    return modelClassificationsMap;
}

// 模型分类详情缓存（从后端加载）
export type ModelClassificationDetail = {
    id: string;
    modelName: string;
    capability: string;
    videoConfig: {
        resolutions: string[];
        ratios: string[];
        durations: string[]; // 支持 "adaptive" 和数字字符串如 "15"
        maxDuration: number;
        supportGenerateAudio: boolean;
        supportWatermark: boolean;
    } | null;
    imageConfig: {
        qualities: string[];
        aspectRatios: string[];
        maxCount: number;
        supportCustomSize: boolean;
    } | null;
    audioConfig: {
        voices: string[];
        formats: string[];
        speedRange: { min: number; max: number } | null;
    } | null;
};

let modelClassificationsCache: Record<string, ModelClassificationDetail> = {};
// 用于触发 React 组件重新渲染的版本号
let modelClassificationsVersion = 0;
let modelClassificationsListeners: Array<() => void> = [];

export function onModelClassificationsChange(listener: () => void) {
    modelClassificationsListeners.push(listener);
    return () => {
        modelClassificationsListeners = modelClassificationsListeners.filter((l) => l !== listener);
    };
}

export function getModelClassificationsVersion() {
    return modelClassificationsVersion;
}

export function setModelClassificationsCache(details: ModelClassificationDetail[]) {
    modelClassificationsCache = {};
    for (const item of details) {
        modelClassificationsCache[item.modelName] = item;
    }
    modelClassificationsVersion++;
    modelClassificationsListeners.forEach((l) => l());
}

export function getModelClassificationDetail(modelName: string): ModelClassificationDetail | null {
    return modelClassificationsCache[modelName] || null;
}

// React Hook：订阅模型分类缓存变化，确保组件在分类加载后重新渲染
export function useModelClassificationsVersion() {
    return useSyncExternalStore(
        onModelClassificationsChange,
        getModelClassificationsVersion,
        getModelClassificationsVersion,
    );
}

function isVideoModelName(model: string) {
    // 优先使用自定义分类
    if (modelClassificationsMap[model]) {
        return modelClassificationsMap[model] === "video";
    }
    const value = model.toLowerCase();
    return value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("kling") || value.includes("wan") || value.includes("hailuo") || value.includes("quanneng");
}

function isImageModelName(model: string) {
    // 优先使用自定义分类
    if (modelClassificationsMap[model]) {
        return modelClassificationsMap[model] === "image";
    }
    const value = model.toLowerCase();
    return !isVideoModelName(model) && !isAudioModelName(model) && (value.includes("seedream") || value.includes("gpt-image") || value.includes("image") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("flux") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney"));
}

function isAudioModelName(model: string) {
    // 优先使用自定义分类
    if (modelClassificationsMap[model]) {
        return modelClassificationsMap[model] === "audio";
    }
    const value = model.toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function isTextModelName(model: string) {
    // 优先使用自定义分类
    if (modelClassificationsMap[model]) {
        return modelClassificationsMap[model] === "text";
    }
    return !isImageModelName(model) && !isVideoModelName(model) && !isAudioModelName(model);
}

export function modelMatchesCapability(model: string, capability?: ModelCapability) {
    if (!capability) return true;
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return isTextModelName(model);
}

export function filterModelsByCapability(models: string[], capability?: ModelCapability) {
    return capability ? models.filter((model) => modelMatchesCapability(model, capability)) : models;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config[modelListKey(capability)];
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function isAiConfigReady(config: AiConfig, model: string) {
    return Boolean(model.trim()) && (config.channelMode === "remote" || Boolean(config.baseUrl.trim() && config.apiKey.trim()));
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            publicSettings: null,
            publicSystemSettings: null,
            isPublicSettingsLoading: false,
            isConfigOpen: false,
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            loadPublicSettings: async () => {
                if (get().isPublicSettingsLoading) return;
                set({ isPublicSettingsLoading: true });
                try {
                    set({ publicSettings: await apiGet<AdminPublicSettings>("/api/settings") });
                } finally {
                    set({ isPublicSettingsLoading: false });
                }
            },
            loadPublicSystemSettings: async () => {
                try {
                    set({ publicSystemSettings: await apiGet<PublicSystemSettings>("/api/system-settings") });
                } catch {
                    // ignore
                }
            },
            loadModelClassifications: async () => {
                try {
                    const map = await apiGet<Record<string, string>>("/api/model-classifications/map");
                    setModelClassificationsMap(map);
                    // 同时加载详情缓存
                    const details = await apiGet<ModelClassificationDetail[]>("/api/model-classifications/all");
                    setModelClassificationsCache(details);
                    // 分类缓存加载后重新计算视频秒数
                    const { config: currentConfig } = get();
                    const videoDetail = details.find((d) => d.modelName === currentConfig.videoModel);
                    if (videoDetail?.videoConfig?.durations?.length) {
                        const durations = videoDetail.videoConfig.durations;
                        const current = currentConfig.videoSeconds || "6";
                        if (!durations.includes(current) && current !== "adaptive") {
                            set({ config: { ...currentConfig, videoSeconds: durations[0] } });
                        }
                    }
                } catch {
                    // ignore
                }
            },
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false) => set({ isConfigOpen: true, shouldPromptContinue }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: {
                        ...config,
                        channelMode: config.channelMode || "remote",
                        imageModel: config.imageModel || config.model,
                        videoModel: config.videoModel || "grok-imagine-video",
                        textModel: config.textModel || config.model,
                        audioModel: config.audioModel || defaultConfig.audioModel,
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: config.audioInstructions || "",
                        videoSeconds: config.videoSeconds || "",
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        canvasImageCount: config.canvasImageCount || "3",
                        imageModels: Array.isArray(persistedConfig.imageModels) ? normalizeModelList(config.imageModels) : filterModelsByCapability(config.models, "image"),
                        videoModels: Array.isArray(persistedConfig.videoModels) ? normalizeModelList(config.videoModels) : filterModelsByCapability(config.models, "video"),
                        textModels: Array.isArray(persistedConfig.textModels) ? normalizeModelList(config.textModels) : filterModelsByCapability(config.models, "text"),
                        audioModels: Array.isArray(persistedConfig.audioModels) ? normalizeModelList(config.audioModels) : filterModelsByCapability(config.models, "audio"),
                    },
                };
            },
            onRehydrateStorage: () => {
                return (_state, error) => {
                    if (!error) {
                        // hydrate 完成后，异步加载分类并适配视频秒数
                        setTimeout(async () => {
                            try {
                                const details = await apiGet<ModelClassificationDetail[]>("/api/model-classifications/all");
                                setModelClassificationsCache(details);
                                const { config: currentConfig } = useConfigStore.getState();
                                const videoDetail = details.find((d) => d.modelName === currentConfig.videoModel);
                                if (videoDetail?.videoConfig?.durations?.length) {
                                    const durations = videoDetail.videoConfig.durations;
                                    if (!durations.includes(currentConfig.videoSeconds) && currentConfig.videoSeconds !== "adaptive") {
                                        useConfigStore.setState({ config: { ...currentConfig, videoSeconds: durations[0] } });
                                    }
                                }
                            } catch {
                                // ignore
                            }
                        }, 0);
                    }
                };
            },
        },
    ),
);

function normalizeModelList(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    const modelChannel = useConfigStore((state) => state.publicSettings?.modelChannel || null);
    return useMemo(() => resolveEffectiveConfig(config, modelChannel), [config, modelChannel]);
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}
