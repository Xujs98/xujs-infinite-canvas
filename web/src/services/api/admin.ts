import axios from "axios";
import { apiDelete, apiGet, apiPost, compactApiParams } from "@/services/api/request";
import type { Prompt, PromptListResponse } from "@/services/api/prompts";

export type AdminPromptCategory = {
    category: string;
    name: string;
    description: string;
    file: string;
    githubUrl: string;
    remote: boolean;
};

export type AdminUser = {
    id: string;
    username: string;
    email: string;
    displayName: string;
    avatarUrl: string;
    role: "user" | "member" | "admin";
    credits: number;
    affCode: string;
    affCount: number;
    inviterId: string;
    linuxDoId: string;
    status: "active" | "ban";
    membershipExpiresAt: string;
    lastLoginAt: string;
    createdAt: string;
    updatedAt: string;
};

export type AdminUserListResponse = {
    items: AdminUser[];
    total: number;
};

export type AdminCreditLog = {
    id: string;
    userId: string;
    username: string;
    type: string;
    amount: number;
    balance: number;
    relatedId: string;
    remark: string;
    extra: string;
    createdAt: string;
};

export type AdminCreditLogListResponse = {
    items: AdminCreditLog[];
    total: number;
};

export type AdminUserQuery = {
    keyword?: string;
    role?: string;
    status?: string;
    page?: number;
    pageSize?: number;
};

export async function fetchAdminUsers(token: string, query: AdminUserQuery = {}) {
    return apiGet<AdminUserListResponse>("/api/admin/users", compactApiParams(query), token);
}

export async function saveAdminUser(token: string, user: Partial<AdminUser> & { password?: string }) {
    return apiPost<AdminUser>("/api/admin/users", user, token);
}

export async function adjustAdminUserCredits(token: string, id: string, credits: number) {
    return apiPost<AdminUser>(`/api/admin/users/${encodeURIComponent(id)}/credits`, { credits }, token);
}

export async function deleteAdminUser(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/users/${encodeURIComponent(id)}`, token);
}

export async function fetchAdminCreditLogs(token: string, query: AdminUserQuery = {}) {
    return apiGet<AdminCreditLogListResponse>("/api/admin/credit-logs", compactApiParams(query), token);
}

export async function saveAdminCreditLog(token: string, log: Partial<AdminCreditLog>) {
    return apiPost<AdminCreditLog>("/api/admin/credit-logs", log, token);
}

export async function deleteAdminCreditLog(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/credit-logs/${encodeURIComponent(id)}`, token);
}

export async function batchDeleteAdminCreditLogs(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/credit-logs/batch-delete", { ids }, token);
}

export async function batchDeleteAdminUsers(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/users/batch-delete", { ids }, token);
}

export async function batchUpdateAdminUserStatus(token: string, ids: string[], status: "active" | "ban") {
    return apiPost<boolean>("/api/admin/users/batch-status", { ids, status }, token);
}

export async function fetchAdminPromptCategories(token: string) {
    return apiGet<AdminPromptCategory[]>("/api/admin/prompt-categories", undefined, token);
}

export async function syncAdminPromptCategory(token: string, category: string) {
    return apiPost<AdminPromptCategory[]>("/api/admin/prompt-categories/sync", { category }, token);
}

export type AdminPromptQuery = {
    keyword?: string;
    category?: string;
    tag?: string[];
    page?: number;
    pageSize?: number;
};

export type AdminAsset = {
    id: string;
    title: string;
    type: "text" | "image" | "video";
    coverUrl: string;
    tags: string[];
    category: string;
    description: string;
    content: string;
    url: string;
    createdAt: string;
    updatedAt: string;
};

export type AdminAssetListResponse = {
    items: AdminAsset[];
    tags: string[];
    total: number;
};

export async function fetchAdminPrompts(token: string, query: AdminPromptQuery = {}) {
    return apiGet<PromptListResponse>("/api/admin/prompts", compactApiParams(query), token);
}

export async function saveAdminPrompt(token: string, prompt: Partial<Prompt>) {
    return apiPost<Prompt>("/api/admin/prompts", prompt, token);
}

export async function deleteAdminPrompt(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/prompts/${encodeURIComponent(id)}`, token);
}

export async function deleteAdminPrompts(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/prompts/batch-delete", { ids }, token);
}

export type AdminAssetQuery = {
    keyword?: string;
    type?: string;
    tag?: string[];
    page?: number;
    pageSize?: number;
};

export async function fetchAdminAssets(token: string, query: AdminAssetQuery = {}) {
    return apiGet<AdminAssetListResponse>("/api/admin/assets", compactApiParams(query), token);
}

export async function saveAdminAsset(token: string, asset: Partial<AdminAsset>) {
    return apiPost<AdminAsset>("/api/admin/assets", asset, token);
}

export async function deleteAdminAsset(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/assets/${encodeURIComponent(id)}`, token);
}

