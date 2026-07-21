"use client";

import {
    ApiOutlined,
    CalendarOutlined,
    CrownOutlined,
    DeleteOutlined,
    DesktopOutlined,
    EditOutlined,
    IdcardOutlined,
    LockOutlined,
    MailOutlined,
    MobileOutlined,
    PlusOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    SearchOutlined,
    ThunderboltOutlined,
    UserOutlined,
} from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Avatar, Button, Card, Col, DatePicker, Flex, Form, Input, InputNumber, Modal, Row, Select, Space, Tag, Tooltip, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";

import { fetchAdminSystemSettings, type AdminUser } from "@/services/api/admin";
import { useQuery } from "@tanstack/react-query";
import { useAdminUsers } from "./use-admin-users";
import { fetchAllRoles, type AdminRole } from "@/services/api/role";
import { useUserStore } from "@/stores/use-user-store";
import { UserSubscriptionsModal } from "./user-subscriptions-modal";
import { UserDetailModal } from "./user-detail-modal";

type UserFormValues = Omit<Partial<AdminUser>, "membershipExpiresAt"> & { password?: string; membershipExpiresAt?: Dayjs | string };

// roleOptions fetched dynamically from server

const statusOptions = [
    { label: "正常", value: "active" },
    { label: "禁用", value: "ban" },
];

const customChannelPolicyOptions = [
    { label: "跟随角色", value: "inherit" },
    { label: "允许", value: "enabled" },
    { label: "禁止", value: "disabled" },
];

type CustomChannelPolicy = "inherit" | "enabled" | "disabled";

function resolveCustomChannelAccess(systemAllowed: boolean, rolePolicy: CustomChannelPolicy, userPolicy: CustomChannelPolicy) {
    if (userPolicy === "enabled") return { allowed: true, source: "用户设置" };
    if (userPolicy === "disabled") return { allowed: false, source: "用户设置" };
    if (rolePolicy === "enabled") return { allowed: true, source: "角色权限" };
    if (rolePolicy === "disabled") return { allowed: false, source: "角色权限" };
    return { allowed: systemAllowed, source: "系统设置" };
}

