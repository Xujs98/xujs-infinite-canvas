"use client";

import { DeleteOutlined, EditOutlined, GiftOutlined, LockOutlined, PlusOutlined, SafetyOutlined, SearchOutlined, UserOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Flex, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
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
                    allowOffline: Boolean(values.allowOffline),
                    offlineCreditLimit: Boolean(values.allowOffline) ? Math.max(0, Math.floor(Number(values.offlineCreditLimit) || 0)) : 0,
                });
                message.success("更新成功");
            } else {
                await createAdminRole(token, {
                    name: values.name,
                    label: values.label,
                    description: values.description,
                    allowedModels: values.allowedModels || [],
                    freeModels: values.freeModels || [],
                    allowOffline: Boolean(values.allowOffline),
                    offlineCreditLimit: Boolean(values.allowOffline) ? Math.max(0, Math.floor(Number(values.offlineCreditLimit) || 0)) : 0,
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
        form.setFieldsValue({ allowedModels: [], freeModels: [], allowOffline: false, offlineCreditLimit: 0 });
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
            allowOffline: Boolean(item.allowOffline),
            offlineCreditLimit: item.offlineCreditLimit ?? 0,
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
            width: 220,
            render: (_: unknown, item: AdminRole) => (
                <Flex align="center" gap={12} style={{ minWidth: 0 }}>
                    <span
                        style={{
                            width: 36,
                            height: 36,
                            flex: "0 0 36px",
                            borderRadius: 8,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontSize: 14,
                            fontWeight: 600,
                            background: builtinRoleColors[item.name] || "#595959",
                        }}
                    >
                        {item.label?.slice(0, 1)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                        <Flex align="center" gap={8} wrap={false}>
                            <Typography.Text strong ellipsis={{ tooltip: item.label }} style={{ maxWidth: 108, fontSize: 14, whiteSpace: "nowrap" }}>
                                {item.label}
                            </Typography.Text>
                            {item.isBuiltin && <Tag color="default" style={{ margin: 0, flex: "0 0 auto" }}>内置</Tag>}
                        </Flex>
                        <Typography.Text type="secondary" ellipsis={{ tooltip: item.name }} style={{ display: "block", maxWidth: 160, fontSize: 12, lineHeight: "20px" }}>
                            {item.name}
                        </Typography.Text>
                    </div>
                </Flex>
            ),
        },
        {
            title: "描述",
            dataIndex: "description",
            width: 220,
            ellipsis: true,
            render: (text: string) => <Typography.Text type="secondary" ellipsis={{ tooltip: text || "-" }} style={{ maxWidth: 180 }}>{text || "-"}</Typography.Text>,
        },
        {
            title: "模型权限",
            dataIndex: "allowedModels",
            width: 260,
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
            width: 260,
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
            title: "允许离线",
            dataIndex: "allowOffline",
            width: 120,
            render: (_: unknown, item: AdminRole) => (
                <Tag color={item.allowOffline ? "green" : "default"}>{item.allowOffline ? "允许" : "关闭"}</Tag>
            ),
        },
        {
            title: "离线预支",
            dataIndex: "offlineCreditLimit",
            width: 130,
            render: (_: unknown, item: AdminRole) => item.allowOffline ? <Tag color="gold">{item.offlineCreditLimit && item.offlineCreditLimit > 0 ? `${item.offlineCreditLimit} 点` : "无限制"}</Tag> : <Typography.Text type="secondary">-</Typography.Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 132,
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
    const allowOfflineValue = Form.useWatch("allowOffline", form);

    return (
        <div style={{ padding: "24px 28px", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", overflowX: "hidden" }}>
            <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
                {/* 页面标题 */}
                <Flex align="center" gap={14} style={{ marginBottom: 22 }}>
                    <span style={{ width: 44, height: 44, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", background: "linear-gradient(135deg, #3b82f6, #7c3aed)", boxShadow: "0 10px 22px rgba(59,130,246,0.22)", flex: "0 0 auto" }}>
                        <SafetyOutlined style={{ fontSize: 20 }} />
                    </span>
                    <div>
                        <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>角色管理</Typography.Title>
                        <Typography.Text type="secondary" style={{ fontSize: 13 }}>管理用户角色和模型使用权限</Typography.Text>
                    </div>
                </Flex>

                {/* 工具栏 */}
                <Card variant="borderless" style={{ marginBottom: 16, borderRadius: 10 }} styles={{ body: { padding: 18 } }}>
                    <Flex align="center" justify="space-between" gap={12} wrap>
                        <Input
                            prefix={<SearchOutlined style={{ color: "#8c8c8c" }} />}
                            placeholder="搜索角色"
                            allowClear
                            value={keyword}
                            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
                            style={{ width: 260 }}
                        />
                        <Space wrap>
                            {selectedIds.length > 0 && (
                                <Button danger icon={<DeleteOutlined />} onClick={() => setIsBatchDeleteOpen(true)}>
                                    删除选中 ({selectedIds.length})
                                </Button>
                            )}
                            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                                新增角色
                            </Button>
                        </Space>
                    </Flex>
                </Card>

                {/* 角色列表 */}
                <Card variant="borderless" style={{ borderRadius: 10, overflow: "hidden" }} styles={{ body: { padding: 18 } }}>
                    <Table
                        rowKey="id"
                        size="middle"
                        loading={loading}
                        dataSource={items}
                        columns={columns}
                        tableLayout="fixed"
                        scroll={{ x: 1242 }}
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
                        style={{ width: "100%" }}
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
                    <Form.Item
                        name="allowOffline"
                        label="允许离线"
                        valuePropName="checked"
                        tooltip="开启后，该角色 App 端在服务端断开时保留登录，并记录离线算力点账本；服务端恢复后自动结算。"
                    >
                        <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                    </Form.Item>
                    {allowOfflineValue ? (
                        <Form.Item
                            name="offlineCreditLimit"
                            label="最大允许离线预支算力点"
                            tooltip="服务端离线时，该角色最多可把余额预支到此额度的负数；不填写或 0 表示无限制预支。"
                            rules={[{ type: "number", min: 0, message: "预支额度不能小于 0" }]}
                        >
                            <InputNumber min={0} precision={0} style={{ width: "100%" }} addonAfter="点" placeholder="不填或 0 表示无限制" />
                        </Form.Item>
                    ) : null}
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