export type AdminRedeemCode = {
    id: string;
    code: string;
    type: "credits" | "membership";
    credits: number;
    membershipDays: number;
    status: "unused" | "used";
    usedBy: string;
    usedByName: string;
    usedAt: string;
    batchName: string;
    remark: string;
    createdAt: string;
    updatedAt: string;
};

export type AdminRedeemCodeListResponse = {
    items: AdminRedeemCode[];
    total: number;
};

export type AdminGenerateRedeemCodesRequest = {
    count: number;
    type: "credits" | "membership";
    credits?: number;
    membershipDays?: number;
    batchName?: string;
    remark?: string;
};

export async function fetchAdminRedeemCodes(token: string, query: AdminUserQuery = {}) {
    return apiGet<AdminRedeemCodeListResponse>("/api/admin/redeem-codes", compactApiParams(query), token);
}

export async function generateAdminRedeemCodes(token: string, payload: AdminGenerateRedeemCodesRequest) {
    return apiPost<AdminRedeemCode[]>("/api/admin/redeem-codes/generate", payload, token);
}

export async function deleteAdminRedeemCode(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/redeem-codes/${encodeURIComponent(id)}`, token);
}

export async function batchDeleteAdminRedeemCodes(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/redeem-codes/batch-delete", { ids }, token);
}

export type AdminChannelFieldMapping = {
    image?: string;
    images?: string;
    referenceVideos?: string;
    referenceAudios?: string;
    imagesType?: "string" | "array";
};

export type AdminChannelVideoConfig = {
    path?: string;
    requestFormat?: "" | "openai";
    responseFormat?: "" | "openai";
    taskIdField?: string;
    statusField?: string;
    videoUrlField?: string;
    fieldMapping?: AdminChannelFieldMapping;
};

export type AdminModelChannel = {
    protocol: "openai";
    name: string;
    baseUrl: string;
    apiKey: string;
    models: string[];
    weight: number;
    enabled: boolean;
    remark: string;
    extraHeaders?: Record<string, string>;
    extraBody?: Record<string, unknown>;
    pathPrefix?: string;
    videoConfig?: AdminChannelVideoConfig;
    fieldMapping?: AdminChannelFieldMapping;
    imageFormat?: "base64" | "url";
};

export type ChannelRequestLog = {
    id: string;
    modelName: string;
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
    bodySize: number;
    response?: string;
    statusCode?: number;
    error?: string;
    createdAt: string;
};

export type AdminPublicModelChannelSettings = {
    availableModels: string[];
    modelCosts: AdminModelCost[];
    defaultModel: string;
    defaultImageModel: string;
    defaultVideoModel: string;
    defaultTextModel: string;
    systemPrompt: string;
    allowCustomChannel: boolean;
};

export type AdminModelCost = {
    model: string;
    credits: number;
    alias: string;
};

export type AdminPublicSettings = {
    modelChannel: AdminPublicModelChannelSettings;
    auth: {
        allowRegister: boolean;
        linuxDo: {
            enabled: boolean;
        };
    };
};

export type AdminPrivateSettings = {
    channels: AdminModelChannel[];
    promptSync: {
        enabled: boolean;
        cron: string;
    };
    auth: {
        linuxDo: {
            clientId: string;
            clientSecret: string;
        };
    };
};

export type AdminSettings = {
    public: AdminPublicSettings;
    private: AdminPrivateSettings;
};

export async function fetchAdminSettings(token: string) {
    return apiGet<AdminSettings>("/api/admin/settings", undefined, token);
}

export async function saveAdminSettings(token: string, settings: AdminSettings) {
    return apiPost<AdminSettings>("/api/admin/settings", settings, token);
}

export type AdminChannelActionRequest = {
    index?: number;
    channel: AdminModelChannel;
    model?: string;
};

export async function fetchChannelModels(token: string, payload: AdminChannelActionRequest) {
    return apiPost<string[]>("/api/admin/settings/channel-models", payload, token);
}

export async function testChannelModel(token: string, payload: AdminChannelActionRequest) {
    return apiPost<string>("/api/admin/settings/channel-test", payload, token);
}

export async function fetchChannelRequestLogs(token: string, baseURL?: string) {
    return apiGet<Record<string, ChannelRequestLog>>("/api/admin/settings/channel-request-logs", baseURL ? { baseURL } : undefined, token);
}

export type AdminSystemSettings = {
    siteName: string;
    siteSubtitle: string;
    siteLogo: string;
    serviceContact: string;
    registerGiftCredits: number;
    inviteRewardCredits: number;
    checkInEnabled: boolean;
    checkInRewardMin: number;
    checkInRewardMax: number;
    videoMaxTimeoutSeconds: number;
    allowCustomChannel: boolean;
    allowRegister: boolean;
    assistantEnabled: boolean;
    emailEnabled: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpUsername: string;
    smtpPassword: string;
    smtpFrom: string;
    smtpTLS: boolean;
    membershipReminder: boolean;
    emailTemplateWelcome: string;
    emailTemplateReminder: string;
};

export async function fetchAdminSystemSettings(token: string) {
    return apiGet<AdminSystemSettings>("/api/admin/system-settings", undefined, token);
}

export async function saveAdminSystemSettings(token: string, settings: AdminSystemSettings) {
    return apiPost<boolean>("/api/admin/system-settings", settings, token);
}

export async function uploadAdminLogo(token: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await axios.request<{ code: number; data: { url: string }; msg: string }>({
        url: "/api/admin/system-settings/logo",
        method: "POST",
        data: formData,
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true,
    });
    const result = response.data;
    if (!result || result.code !== 0) throw new Error(result?.msg || "上传失败");
    return result.data;
}

export async function removeAdminLogo(token: string) {
    return apiDelete<boolean>("/api/admin/system-settings/logo", token);
}

export type AdminCallLog = {
    id: string;
    userId: string;
    username: string;
    model: string;
    path: string;
    success: boolean;
    errorMsg: string;
    credits: number;
    createdAt: string;
};

export type AdminCallLogListResponse = {
    items: AdminCallLog[];
    total: number;
};

export async function fetchAdminCallLogs(token: string, query: AdminUserQuery = {}) {
    return apiGet<AdminCallLogListResponse>("/api/admin/call-logs", compactApiParams(query), token);
}

export async function batchDeleteAdminCallLogs(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/call-logs/batch-delete", { ids }, token);
}

// 请求管理日志
export type AdminRequestLog = {
    id: string;
    userId: string;
    username: string;
    model: string;
    method: string;
    path: string;
    url: string;
    requestHeaders: string;
    requestBody: string;
    requestMedia: string;
    requestBodySize: number;
    responseBody: string;
    statusCode: number;
    success: boolean;
    errorMsg: string;
    isPolling: boolean;
    createdAt: string;
};
export type AdminRequestLogListResponse = {
    items: AdminRequestLog[];
    total: number;
};
export async function fetchAdminRequestLogs(token: string, query: AdminUserQuery = {}) {
    return apiGet<AdminRequestLogListResponse>("/api/admin/request-logs", compactApiParams(query), token);
}
export async function batchDeleteAdminRequestLogs(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/request-logs/batch-delete", { ids }, token);
}

// 模型分类管理
export type VideoModelConfig = {
    resolutions: string[];
    ratios: string[];
    durations: string[]; // 支持 "adaptive" 和数字字符串如 "15"
    maxDuration: number;
    supportGenerateAudio: boolean;
    supportWatermark: boolean;
};

export type ImageModelConfig = {
    qualities: string[];
    aspectRatios: string[];
    maxCount: number;
    supportCustomSize: boolean;
};

export type AudioModelConfig = {
    voices: string[];
    formats: string[];
    speedRange: { min: number; max: number } | null;
};

export type AdminModelClassification = {
    id: string;
    modelName: string;
    capability: string;
    videoConfig: VideoModelConfig | null;
    imageConfig: ImageModelConfig | null;
    audioConfig: AudioModelConfig | null;
    createdAt: string;
    updatedAt: string;
};

export type AdminModelClassificationListResponse = {
    items: AdminModelClassification[];
    total: number;
};

export async function fetchAdminModelClassifications(token: string, query: AdminUserQuery = {}) {
    return apiGet<AdminModelClassificationListResponse>("/api/admin/model-classifications", compactApiParams(query), token);
}

export async function createAdminModelClassification(token: string, data: Partial<AdminModelClassification>) {
    return apiPost<AdminModelClassification>("/api/admin/model-classifications", data, token);
}

export async function updateAdminModelClassification(token: string, id: string, data: Partial<AdminModelClassification>) {
    return axios.put(`/api/admin/model-classifications/${id}`, data, { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.data?.data);
}

export async function deleteAdminModelClassification(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/model-classifications/${id}`, token);
}

export async function batchDeleteAdminModelClassifications(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/model-classifications/batch-delete", { ids }, token);
}

export async function fetchModelClassificationsMap() {
    return apiGet<Record<string, string>>("/api/model-classifications/map");
}

export async function fetchAllChannelModels(token: string) {
    return apiGet<string[]>("/api/admin/settings/channel-models", {}, token);
}

export async function fetchAllModelClassifications() {
    return apiGet<AdminModelClassification[]>("/api/model-classifications/all");
}
