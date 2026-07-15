import { apiDelete, apiGet, apiPost, apiPut, compactApiParams } from "@/services/api/request";

export type AdminRole = {
    id: string;
    name: string;
    label: string;
    description: string;
    allowedModels: string[];
    freeModels: string[];
    allowOffline: boolean;
    offlineCreditLimit: number;
    enableTasks: boolean;
    isBuiltin: boolean;
    createdAt: string;
    updatedAt: string;
};

export type AdminRoleListResponse = {
    items: AdminRole[];
    total: number;
};

export async function fetchAdminRoles(token: string, query: { keyword?: string; page?: number; pageSize?: number } = {}) {
    return apiGet<AdminRoleListResponse>("/api/admin/roles", compactApiParams(query), token);
}

export async function fetchAllRoles() {
    return apiGet<AdminRole[]>("/api/roles");
}

export async function createAdminRole(token: string, data: Partial<AdminRole>) {
    return apiPost<AdminRole>("/api/admin/roles", data, token);
}

export async function updateAdminRole(token: string, id: string, data: Partial<AdminRole>) {
    return apiPut<AdminRole>(`/api/admin/roles/${id}`, data, token);
}

export async function deleteAdminRole(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/roles/${id}`, token);
}

export async function batchDeleteAdminRoles(token: string, ids: string[]) {
    return apiPost<boolean>("/api/admin/roles/batch-delete", { ids }, token);
}
