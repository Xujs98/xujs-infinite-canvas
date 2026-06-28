"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { App } from "antd";

import { getModelClassificationDetail, useModelClassificationsVersion, useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { AdminRole } from "@/services/api/role";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const handledConfigParams = useRef(false);
    const pathname = usePathname();
    const hydrateUser = useUserStore((state) => state.hydrateUser);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const loadPublicSystemSettings = useConfigStore((state) => state.loadPublicSystemSettings);
    const loadModelClassifications = useConfigStore((state) => state.loadModelClassifications);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const loadRoles = useConfigStore((state) => state.loadRoles);
    const isLoginPage = pathname === "/login" || pathname === "/admin/login";

    // 监听分类变化，自动适配视频秒数
    useModelClassificationsVersion();
    const videoModel = useConfigStore((state) => state.config.videoModel);
    const videoSeconds = useConfigStore((state) => state.config.videoSeconds);
    const adjustedRef = useRef(false);
    useEffect(() => {
        const detail = getModelClassificationDetail(videoModel);
        if (detail?.videoConfig?.durations?.length) {
            const durations = detail.videoConfig.durations;
            if (!durations.includes(videoSeconds) && videoSeconds !== "adaptive") {
                updateConfig("videoSeconds", durations[0]);
                adjustedRef.current = true;
            }
        }
    }, [videoModel, videoSeconds, updateConfig]);

    useEffect(() => {
        void loadPublicSettings();
        void loadPublicSystemSettings();
        void loadModelClassifications();
        // 加载角色数据并根据用户角色设置模型权限
        void (async () => {
            try {
                const roles = await loadRoles();
                const userRole = useUserStore.getState().user?.role;
                if (userRole && roles.length) {
                    const matched = roles.find((r: AdminRole) => r.name === userRole);
                    useConfigStore.setState({ roleAllowedModels: matched?.allowedModels || [] });
                }
            } catch {
                // ignore
            }
        })();
    }, [loadPublicSettings, loadPublicSystemSettings, loadModelClassifications, loadRoles]);

    useEffect(() => {
        if (!isLoginPage) void hydrateUser();
    }, [hydrateUser, isLoginPage]);

    // 用户登录态变化时重新加载角色权限
    const user = useUserStore((s) => s.user);
    useEffect(() => {
        if (!user || user.role === "guest") {
            useConfigStore.setState({ roleAllowedModels: [] });
            return;
        }
        void (async () => {
            const roles = await loadRoles();
            const matched = roles.find((r: AdminRole) => r.name === user.role);
            useConfigStore.setState({ roleAllowedModels: matched?.allowedModels || [] });
        })();
    }, [user, loadRoles]);

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const baseUrl = searchParams.get("baseUrl") || searchParams.get("baseurl");
        const apiKey = searchParams.get("apiKey") || searchParams.get("apikey");
        if (!baseUrl && !apiKey) return;
        if (!publicSettings) return;
        handledConfigParams.current = true;
        searchParams.delete("baseUrl");
        searchParams.delete("baseurl");
        searchParams.delete("apiKey");
        searchParams.delete("apikey");
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
        if (!publicSettings.modelChannel.allowCustomChannel) {
            openConfigDialog(false);
            message.error("后台未允许用户自定义渠道，请联系管理员进行配置");
            return;
        }
        updateConfig("channelMode", "local");
        if (baseUrl) updateConfig("baseUrl", baseUrl);
        if (apiKey) updateConfig("apiKey", apiKey);
        openConfigDialog(false);
    }, [message, openConfigDialog, publicSettings, updateConfig]);

    return <>{children}</>;
}
