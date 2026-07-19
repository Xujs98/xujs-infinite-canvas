"use client";

import { ControlOutlined, DatabaseOutlined, DeleteOutlined, GiftOutlined, GlobalOutlined, MailOutlined, SaveOutlined, ToolOutlined, UploadOutlined, UserAddOutlined } from "@ant-design/icons";
import { App, Button, Col, Form, Input, InputNumber, Row, Space, Switch, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_SITE_NAME } from "@/constant/brand";
import { removeAdminLogo, testAdminMinIOStorage, uploadAdminLogo } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";
import { useSystemSettings } from "./use-system-settings";

const tabs = [
    { key: "general", label: "通用设置", icon: <ToolOutlined /> },
    { key: "registration", label: "注册与积分", icon: <UserAddOutlined /> },
    { key: "email", label: "邮件设置", icon: <MailOutlined /> },
    { key: "mediaStorage", label: "媒体资产与存储", icon: <DatabaseOutlined /> },
] as const;

const appErrorMessageFields = [
    { key: "default", label: "默认错误", placeholder: "无法识别具体类型时显示" },
    { key: "generation", label: "生成失败", placeholder: "图片、视频、音频或文本生成失败" },
    { key: "network", label: "网络错误", placeholder: "断网、连接中断、DNS 或 Socket 错误" },
    { key: "timeout", label: "请求超时", placeholder: "提交或轮询超过等待时间" },
    { key: "authentication", label: "登录与验证", placeholder: "登录失效、验证码或密码错误" },
    { key: "permission", label: "权限不足", placeholder: "角色或接口权限不足" },
    { key: "credits", label: "算力点不足", placeholder: "钱包或订阅额度不足" },
    { key: "validation", label: "参数错误", placeholder: "必填项、格式、数量或模型参数错误" },
    { key: "upload", label: "上传失败", placeholder: "图片、视频、音频素材上传失败" },
    { key: "download", label: "下载失败", placeholder: "生成结果下载或本地保存失败" },
    { key: "service", label: "服务异常", placeholder: "服务端或上游暂时不可用" },
] as const;

