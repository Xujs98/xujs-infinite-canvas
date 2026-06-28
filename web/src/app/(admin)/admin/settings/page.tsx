"use client";

import { CheckCircleOutlined, DeleteOutlined, EyeOutlined, FormatPainterOutlined, LockOutlined, LoadingOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, ToolOutlined } from "@ant-design/icons";
import { json } from "@codemirror/lang-json";
import { App, Button, Card, Checkbox, Col, Drawer, Flex, Form, Input, InputNumber, Modal, Row, Segmented, Select, Space, Switch, Table, Tabs, Tag, Typography } from "antd";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@uiw/react-codemirror";

import { fetchAdminSettings, fetchChannelModels, saveAdminSettings, testChannelModel, type AdminModelChannel, type AdminModelCost, type AdminSettings } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });
const jsonEditorTheme = EditorView.theme({
    "&": { backgroundColor: "var(--ant-color-bg-container)", color: "var(--ant-color-text)" },
    ".cm-content": { caretColor: "var(--ant-color-text)", padding: "12px 0" },
    ".cm-line": { padding: "0 18px" },
    ".cm-gutters": { backgroundColor: "var(--ant-color-fill-quaternary)", borderRight: "1px solid var(--ant-color-border)", color: "var(--ant-color-text-tertiary)" },
    ".cm-activeLine": { backgroundColor: "var(--ant-color-fill-quaternary)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--ant-color-fill-quaternary)", color: "var(--ant-color-text)" },
    ".cm-cursor": { borderLeftColor: "var(--ant-color-text)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "var(--ant-control-item-bg-active)" },
    ".cm-foldPlaceholder": { backgroundColor: "var(--ant-color-fill-quaternary)", border: "1px solid var(--ant-color-border)", color: "var(--ant-color-text-tertiary)" },
    "&.cm-focused": { outline: "none" },
});

const emptySettings: AdminSettings = {
    public: {
        modelChannel: {
            availableModels: [],
            modelCosts: [],
            defaultModel: "",
            defaultImageModel: "",
            defaultVideoModel: "",
            defaultTextModel: "",
            systemPrompt: "",
            allowCustomChannel: true,
        },
        auth: { allowRegister: true, linuxDo: { enabled: false } },
    },
    private: { channels: [], promptSync: { enabled: true, cron: "*/5 * * * *" }, auth: { linuxDo: { clientId: "", clientSecret: "" } } },
};
const emptyChannel: AdminModelChannel = { protocol: "openai", name: "", baseUrl: "", apiKey: "", models: [], weight: 1, enabled: true, remark: "", mediaType: "image" };

type SettingsTabKey = "public" | "private";
type EditorMode = "visual" | "json";
type ModelSelectTabKey = "new" | "current";

export default function AdminSettingsPage() {
    const token = useUserStore((state) => state.token);
    const { message } = App.useApp();
    const [form] = Form.useForm<AdminSettings>();
    const [activeTab, setActiveTab] = useState<SettingsTabKey>("public");
    const [editorMode, setEditorMode] = useState<Record<SettingsTabKey, EditorMode>>({ public: "visual", private: "visual" });
    const [jsonText, setJsonText] = useState<Record<SettingsTabKey, string>>({ public: "", private: "" });
    const [channels, setChannels] = useState<AdminModelChannel[]>([]);
    const [channelForm] = Form.useForm<AdminModelChannel>();
    const [editingChannelIndex, setEditingChannelIndex] = useState<number | null>(null);
    const [isChannelDrawerOpen, setIsChannelDrawerOpen] = useState(false);
    const [testChannelIndex, setTestChannelIndex] = useState<number | null>(null);
    const [testKeyword, setTestKeyword] = useState("");
    const [selectedTestModels, setSelectedTestModels] = useState<string[]>([]);
    const [testingModels, setTestingModels] = useState<string[]>([]);
    const [testResults, setTestResults] = useState<Record<string, { status: "success" | "error"; duration?: string; message: string }>>({});
    const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
    const [modelSelectSource, setModelSelectSource] = useState<string[]>([]);
    const [modelSelectExisting, setModelSelectExisting] = useState<string[]>([]);
    const [modelSelectSelected, setModelSelectSelected] = useState<string[]>([]);
    const [modelSelectKeyword, setModelSelectKeyword] = useState("");
    const [modelSelectNewModel, setModelSelectNewModel] = useState("");
    const [modelSelectTab, setModelSelectTab] = useState<ModelSelectTabKey>("new");
    const [isFetchingChannelModels, setIsFetchingChannelModels] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [modelCosts, setModelCosts] = useState<AdminModelCost[]>([]);
    const [knownModels, setKnownModels] = useState<string[]>([]);
    const publicModels = Form.useWatch(["public", "modelChannel", "availableModels"], form) || [];
    const channelMediaType = Form.useWatch("mediaType", channelForm) || "image";
    const channelModels = useMemo(() => collectChannelModels(channels), [channels]);
    const channelTableData = useMemo(() => channels.map((channel, index) => ({ ...channel, _index: index, _rowKey: `${index}-${channel.name}-${channel.baseUrl}` })), [channels]);
    const activeMode = editorMode[activeTab];
    const activeJsonText = jsonText[activeTab];
    const jsonError = activeMode === "json" ? getJsonError(activeJsonText) : "";
    const modelSelectGroups = useMemo(() => buildModelSelectGroups(modelSelectSource, modelSelectExisting), [modelSelectSource, modelSelectExisting]);
    const activeModelSelectModels = useMemo(() => {
        const keyword = modelSelectKeyword.trim().toLowerCase();
        return modelSelectGroups[modelSelectTab].filter((model) => model.toLowerCase().includes(keyword));
    }, [modelSelectGroups, modelSelectKeyword, modelSelectTab]);
    const activeSelectedCount = activeModelSelectModels.filter((model) => modelSelectSelected.includes(model)).length;

    const loadSettings = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const data = normalizeSettings(await fetchAdminSettings(token));
            form.setFieldsValue(data);
            setChannels(data.private.channels);
            setModelCosts(data.public.modelChannel.modelCosts);
            setKnownModels(collectKnownModels(data));
            setJsonText({
                public: JSON.stringify(data.public, null, 2),
                private: JSON.stringify(data.private, null, 2),
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取设置失败");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadSettings();
    }, [token]);

    const changeTab = (nextTab: SettingsTabKey) => {
        setActiveTab(nextTab);
    };

    const saveSettings = async () => {
        if (!token) return;
        const values = await collectSettings(form, editorMode, jsonText, message);
        if (!values) {
            return;
        }
        setIsSaving(true);
        try {
            const saved = normalizeSettings(await saveAdminSettings(token, values));
            const merged = mergeChannelApiKeys(values.private.channels, saved);
            form.setFieldsValue(merged);
            setChannels(merged.private.channels);
            setModelCosts(merged.public.modelChannel.modelCosts);
            rememberKnownModels(merged);
            setJsonText({
                public: JSON.stringify(merged.public, null, 2),
                private: JSON.stringify(merged.private, null, 2),
            });
            message.success("已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setIsSaving(false);
        }
    };

    const toggleMode = (tab: SettingsTabKey, nextMode: EditorMode) => {
        if (nextMode === "json") {
            setJsonText((current) => ({
                ...current,
                [tab]: JSON.stringify(tab === "public" ? normalizePublicSetting(form.getFieldValue(["public"]) as Partial<AdminSettings["public"]>) : normalizePrivateSetting(form.getFieldValue(["private"]) as Partial<AdminSettings["private"]>), null, 2),
            }));
            setEditorMode((current) => ({ ...current, [tab]: nextMode }));
            return;
        }
        const parsed = parseTabJson(tab, jsonText[tab]);
        if (!parsed) {
            message.error("JSON 格式不正确");
            return;
        }
        form.setFieldsValue({ [tab]: parsed } as Partial<AdminSettings>);
        if (tab === "private") setChannels((parsed as AdminSettings["private"]).channels);
        if (tab === "public") setModelCosts((parsed as AdminSettings["public"]).modelChannel.modelCosts);
        rememberKnownModels({ ...normalizeSettings(form.getFieldsValue(true) as AdminSettings), [tab]: parsed });
        setEditorMode((current) => ({ ...current, [tab]: nextMode }));
    };

    const formatJson = (tab: SettingsTabKey) => {
        const parsed = parseTabJson(tab, jsonText[tab]);
        if (!parsed) {
            message.error("JSON 格式不正确");
            return;
        }
        if (tab === "public") setModelCosts((parsed as AdminSettings["public"]).modelChannel.modelCosts);
        setJsonText((current) => ({
            ...current,
            [tab]: JSON.stringify(parsed, null, 2),
        }));
    };

    const openChannelDrawer = (index: number | null) => {
        setEditingChannelIndex(index);
        setIsChannelDrawerOpen(true);
        const channel = index === null ? emptyChannel : normalizeChannelForForm(channels[index]);
        // 转换 extraHeaders 为表单格式
        const extraHeadersList = channel.extraHeaders
            ? Object.entries(channel.extraHeaders).map(([key, value]) => ({ key, value }))
            : [];
        const extraBodyJson = channel.extraBody ? JSON.stringify(channel.extraBody, null, 2) : "";
        channelForm.setFieldsValue({ ...channel, extraHeadersList, extraBodyJson });
        rememberModels(channel.models);
    };

    const closeChannelDrawer = () => {
        setIsChannelDrawerOpen(false);
        setEditingChannelIndex(null);
        channelForm.resetFields();
    };

    const saveChannel = async () => {
        const values: any = await channelForm.validateFields();
        const channel = normalizeChannelFromForm(values);
        // 转换 extraHeadersList -> extraHeaders
        if (values.extraHeadersList?.length) {
            const headers: Record<string, string> = {};
            for (const item of values.extraHeadersList) {
                if (item.key?.trim()) headers[item.key.trim()] = item.value || "";
            }
            channel.extraHeaders = Object.keys(headers).length ? headers : undefined;
        }
        // 转换 extraBodyJson -> extraBody
        if (values.extraBodyJson?.trim()) {
            try {
                channel.extraBody = JSON.parse(values.extraBodyJson);
            } catch {
                message.error("额外请求体字段 JSON 格式不正确");
                return;
            }
        }
        channel.pathPrefix = values.pathPrefix?.trim() || undefined;
        rememberModels(channel.models);
        const nextChannels = [...channels];
        if (editingChannelIndex === null) nextChannels.push(channel);
        else nextChannels[editingChannelIndex] = channel;
        await persistChannels(nextChannels);
        closeChannelDrawer();
    };

    const fetchChannelModelList = async () => {
        if (!token) return;
        const channel = channelForm.getFieldsValue();
        if (!channel?.baseUrl) {
            message.warning("请先填写接口地址");
            return;
        }
        if (editingChannelIndex === null && !channel?.apiKey) {
            message.warning("请先填写 API Key");
            return;
        }
        setIsFetchingChannelModels(true);
        try {
            const channelModels = await fetchChannelModels(token, { index: editingChannelIndex ?? undefined, channel: normalizeChannelFromForm(channel) });
            const current = isModelSelectorOpen ? uniqueModels(modelSelectSelected) : uniqueModels(channelForm.getFieldValue("models") || []);
            rememberModels(channelModels);
            if (!channelModels.length) {
                message.warning("上游未返回模型列表，请手动输入模型名称");
                return;
            }
            setModelSelectExisting(current);
            setModelSelectSource(uniqueModels(channelModels));
            setModelSelectSelected(uniqueModels([...current, ...channelModels]));
            setModelSelectKeyword("");
            setModelSelectNewModel("");
            setModelSelectTab("new");
            setIsModelSelectorOpen(true);
            message.success(`已获取 ${channelModels.length} 个模型，请选择后确认`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取模型失败");
        } finally {
            setIsFetchingChannelModels(false);
        }
    };

    const openChannelModelSelector = (sourceModels?: string[]) => {
        const current = uniqueModels(channelForm.getFieldValue("models") || []);
        const source = uniqueModels(sourceModels !== undefined ? sourceModels : [...knownModels, ...current]);
        setModelSelectExisting(current);
        setModelSelectSource(source);
        setModelSelectSelected(sourceModels ? uniqueModels([...current, ...source]) : current);
        setModelSelectKeyword("");
        setModelSelectNewModel("");
        setModelSelectTab(sourceModels ? "new" : "current");
        setIsModelSelectorOpen(true);
    };

    const closeChannelModelSelector = () => {
        setIsModelSelectorOpen(false);
        setModelSelectKeyword("");
        setModelSelectNewModel("");
    };

    const confirmChannelModelSelector = () => {
        const models = uniqueModels(modelSelectSelected);
        channelForm.setFieldValue("models", models);
        rememberModels(models);
        closeChannelModelSelector();
    };

    const toggleSelectedModel = (model: string, checked: boolean) => {
        setModelSelectSelected((current) => (checked ? uniqueModels([...current, model]) : current.filter((item) => item !== model)));
    };

    const selectActiveModels = () => {
        setModelSelectSelected((current) => uniqueModels([...current, ...activeModelSelectModels]));
    };

    const clearActiveModels = () => {
        const active = new Set(activeModelSelectModels);
        setModelSelectSelected((current) => current.filter((model) => !active.has(model)));
    };

    const addModelInSelector = () => {
        const model = modelSelectNewModel.trim();
        if (!model) return;
        setModelSelectExisting((current) => uniqueModels([...current, model]));
        setModelSelectSelected((current) => uniqueModels([...current, model]));
        setModelSelectNewModel("");
        setModelSelectTab("current");
    };

    function rememberModels(models: string[]) {
        setKnownModels((current) => uniqueModels([...current, ...models]));
    }

    function rememberKnownModels(settings: AdminSettings) {
        rememberModels(collectKnownModels(settings));
    }

    const openTestDialog = (index: number) => {
        const channel = normalizeChannelForForm(channels[index]);
        if (!channel.baseUrl || channel.models.length === 0) {
            message.warning("请先填写接口地址和至少一个模型");
            return;
        }
        setTestChannelIndex(index);
        setTestKeyword("");
        setSelectedTestModels([]);
        setTestingModels([]);
        setTestResults({});
    };

    const closeTestDialog = () => {
        setTestChannelIndex(null);
        setTestKeyword("");
        setSelectedTestModels([]);
        setTestingModels([]);
        setTestResults({});
    };

    const testModelOnline = async (model: string) => {
        if (testChannelIndex === null) return;
        if (!token) return;
        const channel = normalizeChannelForForm(channels[testChannelIndex]);
        setTestingModels((current) => [...current, model]);
        try {
            const startedAt = performance.now();
            const result = await testChannelModel(token, { index: testChannelIndex, channel, model });
            setTestResults((current) => ({ ...current, [model]: { status: "success", duration: `${((performance.now() - startedAt) / 1000).toFixed(2)}s`, message: result } }));
        } catch (error) {
            setTestResults((current) => ({ ...current, [model]: { status: "error", message: error instanceof Error ? error.message : "测试失败" } }));
        } finally {
            setTestingModels((current) => current.filter((item) => item !== model));
        }
    };

    const batchTestModels = async () => {
        for (const model of selectedTestModels) {
            await testModelOnline(model);
        }
    };

    const testChannel = testChannelIndex === null ? null : normalizeChannelForForm(channels[testChannelIndex]);
    const testModels = (testChannel?.models || []).filter((model: string) => model.toLowerCase().includes(testKeyword.trim().toLowerCase()));

    async function persistChannels(nextChannels: AdminModelChannel[]) {
        if (!token) return;
        const values = normalizeSettings(form.getFieldsValue(true) as AdminSettings);
        const nextChannelModels = collectChannelModels(nextChannels);
        const nextSettings = normalizeSettings({
            ...values,
            public: { ...values.public, modelChannel: { ...values.public.modelChannel, availableModels: nextChannelModels } },
            private: { ...values.private, channels: nextChannels },
        });
        const saved = normalizeSettings(await saveAdminSettings(token, nextSettings));
        const merged = mergeChannelApiKeys(nextChannels, saved);
        setChannels(merged.private.channels);
        setModelCosts(merged.public.modelChannel.modelCosts);
        rememberKnownModels(merged);
        form.setFieldsValue(merged);
        setJsonText({
            public: JSON.stringify(merged.public, null, 2),
            private: JSON.stringify(merged.private, null, 2),
        });
        message.success("已保存");
    }

    // 导航条滑动指示器
    const navRef = useRef<HTMLDivElement>(null);
    const tabBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
    const updateIndicator = useCallback(() => {
        const btn = tabBtnRefs.current.get(activeTab);
        const nav = navRef.current;
        if (btn && nav) {
            const navRect = nav.getBoundingClientRect();
            const btnRect = btn.getBoundingClientRect();
            setIndicatorStyle({ left: btnRect.left - navRect.left, width: btnRect.width });
        }
    }, [activeTab]);
    useEffect(() => { updateIndicator(); }, [updateIndicator]);
    useEffect(() => { window.addEventListener("resize", updateIndicator); return () => window.removeEventListener("resize", updateIndicator); }, [updateIndicator]);

    const settingsTabs = [
        { key: "public" as const, label: "公开配置", subLabel: "对外暴露", icon: <EyeOutlined /> },
        { key: "private" as const, label: "私有配置", subLabel: "不会对外暴露", icon: <LockOutlined /> },
    ];

    return (
        <div className="min-h-screen p-6">
            <div className="mx-auto max-w-[1200px]">
                {/* 页面标题 */}
                <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/25">
                        <ToolOutlined className="text-lg" />
                    </div>
                    <div>
                        <Typography.Title level={4} style={{ margin: 0 }}>模型设置</Typography.Title>
                        <Typography.Text type="secondary" className="text-sm">配置 AI 模型渠道和费用</Typography.Text>
                    </div>
                </div>

                {/* 固定导航条 */}
                <div className="sticky top-0 z-50 mb-7 flex items-center justify-between rounded-2xl border border-gray-100 bg-white/95 px-5 py-3 shadow-sm backdrop-blur-sm">
                    <div ref={navRef} className="relative flex items-center gap-1 rounded-2xl border border-gray-100 bg-gray-50 p-1.5">
                        <div
                            className="absolute top-1.5 bottom-1.5 rounded-xl bg-white shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
                            style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
                        />
                        {settingsTabs.map((tab) => (
                            <button
                                key={tab.key}
                                ref={(el) => { if (el) tabBtnRefs.current.set(tab.key, el); }}
                                className={`relative z-10 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors duration-300 ${
                                    activeTab === tab.key ? "text-gray-800" : "text-gray-400 hover:text-gray-600"
                                }`}
                                onClick={() => changeTab(tab.key)}
                            >
                                <span className="text-base">{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                    <Space>
                        <Button icon={<ReloadOutlined />} loading={isLoading} onClick={() => void loadSettings()}>刷新</Button>
                        <Button type="primary" icon={<SaveOutlined />} loading={isSaving} onClick={() => void saveSettings()} className="!rounded-lg">保存设置</Button>
                    </Space>
                </div>

                <Flex vertical gap={16}>
                <Card variant="borderless" className="!rounded-xl !border-gray-100 !shadow-sm">
                    <Flex justify="space-between" align="center" gap={16} wrap style={{ marginBottom: 16 }}>
                        <Segmented
                            value={activeMode}
                            onChange={(value) => toggleMode(activeTab, value as EditorMode)}
                            options={[
                                { label: "可视化编辑", value: "visual" },
                                { label: "手动编辑 JSON", value: "json" },
                            ]}
                        />
                        {activeMode === "json" ? (
                            <Space>
                                {jsonError ? (
                                    <Tag color="error">{jsonError}</Tag>
                                ) : (
                                    <Tag color="success" icon={<CheckCircleOutlined />}>
                                        JSON 格式正确
                                    </Tag>
                                )}
                                <Button icon={<FormatPainterOutlined />} onClick={() => formatJson(activeTab)}>
                                    格式化
                                </Button>
                            </Space>
                        ) : (
                            <Typography.Text type="secondary">{activeTab === "public" ? "这些配置会暴露给前端读取" : "这些配置只会在后台保存"}</Typography.Text>
                        )}
                    </Flex>

                    {activeTab === "public" ? (
                        activeMode === "visual" ? (
                            <Form form={form} layout="vertical" initialValues={emptySettings} requiredMark={false}>
                                <Row gutter={16}>
                                    <Col span={24}>
                                        <Form.Item name={["public", "modelChannel", "availableModels"]} label="系统可用模型(请先在私有配置里配置渠道)" extra="保存设置时会自动合并所有已启用私有渠道的模型，前台模型下拉会读取这里的公开列表">
                                            <Select mode="multiple" placeholder="请选择系统可用模型" options={channelModels.map((item) => ({ label: item, value: item }))} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={6}>
                                        <Form.Item name={["public", "modelChannel", "defaultModel"]} label="默认模型">
                                            <Select showSearch allowClear options={publicModels.map((item) => ({ label: item, value: item }))} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={6}>
                                        <Form.Item name={["public", "modelChannel", "defaultImageModel"]} label="默认图片模型">
                                            <Select showSearch allowClear options={publicModels.map((item) => ({ label: item, value: item }))} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={6}>
                                        <Form.Item name={["public", "modelChannel", "defaultVideoModel"]} label="默认视频模型">
                                            <Select showSearch allowClear options={publicModels.map((item) => ({ label: item, value: item }))} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={6}>
                                        <Form.Item name={["public", "modelChannel", "defaultTextModel"]} label="默认文本模型">
                                            <Select showSearch allowClear options={publicModels.map((item) => ({ label: item, value: item }))} />
                                        </Form.Item>
                                    </Col>
                                    <Col span={24}>
                                        <Form.Item name={["public", "modelChannel", "systemPrompt"]} label="系统提示词">
                                            <Input.TextArea rows={4} />
                                        </Form.Item>
                                    </Col>
                                    <Col span={24}>
                                        <Typography.Title level={5}>模型算力点</Typography.Title>
                                        <Table
                                            rowKey="model"
                                            pagination={false}
                                            size="small"
                                            dataSource={publicModels.map((model) => {
                                                const existing = modelCosts.find((item) => item.model === model);
                                                return { model, credits: existing?.credits || 0, alias: existing?.alias || "" };
                                            })}
                                            columns={[
                                                { title: "模型", dataIndex: "model" },
                                                {
                                                    title: "别名",
                                                    dataIndex: "alias",
                                                    width: 200,
                                                    render: (_, item) => (
                                                        <Input
                                                            placeholder="留空显示原名"
                                                            value={item.alias}
                                                            onChange={(e) => setModelCost(form, setModelCosts, item.model, item.credits, e.target.value)}
                                                        />
                                                    ),
                                                },
                                                {
                                                    title: "每次调用扣除",
                                                    dataIndex: "credits",
                                                    width: 220,
                                                    render: (_, item) => (
                                                        <InputNumber
                                                            min={0}
                                                            step={1}
                                                            precision={0}
                                                            className="!w-full"
                                                            value={item.credits}
                                                            addonAfter="点"
                                                            onChange={(value) => setModelCost(form, setModelCosts, item.model, Number(value) || 0, item.alias)}
                                                        />
                                                    ),
                                                },
                                            ]}
                                        />
                                    </Col>
                                </Row>
                            </Form>
                        ) : (
                            <div style={{ overflow: "hidden", border: "1px solid var(--ant-color-border)", borderRadius: 6 }}>
                                <CodeMirror
                                    value={activeJsonText}
                                    height="520px"
                                    extensions={[json(), jsonEditorTheme]}
                                    basicSetup={{ foldGutter: true, lineNumbers: true, highlightActiveLine: true, highlightActiveLineGutter: true }}
                                    theme="none"
                                    onChange={(value) => setJsonText((current) => ({ ...current, public: value }))}
                                    style={{ fontSize: 13 }}
                                />
                            </div>
                        )
                    ) : activeMode === "visual" ? (
                        <Form form={form} layout="vertical" initialValues={emptySettings} requiredMark={false}>
                            <Flex vertical gap={12}>
                                <Card
                                    size="small"
                                    title={
                                        <Space>
                                            <img src="/icons/linuxdo.svg" alt="" width={18} height={18} />
                                            Linux.do 登录
                                        </Space>
                                    }
                                >
                                    <Flex vertical gap={14}>
                                        <Typography.Text type="secondary">
                                            本项目接口回调地址是 /api/auth/linux-do/callback，请在 Linux.do 应用后台自行拼接站点前缀。
                                            <Typography.Link href="https://connect.linux.do" target="_blank" rel="noreferrer">
                                                点击此处管理你的 LinuxDO OAuth App
                                            </Typography.Link>
                                        </Typography.Text>
                                        <Row gutter={16}>
                                            <Col xs={24} md={6}>
                                                <Form.Item name={["public", "auth", "linuxDo", "enabled"]} label="开启 Linux.do 登录" valuePropName="checked">
                                                    <Switch />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={9}>
                                                <Form.Item name={["private", "auth", "linuxDo", "clientId"]} label="Linux.do Client ID">
                                                    <Input placeholder="输入 Linux.do OAuth App 的 ID" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} md={9}>
                                                <Form.Item name={["private", "auth", "linuxDo", "clientSecret"]} label="Linux.do Client Secret">
                                                    <Input.Password placeholder="留空则沿用已保存的密钥" />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </Flex>
                                </Card>
                                <Card size="small" title="提示词定时同步">
                                    <Row gutter={16} align="middle">
                                        <Col xs={24} md={8}>
                                            <Form.Item name={["private", "promptSync", "enabled"]} label="开启定时同步" valuePropName="checked">
                                                <Switch />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} md={16}>
                                            <Form.Item name={["private", "promptSync", "cron"]} label="Cron 表达式" extra="默认每 5 分钟同步内置 GitHub 远程提示词源">
                                                <Input placeholder="*/5 * * * *" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </Card>
                                <Button type="primary" icon={<PlusOutlined />} onClick={() => openChannelDrawer(null)}>
                                    新增渠道
                                </Button>
                                <Table
                                    rowKey="_rowKey"
                                    pagination={false}
                                    dataSource={channelTableData}
                                    columns={[
                                        { title: "名称", dataIndex: "name", render: (value) => value || "未命名渠道" },
                                        { title: "协议", dataIndex: "protocol", width: 96, render: (value) => <Tag>{value || "openai"}</Tag> },
                                        { title: "状态", dataIndex: "enabled", width: 96, render: (value) => <Tag color={value ? "success" : "default"}>{value ? "已启用" : "已停用"}</Tag> },
                                        {
                                            title: "模型",
                                            dataIndex: "models",
                                            render: (value: string[]) => (
                                                <Typography.Text ellipsis style={{ maxWidth: 360 }}>
                                                    {modelSummary(value || [])}
                                                </Typography.Text>
                                            ),
                                        },
                                        { title: "权重", dataIndex: "weight", width: 88 },
                                        {
                                            title: "操作",
                                            key: "actions",
                                            width: 220,
                                            align: "right",
                                            render: (_, item) => (
                                                <Space size={4}>
                                                    <Button size="small" onClick={() => openTestDialog(item._index)}>
                                                        测试
                                                    </Button>
                                                    <Button size="small" onClick={() => openChannelDrawer(item._index)}>
                                                        编辑
                                                    </Button>
                                                    <Button
                                                        danger
                                                        size="small"
                                                        icon={<DeleteOutlined />}
                                                        onClick={() => {
                                                            const nextChannels = [...channels];
                                                            nextChannels.splice(item._index, 1);
                                                            void persistChannels(nextChannels);
                                                        }}
                                                    />
                                                </Space>
                                            ),
                                        },
                                    ]}
                                />
                            </Flex>
                        </Form>
                    ) : (
                        <div style={{ overflow: "hidden", border: "1px solid var(--ant-color-border)", borderRadius: 6 }}>
                            <CodeMirror
                                value={activeJsonText}
                                height="520px"
                                extensions={[json(), jsonEditorTheme]}
                                basicSetup={{ foldGutter: true, lineNumbers: true, highlightActiveLine: true, highlightActiveLineGutter: true }}
                                theme="none"
                                onChange={(value) => setJsonText((current) => ({ ...current, private: value }))}
                                style={{ fontSize: 13 }}
                            />
                        </div>
                    )}
                </Card>
                <Drawer
                    title={editingChannelIndex === null ? "新增渠道" : "编辑渠道"}
                    open={isChannelDrawerOpen}
                    size={560}
                    onClose={closeChannelDrawer}
                    extra={
                        <Space>
                            <Button onClick={closeChannelDrawer}>取消</Button>
                            <Button type="primary" onClick={() => void saveChannel()}>
                                保存
                            </Button>
                        </Space>
                    }
                    destroyOnHidden
                >
                    <Form form={channelForm} layout="vertical" requiredMark={false} initialValues={emptyChannel}>
                        {/* 基础信息 */}
                        <div className="mb-6">
                            <div className="mb-3 flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-blue-500" />
                                <span className="text-sm font-medium text-gray-700">基础信息</span>
                            </div>
                            <Row gutter={16}>
                                <Col span={16}>
                                    <Form.Item name="name" label="渠道名称" rules={[{ required: true, message: "请输入渠道名称" }]}>
                                        <Input placeholder="如：通义千问 / GPT-4o" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="enabled" label="状态" valuePropName="checked">
                                        <Switch checkedChildren="启用" unCheckedChildren="停用" />
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <Form.Item name="baseUrl" label="接口地址" rules={[{ required: true, message: "请输入接口地址" }]}>
                                        <Input placeholder="https://api.example.com" />
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <Form.Item name="apiKey" label="API Key" rules={editingChannelIndex === null ? [{ required: true, message: "请输入 API Key" }] : []}>
                                        <Input.Password placeholder={editingChannelIndex === null ? "sk-..." : "留空则沿用已保存的 API Key"} />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </div>

                        {/* 模型配置 */}
                        <div className="mb-6">
                            <div className="mb-3 flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-green-500" />
                                <span className="text-sm font-medium text-gray-700">模型配置</span>
                            </div>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="protocol" label="协议">
                                        <Select options={[{ label: "OpenAI", value: "openai" }]} />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="weight" label="权重" help="数值越大，被选中概率越高">
                                        <InputNumber min={1} step={1} className="!w-full" />
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <Form.Item label="渠道可用模型">
                                        <Space.Compact style={{ width: "100%" }}>
                                            <Form.Item name="models" noStyle>
                                                <Select mode="tags" maxTagCount="responsive" tokenSeparators={[",", "\n"]} options={knownModels.map((model) => ({ label: model, value: model }))} />
                                            </Form.Item>
                                            <Button onClick={() => openChannelModelSelector()}>选择模型</Button>
                                        </Space.Compact>
                                    </Form.Item>
                                </Col>
                            </Row>
                        </div>

                        {/* 请求配置 */}
                        <div className="mb-6">
                            <div className="mb-3 flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-orange-500" />
                                <span className="text-sm font-medium text-gray-700">请求配置</span>
                                <span className="text-xs text-gray-400">（可选）</span>
                            </div>
                            <Row gutter={16}>
                                <Col span={24}>
                                    <Form.Item name="pathPrefix" label="路径前缀" help="覆盖默认的 /v1 前缀，如 /api/plan/v3">
                                        <Input placeholder="留空使用默认 /v1" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="imageFormat" label="图片格式" help="选择渠道期望的图片格式">
                                        <Select allowClear placeholder="base64" options={[{ value: "base64", label: "base64（保持原始格式）" }, { value: "url", label: "url（转换为公网 URL）" }]} />
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <Form.Item label="额外请求头" help="发送请求时附带的额外 HTTP 头">
                                        <Form.List name="extraHeadersList">
                                            {(fields, { add, remove }) => (
                                                <>
                                                    {fields.map((field) => (
                                                        <Space key={field.key} style={{ display: "flex", marginBottom: 4 }} align="baseline">
                                                            <Form.Item name={[field.name, "key"]} noStyle>
                                                                <Input placeholder="Header Name" style={{ width: 160 }} />
                                                            </Form.Item>
                                                            <Form.Item name={[field.name, "value"]} noStyle>
                                                                <Input placeholder="Header Value" style={{ width: 240 }} />
                                                            </Form.Item>
                                                            <DeleteOutlined onClick={() => remove(field.name)} />
                                                        </Space>
                                                    ))}
                                                    <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>添加请求头</Button>
                                                </>
                                            )}
                                        </Form.List>
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <Form.Item name="extraBodyJson" label="额外请求体字段" help="JSON 格式，会合并到发送的请求体中">
                                        <Input.TextArea rows={4} placeholder='{"key": "value"}' />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </div>

                        {/* 素材字段映射 */}
                        <div className="mb-6">
                            <div className="mb-3 flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-purple-500" />
                                <span className="text-sm font-medium text-gray-700">素材字段映射</span>
                                <span className="text-xs text-gray-400">（可选）</span>
                            </div>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name={["fieldMapping", "images"]} label="图片字段" help="留空默认 image_urls">
                                        <Input placeholder="image_urls" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name={["fieldMapping", "imagesType"]} label="图片数据类型" help="默认 array">
                                        <Select allowClear placeholder="array" options={[{ value: "array", label: "array（数组）" }, { value: "string", label: "string（字符串）" }]} />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name={["fieldMapping", "referenceVideos"]} label="视频参考字段" help="留空默认 reference_videos">
                                        <Input placeholder="reference_videos" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name={["fieldMapping", "referenceAudios"]} label="音频参考字段" help="留空默认 reference_audios">
                                        <Input placeholder="reference_audios" />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </div>

                        {/* App 端配置 */}
                        <div className="mb-6">
                            <div className="mb-3 flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-violet-500" />
                                <span className="text-sm font-medium text-gray-700">App 端配置</span>
                                <span className="text-xs text-gray-400">（控制 App 端模型选择器和参数面板）</span>
                            </div>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="mediaType" label="媒体类型" help="图片/视频/文本，决定 App 端使用哪种生成器">
                                        <Select allowClear placeholder="默认 image" options={[{ label: "图片 (image)", value: "image" }, { label: "视频 (video)", value: "video" }, { label: "文本 (chat)", value: "chat" }]} />
                                    </Form.Item>
                                </Col>
                                {channelMediaType !== "chat" && (
                                <Col span={8}>
                                    <Form.Item name="apiStyle" label="API 风格" help="App 端按此选择请求构造方式">
                                        <Select allowClear placeholder="默认 openai-compatible" options={[{ label: "OpenAI 兼容", value: "openai-compatible" }, { label: "Google Gemini", value: "google-gemini" }, { label: "通用 JSON", value: "generic-json" }]} />
                                    </Form.Item>
                                </Col>
                                )}
                                {channelMediaType !== "chat" && (
                                <Col span={8}>
                                    <Form.Item name="endpointPath" label="接口路径" help="如 /v1/images/generations、/v1/videos">
                                        <Input placeholder="留空使用默认值" />
                                    </Form.Item>
                                </Col>
                                )}
                                {channelMediaType === "image" && (
                                <Col span={8}>
                                    <Form.Item name="responseFormat" label="响应格式" help="App 端解析响应的方式">
                                        <Select allowClear placeholder="默认 openai-images" options={[{ label: "OpenAI Images", value: "openai-images" }, { label: "URL 数组", value: "url-array" }, { label: "Data URL", value: "data-url" }, { label: "通用", value: "generic" }]} />
                                    </Form.Item>
                                </Col>
                                )}
                                {channelMediaType === "video" && (
                                <Col span={8}>
                                    <Form.Item name="responseFormat" label="响应格式" help="App 端解析响应的方式">
                                        <Select allowClear placeholder="默认 url-array" options={[{ label: "URL 数组", value: "url-array" }, { label: "通用", value: "generic" }]} />
                                    </Form.Item>
                                </Col>
                                )}
                                {channelMediaType === "image" && (
                                <Col span={8}>
                                    <Form.Item name="supportedResolutions" label="支持的分辨率" help="逗号分隔，如 1024x1024,1k,2k,4k">
                                        <Input placeholder="如 auto,1024x1024,1k,2k,4k" />
                                    </Form.Item>
                                </Col>
                                )}
                                {channelMediaType !== "chat" && (
                                <Col span={8}>
                                    <Form.Item name="supportsWebSearch" label="支持联网搜索" valuePropName="checked">
                                        <Switch />
                                    </Form.Item>
                                </Col>
                                )}
                            </Row>
                        </div>

                        {/* 视频接口配置（仅 mediaType=video 时显示） */}
                        {channelMediaType === "video" && (
                        <div className="mb-6">
                            <div className="mb-3 flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-cyan-500" />
                                <span className="text-sm font-medium text-gray-700">视频接口配置</span>
                                <span className="text-xs text-gray-400">（仅 mediaType=video 时生效）</span>
                            </div>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name={["videoConfig", "path"]} label="视频接口路径" help="如 /v1/videos、/api/tasks">
                                        <Input placeholder="留空使用默认 /v1/videos" />
                                    </Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "requestBodyMode"]} label="请求体模式">
                                        <Select allowClear placeholder="默认 json" options={[{ label: "JSON", value: "json" }, { label: "Multipart", value: "multipart" }]} />
                                    </Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "requestFormat"]} label="请求格式">
                                        <Select allowClear placeholder="默认 Ark 格式" options={[{ label: "OpenAI 兼容", value: "openai" }, { label: "通用 JSON", value: "generic-json" }]} />
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <div className="mb-2 text-xs font-medium text-gray-500">任务管理</div>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "taskIdField"]} label="任务 ID 字段" help="如 id、task_id">
                                        <Input placeholder="自动检测" />
                                    </Form.Item>
                                </Col>
                                <Col span={10}>
                                    <Form.Item name={["videoConfig", "statusEndpointPath"]} label="状态轮询端点" help="如 /v1/videos/{taskId}">
                                        <Input placeholder="如 /v1/videos/{taskId}" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name={["videoConfig", "contentEndpointPath"]} label="内容端点" help="如 /v1/videos/{taskId}/content">
                                        <Input placeholder="可选" />
                                    </Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "statusMethod"]} label="状态查询方法">
                                        <Select allowClear placeholder="GET" options={[{ label: "GET", value: "GET" }, { label: "POST", value: "POST" }]} />
                                    </Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "statusField"]} label="状态字段路径" help="如 status、data.status">
                                        <Input placeholder="自动检测" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name={["videoConfig", "videoUrlPaths"]} label="视频 URL 路径" help="逗号分隔多个兜底路径">
                                        <Input placeholder="如 data.result_url,result_url,url" />
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <div className="mb-2 text-xs font-medium text-gray-500">状态值定义</div>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name={["videoConfig", "pendingValues"]} label="等待中" help="逗号分隔">
                                        <Input placeholder="queued,running,processing" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name={["videoConfig", "successValues"]} label="成功" help="逗号分隔">
                                        <Input placeholder="succeeded,completed,done" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name={["videoConfig", "failedValues"]} label="失败" help="逗号分隔">
                                        <Input placeholder="failed,error,canceled" />
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <div className="mb-2 text-xs font-medium text-gray-500">轮询控制</div>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name={["videoConfig", "pollIntervalMs"]} label="轮询间隔 (ms)" help="默认 5000">
                                        <Input type="number" placeholder="5000" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name={["videoConfig", "pollTimeoutMs"]} label="轮询超时 (ms)" help="默认 960000（16分钟）">
                                        <Input type="number" placeholder="960000" />
                                    </Form.Item>
                                </Col>
                                <Col span={24}>
                                    <div className="mb-2 text-xs font-medium text-gray-500">请求体字段映射</div>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "modelField"]} label="模型字段"><Input placeholder="model" /></Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "promptField"]} label="提示词字段"><Input placeholder="prompt" /></Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "sizeField"]} label="尺寸字段"><Input placeholder="size" /></Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "secondsField"]} label="时长字段"><Input placeholder="seconds" /></Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "aspectRatioField"]} label="比例字段"><Input placeholder="aspect_ratio" /></Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "referenceImagesField"]} label="参考图字段"><Input placeholder="images" /></Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "firstFrameField"]} label="首帧字段"><Input placeholder="可选" /></Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "lastFrameField"]} label="尾帧字段"><Input placeholder="可选" /></Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name={["videoConfig", "videoDownloadField"]} label="视频下载字段路径" help="从轮询响应中提取可下载视频URL的字段路径，如 data.video_file.url">
                                        <Input placeholder="留空使用默认 videoUrlPaths" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name={["videoConfig", "videoProgressField"]} label="进度字段路径" help="从轮询响应中提取生成进度的字段路径，如 progress、data.progress">
                                        <Input placeholder="如 progress" />
                                    </Form.Item>
                                </Col>
                                <Col span={6}>
                                    <Form.Item name={["videoConfig", "secondsAsString"]} label="时长为字符串" valuePropName="checked" help="上游要求seconds字段为字符串类型">
                                        <Switch />
                                    </Form.Item>
                                </Col>
                            </Row>

                            {/* 输入素材 Schema 配置 */}
                            <div className="mb-6 mt-4">
                                <div className="mb-3 flex items-center gap-2">
                                    <div className="h-1 w-1 rounded-full bg-purple-500" />
                                    <span className="text-sm font-medium text-gray-700">输入素材 Schema</span>
                                    <span className="text-xs text-gray-400">（控制 App 端素材输入行为）</span>
                                </div>
                                <Row gutter={16}>
                                    <Col span={24}>
                                        <div className="mb-2 text-xs font-medium text-gray-500">图片输入</div>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name={["videoConfig", "imageInput", "enabled"]} label="启用图片输入" valuePropName="checked">
                                            <Switch />
                                        </Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name={["videoConfig", "imageInput", "min"]} label="最少数量"><Input type="number" placeholder="0" /></Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name={["videoConfig", "imageInput", "max"]} label="最多数量"><Input type="number" placeholder="1" /></Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name={["videoConfig", "imageInput", "roles"]} label="角色" help="逗号分隔：reference,firstFrame,lastFrame,keyframe">
                                            <Input placeholder="reference" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name={["videoConfig", "imageInput", "requireImageHost"]} label="需要图床 URL" valuePropName="checked" help="关闭则支持 base64 图片">
                                            <Switch />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Row gutter={16}>
                                    <Col span={24}>
                                        <div className="mb-2 text-xs font-medium text-gray-500">视频输入</div>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name={["videoConfig", "videoInput", "enabled"]} label="启用视频输入" valuePropName="checked">
                                            <Switch />
                                        </Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name={["videoConfig", "videoInput", "min"]} label="最少数量"><Input type="number" placeholder="0" /></Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name={["videoConfig", "videoInput", "max"]} label="最多数量"><Input type="number" placeholder="0" /></Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name={["videoConfig", "videoInput", "field"]} label="字段名"><Input placeholder="videos" /></Form.Item>
                                    </Col>
                                </Row>
                                <Row gutter={16}>
                                    <Col span={24}>
                                        <div className="mb-2 text-xs font-medium text-gray-500">音频输入</div>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name={["videoConfig", "audioInput", "enabled"]} label="启用音频输入" valuePropName="checked">
                                            <Switch />
                                        </Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name={["videoConfig", "audioInput", "min"]} label="最少数量"><Input type="number" placeholder="0" /></Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name={["videoConfig", "audioInput", "max"]} label="最多数量"><Input type="number" placeholder="0" /></Form.Item>
                                    </Col>
                                    <Col span={6}>
                                        <Form.Item name={["videoConfig", "audioInput", "field"]} label="字段名"><Input placeholder="audios" /></Form.Item>
                                    </Col>
                                </Row>
                            </div>
                        </div>
                        )}

                        {/* 图片接口配置（仅 mediaType=image 时显示） */}
                        {channelMediaType === "image" && (
                        <div className="mb-6">
                            <div className="mb-3 flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-green-500" />
                                <span className="text-sm font-medium text-gray-700">图片接口配置</span>
                                <span className="text-xs text-gray-400">（仅 mediaType=image 时生效）</span>
                            </div>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="imageFormat" label="图片格式" help="base64 或 url">
                                        <Select allowClear placeholder="默认 base64" options={[{ label: "Base64", value: "base64" }, { label: "URL", value: "url" }]} />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="supportedModelVersions" label="支持的模型版本" help="逗号分隔">
                                        <Input placeholder="如 4.0,5.0" />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </div>
                        )}

                        {/* 文本/对话接口配置（仅 mediaType=chat 时显示） */}
                        {channelMediaType === "chat" && (
                        <div className="mb-6">
                            <div className="mb-3 flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-blue-500" />
                                <span className="text-sm font-medium text-gray-700">文本/对话接口配置</span>
                                <span className="text-xs text-gray-400">（仅 mediaType=chat 时生效）</span>
                            </div>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="apiStyle" label="API 风格" help="对话接口协议">
                                        <Select allowClear placeholder="默认 openai-compatible" options={[{ label: "OpenAI 兼容", value: "openai-compatible" }, { label: "Anthropic", value: "anthropic" }, { label: "Google Gemini", value: "google-gemini" }, { label: "通用 JSON", value: "generic-json" }]} />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="endpointPath" label="接口路径" help="如 /v1/chat/completions、/v1/messages">
                                        <Input placeholder="留空使用默认值" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="supportsWebSearch" label="支持联网搜索" valuePropName="checked">
                                        <Switch />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </div>
                        )}

                        {/* 备注 */}
                        <div className="mb-2">
                            <div className="mb-3 flex items-center gap-2">
                                <div className="h-1 w-1 rounded-full bg-gray-400" />
                                <span className="text-sm font-medium text-gray-700">备注</span>
                            </div>
                            <Form.Item name="remark">
                                <Input.TextArea rows={3} placeholder="备注信息，仅管理员可见" />
                            </Form.Item>
                        </div>
                    </Form>
                </Drawer>
                <Modal
                    title={
                        <Space size={12}>
                            选择渠道模型
                            <Typography.Text type="secondary">
                                已选择 {modelSelectSelected.length} / {uniqueModels([...modelSelectSource, ...modelSelectExisting]).length}
                            </Typography.Text>
                        </Space>
                    }
                    open={isModelSelectorOpen}
                    width={960}
                    onCancel={closeChannelModelSelector}
                    footer={
                        <Space>
                            <Button onClick={closeChannelModelSelector}>取消</Button>
                            <Button type="primary" onClick={confirmChannelModelSelector}>
                                确定
                            </Button>
                        </Space>
                    }
                    destroyOnHidden
                >
                    <Flex vertical gap={14}>
                        <Flex gap={12} wrap>
                            <Input.Search placeholder="搜索模型" allowClear value={modelSelectKeyword} onChange={(event) => setModelSelectKeyword(event.target.value)} style={{ flex: "1 1 260px" }} />
                            <Space.Compact style={{ flex: "1 1 320px" }}>
                                <Input value={modelSelectNewModel} placeholder="输入模型名称" onChange={(event) => setModelSelectNewModel(event.target.value)} onPressEnter={addModelInSelector} />
                                <Button onClick={addModelInSelector}>增加模型</Button>
                                <Button icon={<ReloadOutlined />} loading={isFetchingChannelModels} onClick={() => void fetchChannelModelList()}>
                                    拉取模型列表
                                </Button>
                            </Space.Compact>
                        </Flex>
                        <Typography.Text type="secondary">如果上游不提供 OpenAI /models 模型列表接口，请在这里手动增加模型名称。</Typography.Text>
                        <Tabs
                            activeKey={modelSelectTab}
                            onChange={(key) => setModelSelectTab(key as ModelSelectTabKey)}
                            items={[
                                { key: "new", label: `新获取的模型 (${modelSelectGroups.new.length})` },
                                { key: "current", label: `已有的模型 (${modelSelectGroups.current.length})` },
                            ]}
                        />
                        <Flex justify="space-between" align="center" gap={12} wrap>
                            <Typography.Text type="secondary">
                                当前列表已选择 {activeSelectedCount} / {activeModelSelectModels.length}
                            </Typography.Text>
                            <Space size={8}>
                                <Button size="small" disabled={!activeModelSelectModels.length || activeSelectedCount === activeModelSelectModels.length} onClick={selectActiveModels}>
                                    全选当前列表
                                </Button>
                                <Button size="small" disabled={!activeSelectedCount} onClick={clearActiveModels}>
                                    取消当前列表
                                </Button>
                            </Space>
                        </Flex>
                        <div style={{ maxHeight: 420, overflowY: "auto", borderTop: "1px solid var(--ant-color-border-secondary)", paddingTop: 12 }}>
                            {activeModelSelectModels.length ? (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 24, rowGap: 12 }}>
                                    {activeModelSelectModels.map((model) => (
                                        <Checkbox key={model} checked={modelSelectSelected.includes(model)} onChange={(event) => toggleSelectedModel(model, event.target.checked)}>
                                            <Typography.Text style={{ wordBreak: "break-all" }}>{model}</Typography.Text>
                                        </Checkbox>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ padding: "48px 0", textAlign: "center" }}>
                                    <Typography.Text type="secondary">没有匹配的模型</Typography.Text>
                                </div>
                            )}
                        </div>
                    </Flex>
                </Modal>
                <Modal
                    title={
                        <Space>
                            {testChannel?.name || "渠道"} 渠道的模型测试<Typography.Text type="secondary">共 {testChannel?.models.length || 0} 个模型</Typography.Text>
                        </Space>
                    }
                    open={testChannelIndex !== null}
                    width={920}
                    onCancel={closeTestDialog}
                    footer={
                        <Space>
                            <Button onClick={closeTestDialog}>取消</Button>
                            <Button type="primary" disabled={!selectedTestModels.length || testingModels.length > 0} onClick={() => void batchTestModels()}>
                                批量测试 {selectedTestModels.length} 个模型
                            </Button>
                        </Space>
                    }
                    destroyOnHidden
                >
                    <Flex vertical gap={12}>
                        <Typography.Text type="secondary">普通文本模型会发送一条 hi；Agent Plan / Seedance 视频模型只做配置格式检查，不会发起视频生成，也不代表模型权限已验证。</Typography.Text>
                        <Input.Search placeholder="搜索模型..." allowClear value={testKeyword} onChange={(event) => setTestKeyword(event.target.value)} />
                        <Table
                            rowKey="model"
                            pagination={false}
                            scroll={{ y: 420 }}
                            dataSource={testModels.map((model: string) => ({ model }))}
                            rowSelection={{
                                selectedRowKeys: selectedTestModels,
                                onChange: (keys) => setSelectedTestModels(keys.map(String)),
                            }}
                            columns={[
                                { title: "模型名称", dataIndex: "model", render: (value) => <Typography.Text strong>{value}</Typography.Text> },
                                {
                                    title: "状态",
                                    dataIndex: "model",
                                    width: 260,
                                    render: (value) => {
                                        if (testingModels.includes(value)) return <Tag icon={<LoadingOutlined className="animate-spin" />}>测试中</Tag>;
                                        const result = testResults[value];
                                        if (!result) return <Tag>未开始</Tag>;
                                        return result.status === "success" ? (
                                            <Space size={6} wrap>
                                                <Tag color="success">成功</Tag>
                                                <Typography.Text type="secondary">请求时长: {result.duration}</Typography.Text>
                                            </Space>
                                        ) : (
                                            <Typography.Text type="danger">{result.message}</Typography.Text>
                                        );
                                    },
                                },
                                {
                                    title: "操作",
                                    key: "actions",
                                    width: 120,
                                    align: "right",
                                    render: (_: unknown, item: { model: string }) => (
                                        <Button size="small" loading={testingModels.includes(item.model)} onClick={() => void testModelOnline(item.model)}>
                                            测试
                                        </Button>
                                    ),
                                },
                            ]}
                        />
                    </Flex>
                </Modal>
            </Flex>
            </div>
        </div>
    );
}

