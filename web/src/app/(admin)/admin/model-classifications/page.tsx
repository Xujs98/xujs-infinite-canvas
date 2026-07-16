"use client";

import { AudioOutlined, CameraOutlined, CheckCircleFilled, DeleteOutlined, EditOutlined, FileTextOutlined, PlayCircleOutlined, PlusOutlined, SearchOutlined, SettingOutlined, SyncOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Empty, Form, Input, InputNumber, Modal, Row, Select, Spin, Switch, Tooltip, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useUserStore } from "@/stores/use-user-store";
import { type AdminModelClassification, createAdminModelClassification, fetchAdminModelClassifications, fetchAllChannelModels, updateAdminModelClassification } from "@/services/api/admin";

const capabilityConfig = {
    text: { label: "文本", icon: <FileTextOutlined />, color: "#2563eb", tone: "blue" },
    image: { label: "图片", icon: <CameraOutlined />, color: "#15803d", tone: "green" },
    video: { label: "视频", icon: <PlayCircleOutlined />, color: "#7c3aed", tone: "violet" },
    audio: { label: "音频", icon: <AudioOutlined />, color: "#c2410c", tone: "amber" },
};

const allResolutionOptions = ["480p", "720p", "1080p"];
const allRatioOptions = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"];
const allDurationOptions = [5, 6, 8, 10, 12, 15, 20, "adaptive"];
const allQualityOptions = ["auto", "high", "medium", "low"];
const allAspectRatioOptions = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"];

function guessCapability(model: string): string {
    const v = model.toLowerCase();
    if (v.includes("seedance") || v.includes("video") || v.includes("sora") || v.includes("veo") || v.includes("kling") || v.includes("wan") || v.includes("hailuo") || v.includes("quanneng")) return "video";
    if (
        v.includes("seedream") ||
        v.includes("gpt-image") ||
        v.includes("image") ||
        v.includes("dall-e") ||
        v.includes("dalle") ||
        v.includes("imagen") ||
        v.includes("flux") ||
        v.includes("sdxl") ||
        v.includes("stable-diffusion") ||
        v.includes("midjourney")
    )
        return "image";
    if (v.includes("audio") || v.includes("tts") || v.includes("speech") || v.includes("voice") || v.includes("music") || v.includes("sound")) return "audio";
    return "text";
}

