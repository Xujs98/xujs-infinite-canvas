"use client";

import { DeleteOutlined, GlobalOutlined, MailOutlined, SaveOutlined, ToolOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Button, Col, Form, Input, InputNumber, Row, Space, Switch, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import { removeAdminLogo, uploadAdminLogo } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";
import { useSystemSettings } from "./use-system-settings";

function SectionCard({ title, subtitle, icon, color, children }: { title: string; subtitle?: string; icon?: React.ReactNode; color?: string; children: React.ReactNode }) {
    return (
        <div className="mb-5 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-50 px-6 py-4">
                {icon && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}10`, color }}>
                        {icon}
                    </div>
                )}
                <div>
                    <div className="text-sm font-semibold text-gray-800">{title}</div>
                    {subtitle && <div className="mt-0.5 text-xs text-gray-400">{subtitle}</div>}
                </div>
            </div>
            <div className="px-6 py-5">{children}</div>
        </div>
    );
}

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
            console.log("Saving settings:", mergedValues);
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
            <div className="mx-auto max-w-3xl">
                {/* 页面标题 */}
                <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25">
                        <ToolOutlined className="text-lg" />
                    </div>
                    <div>
                        <Typography.Title level={4} style={{ margin: 0 }}>
                            系统设置
                        </Typography.Title>
                        <Typography.Text type="secondary" className="text-sm">
                            管理站点配置和功能开关
                        </Typography.Text>
                    </div>
                </div>

                {/* 固定导航条 */}
                <div
                    ref={navRef}
                    className="sticky top-0 z-50 mb-7 flex items-center gap-1 rounded-2xl border border-gray-100 bg-white/95 p-1.5 shadow-sm backdrop-blur-sm"
                >
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

                <Form form={form} layout="vertical" initialValues={settings}>
                    {/* 通用设置 */}
                    {activeTab === "general" && (
                        <div className="animate-[fadeIn_0.3s_ease]">
                        <SectionCard title="站点设置" subtitle="自定义站点品牌" icon={<GlobalOutlined />} color="#1890ff">
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
                                        <div className="flex items-center gap-4">
                                            {siteLogo ? (
                                                <img src={siteLogo} alt="Logo" className="h-16 w-16 rounded-lg border border-gray-100 object-contain" />
                                            ) : (
                                                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
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
                                    <Form.Item name="inviteRewardCredits" label="邀请奖励算力点" extra="每邀请一位新用户注册，邀请人获得的奖励">
                                        <InputNumber min={0} style={{ width: "100%" }} placeholder="50" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="checkInRewardMin" label="签到奖励最小值" extra="每日签到随机奖励的最小算力点">
                                        <InputNumber min={0} style={{ width: "100%" }} placeholder="5" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="checkInRewardMax" label="签到奖励最大值" extra="每日签到随机奖励的最大算力点">
                                        <InputNumber min={0} style={{ width: "100%" }} placeholder="20" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="videoMaxTimeoutSeconds" label="视频生成最长超时（秒）" extra="视频生成超时时间，超时后提示用户联系管理员">
                                        <InputNumber min={0} step={60} style={{ width: "100%" }} placeholder="0 表示不限制" />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </SectionCard>

                        <SectionCard title="功能开关" subtitle="控制系统功能的启用状态" icon={<SaveOutlined />} color="#52c41a">
                            <Row gutter={[24, 0]}>
                                <Col span={12}>
                                    <Form.Item name="allowRegister" label="允许用户注册" valuePropName="checked" extra="关闭后隐藏注册入口，注册接口也会拒绝新用户创建">
                                        <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="allowCustomChannel" label="允许自定义渠道" valuePropName="checked" extra="开启后，前端可提供走后端渠道和用户自定义 baseUrl 直连两种模式">
                                        <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="assistantEnabled" label="显示助手" valuePropName="checked" extra="关闭后画布页面将不显示助手按钮">
                                        <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="checkInEnabled" label="每日签到" valuePropName="checked" extra="关闭后用户个人中心将不显示每日签到功能">
                                        <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </SectionCard>

                        <div className="flex justify-end pb-6">
                            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()} className="!h-10 !rounded-lg !px-6 !font-medium shadow-sm">
                                保存设置
                            </Button>
                        </div>
                    </div>
                )}

                {/* 邮件设置 */}
                {activeTab === "email" && (
                    <div className="animate-[fadeIn_0.3s_ease]">
                        <SectionCard title="邮箱验证" subtitle="配置邮箱验证和订阅提醒功能" icon={<MailOutlined />} color="#722ed1">
                            <Row gutter={[24, 0]}>
                                <Col span={12}>
                                    <Form.Item name="emailEnabled" label="启用邮箱验证" valuePropName="checked">
                                        <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="membershipReminder" label="订阅到期提醒" valuePropName="checked" extra="向用户发送会员即将到期的邮件提醒">
                                        <Switch checkedChildren="开启" unCheckedChildren="关闭" disabled={!emailEnabled} />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </SectionCard>

                        {emailEnabled && (
                            <>
                                <SectionCard title="SMTP 设置" subtitle="配置邮件发送服务器" icon={<MailOutlined />} color="#fa8c16">
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
                                </SectionCard>

                                <SectionCard title="邮件模板" subtitle="自定义邮件内容">
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
                                </SectionCard>
                            </>
                        )}

                        <div className="flex justify-end pb-6">
                            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()} className="!h-10 !rounded-lg !px-6 !font-medium shadow-sm">
                                保存设置
                            </Button>
                        </div>
                    </div>
                )}
                </Form>
            </div>
        </div>
    );
}
