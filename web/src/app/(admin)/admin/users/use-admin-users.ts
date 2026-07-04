"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import { adjustAdminUserCredits, batchDeleteAdminUsers, batchUpdateAdminUserStatus, deleteAdminUser, fetchAdminUsers, saveAdminUser, type AdminUser } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;

export function useAdminUsers() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const clearSession = useUserStore((state) => state.clearSession);
    const [keyword, setKeyword] = useState("");
    const [role, setRole] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(defaultPageSize);

    const query = useQuery({
        queryKey: ["admin", "users", token, keyword, role, status, page, pageSize],
        queryFn: () => fetchAdminUsers(token, { keyword, role, status, page, pageSize }),
        enabled: Boolean(token),
        retry: false,
        refetchInterval: 15000,
    });

    const saveMutation = useMutation({
        mutationFn: (user: Partial<AdminUser> & { password?: string }) => saveAdminUser(token, user),
        onSuccess: async (_, user) => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
            message.success(user.id ? "用户已保存" : "用户已新增");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "保存失败"),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminUser(token, id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
            message.success("用户已删除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "删除失败"),
    });

    const creditMutation = useMutation({
        mutationFn: ({ id, credits }: { id: string; credits: number }) => adjustAdminUserCredits(token, id, credits),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
            message.success("算力点已调整");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "调整失败"),
    });

    const batchDeleteMutation = useMutation({
        mutationFn: (ids: string[]) => batchDeleteAdminUsers(token, ids),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
            message.success("用户已批量删除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "批量删除失败"),
    });

    const batchStatusMutation = useMutation({
        mutationFn: ({ ids, status }: { ids: string[]; status: "active" | "ban" }) => batchUpdateAdminUserStatus(token, ids, status),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
            message.success("用户状态已更新");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "状态更新失败"),
    });

    useEffect(() => {
        if (query.isError) {
            const errorMessage = query.error instanceof Error ? query.error.message : "读取用户失败";
            message.error(errorMessage);
            if (errorMessage.includes("未登录") || errorMessage.includes("权限不足") || errorMessage.includes("登录状态无效")) clearSession();
        }
    }, [clearSession, message, query.error, query.isError]);

    useEffect(() => {
        const refreshOnlineStatus = () => {
            void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
        };
        window.addEventListener("online-status-changed", refreshOnlineStatus);
        return () => window.removeEventListener("online-status-changed", refreshOnlineStatus);
    }, [queryClient]);

    const updateFilters = (next: Partial<{ keyword: string; role: string; status: string; page: number; pageSize: number }>) => {
        const queryState = { keyword, role, status, page, pageSize, ...next };
        if (next.keyword !== undefined || next.role !== undefined || next.status !== undefined || next.pageSize !== undefined) queryState.page = 1;
        setKeyword(queryState.keyword);
        setRole(queryState.role);
        setStatus(queryState.status);
        setPage(queryState.page);
        setPageSize(queryState.pageSize);
    };

    const data = query.data;

    return {
        users: data?.items || [],
        keyword,
        role,
        status,
        page,
        pageSize,
        total: data?.total || 0,
        isLoading: query.isFetching || saveMutation.isPending || deleteMutation.isPending || creditMutation.isPending || batchDeleteMutation.isPending || batchStatusMutation.isPending,
        searchUsers: (value = keyword) => updateFilters({ keyword: value }),
        changeRole: (value: string) => updateFilters({ role: value }),
        changeStatus: (value: string) => updateFilters({ status: value }),
        changePage: (value: number) => updateFilters({ page: value }),
        changePageSize: (value: number) => updateFilters({ pageSize: value }),
        resetFilters: () => updateFilters({ keyword: "", role: "", status: "", page: 1, pageSize: defaultPageSize }),
        refreshUsers: () => query.refetch(),
        saveUser: (user: Partial<AdminUser> & { password?: string }) => saveMutation.mutateAsync(user),
        adjustCredits: (id: string, credits: number) => creditMutation.mutateAsync({ id, credits }),
        deleteUser: (id: string) => deleteMutation.mutateAsync(id),
        batchDeleteUsers: (ids: string[]) => batchDeleteMutation.mutateAsync(ids),
        batchUpdateStatus: (ids: string[], status: "active" | "ban") => batchStatusMutation.mutateAsync({ ids, status }),
    };
}
