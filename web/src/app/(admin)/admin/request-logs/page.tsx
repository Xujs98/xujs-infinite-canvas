"use client";

import { DeleteOutlined, DownloadOutlined, EyeOutlined, FileImageOutlined, PlayCircleOutlined, ReloadOutlined, SoundOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, Drawer, Form, Input, Modal, Row, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { ClickToCopyText } from "@/components/admin/click-to-copy-text";
import { batchDeleteAdminRequestLogs, fetchAdminRequestLogs, type AdminRequestLog } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const MEDIA_FIELD_KEYS = new Set(["image", "images", "image_urls", "input_reference[]", "reference_images", "reference_videos", "reference_audios"]);

function isPreviewableUrl(src: string): boolean {
    return src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:");
}

function extractMediaFromJson(text: string): { images: string[]; videos: string[]; audios: string[]; truncatedCount: number } {
    const images: string[] = [];
    const videos: string[] = [];
    const audios: string[] = [];
    let truncatedCount = 0;
    try {
        const obj = JSON.parse(text);
        const collect = (val: any): string[] => {
            if (typeof val === "string") return [val];
            if (Array.isArray(val)) return val.filter((v): v is string => typeof v === "string");
            return [];
        };
        for (const key of MEDIA_FIELD_KEYS) {
            const val = obj[key];
            if (val == null) continue;
            const items = collect(val);
            for (const item of items) {
                if (!isPreviewableUrl(item)) {
                    truncatedCount++;
                    continue;
                }
                if (key === "reference_videos") {
                    videos.push(item);
                } else if (key === "reference_audios") {
                    audios.push(item);
                } else {
                    images.push(item);
                }
            }
        }
    } catch {
        /* not json */
    }
    return { images, videos, audios, truncatedCount };
}

function MediaPreview({ body }: { body: string }) {
    const { images, videos, audios, truncatedCount } = extractMediaFromJson(body);
    if (!images.length && !videos.length && !audios.length && !truncatedCount) return null;
    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {images.map((src, i) => (
                <div key={i} className="group relative cursor-pointer" onClick={() => window.open(src.startsWith("data:") ? src : `/api/proxy-image?url=${encodeURIComponent(src)}`, "_blank")}>
                    <img
                        src={src.startsWith("data:") ? src : `/api/proxy-image?url=${encodeURIComponent(src)}`}
                        alt={`图片${i + 1}`}
                        className="h-20 w-20 rounded-lg border border-gray-200 object-cover transition-shadow hover:shadow-md"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                        }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 transition-colors group-hover:bg-black/30">
                        <EyeOutlined className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-lg" />
                    </div>
                </div>
            ))}
            {videos.map((src, i) => (
                <div key={i} className="relative cursor-pointer" onClick={() => window.open(src, "_blank")}>
                    <video src={src} className="h-20 w-28 rounded-lg border border-gray-200 object-cover" muted preload="metadata" />
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 transition-colors hover:bg-black/30">
                        <PlayCircleOutlined className="text-white text-2xl drop-shadow" />
                    </div>
                </div>
            ))}
            {audios.map((src, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <SoundOutlined className="text-gray-500" />
                    <audio src={src} controls className="h-8 max-w-[200px]" preload="metadata" />
                </div>
            ))}
            {truncatedCount > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-400">
                    <FileImageOutlined />
                    {truncatedCount} 个素材已截断（base64 日志不保留原始数据）
                </div>
            )}
        </div>
    );
}

function tryFormatJson(text: string): { isJson: boolean; formatted: string } {
    try {
        return { isJson: true, formatted: JSON.stringify(JSON.parse(text), null, 2) };
    } catch {
        const m = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (m) {
            try {
                const obj = JSON.stringify(JSON.parse(m[1]), null, 2);
                const prefix = text.slice(0, text.indexOf(m[1])).trim();
                return { isJson: true, formatted: prefix ? `${prefix}\n\n${obj}` : obj };
            } catch {
                /* ignore */
            }
        }
        return { isJson: false, formatted: text };
    }
}

