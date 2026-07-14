"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import {
  deleteAdminPromptPreset,
  deleteAdminPromptPresets,
  fetchAdminPromptPresets,
  saveAdminPromptPreset,
  type AdminPromptPreset,
} from "@/services/api/admin-prompt-presets";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;

export function useAdminPromptPresets() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const token = useUserStore((state) => state.token);
  const clearSession = useUserStore((state) => state.clearSession);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const query = useQuery({
    queryKey: ["admin", "prompt-presets", token, keyword, page, pageSize],
    queryFn: () => fetchAdminPromptPresets(token, { keyword, page, pageSize }),
    enabled: Boolean(token),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (preset: Partial<AdminPromptPreset>) => saveAdminPromptPreset(token, preset),
    onSuccess: async (_, preset) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "prompt-presets"] });
      message.success(preset.id ? "预设已保存" : "预设已创建");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "保存失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminPromptPreset(token, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "prompt-presets"] });
      message.success("预设已删除");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "删除失败"),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteAdminPromptPresets(token, ids),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "prompt-presets"] });
      message.success("批量删除成功");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "批量删除失败"),
  });

  useEffect(() => {
    if (query.isError) {
      const errorMessage = query.error instanceof Error ? query.error.message : "读取提示词预设失败";
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
    presets: data?.items || [],
    keyword,
    page,
    pageSize,
    total: data?.total || 0,
    isLoading: query.isFetching || saveMutation.isPending || deleteMutation.isPending || batchDeleteMutation.isPending,
    searchPresets: (value = keyword) => updateFilters({ keyword: value }),
    changePage: (value: number) => updateFilters({ page: value }),
    changePageSize: (value: number) => updateFilters({ pageSize: value }),
    resetFilters: () => updateFilters({ keyword: "", page: 1, pageSize: defaultPageSize }),
    refreshPresets: () => query.refetch(),
    savePreset: (preset: Partial<AdminPromptPreset>) => saveMutation.mutateAsync(preset),
    deletePreset: (id: string) => deleteMutation.mutateAsync(id),
    deletePresets: (ids: string[]) => batchDeleteMutation.mutateAsync(ids),
  };
}
