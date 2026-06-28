"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import { batchDeleteAdminRedeemCodes, deleteAdminRedeemCode, fetchAdminRedeemCodes, generateAdminRedeemCodes, type AdminGenerateRedeemCodesRequest, type AdminRedeemCode } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;

export function useAdminRedeemCodes() {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const token = useUserStore((state) => state.token);
    const clearSession = useUserStore((state) => state.clearSession);
    const [keyword, setKeyword] = useState("");
    const [type, setType] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(defaultPageSize);

    const query = useQuery({
        queryKey: ["admin", "redeem-codes", token, keyword, type, status, page, pageSize],
        queryFn: () => fetchAdminRedeemCodes(token, { keyword, type, status, page, pageSize }),
        enabled: Boolean(token),
        retry: false,
    });

    const generateMutation = useMutation({
        mutationFn: (payload: AdminGenerateRedeemCodesRequest) => generateAdminRedeemCodes(token, payload),
        onSuccess: async (_, payload) => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "redeem-codes"] });
            message.success(`已生成 ${payload.count} 张卡密`);
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "生成失败"),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteAdminRedeemCode(token, id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "redeem-codes"] });
            message.success("卡密已删除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "删除失败"),
    });

    const batchDeleteMutation = useMutation({
        mutationFn: (ids: string[]) => batchDeleteAdminRedeemCodes(token, ids),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["admin", "redeem-codes"] });
            message.success("卡密已批量删除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "批量删除失败"),
    });

    useEffect(() => {
        if (query.isError) {
            const errorMessage = query.error instanceof Error ? query.error.message : "读取卡密失败";
            message.error(errorMessage);
            if (errorMessage.includes("未登录") || errorMessage.includes("权限不足") || errorMessage.includes("登录状态无效")) clearSession();
        }
    }, [clearSession, message, query.error, query.isError]);

    const updateFilters = (next: Partial<{ keyword: string; type: string; status: string; page: number; pageSize: number }>) => {
        const queryState = { keyword, type, status, page, pageSize, ...next };
        if (next.keyword !== undefined || next.type !== undefined || next.status !== undefined || next.pageSize !== undefined) queryState.page = 1;
        setKeyword(queryState.keyword);
        setType(queryState.type);
        setStatus(queryState.status);
        setPage(queryState.page);
        setPageSize(queryState.pageSize);
    };

    const data = query.data;

    return {
        codes: data?.items || [],
        keyword,
        type,
        status,
        page,
        pageSize,
        total: data?.total || 0,
        isLoading: query.isFetching || generateMutation.isPending || deleteMutation.isPending || batchDeleteMutation.isPending,
        searchCodes: (value = keyword) => updateFilters({ keyword: value }),
        changeType: (value: string) => updateFilters({ type: value }),
        changeStatus: (value: string) => updateFilters({ status: value }),
        changePage: (value: number) => updateFilters({ page: value }),
        changePageSize: (value: number) => updateFilters({ pageSize: value }),
        resetFilters: () => updateFilters({ keyword: "", type: "", status: "", page: 1, pageSize: defaultPageSize }),
        refreshCodes: () => query.refetch(),
        generateCodes: (payload: AdminGenerateRedeemCodesRequest) => generateMutation.mutateAsync(payload),
        deleteCode: (id: string) => deleteMutation.mutateAsync(id),
        batchDeleteCodes: (ids: string[]) => batchDeleteMutation.mutateAsync(ids),
    };
}
