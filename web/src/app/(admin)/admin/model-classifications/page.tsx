"use client";

import { AudioOutlined, CameraOutlined, CheckCircleFilled, EditOutlined, FileTextOutlined, PlayCircleOutlined, SearchOutlined, SettingOutlined, SyncOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Tag, Typography, Empty, Spin, Tooltip } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useUserStore } from "@/stores/use-user-store";
import { type AdminModelClassification, createAdminModelClassification, fetchAdminModelClassifications, fetchAllChannelModels, updateAdminModelClassification } from "@/services/api/admin";

const capabilityConfig = {
    text: { label: "文本", icon: <FileTextOutlined />, color: "#1890ff", bg: "linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)" },
    image: { label: "图片", icon: <CameraOutlined />, color: "#52c41a", bg: "linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)" },
    video: { label: "视频", icon: <PlayCircleOutlined />, color: "#722ed1", bg: "linear-gradient(135deg, #f9f0ff 0%, #efdbff 100%)" },
    audio: { label: "音频", icon: <AudioOutlined />, color: "#fa8c16", bg: "linear-gradient(135deg, #fff7e6 0%, #ffe7ba 100%)" },
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
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
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
            const res = await fetchAdminModelClassifications(token, { keyword, page, pageSize: 500 });
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
                requestFields: (values.requestFields || []).filter((f: any) => f?.fieldName && f?.requestKey && f?.dataType),
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

    const renderConfigSummary = (item: AdminModelClassification) => {
        if (item.capability === "video" && item.videoConfig) {
            return (
                <div className="mt-2 flex flex-wrap gap-1">
                    {item.videoConfig.resolutions?.map((r) => (
                        <Tag key={r} color="purple" className="text-xs">
                            {r}
                        </Tag>
                    ))}
                    {item.videoConfig.ratios?.map((r) => (
                        <Tag key={r} color="purple" className="text-xs">
                            {r}
                        </Tag>
                    ))}
                    {item.videoConfig.durations?.map((d) => (
                        <Tag key={d} color="purple" className="text-xs">
                            {d}s
                        </Tag>
                    ))}
                    <Tag color="purple" className="text-xs">
                        {item.videoConfig.billingMode === "per_call" ? "按次数计费" : "按秒计费"}
                    </Tag>
                </div>
            );
        }
        if (item.capability === "image" && item.imageConfig) {
            return (
                <div className="mt-2 flex flex-wrap gap-1">
                    {item.imageConfig.qualities?.map((q) => (
                        <Tag key={q} color="green" className="text-xs">
                            {q}
                        </Tag>
                    ))}
                    {item.imageConfig.aspectRatios?.map((r) => (
                        <Tag key={r} color="green" className="text-xs">
                            {r}
                        </Tag>
                    ))}
                </div>
            );
        }
        if (item.capability === "audio" && item.audioConfig) {
            return (
                <div className="mt-2 flex flex-wrap gap-1">
                    {item.audioConfig.voices?.map((v) => (
                        <Tag key={v} color="orange" className="text-xs">
                            {v}
                        </Tag>
                    ))}
                    {item.audioConfig.formats?.map((f) => (
                        <Tag key={f} color="orange" className="text-xs">
                            {f}
                        </Tag>
                    ))}
                </div>
            );
        }
        if ((item.capability === "text" || item.capability === "chat") && item.chatConfig) {
            return (
                <div className="mt-2 flex flex-wrap gap-1">
                    <Tag color="blue" className="text-xs">
                        上下文 {item.chatConfig.contextWindow?.toLocaleString() ?? "-"} tokens
                    </Tag>
                    <Tag color="blue" className="text-xs">
                        最大输出 {item.chatConfig.maxOutputTokens?.toLocaleString() ?? "-"} tokens
                    </Tag>
                    {item.chatConfig.supportsMultimodal && (
                        <Tag color="blue" className="text-xs">
                            多模态
                        </Tag>
                    )}
                    {item.chatConfig.description && (
                        <Tag color="blue" className="text-xs">
                            {item.chatConfig.description}
                        </Tag>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="admin-config-page admin-model-page min-h-screen p-6">
            {/* 页面标题 */}
            <div className="admin-page-title mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25">
                        <SettingOutlined className="text-lg" />
                    </div>
                    <div>
                        <Typography.Title level={4} style={{ margin: 0 }}>
                            模型管理
                        </Typography.Title>
                        <Typography.Text type="secondary" className="text-sm">
                            管理已配置渠道中的模型，设置其参数
                        </Typography.Text>
                    </div>
                </div>
                <Button
                    icon={<SyncOutlined />}
                    onClick={() => {
                        fetchItems();
                        fetchChannelModels();
                    }}
                >
                    刷新
                </Button>
            </div>

            {/* 统计卡片 */}
            <div className="mb-5 grid grid-cols-5 gap-3">
                <div className="group relative cursor-pointer overflow-hidden rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:border-blue-200 hover:shadow-md" onClick={() => setActiveTab("all")}>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
                            <div className="mt-1 text-xs text-gray-500">全部模型</div>
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                            <SettingOutlined />
                        </div>
                    </div>
                    {activeTab === "all" && <div className="absolute bottom-0 left-0 h-0.5 w-full bg-gradient-to-r from-blue-500 to-purple-500" />}
                </div>
                {Object.entries(capabilityConfig).map(([key, config]) => (
                    <div
                        key={key}
                        className="group relative cursor-pointer overflow-hidden rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md"
                        style={{ borderColor: activeTab === key ? config.color + "40" : undefined }}
                        onClick={() => setActiveTab(key)}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-2xl font-bold text-gray-800">{(stats as Record<string, number>)[key]}</div>
                                <div className="mt-1 text-xs text-gray-500">{config.label}模型</div>
                            </div>
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors" style={{ background: config.bg, color: config.color }}>
                                {config.icon}
                            </div>
                        </div>
                        {activeTab === key && <div className="absolute bottom-0 left-0 h-0.5 w-full" style={{ background: `linear-gradient(to right, ${config.color}, ${config.color}80)` }} />}
                    </div>
                ))}
            </div>

            {/* 搜索栏 */}
            <div className="admin-inline-filter mb-5 flex items-center justify-between">
                <Input placeholder="搜索模型名称..." prefix={<SearchOutlined className="text-gray-400" />} value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 320 }} allowClear className="!rounded-lg" />
                <span className="text-xs text-gray-400">
                    已配置 <span className="font-medium text-gray-600">{stats.configured}</span>/{stats.total} 个模型
                </span>
            </div>

            {/* 模型列表 */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Spin size="large" />
                </div>
            ) : filteredModels.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-20">
                    <Empty description="暂无模型" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                        <Typography.Text type="secondary">请先在「模型设置」中配置渠道和模型</Typography.Text>
                    </Empty>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredModels.map((m) => {
                        const cap = m.configured?.capability || guessCapability(m.modelName);
                        const config = capabilityConfig[cap as keyof typeof capabilityConfig] || capabilityConfig.text;
                        const isConfigured = !!m.configured;
                        return (
                            <div
                                key={m.modelName}
                                className={`group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:border-gray-200 hover:shadow-md cursor-pointer ${!isConfigured ? "border-dashed" : ""}`}
                                onClick={() => handleOpenModal(m.configured || undefined, m.modelName)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105" style={{ background: config.bg, color: config.color }}>
                                            {config.icon}
                                        </div>
                                        <div className="min-w-0">
                                            <Tooltip title={m.modelName}>
                                                <div className="truncate font-medium text-gray-800 text-sm">{m.modelName}</div>
                                            </Tooltip>
                                            <div className="mt-1 flex items-center gap-1.5">
                                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: config.bg, color: config.color }}>
                                                    {config.label}
                                                </span>
                                                {isConfigured && (
                                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
                                                        <CheckCircleFilled className="text-xs" />
                                                        已配置
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <Tooltip title={isConfigured ? "编辑参数" : "配置参数"}>
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<EditOutlined />}
                                            className="!text-gray-400 hover:!text-gray-600"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenModal(m.configured || undefined, m.modelName);
                                            }}
                                        />
                                    </Tooltip>
                                </div>
                                {isConfigured ? (
                                    renderConfigSummary(m.configured!)
                                ) : (
                                    <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                                        <span className="inline-block h-1 w-1 rounded-full bg-gray-300" />
                                        未配置参数
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 编辑弹窗 */}
            <Modal
                title={
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                            <SettingOutlined />
                        </div>
                        <span>{editingItem ? "编辑模型参数" : "配置模型参数"}</span>
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
                                        <Row key={key} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                                            <Col span={6}>
                                                <Form.Item {...restField} name={[name, "fieldName"]} noStyle rules={[{ required: true, message: "字段名" }]}>
                                                    <Input placeholder="前端字段名 (如 reference_images)" size="small" />
                                                </Form.Item>
                                            </Col>
                                            <Col span={1}>
                                                <span style={{ color: "#999", fontSize: 12 }}>→</span>
                                            </Col>
                                            <Col span={6}>
                                                <Form.Item {...restField} name={[name, "requestKey"]} noStyle rules={[{ required: true, message: "映射字段" }]}>
                                                    <Input placeholder="请求字段名 (如 images)" size="small" />
                                                </Form.Item>
                                            </Col>
                                            <Col span={8}>
                                                <Form.Item {...restField} name={[name, "dataType"]} noStyle rules={[{ required: true, message: "选择类型" }]}>
                                                    <Select
                                                        size="small"
                                                        placeholder="数据类型"
                                                        dropdownMatchSelectWidth={false}
                                                        style={{ minWidth: 100 }}
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
                                            <Col span={3}>
                                                <Button type="link" danger size="small" icon={<span>✕</span>} onClick={() => remove(name)} />
                                            </Col>
                                        </Row>
                                    ))}
                                    <Button type="dashed" onClick={() => add()} block size="small" icon={<span>+</span>}>
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
