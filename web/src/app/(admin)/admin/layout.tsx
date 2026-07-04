"use client";

import { AppstoreOutlined, CloudServerOutlined, DashboardOutlined, FieldTimeOutlined, FileTextOutlined, HomeOutlined, KeyOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, NotificationOutlined, PictureOutlined, RobotOutlined, SafetyOutlined, SettingOutlined, ToolOutlined, TransactionOutlined, UserOutlined } from "@ant-design/icons";
import { App, Flex, Layout, Switch, Tag, Typography, theme } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { adminLayoutStyle } from "@/lib/app-theme";
import { getAdminColors } from "@/lib/canvas-theme";
import { fetchAdminServerOfflineStatus, setAdminServerOfflineStatus } from "@/services/api/admin";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

const adminMenus = [
    { key: "/admin/dashboard", icon: <DashboardOutlined />, label: "仪表盘" },
    { key: "/admin/users", icon: <UserOutlined />, label: "用户管理" },
    { key: "/admin/credit-logs", icon: <TransactionOutlined />, label: "算力点日志" },
    { key: "/admin/redeem-codes", icon: <KeyOutlined />, label: "卡密管理" },
    { key: "/admin/announcements", icon: <NotificationOutlined />, label: "公告管理" },
    { key: "/admin/prompts", icon: <FileTextOutlined />, label: "提示词管理" },
    { key: "/admin/prompt-presets", icon: <FileTextOutlined />, label: "提示词预设" },
    { key: "/admin/ai-text-agents", icon: <RobotOutlined />, label: "AIagent管理" },
    { key: "/admin/assets", icon: <PictureOutlined />, label: "素材库" },
    { key: "/admin/model-classifications", icon: <AppstoreOutlined />, label: "模型管理" },
    { key: "/admin/roles", icon: <SafetyOutlined />, label: "角色管理" },
    { key: "/admin/agent", icon: <RobotOutlined />, label: "Agent 管理" },
    { key: "/admin/call-logs", icon: <FileTextOutlined />, label: "日志管理" },
    { key: "/admin/request-logs", icon: <CloudServerOutlined />, label: "请求日志" },
    { key: "/admin/tasks", icon: <FieldTimeOutlined />, label: "任务管理" },
    { key: "/admin/settings", icon: <SettingOutlined />, label: "模型设置" },
    { key: "/admin/system-settings", icon: <ToolOutlined />, label: "系统设置" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    theme.useToken();
    const router = useRouter();
    const pathname = usePathname();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const logout = useUserStore((state) => state.clearSession);
    const publicSystemSettings = useConfigStore((state) => state.publicSystemSettings);
    const palette = useThemeStore((state) => state.palette);
    const [serverOffline, setServerOffline] = useState(false);
    const [serverOfflineLoading, setServerOfflineLoading] = useState(false);
    const [siderCollapsed, setSiderCollapsed] = useState(false);
    const adminColors = useMemo(() => getAdminColors(palette), [palette]);
    const siteName = publicSystemSettings?.siteName || "无限画布";
    const siteLogo = publicSystemSettings?.siteLogo;
    const activeKey = pathname.startsWith("/admin/dashboard")
        ? "/admin/dashboard"
        : pathname.startsWith("/admin/system-settings")
        ? "/admin/system-settings"
        : pathname.startsWith("/admin/roles")
          ? "/admin/roles"
          : pathname.startsWith("/admin/model-classifications")
            ? "/admin/model-classifications"
          : pathname.startsWith("/admin/settings")
            ? "/admin/settings"
            : pathname.startsWith("/admin/assets")
              ? "/admin/assets"
              : pathname.startsWith("/admin/agent")
                ? "/admin/agent"
                : pathname.startsWith("/admin/call-logs")
                  ? "/admin/call-logs"
                  : pathname.startsWith("/admin/request-logs")
                    ? "/admin/request-logs"
                    : pathname.startsWith("/admin/tasks")
                    ? "/admin/tasks"
                    : pathname.startsWith("/admin/prompt-presets")
                    ? "/admin/prompt-presets"
                    : pathname.startsWith("/admin/ai-text-agents")
                    ? "/admin/ai-text-agents"
                    : pathname.startsWith("/admin/prompts")
                    ? "/admin/prompts"
                    : pathname.startsWith("/admin/redeem-codes")
                      ? "/admin/redeem-codes"
                      : pathname.startsWith("/admin/announcements")
                        ? "/admin/announcements"
                        : pathname.startsWith("/admin/credit-logs")
                          ? "/admin/credit-logs"
                          : pathname.startsWith("/admin/users")
                            ? "/admin/users"
                            : "";

    useEffect(() => {
        if (!isReady) return;
        if (!token) {
            router.replace("/login?redirect=/admin");
            return;
        }
        if (user?.role !== "admin") {
            router.replace("/");
        }
    }, [isReady, router, token, user?.role]);

    useEffect(() => {
        if (!token || user?.role !== "admin") return;
        fetchAdminServerOfflineStatus(token)
            .then((status) => setServerOffline(Boolean(status.offline)))
            .catch(() => undefined);
    }, [token, user?.role]);

    const toggleServerOffline = async (offline: boolean) => {
        setServerOfflineLoading(true);
        try {
            const status = await setAdminServerOfflineStatus(token, offline);
            setServerOffline(Boolean(status.offline));
            message.success(status.offline ? "已开启测试离线模式" : "已恢复服务端在线");
        } catch (err) {
            message.error(err instanceof Error ? err.message : "切换失败");
        } finally {
            setServerOfflineLoading(false);
        }
    };

    const navItemBase = {
        display: "flex",
        alignItems: "center",
        justifyContent: siderCollapsed ? "center" : "flex-start",
        gap: siderCollapsed ? 0 : 10,
        height: 42,
        margin: "2px 8px",
        borderRadius: 8,
        textDecoration: "none",
        fontSize: 14,
        transition: "background 0.2s, color 0.2s, padding 0.2s",
    } as const;

    if (!isReady || !token || user?.role !== "admin") {
        return (
            <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#f0f2f5" }}>
                <span />
            </div>
        );
    }

    return (
        <Layout hasSider style={{ height: "100vh", overflow: "hidden", background: "#f0f2f5" }}>
            {/* 侧边栏 */}
            <Layout.Sider
                width={siderCollapsed ? 72 : adminLayoutStyle.siderWidth}
                style={{
                    height: "100vh",
                    overflow: "auto",
                    background: "#ffffff",
                    borderRight: "1px solid #f0f0f0",
                    display: "flex",
                    flexDirection: "column",
                    transition: "width 0.22s ease",
                }}
            >
                {/* Logo 区域 */}
                <Flex align="center" justify={siderCollapsed ? "center" : "space-between"} gap={10} style={{ height: adminLayoutStyle.brandHeight, padding: siderCollapsed ? "0 12px" : "0 12px 0 20px", borderBottom: "1px solid #f0f0f0", flexShrink: 0 }}>
                    <Flex align="center" gap={10} style={{ minWidth: 0, display: siderCollapsed ? "none" : "flex" }}>
                        {siteLogo ? (
                            <img src={siteLogo} alt={siteName} style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }} />
                        ) : (
                            <span aria-hidden style={{ display: "inline-block", width: 28, height: 28, flexShrink: 0, background: adminColors.primary, WebkitMask: "url(/logo.svg) center / contain no-repeat", mask: "url(/logo.svg) center / contain no-repeat" }} />
                        )}
                        <Typography.Text strong style={{ fontSize: 16, color: "#1a1a1a", letterSpacing: -0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {siteName}
                        </Typography.Text>
                    </Flex>
                    <button
                        type="button"
                        aria-label={siderCollapsed ? "展开侧边栏" : "折叠侧边栏"}
                        title={siderCollapsed ? "展开侧边栏" : "折叠侧边栏"}
                        onClick={() => setSiderCollapsed((collapsed) => !collapsed)}
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            background: siderCollapsed ? adminColors.light : "#ffffff",
                            color: adminColors.primary,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = adminColors.hover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = siderCollapsed ? adminColors.light : "#ffffff"; }}
                    >
                        {siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                    </button>
                </Flex>

                {/* 菜单 */}
                <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
                    {adminMenus.map((item) => {
                        const isActive = activeKey === item.key;
                        return (
                            <Link
                                key={item.key}
                                href={item.key}
                                title={siderCollapsed ? item.label : undefined}
                                style={{
                                    ...navItemBase,
                                    padding: siderCollapsed ? "0" : "0 20px",
                                    color: isActive ? adminColors.primary : "#595959",
                                    background: isActive ? adminColors.light : "transparent",
                                    fontWeight: isActive ? 500 : 400,
                                    borderLeft: isActive && !siderCollapsed ? `3px solid ${adminColors.primary}` : "3px solid transparent",
                                }}
                                onMouseEnter={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.background = adminColors.hover;
                                        e.currentTarget.style.color = "#1a1a1a";
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.background = "transparent";
                                        e.currentTarget.style.color = "#595959";
                                    }
                                }}
                            >
                                <span style={{ fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", width: 20 }}>{item.icon}</span>
                                {!siderCollapsed ? <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span> : null}
                            </Link>
                        );
                    })}
                </div>

                {/* 底部操作 */}
                <div style={{ padding: siderCollapsed ? "12px 8px" : "12px 8px", borderTop: "1px solid #f0f0f0", flexShrink: 0 }}>
                    {siderCollapsed ? (
                        <button
                            type="button"
                            aria-label={serverOffline ? "测试离线已开启" : "服务端在线"}
                            title={serverOffline ? "测试离线已开启" : "服务端在线"}
                            disabled={serverOfflineLoading}
                            onClick={() => void toggleServerOffline(!serverOffline)}
                            style={{
                                ...navItemBase,
                                width: "calc(100% - 16px)",
                                padding: 0,
                                border: `1px solid ${serverOffline ? "#ffccc7" : "#b7eb8f"}`,
                                background: serverOffline ? "#fff1f0" : "#f6ffed",
                                color: serverOffline ? "#cf1322" : "#389e0d",
                                cursor: serverOfflineLoading ? "wait" : "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: serverOffline ? "#f5222d" : "#52c41a", boxShadow: `0 0 0 4px ${serverOffline ? "#fff1f0" : "#f6ffed"}` }} />
                        </button>
                    ) : (
                        <div
                            style={{
                                margin: "0 8px 10px",
                                padding: "10px 12px",
                                borderRadius: 8,
                                background: serverOffline ? "#fff1f0" : "#f6ffed",
                                border: `1px solid ${serverOffline ? "#ffccc7" : "#b7eb8f"}`,
                            }}
                        >
                            <Flex align="center" justify="space-between" gap={10}>
                                <div>
                                    <Typography.Text strong style={{ display: "block", fontSize: 13 }}>
                                        测试离线
                                    </Typography.Text>
                                    <Tag color={serverOffline ? "red" : "green"} style={{ marginTop: 6 }}>
                                        {serverOffline ? "服务端离线" : "服务端在线"}
                                    </Tag>
                                </div>
                                <Switch
                                    size="small"
                                    checked={serverOffline}
                                    loading={serverOfflineLoading}
                                    onChange={(checked) => void toggleServerOffline(checked)}
                                />
                            </Flex>
                        </div>
                    )}
                    <Link
                        href="/"
                        title={siderCollapsed ? "前往画布" : undefined}
                        style={{
                            ...navItemBase,
                            padding: siderCollapsed ? "0" : "0 12px",
                            color: "#595959",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = adminColors.hover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                        <HomeOutlined />
                        {!siderCollapsed ? "前往画布" : null}
                    </Link>
                    <button
                        type="button"
                        title={siderCollapsed ? "退出登录" : undefined}
                        onClick={logout}
                        style={{
                            ...navItemBase,
                            padding: siderCollapsed ? "0" : "0 12px",
                            width: "calc(100% - 16px)",
                            color: "#595959",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = adminColors.hover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                        <LogoutOutlined />
                        {!siderCollapsed ? "退出登录" : null}
                    </button>
                </div>
            </Layout.Sider>

            {/* 右侧内容区 */}
            <Layout style={{ background: "#f0f2f5" }}>
                <Layout.Content style={{ minHeight: 0, overflow: "auto", padding: 0 }}>
                    {children}
                </Layout.Content>
            </Layout>
        </Layout>
    );
}
