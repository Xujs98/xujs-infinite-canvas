"use client";

import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, Form, Input, Modal, Popconfirm, Row, Space, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import type { AdminPromptPreset } from "@/services/api/admin-prompt-presets";
import { useAdminPromptPresets } from "./use-admin-prompt-presets";

export default function AdminPromptPresetsPage() {
    const { presets, keyword, page, pageSize, total, isLoading, searchPresets, changePage, changePageSize, resetFilters, refreshPresets, savePreset, deletePreset, deletePresets } = useAdminPromptPresets();

    const [form] = Form.useForm<Partial<AdminPromptPreset>>();
    const [keywordText, setKeywordText] = useState(keyword);
    const [editingPreset, setEditingPreset] = useState<Partial<AdminPromptPreset> | null>(null);
    const [detailPreset, setDetailPreset] = useState<AdminPromptPreset | null>(null);
    const [deletingPreset, setDeletingPreset] = useState<AdminPromptPreset | null>(null);
    const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);

    useEffect(() => setKeywordText(keyword), [keyword]);

    useEffect(() => {
        if (editingPreset) {
            form.setFieldsValue(editingPreset);
        } else {
            form.resetFields();
        }
    }, [editingPreset, form]);

    const handleSave = async () => {
        const values = await form.validateFields();
        await savePreset({ ...editingPreset, ...values });
        setEditingPreset(null);
    };

    const handleDelete = async () => {
        if (!deletingPreset) return;
        await deletePreset(deletingPreset.id);
        setDeletingPreset(null);
    };

    const handleBatchDelete = async () => {
        if (!selectedPresetIds.length) return;
        await deletePresets(selectedPresetIds);
        setSelectedPresetIds([]);
    };

    const columns: ProColumns<AdminPromptPreset>[] = [
        {
            title: "名称",
            dataIndex: "name",
            width: 240,
            ellipsis: true,
            render: (_, item) => (
                <Typography.Link strong ellipsis style={{ maxWidth: 220, display: "block" }} onClick={() => setDetailPreset(item)}>
                    {item.name}
                </Typography.Link>
            ),
        },
        {
            title: "提示词正文",
            dataIndex: "prompt",
            ellipsis: true,
            render: (_, item) => (
                <Typography.Text type="secondary" ellipsis style={{ maxWidth: 520, display: "block" }}>
                    {item.prompt}
                </Typography.Text>
            ),
        },
        {
            title: "更新时间",
            dataIndex: "updatedAt",
            width: 170,
            render: (_, item) => <Typography.Text type="secondary">{dayjs(item.updatedAt).format("YYYY-MM-DD HH:mm")}</Typography.Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 132,
            align: "right",
            render: (_, item) => (
                <Space size={4}>
                    <Tooltip title="查看">
                        <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetailPreset(item)} />
                    </Tooltip>
                    <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingPreset(item)} />
                    </Tooltip>
                    <Tooltip title="删除">
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => setDeletingPreset(item)} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <div className="admin-data-page">
            <div className="admin-page-title">
                <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
                    提示词预设
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    管理提供给 app 同步的提示词预设
                </Typography.Text>
            </div>

            <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card className="admin-filter-card" variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="360px">
                                <Form.Item label="关键词">
                                    <Input value={keywordText} placeholder="搜索预设名称或提示词" allowClear onPressEnter={() => searchPresets(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
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
                                        <Button type="primary" icon={<SearchOutlined />} onClick={() => searchPresets(keywordText)}>
                                            查询
                                        </Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Card>

                <ProTable<AdminPromptPreset>
                    rowKey="id"
                    columns={columns}
                    dataSource={presets}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    cardProps={{ variant: "borderless" }}
                    rowSelection={{ selectedRowKeys: selectedPresetIds, onChange: (keys) => setSelectedPresetIds(keys.map(String)) }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>提示词预设</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshPresets() }}
                    toolBarRender={() =>
                        [
                            selectedPresetIds.length > 0 && (
                                <Popconfirm key="batch-delete" title={`确定删除选中的 ${selectedPresetIds.length} 条预设？`} onConfirm={() => void handleBatchDelete()} okButtonProps={{ danger: true }}>
                                    <Button danger icon={<DeleteOutlined />}>
                                        批量删除 {selectedPresetIds.length}
                                    </Button>
                                </Popconfirm>
                            ),
                            <Button key="refresh" icon={<ReloadOutlined />} onClick={() => void refreshPresets()} />,
                            <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingPreset({})}>
                                新增预设
                            </Button>,
                        ].filter(Boolean)
                    }
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

            <Modal title={editingPreset?.id ? "编辑预设" : "新增预设"} open={Boolean(editingPreset)} width={720} onCancel={() => setEditingPreset(null)} onOk={() => void handleSave()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入预设名称" }]}>
                        <Input placeholder="例如：电影级产品海报" />
                    </Form.Item>
                    <Form.Item name="prompt" label="提示词正文" rules={[{ required: true, message: "请输入提示词正文" }]}>
                        <Input.TextArea rows={10} placeholder="输入完整提示词，或可复用的描述模板" />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal title={detailPreset?.name || "预设详情"} open={Boolean(detailPreset)} width={760} onCancel={() => setDetailPreset(null)} footer={<Button onClick={() => setDetailPreset(null)}>关闭</Button>}>
                <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{detailPreset?.prompt}</Typography.Paragraph>
            </Modal>

            <Modal title="删除预设" open={Boolean(deletingPreset)} onCancel={() => setDeletingPreset(null)} onOk={() => void handleDelete()} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                <Typography.Text>确定删除预设「{deletingPreset?.name}」吗？</Typography.Text>
            </Modal>
        </div>
    );
}
