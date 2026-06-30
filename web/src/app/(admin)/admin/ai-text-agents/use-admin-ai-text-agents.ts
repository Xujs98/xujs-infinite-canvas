"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import {
  deleteAdminAITextAgent,
  deleteAdminAITextAgents,
  fetchAdminAITextAgents,
  saveAdminAITextAgent,
  type AdminAITextAgent,
} from "@/services/api/admin-ai-text-agents";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;

export function useAdminAITextAgents() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const token = useUserStore((state) => state.token);
  const clearSession = useUserStore((state) => state.clearSession);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const query = useQuery({
    queryKey: ["admin", "ai-text-agents", token, keyword, page, pageSize],
    queryFn: () => fetchAdminAITextAgents(token, { keyword, page, pageSize }),
    enabled: Boolean(token),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (agent: Partial<AdminAITextAgent>) => saveAdminAITextAgent(token, agent),
    onSuccess: async (_, agent) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "ai-text-agents"] });
      message.success(agent.id ? "AI 文本 Agent 已保存" : "AI 文本 Agent 已创建");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "保存失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminAITextAgent(token, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "ai-text-agents"] });
      message.success("AI 文本 Agent 已删除");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "删除失败"),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteAdminAITextAgents(token, ids),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "ai-text-agents"] });
      message.success("批量删除成功");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "批量删除失败"),
  });

  useEffect(() => {
    if (query.isError) {
      const errorMessage = query.error instanceof Error ? query.error.message : "读取 AI 文本 Agent 失败";
      message.error(errorMessage);
      if (errorMessage.includes("未登录") || errorMessage.includes("权限不足") || errorMessage.includes("登录状态无效")) clearSession();
    }
  }, [clearSession, message, query.error, query.isError]);

  const updateFilters = (next: Partial<{ keyword: string; page: number; pageSize: number }>) => {
    const queryState = { keyword, page, pageSize, ...next };
    if (next.keyword !== undefined || next.pageSize !== undefined) queryState.page = 1;
    setKeyword(queryState.keyword);
    setPage(queryState.page);
    setPageSize(queryState.pageSize);
  };

  const data = query.data;

  return {
    agents: data?.items || [],
    keyword,
    page,
    pageSize,
    total: data?.total || 0,
    isLoading: query.isFetching || saveMutation.isPending || deleteMutation.isPending || batchDeleteMutation.isPending,
    searchAgents: (value = keyword) => updateFilters({ keyword: value }),
    changePage: (value: number) => updateFilters({ page: value }),
    changePageSize: (value: number) => updateFilters({ pageSize: value }),
    resetFilters: () => updateFilters({ keyword: "", page: 1, pageSize: defaultPageSize }),
    refreshAgents: () => query.refetch(),
    saveAgent: (agent: Partial<AdminAITextAgent>) => saveMutation.mutateAsync(agent),
    deleteAgent: (id: string) => deleteMutation.mutateAsync(id),
    deleteAgents: (ids: string[]) => batchDeleteMutation.mutateAsync(ids),
  };
}
