"use client";

import {
    ApiOutlined,
    AppstoreOutlined,
    BarsOutlined,
    BellOutlined,
    CloudServerOutlined,
    CloudDownloadOutlined,
    CrownOutlined,
    DashboardOutlined,
    DownOutlined,
    FieldTimeOutlined,
    FileTextOutlined,
    HomeOutlined,
    KeyOutlined,
    LineChartOutlined,
    LogoutOutlined,
    MenuUnfoldOutlined,
    NotificationOutlined,
    PictureOutlined,
    RobotOutlined,
    SafetyOutlined,
    WarningOutlined,
    SettingOutlined,
    ToolOutlined,
    TransactionOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { App, Avatar, Button, Drawer, Dropdown, Flex, Grid, Layout, Switch, Tag, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";

import { fetchAdminServerOfflineStatus, setAdminServerOfflineStatus } from "@/services/api/admin";
import { DEFAULT_SITE_LOGO, DEFAULT_SITE_NAME } from "@/constant/brand";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

import "./admin-shell.css";

type AdminMenuItem = {
    key: string;
    icon: ReactNode;
    label: string;
};

type AdminMenuGroup = {
    key: string;
    label: string;
    icon: ReactNode;
    items: AdminMenuItem[];
};

const adminMenuGroups: AdminMenuGroup[] = [
    {
        key: "overview",
        label: "总览",
        icon: <DashboardOutlined />,
        items: [
            { key: "/admin/dashboard", icon: <DashboardOutlined />, label: "运营概览" },
            { key: "/admin/analytics", icon: <LineChartOutlined />, label: "数据看板" },
        ],
    },
    {
        key: "operations",
        label: "业务运营",
        icon: <TransactionOutlined />,
        items: [
            { key: "/admin/users", icon: <UserOutlined />, label: "用户管理" },
            { key: "/admin/credit-logs", icon: <TransactionOutlined />, label: "算力点流水" },
            { key: "/admin/redeem-codes", icon: <KeyOutlined />, label: "兑换码管理" },
            { key: "/admin/subscriptions", icon: <CrownOutlined />, label: "订阅管理" },
            { key: "/admin/announcements", icon: <NotificationOutlined />, label: "公告管理" },
        ],
    },
    {
        key: "content",
        label: "内容与模型",
        icon: <AppstoreOutlined />,
        items: [
            { key: "/admin/prompts", icon: <FileTextOutlined />, label: "提示词管理" },
            { key: "/admin/prompt-presets", icon: <BarsOutlined />, label: "提示词预设" },
            { key: "/admin/ai-text-agents", icon: <RobotOutlined />, label: "AI Agent" },
            { key: "/admin/assets", icon: <PictureOutlined />, label: "素材库" },
            { key: "/admin/model-classifications", icon: <AppstoreOutlined />, label: "模型分类" },
        ],
    },
    {
        key: "system",
        label: "系统运维",
        icon: <ToolOutlined />,
        items: [
            { key: "/admin/roles", icon: <SafetyOutlined />, label: "角色权限" },
            { key: "/admin/agent", icon: <ApiOutlined />, label: "Agent 服务" },
            { key: "/admin/call-logs", icon: <FileTextOutlined />, label: "调用日志" },
            { key: "/admin/request-logs", icon: <CloudServerOutlined />, label: "使用日志" },
            { key: "/admin/risk-events", icon: <WarningOutlined />, label: "风险事件" },
            { key: "/admin/tasks", icon: <FieldTimeOutlined />, label: "任务管理" },
            { key: "/admin/app-releases", icon: <CloudDownloadOutlined />, label: "版本管理" },
            { key: "/admin/settings", icon: <SettingOutlined />, label: "模型设置" },
            { key: "/admin/system-settings", icon: <ToolOutlined />, label: "系统设置" },
        ],
    },
];

const adminMenus = adminMenuGroups.flatMap((group) => group.items);

const adminPageDescriptions: Record<string, string> = {
    "/admin/dashboard": "平台运营数据与服务状态总览",
    "/admin/analytics": "分析模型调用表现与用户活跃消费",
    "/admin/users": "管理平台用户、角色与账户状态",
    "/admin/credit-logs": "查看用户算力点变动记录",
    "/admin/redeem-codes": "生成和管理平台兑换码",
    "/admin/subscriptions": "配置算力点订阅套餐与角色升级",
    "/admin/announcements": "发布和管理平台公告",
    "/admin/prompts": "维护平台提示词内容",
    "/admin/prompt-presets": "管理常用提示词预设",
    "/admin/ai-text-agents": "配置文本智能体与输入来源",
    "/admin/assets": "管理平台公共素材资源",
    "/admin/model-classifications": "配置模型类型与能力参数",
    "/admin/roles": "管理角色权限与模型访问范围",
    "/admin/agent": "管理画布 Agent 服务与访问控制",
    "/admin/call-logs": "查看模型调用日志与结果",
    "/admin/request-logs": "追踪平台使用、模型生成、算力点与错误诊断",
    "/admin/risk-events": "识别并处置异常登录、重放请求与访问风险",
    "/admin/tasks": "跟踪图片与视频生成任务",
    "/admin/app-releases": "发布和管理桌面客户端安装包",
    "/admin/settings": "配置 AI 模型渠道和费用",
    "/admin/system-settings": "配置站点、注册与通知策略",
};

function getActiveMenu(pathname: string) {
    return adminMenus.find((item) => pathname === item.key || pathname.startsWith(`${item.key}/`)) ?? adminMenus[0];
}

function getMenuGroupForItem(itemKey: string) {
    return adminMenuGroups.find((group) => group.items.some((item) => item.key === itemKey)) ?? adminMenuGroups[0];
}

export default function AdminLayout({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const screens = Grid.useBreakpoint();
    const router = useRouter();
    const pathname = usePathname();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const logout = useUserStore((state) => state.clearSession);
    const publicSystemSettings = useConfigStore((state) => state.publicSystemSettings);
    const [serverOffline, setServerOffline] = useState(false);
    const [serverOfflineLoading, setServerOfflineLoading] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const activeMenu = getActiveMenu(pathname);
    const activeMenuGroup = getMenuGroupForItem(activeMenu.key);
    const [openMenuGroups, setOpenMenuGroups] = useState<string[]>([activeMenuGroup.key]);
    const isDesktop = Boolean(screens.lg);
    const siteName = publicSystemSettings?.siteName || DEFAULT_SITE_NAME;
    const siteLogo = publicSystemSettings?.siteLogo || DEFAULT_SITE_LOGO;
    const displayName = user?.displayName || user?.username || "管理员";
    const shellStyle = { "--admin-accent": "#079a87", "--admin-accent-soft": "#e9faf6" } as CSSProperties;

    useEffect(() => {
        if (!isReady) return;
        if (!token) {
            router.replace("/login?redirect=/admin");
            return;
        }
        if (user?.role !== "admin") router.replace("/");
    }, [isReady, router, token, user?.role]);

    useEffect(() => {
        if (!token || user?.role !== "admin") return;
        fetchAdminServerOfflineStatus(token)
            .then((status) => setServerOffline(Boolean(status.offline)))
            .catch(() => undefined);
    }, [token, user?.role]);

    useEffect(() => setMobileMenuOpen(false), [pathname]);

    useEffect(() => {
        setOpenMenuGroups((current) => (current.includes(activeMenuGroup.key) ? current : [...current, activeMenuGroup.key]));
    }, [activeMenuGroup.key]);

    const toggleMenuGroup = (groupKey: string) => {
        setOpenMenuGroups((current) => (current.includes(groupKey) ? current.filter((key) => key !== groupKey) : [...current, groupKey]));
    };

    const toggleServerOffline = async (offline: boolean) => {
        setServerOfflineLoading(true);
        try {
            const status = await setAdminServerOfflineStatus(token, offline);
            setServerOffline(Boolean(status.offline));
            message.success(status.offline ? "已开启测试离线模式" : "已恢复服务端在线");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "切换失败");
        } finally {
            setServerOfflineLoading(false);
        }
    };

    const accountMenu: MenuProps["items"] = [{ key: "canvas", icon: <HomeOutlined />, label: <Link href="/">返回创作台</Link> }, { type: "divider" }, { key: "logout", icon: <LogoutOutlined />, danger: true, label: "退出登录", onClick: logout }];

    const renderBrand = (collapsed: boolean) => (
        <div className={`admin-brand ${collapsed ? "is-collapsed" : ""}`}>
            <Link href="/admin/dashboard" className="admin-brand-link" aria-label={`${siteName} 管理后台`}>
                <span className="admin-brand-logo">
                    <img src={siteLogo} alt="" />
                </span>
                {!collapsed ? (
                    <span className="admin-brand-copy">
                        <strong>{siteName}</strong>
                        <small>商业管理平台</small>
                    </span>
                ) : null}
            </Link>
        </div>
    );

    const renderNavigation = (collapsed: boolean) => (
        <nav className="admin-navigation" aria-label="后台主导航">
            {adminMenuGroups.map((group) => {
                const groupOpen = openMenuGroups.includes(group.key);
                const groupActive = activeMenuGroup.key === group.key;
                const groupVisible = collapsed || groupOpen;
                const childrenId = `admin-nav-group-${group.key}`;

                return (
                    <div className={`admin-nav-group ${groupActive ? "has-active-item" : ""}`} key={group.key}>
                        {!collapsed ? (
                            <button type="button" className={`admin-nav-group-trigger ${groupOpen ? "is-open" : ""}`} aria-expanded={groupOpen} aria-controls={childrenId} onClick={() => toggleMenuGroup(group.key)}>
                                <span className="admin-nav-group-icon">{group.icon}</span>
                                <span className="admin-nav-group-title">{group.label}</span>
                                <DownOutlined className="admin-nav-group-chevron" />
                            </button>
                        ) : (
                            <div className="admin-nav-divider" />
                        )}
                        <div className={`admin-nav-children ${groupVisible ? "is-open" : ""}`} id={childrenId} aria-hidden={!groupVisible}>
                            <div className="admin-nav-children-inner">
                                {group.items.map((item) => {
                                    const active = activeMenu.key === item.key;
                                    const link = (
                                        <Link className={`admin-nav-item ${!collapsed ? "admin-nav-subitem" : ""} ${active ? "is-active" : ""}`} href={item.key} aria-current={active ? "page" : undefined} tabIndex={groupVisible ? undefined : -1}>
                                            <span className="admin-nav-icon">{item.icon}</span>
                                            {!collapsed ? <span className="admin-nav-label">{item.label}</span> : null}
                                            {!collapsed && active ? <span className="admin-nav-active-dot" /> : null}
                                        </Link>
                                    );
                                    return collapsed ? (
                                        <Tooltip title={item.label} placement="right" key={item.key}>
                                            {link}
                                        </Tooltip>
                                    ) : (
                                        <span key={item.key}>{link}</span>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })}
        </nav>
    );

    const renderSidebarFooter = (collapsed: boolean) => (
        <div className="admin-sidebar-footer">
            <div className={`admin-server-state ${serverOffline ? "is-offline" : ""} ${collapsed ? "is-collapsed" : ""}`}>
                <span className="admin-server-state-dot" />
                {!collapsed ? (
                    <div className="admin-server-state-copy">
                        <strong>{serverOffline ? "测试离线" : "系统运行正常"}</strong>
                        <span>{serverOffline ? "客户端服务已暂停" : "API 与实时服务在线"}</span>
                    </div>
                ) : null}
                {!collapsed ? <Switch size="small" checked={serverOffline} loading={serverOfflineLoading} onChange={(checked) => void toggleServerOffline(checked)} aria-label="切换测试离线模式" /> : null}
            </div>
        </div>
    );

    const sidebar = (collapsed: boolean) => (
        <div className="admin-sidebar-inner">
            {renderBrand(collapsed)}
            {renderNavigation(collapsed)}
            {renderSidebarFooter(collapsed)}
        </div>
    );

    if (!isReady || !token || user?.role !== "admin") return <div className="admin-loading-screen" />;

    return (
        <Layout className="admin-shell" style={shellStyle} hasSider>
            {isDesktop ? (
                <Layout.Sider className="admin-sider" width={252} trigger={null} theme="light">
                    {sidebar(false)}
                </Layout.Sider>
            ) : null}

            <Drawer className="admin-mobile-drawer" placement="left" size={280} open={!isDesktop && mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} closable={false} styles={{ body: { padding: 0 } }}>
                {sidebar(false)}
            </Drawer>

            <Layout className="admin-main-layout">
                <Layout.Header className="admin-topbar">
                    <Flex align="center" gap={12} className="admin-topbar-context">
                        {!isDesktop ? <Button type="text" icon={<MenuUnfoldOutlined />} aria-label="打开导航" onClick={() => setMobileMenuOpen(true)} /> : null}
                        <div>
                            <Typography.Title level={5} className="admin-topbar-title">
                                {activeMenu.label}
                            </Typography.Title>
                            <Typography.Text className="admin-topbar-eyebrow">{adminPageDescriptions[activeMenu.key]}</Typography.Text>
                        </div>
                    </Flex>
                    <Flex align="center" gap={8}>
                        <Tag className={`admin-live-tag ${serverOffline ? "is-offline" : ""}`}>
                            <span className="admin-live-dot" />
                            {serverOffline ? "服务离线" : "服务在线"}
                        </Tag>
                        <Tooltip title="公告中心">
                            <Link href="/admin/announcements" className="admin-icon-action" aria-label="公告中心">
                                <BellOutlined />
                            </Link>
                        </Tooltip>
                        <Dropdown menu={{ items: accountMenu }} placement="bottomRight" trigger={["click"]}>
                            <button type="button" className="admin-account-button" aria-label="账户菜单">
                                <Avatar size={34} src={user.avatarUrl || undefined} icon={<UserOutlined />} />
                                {isDesktop ? (
                                    <span className="admin-account-copy">
                                        <strong>{displayName}</strong>
                                        <small>超级管理员</small>
                                    </span>
                                ) : null}
                            </button>
                        </Dropdown>
                    </Flex>
                </Layout.Header>
                <Layout.Content className="admin-content">
                    <main className="admin-content-inner">{children}</main>
                </Layout.Content>
            </Layout>
        </Layout>
    );
}
