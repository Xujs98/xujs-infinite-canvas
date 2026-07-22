import axios from "axios";

import { apiDelete, apiGet, apiPost, apiPut, compactApiParams } from "@/services/api/request";

export type AppReleaseStatus = "draft" | "published";
export type AppReleasePlatform = "windows" | "macos";
export type AppReleaseArch = "x64" | "arm64" | "universal";

export type AppReleaseArtifact = {
    id: string;
    releaseId: string;
    platform: AppReleasePlatform;
    arch: AppReleaseArch;
    fileName: string;
    contentType: string;
    fileSize: number;
    sha256: string;
    downloadUrl: string;
    createdAt: string;
    updatedAt: string;
};

export type AppRelease = {
    id: string;
    version: string;
    title: string;
    notes: string;
    forceUpdate: boolean;
    status: AppReleaseStatus;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    artifacts: AppReleaseArtifact[];
};

export type AppReleaseList = {
    items: AppRelease[];
    total: number;
};

type ApiResponse<T> = {
    code: number;
    data: T;
    msg: string;
};

export async function fetchAdminAppReleases(token: string, query: { keyword?: string; status?: string; page?: number; pageSize?: number } = {}) {
    return apiGet<AppReleaseList>("/api/admin/app-releases", compactApiParams(query), token);
}

export async function createAdminAppRelease(token: string, data: Pick<AppRelease, "version" | "title" | "notes" | "forceUpdate">) {
    return apiPost<AppRelease>("/api/admin/app-releases", data, token);
}

export async function updateAdminAppRelease(token: string, id: string, data: Pick<AppRelease, "version" | "title" | "notes" | "forceUpdate" | "status">) {
    return apiPut<AppRelease>(`/api/admin/app-releases/${encodeURIComponent(id)}`, data, token);
}

export async function deleteAdminAppRelease(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/app-releases/${encodeURIComponent(id)}`, token);
}

export async function uploadAdminAppReleaseArtifact(
    token: string,
    releaseId: string,
    file: File,
    platform: AppReleasePlatform,
    arch: AppReleaseArch,
    onProgress?: (percent: number) => void,
) {
    const form = new FormData();
    form.append("platform", platform);
    form.append("arch", arch);
    form.append("file", file);
    let response;
    try {
        response = await axios.post<ApiResponse<AppReleaseArtifact>>(`/api/admin/app-releases/${encodeURIComponent(releaseId)}/artifacts`, form, {
            headers: { Authorization: `Bearer ${token}` },
            onUploadProgress: (event) => {
                if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
            },
            validateStatus: () => true,
        });
    } catch {
        throw new Error("安装包上传失败，请检查网络后重试");
    }
    if (response.status < 200 || response.status >= 300 || response.data?.code !== 0) {
        throw new Error(response.data?.msg || "安装包上传失败");
    }
    return response.data.data;
}

export async function deleteAdminAppReleaseArtifact(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/app-release-artifacts/${encodeURIComponent(id)}`, token);
}

export async function fetchLatestAppRelease() {
    return apiGet<AppRelease>("/api/app-releases/latest");
}

export async function fetchRecentAppReleases(query: { page?: number; pageSize?: number } = {}) {
    return apiGet<AppReleaseList>("/api/app-releases", compactApiParams(query));
}
