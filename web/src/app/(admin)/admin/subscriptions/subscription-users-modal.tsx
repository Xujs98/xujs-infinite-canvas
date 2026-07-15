"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Button, Empty, Flex, Input, Modal, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";

import { ClickToCopyText } from "@/components/admin/click-to-copy-text";
import { fetchAdminSubscriptionPlanUsers, type SubscriptionPlan, type SubscriptionSubscriber } from "@/services/api/subscription";
import { useUserStore } from "@/stores/use-user-store";

const pageSize = 20;

export function SubscriptionUsersModal({ plan, open, onClose }: { plan: SubscriptionPlan | null; open: boolean; onClose: () => void }) {
    const token = useUserStore((state) => state.token);
    const [items, setItems] = useState<SubscriptionSubscriber[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [queryKeyword, setQueryKeyword] = useState("");
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        if (!open || !plan) return;
        setLoading(true);
        try {
            const result = await fetchAdminSubscriptionPlanUsers(token, plan.id, { keyword: queryKeyword, page, pageSize });
            setItems(result.items || []);
            setTotal(result.total || 0);
        } finally {
            setLoading(false);
        }
    }, [open, page, plan, queryKeyword, token]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        if (!open) return;
        setPage(1);
        setKeyword("");
        setQueryKeyword("");
    }, [open, plan?.id]);

    return (
        <Modal
            title={<div><Typography.Title level={4} style={{ margin: 0 }}>订阅用户</Typography.Title><Typography.Text type="secondary">{plan?.title || "-"} · 当前 {plan?.subscriberCount || 0} 人</Typography.Text></div>}
            open={open}
            width="min(980px, calc(100vw - 32px))"
            onCancel={onClose}
            footer={<Button onClick={onClose}>关闭</Button>}
            destroyOnHidden
        >
            <Flex gap={8} wrap="wrap" style={{ margin: "20px 0 16px" }}>
                <Input value={keyword} prefix={<SearchOutlined />} placeholder="搜索用户名、昵称或用户 ID" allowClear onChange={(event) => setKeyword(event.target.value)} onPressEnter={() => { setPage(1); setQueryKeyword(keyword); }} style={{ flex: "1 1 280px", maxWidth: 420 }} />
                <Button type="primary" icon={<SearchOutlined />} onClick={() => { setPage(1); setQueryKeyword(keyword); }}>查询</Button>
            </Flex>
            <Table<SubscriptionSubscriber>
                rowKey="subscriptionId"
                loading={loading}
                dataSource={items}
                tableLayout="fixed"
                scroll={{ x: 820 }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有生效中的订阅用户" /> }}
                pagination={{ current: page, pageSize, total, showTotal: (value) => `共 ${value} 人`, onChange: setPage }}
                columns={[
                    { title: "用户", width: 180, render: (_, item) => <div><ClickToCopyText value={item.username}>{item.username}</ClickToCopyText><Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>{item.displayName || "未设置昵称"}</Typography.Text></div> },
                    { title: "用户 ID", dataIndex: "userId", width: 190, ellipsis: true, render: (value: string) => <ClickToCopyText value={value}>{value}</ClickToCopyText> },
                    { title: "状态", width: 90, render: () => <Tag color="success">生效</Tag> },
                    { title: "套餐额度", width: 140, render: (_, item) => <Typography.Text strong style={{ fontVariantNumeric: "tabular-nums" }}>{item.quotaRemaining.toLocaleString("zh-CN")} / {item.quotaCredits.toLocaleString("zh-CN")}</Typography.Text> },
                    { title: "有效期", width: 220, render: (_, item) => <Typography.Text style={{ fontVariantNumeric: "tabular-nums" }}>{dayjs(item.startsAt).format("YYYY-MM-DD HH:mm")}<br />至 {dayjs(item.expiresAt).format("YYYY-MM-DD HH:mm")}</Typography.Text> },
                ]}
            />
        </Modal>
    );
}
