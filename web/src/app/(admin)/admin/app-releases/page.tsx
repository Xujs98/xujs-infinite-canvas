"use client";

import { AppleFilled, CloudUploadOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, WindowsFilled } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { App, Button, Card, Col, Empty, Form, Input, Modal, Popconfirm, Progress, Row, Select, Space, Switch, Tag, Tooltip, Typography, Upload } from "antd";
import type { UploadProps } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
    createAdminAppRelease,
    deleteAdminAppRelease,
    deleteAdminAppReleaseArtifact,
    fetchAdminAppReleases,
    type AppRelease,
    type AppReleaseArch,
    type AppReleaseArtifact,
    type AppReleasePlatform,
    updateAdminAppRelease,
    uploadAdminAppReleaseArtifact,
} from "@/services/api/app-releases";
import { useUserStore } from "@/stores/use-user-store";

const artifactSlots: Array<{ platform: AppReleasePlatform; arch: AppReleaseArch; title: string; hint: string; accept: string }> = [
    { platform: "windows", arch: "x64", title: "Windows", hint: "x64 · EXE / MSI / ZIP", accept: ".exe,.msi,.zip" },
    { platform: "windows", arch: "arm64", title: "Windows", hint: "ARM64 · EXE / MSI / ZIP", accept: ".exe,.msi,.zip" },
    { platform: "macos", arch: "arm64", title: "macOS", hint: "Apple 芯片 · DMG / PKG / ZIP", accept: ".dmg,.pkg,.zip" },
    { platform: "macos", arch: "x64", title: "macOS", hint: "Intel 芯片 · DMG / PKG / ZIP", accept: ".dmg,.pkg,.zip" },
    { platform: "macos", arch: "universal", title: "macOS", hint: "通用版 · DMG / PKG / ZIP", accept: ".dmg,.pkg,.zip" },
];

type UploadRequestOption = Parameters<NonNullable<UploadProps["customRequest"]>>[0];

function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function artifactKey(item: Pick<AppReleaseArtifact, "platform" | "arch">) {
    return `${item.platform}:${item.arch}`;
}

