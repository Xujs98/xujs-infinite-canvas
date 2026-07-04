"use client";

import { ApiOutlined, AppstoreOutlined, CheckCircleOutlined, DesktopOutlined, MobileOutlined, ReloadOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Col, Flex, Progress, Row, Space, Tag, Typography, theme } from "antd";
import { useQuery } from "@tanstack/react-query";

import { fetchAdminDashboardStats } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

export default function AdminDashboardPage() {
    const { token: antToken } = theme.useToken();
    const token = useUserStore((state) => state.token);
    const query = useQuery({
        queryKey: ["admin", "dashboard", token],
        queryFn: () => fetchAdminDashboardStats(token),
        enabled: Boolean(token),
        refetchInterval: 15000,
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
    const lastUpdated = query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString("zh-CN", { hour12: false }) : "-";

    const metricCards = [
        {
            title: "在线人数",
            value: onlineUsers,
            suffix: "人",
            icon: <TeamOutlined />,
            color: "#1677ff",
            bg: "#e6f4ff",
            note: `在线率 ${onlineRate}%`,
        },
        {
            title: "总用户数量",
            value: totalUsers,
            suffix: "人",
            icon: <UserOutlined />,
            color: "#52c41a",
            bg: "#f6ffed",
            note: "平台注册账户",
        },
        {
            title: "模型数量",
            value: modelCount,
            suffix: "个",
            icon: <AppstoreOutlined />,
            color: "#722ed1",
            bg: "#f9f0ff",
            note: "可用模型配置",
        },
        {
            title: "连接数",
            value: onlineConnections,
            suffix: "条",
            icon: <ApiOutlined />,
            color: "#fa8c16",
            bg: "#fff7e6",
            note: "WebSocket 活跃连接",
        },
    ];

    return (
        <div style={{ padding: "24px 28px", width: "100%", minWidth: 0, boxSizing: "border-box" }}>
            <Flex align="center" justify="space-between" gap={16} wrap style={{ marginBottom: 20 }}>
                <div>
                    <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
                        仪表盘
                    </Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        平台在线状态、用户规模和模型资源概览
                    </Typography.Text>
                </div>
                <Space size={10} wrap>
                    <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0, padding: "5px 10px", borderRadius: 6 }}>
                        自动刷新 15s
                    </Tag>
                    <Button icon={<ReloadOutlined />} onClick={() => void query.refetch()} loading={query.isFetching}>
                        刷新
                    </Button>
                </Space>
            </Flex>

            <Row gutter={[16, 16]}>
                <Col xs={24}>
                    <Card variant="borderless" style={{ borderRadius: 10, overflow: "hidden" }} styles={{ body: { padding: 0 } }}>
                        <Flex align="stretch" wrap>
                            <div style={{ flex: "1 1 360px", padding: 22, background: "#ffffff" }}>
                                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                                    当前服务状态
                                </Typography.Text>
                                <Flex align="center" gap={10} style={{ marginTop: 8 }}>
                                    <span style={{ width: 10, height: 10, borderRadius: 999, background: "#52c41a", boxShadow: "0 0 0 4px rgba(82,196,26,0.12)" }} />
                                    <Typography.Title level={3} style={{ margin: 0, fontSize: 24 }}>
                                        服务在线
                                    </Typography.Title>
                                </Flex>
                                <Typography.Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 13 }}>
                                    最近刷新：{lastUpdated}
                                </Typography.Text>
                            </div>
                            <div style={{ flex: "2 1 520px", padding: "22px 24px", borderLeft: `1px solid ${antToken.colorBorderSecondary}` }}>
                                <Flex align="center" justify="space-between" gap={16} wrap>
                                    <div>
                                        <Typography.Text type="secondary">在线用户占比</Typography.Text>
                                        <Typography.Title level={2} style={{ margin: "4px 0 0", fontSize: 34 }}>
                                            {onlineRate}%
                                        </Typography.Title>
                                    </div>
                                    <div style={{ flex: "1 1 260px", minWidth: 220 }}>
                                        <Progress percent={onlineRate} showInfo={false} strokeColor="#1677ff" trailColor="#edf2f7" />
                                        <Flex justify="space-between" style={{ marginTop: 8 }}>
                                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>在线 {onlineUsers} 人</Typography.Text>
                                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>总计 {totalUsers} 人</Typography.Text>
                                        </Flex>
                                    </div>
                                </Flex>
                            </div>
                        </Flex>
                    </Card>
                </Col>

                {metricCards.map((item) => (
                    <Col key={item.title} xs={24} sm={12} xl={6}>
                        <Card loading={query.isLoading} variant="borderless" style={{ borderRadius: 10, height: "100%" }} styles={{ body: { padding: 20 } }}>
                            <Flex align="flex-start" justify="space-between" gap={12}>
                                <div>
                                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                                        {item.title}
                                    </Typography.Text>
                                    <Flex align="baseline" gap={6} style={{ marginTop: 10 }}>
                                        <Typography.Title level={2} style={{ margin: 0, fontSize: 32, lineHeight: 1 }}>
                                            {item.value}
                                        </Typography.Title>
                                        <Typography.Text type="secondary">{item.suffix}</Typography.Text>
                                    </Flex>
                                </div>
                                <span style={{ width: 44, height: 44, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", color: item.color, background: item.bg, fontSize: 22 }}>
                                    {item.icon}
                                </span>
                            </Flex>
                            <Typography.Text type="secondary" style={{ display: "block", marginTop: 16, fontSize: 12 }}>
                                {item.note}
                            </Typography.Text>
                        </Card>
                    </Col>
                ))}

                <Col xs={24} lg={14}>
                    <Card title="在线渠道分布" variant="borderless" style={{ borderRadius: 10, height: "100%" }}>
                        <Space direction="vertical" size={18} style={{ width: "100%" }}>
                            <div>
                                <Flex align="center" justify="space-between" style={{ marginBottom: 8 }}>
                                    <Tag icon={<MobileOutlined />} color="blue" style={{ margin: 0 }}>App {onlineAppUsers}</Tag>
                                    <Typography.Text type="secondary">{appPercent}%</Typography.Text>
                                </Flex>
                                <Progress percent={appPercent} showInfo={false} strokeColor="#1677ff" trailColor="#edf2f7" />
                            </div>
                            <div>
                                <Flex align="center" justify="space-between" style={{ marginBottom: 8 }}>
                                    <Tag icon={<DesktopOutlined />} color="green" style={{ margin: 0 }}>Web {onlineWebUsers}</Tag>
                                    <Typography.Text type="secondary">{webPercent}%</Typography.Text>
                                </Flex>
                                <Progress percent={webPercent} showInfo={false} strokeColor="#52c41a" trailColor="#edf2f7" />
                            </div>
                        </Space>
                    </Card>
                </Col>

                <Col xs={24} lg={10}>
                    <Card title="资源概览" variant="borderless" style={{ borderRadius: 10, height: "100%" }}>
                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                            <Flex align="center" justify="space-between">
                                <Typography.Text type="secondary">用户账户</Typography.Text>
                                <Typography.Text strong>{totalUsers} 人</Typography.Text>
                            </Flex>
                            <Flex align="center" justify="space-between">
                                <Typography.Text type="secondary">模型配置</Typography.Text>
                                <Typography.Text strong>{modelCount} 个</Typography.Text>
                            </Flex>
                            <Flex align="center" justify="space-between">
                                <Typography.Text type="secondary">实时连接</Typography.Text>
                                <Typography.Text strong>{onlineConnections} 条</Typography.Text>
                            </Flex>
                        </Space>
                    </Card>
                </Col>
            </Row>
        </div>
    );
}
