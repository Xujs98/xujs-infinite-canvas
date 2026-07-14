import { apiDelete, apiGet, apiPost, compactApiParams, type ApiParams } from "@/services/api/request";

export interface AdminPromptPreset {
  id: string;
  name: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPromptPresetListResponse {
  items: AdminPromptPreset[];
  total: number;
}

export interface AdminPromptPresetQuery extends ApiParams {
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchAdminPromptPresets(token: string, query: AdminPromptPresetQuery = {}) {
  return apiGet<AdminPromptPresetListResponse>("/api/admin/prompt-presets", compactApiParams(query), token);
}

export async function saveAdminPromptPreset(token: string, preset: Partial<AdminPromptPreset>) {
  return apiPost<AdminPromptPreset>("/api/admin/prompt-presets", preset, token);
}

export async function deleteAdminPromptPreset(token: string, id: string) {
  return apiDelete<boolean>(`/api/admin/prompt-presets/${encodeURIComponent(id)}`, token);
}

export async function deleteAdminPromptPresets(token: string, ids: string[]) {
  return apiPost<boolean>("/api/admin/prompt-presets/batch-delete", { ids }, token);
}