function normalizeSettings(settings: Partial<AdminSettings> = {}): AdminSettings {
    const privateSetting = normalizePrivateSetting(settings.private);
    return {
        public: {
            ...normalizePublicSetting(settings.public),
        },
        private: privateSetting,
    };
}

function normalizePublicSetting(setting: Partial<AdminSettings["public"]> = {}): AdminSettings["public"] {
    return {
        ...emptySettings.public,
        modelChannel: {
            ...emptySettings.public.modelChannel,
            ...(setting.modelChannel || {}),
            availableModels: setting.modelChannel?.availableModels || [],
            modelCosts: normalizeModelCosts(setting.modelChannel?.modelCosts || []),
        },
        auth: {
            allowRegister: setting.auth?.allowRegister !== false,
            linuxDo: {
                enabled: setting.auth?.linuxDo?.enabled === true,
            },
        },
    };
}

function normalizeModelCosts(items: Partial<AdminSettings["public"]["modelChannel"]["modelCosts"][number]>[]) {
    return items.filter((item) => item.model).map((item) => ({ model: item.model || "", credits: Math.max(0, Number(item.credits) || 0), alias: item.alias || "" }));
}

function normalizePrivateSetting(setting: Partial<AdminSettings["private"]> = {}): AdminSettings["private"] {
    return {
        channels: (setting.channels || []) as AdminModelChannel[],
        promptSync: {
            enabled: setting.promptSync?.enabled !== false,
            cron: setting.promptSync?.cron || "*/5 * * * *",
        },
        auth: {
            linuxDo: {
                clientId: setting.auth?.linuxDo?.clientId || "",
                clientSecret: setting.auth?.linuxDo?.clientSecret || "",
            },
        },
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeChannelForForm(item: Partial<AdminModelChannel> = {}): any {
    const videoConfig = item.videoConfig ? {
        ...item.videoConfig,
        videoUrlPaths: Array.isArray(item.videoConfig.videoUrlPaths) ? item.videoConfig.videoUrlPaths.join(",") : item.videoConfig.videoUrlPaths,
        pendingValues: Array.isArray(item.videoConfig.pendingValues) ? item.videoConfig.pendingValues.join(",") : item.videoConfig.pendingValues,
        successValues: Array.isArray(item.videoConfig.successValues) ? item.videoConfig.successValues.join(",") : item.videoConfig.successValues,
        failedValues: Array.isArray(item.videoConfig.failedValues) ? item.videoConfig.failedValues.join(",") : item.videoConfig.failedValues,
        videoDownloadField: item.videoConfig.videoDownloadField || "",
        videoProgressField: item.videoConfig.videoProgressField || "",
        secondsAsString: item.videoConfig.secondsAsString ?? false,
        pollIntervalMs: item.videoConfig.pollIntervalMs != null ? String(item.videoConfig.pollIntervalMs) : undefined,
        pollTimeoutMs: item.videoConfig.pollTimeoutMs != null ? String(item.videoConfig.pollTimeoutMs) : undefined,
        imageInput: item.videoConfig.imageInput ? {
            enabled: item.videoConfig.imageInput.enabled ?? false,
            min: item.videoConfig.imageInput.min ?? 0,
            max: item.videoConfig.imageInput.max ?? 1,
            roles: Array.isArray(item.videoConfig.imageInput.roles) ? item.videoConfig.imageInput.roles.join(",") : (item.videoConfig.imageInput.roles || ""),
            requireImageHost: item.videoConfig.imageInput.requireImageHost ?? false,
        } : undefined,
        videoInput: item.videoConfig.videoInput ? {
            enabled: item.videoConfig.videoInput.enabled ?? false,
            min: item.videoConfig.videoInput.min ?? 0,
            max: item.videoConfig.videoInput.max ?? 0,
            field: item.videoConfig.videoInput.field || "",
        } : undefined,
        audioInput: item.videoConfig.audioInput ? {
            enabled: item.videoConfig.audioInput.enabled ?? false,
            min: item.videoConfig.audioInput.min ?? 0,
            max: item.videoConfig.audioInput.max ?? 0,
            field: item.videoConfig.audioInput.field || "",
        } : undefined,
    } : undefined;
    return {
        protocol: "openai",
        name: item.name || "",
        baseUrl: item.baseUrl || "",
        apiKey: item.apiKey || "",
        models: item.models || [],
        weight: Math.max(1, Number(item.weight) || 1),
        enabled: item.enabled !== false,
        remark: item.remark || "",
        videoConfig,
        supportedResolutions: Array.isArray(item.supportedResolutions) ? item.supportedResolutions.join(",") : item.supportedResolutions,
        fieldMapping: item.fieldMapping,
        imageFormat: item.imageFormat || "",
        mediaType: item.mediaType || "image",
        apiStyle: item.apiStyle || "",
        endpointPath: item.endpointPath || "",
        responseFormat: item.responseFormat || "",
        supportsWebSearch: item.supportsWebSearch || false,
    };
}

function normalizeChannelFromForm(values: any): AdminModelChannel {
    const videoConfig = values.videoConfig ? {
        ...values.videoConfig,
        videoUrlPaths: typeof values.videoConfig.videoUrlPaths === 'string' ? values.videoConfig.videoUrlPaths.split(',').map((s: string) => s.trim()).filter(Boolean) : values.videoConfig.videoUrlPaths,
        pendingValues: typeof values.videoConfig.pendingValues === 'string' ? values.videoConfig.pendingValues.split(',').map((s: string) => s.trim()).filter(Boolean) : values.videoConfig.pendingValues,
        successValues: typeof values.videoConfig.successValues === 'string' ? values.videoConfig.successValues.split(',').map((s: string) => s.trim()).filter(Boolean) : values.videoConfig.successValues,
        failedValues: typeof values.videoConfig.failedValues === 'string' ? values.videoConfig.failedValues.split(',').map((s: string) => s.trim()).filter(Boolean) : values.videoConfig.failedValues,
        videoDownloadField: values.videoConfig.videoDownloadField || undefined,
        videoProgressField: values.videoConfig.videoProgressField || undefined,
        secondsAsString: values.videoConfig.secondsAsString === true,
        pollIntervalMs: values.videoConfig.pollIntervalMs != null && values.videoConfig.pollIntervalMs !== '' ? Number(values.videoConfig.pollIntervalMs) : undefined,
        pollTimeoutMs: values.videoConfig.pollTimeoutMs != null && values.videoConfig.pollTimeoutMs !== '' ? Number(values.videoConfig.pollTimeoutMs) : undefined,
        imageInput: values.videoConfig.imageInput ? {
            enabled: values.videoConfig.imageInput.enabled === true,
            min: values.videoConfig.imageInput.min != null && values.videoConfig.imageInput.min !== '' ? Number(values.videoConfig.imageInput.min) : 0,
            max: values.videoConfig.imageInput.max != null && values.videoConfig.imageInput.max !== '' ? Number(values.videoConfig.imageInput.max) : 1,
            roles: typeof values.videoConfig.imageInput.roles === 'string' ? values.videoConfig.imageInput.roles.split(',').map((s: string) => s.trim()).filter(Boolean) : values.videoConfig.imageInput.roles,
            requireImageHost: values.videoConfig.imageInput.requireImageHost === true,
        } : undefined,
        videoInput: values.videoConfig.videoInput ? {
            enabled: values.videoConfig.videoInput.enabled === true,
            min: values.videoConfig.videoInput.min != null && values.videoConfig.videoInput.min !== '' ? Number(values.videoConfig.videoInput.min) : 0,
            max: values.videoConfig.videoInput.max != null && values.videoConfig.videoInput.max !== '' ? Number(values.videoConfig.videoInput.max) : 0,
            field: values.videoConfig.videoInput.field || undefined,
        } : undefined,
        audioInput: values.videoConfig.audioInput ? {
            enabled: values.videoConfig.audioInput.enabled === true,
            min: values.videoConfig.audioInput.min != null && values.videoConfig.audioInput.min !== '' ? Number(values.videoConfig.audioInput.min) : 0,
            max: values.videoConfig.audioInput.max != null && values.videoConfig.audioInput.max !== '' ? Number(values.videoConfig.audioInput.max) : 0,
            field: values.videoConfig.audioInput.field || undefined,
        } : undefined,
    } : undefined;
    return {
        protocol: "openai",
        name: values.name || "",
        baseUrl: values.baseUrl || "",
        apiKey: values.apiKey || "",
        models: values.models || [],
        weight: Math.max(1, Number(values.weight) || 1),
        enabled: values.enabled !== false,
        remark: values.remark || "",
        videoConfig,
        supportedResolutions: typeof values.supportedResolutions === 'string' ? values.supportedResolutions.split(',').map((s: string) => s.trim()).filter(Boolean) : values.supportedResolutions,
        fieldMapping: values.fieldMapping,
        imageFormat: values.imageFormat || undefined,
        mediaType: values.mediaType || undefined,
        apiStyle: values.apiStyle || undefined,
        endpointPath: values.endpointPath || undefined,
        responseFormat: values.responseFormat || undefined,
        supportsWebSearch: values.supportsWebSearch || false,
    };
}

function modelCostCredits(items: AdminSettings["public"]["modelChannel"]["modelCosts"], model: string) {
    return items.find((item) => item.model === model)?.credits || 0;
}

function setModelCost(form: any, setModelCosts: (items: AdminModelCost[]) => void, model: string, credits: number, alias?: string) {
    const current = (form.getFieldValue(["public", "modelChannel", "modelCosts"]) || []) as AdminSettings["public"]["modelChannel"]["modelCosts"];
    const existing = current.find((item) => item.model === model);
    const next = current.filter((item) => item.model !== model);
    next.push({ model, credits: Math.max(0, credits), alias: alias !== undefined ? alias : (existing?.alias || "") });
    form.setFieldValue(["public", "modelChannel", "modelCosts"], next);
    setModelCosts(next);
}

function mergeChannelApiKeys(currentChannels: AdminModelChannel[], saved: AdminSettings): AdminSettings {
    const channels = saved.private.channels.map((item, index) => ({
        ...item,
        apiKey: currentChannels[index]?.apiKey || item.apiKey,
    }));
    return {
        public: saved.public,
        private: { ...saved.private, channels },
    };
}

function collectChannelModels(channels: AdminModelChannel[]) {
    return uniqueModels(channels.filter((channel) => channel.enabled).flatMap((channel) => channel.models || []));
}

function collectKnownModels(settings: AdminSettings) {
    return uniqueModels([
        ...(settings.public.modelChannel.availableModels || []),
        ...(settings.public.modelChannel.modelCosts || []).map((item) => item.model),
        ...settings.private.channels.flatMap((channel) => channel.models || []),
    ]);
}

function buildModelSelectGroups(sourceModels: string[], existingModels: string[]): Record<ModelSelectTabKey, string[]> {
    const source = uniqueModels(sourceModels);
    const existing = uniqueModels(existingModels);
    const existingSet = new Set(existing);
    return {
        new: source.filter((model) => !existingSet.has(model)),
        current: existing,
    };
}

function uniqueModels(models: string[]) {
    return Array.from(new Set(models.filter(Boolean)));
}

function modelSummary(models: string[]) {
    if (!models.length) return "未配置模型";
    const preview = models.slice(0, 3).join(", ");
    return models.length > 3 ? `${models.length} 个模型：${preview}...` : preview;
}

function parseTabJson(tab: "public", value: string): AdminSettings["public"] | null;
function parseTabJson(tab: "private", value: string): AdminSettings["private"] | null;
function parseTabJson(tab: SettingsTabKey, value: string): AdminSettings[SettingsTabKey] | null;
function parseTabJson(tab: SettingsTabKey, value: string): AdminSettings[SettingsTabKey] | null {
    try {
        return tab === "public" ? normalizePublicSetting(JSON.parse(value) as Partial<AdminSettings["public"]>) : normalizePrivateSetting(JSON.parse(value) as Partial<AdminSettings["private"]>);
    } catch {
        return null;
    }
}

async function collectSettings(form: any, editorMode: Record<SettingsTabKey, EditorMode>, jsonText: Record<SettingsTabKey, string>, message: { error: (value: string) => void }) {
    const values = normalizeSettings(form.getFieldsValue(true) as AdminSettings);
    if (editorMode.public === "json") {
        const publicSetting = parseTabJson("public", jsonText.public);
        if (!publicSetting) {
            message.error("公开配置 JSON 格式不正确");
            return null;
        }
        values.public = publicSetting;
    }
    if (editorMode.private === "json") {
        const privateSetting = parseTabJson("private", jsonText.private);
        if (!privateSetting) {
            message.error("私有配置 JSON 格式不正确");
            return null;
        }
        values.private = privateSetting;
    }
    values.public.modelChannel.availableModels = collectChannelModels(values.private.channels);
    return normalizeSettings(values);
}

function getJsonError(value: string) {
    try {
        JSON.parse(value);
        return "";
    } catch (error) {
        return error instanceof Error ? error.message : "JSON 格式不正确";
    }
}
