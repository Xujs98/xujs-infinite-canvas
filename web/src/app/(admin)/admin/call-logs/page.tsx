"use client";

import { DeleteOutlined, EyeOutlined, ReloadOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, Drawer, Form, Input, Modal, Row, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";

import { batchDeleteAdminCallLogs, fetchAdminCallLogs, type AdminCallLog } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

function tryFormatJson(text: string): { isJson: boolean; formatted: string } {
    try {
        const obj = JSON.parse(text);
        const cleaned = unescapeJsonStrings(obj);
        return { isJson: true, formatted: JSON.stringify(cleaned, null, 2) };
    } catch {
        const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch) {
            try {
                const obj = JSON.parse(jsonMatch[1]);
                const cleaned = unescapeJsonStrings(obj);
                const prefix = text.slice(0, text.indexOf(jsonMatch[1])).trim();
                const formatted = JSON.stringify(cleaned, null, 2);
                return { isJson: true, formatted: prefix ? `${prefix}\n\n${formatted}` : formatted };
            } catch {
                // ignore
            }
        }
        return { isJson: false, formatted: text };
    }
}

function unescapeJsonStrings(obj: unknown): unknown {
    if (typeof obj === "string") {
        const trimmed = obj.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
                return unescapeJsonStrings(JSON.parse(trimmed));
            } catch {
                return obj;
            }
        }
        return obj;
    }
    if (Array.isArray(obj)) return obj.map(unescapeJsonStrings);
    if (obj && typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            result[key] = unescapeJsonStrings(value);
        }
        return result;
    }
    return obj;
}

function extractVideoUrl(text: string): string | null {
    try {
        const obj = JSON.parse(text);
        const candidates = [obj?.content?.video_url, obj?.result?.video_url, obj?.result?.url, obj?.result?.video_urls?.[0], obj?.data?.video_url, obj?.data?.video_urls?.[0], obj?.video_url, obj?.url, obj?.video?.url];
        for (const v of candidates) {
            if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
        }
    } catch {
        // not json
    }
    return null;
}

