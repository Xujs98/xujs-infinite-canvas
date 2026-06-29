"use client";

import { FileTextOutlined, HomeOutlined, KeyOutlined, LogoutOutlined, PictureOutlined, SafetyOutlined, SettingOutlined, ToolOutlined, TransactionOutlined, UserOutlined, NotificationOutlined, RobotOutlined, AppstoreOutlined, CloudServerOutlined } from "@ant-design/icons";
import { Flex, Layout, Typography, theme } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";

import { adminLayoutStyle } from "@/lib/app-theme";
import { getAdminColors } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

const adminMenus = [
    { key: "/admin/users", icon: <UserOutlined />, label: "用户管理" },
    { key: "/admin/credit-logs", icon: <TransactionOutlined />, label: "算力点日志" },
    { key: "/admin/redeem-codes", icon: <KeyOutlined />, label: "卡密管理" },
    { key: "/admin/announcements", icon: <NotificationOutlined />, label: "公告管理" },
    { key: "/admin/prompts", icon: <FileTextOutlined />, label: "提示词管理" },
    { key: "/admin/prompt-presets", icon: <FileTextOutlined />, label: "提示词预设" },
    { key: "/admin/assets", icon: <PictureOutlined />, label: "素材库" },
    { key: "/admin/model-classifications", icon: <AppstoreOutlined />, label: "模型管理" },
    { key: "/admin/roles", icon: <SafetyOutlined />, label: "角色管理" },
    { key: "/admin/agent", icon: <RobotOutlined />, label: "Agent 管理" },
    { key: "/admin/call-logs", icon: <FileTextOutlined />, label: "日志管理" },
    { key: "/admin/request-logs", icon: <CloudServerOutlined />, label: "请求管理" },
    { key: "/admin/settings", icon: <SettingOutlined />, label: "模型设置" },
    { key: "/admin/system-settings", icon: <ToolOutlined />, label: "系统设置" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
    const { token: antToken } = theme.useToken();
    const router = useRouter();
    const pathname = usePathname();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const logout = useUserStore((state) => state.clearSession);
    const publicSystemSettings = useConfigStore((state) => state.publicSystemSettings);
    const palette = useThemeStore((state) => state.palette);
    const adminColors = useMemo(() => getAdminColors(palette), [palette]);
    const siteName = publicSystemSettings?.siteName || "无限画布";
    const siteLogo = publicSystemSettings?.siteLogo;
    const activeKey = pathname.startsWith("/admin/system-settings")
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
                    : pathname.startsWith("/admin/prompt-presets")
                    ? "/admin/prompt-presets"
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
                width={adminLayoutStyle.siderWidth}
                style={{
                    height: "100vh",
                    overflow: "auto",
                    background: "#ffffff",
                    borderRight: "1px solid #f0f0f0",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {/* Logo 区域 */}
                <Flex align="center" gap={10} style={{ height: adminLayoutStyle.brandHeight, padding: "0 20px", borderBottom: "1px solid #f0f0f0", flexShrink: 0 }}>
                    {siteLogo ? (
                        <img src={siteLogo} alt={siteName} style={{ width: 28, height: 28, objectFit: "contain" }} />
                    ) : (
                        <span aria-hidden style={{ display: "inline-block", width: 28, height: 28, background: adminColors.primary, WebkitMask: "url(/logo.svg) center / contain no-repeat", mask: "url(/logo.svg) center / contain no-repeat" }} />
                    )}
                    <Typography.Text strong style={{ fontSize: 16, color: "#1a1a1a", letterSpacing: -0.3 }}>
                        {siteName}
                    </Typography.Text>
                </Flex>

                {/* 菜单 */}
                <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
                    {adminMenus.map((item) => {
                        const isActive = activeKey === item.key;
                        return (
                            <Link
                                key={item.key}
                                href={item.key}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "0 20px",
                                    height: 42,
                                    margin: "2px 8px",
                                    borderRadius: 8,
                                    color: isActive ? adminColors.primary : "#595959",
                                    background: isActive ? adminColors.light : "transparent",
                                    fontWeight: isActive ? 500 : 400,
                                    fontSize: 14,
                                    textDecoration: "none",
                                    transition: "all 0.2s",
                                    borderLeft: isActive ? `3px solid ${adminColors.primary}` : "3px solid transparent",
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
                                <span style={{ fontSize: 16, display: "flex", alignItems: "center" }}>{item.icon}</span>
                                {item.label}
                            </Link>
                        );
                    })}
                </div>

                {/* 底部操作 */}
                <div style={{ padding: "12px 8px", borderTop: "1px solid #f0f0f0", flexShrink: 0 }}>
                    <Link
                        href="/"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "0 12px",
                            height: 38,
                            borderRadius: 8,
                            color: "#595959",
                            textDecoration: "none",
                            fontSize: 14,
                            transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = adminColors.hover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                        <HomeOutlined />
                        前往画布
                    </Link>
                    <button
                        onClick={logout}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "0 12px",
                            height: 38,
                            width: "100%",
                            borderRadius: 8,
                            color: "#595959",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: 14,
                            fontFamily: "inherit",
                            transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = adminColors.hover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                        <LogoutOutlined />
                        退出登录
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
