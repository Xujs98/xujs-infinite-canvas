"use client";

import { DeleteOutlined, EditOutlined, GiftOutlined, LockOutlined, PlusOutlined, SafetyOutlined, SearchOutlined, UserOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Form, Input, Modal, Row, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useUserStore } from "@/stores/use-user-store";
import { fetchAllChannelModels, fetchAdminUsers, type AdminUser } from "@/services/api/admin";
import { type AdminRole, fetchAdminRoles, createAdminRole, updateAdminRole, deleteAdminRole, batchDeleteAdminRoles } from "@/services/api/role";

const builtinRoleColors: Record<string, string> = {
    admin: "#f5222d",
    user: "#1890ff",
    member: "#722ed1",
};

export default function AdminRolesPage() {
    const { message } = App.useApp();
    const token = useUserStore((s) => s.token);
    const [items, setItems] = useState<AdminRole[]>([]);
    const [channelModels, setChannelModels] = useState<string[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<AdminRole | null>(null);
    const [deletingItem, setDeletingItem] = useState<AdminRole | null>(null);
    const [viewingRole, setViewingRole] = useState<AdminRole | null>(null);
    const [roleUsers, setRoleUsers] = useState<AdminUser[]>([]);
    const [roleUsersTotal, setRoleUsersTotal] = useState(0);
    const [roleUsersLoading, setRoleUsersLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isBatchDeleteOpen, setIsBatchDeleteOpen] = useState(false);
    const [form] = Form.useForm();

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchAdminRoles(token, { keyword, page, pageSize: 50 });
            setItems(res.items);
            setTotal(res.total);
        } catch {
            // handled by api layer
        } finally {
            setLoading(false);
        }
    }, [token, keyword, page]);

    const fetchChannelModels = useCallback(async () => {
        try {
            const models = await fetchAllChannelModels(token);
            setChannelModels(models);
        } catch {
            // ignore
        }
    }, [token]);

    useEffect(() => {
        fetchItems();
        fetchChannelModels();
    }, [fetchItems, fetchChannelModels]);

    useEffect(() => {
        const handleRolesChanged = () => {
            void fetchItems();
        };
        window.addEventListener("roles-changed", handleRolesChanged);
        return () => window.removeEventListener("roles-changed", handleRolesChanged);
    }, [fetchItems]);

    const handleSave = async () => {
        const values = await form.validateFields();
        try {
            if (editingItem) {
                await updateAdminRole(token, editingItem.id, {
                    label: values.label,
                    description: values.description,
                    allowedModels: values.allowedModels || [],
                    freeModels: values.freeModels || [],
                });
                message.success("更新成功");
            } else {
                await createAdminRole(token, {
                    name: values.name,
                    label: values.label,
                    description: values.description,
                    allowedModels: values.allowedModels || [],
                    freeModels: values.freeModels || [],
                });
                message.success("创建成功");
            }
            setModalOpen(false);
            setEditingItem(null);
            form.resetFields();
            fetchItems();
        } catch (err) {
            if (err instanceof Error) message.error(err.message);
        }
    };

    const handleDelete = async (item: AdminRole) => {
        try {
            await deleteAdminRole(token, item.id);
            message.success("删除成功");
            setDeletingItem(null);
            fetchItems();
        } catch {
            // handled by api layer
        }
    };

    const handleBatchDelete = async () => {
        try {
            await batchDeleteAdminRoles(token, selectedIds);
            message.success("删除成功");
            setSelectedIds([]);
            setIsBatchDeleteOpen(false);
            fetchItems();
        } catch {
            // handled by api layer
        }
    };

    const openCreate = () => {
        setEditingItem(null);
        form.resetFields();
        form.setFieldsValue({ allowedModels: [], freeModels: [] });
        setModalOpen(true);
    };

    const openEdit = (item: AdminRole) => {
        setEditingItem(item);
        form.setFieldsValue({
            name: item.name,
            label: item.label,
            description: item.description,
            allowedModels: item.allowedModels || [],
            freeModels: item.freeModels || [],
        });
        setModalOpen(true);
    };

    const openRoleUsers = async (item: AdminRole) => {
        setViewingRole(item);
        setRoleUsers([]);
        setRoleUsersTotal(0);
        setRoleUsersLoading(true);
        try {
            const res = await fetchAdminUsers(token, { role: item.name, page: 1, pageSize: 100 });
            setRoleUsers(res.items || []);
            setRoleUsersTotal(res.total || 0);
        } catch (err) {
            if (err instanceof Error) message.error(err.message);
        } finally {
            setRoleUsersLoading(false);
        }
    };

    const columns = [
        {
            title: "角色",
            dataIndex: "label",
            render: (_: unknown, item: AdminRole) => (
                <Space>
                    <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold text-white"
                        style={{ background: builtinRoleColors[item.name] || "#595959" }}
                    >
                        {item.label?.slice(0, 1)}
                    </span>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-medium">{item.label}</span>
                            {item.isBuiltin && <Tag color="default">内置</Tag>}
                        </div>
                        <div className="text-xs text-gray-400">{item.name}</div>
                    </div>
                </Space>
            ),
        },
        {
            title: "描述",
            dataIndex: "description",
            ellipsis: true,
            render: (text: string) => <Typography.Text type="secondary">{text || "-"}</Typography.Text>,
        },
        {
            title: "模型权限",
            dataIndex: "allowedModels",
            width: 300,
            render: (_: unknown, item: AdminRole) => {
                const models = item.allowedModels || [];
                if (models.length === 0) {
                    return <Tag color="success">全部模型</Tag>;
                }
                return (
                    <Space size={[4, 4]} wrap>
                        {models.slice(0, 4).map((m) => (
                            <Tag key={m}>{m}</Tag>
                        ))}
                        {models.length > 4 && <Tag>+{models.length - 4}</Tag>}
                    </Space>
                );
            },
        },
        {
            title: "免费模型",
            dataIndex: "freeModels",
            width: 300,
            render: (_: unknown, item: AdminRole) => {
                const models = item.freeModels || [];
                if (models.length === 0) {
                    return <Tag color="default">未配置</Tag>;
                }
                return (
                    <Space size={[4, 4]} wrap>
                        {models.slice(0, 4).map((m) => (
                            <Tag key={m} color="cyan">{m}</Tag>
                        ))}
                        {models.length > 4 && <Tag color="cyan">+{models.length - 4}</Tag>}
                    </Space>
                );
            },
        },
        {
            title: "操作",
            key: "actions",
            width: 120,
            align: "right" as const,
            render: (_: unknown, item: AdminRole) => (
                <Space size={4}>
                    <Tooltip title="查看用户">
                        <Button type="text" size="small" icon={<UserOutlined />} onClick={() => void openRoleUsers(item)} />
                    </Tooltip>
                    <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(item)} disabled={item.isBuiltin && item.name === "admin"} />
                    </Tooltip>
                    <Tooltip title={item.isBuiltin ? "内置角色不可删除" : "删除"}>
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => setDeletingItem(item)} disabled={item.isBuiltin} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const modelOptions = useMemo(() => {
        return channelModels.map((m) => ({ label: m, value: m }));
    }, [channelModels]);

    const allowedModelsValue = Form.useWatch("allowedModels", form);
    const freeModelsValue = Form.useWatch("freeModels", form);

    return (
        <div className="min-h-screen p-6">
            <div className="mx-auto max-w-[1200px]">
                {/* 页面标题 */}
                <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25">
                        <SafetyOutlined className="text-lg" />
                    </div>
                    <div>
                        <Typography.Title level={4} style={{ margin: 0 }}>角色管理</Typography.Title>
                        <Typography.Text type="secondary" className="text-sm">管理用户角色和模型使用权限</Typography.Text>
                    </div>
                </div>

                {/* 工具栏 */}
                <div className="sticky top-0 z-50 mb-7 flex items-center justify-between rounded-2xl border border-gray-100 bg-white/95 px-5 py-3 shadow-sm backdrop-blur-sm">
                    <Space>
                        <Input
                            prefix={<SearchOutlined className="text-gray-400" />}
                            placeholder="搜索角色"
                            allowClear
                            value={keyword}
                            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
                            style={{ width: 220 }}
                        />
                    </Space>
                    <Space>
                        {selectedIds.length > 0 && (
                            <Button danger icon={<DeleteOutlined />} onClick={() => setIsBatchDeleteOpen(true)}>
                                删除选中 ({selectedIds.length})
                            </Button>
                        )}
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} className="!rounded-lg">
                            新增角色
                        </Button>
                    </Space>
                </div>

                {/* 角色列表 */}
                <Card variant="borderless" className="!rounded-xl !border-gray-100 !shadow-sm">
                    <Table
                        rowKey="id"
                        loading={loading}
                        dataSource={items}
                        columns={columns}
                        rowSelection={{
                            selectedRowKeys: selectedIds,
                            onChange: (keys) => setSelectedIds(keys as string[]),
                            getCheckboxProps: (record: AdminRole) => ({ disabled: record.isBuiltin }),
                        }}
                        pagination={{
                            current: page,
                            total,
                            pageSize: 50,
                            onChange: setPage,
                            showTotal: (t) => `共 ${t} 条`,
                        }}
                    />
                </Card>
            </div>

            {/* 新增/编辑弹窗 */}
            <Modal
                title={editingItem ? "编辑角色" : "新增角色"}
                open={modalOpen}
                width={640}
                onCancel={() => { setModalOpen(false); setEditingItem(null); form.resetFields(); }}
                onOk={() => void handleSave()}
                okText="保存"
                cancelText="取消"
            >
                <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="name" label="角色标识" rules={[{ required: !editingItem, message: "请输入角色标识" }]}>
                                <Input placeholder="如：editor" disabled={!!editingItem} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="label" label="角色名称" rules={[{ required: true, message: "请输入角色名称" }]}>
                                <Input placeholder="如：编辑员" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="description" label="描述">
                        <Input.TextArea rows={2} placeholder="角色说明" />
                    </Form.Item>
                    <Form.Item label="模型使用权限">
                        <div className="mb-2 flex items-center gap-2">
                            <Typography.Text type="secondary" className="text-xs">留空表示允许使用全部模型</Typography.Text>
                        </div>
                        <Form.Item name="allowedModels" noStyle>
                            <Select
                                mode="tags"
                                placeholder="输入模型名称或从下拉选择"
                                options={modelOptions}
                                maxTagCount="responsive"
                                allowClear
                                showSearch
                                filterOption={(input, option) =>
                                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                                }
                            />
                        </Form.Item>
                        {allowedModelsValue && allowedModelsValue.length > 0 && (
                            <div className="mt-2 flex items-center gap-2">
                                <LockOutlined className="text-xs text-gray-400" />
                                <Typography.Text type="secondary" className="text-xs">
                                    仅可使用 {allowedModelsValue.length} 个指定模型
                                </Typography.Text>
                            </div>
                        )}
                    </Form.Item>
                    <Form.Item label="可免费使用模型">
                        <div className="mb-2 flex items-center gap-2">
                            <Typography.Text type="secondary" className="text-xs">默认不选中；选中的模型调用时不扣除算力点</Typography.Text>
                        </div>
                        <Form.Item name="freeModels" noStyle>
                            <Select
                                mode="tags"
                                placeholder="输入模型名称或从下拉选择"
                                options={modelOptions}
                                maxTagCount="responsive"
                                allowClear
                                showSearch
                                filterOption={(input, option) =>
                                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                                }
                            />
                        </Form.Item>
                        {freeModelsValue && freeModelsValue.length > 0 && (
                            <div className="mt-2 flex items-center gap-2">
                                <GiftOutlined className="text-xs text-cyan-500" />
                                <Typography.Text type="secondary" className="text-xs">
                                    {freeModelsValue.length} 个模型将免费调用
                                </Typography.Text>
                            </div>
                        )}
                    </Form.Item>
                </Form>
            </Modal>

            {/* 删除确认 */}
            <Modal
                title="删除角色"
                open={Boolean(deletingItem)}
                onCancel={() => setDeletingItem(null)}
                onOk={() => void handleDelete(deletingItem!)}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除角色「{deletingItem?.label}」吗？
            </Modal>

            {/* 角色用户 */}
            <Modal
                title={viewingRole ? `角色用户：${viewingRole.label}` : "角色用户"}
                open={Boolean(viewingRole)}
                width={820}
                onCancel={() => setViewingRole(null)}
                footer={[
                    <Button key="close" onClick={() => setViewingRole(null)}>
                        关闭
                    </Button>,
                ]}
            >
                <div className="mb-3 flex items-center justify-between">
                    <Typography.Text type="secondary">
                        角色标识：{viewingRole?.name || "-"}
                    </Typography.Text>
                    <Tag color="blue">共 {roleUsersTotal} 人</Tag>
                </div>
                <Table<AdminUser>
                    rowKey="id"
                    loading={roleUsersLoading}
                    dataSource={roleUsers}
                    pagination={false}
                    size="small"
                    columns={[
                        {
                            title: "用户",
                            dataIndex: "username",
                            render: (_, user) => <Typography.Text copyable>{user.username}</Typography.Text>,
                        },
                        {
                            title: "昵称",
                            dataIndex: "displayName",
                            render: (_, user) => user.displayName || "-",
                        },
                        {
                            title: "状态",
                            dataIndex: "status",
                            width: 90,
                            render: (_, user) => <Tag color={user.status === "ban" ? "red" : "green"}>{user.status === "ban" ? "禁用" : "正常"}</Tag>,
                        },
                        {
                            title: "算力点",
                            dataIndex: "credits",
                            width: 90,
                        },
                        {
                            title: "最近登录",
                            dataIndex: "lastLoginAt",
                            width: 170,
                            render: (_, user) => user.lastLoginAt || "-",
                        },
                    ]}
                />
            </Modal>

            {/* 批量删除确认 */}
            <Modal
                title="批量删除角色"
                open={isBatchDeleteOpen}
                onCancel={() => setIsBatchDeleteOpen(false)}
                onOk={() => void handleBatchDelete()}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除已选中的 {selectedIds.length} 个角色吗？
            </Modal>
        </div>
    );
}
