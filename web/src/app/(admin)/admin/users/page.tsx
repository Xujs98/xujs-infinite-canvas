"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Avatar, Button, Card, Col, DatePicker, Divider, Flex, Form, Input, InputNumber, Modal, Row, Select, Space, Tag, Tooltip, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";

import type { AdminUser } from "@/services/api/admin";
import { useQuery } from "@tanstack/react-query";
import { useAdminUsers } from "./use-admin-users";
import { fetchAllRoles, type AdminRole } from "@/services/api/role";
import { useUserStore } from "@/stores/use-user-store";

type UserFormValues = Omit<Partial<AdminUser>, "membershipExpiresAt"> & { password?: string; membershipExpiresAt?: Dayjs | string };

// roleOptions fetched dynamically from server

const statusOptions = [
    { label: "正常", value: "active" },
    { label: "禁用", value: "ban" },
];

export default function AdminUsersPage() {
    const token = useUserStore((state) => state.token);
    const { data: rolesData } = useQuery({
        queryKey: ["admin", "roles"],
        queryFn: () => fetchAllRoles(),
        staleTime: 60000,
    });
    const roles = rolesData || [];
    const roleOptions = roles.map((r: AdminRole) => ({ label: r.label, value: r.name }));
    const roleLabelMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const roleItem of roles) {
            map.set(roleItem.name, roleItem.label || roleItem.name);
        }
        return map;
    }, [roles]);
    const { users, keyword, role, status, page, pageSize, total, isLoading, searchUsers, changeRole, changeStatus, changePage, changePageSize, resetFilters, refreshUsers, saveUser: saveAdminUser, adjustCredits, deleteUser, batchDeleteUsers, batchUpdateStatus } = useAdminUsers();
    const [form] = Form.useForm<UserFormValues>();
    const [keywordText, setKeywordText] = useState(keyword);
    const [editingUser, setEditingUser] = useState<Partial<AdminUser> | null>(null);
    const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
    const [batchStatusOpen, setBatchStatusOpen] = useState(false);
    const [batchStatusValue, setBatchStatusValue] = useState<"active" | "ban">("active");

    useEffect(() => setKeywordText(keyword), [keyword]);

    useEffect(() => {
        if (editingUser) {
            form.setFieldsValue({
                status: "active",
                ...editingUser,
                role: editingUser.role || "user",
                password: "",
                membershipExpiresAt: editingUser.membershipExpiresAt ? dayjs(editingUser.membershipExpiresAt) : undefined,
            });
        }
    }, [editingUser, form]);

    const saveUser = async () => {
        const value = await form.validateFields();
        const userValue = { ...value };
        delete userValue.credits;
        delete userValue.membershipExpiresAt;
        const role = value.role;
        const membershipExpiresAt = dayjs.isDayjs(value.membershipExpiresAt) ? value.membershipExpiresAt.toISOString() : value.membershipExpiresAt || "";
        await saveAdminUser({ ...editingUser, ...userValue, role, membershipExpiresAt, password: value.password || undefined });
        setEditingUser(null);
    };

    const saveCredits = async () => {
        if (!editingUser?.id) return;
        await adjustCredits(editingUser.id, form.getFieldValue("credits") || 0);
    };

    const handleBatchDelete = async () => {
        await batchDeleteUsers(selectedIds);
        setSelectedIds([]);
        setBatchDeleteOpen(false);
    };

    const handleBatchStatus = async () => {
        await batchUpdateStatus(selectedIds, batchStatusValue);
        setSelectedIds([]);
        setBatchStatusOpen(false);
    };

    const columns: ProColumns<AdminUser>[] = [
        {
            title: "用户",
            dataIndex: "username",
            width: 150,
            render: (_, item) => <Typography.Text copyable>{item.username}</Typography.Text>,
        },
        {
            title: "昵称",
            dataIndex: "displayName",
            width: 120,
            render: (_, item) => <Typography.Text>{item.displayName || "-"}</Typography.Text>,
        },
        {
            title: "角色",
            dataIndex: "role",
            width: 100,
            render: (_, item) => {
                const colorMap: Record<string, string> = {
                    admin: "gold",
                    member: "blue",
                    user: "default",
                };
                return <Tag color={colorMap[item.role] || "geekblue"}>{roleLabelMap.get(item.role) || item.role || "-"}</Tag>;
            },
        },
        {
            title: "状态",
            dataIndex: "status",
            width: 90,
            render: (_, item) => <Tag color={item.status === "ban" ? "red" : "green"}>{item.status === "ban" ? "禁用" : "正常"}</Tag>,
        },
        {
            title: "算力点",
            dataIndex: "credits",
            width: 100,
            render: (_, item) => <Typography.Text>{item.credits}</Typography.Text>,
        },
        {
            title: "会员到期",
            dataIndex: "membershipExpiresAt",
            width: 170,
            render: (_, item) => {
                if (!item.membershipExpiresAt) return <Typography.Text type="secondary">-</Typography.Text>;
                const expired = dayjs(item.membershipExpiresAt).isBefore(dayjs());
                return <Tag color={expired ? "default" : "green"}>{dayjs(item.membershipExpiresAt).format("YYYY-MM-DD HH:mm")}</Tag>;
            },
        },
        {
            title: "Linux.do",
            dataIndex: "linuxDoId",
            width: 140,
            render: (_, item) => <Typography.Text type="secondary">{item.linuxDoId || "-"}</Typography.Text>,
        },
        {
            title: "最近登录",
            dataIndex: "lastLoginAt",
            width: 180,
            render: (_, item) => <Typography.Text type="secondary">{item.lastLoginAt ? dayjs(item.lastLoginAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Typography.Text>,
        },
        {
            title: "操作",
            key: "actions",
            width: 96,
            align: "right",
            render: (_, item) => (
                <Space size={4}>
                    <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingUser(item)} />
                    </Tooltip>
                    {item.role !== "admin" && (
                        <Tooltip title="删除">
                            <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => setDeletingUser(item)} />
                        </Tooltip>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: "24px 28px" }}>
            <div style={{ marginBottom: 20 }}>
                <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>用户管理</Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>管理平台用户账户和权限</Typography.Text>
            </div>
            <Flex vertical gap={16}>
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="360px">
                                <Form.Item label="关键词">
                                    <Input.Search
                                        value={keywordText}
                                        placeholder="搜索用户名、昵称、邮箱或 Linux.do ID"
                                        allowClear
                                        enterButton={<SearchOutlined />}
                                        onSearch={() => searchUsers(keywordText)}
                                        onChange={(event) => setKeywordText(event.target.value)}
                                    />
                                </Form.Item>
                            </Col>
                            <Col flex="160px">
                                <Form.Item label="角色">
                                    <Select
                                        value={role || undefined}
                                        placeholder="全部"
                                        allowClear
                                        options={roleOptions}
                                        onChange={(value) => changeRole(value || "")}
                                    />
                                </Form.Item>
                            </Col>
                            <Col flex="160px">
                                <Form.Item label="状态">
                                    <Select
                                        value={status || undefined}
                                        placeholder="全部"
                                        allowClear
                                        options={statusOptions}
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
                                        <Button type="primary" icon={<ReloadOutlined />} onClick={() => searchUsers(keywordText)}>
                                            查询
                                        </Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Card>
                <ProTable<AdminUser>
                    rowKey="id"
                    columns={columns}
                    dataSource={users}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    cardProps={{ variant: "borderless" }}
                    rowSelection={{
                        selectedRowKeys: selectedIds,
                        onChange: (keys) => setSelectedIds(keys.map(String)),
                        getCheckboxProps: (record) => ({ disabled: record.role === "admin" }),
                    }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>用户列表</Typography.Text>
                            <Tag>{total} 人</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void refreshUsers() }}
                    toolBarRender={() => [
                        <Button key="batch-status" icon={<ReloadOutlined />} disabled={!selectedIds.length} onClick={() => setBatchStatusOpen(true)}>
                            批量状态{selectedIds.length ? ` ${selectedIds.length}` : ""}
                        </Button>,
                        <Button key="batch-delete" danger icon={<DeleteOutlined />} disabled={!selectedIds.length} onClick={() => setBatchDeleteOpen(true)}>
                            批量删除{selectedIds.length ? ` ${selectedIds.length}` : ""}
                        </Button>,
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingUser({ role: "user", status: "active" })}>
                            新增
                        </Button>,
                    ]}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        showTotal: (value) => `共 ${value} 人`,
                        onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? changePageSize(nextPageSize) : changePage(nextPage)),
                    }}
                />
            </Flex>

            <Modal title={editingUser?.id ? "编辑用户" : "新增用户"} open={Boolean(editingUser)} width={680} onCancel={() => setEditingUser(null)} onOk={() => void saveUser()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Typography.Text strong>基础信息</Typography.Text>
                    <Row gutter={14}>
                        <Col span={12}>
                            <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="password" label={editingUser?.id ? "新密码" : "密码"} rules={editingUser?.id ? [] : [{ required: true, message: "请输入密码" }]}>
                                <Input.Password autoComplete="new-password" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="displayName" label="昵称">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="email" label="邮箱">
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="role" label="角色" rules={[{ required: true, message: "请选择角色" }]}>
                                <Select options={roleOptions} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
                                <Select options={statusOptions} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="membershipExpiresAt" label="会员到期时间">
                                <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: "100%" }} placeholder="不设置则非会员" allowClear />
                            </Form.Item>
                        </Col>
                    </Row>
                    {editingUser?.id ? (
                        <>
                            <Divider style={{ margin: "4px 0 16px" }} />
                            <Typography.Text strong>算力点调整</Typography.Text>
                            <Row gutter={14}>
                                <Col span={12}>
                                    <Form.Item label="算力点">
                                        <Space.Compact style={{ width: "100%" }}>
                                            <Form.Item name="credits" noStyle>
                                                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
                                            </Form.Item>
                                            <Button onClick={() => void saveCredits()}>调整</Button>
                                        </Space.Compact>
                                    </Form.Item>
                                </Col>
                            </Row>
                        </>
                    ) : null}
                </Form>
            </Modal>

            <Modal
                title="删除用户"
                open={Boolean(deletingUser)}
                onCancel={() => setDeletingUser(null)}
                onOk={async () => {
                    if (!deletingUser) return;
                    await deleteUser(deletingUser.id);
                    setDeletingUser(null);
                }}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除「{deletingUser?.displayName || deletingUser?.username}」吗？删除后该账号将无法继续登录。
            </Modal>

            <Modal
                title="批量删除用户"
                open={batchDeleteOpen}
                onCancel={() => setBatchDeleteOpen(false)}
                onOk={() => void handleBatchDelete()}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除已选中的 {selectedIds.length} 个用户吗？删除后这些账号将无法继续登录。
            </Modal>

            <Modal
                title="批量修改状态"
                open={batchStatusOpen}
                onCancel={() => setBatchStatusOpen(false)}
                onOk={() => void handleBatchStatus()}
                okText="确定"
                cancelText="取消"
            >
                <Typography.Text>将已选中的 {selectedIds.length} 个用户状态修改为：</Typography.Text>
                <Select value={batchStatusValue} onChange={setBatchStatusValue} options={statusOptions} style={{ width: 120, marginLeft: 8 }} />
            </Modal>
        </div>
    );
}