export default function AdminSystemSettingsPage() {
    const { settings, loading, saving, saveSettings, refresh } = useSystemSettings();
    const [form] = Form.useForm();
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const [logoUploading, setLogoUploading] = useState(false);
    const [minioTesting, setMinioTesting] = useState(false);
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

    const handleMinIOTest = async () => {
        setMinioTesting(true);
        try {
            const config = form.getFieldValue("minioStorage");
            await testAdminMinIOStorage(token, config);
            message.success("MinIO 连接成功");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "MinIO 连接失败");
        } finally {
            setMinioTesting(false);
        }
    };

    const emailEnabled = Form.useWatch("emailEnabled", form);
    const siteLogo = Form.useWatch("siteLogo", form);
    const requestLogCleanupEnabled = Form.useWatch("requestLogCleanupEnabled", form);
    const callLogCleanupEnabled = Form.useWatch("callLogCleanupEnabled", form);
    const creditLogCleanupEnabled = Form.useWatch("creditLogCleanupEnabled", form);
    const minioEnabled = Form.useWatch(["minioStorage", "enabled"], form);
    const presignedURLExpirySeconds = Form.useWatch(["minioStorage", "presignedURLExpirySeconds"], form);

    return (
        <div className="admin-config-page min-h-screen p-6">
            <div className="admin-config-inner mx-auto max-w-[1200px]">
                {/* 页面标题 */}
                <div className="admin-page-title mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25">
                        <ToolOutlined className="text-lg" />
                    </div>
                    <div>
                        <Typography.Title level={4} style={{ margin: 0 }}>
                            系统设置
                        </Typography.Title>
                        <Typography.Text type="secondary" className="text-sm">
                            配置站点信息、注册策略和邮件通知
                        </Typography.Text>
                    </div>
                </div>

                {/* 固定导航条 */}
                <div className="admin-config-toolbar sticky top-0 z-50 mb-7 flex items-center justify-between rounded-2xl border border-gray-100 bg-white/95 px-5 py-3 shadow-sm backdrop-blur-sm">
                    <div ref={navRef} className="admin-config-tabs relative flex items-center gap-1 rounded-2xl border border-gray-100 bg-gray-50 p-1.5">
                        <div className="absolute top-1.5 bottom-1.5 rounded-xl bg-white shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]" style={{ left: indicatorStyle.left, width: indicatorStyle.width }} />
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                ref={(el) => {
                                    if (el) tabRefs.current.set(tab.key, el);
                                }}
                                className={`relative z-10 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors duration-300 ${activeTab === tab.key ? "text-gray-800" : "text-gray-400 hover:text-gray-600"}`}
                                onClick={() => setActiveTab(tab.key)}
                            >
                                <span className="text-base">{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                    <Space>
                        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()} className="!rounded-lg">
                            保存设置
                        </Button>
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
                                            <Input placeholder={DEFAULT_SITE_NAME} />
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
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept="image/png,image/jpeg,image/svg+xml"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const f = e.target.files?.[0];
                                                        if (f) void handleLogoUpload(f);
                                                    }}
                                                />
                                                <Typography.Text type="secondary" className="text-xs">
                                                    支持 PNG、JPG、SVG，最大 300KB
                                                </Typography.Text>
                                            </div>
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </div>

                            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                                        <ControlOutlined />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-gray-800">运行与错误处理</div>
                                        <div className="mt-0.5 text-xs text-gray-400">配置任务等待时间和 App 客户可见错误文案</div>
                                    </div>
                                </div>
                                <Row gutter={[24, 0]}>
                                    <Col xs={24} md={8}>
                                        <Form.Item name="videoMaxTimeoutSeconds" label="视频最大超时（秒）" extra="视频生成任务的最长等待时间">
                                            <InputNumber min={60} max={3600} style={{ width: "100%" }} placeholder="600" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={16}>
                                        <Form.Item name="appErrorMessagePrefix" label="App 错误提示前缀" extra="保存后 App 端画布错误弹窗会自动带上这段文案，可用于统一客服提示。">
                                            <Input placeholder="例如：生成失败，请检查模型配置或联系管理员：" />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <div className="mt-2 border-t border-gray-100 pt-5">
                                    <div className="mb-4">
                                        <div className="text-sm font-medium text-gray-700">分类错误文案</div>
                                        <div className="mt-1 text-xs leading-5 text-gray-400">App 自动识别错误类型并显示对应文案；原始错误只写入后台请求日志，不向客户展示。</div>
                                    </div>
                                    <Row gutter={[16, 0]}>
                                        {appErrorMessageFields.map((field) => (
                                            <Col xs={24} md={12} xl={8} key={field.key}>
                                                <Form.Item
                                                    name={["appErrorMessages", field.key]}
                                                    label={field.label}
                                                    extra={field.placeholder}
                                                    rules={[
                                                        { required: true, whitespace: true, message: `请输入${field.label}文案` },
                                                        { max: 200, message: "最多 200 个字符" },
                                                    ]}
                                                >
                                                    <Input maxLength={200} showCount />
                                                </Form.Item>
                                            </Col>
                                        ))}
                                    </Row>
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
                                        <DatabaseOutlined />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-gray-800">日志自动清理</div>
                                        <div className="mt-0.5 text-xs text-gray-400">统一管理请求日志、调用日志和算力点明细的保留策略</div>
                                    </div>
                                </div>
                                <div className="grid gap-8 xl:grid-cols-3 xl:divide-x xl:divide-gray-100">
                                    <section className="min-w-0 xl:pr-8">
                                        <div className="mb-4 text-sm font-medium text-gray-700">请求日志</div>
                                        <Row gutter={[16, 0]}>
                                            <Col span={24}>
                                                <Form.Item name="requestLogCleanupEnabled" label="自动清理" valuePropName="checked" extra="开启后每小时检查一次，保存设置后立即执行。">
                                                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} sm={12}>
                                                <Form.Item name="requestLogRetentionDays" label="保留天数" rules={[{ required: true, message: "请输入请求日志保留天数" }]}>
                                                    <InputNumber min={1} max={3650} precision={0} disabled={!requestLogCleanupEnabled} style={{ width: "100%" }} />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} sm={12}>
                                                <Form.Item name="requestLogMaxRows" label="最大保留条数" rules={[{ required: true, message: "请输入请求日志最大保留条数" }]}>
                                                    <InputNumber min={100} max={1000000} precision={0} step={100} disabled={!requestLogCleanupEnabled} style={{ width: "100%" }} />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </section>
                                    <section className="min-w-0 xl:px-8">
                                        <div className="mb-4 text-sm font-medium text-gray-700">调用日志</div>
                                        <Row gutter={[16, 0]}>
                                            <Col span={24}>
                                                <Form.Item name="callLogCleanupEnabled" label="自动清理" valuePropName="checked" extra="默认关闭，开启后按相同周期检查。">
                                                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} sm={12}>
                                                <Form.Item name="callLogRetentionDays" label="保留天数" rules={[{ required: true, message: "请输入调用日志保留天数" }]}>
                                                    <InputNumber min={1} max={3650} precision={0} disabled={!callLogCleanupEnabled} style={{ width: "100%" }} />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} sm={12}>
                                                <Form.Item name="callLogMaxRows" label="最大保留条数" rules={[{ required: true, message: "请输入调用日志最大保留条数" }]}>
                                                    <InputNumber min={100} max={1000000} precision={0} step={100} disabled={!callLogCleanupEnabled} style={{ width: "100%" }} />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </section>
                                    <section className="min-w-0 xl:pl-8">
                                        <div className="mb-4 text-sm font-medium text-gray-700">算力点明细</div>
                                        <Row gutter={[16, 0]}>
                                            <Col span={24}>
                                                <Form.Item name="creditLogCleanupEnabled" label="自动清理" valuePropName="checked" extra="默认关闭；开启后每小时按时间和总条数清理。">
                                                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} sm={12} xl={24} xxl={12}>
                                                <Form.Item name="creditLogRetentionDays" label="保留天数" rules={[{ required: true, message: "请输入算力点明细保留天数" }]}>
                                                    <InputNumber min={1} max={3650} precision={0} disabled={!creditLogCleanupEnabled} style={{ width: "100%" }} />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} sm={12} xl={24} xxl={12}>
                                                <Form.Item name="creditLogMaxRows" label="数据库最大条数" rules={[{ required: true, message: "请输入算力点明细最大保留条数" }]}>
                                                    <InputNumber min={100} max={1000000} precision={0} step={1000} disabled={!creditLogCleanupEnabled} style={{ width: "100%" }} />
                                                </Form.Item>
                                            </Col>
                                            <Col span={24}>
                                                <Form.Item name="userCreditLogVisibleRows" label="用户最多可查看" extra="只限制 Web/App 个人中心；0 表示不限，管理员仍可查看全部保留记录。" rules={[{ required: true, message: "请输入用户最多可查看条数" }]}>
                                                    <InputNumber min={0} max={1000000} precision={0} step={10} style={{ width: "100%" }} addonAfter="条" />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </section>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "mediaStorage" && (
                        <div className="space-y-5">
                            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                                            <DatabaseOutlined />
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold text-gray-800">媒体资产与存储</div>
                                            <div className="mt-0.5 text-xs text-gray-400">连接与聚合平台共用的私有 MinIO 存储桶，避免重复保存生成文件</div>
                                        </div>
                                    </div>
                                    <Button loading={minioTesting} onClick={() => void handleMinIOTest()}>
                                        测试连接
                                    </Button>
                                </div>
                                <Row gutter={[20, 0]}>
                                    <Col xs={24} md={8}>
                                        <Form.Item name={["minioStorage", "enabled"]} label="启用媒体资产存储" valuePropName="checked" extra="启用前请先测试连接。">
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <Form.Item name={["minioStorage", "useSSL"]} label="使用 HTTPS" valuePropName="checked">
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={8}>
                                        <Form.Item name={["minioStorage", "usePathStyle"]} label="使用路径式访问" valuePropName="checked" extra="兼容 MinIO 的 S3 路径访问方式。">
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={24}>
                                        <Form.Item name={["minioStorage", "endpoint"]} label="服务地址" rules={minioEnabled ? [{ required: true, message: "请输入 MinIO 服务地址" }] : undefined}>
                                            <Input placeholder="https://media.julongkj.top" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["minioStorage", "bucket"]} label="存储桶" rules={minioEnabled ? [{ required: true, message: "请输入存储桶名称" }] : undefined}>
                                            <Input placeholder="julong-media" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["minioStorage", "region"]} label="区域">
                                            <Input placeholder="us-east-1" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["minioStorage", "accessKey"]} label="访问密钥" rules={minioEnabled ? [{ required: true, message: "请输入访问密钥" }] : undefined}>
                                            <Input autoComplete="off" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item shouldUpdate noStyle>
                                            {({ getFieldValue }) => (
                                                <Form.Item
                                                    name={["minioStorage", "secretKey"]}
                                                    label="私密密钥"
                                                    rules={minioEnabled && !getFieldValue(["minioStorage", "secretConfigured"]) ? [{ required: true, message: "请输入私密密钥" }] : undefined}
                                                    extra={getFieldValue(["minioStorage", "secretConfigured"]) ? "已配置；留空保存表示继续使用原密钥。" : undefined}
                                                >
                                                    <Input.Password autoComplete="new-password" />
                                                </Form.Item>
                                            )}
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["minioStorage", "generatedPrefix"]} label="聚合平台生成目录" extra="双方约定读取 generated/images/YYYY/MM/DD/{sha256}.{ext}">
                                            <Input placeholder="generated/images" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item name={["minioStorage", "canvasPrefix"]} label="画布上传目录" extra="画布主动上传的素材保存在该目录下。">
                                            <Input placeholder="canvas/uploads" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            name={["minioStorage", "presignedURLExpirySeconds"]}
                                            label="临时图片地址有效期"
                                            extra={`视频提交时按需生成，当前约 ${formatExpiryDuration(presignedURLExpirySeconds)}；允许 60 秒到 24 小时。`}
                                            rules={[{ required: true, message: "请输入临时图片地址有效期" }]}
                                        >
                                            <InputNumber min={60} max={86400} precision={0} className="w-full" addonAfter="秒" />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </div>
                        </div>
                    )}

                    {activeTab === "registration" && (
                        <div className="space-y-5">
                            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-500">
                                        <UserAddOutlined />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-gray-800">注册策略</div>
                                        <div className="mt-0.5 text-xs text-gray-400">管理用户注册及客户端功能权限</div>
                                    </div>
                                </div>
                                <Row gutter={[24, 8]}>
                                    <Col xs={24} sm={12} xl={6}>
                                        <Form.Item name="allowRegister" label="开放注册" valuePropName="checked">
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={12} xl={6}>
                                        <Form.Item name="assistantEnabled" label="助手功能" valuePropName="checked">
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={12} xl={6}>
                                        <Form.Item name="allowCustomChannel" label="自定义渠道" valuePropName="checked" extra="允许用户在前端配置自己的 API Key">
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </div>

                            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                                        <GiftOutlined />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-gray-800">积分与签到</div>
                                        <div className="mt-0.5 text-xs text-gray-400">设置新用户、邀请和每日签到奖励</div>
                                    </div>
                                </div>
                                <Row gutter={[24, 8]}>
                                    <Col xs={24} md={12} xl={8}>
                                        <Form.Item name="registerGiftCredits" label="注册赠送算力点">
                                            <InputNumber min={0} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12} xl={8}>
                                        <Form.Item name="inviteRewardCredits" label="邀请奖励算力点" rules={[{ required: true, message: "请输入邀请奖励算力点" }]}>
                                            <InputNumber min={0} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12} xl={8}>
                                        <Form.Item name="checkInEnabled" label="每日签到" valuePropName="checked">
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12} xl={8}>
                                        <Form.Item name="checkInRewardMin" label="签到最少算力点">
                                            <InputNumber min={0} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12} xl={8}>
                                        <Form.Item name="checkInRewardMax" label="签到最多算力点">
                                            <InputNumber min={0} style={{ width: "100%" }} />
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
                                        <div className="mt-0.5 text-xs text-gray-400">开启后 Web 与 App 注册必须完成邮箱验证码校验，并可发送邮件通知</div>
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

function formatExpiryDuration(raw: unknown): string {
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds <= 0) return "1 小时";
    if (seconds % 3600 === 0) return `${seconds / 3600} 小时`;
    if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
    return `${Math.round(seconds)} 秒`;
}
