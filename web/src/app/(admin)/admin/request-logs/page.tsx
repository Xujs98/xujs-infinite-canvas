"use client";

import { DeleteOutlined, EyeOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Col, Drawer, Form, Input, Modal, Row, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { batchDeleteAdminRequestLogs, fetchAdminRequestLogs, type AdminRequestLog } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

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
            } catch { /* ignore */ }
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
            const data = await fetchAdminRequestLogs(token, params);
            setLogs(data.items || []);
            setTotal(data.total || 0);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { void loadLogs(); }, [token, page, pageSize, keyword, methodFilter]);

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
            render: (_, item) => <Tag color={item.method === "POST" ? "blue" : "green"}>{item.method}</Tag>,
        },
        {
            title: "模型",
            dataIndex: "model",
            width: 200,
            ellipsis: true,
            render: (_, item) => <Typography.Text code className="!text-xs">{item.model}</Typography.Text>,
        },
        {
            title: "状态",
            dataIndex: "statusCode",
            width: 80,
            render: (_, item) => item.statusCode
                ? <Tag color={item.statusCode < 400 ? "success" : "error"}>{item.statusCode}</Tag>
                : <Tag>等待</Tag>,
        },
        {
            title: "URL",
            dataIndex: "url",
            ellipsis: true,
            render: (_, item) => <Typography.Text className="!text-xs" copyable>{item.url}</Typography.Text>,
        },
        {
            title: "时间",
            dataIndex: "createdAt",
            width: 170,
            render: (_, item) => item.createdAt ? dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-",
        },
        {
            title: "操作",
            key: "actions",
            width: 60,
            align: "center",
            render: (_, item) => (
                <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetailLog(item)} />
            ),
        },
    ];

    return (
        <div style={{ padding: "24px 28px" }}>
            <div style={{ marginBottom: 20 }}>
                <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>请求管理</Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>查看 AI 代理层的完整请求和响应</Typography.Text>
            </div>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card variant="borderless">
                    <Form layout="vertical">
                        <Row gutter={16} align="bottom">
                            <Col flex="360px">
                                <Form.Item label="关键词">
                                    <Input.Search
                                        value={keywordInput}
                                        placeholder="搜索用户名、模型、URL或错误信息"
                                        allowClear
                                        enterButton={<SearchOutlined />}
                                        onSearch={(v) => { setKeyword(v); setPage(1); }}
                                        onChange={(e) => setKeywordInput(e.target.value)}
                                    />
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item label="方法">
                                    <Space>
                                        <Button type={!methodFilter ? "primary" : "default"} onClick={() => { setMethodFilter(""); setPage(1); }}>全部</Button>
                                        <Button type={methodFilter === "POST" ? "primary" : "default"} onClick={() => { setMethodFilter("POST"); setPage(1); }}>POST</Button>
                                        <Button type={methodFilter === "GET" ? "primary" : "default"} onClick={() => { setMethodFilter("GET"); setPage(1); }}>GET</Button>
                                    </Space>
                                </Form.Item>
                            </Col>
                            <Col flex="none">
                                <Form.Item>
                                    <Button icon={<ReloadOutlined />} onClick={() => void loadLogs()}>刷新</Button>
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
                            <Typography.Text strong>请求日志</Typography.Text>
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

            <Modal
                title="批量删除请求日志"
                open={batchDeleteOpen}
                onCancel={() => setBatchDeleteOpen(false)}
                onOk={() => void handleBatchDelete()}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                确定删除已选中的 {selectedIds.length} 条请求日志吗？
            </Modal>

            <Drawer
                title="请求详情"
                open={Boolean(detailLog)}
                onClose={() => setDetailLog(null)}
                width={800}
                destroyOnHidden
            >
                {detailLog && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 flex-wrap">
                            <Tag color={detailLog.method === "POST" ? "blue" : "green"}>{detailLog.method}</Tag>
                            <Typography.Text code className="!text-xs">{detailLog.model}</Typography.Text>
                            {detailLog.statusCode ? <Tag color={detailLog.statusCode < 400 ? "success" : "error"}>{detailLog.statusCode}</Tag> : null}
                            {detailLog.isPolling && <Tag color="orange">轮询</Tag>}
                            <Typography.Text type="secondary" className="!text-xs">{dayjs(detailLog.createdAt).format("YYYY-MM-DD HH:mm:ss")}</Typography.Text>
                        </div>
                        <div>
                            <Typography.Text type="secondary" className="!text-xs">请求者</Typography.Text>
                            <div className="!text-sm">{detailLog.username || detailLog.userId || "-"}</div>
                        </div>
                        <div>
                            <Typography.Text type="secondary" className="!text-xs">URL</Typography.Text>
                            <Typography.Text code className="!block !mt-1 !text-xs break-all">{detailLog.url}</Typography.Text>
                        </div>
                        {detailLog.requestHeaders && detailLog.requestHeaders !== "{}" && (
                            <div>
                                <Typography.Text type="secondary" className="!text-xs">请求头 (Headers)</Typography.Text>
                                <JsonBlock text={detailLog.requestHeaders} />
                            </div>
                        )}
                        {detailLog.requestBody && (
                            <div>
                                <Typography.Text type="secondary" className="!text-xs">请求体 (Body) - {detailLog.requestBodySize} bytes</Typography.Text>
                                <JsonBlock text={detailLog.requestBody} />
                            </div>
                        )}
                        {detailLog.responseBody && (
                            <div>
                                <Typography.Text type="secondary" className="!text-xs">响应体 (Response)</Typography.Text>
                                <JsonBlock text={detailLog.responseBody} />
                            </div>
                        )}
                        {detailLog.errorMsg && (
                            <div>
                                <Typography.Text type="danger" className="!text-xs">错误 (Error)</Typography.Text>
                                <pre className="!mt-1 !text-xs !bg-red-50 !p-3 !rounded overflow-x-auto text-red-600">{truncateBase64(detailLog.errorMsg)}</pre>
                            </div>
                        )}
                    </div>
                )}
            </Drawer>
        </div>
    );
}
