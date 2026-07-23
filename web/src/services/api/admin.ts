import axios from "axios";
import { apiDelete, apiGet, apiPost, compactApiParams } from "@/services/api/request";
import type { Prompt, PromptListResponse } from "@/services/api/prompts";
import type { UserSubscription } from "@/services/api/subscription";

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
    role: string;
    credits: number;
    affCode: string;
    affCount: number;
    inviterId: string;
    linuxDoId: string;
    status: "active" | "ban";
    customChannelPolicy: "inherit" | "enabled" | "disabled";
    membershipExpiresAt: string;
    lastLoginAt: string;
    createdAt: string;
    updatedAt: string;
    online: boolean;
    onlineApp: boolean;
    onlineWeb: boolean;
};

export type AdminUserListResponse = {
    items: AdminUser[];
    total: number;
};

export type AdminUserDetail = {
    user: AdminUser;
    subscriptionUsed: number;
    totalConsumedCredits: number;
    activeSubscription: UserSubscription | null;
    ipRecords: AdminUserIPRecord[];
    deviceRecords: AdminUserDeviceRecord[];
};

export type AdminUserIPRecord = {
    ipAddress: string;
    blocked: boolean;
    clientTypes: string[];
    deviceCount: number;
    seenCount: number;
    firstSeenAt: string;
    lastSeenAt: string;
};

export type AdminUserDeviceRecord = {
    deviceCode: string;
    blocked: boolean;
    ipAddresses: string[];
    appVersion: string;
    osName: string;
    osVersion: string;
    seenCount: number;
    firstSeenAt: string;
    lastSeenAt: string;
};

export type AdminDashboardStats = {
    onlineUsers: number;
    onlineAppUsers: number;
    onlineWebUsers: number;
    onlineConnections: number;
    totalUsers: number;
    modelCount: number;
};

export type AdminAnalyticsRange = "1d" | "7d" | "14d" | "30d";

export type AdminAnalyticsTrendPoint = {
    at: string;
    label: string;
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    modelCalls: Record<string, number>;
    activeUsers: number;
    newUsers: number;
    consumedCredits: number;
};

export type AdminModelAnalyticsRank = {
    model: string;
    calls: number;
    success: number;
    failed: number;
    successRate: number;
    share: number;
};

export type AdminUserAnalyticsRank = {
    userId: string;
    username: string;
    displayName: string;
    calls: number;
    successCalls: number;
    successRate: number;
    consumedCredits: number;
    lastActiveAt: string;
};

export type AdminAnalyticsResult = {
    range: AdminAnalyticsRange;
    startAt: string;
    endAt: string;
    generatedAt: string;
    model: {
        summary: {
            totalCalls: number;
            successCalls: number;
            failedCalls: number;
            successRate: number;
            activeModels: number;
            consumedCredits: number;
        };
        trend: AdminAnalyticsTrendPoint[];
        models: AdminModelAnalyticsRank[];
    };
    users: {
        summary: {
            totalUsers: number;
            newUsers: number;
            activeUsers: number;
            consumingUsers: number;
            consumedCredits: number;
        };
        trend: AdminAnalyticsTrendPoint[];
        ranking: AdminUserAnalyticsRank[];
    };
};

