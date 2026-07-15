"use client";

import { DeleteOutlined, EllipsisOutlined, PlusOutlined, ReloadOutlined, StopOutlined } from "@ant-design/icons";
import { App, Button, Dropdown, Empty, Flex, Modal, Select, Space, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ClickToCopyText } from "@/components/admin/click-to-copy-text";
import type { AdminUser } from "@/services/api/admin";
import {
    deleteAdminUserSubscription,
    fetchAdminSubscriptionPlans,
    fetchAdminUserSubscriptions,
    grantAdminUserSubscription,
    resetAdminUserSubscription,
    voidAdminUserSubscription,
    type SubscriptionPlan,
    type UserSubscription,
} from "@/services/api/subscription";
import { useUserStore } from "@/stores/use-user-store";

const statusMeta: Record<UserSubscription["status"], { label: string; color: string }> = {
    active: { label: "生效", color: "success" },
    expired: { label: "已到期", color: "default" },
    replaced: { label: "已替换", color: "processing" },
    voided: { label: "已作废", color: "error" },
};

export function UserSubscriptionsModal({ user, open, onClose, onChanged }: { user: AdminUser | null; open: boolean; onClose: () => void; onChanged: () => void }) {
    const { message, modal } = App.useApp();
    const token = useUserStore((state) => state.token);
    const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [planId, setPlanId] = useState<string>();
    const [loading, setLoading] = useState(false);
    const [granting, setGranting] = useState(false);

    const load = useCallback(async () => {
        if (!open || !user) return;
        setLoading(true);
        try {
            const [subscriptionResult, planResult] = await Promise.all([
                fetchAdminUserSubscriptions(token, user.id),
                fetchAdminSubscriptionPlans(token, { status: "enabled", page: 1, pageSize: 100 }),
            ]);
            setSubscriptions(subscriptionResult.items || []);
            setPlans(planResult.items || []);
        } finally {
            setLoading(false);
        }
    }, [open, token, user]);

    useEffect(() => {
        void load();
    }, [load]);

    const planOptions = useMemo(() => plans.map((plan) => ({ value: plan.id, label: `${plan.title} · ${plan.quotaCredits.toLocaleString("zh-CN")} 点` })), [plans]);

    const grant = async () => {
        if (!user || !planId) {
            message.warning("请选择订阅套餐");
            return;
        }
        setGranting(true);
        try {
            await grantAdminUserSubscription(token, user.id, planId);
            message.success("订阅已添加");
            setPlanId(undefined);
            await load();
            onChanged();
        } finally {
            setGranting(false);
        }
    };

    const runAction = (subscription: UserSubscription, action: "reset" | "void" | "delete") => {
        const config = {
            reset: { title: "重置订阅额度", content: `将「${subscription.planTitle}」的剩余额度恢复为 ${subscription.quotaCredits.toLocaleString("zh-CN")} 点。`, okText: "重置", danger: false },
            void: { title: "作废用户订阅", content: "作废后订阅立即失效，用户将回退到套餐设定的到期角色。", okText: "作废", danger: true },
            delete: { title: "删除用户订阅", content: "将永久删除这条订阅记录；若订阅仍生效，会立即结束并回退用户角色。", okText: "删除", danger: true },
        }[action];
        modal.confirm({
            title: config.title,
            content: config.content,
            okText: config.okText,
            cancelText: "取消",
            okButtonProps: { danger: config.danger },
            async onOk() {
                if (action === "reset") await resetAdminUserSubscription(token, subscription.id);
                if (action === "void") await voidAdminUserSubscription(token, subscription.id);
                if (action === "delete") await deleteAdminUserSubscription(token, subscription.id);
                message.success(action === "reset" ? "额度已重置" : action === "void" ? "订阅已作废" : "订阅已删除");
                await load();
                onChanged();
            },
        });
    };

    return (
        <Modal
            title={
                <div>
                    <Typography.Title level={4} style={{ margin: 0 }}>用户订阅管理</Typography.Title>
                    <Typography.Text type="secondary">{user?.displayName || user?.username || "-"} · {user?.username || "-"}</Typography.Text>
                </div>
            }
            open={open}
            width="min(1060px, calc(100vw - 32px))"
            onCancel={onClose}
            footer={<Button onClick={onClose}>关闭</Button>}
            destroyOnHidden
        >
            <Flex gap={10} wrap="wrap" style={{ margin: "20px 0 16px" }}>
                <Select
                    value={planId}
                    options={planOptions}
                    onChange={setPlanId}
                    placeholder="选择订阅套餐"
                    showSearch
                    optionFilterProp="label"
                    style={{ flex: "1 1 320px", minWidth: 0 }}
                />
                <Button type="primary" icon={<PlusOutlined />} loading={granting} disabled={!planId} onClick={() => void grant()}>
                    添加订阅
                </Button>
            </Flex>

            <Table<UserSubscription>
                rowKey="id"
                loading={loading}
                dataSource={subscriptions}
                tableLayout="fixed"
                scroll={{ x: 920 }}
                pagination={false}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该用户暂无订阅记录" /> }}
                columns={[
                    { title: "订阅 ID", dataIndex: "id", width: 170, ellipsis: true, render: (value: string) => <ClickToCopyText value={value}>{value}</ClickToCopyText> },
                    { title: "套餐", dataIndex: "planTitle", width: 150, render: (value: string, item) => <div><Typography.Text strong>{value}</Typography.Text><Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>来源：{item.source === "admin" ? "管理员" : "用户购买"}</Typography.Text></div> },
                    { title: "状态", dataIndex: "status", width: 100, render: (value: UserSubscription["status"]) => <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag> },
                    { title: "有效期", width: 260, render: (_, item) => <Typography.Text style={{ fontVariantNumeric: "tabular-nums" }}>{dayjs(item.startsAt).format("YYYY-MM-DD HH:mm:ss")}<br />至 {dayjs(item.expiresAt).format("YYYY-MM-DD HH:mm:ss")}</Typography.Text> },
                    { title: "套餐额度", width: 150, render: (_, item) => <Typography.Text strong style={{ fontVariantNumeric: "tabular-nums" }}>{item.quotaRemaining.toLocaleString("zh-CN")} / {item.quotaCredits.toLocaleString("zh-CN")}</Typography.Text> },
                    {
                        title: "操作", width: 80, align: "right", fixed: "right",
                        render: (_, item) => (
                            <Dropdown
                                trigger={["click"]}
                                menu={{
                                    items: [
                                        { key: "reset", label: "重置额度", icon: <ReloadOutlined />, disabled: item.status !== "active" },
                                        { key: "void", label: "作废", icon: <StopOutlined />, danger: true, disabled: item.status !== "active" },
                                        { type: "divider" },
                                        { key: "delete", label: "删除", icon: <DeleteOutlined />, danger: true },
                                    ],
                                    onClick: ({ key }) => runAction(item, key as "reset" | "void" | "delete"),
                                }}
                            >
                                <Button type="text" icon={<EllipsisOutlined />} aria-label="订阅操作" />
                            </Dropdown>
                        ),
                    },
                ]}
            />
        </Modal>
    );
}