function JsonHighlight({ text }: { text: string }) {
    const html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"([^"\\]*(\\.[^"\\]*)*)"\s*:/g, '<span style="color:#a626a4">"$1"</span>:')
        .replace(/:\s*"([^"\\]*(\\.[^"\\]*)*)"/g, ': <span style="color:#50a14f">"$1"</span>')
        .replace(/:\s*(true|false)/g, ': <span style="color:#986801">$1</span>')
        .replace(/:\s*(\d+\.?\d*)/g, ': <span style="color:#e45649">$1</span>')
        .replace(/:\s*(null)/g, ': <span style="color:#999">$1</span>');
    return <code dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function AdminCallLogsPage() {
    const token = useUserStore((s) => s.token);
    const [logs, setLogs] = useState<AdminCallLog[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [keyword, setKeyword] = useState("");
    const [keywordInput, setKeywordInput] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
    const [detailLog, setDetailLog] = useState<AdminCallLog | null>(null);

    const loadLogs = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const data = await fetchAdminCallLogs(token, { keyword, status: statusFilter, page, pageSize });
            setLogs(data.items || []);
            setTotal(data.total || 0);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadLogs();
    }, [token, page, pageSize, keyword, statusFilter]);

    const handleBatchDelete = async () => {
        if (!token || !selectedIds.length) return;
        await batchDeleteAdminCallLogs(token, selectedIds);
        setSelectedIds([]);
        setBatchDeleteOpen(false);
        void loadLogs();
    };

    const pathLabel = useMemo(
        () => ({
            "/images/generations": "图片生成",
            "/images/edits": "图片编辑",
            "/chat/completions": "对话补全",
            "/audio/speech": "语音合成",
            "/videos": "视频生成",
            "/contents/generations/tasks": "视频生成",
        }),
        [],
    );

    const resolvePathLabel = (path: string) => {
        if (pathLabel[path as keyof typeof pathLabel]) return pathLabel[path as keyof typeof pathLabel];
        if (path.startsWith("/contents/generations/tasks")) return "视频生成";
        if (path.startsWith("/videos")) return "视频生成";
        return path;
    };

    const errorDetail = useMemo(() => {
        if (!detailLog?.errorMsg) return null;
        return tryFormatJson(detailLog.errorMsg);
    }, [detailLog]);

    const columns: ProColumns<AdminCallLog>[] = [
        {
            title: "用户",
            dataIndex: "username",
            width: 120,
            ellipsis: true,
            render: (_, item) => item.username || item.userId || "-",
        },
        {
            title: "模型",
            dataIndex: "model",
            width: 180,
            ellipsis: true,
        },
        {
            title: "接口",
            dataIndex: "path",
            width: 120,
            render: (_, item) => resolvePathLabel(item.path),
        },
        {
            title: "状态",
            dataIndex: "success",
            width: 80,
            render: (_, item) => (item.success ? <Tag color="success">成功</Tag> : <Tag color="error">失败</Tag>),
        },
        {
            title: "算力",
            dataIndex: "credits",
            width: 70,
            render: (_, item) => item.credits || "-",
        },
        {
            title: "详情",
            dataIndex: "errorMsg",
            ellipsis: true,
            render: (_, item) => {
                if (!item.errorMsg) return <Typography.Text type="secondary">-</Typography.Text>;
                const isVideo = item.success && (item.path.startsWith("/videos") || item.path.startsWith("/contents/generations/tasks"));
                return (
                    <Typography.Text type={item.success ? undefined : "danger"} ellipsis style={{ maxWidth: 200, display: "inline-block" }}>
                        {isVideo ? "点击查看响应数据和视频" : item.errorMsg}
                    </Typography.Text>
                );
            },
        },
        {
            title: "时间",
            dataIndex: "createdAt",
            width: 170,
            render: (_, item) => (item.createdAt ? dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"),
        },
        {
            title: "操作",
            key: "actions",
            width: 60,
            align: "center",
            render: (_, item) => <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetailLog(item)} />,
        },
    ];

    return (
        <div className="admin-data-page">
            <div className="admin-page-title">
                <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
                    日志管理
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    查看用户 AI 接口调用记录
                </Typography.Text>
            </div>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card className="admin-filter-card" variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="360px">
                                <Form.Item label="关键词">
                                    <Input
                                        value={keywordInput}
                                        placeholder="搜索用户名、模型或错误信息"
                                        allowClear
                                        onPressEnter={() => {
                                            setKeyword(keywordInput);
                                            setPage(1);
                                        }}
                                        onChange={(e) => setKeywordInput(e.target.value)}
                                    />
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item label="状态">
                                    <Space>
                                        <Button
                                            type={statusFilter === "" ? "primary" : "default"}
                                            onClick={() => {
                                                setStatusFilter("");
                                                setPage(1);
                                            }}
                                        >
                                            全部
                                        </Button>
                                        <Button
                                            type={statusFilter === "success" ? "primary" : "default"}
                                            onClick={() => {
                                                setStatusFilter("success");
                                                setPage(1);
                                            }}
                                        >
                                            成功
                                        </Button>
                                        <Button
                                            type={statusFilter === "fail" ? "primary" : "default"}
                                            onClick={() => {
                                                setStatusFilter("fail");
                                                setPage(1);
                                            }}
                                        >
                                            失败
                                        </Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item>
                                    <Button icon={<ReloadOutlined />} onClick={() => void loadLogs()}>
                                        刷新
                                    </Button>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Form>
                </Card>
                <ProTable<AdminCallLog>
                    rowKey="id"
                    columns={columns}
                    dataSource={logs}
                    loading={isLoading}
                    search={false}
                    defaultSize="middle"
                    tableLayout="fixed"
                    cardProps={{ variant: "borderless" }}
                    rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys.map(String)) }}
                    headerTitle={
                        <Space>
                            <Typography.Text strong>调用日志</Typography.Text>
                            <Tag>{total} 条</Tag>
                        </Space>
                    }
                    options={{ density: true, setting: true, reload: () => void loadLogs() }}
                    toolBarRender={() => [
                        <Button key="batch-delete" danger icon={<DeleteOutlined />} disabled={!selectedIds.length} onClick={() => setBatchDeleteOpen(true)}>
                            批量删除{selectedIds.length ? ` ${selectedIds.length}` : ""}
                        </Button>,
                    ]}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        showTotal: (value) => `共 ${value} 条`,
                        onChange: (nextPage, nextPageSize) => (nextPageSize !== pageSize ? setPageSize(nextPageSize) : setPage(nextPage)),
                    }}
                />
            </Space>

            <Modal title="批量删除日志" open={batchDeleteOpen} onCancel={() => setBatchDeleteOpen(false)} onOk={() => void handleBatchDelete()} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除已选中的 {selectedIds.length} 条日志吗？
            </Modal>

            <Drawer title={detailLog?.success ? "响应详情" : "错误详情"} open={Boolean(detailLog)} onClose={() => setDetailLog(null)} width={720} destroyOnHidden>
                {detailLog && (
                    <Space direction="vertical" size={20} style={{ width: "100%" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
                            <div>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    用户
                                </Typography.Text>
                                <div>{detailLog.username || detailLog.userId || "-"}</div>
                            </div>
                            <div>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    模型
                                </Typography.Text>
                                <div style={{ fontFamily: "monospace" }}>{detailLog.model}</div>
                            </div>
                            <div>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    接口
                                </Typography.Text>
                                <div>{resolvePathLabel(detailLog.path)}</div>
                            </div>
                            <div>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    状态
                                </Typography.Text>
                                <div>{detailLog.success ? <Tag color="success">成功</Tag> : <Tag color="error">失败</Tag>}</div>
                            </div>
                            <div>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    算力消耗
                                </Typography.Text>
                                <div>{detailLog.credits || "-"}</div>
                            </div>
                            <div>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    调用时间
                                </Typography.Text>
                                <div>{detailLog.createdAt ? dayjs(detailLog.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</div>
                            </div>
                        </div>
                        {detailLog.errorMsg && (
                            <div>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    {detailLog.success ? "响应数据" : "错误信息"}
                                </Typography.Text>
                                <div
                                    style={{
                                        marginTop: 8,
                                        padding: 16,
                                        background: "#fafafa",
                                        borderRadius: 8,
                                        fontSize: 13,
                                        lineHeight: 1.7,
                                        overflow: "auto",
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-word",
                                        border: "1px solid #e8e8e8",
                                        maxHeight: "calc(100vh - 340px)",
                                    }}
                                >
                                    {errorDetail?.isJson ? <JsonHighlight text={errorDetail.formatted} /> : <code>{errorDetail?.formatted || detailLog.errorMsg}</code>}
                                </div>
                            </div>
                        )}
                        {detailLog.success &&
                            detailLog.errorMsg &&
                            (() => {
                                const videoUrl = extractVideoUrl(detailLog.errorMsg);
                                if (!videoUrl) return null;
                                return (
                                    <div>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                            视频预览
                                        </Typography.Text>
                                        <div style={{ marginTop: 8 }}>
                                            <video src={videoUrl} controls style={{ width: "100%", maxHeight: 400, borderRadius: 8, background: "#000" }} />
                                        </div>
                                    </div>
                                );
                            })()}
                    </Space>
                )}
            </Drawer>
        </div>
    );
}
