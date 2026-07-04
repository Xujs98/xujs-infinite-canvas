"use client";

import { DeleteOutlined, GlobalOutlined, MailOutlined, SaveOutlined, ToolOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Button, Col, Form, Input, InputNumber, Row, Space, Switch, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import { removeAdminLogo, uploadAdminLogo } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";
import { useSystemSettings } from "./use-system-settings";

const tabs = [
    { key: "general", label: "通用设置", icon: <ToolOutlined /> },
    { key: "email", label: "邮件设置", icon: <MailOutlined /> },
] as const;

export default function AdminSystemSettingsPage() {
    const { settings, loading, saving, saveSettings, refresh } = useSystemSettings();
    const [form] = Form.useForm();
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const [logoUploading, setLogoUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<string>("general");
    const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const navRef = useRef<HTMLDivElement>(null);
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

    useEffect(() => {
        form.setFieldsValue(settings);
    }, [settings, form]);

    const updateIndicator = useCallback(() => {
        const btn = tabRefs.current.get(activeTab);
        const nav = navRef.current;
        if (btn && nav) {
            const navRect = nav.getBoundingClientRect();
            const btnRect = btn.getBoundingClientRect();
            setIndicatorStyle({
                left: btnRect.left - navRect.left,
                width: btnRect.width,
            });
        }
    }, [activeTab]);

    useEffect(() => {
        updateIndicator();
    }, [updateIndicator]);

    useEffect(() => {
        window.addEventListener("resize", updateIndicator);
        return () => window.removeEventListener("resize", updateIndicator);
    }, [updateIndicator]);

    const handleSave = async () => {
        try {
            await form.validateFields();
            const values = form.getFieldsValue(true);
            if (values.inviteRewardCredits === undefined || values.inviteRewardCredits === null) {
                values.inviteRewardCredits = settings.inviteRewardCredits || 0;
            }
            const mergedValues = { ...settings, ...values };
            await saveSettings(mergedValues);
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

    return (
        <div className="min-h-screen p-6">
            <div className="mx-auto max-w-[1200px]">
                {/* 页面标题 */}
                <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25">
                        <ToolOutlined className="text-lg" />
                    </div>
                    <div>
                        <Typography.Title level={4} style={{ margin: 0 }}>系统设置</Typography.Title>
                        <Typography.Text type="secondary" className="text-sm">配置站点信息、注册策略和邮件通知</Typography.Text>
                    </div>
                </div>

                {/* 固定导航条 */}
                <div className="sticky top-0 z-50 mb-7 flex items-center justify-between rounded-2xl border border-gray-100 bg-white/95 px-5 py-3 shadow-sm backdrop-blur-sm">
                    <div ref={navRef} className="relative flex items-center gap-1 rounded-2xl border border-gray-100 bg-gray-50 p-1.5">
                        <div
                            className="absolute top-1.5 bottom-1.5 rounded-xl bg-white shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
                            style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
                        />
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                ref={(el) => { if (el) tabRefs.current.set(tab.key, el); }}
                                className={`relative z-10 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors duration-300 ${
                                    activeTab === tab.key ? "text-gray-800" : "text-gray-400 hover:text-gray-600"
                                }`}
                                onClick={() => setActiveTab(tab.key)}
                            >
                                <span className="text-base">{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                    <Space>
                        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()} className="!rounded-lg">保存设置</Button>
                    </Space>
                </div>

                <Form layout="vertical" form={form} initialValues={settings}>
                    {activeTab === "general" && (
                        <div className="space-y-5">
                            {/* 站点信息 */}
                            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
                                        <GlobalOutlined />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-gray-800">站点信息</div>
                                        <div className="mt-0.5 text-xs text-gray-400">配置站点名称、副标题和服务联系方式</div>
                                    </div>
                                </div>
                                <Row gutter={[24, 0]}>
                                    <Col span={8}>
                                        <Form.Item name="siteName" label="站点名称">
                                            <Input placeholder="无限画布" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={8}>
                                        <Form.Item name="siteSubtitle" label="站点副标题">
                                            <Input placeholder="AI 创作工作台" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={8}>
                                        <Form.Item name="serviceContact" label="服务联系方式">
                                            <Input placeholder="联系方式" />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Row gutter={[24, 0]}>
                                    <Col span={24}>
                                        <Form.Item label="站点 Logo">
                                            <div className="flex items-center gap-4">
                                                {siteLogo ? (
                                                    <div className="relative">
                                                        <img src={siteLogo} alt="Logo" className="h-12 w-12 rounded-lg border border-gray-100 object-contain" />
                                                        <button
                                                            type="button"
                                                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm hover:bg-red-600"
                                                            onClick={() => void handleLogoRemove()}
                                                        >
                                                            <DeleteOutlined className="text-xs" />
                                                        </button>
                                                    </div>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    disabled={logoUploading}
                                                    className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-400 hover:text-blue-500"
                                                    onClick={() => fileInputRef.current?.click()}
                                                >
                                                    {logoUploading ? <span className="text-xs">...</span> : <UploadOutlined />}
                                                </button>
                                                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleLogoUpload(f); }} />
                                                <Typography.Text type="secondary" className="text-xs">支持 PNG、JPG、SVG，最大 300KB</Typography.Text>
                                            </div>
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </div>

                            {/* 注册与积分 */}
                            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-500">
                                        <ToolOutlined />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-gray-800">注册与积分</div>
                                        <div className="mt-0.5 text-xs text-gray-400">配置注册策略、赠送积分和签到奖励</div>
                                    </div>
                                </div>
                                <Row gutter={[24, 0]}>
                                    <Col span={6}>
                                        <Form.Item name="allowRegister" label="开放注册" valuePropName="checked">
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name="assistantEnabled" label="助手功能" valuePropName="checked">
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name="allowCustomChannel" label="自定义渠道" valuePropName="checked" extra="允许用户在前端配置自己的 API Key">
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name="registerGiftCredits" label="注册赠送算力点">
                                            <InputNumber min={0} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Row gutter={[24, 0]}>
                                    <Col span={6}>
                                        <Form.Item name="inviteRewardCredits" label="邀请奖励算力点" rules={[{ required: true, message: "请输入邀请奖励算力点" }]}>
                                            <InputNumber min={0} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name="checkInEnabled" label="每日签到" valuePropName="checked">
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name="checkInRewardMin" label="签到最少算力点">
                                            <InputNumber min={0} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name="checkInRewardMax" label="签到最多算力点">
                                            <InputNumber min={0} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Row gutter={[24, 0]}>
                                    <Col span={6}>
                                        <Form.Item name="videoMaxTimeoutSeconds" label="视频最大超时（秒）" extra="视频生成任务的最长等待时间">
                                            <InputNumber min={60} max={3600} style={{ width: "100%" }} placeholder="600" />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Row gutter={[24, 0]}>
                                    <Col span={12}>
                                        <Form.Item name="appErrorMessagePrefix" label="App 错误提示前缀" extra="保存后 App 端画布错误弹窗会自动带上这段文案，可用于统一客服提示。">
                                            <Input placeholder="例如：生成失败，请检查模型配置或联系管理员：" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name="appErrorShowDetails" label="App 显示错误详情" valuePropName="checked" extra="关闭后用户弹窗只显示简短错误，但详情仍会上报到日志。">
                                            <Switch checkedChildren="显示" unCheckedChildren="隐藏" />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </div>
                        </div>
                    )}

                    {activeTab === "email" && (
                        <div className="space-y-5">
                            {/* 邮件开关 */}
                            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                                        <MailOutlined />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-gray-800">邮件功能</div>
                                        <div className="mt-0.5 text-xs text-gray-400">开启后可发送欢迎邮件和会员到期提醒</div>
                                    </div>
                                </div>
                                <Row gutter={[24, 0]}>
                                    <Col span={6}>
                                        <Form.Item name="emailEnabled" label="启用邮件" valuePropName="checked">
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name="membershipReminder" label="到期提醒" valuePropName="checked" extra="向用户发送会员即将到期的邮件提醒">
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" disabled={!emailEnabled} />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </div>

                            {emailEnabled && (
                                <>
                                    {/* SMTP 设置 */}
                                    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                        <div className="mb-5 flex items-center gap-3">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
                                                <MailOutlined />
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold text-gray-800">SMTP 设置</div>
                                                <div className="mt-0.5 text-xs text-gray-400">配置邮件发送服务器</div>
                                            </div>
                                        </div>
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
                                    </div>

                                    {/* 邮件模板 */}
                                    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                        <div className="mb-5 flex items-center gap-3">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-500">
                                                <MailOutlined />
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold text-gray-800">邮件模板</div>
                                                <div className="mt-0.5 text-xs text-gray-400">自定义邮件内容</div>
                                            </div>
                                        </div>
                                        <Row gutter={[24, 0]}>
                                            <Col span={24}>
                                                <Form.Item name="emailTemplateWelcome" label="欢迎邮件模板" extra="支持 HTML，可用变量：{{username}} {{siteName}}">
                                                    <Input.TextArea rows={5} placeholder="<h2>欢迎加入 {{siteName}}</h2><p>Hi {{username}}，欢迎注册！</p>" />
                                                </Form.Item>
                                            </Col>
                                            <Col span={24}>
                                                <Form.Item name="emailTemplateReminder" label="会员到期提醒模板" extra="支持 HTML，可用变量：{{username}} {{siteName}} {{expiresAt}}">
                                                    <Input.TextArea rows={5} placeholder="<h2>会员即将到期</h2><p>Hi {{username}}，您的会员将于 {{expiresAt}} 到期。</p>" />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </Form>
            </div>
        </div>
    );
}