export default function AdminAppReleasesPage() {
    const { message } = App.useApp();
    const token = useUserStore((state) => state.token);
    const [form] = Form.useForm();
    const [items, setItems] = useState<AppRelease[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [queryKeyword, setQueryKeyword] = useState("");
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState<AppRelease | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [packageRelease, setPackageRelease] = useState<AppRelease | null>(null);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await fetchAdminAppReleases(token, { keyword: queryKeyword, status, page, pageSize: 20 });
            setItems(result.items || []);
            setTotal(result.total || 0);
            setPackageRelease((current) => current ? result.items.find((item) => item.id === current.id) || current : null);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "版本列表加载失败");
        } finally {
            setLoading(false);
        }
    }, [message, page, queryKeyword, status, token]);

    useEffect(() => void load(), [load]);

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ version: "", title: "", notes: "", forceUpdate: false, status: "draft" });
        setFormOpen(true);
    };

    const openEdit = (item: AppRelease) => {
        setEditing(item);
        form.setFieldsValue(item);
        setFormOpen(true);
    };

    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            if (editing) await updateAdminAppRelease(token, editing.id, values);
            else await createAdminAppRelease(token, values);
            message.success(editing ? "版本信息已更新" : "版本草稿已创建，请继续上传安装包");
            setFormOpen(false);
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const uploadArtifact = async (slot: (typeof artifactSlots)[number], options: UploadRequestOption) => {
        if (!packageRelease) return;
        const key = `${packageRelease.id}:${slot.platform}:${slot.arch}`;
        try {
            const artifact = await uploadAdminAppReleaseArtifact(token, packageRelease.id, options.file as File, slot.platform, slot.arch, (percent) => {
                setUploadProgress((current) => ({ ...current, [key]: percent }));
                options.onProgress?.({ percent });
            });
            setPackageRelease((current) => current ? { ...current, artifacts: [...current.artifacts.filter((item) => artifactKey(item) !== artifactKey(artifact)), artifact] } : current);
            options.onSuccess?.(artifact);
            message.success(`${slot.title} ${slot.hint.split(" · ")[0]} 安装包已上传`);
            await load();
        } catch (error) {
            options.onError?.(error as Error);
            message.error(error instanceof Error ? error.message : "安装包上传失败");
        } finally {
            setUploadProgress((current) => {
                const next = { ...current };
                delete next[key];
                return next;
            });
        }
    };

    const removeArtifact = async (artifact: AppReleaseArtifact) => {
        try {
            await deleteAdminAppReleaseArtifact(token, artifact.id);
            setPackageRelease((current) => current ? { ...current, artifacts: current.artifacts.filter((item) => item.id !== artifact.id) } : current);
            message.success("安装包已删除");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除失败");
        }
    };

    const removeRelease = async (item: AppRelease) => {
        try {
            await deleteAdminAppRelease(token, item.id);
            message.success("版本已删除");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除失败");
        }
    };

    const artifactCount = useMemo(() => items.reduce((sum, item) => sum + item.artifacts.length, 0), [items]);
    const publishedCount = useMemo(() => items.filter((item) => item.status === "published").length, [items]);

    const columns: ProColumns<AppRelease>[] = [
        {
            title: "版本",
            width: 260,
            render: (_: unknown, item: AppRelease) => (
                <div>
                    <Space size={[8, 4]} wrap>
                        <Typography.Text strong>v{item.version}</Typography.Text>
                        <Tag color={item.status === "published" ? "green" : "default"}>{item.status === "published" ? "已发布" : "草稿"}</Tag>
                        {item.forceUpdate ? <Tag color="red">强制更新</Tag> : null}
                    </Space>
                    <Typography.Text type="secondary" ellipsis={{ tooltip: item.title }} style={{ display: "block", maxWidth: 230, fontSize: 12 }}>{item.title}</Typography.Text>
                </div>
            ),
        },
        {
            title: "安装包",
            width: 260,
            render: (_: unknown, item: AppRelease) => item.artifacts.length ? (
                <Space size={[4, 4]} wrap>{item.artifacts.map((artifact) => <Tag key={artifact.id}>{artifact.platform === "windows" ? "Windows" : "macOS"} · {artifact.arch}</Tag>)}</Space>
            ) : <Typography.Text type="secondary">尚未上传</Typography.Text>,
        },
        { title: "更新说明", dataIndex: "notes", ellipsis: true, render: (_: unknown, item: AppRelease) => item.notes || <Typography.Text type="secondary">-</Typography.Text> },
        { title: "发布时间", dataIndex: "publishedAt", width: 180, render: (_: unknown, item: AppRelease) => item.publishedAt ? new Date(item.publishedAt).toLocaleString("zh-CN") : "-" },
        {
            title: "操作",
            width: 140,
            align: "right",
            fixed: "right" as const,
            render: (_: unknown, item: AppRelease) => (
                <Space size={4}>
                    <Tooltip title="管理安装包"><Button type="text" size="small" icon={<CloudUploadOutlined />} onClick={() => setPackageRelease(item)} aria-label="管理安装包" /></Tooltip>
                    <Tooltip title="编辑版本"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(item)} aria-label="编辑版本" /></Tooltip>
                    <Popconfirm title="删除这个客户端版本？" description="版本记录和已上传安装包将同时删除。" onConfirm={() => void removeRelease(item)}>
                        <Tooltip title="删除版本"><Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="删除版本" /></Tooltip>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="admin-data-page admin-release-page">
            <Card className="admin-filter-card" variant="borderless">
                <Form layout="vertical">
                    <Row gutter={[16, 12]} align="bottom">
                        <Col xs={24} md={14} xl={10}>
                            <Form.Item label="关键词">
                                <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} onPressEnter={() => { setPage(1); setQueryKeyword(keyword.trim()); }} allowClear placeholder="搜索版本号、标题或更新说明" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} md={5} xl={4}>
                            <Form.Item label="状态">
                                <Select className="admin-release-filter-select" popupClassName="admin-release-select-popup" value={status || undefined} allowClear placeholder="全部" onChange={(value) => { setStatus(value || ""); setPage(1); }} options={[{ value: "draft", label: "草稿" }, { value: "published", label: "已发布" }]} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} md={5} xl={5}>
                            <Form.Item>
                                <Space wrap>
                                    <Button className="admin-release-reset-button" icon={<ReloadOutlined />} onClick={() => { setKeyword(""); setQueryKeyword(""); setStatus(""); setPage(1); }}>重置</Button>
                                    <Button type="primary" icon={<SearchOutlined />} onClick={() => { setPage(1); setQueryKeyword(keyword.trim()); }}>查询</Button>
                                </Space>
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Card>

            <ProTable<AppRelease>
                rowKey="id"
                columns={columns}
                dataSource={items}
                loading={loading}
                search={false}
                defaultSize="middle"
                tableLayout="fixed"
                cardProps={{ variant: "borderless" }}
                scroll={{ x: 860 }}
                headerTitle={
                    <Space size={[8, 8]} wrap>
                        <Typography.Text strong>客户端版本</Typography.Text>
                        <Tag>{total} 个版本</Tag>
                        <Tag color="green">当前页 {publishedCount} 个已发布</Tag>
                        <Tag color="blue">{artifactCount} 个安装包</Tag>
                    </Space>
                }
                options={{ density: true, setting: true, reload: () => void load() }}
                toolBarRender={() => [
                    <Button key="new" type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建版本</Button>,
                ]}
                locale={{
                    emptyText: (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span>还没有客户端版本</span>}>
                            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建首个版本</Button>
                        </Empty>
                    ),
                }}
                pagination={{ current: page, pageSize: 20, total, showSizeChanger: false, showTotal: (value) => `共 ${value} 个版本`, onChange: setPage }}
            />

            <Modal rootClassName="admin-release-modal" title={editing ? `编辑 v${editing.version}` : "新建客户端版本"} open={formOpen} onCancel={() => setFormOpen(false)} onOk={() => void save()} confirmLoading={saving} okText={editing ? "保存" : "创建草稿"} width={620} destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Row gutter={14}>
                        <Col xs={24} sm={10}><Form.Item name="version" label="版本号" rules={[{ required: true, message: "请输入版本号" }, { pattern: /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, message: "例如 0.2.0 或 0.2.0-beta.1" }]}><Input placeholder="0.2.0" /></Form.Item></Col>
                        <Col xs={24} sm={14}><Form.Item name="title" label="版本标题"><Input placeholder="矩龙画布 0.2.0" /></Form.Item></Col>
                    </Row>
                    {editing ? <Form.Item name="status" label="发布状态" rules={[{ required: true }]}><Select options={[{ value: "draft", label: "草稿" }, { value: "published", label: "已发布" }]} /></Form.Item> : null}
                    <Form.Item label="更新策略">
                        <div className="flex items-center justify-between gap-4 rounded-md border border-slate-200 px-4 py-3 dark:border-slate-700">
                            <div>
                                <Typography.Text strong>强制更新</Typography.Text>
                                <Typography.Text type="secondary" style={{ display: "block", marginTop: 2, fontSize: 12 }}>
                                    开启并发布后，旧版客户端必须完成更新才能继续使用。
                                </Typography.Text>
                            </div>
                            <Form.Item name="forceUpdate" valuePropName="checked" noStyle>
                                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                            </Form.Item>
                        </div>
                    </Form.Item>
                    <Form.Item name="notes" label="更新说明"><Input.TextArea rows={7} maxLength={5000} showCount placeholder="逐行填写本次新增、优化和修复内容" /></Form.Item>
                    {editing?.status === "draft" ? <Typography.Text type="secondary">发布前请先在“安装包”中至少上传一个平台文件。</Typography.Text> : null}
                </Form>
            </Modal>

            <Modal rootClassName="admin-release-modal admin-release-package-modal" title={packageRelease ? `v${packageRelease.version} 安装包` : "安装包"} open={Boolean(packageRelease)} footer={null} width={760} onCancel={() => setPackageRelease(null)} destroyOnHidden>
                <div className="space-y-3">
                    <div className="admin-release-package-summary flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
                        <div><Typography.Text strong>多平台发布文件</Typography.Text><Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>上传后可继续替换；发布版本前至少需要一个安装包。</Typography.Text></div>
                        <Tag color={packageRelease?.status === "published" ? "green" : "default"}>{packageRelease?.status === "published" ? "已发布" : "草稿"} · {packageRelease?.artifacts.length || 0} 个文件</Tag>
                    </div>
                    {artifactSlots.map((slot) => {
                        const artifact = packageRelease?.artifacts.find((item) => item.platform === slot.platform && item.arch === slot.arch);
                        const key = packageRelease ? `${packageRelease.id}:${slot.platform}:${slot.arch}` : "";
                        const progress = uploadProgress[key];
                        return (
                            <div key={`${slot.platform}:${slot.arch}`} className="admin-release-package-row flex min-h-20 items-center gap-3 rounded-md border px-4 py-3">
                                <span className="admin-release-platform-icon grid size-10 shrink-0 place-items-center rounded-md text-lg">{slot.platform === "windows" ? <WindowsFilled /> : <AppleFilled />}</span>
                                <div className="min-w-0 flex-1">
                                    <Space size={8}><Typography.Text strong>{slot.title}</Typography.Text><Tag>{slot.hint.split(" · ")[0]}</Tag></Space>
                                    {artifact ? <><Typography.Text ellipsis={{ tooltip: artifact.fileName }} style={{ display: "block", marginTop: 4 }}>{artifact.fileName}</Typography.Text><Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatBytes(artifact.fileSize)} · SHA-256 {artifact.sha256.slice(0, 12)}...</Typography.Text></> : <Typography.Text type="secondary" style={{ display: "block", marginTop: 4 }}>{slot.hint}</Typography.Text>}
                                    {progress !== undefined ? <Progress percent={progress} size="small" showInfo={false} style={{ marginTop: 6 }} /> : null}
                                </div>
                                <Space>
                                    <Upload accept={slot.accept} maxCount={1} showUploadList={false} customRequest={(options) => void uploadArtifact(slot, options)} disabled={progress !== undefined}>
                                        <Button icon={<CloudUploadOutlined />} loading={progress !== undefined}>{artifact ? "替换" : "上传"}</Button>
                                    </Upload>
                                    {artifact ? <Popconfirm title="删除这个安装包？" onConfirm={() => void removeArtifact(artifact)}><Button danger type="text" icon={<DeleteOutlined />} aria-label="删除安装包" /></Popconfirm> : null}
                                </Space>
                            </div>
                        );
                    })}
                    <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>单个文件最大 1GB。同一平台与芯片架构再次上传会替换旧安装包。</Typography.Text>
                </div>
            </Modal>
        </div>
    );
}
