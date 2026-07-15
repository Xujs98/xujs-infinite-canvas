import { apiGet, compactApiParams } from "@/services/api/request";

export type UserGenerationTask = {
    id: string;
    upstreamTaskId: string;
    type: "image" | "video";
    status: "running" | "succeeded" | "failed";
    userId: string;
    model: string;
    prompt: string;
    canvasId: string;
    nodeId: string;
    progress: number;
    resultUrl: string;
    resultImages?: string[];
    errorMsg: string;
    persistent: boolean;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
};

export type UserGenerationTaskList = { items: UserGenerationTask[]; total: number };

export async function fetchUserGenerationTasks(token: string, query: { type?: "image" | "video"; status?: string; page?: number; pageSize?: number } = {}) {
    return apiGet<UserGenerationTaskList>("/api/v1/generation-tasks", compactApiParams(query), token);
}
