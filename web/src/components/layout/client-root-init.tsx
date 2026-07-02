"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { App } from "antd";

import {
    getModelClassificationDetail,
    setModelClassificationsCache,
    setModelClassificationsMap,
    useModelClassificationsVersion,
    useConfigStore,
    type ModelClassificationDetail,
} from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { AdminRole } from "@/services/api/role";

type AppSocketMessage =
    | {
          type: "model-classifications-changed";
          data?: ModelClassificationDetail[];
      }
    | {
          type: "roles-changed";
          data?: AdminRole[];
      }
    | {
          type: string;
          [key: string]: unknown;
      };

function applyRolesToCurrentUser(roles: AdminRole[]) {
    const userRole = useUserStore.getState().user?.role;
    if (!userRole || userRole === "guest") {
        useConfigStore.setState({ roleAllowedModels: [] });
        return;
    }
    const matched = roles.find((role) => role.name === userRole);
    useConfigStore.setState({ roleAllowedModels: matched?.allowedModels || [] });
}

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
    const token = useUserStore((state) => state.token);
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
                applyRolesToCurrentUser(roles);
            } catch {
                // ignore
            }
        })();
    }, [loadPublicSettings, loadPublicSystemSettings, loadModelClassifications, loadRoles]);

    useEffect(() => {
        let socket: WebSocket | undefined;
        let reconnectTimer: number | undefined;
        let closed = false;

        const connect = () => {
            if (closed) return;
            const proto = window.location.protocol === "https:" ? "wss" : "ws";
            const wsHost = window.location.port === "3000" ? `${window.location.hostname}:8080` : window.location.host;
            const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
            socket = new WebSocket(`${proto}://${wsHost}/api/ws${tokenParam}`);
            socket.onclose = () => {
                if (!closed) reconnectTimer = window.setTimeout(connect, 3000);
            };
            socket.onmessage = (event) => {
                let payload: AppSocketMessage;
                try {
                    payload = JSON.parse(event.data) as AppSocketMessage;
                } catch {
                    return;
                }
                if (payload.type === "model-classifications-changed" && Array.isArray(payload.data)) {
                    const map: Record<string, string> = {};
                    for (const item of payload.data) {
                        if (item.modelName) map[item.modelName] = item.capability;
                    }
                    setModelClassificationsMap(map);
                    setModelClassificationsCache(payload.data);
                    void loadPublicSettings();
                    return;
                }
                if (payload.type === "model-classifications-changed") {
                    void loadModelClassifications();
                    void loadPublicSettings();
                    return;
                }
                if (payload.type === "roles-changed" && Array.isArray(payload.data)) {
                    applyRolesToCurrentUser(payload.data);
                    window.dispatchEvent(new CustomEvent("roles-changed", { detail: payload.data }));
                    void loadPublicSettings();
                    return;
                }
                if (payload.type === "roles-changed") {
                    void (async () => {
                        const roles = await loadRoles();
                        applyRolesToCurrentUser(roles);
                        window.dispatchEvent(new CustomEvent("roles-changed", { detail: roles }));
                    })();
                    void loadPublicSettings();
                }
            };
        };

        connect();
        return () => {
            closed = true;
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            socket?.close();
        };
    }, [loadModelClassifications, loadPublicSettings, token]);

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
            applyRolesToCurrentUser(roles);
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
