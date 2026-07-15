"use client";

import { App, Avatar, Button, Descriptions, Empty, Flex, Modal, Pagination, Skeleton, Table, Tabs, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";

import { ClickToCopyText } from "@/components/admin/click-to-copy-text";
import { fetchAdminUserCreditLogs, fetchAdminUserDetail, type AdminCreditLog, type AdminUser, type AdminUserDetail } from "@/services/api/admin";
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

function formatTime(value: string) {
    return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-";
}

export function UserDetailModal({ user, open, roleLabels, onClose }: { user: AdminUser | null; open: boolean; roleLabels: Map<string, string>; onClose: () => void }) {
    const { message } = App.useApp();
    const token = useUserStore((state) => state.token);
    const [detail, setDetail] = useState<AdminUserDetail | null>(null);
    const [logs, setLogs] = useState<AdminCreditLog[]>([]);
    const [logsTotal, setLogsTotal] = useState(0);
    const [logsPage, setLogsPage] = useState(1);
    const [logsPageSize, setLogsPageSize] = useState(defaultPageSize);
    const [loading, setLoading] = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);

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

    useEffect(() => { void loadDetail(); }, [loadDetail]);
    useEffect(() => { void loadLogs(); }, [loadLogs]);
    useEffect(() => {
        if (!open) return;
        setDetail(null);
        setLogs([]);
        setLogsPage(1);
        setLogsPageSize(defaultPageSize);
    }, [open, user?.id]);

    const current = detail?.user || user;
    const subscription = detail?.activeSubscription;
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
