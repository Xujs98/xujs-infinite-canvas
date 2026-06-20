"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import {
  fetchAdminAnnouncements,
  saveAdminAnnouncement,
  deleteAdminAnnouncement,
  batchDeleteAnnouncements,
  batchUpdateAnnouncementPinned,
  type AdminAnnouncement,
} from "@/services/api/admin-announcements";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;

export function useAdminAnnouncements() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const token = useUserStore((state) => state.token);
  const clearSession = useUserStore((state) => state.clearSession);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const query = useQuery({
    queryKey: ["admin", "announcements", token, keyword, status, page, pageSize],
    queryFn: () => fetchAdminAnnouncements(token, { keyword, status, page, pageSize }),
    enabled: Boolean(token),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: (announcement: Partial<AdminAnnouncement>) => saveAdminAnnouncement(token, announcement),
    onSuccess: async (_, announcement) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] });
      message.success(announcement.id ? "公告已保存" : "公告已创建");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "保存失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminAnnouncement(token, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] });
      message.success("公告已删除");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "删除失败"),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => batchDeleteAnnouncements(token, ids),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] });
      message.success("批量删除成功");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "批量删除失败"),
  });

  const batchPinnedMutation = useMutation({
    mutationFn: ({ ids, pinned }: { ids: string[]; pinned: boolean }) => batchUpdateAnnouncementPinned(token, ids, pinned),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] });
      message.success("操作成功");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "操作失败"),
  });

  useEffect(() => {
    if (query.isError) {
      const errorMessage = query.error instanceof Error ? query.error.message : "读取公告失败";
      message.error(errorMessage);
      if (errorMessage.includes("未登录") || errorMessage.includes("权限不足") || errorMessage.includes("登录状态无效")) clearSession();
    }
  }, [clearSession, message, query.error, query.isError]);

  const updateFilters = (next: Partial<{ keyword: string; status: string; page: number; pageSize: number }>) => {
    const queryState = { keyword, status, page, pageSize, ...next };
    if (next.keyword !== undefined || next.status !== undefined || next.pageSize !== undefined) queryState.page = 1;
    setKeyword(queryState.keyword);
    setStatus(queryState.status);
    setPage(queryState.page);
    setPageSize(queryState.pageSize);
  };

  const data = query.data;

  return {
    announcements: data?.items || [],
    keyword,
    status,
    page,
    pageSize,
    total: data?.total || 0,
    isLoading: query.isFetching || saveMutation.isPending || deleteMutation.isPending || batchDeleteMutation.isPending || batchPinnedMutation.isPending,
    searchAnnouncements: (value = keyword) => updateFilters({ keyword: value }),
    changeStatus: (value: string) => updateFilters({ status: value }),
    changePage: (value: number) => updateFilters({ page: value }),
    changePageSize: (value: number) => updateFilters({ pageSize: value }),
    resetFilters: () => updateFilters({ keyword: "", status: "", page: 1, pageSize: defaultPageSize }),
    refreshAnnouncements: () => query.refetch(),
    saveAnnouncement: (announcement: Partial<AdminAnnouncement>) => saveMutation.mutateAsync(announcement),
    deleteAnnouncement: (id: string) => deleteMutation.mutateAsync(id),
    batchDeleteAnnouncements: (ids: string[]) => batchDeleteMutation.mutateAsync(ids),
    batchUpdatePinned: (ids: string[], pinned: boolean) => batchPinnedMutation.mutateAsync({ ids, pinned }),
  };
}
