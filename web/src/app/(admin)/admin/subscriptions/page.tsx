"use client";

import { CalendarOutlined, CrownOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Divider, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchAllRoles, type AdminRole } from "@/services/api/role";
import { createAdminSubscriptionPlan, deleteAdminSubscriptionPlan, fetchAdminSubscriptionPlans, type SubscriptionDurationUnit, type SubscriptionPlan, type SubscriptionResetCycle, updateAdminSubscriptionPlan } from "@/services/api/subscription";
import { useUserStore } from "@/stores/use-user-store";
import { SubscriptionUsersModal } from "./subscription-users-modal";

const durationLabels: Record<SubscriptionDurationUnit, string> = { year: "年", month: "个月", day: "天", hour: "小时", custom: "秒" };
const resetCycleLabels: Record<SubscriptionResetCycle, string> = { none: "不重置", daily: "每天", weekly: "每周", monthly: "每月", custom: "自定义" };

function formatPlanDuration(item: SubscriptionPlan) {
    return item.durationUnit === "custom" ? `${item.durationCustomSeconds} 秒` : `${item.durationValue} ${durationLabels[item.durationUnit]}`;
}

export default function AdminSubscriptionsPage() {
    const { message } = App.useApp();
    const token = useUserStore((state) => state.token);
    const [items, setItems] = useState<SubscriptionPlan[]>([]);
    const [roles, setRoles] = useState<AdminRole[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [queryKeyword, setQueryKeyword] = useState("");
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [deleting, setDeleting] = useState<SubscriptionPlan | null>(null);
    const [viewingUsers, setViewingUsers] = useState<SubscriptionPlan | null>(null);
    const [form] = Form.useForm();
    const durationUnit = Form.useWatch("durationUnit", form);
    const resetCycle = Form.useWatch("resetCycle", form);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await fetchAdminSubscriptionPlans(token, { keyword: queryKeyword, status, page, pageSize: 20 });
            setItems(result.items || []);
            setTotal(result.total || 0);
        } finally {
            setLoading(false);
        }
    }, [page, queryKeyword, status, token]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        fetchAllRoles()
            .then(setRoles)
            .catch(() => undefined);
    }, []);

    const roleOptions = useMemo(() => roles.filter((role) => role.name !== "guest" && role.name !== "admin").map((role) => ({ value: role.name, label: `${role.label} (${role.name})` })), [roles]);
    const roleLabels = useMemo(() => new Map(roles.map((role) => [role.name, role.label])), [roles]);

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ priceCredits: 0, downgradeRole: "user", purchaseLimit: 0, sort: 0, enabled: true, durationUnit: "month", durationValue: 1, durationCustomSeconds: 0, quotaCredits: 0, resetCycle: "none", resetCustomSeconds: 0, allowWalletFallback: false });
        setModalOpen(true);
    };

    const openEdit = (item: SubscriptionPlan) => {
        setEditing(item);
        form.setFieldsValue(item);
        setModalOpen(true);
    };

    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            if (editing) await updateAdminSubscriptionPlan(token, editing.id, values);
            else await createAdminSubscriptionPlan(token, values);
            message.success(editing ? "套餐已更新" : "套餐已创建");
            setModalOpen(false);
            setEditing(null);
            form.resetFields();
            await load();
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!deleting) return;
        await deleteAdminSubscriptionPlan(token, deleting.id);
        message.success("套餐已删除");
        setDeleting(null);
        await load();
    };

    const columns = [
        {
            title: "套餐",
            dataIndex: "title",
            width: 260,
            render: (_: unknown, item: SubscriptionPlan) => (
                <div>
                    <Typography.Text strong>{item.title}</Typography.Text>
                    <Typography.Text type="secondary" ellipsis={{ tooltip: item.subtitle }} style={{ display: "block", maxWidth: 220, fontSize: 12 }}>
                        {item.subtitle || "-"}
                    </Typography.Text>
                </div>
            ),
        },
        { title: "价格", dataIndex: "priceCredits", width: 130, render: (value: number) => <Typography.Text strong>{value.toLocaleString("zh-CN")} 点</Typography.Text> },
        {
            title: "角色变更",
            width: 220,
            render: (_: unknown, item: SubscriptionPlan) => (
                <Space size={6}>
                    <Tag color="green">{roleLabels.get(item.upgradeRole) || item.upgradeRole}</Tag>
                    <span>到期</span>
                    <Tag>{roleLabels.get(item.downgradeRole) || item.downgradeRole}</Tag>
                </Space>
            ),
        },
        { title: "有效期", width: 120, render: (_: unknown, item: SubscriptionPlan) => formatPlanDuration(item) },
        { title: "套餐额度", width: 170, render: (_: unknown, item: SubscriptionPlan) => `${item.quotaCredits.toLocaleString("zh-CN")} 点 / ${resetCycleLabels[item.resetCycle]}` },
        { title: "限购", dataIndex: "purchaseLimit", width: 100, render: (value: number) => (value > 0 ? `${value} 次` : "不限") },
        {
            title: "订阅人数",
            dataIndex: "subscriberCount",
            width: 110,
            render: (value: number, item: SubscriptionPlan) => (
                <Button type="link" className="!h-auto !p-0" onClick={() => setViewingUsers(item)}>
                    {(value || 0).toLocaleString("zh-CN")} 人
                </Button>
            ),
        },
        { title: "排序", dataIndex: "sort", width: 80 },
        { title: "状态", dataIndex: "enabled", width: 100, render: (enabled: boolean) => <Tag color={enabled ? "success" : "default"}>{enabled ? "已启用" : "已停用"}</Tag> },
        {
            title: "操作",
            width: 100,
            align: "right" as const,
            render: (_: unknown, item: SubscriptionPlan) => (
                <Space size={4}>
                    <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(item)} />
                    </Tooltip>
                    <Tooltip title={item.subscriberCount > 0 ? "请先解除全部用户订阅" : "删除"}>
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} disabled={item.subscriberCount > 0} onClick={() => setDeleting(item)} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <div className="admin-data-page">
            <Card className="admin-filter-card" variant="borderless">
                <Form layout="vertical">
                    <Row gutter={[16, 12]} align="bottom">
                        <Col xs={24} md={12} xl={8}>
                            <Form.Item label="关键词">
                                <Input
                                    value={keyword}
                                    placeholder="搜索套餐标题、副标题或升级角色"
                                    allowClear
                                    onChange={(event) => setKeyword(event.target.value)}
                                    onPressEnter={() => {
                                        setPage(1);
                                        setQueryKeyword(keyword);
                                    }}
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={6} xl={4}>
                            <Form.Item label="状态">
                                <Select
                                    value={status || undefined}
                                    placeholder="全部"
                                    allowClear
                                    options={[
                                        { value: "enabled", label: "已启用" },
                                        { value: "disabled", label: "已停用" },
                                    ]}
                                    onChange={(value) => {
                                        setPage(1);
                                        setStatus(value || "");
                                    }}
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={6} xl={6}>
                            <Form.Item>
                                <Space>
                                    <Button
                                        onClick={() => {
                                            setKeyword("");
                                            setQueryKeyword("");
                                            setStatus("");
                                            setPage(1);
                                        }}
                                    >
                                        重置
                                    </Button>
                                    <Button
                                        type="primary"
                                        icon={<SearchOutlined />}
                                        onClick={() => {
                                            setPage(1);
                                            setQueryKeyword(keyword);
                                        }}
                                    >
                                        查询
                                    </Button>
                                </Space>
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Card>

            <Card
                variant="borderless"
                title={
                    <Space>
                        <CrownOutlined />
                        <span>订阅套餐</span>
                        <Tag>{total} 个</Tag>
                    </Space>
                }
                extra={
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                        新建套餐
                    </Button>
                }
            >
                <Table rowKey="id" loading={loading} dataSource={items} columns={columns} tableLayout="fixed" scroll={{ x: 1370 }} pagination={{ current: page, pageSize: 20, total, showTotal: (value) => `共 ${value} 个`, onChange: setPage }} />
            </Card>

            <Modal
                title={editing ? "编辑订阅套餐" : "创建订阅套餐"}
                open={modalOpen}
                width={820}
                confirmLoading={saving}
                onOk={() => void save()}
                onCancel={() => {
                    setModalOpen(false);
                    setEditing(null);
                    form.resetFields();
                }}
                okText="保存"
                cancelText="取消"
                destroyOnHidden
            >
                <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 16 }}>
                    <Row gutter={16}>
                        <Col xs={24} md={12}>
                            <Form.Item name="title" label="套餐标题" rules={[{ required: true, message: "请输入套餐标题" }]}>
                                <Input placeholder="例如：基础套餐" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                            <Form.Item name="subtitle" label="套餐副标题">
                                <Input placeholder="例如：适合轻度使用" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item name="priceCredits" label="套餐价格（算力点）" rules={[{ required: true, message: "请输入套餐价格" }]}>
                                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item name="upgradeRole" label="升级角色" rules={[{ required: true, message: "请选择升级角色" }]}>
                                <Select options={roleOptions} placeholder="购买后切换到的角色" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item name="downgradeRole" label="到期回退角色" rules={[{ required: true, message: "请选择到期角色" }]}>
                                <Select options={roleOptions} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider titlePlacement="left" plain>
                        <Space size={8}><CalendarOutlined />有效期设置</Space>
                    </Divider>
                    <Row gutter={16}>
                        <Col xs={24} md={8}>
                            <Form.Item name="durationUnit" label="有效期单位" rules={[{ required: true }]}>
                                <Select options={[{ value: "year", label: "年" }, { value: "month", label: "个月" }, { value: "day", label: "天" }, { value: "hour", label: "小时" }, { value: "custom", label: "自定义（秒）" }]} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item name="durationValue" label="有效期数值" rules={[{ required: durationUnit !== "custom", message: "请输入有效期" }]}>
                                <InputNumber min={1} precision={0} disabled={durationUnit === "custom"} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item name="durationCustomSeconds" label="自定义秒数" rules={[{ required: durationUnit === "custom", message: "请输入自定义秒数" }]}>
                                <InputNumber min={1} precision={0} disabled={durationUnit !== "custom"} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider titlePlacement="left" plain>
                        <Space size={8}><ReloadOutlined />套餐额度</Space>
                    </Divider>
                    <Row gutter={16}>
                        <Col xs={24} md={8}>
                            <Form.Item name="resetCycle" label="重置周期" rules={[{ required: true }]}>
                                <Select options={[{ value: "none", label: "不重置" }, { value: "daily", label: "每天" }, { value: "weekly", label: "每周" }, { value: "monthly", label: "每月" }, { value: "custom", label: "自定义（秒）" }]} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item name="resetCustomSeconds" label="自定义秒数" rules={[{ required: resetCycle === "custom", message: "请输入自定义秒数" }]}>
                                <InputNumber min={1} precision={0} disabled={resetCycle !== "custom"} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item name="quotaCredits" label="套餐额度" extra={resetCycle === "none" ? "订阅有效期内共用，不自动重置" : "购买时发放，之后按周期恢复到该额度"} rules={[{ required: true, message: "请输入套餐额度" }]}>
                                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="allowWalletFallback" label="额度用尽后允许使用钱包余额" valuePropName="checked" extra="开启后，套餐额度不足时优先用完套餐额度，再从用户钱包余额补足差额">
                        <Switch checkedChildren="允许" unCheckedChildren="不允许" />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col xs={12} md={8}>
                            <Form.Item name="purchaseLimit" label="每人限购" extra="0 表示不限">
                                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={12} md={8}>
                            <Form.Item name="sort" label="排序">
                                <InputNumber precision={0} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={8}>
                            <Form.Item name="enabled" label="启用状态" valuePropName="checked">
                                <Switch checkedChildren="启用" unCheckedChildren="停用" />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            <SubscriptionUsersModal plan={viewingUsers} open={Boolean(viewingUsers)} onClose={() => setViewingUsers(null)} />

            <Modal title="删除订阅套餐" open={Boolean(deleting)} onOk={() => void remove()} onCancel={() => setDeleting(null)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                确定删除套餐「{deleting?.title}」吗？历史购买记录不会被删除。
            </Modal>
        </div>
    );
}
