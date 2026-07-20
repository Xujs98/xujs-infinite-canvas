"use client";

import { ApiOutlined, AppstoreOutlined, ArrowRightOutlined, CheckCircleFilled, ClockCircleOutlined, DesktopOutlined, MobileOutlined, ReloadOutlined, SafetyCertificateOutlined, SettingOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Col, Flex, Progress, Row, Skeleton, Typography } from "antd";
import Link from "next/link";

import { fetchAdminDashboardStats } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const quickActions = [
    { href: "/admin/users", label: "管理用户", description: "账户、权限与会员", icon: <UserOutlined /> },
    { href: "/admin/model-classifications", label: "配置模型", description: "模型分类与能力", icon: <AppstoreOutlined /> },
    { href: "/admin/settings", label: "模型渠道", description: "上游渠道与计费", icon: <SettingOutlined /> },
    { href: "/admin/request-logs", label: "使用日志", description: "检查使用记录与错误详情", icon: <ApiOutlined /> },
];

export default function AdminDashboardPage() {
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const query = useQuery({
        queryKey: ["admin", "dashboard", token],
        queryFn: () => fetchAdminDashboardStats(token),
        enabled: Boolean(token),
        refetchInterval: 15_000,
    });
    const stats = query.data;
    const onlineUsers = stats?.onlineUsers ?? 0;
    const totalUsers = stats?.totalUsers ?? 0;
    const onlineAppUsers = stats?.onlineAppUsers ?? 0;
    const onlineWebUsers = stats?.onlineWebUsers ?? 0;
    const onlineConnections = stats?.onlineConnections ?? 0;
    const modelCount = stats?.modelCount ?? 0;
    const onlineRate = totalUsers > 0 ? Math.round((onlineUsers / totalUsers) * 100) : 0;
    const channelTotal = Math.max(onlineAppUsers + onlineWebUsers, 1);
    const appPercent = Math.round((onlineAppUsers / channelTotal) * 100);
    const webPercent = Math.round((onlineWebUsers / channelTotal) * 100);
    const lastUpdated = query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString("zh-CN", { hour12: false }) : "--:--:--";
    const displayName = user?.displayName || user?.username || "管理员";

    const metrics = [
        { title: "在线用户", value: onlineUsers, suffix: "人", note: `占全部用户 ${onlineRate}%`, icon: <TeamOutlined />, tone: "teal" },
        { title: "注册用户", value: totalUsers, suffix: "人", note: "平台累计账户", icon: <UserOutlined />, tone: "blue" },
        { title: "可用模型", value: modelCount, suffix: "个", note: "当前模型配置", icon: <AppstoreOutlined />, tone: "violet" },
        { title: "实时连接", value: onlineConnections, suffix: "条", note: "WebSocket 活跃连接", icon: <ApiOutlined />, tone: "amber" },
    ];

    return (
        <div className="admin-dashboard-page">
            <Flex className="admin-page-heading" align="flex-end" justify="space-between" gap={16} wrap>
                <div>
                    <Typography.Text className="admin-page-kicker">BUSINESS OVERVIEW</Typography.Text>
                    <Typography.Title level={2}>欢迎回来，{displayName}</Typography.Title>
                    <Typography.Paragraph>实时掌握用户活跃度、模型资源和平台连接状态。</Typography.Paragraph>
                </div>
                <Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => void query.refetch()}>
                    刷新数据
                </Button>
            </Flex>

            <section className="admin-health-strip" aria-label="服务运行状态">
                <div className="admin-health-primary">
                    <span className="admin-health-icon">
                        <CheckCircleFilled />
                    </span>
                    <div>
                        <Typography.Text strong>核心服务运行正常</Typography.Text>
                        <Typography.Text>API、用户认证和实时连接均可用</Typography.Text>
                    </div>
                </div>
                <div className="admin-health-meta">
                    <span>
                        <ClockCircleOutlined /> 最近同步 {lastUpdated}
                    </span>
                    <span>
                        <SafetyCertificateOutlined /> 自动刷新 15 秒
                    </span>
                </div>
            </section>

            <Row gutter={[16, 16]} className="admin-metric-grid">
                {metrics.map((item) => (
                    <Col key={item.title} xs={24} sm={12} xl={6}>
                        <Card className="admin-metric-card" loading={query.isLoading}>
                            <Flex align="flex-start" justify="space-between" gap={12}>
                                <div>
                                    <Typography.Text className="admin-metric-label">{item.title}</Typography.Text>
                                    <div className="admin-metric-value">
                                        <strong>{item.value.toLocaleString("zh-CN")}</strong>
                                        <span>{item.suffix}</span>
                                    </div>
                                </div>
                                <span className={`admin-metric-icon is-${item.tone}`}>{item.icon}</span>
                            </Flex>
                            <Typography.Text className="admin-metric-note">{item.note}</Typography.Text>
                        </Card>
                    </Col>
                ))}
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24} xl={15}>
                    <Card className="admin-business-card" title="在线渠道分布" extra={<Typography.Text type="secondary">实时数据</Typography.Text>}>
                        {query.isLoading ? (
                            <Skeleton active paragraph={{ rows: 4 }} />
                        ) : (
                            <div className="admin-channel-layout">
                                <div className="admin-rate-panel">
                                    <Progress
                                        type="circle"
                                        percent={onlineRate}
                                        size={136}
                                        strokeWidth={8}
                                        strokeColor="#0f766e"
                                        railColor="#edf1f3"
                                        format={(value) => (
                                            <span className="admin-rate-value">
                                                <strong>{value}%</strong>
                                                <small>用户在线率</small>
                                            </span>
                                        )}
                                    />
                                    <div className="admin-rate-copy">
                                        <Typography.Text strong>当前用户活跃度</Typography.Text>
                                        <Typography.Paragraph>
                                            共 {totalUsers.toLocaleString("zh-CN")} 个账户，当前 {onlineUsers.toLocaleString("zh-CN")} 人在线。
                                        </Typography.Paragraph>
                                    </div>
                                </div>
                                <div className="admin-channel-bars">
                                    <div className="admin-channel-row">
                                        <Flex align="center" justify="space-between">
                                            <span className="admin-channel-name">
                                                <MobileOutlined /> App 客户端
                                            </span>
                                            <strong>
                                                {onlineAppUsers} <small>人</small>
                                            </strong>
                                        </Flex>
                                        <Progress percent={appPercent} showInfo={false} strokeColor="#2563eb" railColor="#edf1f3" />
                                        <Typography.Text type="secondary">占当前在线终端 {appPercent}%</Typography.Text>
                                    </div>
                                    <div className="admin-channel-row">
                                        <Flex align="center" justify="space-between">
                                            <span className="admin-channel-name">
                                                <DesktopOutlined /> Web 浏览器
                                            </span>
                                            <strong>
                                                {onlineWebUsers} <small>人</small>
                                            </strong>
                                        </Flex>
                                        <Progress percent={webPercent} showInfo={false} strokeColor="#16a34a" railColor="#edf1f3" />
                                        <Typography.Text type="secondary">占当前在线终端 {webPercent}%</Typography.Text>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>
                </Col>

                <Col xs={24} xl={9}>
                    <Card className="admin-business-card admin-quick-card" title="常用操作" extra={<Typography.Text type="secondary">快速入口</Typography.Text>}>
                        <div className="admin-quick-list">
                            {quickActions.map((action) => (
                                <Link key={action.href} href={action.href} className="admin-quick-action">
                                    <span className="admin-quick-icon">{action.icon}</span>
                                    <span className="admin-quick-copy">
                                        <strong>{action.label}</strong>
                                        <small>{action.description}</small>
                                    </span>
                                    <ArrowRightOutlined className="admin-quick-arrow" />
                                </Link>
                            ))}
                        </div>
                    </Card>
                </Col>
            </Row>

            <Card className="admin-business-card admin-resource-card" title="资源容量概览">
                <Row gutter={[0, 16]}>
                    <Col xs={12} md={6}>
                        <div className="admin-resource-item">
                            <span>用户账户</span>
                            <strong>{totalUsers.toLocaleString("zh-CN")}</strong>
                            <small>累计注册</small>
                        </div>
                    </Col>
                    <Col xs={12} md={6}>
                        <div className="admin-resource-item">
                            <span>模型配置</span>
                            <strong>{modelCount.toLocaleString("zh-CN")}</strong>
                            <small>当前可用</small>
                        </div>
                    </Col>
                    <Col xs={12} md={6}>
                        <div className="admin-resource-item">
                            <span>实时连接</span>
                            <strong>{onlineConnections.toLocaleString("zh-CN")}</strong>
                            <small>活跃通道</small>
                        </div>
                    </Col>
                    <Col xs={12} md={6}>
                        <div className="admin-resource-item">
                            <span>在线终端</span>
                            <strong>{(onlineAppUsers + onlineWebUsers).toLocaleString("zh-CN")}</strong>
                            <small>App + Web</small>
                        </div>
                    </Col>
                </Row>
            </Card>
        </div>
    );
}