export type AdminServerOfflineStatus = {
    offline: boolean;
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

export type AdminGenerationTask = {
    id: string;
    upstreamTaskId: string;
    type: "image" | "video";
    status: "running" | "succeeded" | "failed";
    userId: string;
    username: string;
    model: string;
    path: string;
    canvasId: string;
    nodeId: string;
    progress: number;
    resultUrl: string;
    resultImages?: string[];
    errorMsg: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
};

export type AdminGenerationTaskListResponse = {
    items: AdminGenerationTask[];
    total: number;
};

export type AdminUserQuery = {
    keyword?: string;
    type?: string;
    role?: string;
    status?: string;
    page?: number;
    pageSize?: number;
};

export async function fetchAdminUsers(token: string, query: AdminUserQuery = {}) {
    return apiGet<AdminUserListResponse>("/api/admin/users", compactApiParams(query), token);
}

export async function fetchAdminUserDetail(token: string, id: string) {
    return apiGet<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(id)}/detail`, undefined, token);
}

export async function fetchAdminUserCreditLogs(token: string, id: string, query: { page?: number; pageSize?: number } = {}) {
    return apiGet<AdminCreditLogListResponse>(`/api/admin/users/${encodeURIComponent(id)}/credit-logs`, compactApiParams(query), token);
}

export async function setAdminAccessBan(token: string, kind: "ip" | "device", value: string, blocked: boolean) {
    return apiPost<boolean>("/api/admin/access-bans", { kind, value, blocked }, token);
}

export async function fetchAdminDashboardStats(token: string) {
    return apiGet<AdminDashboardStats>("/api/admin/dashboard", undefined, token);
}

export async function fetchAdminAnalytics(token: string, range: AdminAnalyticsRange) {
    return apiGet<AdminAnalyticsResult>("/api/admin/analytics", { range }, token);
}

export async function fetchAdminServerOfflineStatus(token: string) {
    return apiGet<AdminServerOfflineStatus>("/api/admin/server/offline", undefined, token);
}

export async function setAdminServerOfflineStatus(token: string, offline: boolean) {
    return apiPost<AdminServerOfflineStatus>("/api/admin/server/offline", { offline }, token);
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

export async function fetchAdminGenerationTasks(token: string, query: { keyword?: string; type?: string; status?: string; page?: number; pageSize?: number } = {}) {
    return apiGet<AdminGenerationTaskListResponse>("/api/admin/tasks", compactApiParams(query), token);
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

export async function deleteInvalidAdminRedeemCodes(token: string) {
    const invalidStatuses = ["used", "disabled", "expired"];
    let deleted = 0;

    for (const status of invalidStatuses) {
        while (true) {
            const result = await fetchAdminRedeemCodes(token, { status, page: 1, pageSize: 100 });
            const ids = result.items.map((item) => item.id).filter(Boolean);
            if (!ids.length) break;
            await batchDeleteAdminRedeemCodes(token, ids);
            deleted += ids.length;
        }
    }

    return deleted;
}

export type AdminChannelFieldMapping = {
    image?: string;
    images?: string;
    referenceVideos?: string;
    referenceAudios?: string;
    imagesType?: "string" | "array";
};

export type AdminChannelVideoInputConfig = {
    enabled: boolean;
    min: number;
    max: number;
    field?: string;
    roles?: string[];
    requireImageHost?: boolean;
};

export type AdminChannelVideoConfig = {
    // 基础配置
    path?: string;
    method?: string;
    requestBodyMode?: "json" | "multipart";
    requestFormat?: "" | "openai" | "generic-json";
    responseFormat?: "" | "openai";
    // 任务管理
    taskIdField?: string;
    statusEndpointPath?: string;
    contentEndpointPath?: string;
    statusMethod?: "GET" | "POST";
    statusField?: string;
    videoUrlPaths?: string[];
    // 视频下载字段路径
    videoDownloadField?: string;
    videoProgressField?: string;
    // 状态值
    pendingValues?: string[];
    successValues?: string[];
    failedValues?: string[];
    // 轮询控制
    pollIntervalMs?: number;
    pollTimeoutMs?: number;
    // 请求体字段映射
    modelField?: string;
    promptField?: string;
    sizeField?: string;
    secondsField?: string;
    secondsAsString?: boolean;
    aspectRatioField?: string;
    resolutionField?: string;
    // 参考素材字段
    referenceImagesField?: string;
    referenceVideosField?: string;
    referenceAudiosField?: string;
    firstFrameField?: string;
    lastFrameField?: string;
    modeField?: string;
    framesModeValue?: string;
    // 默认参数
    defaultRequestParams?: Record<string, unknown>;
    // 输入 Schema
    imageInput?: AdminChannelVideoInputConfig;
    videoInput?: AdminChannelVideoInputConfig;
    audioInput?: AdminChannelVideoInputConfig;
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
    // App 端配置字段
    mediaType?: "image" | "video" | "chat";
    apiStyle?: string;
    endpointPath?: string;
    responseFormat?: string;
    supportedResolutions?: string[];
    supportedModelVersions?: string[];
    supportsWebSearch?: boolean;
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
    appErrorMessagePrefix: string;
    appErrorShowDetails: boolean;
    appErrorMessages: {
        default: string;
        generation: string;
        network: string;
        timeout: string;
        authentication: string;
        permission: string;
        credits: string;
        validation: string;
        upload: string;
        download: string;
        service: string;
    };
    requestLogCleanupEnabled: boolean;
    requestLogRetentionDays: number;
    requestLogMaxRows: number;
    callLogCleanupEnabled: boolean;
    callLogRetentionDays: number;
    callLogMaxRows: number;
    creditLogCleanupEnabled: boolean;
    creditLogRetentionDays: number;
    creditLogMaxRows: number;
    userCreditLogVisibleRows: number;
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
    minioStorage: {
        enabled: boolean;
        endpoint: string;
        bucket: string;
        region: string;
        accessKey: string;
        secretKey: string;
        secretConfigured: boolean;
        useSSL: boolean;
        usePathStyle: boolean;
        generatedPrefix: string;
        canvasPrefix: string;
        presignedURLExpirySeconds: number;
        canvasImageUploadMaxMB: number;
    };
};

export async function fetchAdminSystemSettings(token: string) {
    return apiGet<AdminSystemSettings>("/api/admin/system-settings", undefined, token);
}

export async function saveAdminSystemSettings(token: string, settings: AdminSystemSettings) {
    return apiPost<boolean>("/api/admin/system-settings", settings, token);
}

export async function testAdminMinIOStorage(token: string, config: AdminSystemSettings["minioStorage"]) {
    return apiPost<boolean>("/api/admin/system-settings/minio/test", config, token);
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

export async function clearAdminCallLogs(token: string) {
    return apiPost<{ deleted: number }>("/api/admin/call-logs/clear", {}, token);
}

// 使用日志
export type AdminRequestLogSummary = {
    id: string;
    userId: string;
    username: string;
    eventType: string;
    operation: string;
    model: string;
    channelName: string;
    providerId: string;
    method: string;
    path: string;
    url: string;
    requestBodySize: number;
    statusCode: number;
    success: boolean;
    isPolling: boolean;
    source: string;
    elapsedMs: number;
    credits: number;
    walletCredits: number;
    subscriptionCredits: number;
    billingMode: string;
    chargeStatus: string;
    requestedCount: number;
    generatedCount: number;
    taskId: string;
    errorStage: string;
    createdAt: string;
};
export type AdminRequestLog = AdminRequestLogSummary & {
    requestHeaders: string;
    requestBody: string;
    requestMedia: string;
    requestConfig: string;
    responseHeaders: string;
    responseBody: string;
    errorMsg: string;
    referenceImageCount: number;
    referenceVideoCount: number;
    referenceAudioCount: number;
    creditChargeId: string;
    requestId: string;
    ipAddress: string;
    deviceCode: string;
    clientType: string;
    appVersion: string;
    osName: string;
    osVersion: string;
    userAgent: string;
};
export type AdminRequestLogStats = {
    total: number;
    success: number;
    failed: number;
    credits: number;
    averageMs: number;
};
export type AdminRequestLogListResponse = {
    items: AdminRequestLogSummary[];
    total: number;
    stats: AdminRequestLogStats;
};
export type AdminRequestLogQuery = {
    keyword?: string;
    model?: string;
    channel?: string;
    source?: string;
    eventType?: string;
    operation?: string;
    status?: string;
    method?: string;
    startTime?: string;
    endTime?: string;
    page?: number;
    pageSize?: number;
};
export async function fetchAdminRequestLogs(token: string, query: AdminRequestLogQuery = {}) {
    return apiGet<AdminRequestLogListResponse>("/api/admin/request-logs", compactApiParams(query), token);
}
export async function fetchAdminRequestLogDetail(token: string, id: string) {
    return apiGet<AdminRequestLog>(`/api/admin/request-logs/${encodeURIComponent(id)}`, undefined, token);
}
export async function batchDeleteAdminRequestLogs(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/request-logs/batch-delete", { ids }, token);
}

export async function clearAdminRequestLogs(token: string) {
    return apiPost<{ deleted: number }>("/api/admin/request-logs/clear", {}, token);
}

export type AdminRiskLevel = "low" | "medium" | "high" | "critical";
export type AdminRiskStatus = "open" | "resolved" | "ignored";
export type AdminRiskEvent = {
    id: string;
    userId: string;
    username: string;
    eventType: string;
    level: AdminRiskLevel;
    status: AdminRiskStatus;
    source: string;
    ipAddress: string;
    deviceCode: string;
    clientType: string;
    appVersion: string;
    path: string;
    summary: string;
    detail: string;
    occurrenceCount: number;
    firstSeenAt: string;
    lastSeenAt: string;
    resolvedBy: string;
    resolvedAt?: string | null;
    createdAt: string;
    updatedAt: string;
};
export type AdminRiskEventListResponse = { items: AdminRiskEvent[]; total: number };
export type AdminRiskEventStats = { open: number; highRisk: number; today: number };
export type AdminRiskEventQuery = {
    keyword?: string;
    userId?: string;
    type?: string;
    level?: string;
    status?: string;
    source?: string;
    page?: number;
    pageSize?: number;
};
export async function fetchAdminRiskEvents(token: string, query: AdminRiskEventQuery = {}) {
    return apiGet<AdminRiskEventListResponse>("/api/admin/risk-events", compactApiParams(query), token);
}
export async function fetchAdminRiskEventStats(token: string) {
    return apiGet<AdminRiskEventStats>("/api/admin/risk-events/stats", undefined, token);
}
export async function updateAdminRiskEventStatus(token: string, id: string, status: AdminRiskStatus) {
    return apiPost<boolean>(`/api/admin/risk-events/${encodeURIComponent(id)}/status`, { status }, token);
}
export async function batchDeleteAdminRiskEvents(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/risk-events/batch-delete", { ids }, token);
}
export async function clearAdminRiskEvents(token: string) {
    return apiPost<{ deleted: number }>("/api/admin/risk-events/clear", {}, token);
}

// 模型分类管理
export type VideoModelConfig = {
    resolutions: string[];
    ratios: string[];
    durations: string[]; // 支持 "adaptive" 和数字字符串如 "15"
    maxDuration: number;
    billingMode?: "per_second" | "per_call";
    supportGenerateAudio: boolean;
    supportWatermark: boolean;
    imageInput?: VideoModelInputLimit | null;
    videoInput?: VideoModelInputLimit | null;
    audioInput?: VideoModelInputLimit | null;
};

export type VideoModelInputLimit = {
    min: number;
    max: number;
};

export type ImageModelConfig = {
    qualities: string[];
    aspectRatios: string[];
    maxCount: number;
    supportCustomSize: boolean;
    batchConcurrency?: number;
    asyncTask?: ImageAsyncTaskConfig | null;
};

export type ImageAsyncTaskConfig = {
    enabled: boolean;
    taskIdField: string;
    statusEndpointPath: string;
    contentEndpointPath?: string;
    statusMethod: "GET" | "POST";
    statusField: string;
    imageUrlPath: string;
    pendingValues: string[];
    successValues: string[];
    failedValues: string[];
    pollIntervalMs: number;
    pollTimeoutMs: number;
};

export type AudioModelConfig = {
    voices: string[];
    formats: string[];
    speedRange: { min: number; max: number } | null;
};

export type ChatModelConfig = {
    supportsMultimodal: boolean;
    contextWindow: number;
    maxOutputTokens: number;
    description: string;
};

export type RequestFieldConfig = {
    fieldName: string;
    requestKey: string;
    dataType: "string" | "integer" | "boolean" | "number" | "array" | "object";
    valuePath?: string;
    objectKey?: string;
    jsonTemplate?: string;
};

export type AdminModelClassification = {
    id: string;
    modelName: string;
    capability: string;
    requestFields: RequestFieldConfig[] | null;
    videoConfig: VideoModelConfig | null;
    imageConfig: ImageModelConfig | null;
    audioConfig: AudioModelConfig | null;
    chatConfig: ChatModelConfig | null;
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

export type AdminChannelModelSource = {
    modelName: string;
    channels: string[];
};

export async function fetchChannelModelSources(token: string) {
    return apiGet<AdminChannelModelSource[]>("/api/admin/settings/channel-model-sources", {}, token);
}

export async function fetchAllModelClassifications() {
    return apiGet<AdminModelClassification[]>("/api/model-classifications/all");
}