export default function AdminUsersPage() {
    const token = useUserStore((state) => state.token);
    const { data: rolesData } = useQuery({
        queryKey: ["admin", "roles"],
        queryFn: () => fetchAllRoles(),
        staleTime: 60000,
    });
    const { data: systemSettings } = useQuery({
        queryKey: ["admin", "system-settings", "custom-channel"],
        queryFn: () => fetchAdminSystemSettings(token),
        enabled: Boolean(token),
        staleTime: 60000,
    });
    const roles = (rolesData || []) as AdminRole[];
    const roleOptions = roles.map((r: AdminRole) => ({ label: r.label, value: r.name }));
    const roleLabelMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const roleItem of roles) {
            map.set(roleItem.name, roleItem.label || roleItem.name);
        }
        return map;
    }, [roles]);
    const {
        users,
        keyword,
        role,
        status,
        page,
        pageSize,
        total,
        isLoading,
        searchUsers,
        changeRole,
        changeStatus,
        changePage,
        changePageSize,
        resetFilters,
        refreshUsers,
        saveUser: saveAdminUser,
        adjustCredits,
        deleteUser,
        batchDeleteUsers,
        batchUpdateStatus,
    } = useAdminUsers();
    const [form] = Form.useForm<UserFormValues>();
    const [keywordText, setKeywordText] = useState(keyword);
    const [editingUser, setEditingUser] = useState<Partial<AdminUser> | null>(null);
    const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
    const [subscriptionUser, setSubscriptionUser] = useState<AdminUser | null>(null);
    const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
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
                customChannelPolicy: editingUser.customChannelPolicy || "inherit",
                password: "",
                membershipExpiresAt: editingUser.membershipExpiresAt ? dayjs(editingUser.membershipExpiresAt) : undefined,
            });
        }
    }, [editingUser, form]);

    const selectedRoleName = Form.useWatch("role", form);
    const selectedUserPolicy = (Form.useWatch("customChannelPolicy", form) || "inherit") as CustomChannelPolicy;
    const selectedRole = roles.find((item) => item.name === selectedRoleName);
    const rolePolicy = (selectedRole?.customChannelPolicy || "inherit") as CustomChannelPolicy;
    const customChannelAccess = resolveCustomChannelAccess(Boolean(systemSettings?.allowCustomChannel), rolePolicy, selectedUserPolicy);

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
            width: 140,
            render: (_, item) => (
                <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-[var(--admin-accent)] hover:underline" onClick={() => setDetailUser(item)}>
                    {item.username}
                </button>
            ),
        },
        {
            title: "昵称",
            dataIndex: "displayName",
            width: 110,
            render: (_, item) => (
                <Typography.Text ellipsis={{ tooltip: item.displayName || "-" }} style={{ maxWidth: 96 }}>
                    {item.displayName || "-"}
                </Typography.Text>
            ),
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
            title: "在线",
            dataIndex: "online",
            width: 130,
            render: (_, item) => (
                <Space size={4} wrap>
                    <Tag color={item.onlineApp ? "blue" : "default"} icon={<MobileOutlined />}>
                        App
                    </Tag>
                    <Tag color={item.onlineWeb ? "green" : "default"} icon={<DesktopOutlined />}>
                        Web
                    </Tag>
                </Space>
            ),
        },
        {
            title: "算力点",
            dataIndex: "credits",
            width: 100,
            render: (_, item) => <Typography.Text type={item.credits < 0 ? "danger" : undefined}>{item.credits}</Typography.Text>,
        },
        {
            title: "会员到期",
            dataIndex: "membershipExpiresAt",
            width: 150,
            render: (_, item) => {
                if (!item.membershipExpiresAt) return <Typography.Text type="secondary">-</Typography.Text>;
                const expired = dayjs(item.membershipExpiresAt).isBefore(dayjs());
                return <Typography.Text type={expired ? "secondary" : undefined}>{dayjs(item.membershipExpiresAt).format("YYYY-MM-DD HH:mm")}</Typography.Text>;
            },
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
            width: 132,
            align: "right",
            render: (_, item) => (
                <Space size={4}>
                    {item.role !== "admin" && (
                        <Tooltip title="管理订阅">
                            <Button type="text" size="small" icon={<CrownOutlined />} onClick={() => setSubscriptionUser(item)} />
                        </Tooltip>
                    )}
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
        <div className="admin-data-page" style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", overflowX: "hidden" }}>
            <div className="admin-page-title">
                <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
                    用户管理
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    管理平台用户账户和权限
                </Typography.Text>
            </div>
            <Flex vertical gap={16} style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
                <Card className="admin-filter-card" variant="borderless" style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
                    <Form layout="vertical">
                        <Row gutter={[16, 12]} align="bottom" wrap>
                            <Col xs={24} md={12} xl={8} xxl={7}>
                                <Form.Item label="关键词">
                                    <Input value={keywordText} placeholder="搜索用户名、昵称、邮箱或 Linux.do ID" allowClear onPressEnter={() => searchUsers(keywordText)} onChange={(event) => setKeywordText(event.target.value)} />
                                </Form.Item>
                            </Col>
                            <Col xs={12} md={6} xl={4} xxl={3}>
                                <Form.Item label="角色">
                                    <Select value={role || undefined} placeholder="全部" allowClear options={roleOptions} onChange={(value) => changeRole(value || "")} />
                                </Form.Item>
                            </Col>
                            <Col xs={12} md={6} xl={4} xxl={3}>
                                <Form.Item label="状态">
                                    <Select value={status || undefined} placeholder="全部" allowClear options={statusOptions} onChange={(value) => changeStatus(value || "")} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8} xl={4} xxl={3}>
                                <Form.Item>
                                    <Space wrap>
                                        <Button
                                            onClick={() => {
                                                setKeywordText("");
                                                resetFilters();
                                            }}
                                        >
                                            重置
                                        </Button>
                                        <Button type="primary" icon={<SearchOutlined />} onClick={() => searchUsers(keywordText)}>
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
                    scroll={{ x: 1130 }}
                    cardProps={{ variant: "borderless", style: { width: "100%", maxWidth: "100%", minWidth: 0, overflow: "hidden" } }}
                    tableStyle={{ minWidth: 1130 }}
                    rowSelection={{
                        selectedRowKeys: selectedIds,
                        onChange: (keys) => setSelectedIds(keys.map(String)),
                        getCheckboxProps: (record) => ({ disabled: record.role === "admin" }),
                    }}
                    headerTitle={
                        <Space wrap>
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
                        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setEditingUser({ role: "user", status: "active", customChannelPolicy: "inherit" })}>
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

            <UserSubscriptionsModal user={subscriptionUser} open={Boolean(subscriptionUser)} onClose={() => setSubscriptionUser(null)} onChanged={() => void refreshUsers()} />
            <UserDetailModal user={detailUser} open={Boolean(detailUser)} roleLabels={roleLabelMap} onClose={() => setDetailUser(null)} />

            <Modal
                title={
                    <Flex align="center" gap={12}>
                        <Avatar size={38} icon={<UserOutlined />} style={{ background: "#0f766e" }} />
                        <div>
                            <Typography.Text strong style={{ display: "block", fontSize: 16 }}>
                                {editingUser?.id ? "编辑用户" : "新增用户"}
                            </Typography.Text>
                            <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, fontWeight: 400 }}>
                                {editingUser?.id ? editingUser.displayName || editingUser.username : "创建账号并分配访问权限"}
                            </Typography.Text>
                        </div>
                    </Flex>
                }
                open={Boolean(editingUser)}
                width="min(840px, calc(100vw - 32px))"
                onCancel={() => setEditingUser(null)}
                onOk={() => void saveUser()}
                okText="保存"
                cancelText="取消"
                destroyOnHidden
            >
                <Form form={form} layout="vertical" requiredMark={false} className="pt-1">
                    <section>
                        <Flex align="center" gap={9} className="mb-4">
                            <span className="flex size-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <IdcardOutlined />
                            </span>
                            <div>
                                <Typography.Text strong style={{ display: "block" }}>
                                    账号信息
                                </Typography.Text>
                                <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                                    登录凭证与基础资料
                                </Typography.Text>
                            </div>
                        </Flex>
                        <Row gutter={[16, 2]}>
                            <Col xs={24} md={12}>
                                <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
                                    <Input prefix={<UserOutlined />} placeholder="用于登录的账号" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="password" label={editingUser?.id ? "新密码" : "密码"} rules={editingUser?.id ? [] : [{ required: true, message: "请输入密码" }]}>
                                    <Input.Password prefix={<LockOutlined />} autoComplete="new-password" placeholder={editingUser?.id ? "留空则不修改" : "设置登录密码"} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="displayName" label="昵称">
                                    <Input prefix={<IdcardOutlined />} placeholder="用户显示名称" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="email" label="邮箱">
                                    <Input prefix={<MailOutlined />} placeholder="name@example.com" />
                                </Form.Item>
                            </Col>
                        </Row>
                    </section>

                    <section className="mt-2 border-t border-stone-200 pt-5 dark:border-stone-800">
                        <Flex align="center" gap={9} className="mb-4">
                            <span className="flex size-8 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                                <SafetyCertificateOutlined />
                            </span>
                            <div>
                                <Typography.Text strong style={{ display: "block" }}>
                                    权限与状态
                                </Typography.Text>
                                <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                                    用户设置优先于角色和系统设置
                                </Typography.Text>
                            </div>
                        </Flex>
                        <Row gutter={[16, 2]}>
                            <Col xs={24} md={8}>
                                <Form.Item name="role" label="角色" rules={[{ required: true, message: "请选择角色" }]}>
                                    <Select options={roleOptions} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
                                    <Select options={statusOptions} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={8}>
                                <Form.Item name="customChannelPolicy" label="自定义渠道">
                                    <Select options={customChannelPolicyOptions} suffixIcon={<ApiOutlined />} />
                                </Form.Item>
                            </Col>
                            <Col xs={24}>
                                <div className="mb-5 flex min-h-11 items-center justify-between gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-800 dark:bg-stone-900/40">
                                    <Flex align="center" gap={9}>
                                        <ApiOutlined className={customChannelAccess.allowed ? "text-emerald-600" : "text-stone-400"} />
                                        <Typography.Text>自定义渠道最终权限</Typography.Text>
                                    </Flex>
                                    <Space size={6}>
                                        <Tag color={customChannelAccess.allowed ? "green" : "red"}>{customChannelAccess.allowed ? "允许" : "禁止"}</Tag>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                            来源：{customChannelAccess.source}
                                        </Typography.Text>
                                    </Space>
                                </div>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item name="membershipExpiresAt" label="会员到期时间">
                                    <DatePicker prefix={<CalendarOutlined />} showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: "100%" }} placeholder="不设置则非会员" allowClear />
                                </Form.Item>
                            </Col>
                        </Row>
                    </section>
                    {editingUser?.id ? (
                        <section className="mt-1 border-t border-stone-200 pt-5 dark:border-stone-800">
                            <Flex align="center" gap={9} className="mb-4">
                                <span className="flex size-8 items-center justify-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                    <ThunderboltOutlined />
                                </span>
                                <div>
                                    <Typography.Text strong style={{ display: "block" }}>
                                        算力点
                                    </Typography.Text>
                                    <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                                        直接设置用户当前可用余额
                                    </Typography.Text>
                                </div>
                            </Flex>
                            <Form.Item label="当前算力点" style={{ maxWidth: 390, marginBottom: 4 }}>
                                <Space.Compact style={{ width: "100%" }}>
                                    <Form.Item name="credits" noStyle>
                                        <InputNumber min={0} precision={0} prefix={<ThunderboltOutlined />} style={{ width: "100%" }} />
                                    </Form.Item>
                                    <Button type="primary" ghost onClick={() => void saveCredits()}>
                                        单独调整
                                    </Button>
                                </Space.Compact>
                            </Form.Item>
                        </section>
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

            <Modal title="批量删除用户" open={batchDeleteOpen} onCancel={() => setBatchDeleteOpen(false)} onOk={() => void handleBatchDelete()} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除已选中的 {selectedIds.length} 个用户吗？删除后这些账号将无法继续登录。
            </Modal>

            <Modal title="批量修改状态" open={batchStatusOpen} onCancel={() => setBatchStatusOpen(false)} onOk={() => void handleBatchStatus()} okText="确定" cancelText="取消">
                <Typography.Text>将已选中的 {selectedIds.length} 个用户状态修改为：</Typography.Text>
                <Select value={batchStatusValue} onChange={setBatchStatusValue} options={statusOptions} style={{ width: 120, marginLeft: 8 }} />
            </Modal>
        </div>
    );
}
