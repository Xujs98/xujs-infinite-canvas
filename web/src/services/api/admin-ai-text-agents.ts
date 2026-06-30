import { apiDelete, apiGet, apiPost, compactApiParams, type ApiParams } from "@/services/api/request";

export interface AdminAITextAgent {
  id: string;
  name: string;
  enabled: boolean;
  prompt: string;
  defaultModel: string;
  inputSources: string;
  jsonExample: string;
  jsonFields: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAITextAgentListResponse {
  items: AdminAITextAgent[];
  total: number;
}

export interface AdminAITextAgentQuery extends ApiParams {
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchAdminAITextAgents(token: string, query: AdminAITextAgentQuery = {}) {
  return apiGet<AdminAITextAgentListResponse>("/api/admin/ai-text-agents", compactApiParams(query), token);
}

export async function saveAdminAITextAgent(token: string, agent: Partial<AdminAITextAgent>) {
  return apiPost<AdminAITextAgent>("/api/admin/ai-text-agents", agent, token);
}

export async function deleteAdminAITextAgent(token: string, id: string) {
  return apiDelete<boolean>(`/api/admin/ai-text-agents/${encodeURIComponent(id)}`, token);
}

export async function deleteAdminAITextAgents(token: string, ids: string[]) {
  return apiPost<boolean>("/api/admin/ai-text-agents/batch-delete", { ids }, token);
}
