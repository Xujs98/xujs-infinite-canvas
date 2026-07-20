"use client";

import { GlobalOutlined, LaptopOutlined, StopOutlined, UnlockOutlined, WarningOutlined } from "@ant-design/icons";
import { App, Avatar, Button, Descriptions, Empty, Flex, Modal, Pagination, Skeleton, Space, Table, Tabs, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";

import { ClickToCopyText } from "@/components/admin/click-to-copy-text";
import { fetchAdminRiskEvents, fetchAdminUserCreditLogs, fetchAdminUserDetail, setAdminAccessBan, type AdminCreditLog, type AdminRiskEvent, type AdminUser, type AdminUserDeviceRecord, type AdminUserDetail, type AdminUserIPRecord } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const defaultPageSize = 10;
const creditTypeLabels: Record<string, string> = {
    admin_adjust: "后台调整",
    ai_consume: "模型消费",
    ai_refund: "失败返还",
    offline_consume: "离线消费",
    offline_refund: "离线返还",
    membership_free: "会员免费",
    role_free: "角色免费",
    invite_reward: "邀请奖励",
    redeem: "兑换卡密",
    check_in: "签到奖励",
    subscription_purchase: "订阅购买",
};
const creditTypeColors: Record<string, string> = { admin_adjust: "blue", ai_consume: "red", ai_refund: "green", offline_consume: "volcano", offline_refund: "green", membership_free: "cyan", role_free: "geekblue", invite_reward: "purple", redeem: "gold", check_in: "lime", subscription_purchase: "cyan" };
const resetCycleLabels: Record<string, string> = { none: "不重置", daily: "每天", weekly: "每周", monthly: "每月", custom: "自定义周期" };
const riskLevelLabels: Record<string, { label: string; color: string }> = { low: { label: "低", color: "default" }, medium: { label: "中", color: "gold" }, high: { label: "高", color: "orange" }, critical: { label: "严重", color: "red" } };
const riskStatusLabels: Record<string, { label: string; color: string }> = { open: { label: "待处理", color: "error" }, resolved: { label: "已确认", color: "success" }, ignored: { label: "已忽略", color: "default" } };

function formatTime(value: string) {
    return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-";
}

export function UserDetailModal({ user, open, roleLabels, onClose }: { user: AdminUser | null; open: boolean; roleLabels: Map<string, string>; onClose: () => void }) {
    const { message, modal } = App.useApp();
    const token = useUserStore((state) => state.token);
    const [detail, setDetail] = useState<AdminUserDetail | null>(null);
    const [logs, setLogs] = useState<AdminCreditLog[]>([]);
    const [logsTotal, setLogsTotal] = useState(0);
    const [logsPage, setLogsPage] = useState(1);
    const [logsPageSize, setLogsPageSize] = useState(defaultPageSize);
    const [riskEvents, setRiskEvents] = useState<AdminRiskEvent[]>([]);
    const [riskTotal, setRiskTotal] = useState(0);
    const [riskLoading, setRiskLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);
    const [accessUpdating, setAccessUpdating] = useState("");

    const loadDetail = useCallback(async () => {
        if (!open || !user) return;
        setLoading(true);
        try {
            setDetail(await fetchAdminUserDetail(token, user.id));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取用户详情失败");
        } finally {
            setLoading(false);
        }
    }, [message, open, token, user]);

    const loadLogs = useCallback(async () => {
        if (!open || !user) return;
        setLogsLoading(true);
        try {
            const result = await fetchAdminUserCreditLogs(token, user.id, { page: logsPage, pageSize: logsPageSize });
            setLogs(result.items || []);
            setLogsTotal(result.total || 0);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取算力点明细失败");
        } finally {
            setLogsLoading(false);
        }
    }, [logsPage, logsPageSize, message, open, token, user]);

    const loadRiskEvents = useCallback(async () => {
        if (!open || !user) return;
        setRiskLoading(true);
        try {
            const result = await fetchAdminRiskEvents(token, { userId: user.id, page: 1, pageSize: 50 });
            setRiskEvents(result.items || []);
            setRiskTotal(result.total || 0);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取风险事件失败");
        } finally {
            setRiskLoading(false);
        }
    }, [message, open, token, user]);

    useEffect(() => { void loadDetail(); }, [loadDetail]);
    useEffect(() => { void loadLogs(); }, [loadLogs]);
    useEffect(() => { void loadRiskEvents(); }, [loadRiskEvents]);
    useEffect(() => {
        if (!open) return;
        setDetail(null);
        setLogs([]);
        setRiskEvents([]);
        setRiskTotal(0);
        setLogsPage(1);
        setLogsPageSize(defaultPageSize);
    }, [open, user?.id]);

    const confirmAccessBan = useCallback((kind: "ip" | "device", value: string, blocked: boolean) => {
        const label = kind === "ip" ? "IP" : "设备码";
        modal.confirm({
            title: blocked ? `封禁${label}` : `解除${label}封禁`,
            content: value,
            okText: blocked ? "确认封禁" : "确认解除",
            cancelText: "取消",
            okButtonProps: { danger: blocked },
            onOk: async () => {
                const key = `${kind}:${value}`;
                setAccessUpdating(key);
                try {
                    await setAdminAccessBan(token, kind, value, blocked);
                    await loadDetail();
                    message.success(blocked ? `${label}已封禁` : `${label}已解除封禁`);
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "操作失败");
                    throw error;
                } finally {
                    setAccessUpdating("");
                }
            },
        });
    }, [loadDetail, message, modal, token]);

    const current = detail?.user || user;
    const subscription = detail?.activeSubscription;
    const ipRecords = detail?.ipRecords || [];
    const deviceRecords = detail?.deviceRecords || [];
    const online = Boolean(current?.online);
    const metricItems = [
        { label: "算力点余额", value: current?.credits || 0 },
        { label: "订阅已使用", value: detail?.subscriptionUsed || 0 },
        { label: "累计消耗算力点", value: detail?.totalConsumedCredits || 0 },
    ];

    return (
        <Modal
            title="用户详情"
            open={open}
            width="min(1100px, calc(100vw - 32px))"
            onCancel={onClose}
            footer={<Button onClick={onClose}>关闭</Button>}
            styles={{ body: { height: "min(720px, calc(100dvh - 180px))", minHeight: 0, overflow: "hidden" } }}
            destroyOnHidden
        >
            <div className="admin-user-detail-content" style={{ paddingTop: 18, boxSizing: "border-box" }}>
                <Flex className="admin-user-detail-profile" align="center" gap={14} style={{ marginBottom: 18 }}>
                    <Avatar size={52} src={current?.avatarUrl}>{(current?.displayName || current?.username || "用").slice(0, 1)}</Avatar>
                    <div style={{ minWidth: 0 }}>
                        <Flex align="center" gap={8} wrap="wrap">
                            <Typography.Title level={4} style={{ margin: 0 }}>{current?.displayName || current?.username || "-"}</Typography.Title>
                            <Tag color={current?.status === "ban" ? "error" : "success"}>{current?.status === "ban" ? "已禁用" : "已启用"}</Tag>
                        </Flex>
                        <Typography.Text type="secondary">{current?.username || "-"}</Typography.Text>
                    </div>
                </Flex>

                <div className="admin-user-detail-metrics" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", border: "1px solid var(--admin-border)", borderRadius: 8, overflow: "hidden", marginBottom: 18 }}>
                    {metricItems.map((item) => (
                        <div className="admin-user-detail-metric" key={item.label} style={{ padding: "18px 20px", borderRight: "1px solid var(--admin-border)", minWidth: 0 }}>
                            <Typography.Text type="secondary">{item.label}</Typography.Text>
                            <Typography.Title level={3} style={{ margin: "6px 0 0", fontVariantNumeric: "tabular-nums" }}>{loading ? "-" : item.value.toLocaleString("zh-CN")}</Typography.Title>
                        </div>
                    ))}
                </div>

                <Flex className="admin-user-detail-id" align="center" gap={8}>
                    <Typography.Text type="secondary">用户 ID</Typography.Text>
                    <ClickToCopyText value={current?.id || ""}>{current?.id || "-"}</ClickToCopyText>
                </Flex>

                <Tabs
                    className="admin-user-detail-tabs"
                    items={[
                        {
                            key: "basic",
                            label: "基本信息",
                            children: loading && !detail ? <Skeleton active paragraph={{ rows: 4 }} /> : (
                                <div>
                                    <Descriptions bordered column={{ xs: 1, sm: 2, lg: 3 }} size="middle">
                                        <Descriptions.Item label="用户名">{current?.username || "-"}</Descriptions.Item>
                                        <Descriptions.Item label="昵称">{current?.displayName || "-"}</Descriptions.Item>
                                        <Descriptions.Item label="角色组"><Tag color="geekblue">{roleLabels.get(current?.role || "") || current?.role || "-"}</Tag></Descriptions.Item>
                                        <Descriptions.Item label="在线状态"><Flex gap={6} wrap="wrap"><Tag color={online ? "success" : "default"}>{online ? "在线" : "离线"}</Tag><Tag color={current?.onlineWeb ? "green" : "default"}>Web</Tag><Tag color={current?.onlineApp ? "blue" : "default"}>App</Tag></Flex></Descriptions.Item>
                                        <Descriptions.Item label="邮箱">{current?.email || "-"}</Descriptions.Item>
                                        <Descriptions.Item label="Linux.do ID">{current?.linuxDoId || "-"}</Descriptions.Item>
                                        <Descriptions.Item label="创建时间">{formatTime(current?.createdAt || "")}</Descriptions.Item>
                                        <Descriptions.Item label="最后登录时间">{formatTime(current?.lastLoginAt || "")}</Descriptions.Item>
                                    </Descriptions>
                                    {subscription ? (
                                        <div style={{ marginTop: 18 }}>
                                            <Typography.Title level={5} style={{ margin: "0 0 10px" }}>订阅信息</Typography.Title>
                                            <Descriptions bordered column={{ xs: 1, sm: 2, lg: 3 }} size="middle">
                                                <Descriptions.Item label="订阅套餐"><Tag color="success">{subscription.planTitle}</Tag></Descriptions.Item>
                                                <Descriptions.Item label="来源">{subscription.source === "admin" ? "管理员添加" : "用户购买"}</Descriptions.Item>
                                                <Descriptions.Item label="套餐额度"><Typography.Text strong>{subscription.quotaRemaining.toLocaleString("zh-CN")} / {subscription.quotaCredits.toLocaleString("zh-CN")}</Typography.Text></Descriptions.Item>
                                                <Descriptions.Item label="开始时间">{formatTime(subscription.startsAt)}</Descriptions.Item>
                                                <Descriptions.Item label="到期时间">{formatTime(subscription.expiresAt)}</Descriptions.Item>
                                                <Descriptions.Item label="重置周期">{resetCycleLabels[subscription.resetCycle] || subscription.resetCycle}</Descriptions.Item>
                                                <Descriptions.Item label="下次重置">{subscription.nextResetAt ? formatTime(subscription.nextResetAt) : "不重置"}</Descriptions.Item>
                                                <Descriptions.Item label="钱包补扣">{subscription.allowWalletFallback ? "允许" : "不允许"}</Descriptions.Item>
                                            </Descriptions>
                                        </div>
                                    ) : null}
                                </div>
                            ),
                        },
                        {
                            key: "access",
                            label: `访问记录 (${ipRecords.length + deviceRecords.length})`,
                            children: (
                                <div className="admin-user-access-pane">
                                    <section className="admin-user-access-section">
                                        <Flex align="center" justify="space-between" gap={12} wrap="wrap" className="admin-user-access-heading">
                                            <Space size={8}><GlobalOutlined /><Typography.Text strong>IP 记录</Typography.Text><Tag>{ipRecords.length}</Tag></Space>
                                        </Flex>
                                        <Table<AdminUserIPRecord>
                                            rowKey="ipAddress"
                                            size="small"
                                            dataSource={ipRecords}
                                            pagination={false}
                                            tableLayout="fixed"
                                            scroll={{ x: 920 }}
                                            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 IP 记录" /> }}
                                            columns={[
                                                { title: "IP 地址", dataIndex: "ipAddress", width: 170, render: (value: string) => <ClickToCopyText value={value}>{value}</ClickToCopyText> },
                                                { title: "状态", dataIndex: "blocked", width: 80, render: (value: boolean) => <Tag color={value ? "error" : "success"}>{value ? "已封禁" : "正常"}</Tag> },
                                                { title: "客户端", dataIndex: "clientTypes", width: 130, render: (values: string[]) => <Space size={4} wrap>{(values || []).map((value) => <Tag key={value} color={value === "app" ? "blue" : "green"}>{value === "app" ? "App" : "Web"}</Tag>)}</Space> },
                                                { title: "设备", dataIndex: "deviceCount", width: 72, render: (value: number) => `${value || 0} 台` },
                                                { title: "访问", dataIndex: "seenCount", width: 72, render: (value: number) => `${value || 0} 次` },
                                                { title: "首次访问", dataIndex: "firstSeenAt", width: 170, render: formatTime },
                                                { title: "最近访问", dataIndex: "lastSeenAt", width: 170, render: formatTime },
                                                { title: "操作", key: "actions", width: 96, fixed: "right", render: (_, item) => <Button danger={!item.blocked} type="text" size="small" loading={accessUpdating === `ip:${item.ipAddress}`} icon={item.blocked ? <UnlockOutlined /> : <StopOutlined />} onClick={() => confirmAccessBan("ip", item.ipAddress, !item.blocked)}>{item.blocked ? "解除" : "封禁"}</Button> },
                                            ]}
                                        />
                                    </section>

                                    <section className="admin-user-access-section">
                                        <Flex align="center" justify="space-between" gap={12} wrap="wrap" className="admin-user-access-heading">
                                            <Space size={8}><LaptopOutlined /><Typography.Text strong>设备码记录</Typography.Text><Tag>{deviceRecords.length}</Tag></Space>
                                        </Flex>
                                        <Table<AdminUserDeviceRecord>
                                            rowKey="deviceCode"
                                            size="small"
                                            dataSource={deviceRecords}
                                            pagination={false}
                                            tableLayout="fixed"
                                            scroll={{ x: 1060 }}
                                            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无设备码记录" /> }}
                                            columns={[
                                                { title: "设备码", dataIndex: "deviceCode", width: 245, render: (value: string) => <ClickToCopyText value={value}>{value}</ClickToCopyText> },
                                                { title: "状态", dataIndex: "blocked", width: 80, render: (value: boolean) => <Tag color={value ? "error" : "success"}>{value ? "已封禁" : "正常"}</Tag> },
                                                { title: "系统", key: "system", width: 150, ellipsis: true, render: (_, item) => <Typography.Text ellipsis={{ tooltip: `${item.osName || "-"} ${item.osVersion || ""}` }}>{[item.osName, item.osVersion].filter(Boolean).join(" ") || "-"}</Typography.Text> },
                                                { title: "App 版本", dataIndex: "appVersion", width: 100, render: (value: string) => value || "-" },
                                                { title: "IP", dataIndex: "ipAddresses", width: 180, render: (values: string[]) => <Typography.Text ellipsis={{ tooltip: (values || []).join(", ") }}>{(values || []).join(", ") || "-"}</Typography.Text> },
                                                { title: "访问", dataIndex: "seenCount", width: 72, render: (value: number) => `${value || 0} 次` },
                                                { title: "首次访问", dataIndex: "firstSeenAt", width: 170, render: formatTime },
                                                { title: "最近访问", dataIndex: "lastSeenAt", width: 170, render: formatTime },
                                                { title: "操作", key: "actions", width: 96, fixed: "right", render: (_, item) => <Button danger={!item.blocked} type="text" size="small" loading={accessUpdating === `device:${item.deviceCode}`} icon={item.blocked ? <UnlockOutlined /> : <StopOutlined />} onClick={() => confirmAccessBan("device", item.deviceCode, !item.blocked)}>{item.blocked ? "解除" : "封禁"}</Button> },
                                            ]}
                                        />
                                    </section>
                                </div>
                            ),
                        },
                        {
                            key: "risk",
                            label: `风险事件 (${riskTotal})`,
                            children: (
                                <div className="admin-user-risk-pane">
                                    <Table<AdminRiskEvent>
                                        rowKey="id"
                                        size="small"
                                        loading={riskLoading}
                                        dataSource={riskEvents}
                                        pagination={false}
                                        tableLayout="fixed"
                                        scroll={{ x: 920, y: 360 }}
                                        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无风险事件" /> }}
                                        columns={[
                                            { title: "等级", dataIndex: "level", width: 76, render: (value: string) => <Tag color={riskLevelLabels[value]?.color}>{riskLevelLabels[value]?.label || value}</Tag> },
                                            { title: "事件", key: "event", width: 220, render: (_, item) => <Space size={6}><WarningOutlined /><Typography.Text ellipsis={{ tooltip: item.summary }}>{item.summary || item.eventType}</Typography.Text></Space> },
                                            { title: "来源", dataIndex: "source", width: 100, render: (value: string, item) => item.clientType === "app" ? "App" : value || "服务端" },
                                            { title: "IP", dataIndex: "ipAddress", width: 145, render: (value: string) => value ? <ClickToCopyText value={value}>{value}</ClickToCopyText> : "-" },
                                            { title: "次数", dataIndex: "occurrenceCount", width: 65, render: (value: number) => value || 1 },
                                            { title: "状态", dataIndex: "status", width: 88, render: (value: string) => <Tag color={riskStatusLabels[value]?.color}>{riskStatusLabels[value]?.label || value}</Tag> },
                                            { title: "最近发生", dataIndex: "lastSeenAt", width: 170, render: formatTime },
                                        ]}
                                    />
                                    {riskTotal > riskEvents.length ? <Typography.Text type="secondary" style={{ display: "block", marginTop: 10 }}>仅展示最近 {riskEvents.length} 条，请在“风险事件”页面查看全部记录。</Typography.Text> : null}
                                </div>
                            ),
                        },
                        {
                            key: "credits",
                            label: `算力点明细 (${logsTotal})`,
                            className: "admin-user-credit-log-tab",
                            children: (
                                <div className="admin-user-credit-log-pane">
                                    <div className="admin-user-credit-log-scroll" style={{ height: 380, flex: "0 0 380px" }}>
                                        <Table<AdminCreditLog>
                                            rowKey="id"
                                            loading={logsLoading}
                                            dataSource={logs}
                                            tableLayout="fixed"
                                            scroll={{ x: 760 }}
                                            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无算力点明细" /> }}
                                            pagination={false}
                                            columns={[
                                                { title: "类型", dataIndex: "type", width: 130, render: (value: string) => <Tag color={creditTypeColors[value]}>{creditTypeLabels[value] || value || "-"}</Tag> },
                                                { title: "变动", dataIndex: "amount", width: 100, render: (value: number, item) => item.type === "membership_free" || item.type === "role_free" ? <Typography.Text type="success">免费</Typography.Text> : <Typography.Text type={value >= 0 ? "success" : "danger"}>{value > 0 ? `+${value}` : value}</Typography.Text> },
                                                { title: "余额", dataIndex: "balance", width: 100, render: (value: number) => <Typography.Text type={value < 0 ? "danger" : undefined}>{value}</Typography.Text> },
                                                { title: "备注", dataIndex: "remark", ellipsis: true, render: (value: string) => <Typography.Text type="secondary">{value || "-"}</Typography.Text> },
                                                { title: "时间", dataIndex: "createdAt", width: 180, render: (value: string) => <Typography.Text type="secondary">{formatTime(value)}</Typography.Text> },
                                            ]}
                                        />
                                    </div>
                                    <Pagination
                                        className="admin-user-credit-log-pagination"
                                        current={logsPage}
                                        pageSize={logsPageSize}
                                        total={logsTotal}
                                        showSizeChanger
                                        pageSizeOptions={[10, 20, 50]}
                                        showLessItems
                                        responsive
                                        showTotal={(value) => `共 ${value} 条`}
                                        onChange={(nextPage, nextPageSize) => {
                                            if (nextPageSize !== logsPageSize) {
                                                setLogsPage(1);
                                                setLogsPageSize(nextPageSize);
                                            } else {
                                                setLogsPage(nextPage);
                                            }
                                        }}
                                    />
                                </div>
                            ),
                        },
                    ]}
                />
            </div>
        </Modal>
    );
}