export default function AdminModelClassificationsPage() {
    const { message } = App.useApp();
    const token = useUserStore((s) => s.token);
    const [items, setItems] = useState<AdminModelClassification[]>([]);
    const [channelModels, setChannelModels] = useState<string[]>([]);
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<AdminModelClassification | null>(null);
    const [form] = Form.useForm();
    const [activeTab, setActiveTab] = useState<string>("all");
    const [pendingFormValues, setPendingFormValues] = useState<Record<string, unknown>>({});

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchAdminModelClassifications(token, { page: 1, pageSize: 500 });
            setItems(res.items);
        } catch {
            // handled by api layer
        } finally {
            setLoading(false);
        }
    }, [token]);

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

    // 合并渠道模型和已配置模型，显示所有模型
    const allModels = useMemo(() => {
        const configuredMap = new Map<string, AdminModelClassification>();
        for (const item of items) {
            configuredMap.set(item.modelName, item);
        }
        const result: { modelName: string; configured: AdminModelClassification | null; inChannel: boolean }[] = [];
        const seen = new Set<string>();
        // 先加渠道模型
        for (const m of channelModels) {
            seen.add(m);
            result.push({ modelName: m, configured: configuredMap.get(m) || null, inChannel: true });
        }
        // 再加已配置但不在渠道中的模型
        for (const item of items) {
            if (!seen.has(item.modelName)) {
                seen.add(item.modelName);
                result.push({ modelName: item.modelName, configured: item, inChannel: false });
            }
        }
        return result;
    }, [items, channelModels]);

    const filteredModels = useMemo(() => {
        let list = allModels;
        if (activeTab !== "all") {
            list = list.filter((m) => {
                const cap = m.configured?.capability || guessCapability(m.modelName);
                return cap === activeTab;
            });
        }
        if (keyword) {
            const kw = keyword.toLowerCase();
            list = list.filter((m) => m.modelName.toLowerCase().includes(kw));
        }
        return list;
    }, [allModels, activeTab, keyword]);

    const handleOpenModal = (item?: AdminModelClassification, modelName?: string) => {
        setEditingItem(item || null);
        setPendingFormValues(
            item
                ? {
                      ...item,
                      videoResolutions: item.videoConfig?.resolutions || [],
                      videoRatios: item.videoConfig?.ratios || [],
                      videoDurations: item.videoConfig?.durations?.map(String) || [],
                      videoMaxDuration: item.videoConfig?.maxDuration,
                      videoBillingMode: item.videoConfig?.billingMode || "per_second",
                      videoSupportGenerateAudio: item.videoConfig?.supportGenerateAudio,
                      videoSupportWatermark: item.videoConfig?.supportWatermark,
                      imageQualities: item.imageConfig?.qualities || [],
                      imageAspectRatios: item.imageConfig?.aspectRatios || [],
                      imageMaxCount: item.imageConfig?.maxCount,
                      imageSupportCustomSize: item.imageConfig?.supportCustomSize,
                      audioVoices: item.audioConfig?.voices || [],
                      audioFormats: item.audioConfig?.formats || [],
                      audioSpeedMin: item.audioConfig?.speedRange?.min,
                      audioSpeedMax: item.audioConfig?.speedRange?.max,
                      chatSupportsMultimodal: item.chatConfig?.supportsMultimodal ?? false,
                      chatContextWindow: item.chatConfig?.contextWindow ?? 128000,
                      chatMaxOutputTokens: item.chatConfig?.maxOutputTokens ?? 8192,
                      chatDescription: item.chatConfig?.description ?? "",
                  }
                : modelName
                  ? {
                        modelName,
                        capability: guessCapability(modelName),
                    }
                  : {},
        );
        setModalOpen(true);
    };

    // 弹窗完全打开后填充表单
    const handleAfterOpenChange = (open: boolean) => {
        if (open && pendingFormValues && Object.keys(pendingFormValues).length > 0) {
            form.setFieldsValue(pendingFormValues);
        }
    };

    const handleSave = async () => {
        try {
            const capability = form.getFieldValue("capability");
            // 只验证当前类型的字段
            const fieldsByType: Record<string, string[]> = {
                video: ["modelName", "capability", "videoResolutions", "videoRatios", "videoDurations", "videoMaxDuration", "videoBillingMode", "requestFields"],
                image: ["modelName", "capability", "imageQualities", "imageAspectRatios", "imageMaxCount", "requestFields"],
                audio: ["modelName", "capability", "audioVoices", "audioFormats", "requestFields"],
                text: ["modelName", "capability", "requestFields"],
            };
            const fieldsToValidate = fieldsByType[capability] || ["modelName", "capability"];
            const values = await form.validateFields(fieldsToValidate);

            const classification: Partial<AdminModelClassification> = {
                modelName: values.modelName,
                capability,
                requestFields: (values.requestFields || [])
                    .filter((f: any) => f?.fieldName && f?.requestKey && f?.dataType)
                    .map((field: any) => ({
                        fieldName: String(field.fieldName).trim(),
                        requestKey: String(field.requestKey).trim(),
                        dataType: field.dataType,
                        ...(String(field.valuePath || "").trim() ? { valuePath: String(field.valuePath).trim() } : {}),
                        ...(String(field.objectKey || "").trim() ? { objectKey: String(field.objectKey).trim() } : {}),
                        ...(String(field.jsonTemplate || "").trim() ? { jsonTemplate: String(field.jsonTemplate).trim() } : {}),
                    })),
            };

            if (capability === "video") {
                const toArr = (v: unknown): string[] =>
                    Array.isArray(v)
                        ? v
                        : typeof v === "string"
                          ? v
                                .split(",")
                                .map((s: string) => s.trim())
                                .filter(Boolean)
                          : [];
                classification.videoConfig = {
                    resolutions: toArr(values.videoResolutions).length ? toArr(values.videoResolutions) : ["720p"],
                    ratios: toArr(values.videoRatios).length ? toArr(values.videoRatios) : ["16:9"],
                    durations: toArr(values.videoDurations).length ? toArr(values.videoDurations) : ["6"],
                    maxDuration: values.videoMaxDuration || 15,
                    billingMode: values.videoBillingMode === "per_call" ? "per_call" : "per_second",
                    supportGenerateAudio: values.videoSupportGenerateAudio ?? true,
                    supportWatermark: values.videoSupportWatermark ?? false,
                };
            } else if (capability === "image") {
                const toArr = (v: unknown): string[] =>
                    Array.isArray(v)
                        ? v
                        : typeof v === "string"
                          ? v
                                .split(",")
                                .map((s: string) => s.trim())
                                .filter(Boolean)
                          : [];
                classification.imageConfig = {
                    qualities: toArr(values.imageQualities).length ? toArr(values.imageQualities) : ["auto"],
                    aspectRatios: toArr(values.imageAspectRatios).length ? toArr(values.imageAspectRatios) : ["1:1"],
                    maxCount: values.imageMaxCount || 1,
                    supportCustomSize: values.imageSupportCustomSize ?? true,
                };
            } else if (capability === "audio") {
                const toArr = (v: unknown): string[] =>
                    Array.isArray(v)
                        ? v
                        : typeof v === "string"
                          ? v
                                .split(",")
                                .map((s: string) => s.trim())
                                .filter(Boolean)
                          : [];
                classification.audioConfig = {
                    voices: toArr(values.audioVoices),
                    formats: toArr(values.audioFormats),
                    speedRange: values.audioSpeedMin != null && values.audioSpeedMax != null ? { min: values.audioSpeedMin, max: values.audioSpeedMax } : null,
                };
            } else if (capability === "text") {
                classification.chatConfig = {
                    supportsMultimodal: values.chatSupportsMultimodal ?? false,
                    contextWindow: values.chatContextWindow || 128000,
                    maxOutputTokens: values.chatMaxOutputTokens || 8192,
                    description: values.chatDescription || "",
                };
            }

            if (editingItem) {
                await updateAdminModelClassification(token, editingItem.id, classification);
                message.success("更新成功");
            } else {
                await createAdminModelClassification(token, classification);
                message.success("创建成功");
            }
            setModalOpen(false);
            fetchItems();
        } catch {
            // validation error or api error
        }
    };

    const capability = Form.useWatch("capability", form);

    // 切换模型类型时清空不相关的字段
    useEffect(() => {
        if (!modalOpen) return;
        const clearFields: Record<string, string[]> = {
            video: ["imageQualities", "imageAspectRatios", "imageMaxCount", "imageSupportCustomSize", "audioVoices", "audioFormats", "audioSpeedMin", "audioSpeedMax"],
            image: ["videoResolutions", "videoRatios", "videoDurations", "videoMaxDuration", "videoBillingMode", "videoSupportGenerateAudio", "videoSupportWatermark", "audioVoices", "audioFormats", "audioSpeedMin", "audioSpeedMax"],
            audio: ["videoResolutions", "videoRatios", "videoDurations", "videoMaxDuration", "videoBillingMode", "videoSupportGenerateAudio", "videoSupportWatermark", "imageQualities", "imageAspectRatios", "imageMaxCount", "imageSupportCustomSize"],
            text: [
                "videoResolutions",
                "videoRatios",
                "videoDurations",
                "videoMaxDuration",
                "videoBillingMode",
                "videoSupportGenerateAudio",
                "videoSupportWatermark",
                "imageQualities",
                "imageAspectRatios",
                "imageMaxCount",
                "imageSupportCustomSize",
                "audioVoices",
                "audioFormats",
                "audioSpeedMin",
                "audioSpeedMax",
                "chatSupportsMultimodal",
                "chatContextWindow",
                "chatMaxOutputTokens",
                "chatDescription",
            ],
            chat: [
                "videoResolutions",
                "videoRatios",
                "videoDurations",
                "videoMaxDuration",
                "videoBillingMode",
                "videoSupportGenerateAudio",
                "videoSupportWatermark",
                "imageQualities",
                "imageAspectRatios",
                "imageMaxCount",
                "imageSupportCustomSize",
                "audioVoices",
                "audioFormats",
                "audioSpeedMin",
                "audioSpeedMax",
            ],
        };
        if (capability && clearFields[capability]) {
            clearFields[capability].forEach((f) => form.setFieldValue(f, undefined));
        }
    }, [capability, modalOpen, form]);

    const stats = useMemo(() => {
        const s = { total: allModels.length, configured: 0, text: 0, image: 0, video: 0, audio: 0 };
        for (const m of allModels) {
            const cap = m.configured?.capability || guessCapability(m.modelName);
            if (m.configured) s.configured++;
            if (cap in s) (s as Record<string, number>)[cap]++;
        }
        return s;
    }, [allModels]);

    const getConfigSummary = (item: AdminModelClassification) => {
        if (item.capability === "video" && item.videoConfig) {
            return [...(item.videoConfig.resolutions || []), ...(item.videoConfig.ratios || []), ...(item.videoConfig.durations || []).map((duration) => `${duration}s`), item.videoConfig.billingMode === "per_call" ? "按次数计费" : "按秒计费"];
        }
        if (item.capability === "image" && item.imageConfig) {
            return [...(item.imageConfig.qualities || []), ...(item.imageConfig.aspectRatios || []), `最多 ${item.imageConfig.maxCount || 1} 张`];
        }
        if (item.capability === "audio" && item.audioConfig) {
            return [...(item.audioConfig.formats || []), ...(item.audioConfig.voices || [])];
        }
        if ((item.capability === "text" || item.capability === "chat") && item.chatConfig) {
            return [`上下文 ${(item.chatConfig.contextWindow || 0).toLocaleString("zh-CN")}`, `输出 ${(item.chatConfig.maxOutputTokens || 0).toLocaleString("zh-CN")}`, ...(item.chatConfig.supportsMultimodal ? ["多模态"] : [])];
        }
        return [];
    };

    return (
        <div className="admin-config-page admin-model-page">
            <section className="admin-model-overview" aria-label="模型资源概览">
                <div className="admin-model-overview-main">
                    <span className="admin-model-kicker">MODEL CATALOG</span>
                    <div className="admin-model-overview-title">
                        <Typography.Title level={3}>模型资源</Typography.Title>
                        <span>{stats.total} 个</span>
                    </div>
                    <Typography.Paragraph>集中维护渠道模型的能力分类与生成参数。</Typography.Paragraph>
                    <div className="admin-model-coverage">
                        <div className="admin-model-coverage-copy">
                            <span>参数配置覆盖率</span>
                            <strong>{stats.total ? Math.round((stats.configured / stats.total) * 100) : 0}%</strong>
                        </div>
                        <div className="admin-model-progress" aria-hidden="true">
                            <span style={{ width: `${stats.total ? (stats.configured / stats.total) * 100 : 0}%` }} />
                        </div>
                    </div>
                </div>
                <div className="admin-model-stat-list">
                    {Object.entries(capabilityConfig).map(([key, config]) => (
                        <div key={key} className="admin-model-stat-item">
                            <span className={`admin-model-type-icon is-${config.tone}`}>{config.icon}</span>
                            <div>
                                <strong>{(stats as Record<string, number>)[key]}</strong>
                                <span>{config.label}模型</span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="admin-model-catalog" aria-label="模型目录">
                <div className="admin-model-toolbar">
                    <div className="admin-model-tabs" role="group" aria-label="按模型类型筛选">
                        <button type="button" className={activeTab === "all" ? "is-active" : ""} aria-pressed={activeTab === "all"} onClick={() => setActiveTab("all")}>
                            全部 <span>{stats.total}</span>
                        </button>
                        {Object.entries(capabilityConfig).map(([key, config]) => (
                            <button key={key} type="button" className={activeTab === key ? "is-active" : ""} aria-pressed={activeTab === key} onClick={() => setActiveTab(key)}>
                                {config.label} <span>{(stats as Record<string, number>)[key]}</span>
                            </button>
                        ))}
                    </div>
                    <div className="admin-model-toolbar-actions">
                        <Input placeholder="搜索模型名称" prefix={<SearchOutlined />} value={keyword} onChange={(event) => setKeyword(event.target.value)} allowClear aria-label="搜索模型名称" />
                        <Tooltip title="刷新模型目录">
                            <Button
                                aria-label="刷新模型目录"
                                icon={<SyncOutlined spin={loading} />}
                                onClick={() => {
                                    void fetchItems();
                                    void fetchChannelModels();
                                }}
                            />
                        </Tooltip>
                    </div>
                </div>
                <div className="admin-model-result-meta">
                    <span>模型目录</span>
                    <span>
                        显示 {filteredModels.length} 个，已配置 {stats.configured}/{stats.total}
                    </span>
                </div>

                {loading ? (
                    <div className="admin-model-loading">
                        <Spin size="large" />
                    </div>
                ) : filteredModels.length === 0 ? (
                    <div className="admin-model-empty">
                        <Empty description="暂无匹配模型" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                            <Typography.Text type="secondary">请调整筛选条件，或先在模型设置中配置渠道。</Typography.Text>
                        </Empty>
                    </div>
                ) : (
                    <div className="admin-model-grid">
                        {filteredModels.map((m) => {
                            const cap = m.configured?.capability || guessCapability(m.modelName);
                            const config = capabilityConfig[cap as keyof typeof capabilityConfig] || capabilityConfig.text;
                            const isConfigured = !!m.configured;
                            const summary = m.configured ? getConfigSummary(m.configured) : [];
                            return (
                                <button type="button" key={m.modelName} className={`admin-model-card ${!isConfigured ? "is-unconfigured" : ""}`} onClick={() => handleOpenModal(m.configured || undefined, m.modelName)}>
                                    <div className="admin-model-card-head">
                                        <span className={`admin-model-type-icon is-${config.tone}`}>{config.icon}</span>
                                        <div className="admin-model-card-title">
                                            <Tooltip title={m.modelName}>
                                                <strong>{m.modelName}</strong>
                                            </Tooltip>
                                            <span>{m.inChannel ? "渠道模型" : "历史配置"}</span>
                                        </div>
                                        <span className="admin-model-edit" aria-hidden="true">
                                            <EditOutlined />
                                        </span>
                                    </div>
                                    <div className="admin-model-card-status">
                                        <span className={`admin-model-capability is-${config.tone}`}>{config.label}</span>
                                        {isConfigured ? (
                                            <span className="admin-model-configured">
                                                <CheckCircleFilled /> 已配置
                                            </span>
                                        ) : (
                                            <span className="admin-model-pending">待配置</span>
                                        )}
                                    </div>
                                    <div className="admin-model-card-body">
                                        {summary.length ? (
                                            <div className="admin-model-attributes">
                                                {summary.slice(0, 4).map((value, index) => (
                                                    <span key={`${value}-${index}`}>{value}</span>
                                                ))}
                                                {summary.length > 4 ? <span>+{summary.length - 4}</span> : null}
                                            </div>
                                        ) : (
                                            <span className="admin-model-no-config">尚未设置能力参数</span>
                                        )}
                                    </div>
                                    <span className="admin-model-card-action">{isConfigured ? "编辑参数" : "开始配置"}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            <Modal
                className="admin-model-modal"
                title={
                    <div className="admin-model-modal-title">
                        <div>
                            <SettingOutlined />
                        </div>
                        <span>
                            <strong>{editingItem ? "编辑模型参数" : "配置模型参数"}</strong>
                            <small>设置模型能力与请求参数</small>
                        </span>
                    </div>
                }
                open={modalOpen}
                onOk={handleSave}
                onCancel={() => {
                    setModalOpen(false);
                    form.resetFields();
                }}
                afterOpenChange={handleAfterOpenChange}
                width={680}
                okText="保存"
                cancelText="取消"
            >
                <Form form={form} layout="vertical" className="mt-4">
                    <Row gutter={16}>
                        <Col span={14}>
                            <Form.Item name="modelName" label="模型名称" rules={[{ required: true, message: "请输入模型名称" }]}>
                                <Input placeholder="例如：gpt-image-1" disabled />
                            </Form.Item>
                        </Col>
                        <Col span={10}>
                            <Form.Item name="capability" label="模型类型" rules={[{ required: true, message: "请选择类型" }]}>
                                <Select
                                    options={Object.entries(capabilityConfig).map(([key, config]) => ({
                                        value: key,
                                        label: (
                                            <div className="flex items-center gap-2">
                                                <span style={{ color: config.color }}>{config.icon}</span>
                                                <span>{config.label}</span>
                                            </div>
                                        ),
                                    }))}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    {capability === "video" && (
                        <Card
                            title={
                                <span className="flex items-center gap-2">
                                    <PlayCircleOutlined className="text-purple-500" />
                                    视频参数
                                </span>
                            }
                            size="small"
                            className="mb-4 border-purple-100 bg-purple-50/30"
                        >
                            <Form.Item name="videoResolutions" label="分辨率" help="勾选或输入，多个值用逗号分隔" initialValue={["720p"]}>
                                <Select mode="tags" placeholder="选择或输入分辨率" options={allResolutionOptions.map((v) => ({ label: v, value: v }))} />
                            </Form.Item>
                            <Form.Item name="videoRatios" label="比例" help="勾选或输入，多个值用逗号分隔" initialValue={["16:9"]}>
                                <Select mode="tags" placeholder="选择或输入比例" options={allRatioOptions.map((v) => ({ label: v, value: v }))} />
                            </Form.Item>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="videoDurations" label="时长(秒)" help="勾选或输入" initialValue={["6"]}>
                                        <Select mode="tags" placeholder="选择或输入时长" options={allDurationOptions.map((v) => ({ label: v === "adaptive" ? "自适应" : `${v}s`, value: String(v) }))} />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="videoMaxDuration" label="最大时长(秒)" initialValue={15}>
                                        <InputNumber min={1} max={300} placeholder="15" style={{ width: "100%" }} />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item name="videoBillingMode" label="视频计费方式" initialValue="per_second" help="按次数：每次生成按“模型调用扣除算力点 × 数量”；按秒：按“模型调用扣除算力点 × 秒数 × 数量”。">
                                <Select
                                    options={[
                                        { label: "按秒计算", value: "per_second" },
                                        { label: "按次数计算", value: "per_call" },
                                    ]}
                                />
                            </Form.Item>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="videoSupportGenerateAudio" label="支持生成音频" valuePropName="checked">
                                        <Switch />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="videoSupportWatermark" label="支持水印" valuePropName="checked">
                                        <Switch />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>
                    )}

                    {capability === "image" && (
                        <Card
                            title={
                                <span className="flex items-center gap-2">
                                    <CameraOutlined className="text-green-500" />
                                    图片参数
                                </span>
                            }
                            size="small"
                            className="mb-4 border-green-100 bg-green-50/30"
                        >
                            <Form.Item name="imageQualities" label="质量" help="勾选或输入">
                                <Select mode="tags" placeholder="选择或输入质量" options={allQualityOptions.map((v) => ({ label: v, value: v }))} />
                            </Form.Item>
                            <Form.Item name="imageAspectRatios" label="比例" help="勾选或输入">
                                <Select mode="tags" placeholder="选择或输入比例" options={allAspectRatioOptions.map((v) => ({ label: v, value: v }))} />
                            </Form.Item>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="imageMaxCount" label="最大生成数量">
                                        <InputNumber min={1} max={100} placeholder="1" style={{ width: "100%" }} />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="imageSupportCustomSize" label="支持自定义尺寸" valuePropName="checked">
                                        <Switch />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>
                    )}

                    {capability === "audio" && (
                        <Card
                            title={
                                <span className="flex items-center gap-2">
                                    <AudioOutlined className="text-orange-500" />
                                    音频参数
                                </span>
                            }
                            size="small"
                            className="mb-4 border-orange-100 bg-orange-50/30"
                        >
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="audioVoices" label="声音">
                                        <Select mode="tags" placeholder="输入声音名称" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="audioFormats" label="格式">
                                        <Select
                                            mode="tags"
                                            placeholder="输入格式"
                                            options={[
                                                { label: "mp3", value: "mp3" },
                                                { label: "wav", value: "wav" },
                                                { label: "opus", value: "opus" },
                                            ]}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="audioSpeedMin" label="最小速度">
                                        <InputNumber min={0.1} max={10} step={0.1} placeholder="0.5" style={{ width: "100%" }} />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="audioSpeedMax" label="最大速度">
                                        <InputNumber min={0.1} max={10} step={0.1} placeholder="2.0" style={{ width: "100%" }} />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>
                    )}

                    {(capability === "text" || capability === "chat") && (
                        <Card
                            title={
                                <span className="flex items-center gap-2">
                                    <FileTextOutlined className="text-blue-500" />
                                    对话/文本参数
                                </span>
                            }
                            size="small"
                            className="mb-4 border-blue-100 bg-blue-50/30"
                        >
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="chatSupportsMultimodal" label="支持多模态" valuePropName="checked">
                                        <Switch />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="chatContextWindow" label="上下文窗口 (tokens)">
                                        <InputNumber min={0} step={1000} placeholder="128000" style={{ width: "100%" }} />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="chatMaxOutputTokens" label="最大输出 (tokens)">
                                        <InputNumber min={0} step={1000} placeholder="8192" style={{ width: "100%" }} />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={16}>
                                <Col span={24}>
                                    <Form.Item name="chatDescription" label="模型描述">
                                        <Input placeholder="如 GPT-4o 多模态对话模型" />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>
                    )}

                    {/* 请求字段映射 */}
                    <Card title="请求字段映射" size="small" style={{ marginTop: 16 }} extra={<span style={{ fontSize: 12, color: "#999" }}>自定义请求体字段名，优先于渠道设置</span>}>
                        <Form.List name="requestFields">
                            {(fields, { add, remove }) => (
                                <>
                                    {fields.map(({ key, name, ...restField }) => (
                                        <div key={key} style={{ marginBottom: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fafafa" }}>
                                            <Row gutter={8} align="middle">
                                                <Col span={7}>
                                                    <Form.Item {...restField} name={[name, "fieldName"]} noStyle rules={[{ required: true, message: "字段名" }]}>
                                                        <Input placeholder="源字段，如 images" size="small" />
                                                    </Form.Item>
                                                </Col>
                                                <Col span={1} style={{ textAlign: "center" }}>
                                                    <span style={{ color: "#999", fontSize: 12 }}>→</span>
                                                </Col>
                                                <Col span={7}>
                                                    <Form.Item {...restField} name={[name, "requestKey"]} noStyle rules={[{ required: true, message: "映射字段" }]}>
                                                        <Input placeholder="目标字段，如 image" size="small" />
                                                    </Form.Item>
                                                </Col>
                                                <Col span={7}>
                                                    <Form.Item {...restField} name={[name, "dataType"]} noStyle rules={[{ required: true, message: "选择类型" }]}>
                                                        <Select
                                                            size="small"
                                                            placeholder="目标数据类型"
                                                            options={[
                                                                { label: "string", value: "string" },
                                                                { label: "integer", value: "integer" },
                                                                { label: "boolean", value: "boolean" },
                                                                { label: "number", value: "number" },
                                                                { label: "array", value: "array" },
                                                                { label: "object", value: "object" },
                                                            ]}
                                                        />
                                                    </Form.Item>
                                                </Col>
                                                <Col span={2} style={{ textAlign: "right" }}>
                                                    <Tooltip title="删除字段映射">
                                                        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(name)} aria-label="删除字段映射" />
                                                    </Tooltip>
                                                </Col>
                                            </Row>
                                            <Form.Item noStyle shouldUpdate={(previous, current) => previous.requestFields?.[name]?.dataType !== current.requestFields?.[name]?.dataType}>
                                                {() => {
                                                    const dataType = form.getFieldValue(["requestFields", name, "dataType"]);
                                                    return (
                                                        <Row gutter={12} style={{ marginTop: 12 }}>
                                                            <Col span={dataType === "object" ? 12 : 24}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, "valuePath"]}
                                                                    label="源数据路径（可选）"
                                                                    tooltip="点路径支持对象字段和数组下标，例如 0 或 items.0.dataUrl；留空使用完整源值"
                                                                    style={{ marginBottom: dataType === "object" || dataType === "array" ? 10 : 0 }}
                                                                >
                                                                    <Input placeholder="例如 0" size="small" />
                                                                </Form.Item>
                                                            </Col>
                                                            {dataType === "object" ? (
                                                                <Col span={12}>
                                                                    <Form.Item
                                                                        {...restField}
                                                                        name={[name, "objectKey"]}
                                                                        label="对象值字段（简易模式）"
                                                                        tooltip="把绑定数据放入这个对象字段，例如填写 url 会生成 { url: @data }"
                                                                        style={{ marginBottom: 10 }}
                                                                    >
                                                                        <Input placeholder="例如 url" size="small" />
                                                                    </Form.Item>
                                                                </Col>
                                                            ) : null}
                                                            {dataType === "object" || dataType === "array" ? (
                                                                <Col span={24}>
                                                                    <Form.Item
                                                                        {...restField}
                                                                        name={[name, "jsonTemplate"]}
                                                                        label="自定义 JSON 值模板（可选）"
                                                                        tooltip='模板必须是合法 JSON；值为精确字符串 "@data" 时会替换为绑定数据，自定义模板优先于简易模式'
                                                                        style={{ marginBottom: 0 }}
                                                                        rules={[
                                                                            {
                                                                                validator: async (_, value) => {
                                                                                    if (!String(value || "").trim()) return;
                                                                                    try {
                                                                                        const parsed = JSON.parse(value);
                                                                                        if (dataType === "object" && (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))) {
                                                                                            throw new Error("模板根节点必须是 object");
                                                                                        }
                                                                                        if (dataType === "array" && !Array.isArray(parsed)) {
                                                                                            throw new Error("模板根节点必须是 array");
                                                                                        }
                                                                                    } catch (error) {
                                                                                        throw new Error(error instanceof Error ? error.message : "请输入合法 JSON");
                                                                                    }
                                                                                },
                                                                            },
                                                                        ]}
                                                                    >
                                                                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder={'例如：{"url":"@data"}'} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} />
                                                                    </Form.Item>
                                                                </Col>
                                                            ) : null}
                                                        </Row>
                                                    );
                                                }}
                                            </Form.Item>
                                        </div>
                                    ))}
                                    <Button type="dashed" onClick={() => add({ dataType: "string" })} block size="small" icon={<PlusOutlined />}>
                                        新增字段映射
                                    </Button>
                                </>
                            )}
                        </Form.List>
                    </Card>
                </Form>
            </Modal>
        </div>
    );
}