function truncateBase64(text: string): string {
    // 先在原始文本上截断 base64，再格式化 JSON
    let result = text.replace(/"data:[^"]*?;base64,[A-Za-z0-9+/=\s]{40,}"/g, (match) => {
        const b64Idx = match.indexOf(";base64,");
        if (b64Idx === -1) return match.slice(0, 60) + '..."';
        return match.slice(0, b64Idx + 8) + 'iVBORw0KGgo..."';
    });
    result = result.replace(/data:[^;]+;base64,[A-Za-z0-9+/=\s]{40,}/g, (match) => {
        const b64Idx = match.indexOf(";base64,");
        return match.slice(0, b64Idx + 8) + "iVBORw0KGgo...";
    });
    return result;
}

function JsonBlock({ text }: { text: string }) {
    const truncated = truncateBase64(text);
    const r = tryFormatJson(truncated);
    return r.isJson ? (
        <pre className="!text-xs !bg-gray-50 !p-3 !rounded overflow-x-auto max-h-80 overflow-y-auto">{r.formatted}</pre>
    ) : (
        <pre className="!text-xs !bg-gray-50 !p-3 !rounded overflow-x-auto max-h-80 overflow-y-auto break-all">{truncated}</pre>
    );
}

export default function AdminRequestLogsPage() {
    const token = useUserStore((s) => s.token);
    const [logs, setLogs] = useState<AdminRequestLog[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [keyword, setKeyword] = useState("");
    const [keywordInput, setKeywordInput] = useState("");
    const [methodFilter, setMethodFilter] = useState("");
    const [sourceFilter, setSourceFilter] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
    const [detailLog, setDetailLog] = useState<AdminRequestLog | null>(null);

    const loadLogs = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const params: Record<string, any> = { keyword, page, pageSize };
            if (methodFilter) params.method = methodFilter;
            if (sourceFilter) params.source = sourceFilter;
            const data = await fetchAdminRequestLogs(token, params);
            setLogs(data.items || []);
            setTotal(data.total || 0);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadLogs();
    }, [token, page, pageSize, keyword, methodFilter, sourceFilter]);

    const handleBatchDelete = async () => {
        if (!token || !selectedIds.length) return;
        await batchDeleteAdminRequestLogs(token, selectedIds);
        setSelectedIds([]);
        setBatchDeleteOpen(false);
        void loadLogs();
    };

    const columns: ProColumns<AdminRequestLog>[] = [
        {
            title: "请求者",
            dataIndex: "username",
            width: 120,
            ellipsis: true,
            render: (_, item) => item.username || item.userId || "-",
        },
        {
            title: "方法",
            dataIndex: "method",
            width: 80,
            render: (_, item) => <Tag color={item.method === "ERROR" ? "red" : item.method === "POST" ? "blue" : "green"}>{item.method}</Tag>,
        },
        {
            title: "来源",
            dataIndex: "source",
            width: 80,
            filters: [
                { text: "Web 端", value: "web" },
                { text: "App 端", value: "app" },
            ],
            onFilter: (value, record) => record.source === value,
            render: (_, item) => {
                const source = item.source || "web";
                return source === "app" ? <Tag color="purple">App</Tag> : <Tag color="default">Web</Tag>;
            },
        },
        {
            title: "模型",
            dataIndex: "model",
            width: 200,
            ellipsis: true,
            render: (_, item) => (
                <Typography.Text code className="!text-xs">
                    {item.model}
                </Typography.Text>
            ),
        },
        {
            title: "状态",
            dataIndex: "statusCode",
            width: 80,
            render: (_, item) => (item.statusCode ? <Tag color={item.statusCode < 400 ? "success" : "error"}>{item.statusCode}</Tag> : <Tag>等待</Tag>),
        },
        {
            title: "URL",
            dataIndex: "url",
            ellipsis: true,
            render: (_, item) => (
                <ClickToCopyText value={item.url} className="!text-xs">
                    {item.url}
                </ClickToCopyText>
            ),
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
                    查看 Web/App 请求日志和 App 端画布错误
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
                                        placeholder="搜索用户名、模型、URL或错误信息"
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
                                <Form.Item label="方法">
                                    <Space>
                                        <Button
                                            type={!methodFilter ? "primary" : "default"}
                                            onClick={() => {
                                                setMethodFilter("");
                                                setPage(1);
                                            }}
                                        >
                                            全部
                                        </Button>
                                        <Button
                                            type={methodFilter === "POST" ? "primary" : "default"}
                                            onClick={() => {
                                                setMethodFilter("POST");
                                                setPage(1);
                                            }}
                                        >
                                            POST
                                        </Button>
                                        <Button
                                            type={methodFilter === "GET" ? "primary" : "default"}
                                            onClick={() => {
                                                setMethodFilter("GET");
                                                setPage(1);
                                            }}
                                        >
                                            GET
                                        </Button>
                                        <Button
                                            type={methodFilter === "ERROR" ? "primary" : "default"}
                                            onClick={() => {
                                                setMethodFilter("ERROR");
                                                setPage(1);
                                            }}
                                        >
                                            错误
                                        </Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item label="来源">
                                    <Space>
                                        <Button
                                            type={!sourceFilter ? "primary" : "default"}
                                            onClick={() => {
                                                setSourceFilter("");
                                                setPage(1);
                                            }}
                                        >
                                            全部
                                        </Button>
                                        <Button
                                            type={sourceFilter === "app" ? "primary" : "default"}
                                            onClick={() => {
                                                setSourceFilter("app");
                                                setPage(1);
                                            }}
                                        >
                                            App
                                        </Button>
                                        <Button
                                            type={sourceFilter === "web" ? "primary" : "default"}
                                            onClick={() => {
                                                setSourceFilter("web");
                                                setPage(1);
                                            }}
                                        >
                                            Web
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
                <ProTable<AdminRequestLog>
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
                            <Typography.Text strong>日志记录</Typography.Text>
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

            <Modal title="批量删除请求日志" open={batchDeleteOpen} onCancel={() => setBatchDeleteOpen(false)} onOk={() => void handleBatchDelete()} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除已选中的 {selectedIds.length} 条请求日志吗？
            </Modal>

            <Drawer title="请求详情" open={Boolean(detailLog)} onClose={() => setDetailLog(null)} width={800} destroyOnHidden>
                {detailLog && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 flex-wrap">
                            <Tag color={detailLog.method === "ERROR" ? "red" : detailLog.method === "POST" ? "blue" : "green"}>{detailLog.method}</Tag>
                            <Typography.Text code className="!text-xs">
                                {detailLog.model}
                            </Typography.Text>
                            <Tag color={detailLog.source === "app" ? "purple" : "default"}>{detailLog.source === "app" ? "App" : "Web"}</Tag>
                            {detailLog.statusCode ? <Tag color={detailLog.statusCode < 400 ? "success" : "error"}>{detailLog.statusCode}</Tag> : null}
                            {detailLog.isPolling && <Tag color="orange">轮询</Tag>}
                            <Typography.Text type="secondary" className="!text-xs">
                                {dayjs(detailLog.createdAt).format("YYYY-MM-DD HH:mm:ss")}
                            </Typography.Text>
                        </div>
                        <div>
                            <Typography.Text type="secondary" className="!text-xs">
                                请求者
                            </Typography.Text>
                            <div className="!text-sm">{detailLog.username || detailLog.userId || "-"}</div>
                        </div>
                        <div>
                            <Typography.Text type="secondary" className="!text-xs">
                                URL
                            </Typography.Text>
                            <Typography.Text code className="!block !mt-1 !text-xs break-all">
                                {detailLog.url}
                            </Typography.Text>
                        </div>
                        {detailLog.requestHeaders && detailLog.requestHeaders !== "{}" && (
                            <div>
                                <Typography.Text type="secondary" className="!text-xs">
                                    请求头 (Headers)
                                </Typography.Text>
                                <JsonBlock text={detailLog.requestHeaders} />
                            </div>
                        )}
                        {detailLog.requestBody && (
                            <div>
                                <Typography.Text type="secondary" className="!text-xs">
                                    请求体 (Body) - {detailLog.requestBodySize} bytes
                                </Typography.Text>
                                <JsonBlock text={detailLog.requestBody} />
                                <MediaPreview body={detailLog.requestMedia || detailLog.requestBody} />
                            </div>
                        )}
                        {detailLog.responseBody && (
                            <div>
                                <Typography.Text type="secondary" className="!text-xs">
                                    响应体 (Response)
                                </Typography.Text>
                                <JsonBlock text={detailLog.responseBody} />
                            </div>
                        )}
                        {detailLog.errorMsg && (
                            <div>
                                <Typography.Text type="danger" className="!text-xs">
                                    错误 (Error)
                                </Typography.Text>
                                <pre className="!mt-1 !text-xs !bg-red-50 !p-3 !rounded overflow-x-auto text-red-600">{truncateBase64(detailLog.errorMsg)}</pre>
                            </div>
                        )}
                    </div>
                )}
            </Drawer>
        </div>
    );
}
