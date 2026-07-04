"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, Form, Input, InputNumber, Modal, Row, Space, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import type { AdminCreditLog } from "@/services/api/admin";
import { useAdminCreditLogs } from "./use-admin-credit-logs";

type CreditLogFormValues = Partial<AdminCreditLog>;

const creditLogTypeLabels: Record<string, string> = {
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
};

const tagColorMap: Record<string, string> = {
    admin_adjust: "blue",
    ai_consume: "red",
    ai_refund: "green",
    offline_consume: "volcano",
    offline_refund: "green",
    membership_free: "cyan",
    role_free: "geekblue",
    invite_reward: "purple",
    redeem: "gold",
    check_in: "lime",
};

function resolveCreditLogType(item: AdminCreditLog): string {
    if (item.relatedId?.startsWith("offline:") || item.remark?.startsWith("离线结算")) {
        return item.amount >= 0 ? "offline_refund" : "offline_consume";
    }
    return item.type || "";
}

export default function AdminCreditLogsPage() {
    const { logs, keyword, page, pageSize, total, isLoading, searchLogs, changePage, changePageSize, resetFilters, refreshLogs, saveLog: saveAdminLog, deleteLog, batchDeleteLogs } = useAdminCreditLogs();
    const [form] = Form.useForm<CreditLogFormValues>();
    const [keywordText, setKeywordText] = useState(keyword);
    const [editingLog, setEditingLog] = useState<Partial<AdminCreditLog> | null>(null);
    const [deletingLog, setDeletingLog] = useState<AdminCreditLog | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

    useEffect(() => setKeywordText(keyword), [keyword]);

    useEffect(() => {
        if (editingLog) form.setFieldsValue({ type: "admin_adjust", amount: 0, balance: 0, ...editingLog });
    }, [editingLog, form]);

    const saveLog = async () => {
        const value = await form.validateFields();
        await saveAdminLog({ ...editingLog, ...value });
        setEditingLog(null);
    };

    const handleBatchDelete = async () => {
        await batchDeleteLogs(selectedIds);
        setSelectedIds([]);
        setBatchDeleteOpen(false);
    };

    const columns: ProColumns<AdminCreditLog>[] = [
        {
            title: "用户",
            dataIndex: "username",
            width: 160,
            render: (_, item) => <Typography.Text>{item.username || item.userId}</Typography.Text>,
        },
        {
            title: "类型",
            dataIndex: "type",
            width: 140,
            render: (_, item) => {
                const displayType = resolveCreditLogType(item);
                return <Tag color={tagColorMap[displayType]}>{creditLogTypeLabels[displayType] || displayType || "-"}</Tag>;
            },
        },
        {
            title: "变动",
            dataIndex: "amount",
            width: 100,
            render: (_, item) => item.type === "membership_free" || item.type === "role_free" ? <Typography.Text type="success">{creditLogTypeLabels[item.type]}</Typography.Text> : <Typography.Text type={item.amount >= 0 ? "success" : "danger"}>{item.amount}</Typography.Text>,
        },
        {
            title: "余额",
            dataIndex: "balance",
            width: 100,
            render: (_, item) => <Typography.Text type={item.balance < 0 ? "danger" : undefined}>{item.balance}</Typography.Text>,
        },
        {
            title: "备注",
            dataIndex: "remark",
            ellipsis: true,
            render: (_, item) => <Typography.Text type="secondary">{item.remark || "-"}</Typography.Text>,
        },
        {
            title: "创建时间",
            dataIndex: "createdAt",
            width: 180,
            render: (_, item) => <Typography.Text type="secondary">{item.createdAt ? dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Typography.Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 96,
            align: "right",
            render: (_, item) => (
                <Space size={4}>
                    <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingLog(item)} />
                    </Tooltip>
                    <Tooltip title="删除">
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => setDeletingLog(item)} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: "24px 28px" }}>
            <div style={{ marginBottom: 20 }}>
                <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>算力点日志</Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>查看和管理用户算力点变动记录</Typography.Text>
            </div>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="360px">
                                <Form.Item label="关键词">
                                    <Input.Search value={keywordText} placeholder="搜索用户 ID、类型、备注或关联 ID" allowClear enterButton={<SearchOutlined />} onSearch={() => searchLogs(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item>
                                    <Space>
                                        <Button
                                            onClick={() => {
                                                setKeywordText("");
                                                resetFilters();
                                            }}
                                        >
                                            重置
                                        </Button>
                                        <Button type="primary" icon={<ReloadOutlined />} onClick={() => searchLogs(keywordText)}>
                                            查询
                                        </Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Card>
                <ProTable<AdminCreditLog>
                    rowKey="id"
                    columns={columns}
                    dataSource={logs}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    cardProps={{ variant: "borderless" }}
                    rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys.map(String)) }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>算力点日志</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshLogs() }}
                    toolBarRender={() => [
                        <Button key="batch-delete" danger icon={<DeleteOutlined />} disabled={!selectedIds.length} onClick={() => setBatchDeleteOpen(true)}>
                            批量删除{selectedIds.length ? ` ${selectedIds.length}` : ""}
                        </Button>,
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingLog({ type: "admin_adjust", amount: 0, balance: 0 })}>
                            新增
                        </Button>,
                    ]}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        showTotal: (value) => `共 ${value} 条`,
                        onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
                    }}
                />
            </Space>

            <Modal title={editingLog?.id ? "编辑日志" : "新增日志"} open={Boolean(editingLog)} width={680} onCancel={() => setEditingLog(null)} onOk={() => void saveLog()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Row gutter={14}>
                        <Col span={12}>
                            <Form.Item name="userId" label="用户 ID" rules={[{ required: true, message: "请输入用户 ID" }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="type" label="类型" rules={[{ required: true, message: "请输入类型" }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="amount" label="变动数量" rules={[{ required: true, message: "请输入变动数量" }]}>
                                <InputNumber precision={0} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="balance" label="变动后余额" rules={[{ required: true, message: "请输入变动后余额" }]}>
                                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="relatedId" label="关联 ID">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="createdAt" label="创建时间">
                                <Input placeholder="不填则新增时自动生成" />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="remark" label="备注">
                                <Input.TextArea rows={3} />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="extra" label="扩展信息">
                                <Input.TextArea rows={3} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            <Modal
                title="删除日志"
                open={Boolean(deletingLog)}
                onCancel={() => setDeletingLog(null)}
                onOk={async () => {
                    if (!deletingLog) return;
                    await deleteLog(deletingLog.id);
                    setDeletingLog(null);
                }}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除这条算力点日志吗？
            </Modal>

            <Modal
                title="批量删除日志"
                open={batchDeleteOpen}
                onCancel={() => setBatchDeleteOpen(false)}
                onOk={() => void handleBatchDelete()}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除已选中的 {selectedIds.length} 条日志吗？
            </Modal>
        </div>
    );
}
