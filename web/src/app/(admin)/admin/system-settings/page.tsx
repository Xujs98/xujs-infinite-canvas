"use client";

import { DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Divider, Form, Input, InputNumber, Row, Space, Switch, Tabs, Typography } from "antd";
import { useEffect, useRef, useState } from "react";

import { removeAdminLogo, uploadAdminLogo } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";
import { useSystemSettings } from "./use-system-settings";

export default function AdminSystemSettingsPage() {
    const { settings, loading, saving, saveSettings, refresh } = useSystemSettings();
    const [form] = Form.useForm();
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const [logoUploading, setLogoUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        form.setFieldsValue(settings);
    }, [settings, form]);

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            await saveSettings(values);
            message.success("保存成功");
        } catch (error) {
            if (error instanceof Error) message.error(error.message);
        }
    };

    const handleLogoUpload = async (file: File) => {
        const isAllowed = ["image/png", "image/jpeg", "image/svg+xml"].includes(file.type);
        if (!isAllowed) {
            message.error("仅支持 PNG、JPG 或 SVG 格式");
            return;
        }
        if (file.size > 300 * 1024) {
            message.error("Logo 文件过大，最大 300KB");
            return;
        }
        setLogoUploading(true);
        try {
            const result = await uploadAdminLogo(token, file);
            form.setFieldsValue({ siteLogo: result.url });
            await refresh();
            message.success("Logo 上传成功");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "上传失败");
        } finally {
            setLogoUploading(false);
        }
    };

    const handleLogoRemove = async () => {
        try {
            await removeAdminLogo(token);
            form.setFieldsValue({ siteLogo: "" });
            await refresh();
            message.success("Logo 已移除");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "移除失败");
        }
    };

    const emailEnabled = Form.useWatch("emailEnabled", form);
    const siteLogo = Form.useWatch("siteLogo", form);

    const tabItems = [
        {
            key: "general",
            label: "通用设置",
            children: (
                <Row gutter={[24, 0]}>
                    <Col span={12}>
                        <Form.Item name="siteName" label="站点名称" rules={[{ required: true, message: "请输入站点名称" }]}>
                            <Input placeholder="Infinite Canvas" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="siteSubtitle" label="站点副标题">
                            <Input placeholder="AI 创作平台" />
                        </Form.Item>
                    </Col>
                    <Col span={24}>
                        <Form.Item label="站点 Logo" extra="支持 PNG、JPG 或 SVG 格式，最大 300KB。建议：80x80px 正方形图片。">
                            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                {siteLogo ? (
                                    <img src={siteLogo} alt="Logo" style={{ width: 80, height: 80, objectFit: "contain", border: "1px solid #d9d9d9", borderRadius: 8 }} />
                                ) : (
                                    <div style={{ width: 80, height: 80, border: "1px dashed #d9d9d9", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
                                        无 Logo
                                    </div>
                                )}
                                <Space>
                                    <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.svg" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleLogoUpload(file); e.target.value = ""; }} />
                                    <Button icon={<UploadOutlined />} loading={logoUploading} onClick={() => fileInputRef.current?.click()}>
                                        上传 Logo
                                    </Button>
                                    {siteLogo && (
                                        <Button icon={<DeleteOutlined />} danger onClick={() => void handleLogoRemove()}>
                                            移除
                                        </Button>
                                    )}
                                </Space>
                            </div>
                        </Form.Item>
                        <Form.Item name="siteLogo" hidden>
                            <Input />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="serviceContact" label="客服联系方式">
                            <Input placeholder="微信、QQ、邮箱等" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="registerGiftCredits" label="新用户注册赠送算力点">
                            <InputNumber min={0} style={{ width: "100%" }} placeholder="0" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="allowRegister" label="是否允许用户注册" valuePropName="checked" extra="关闭后隐藏注册入口，注册接口也会拒绝新用户创建">
                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="allowCustomChannel" label="是否允许用户自定义渠道" valuePropName="checked" extra="开启后，前端可提供走后端渠道和用户自定义 baseUrl 直连两种模式">
                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="assistantEnabled" label="显示助手" valuePropName="checked" extra="关闭后画布页面将不显示助手按钮">
                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>
                    </Col>
                </Row>
            ),
        },
        {
            key: "email",
            label: "邮箱设置",
            children: (
                <>
                    <Row gutter={[24, 0]}>
                        <Col span={12}>
                            <Form.Item name="emailEnabled" label="邮箱验证" valuePropName="checked">
                                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="membershipReminder" label="订阅到期提醒" valuePropName="checked" extra="向用户发送会员即将到期的邮件提醒">
                                <Switch checkedChildren="开启" unCheckedChildren="关闭" disabled={!emailEnabled} />
                            </Form.Item>
                        </Col>
                    </Row>

                    {!emailEnabled ? (
                        <Typography.Text type="secondary" style={{ display: "block", padding: "24px 0", textAlign: "center" }}>
                            邮箱验证未启用
                        </Typography.Text>
                    ) : (
                        <>
                            <Divider>SMTP 设置</Divider>
                            <Row gutter={[24, 0]}>
                                <Col span={12}>
                                    <Form.Item name="smtpHost" label="SMTP 服务器" rules={[{ required: true, message: "请输入 SMTP 服务器" }]}>
                                        <Input placeholder="smtp.example.com" />
                                    </Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name="smtpPort" label="端口" rules={[{ required: true, message: "请输入端口" }]}>
                                        <InputNumber min={1} max={65535} style={{ width: "100%" }} />
                                    </Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name="smtpTLS" label="TLS" valuePropName="checked">
                                        <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="smtpUsername" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
                                        <Input placeholder="user@example.com" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="smtpPassword" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
                                        <Input.Password placeholder="授权码" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="smtpFrom" label="发件人地址" rules={[{ required: true, message: "请输入发件人地址" }]}>
                                        <Input placeholder="noreply@example.com" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Divider>邮件模板</Divider>
                            <Row gutter={[24, 0]}>
                                <Col span={24}>
                                    <Form.Item name="emailTemplateWelcome" label="欢迎邮件模板" extra="支持 HTML，可用变量：{{username}} {{siteName}}">
                                        <Input.TextArea rows={6} placeholder="<h2>欢迎加入 {{siteName}}</h2><p>Hi {{username}}，欢迎注册！</p>" />
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <Form.Item name="emailTemplateReminder" label="会员到期提醒模板" extra="支持 HTML，可用变量：{{username}} {{siteName}} {{expiresAt}}">
                                        <Input.TextArea rows={6} placeholder="<h2>会员即将到期</h2><p>Hi {{username}}，您的会员将于 {{expiresAt}} 到期。</p>" />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </>
                    )}
                </>
            ),
        },
    ];

    return (
        <Card
            variant="borderless"
            loading={loading}
            extra={
                <Space>
                    <Button type="primary" loading={saving} onClick={() => void handleSave()}>
                        保存
                    </Button>
                </Space>
            }
        >
            <Form form={form} layout="vertical" initialValues={settings}>
                <Tabs items={tabItems} />
            </Form>
        </Card>
    );
}
