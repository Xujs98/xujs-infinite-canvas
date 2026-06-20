"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Card, Descriptions, Form, Input, Modal, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateProfile } from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";

export default function ProfilePage() {
    const router = useRouter();
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const setSession = useUserStore((state) => state.setSession);
    const [editOpen, setEditOpen] = useState(false);
    const [editLoading, setEditLoading] = useState(false);
    const [form] = Form.useForm();

    if (!user) {
        return (
            <main className="flex items-center justify-center" style={{ minHeight: "100%" }}>
                <Typography.Text type="secondary">请先登录</Typography.Text>
            </main>
        );
    }

    const membershipActive = user.membershipExpiresAt && dayjs(user.membershipExpiresAt).isAfter(dayjs());

    const handleSave = async () => {
        const values = await form.validateFields();
        setEditLoading(true);
        try {
            const updated = await updateProfile(token, {
                displayName: values.displayName || undefined,
                password: values.password || undefined,
            });
            setSession(token, updated);
            setEditOpen(false);
            form.resetFields();
        } catch (error) {
            // error handled by api layer
        } finally {
            setEditLoading(false);
        }
    };

    return (
        <main style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.back()} style={{ marginBottom: 16 }}>
                返回
            </Button>
            <Card
                title="个人中心"
                variant="borderless"
                extra={
                    <Button type="link" onClick={() => { form.setFieldsValue({ displayName: user.displayName, password: "" }); setEditOpen(true); }}>
                        编辑资料
                    </Button>
                }
            >
                <Descriptions column={1} bordered size="middle">
                    <Descriptions.Item label="用户名">{user.username}</Descriptions.Item>
                    <Descriptions.Item label="昵称">{user.displayName || "-"}</Descriptions.Item>
                    <Descriptions.Item label="角色">
                        <Tag color={user.role === "admin" ? "gold" : membershipActive ? "blue" : "default"}>
                            {user.role === "admin" ? "管理员" : membershipActive ? "会员" : "用户"}
                        </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="会员状态">
                        {user.membershipExpiresAt ? (
                            membershipActive ? (
                                <Tag color="green">有效至 {dayjs(user.membershipExpiresAt).format("YYYY-MM-DD HH:mm:ss")}</Tag>
                            ) : (
                                <Tag>已过期 {dayjs(user.membershipExpiresAt).format("YYYY-MM-DD HH:mm:ss")}</Tag>
                            )
                        ) : (
                            <Tag>未开通</Tag>
                        )}
                    </Descriptions.Item>
                    <Descriptions.Item label="算力点">
                        {membershipActive ? (
                            <Typography.Text type="secondary">
                                {user.credits.toLocaleString()}（会员有效期内免扣，已冻结）
                            </Typography.Text>
                        ) : (
                            <Typography.Text>{user.credits.toLocaleString()}</Typography.Text>
                        )}
                    </Descriptions.Item>
                </Descriptions>
            </Card>

            <Modal
                title="编辑资料"
                open={editOpen}
                onCancel={() => setEditOpen(false)}
                onOk={() => void handleSave()}
                okText="保存"
                cancelText="取消"
                confirmLoading={editLoading}
                destroyOnHidden
            >
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="displayName" label="昵称">
                        <Input placeholder="留空则不修改" />
                    </Form.Item>
                    <Form.Item name="password" label="新密码" extra="留空则不修改密码">
                        <Input.Password placeholder="留空则不修改" autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item name="confirmPassword" label="确认密码" dependencies={["password"]} rules={[({ getFieldValue }) => ({ validator(_, value) { if (!value || getFieldValue("password") === value) return Promise.resolve(); return Promise.reject(new Error("两次密码不一致")); } })]}>
                        <Input.Password placeholder="再次输入新密码" autoComplete="new-password" />
                    </Form.Item>
                </Form>
            </Modal>
        </main>
    );
}
