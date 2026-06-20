"use client";

import { CopyOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import type { AdminRedeemCode } from "@/services/api/admin";
import { useAdminRedeemCodes } from "./use-admin-redeem-codes";

const codeTypeLabels: Record<string, string> = {
    credits: "算力点",
    membership: "会员时长",
};

const codeStatusLabels: Record<string, { label: string; color: string }> = {
    unused: { label: "未使用", color: "green" },
    used: { label: "已使用", color: "default" },
};

export default function AdminRedeemCodesPage() {
    const { codes, keyword, type, status, page, pageSize, total, isLoading, searchCodes, changeType, changeStatus, changePage, changePageSize, resetFilters, refreshCodes, generateCodes, deleteCode, batchDeleteCodes } = useAdminRedeemCodes();
    const [form] = Form.useForm();
    const [keywordText, setKeywordText] = useState(keyword);
    const [generating, setGenerating] = useState(false);
    const [deletingCode, setDeletingCode] = useState<AdminRedeemCode | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

    useEffect(() => setKeywordText(keyword), [keyword]);

    const handleGenerate = async () => {
        const values = await form.validateFields();
        setGenerating(true);
        try {
            await generateCodes({
                count: values.count || 1,
                type: values.type || "credits",
                credits: values.type === "credits" ? values.credits : 0,
                membershipDays: values.type === "membership" ? values.membershipDays : 0,
                batchName: values.batchName || "",
                remark: values.remark || "",
            });
            form.resetFields();
        } finally {
            setGenerating(false);
        }
    };

    const copyCode = async (code: string, id: string) => {
        await navigator.clipboard.writeText(code);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    const handleBatchCopy = async () => {
        const selected = codes.filter((item) => selectedIds.includes(item.id));
        const text = selected.map((item) => item.code).join("\n");
        await navigator.clipboard.writeText(text);
        setCopiedId("batch");
        setTimeout(() => setCopiedId(null), 1500);
    };

    const handleBatchDelete = async () => {
        await batchDeleteCodes(selectedIds);
        setSelectedIds([]);
        setBatchDeleteOpen(false);
    };

    const columns: ProColumns<AdminRedeemCode>[] = [
        {
            title: "卡密",
            dataIndex: "code",
            width: 200,
            render: (_, item) => (
                <Space size={4}>
                    <Typography.Text copyable={{ text: item.code }} className="font-mono text-xs">
                        {item.code}
                    </Typography.Text>
                    <Tooltip title={copiedId === item.id ? "已复制" : "复制卡密"}>
                        <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copyCode(item.code, item.id)} />
                    </Tooltip>
                </Space>
            ),
        },
        {
            title: "类型",
            dataIndex: "type",
            width: 100,
            render: (_, item) => <Tag>{codeTypeLabels[item.type] || item.type}</Tag>,
        },
        {
            title: "面值",
            key: "value",
            width: 120,
            render: (_, item) => {
                if (item.type === "credits") return <span>{item.credits} 算力点</span>;
                if (item.type === "membership") return <span>{item.membershipDays} 天</span>;
                return "-";
            },
        },
        {
            title: "状态",
            dataIndex: "status",
            width: 100,
            render: (_, item) => {
                const s = codeStatusLabels[item.status] || { label: item.status, color: "default" };
                return <Tag color={s.color}>{s.label}</Tag>;
            },
        },
        {
            title: "批次",
            dataIndex: "batchName",
            width: 120,
            ellipsis: true,
            render: (_, item) => <Typography.Text type="secondary">{item.batchName || "-"}</Typography.Text>,
        },
        {
            title: "使用者",
            dataIndex: "usedBy",
            width: 180,
            ellipsis: true,
            render: (_, item) => (item.usedByName ? <Typography.Text copyable={{ text: item.usedBy }} className="text-xs">{item.usedByName}</Typography.Text> : item.usedBy ? <Typography.Text copyable className="text-xs">{item.usedBy}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>),
        },
        {
            title: "创建时间",
            dataIndex: "createdAt",
            width: 170,
            render: (_, item) => <Typography.Text type="secondary">{item.createdAt ? dayjs(item.createdAt).format("YYYY-MM-DD HH:mm") : "-"}</Typography.Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 72,
            align: "right",
            render: (_, item) => (
                <Tooltip title="删除">
                    <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => setDeletingCode(item)} />
                </Tooltip>
            ),
        },
    ];

    return (
        <main style={{ padding: 24 }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="360px">
                                <Form.Item label="关键词">
                                    <Input.Search value={keywordText} placeholder="搜索卡密、批次、备注或使用者" allowClear enterButton={<SearchOutlined />} onSearch={() => searchCodes(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
                                </Form.Item>
                            </Col>
                            <Col flex="160px">
                                <Form.Item label="类型">
                                    <Select
                                        value={type || undefined}
                                        allowClear
                                        placeholder="全部类型"
                                        options={[
                                            { label: "算力点", value: "credits" },
                                            { label: "会员时长", value: "membership" },
                                        ]}
                                        onChange={(value) => changeType(value || "")}
                                    />
                                </Form.Item>
                            </Col>
                            <Col flex="160px">
                                <Form.Item label="状态">
                                    <Select
                                        value={status || undefined}
                                        allowClear
                                        placeholder="全部状态"
                                        options={[
                                            { label: "未使用", value: "unused" },
                                            { label: "已使用", value: "used" },
                                        ]}
                                        onChange={(value) => changeStatus(value || "")}
                                    />
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
                                        <Button type="primary" icon={<ReloadOutlined />} onClick={() => searchCodes(keywordText)}>
                                            查询
                                        </Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Card>

                <ProTable<AdminRedeemCode>
                    rowKey="id"
                    columns={columns}
                    dataSource={codes}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    cardProps={{ variant: "borderless" }}
                    rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys.map(String)) }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>卡密管理</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshCodes() }}
                    toolBarRender={() => [
                        <Button key="batch-copy" icon={<CopyOutlined />} disabled={!selectedIds.length} onClick={() => void handleBatchCopy()}>
                            {copiedId === "batch" ? "已复制" : `复制选中${selectedIds.length ? ` ${selectedIds.length}` : ""}`}
                        </Button>,
                        <Button key="batch-delete" danger icon={<DeleteOutlined />} disabled={!selectedIds.length} onClick={() => setBatchDeleteOpen(true)}>
                            批量删除{selectedIds.length ? ` ${selectedIds.length}` : ""}
                        </Button>,
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setGenerating(true)}>
                            生成卡密
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

            <Modal
                title="生成卡密"
                open={generating}
                width={560}
                onCancel={() => {
                    setGenerating(false);
                    form.resetFields();
                }}
                onOk={() => void handleGenerate()}
                okText="生成"
                cancelText="取消"
                destroyOnHidden
            >
                <Form form={form} layout="vertical" requiredMark={false} initialValues={{ count: 10, type: "credits", credits: 100, membershipDays: 30 }}>
                    <Row gutter={14}>
                        <Col span={12}>
                            <Form.Item name="count" label="生成数量" rules={[{ required: true, message: "请输入数量" }]}>
                                <InputNumber min={1} max={500} precision={0} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="type" label="卡密类型" rules={[{ required: true, message: "请选择类型" }]}>
                                <Select
                                    options={[
                                        { label: "算力点", value: "credits" },
                                        { label: "会员时长", value: "membership" },
                                    ]}
                                />
                            </Form.Item>
                        </Col>
                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type}>
                            {({ getFieldValue }) =>
                                getFieldValue("type") === "credits" ? (
                                    <Col span={12}>
                                        <Form.Item name="credits" label="算力点数量" rules={[{ required: true, message: "请输入算力点" }]}>
                                            <InputNumber min={1} precision={0} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                ) : (
                                    <Col span={12}>
                                        <Form.Item name="membershipDays" label="会员天数" rules={[{ required: true, message: "请输入天数" }]}>
                                            <InputNumber min={1} precision={0} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                )
                            }
                        </Form.Item>
                        <Col span={12}>
                            <Form.Item name="batchName" label="批次名称">
                                <Input placeholder="可选，方便管理" />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="remark" label="备注">
                                <Input.TextArea rows={2} placeholder="可选" />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            <Modal
                title="删除卡密"
                open={Boolean(deletingCode)}
                onCancel={() => setDeletingCode(null)}
                onOk={async () => {
                    if (!deletingCode) return;
                    await deleteCode(deletingCode.id);
                    setDeletingCode(null);
                }}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除卡密 <Typography.Text code>{deletingCode?.code}</Typography.Text> 吗？
            </Modal>

            <Modal
                title="批量删除卡密"
                open={batchDeleteOpen}
                onCancel={() => setBatchDeleteOpen(false)}
                onOk={() => void handleBatchDelete()}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除已选中的 {selectedIds.length} 张卡密吗？
            </Modal>
        </main>
    );
}
