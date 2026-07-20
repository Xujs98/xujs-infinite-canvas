"use client";

import { ClockCircleOutlined, CloudServerOutlined, CopyOutlined, DeleteOutlined, ExclamationCircleOutlined, EyeOutlined, FileImageOutlined, PlayCircleOutlined, ReloadOutlined, SearchOutlined, SoundOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Col, Collapse, DatePicker, Descriptions, Drawer, Empty, Flex, Grid, Input, Modal, Row, Select, Space, Spin, Table, Tag, Tooltip, Typography, type TableColumnsType } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ClickToCopyText } from "@/components/admin/click-to-copy-text";
import { batchDeleteAdminRequestLogs, clearAdminRequestLogs, fetchAdminRequestLogDetail, fetchAdminRequestLogs, type AdminRequestLog, type AdminRequestLogQuery, type AdminRequestLogStats, type AdminRequestLogSummary } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

import styles from "./usage-logs.module.css";

const { RangePicker } = DatePicker;

const EMPTY_STATS: AdminRequestLogStats = { total: 0, success: 0, failed: 0, credits: 0, averageMs: 0 };

const eventLabels: Record<string, string> = {
    generation: "模型生成",
    authentication: "身份认证",
    credits: "算力点",
    subscription: "订阅",
    admin: "管理操作",
    business: "业务操作",
    error: "客户端错误",
};

const operationLabels: Record<string, string> = {
    image_generation: "图片生成",
    image_edit: "图片编辑",
    video_generation: "视频生成",
    audio_generation: "语音生成",
    chat_completion: "文本生成",
    login: "登录",
    register: "注册",
    password_verification: "密码邮箱验证",
    check_in: "签到",
    redeem: "兑换码",
    subscription: "订阅操作",
    credit_consume: "算力点扣除",
    credit_refund: "算力点退还",
    offline_credit_sync: "离线算力点同步",
    profile_update: "资料修改",
    referral_bind: "绑定邀请码",
    media_upload: "媒体上传",
    access_ban: "访问封禁",
    risk_event_operation: "风险事件处置",
    app_release_operation: "版本发布",
    model_configuration: "模型配置",
    settings_update: "系统设置",
    user_management: "用户管理",
    admin_operation: "后台管理",
    client_error: "客户端错误",
    api_operation: "接口操作",
};

const billingLabels: Record<string, string> = {
    wallet: "钱包余额",
    subscription: "订阅额度",
    mixed: "订阅 + 钱包",
    membership_free: "会员免费",
    role_free: "角色免费",
};

const errorStageLabels: Record<string, string> = {
    request_build: "构建请求",
    billing: "算力点扣费",
    network: "网络传输",
    upstream: "上游接口",
    response_parse: "响应解析",
    generation: "生成任务",
    processing: "服务端处理",
};

type DateRange = [Dayjs, Dayjs] | null;
type MediaItems = { images: string[]; videos: string[]; audios: string[]; omitted: number };

function formatDuration(milliseconds: number): string {
    if (!milliseconds) return "-";
    if (milliseconds < 1000) return `${milliseconds} ms`;
    if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 2 : 1)} s`;
    const minutes = Math.floor(milliseconds / 60_000);
    const seconds = Math.round((milliseconds % 60_000) / 1000);
    return `${minutes} 分 ${seconds} 秒`;
}

function formatBytes(bytes: number): string {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string): string {
    return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-";
}

function operationName(item: Pick<AdminRequestLogSummary, "operation" | "method">): string {
    return operationLabels[item.operation] || eventLabels[item.operation] || item.operation || item.method || "使用记录";
}

function eventColor(eventType: string): string {
    switch (eventType) {
        case "generation":
            return "blue";
        case "error":
            return "red";
        case "credits":
            return "gold";
        case "authentication":
            return "cyan";
        case "admin":
            return "purple";
        default:
            return "default";
    }
}

function isPreviewableURL(value: string): boolean {
    return value.startsWith("https://") || value.startsWith("http://") || value.startsWith("data:");
}

function extractMedia(text: string): MediaItems {
    const result: MediaItems = { images: [], videos: [], audios: [], omitted: 0 };
    if (!text) return result;
    try {
        const root = JSON.parse(text);
        const walk = (value: unknown, key = "") => {
            if (Array.isArray(value)) {
                value.forEach((child) => walk(child, key));
                return;
            }
            if (value && typeof value === "object") {
                Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) => walk(child, childKey.toLowerCase()));
                return;
            }
            if (typeof value !== "string") return;
            if (value.includes("base64 omitted")) {
                result.omitted += 1;
                return;
            }
            if (!isPreviewableURL(value)) return;
            if (key.includes("video") || /\.(mp4|mov|webm)(\?|$)/i.test(value)) result.videos.push(value);
            else if (key.includes("audio") || /\.(mp3|wav|m4a|aac)(\?|$)/i.test(value)) result.audios.push(value);
            else if (key.includes("image") || key.includes("reference") || value.startsWith("data:image") || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(value)) result.images.push(value);
        };
        walk(root);
    } catch {
        return result;
    }
    result.images = [...new Set(result.images)].slice(0, 12);
    result.videos = [...new Set(result.videos)].slice(0, 6);
    result.audios = [...new Set(result.audios)].slice(0, 6);
    return result;
}

function MediaPreview({ body }: { body: string }) {
    const media = useMemo(() => extractMedia(body), [body]);
    if (!media.images.length && !media.videos.length && !media.audios.length && !media.omitted) return null;
    return (
        <div className={styles.mediaGrid}>
            {media.images.map((source, index) => (
                <button key={`${source}-${index}`} type="button" className={styles.mediaItem} onClick={() => window.open(source, "_blank", "noopener,noreferrer")} aria-label={`查看请求图片 ${index + 1}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={source} alt={`请求图片 ${index + 1}`} />
                    <EyeOutlined />
                </button>
            ))}
            {media.videos.map((source, index) => (
                <button key={`${source}-${index}`} type="button" className={styles.mediaItem} onClick={() => window.open(source, "_blank", "noopener,noreferrer")} aria-label={`查看请求视频 ${index + 1}`}>
                    <video src={source} muted preload="metadata" />
                    <PlayCircleOutlined />
                </button>
            ))}
            {media.audios.map((source, index) => (
                <div className={styles.audioItem} key={`${source}-${index}`}>
                    <SoundOutlined />
                    <audio src={source} controls preload="metadata" />
                </div>
            ))}
            {media.omitted > 0 ? (
                <div className={styles.omittedMedia}>
                    <FileImageOutlined />
                    {media.omitted} 个 Base64 素材已脱敏
                </div>
            ) : null}
        </div>
    );
}

function JsonBlock({ text, emptyText = "无数据" }: { text: string; emptyText?: string }) {
    if (!text) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />;
    let content = text;
    try {
        content = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        // Plain-text upstream errors and response bodies are intentionally kept.
    }
    return <pre className={styles.codeBlock}>{content}</pre>;
}

function Metric({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string }) {
    return (
        <div className={styles.metric}>
            <span className={`${styles.metricIcon} ${styles[tone]}`}>{icon}</span>
            <div>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{note}</small>
            </div>
        </div>
    );
}

export default function AdminRequestLogsPage() {
    const { message } = App.useApp();
    const token = useUserStore((state) => state.token);
    const screens = Grid.useBreakpoint();
    const [logs, setLogs] = useState<AdminRequestLogSummary[]>([]);
    const [stats, setStats] = useState<AdminRequestLogStats>(EMPTY_STATS);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [loading, setLoading] = useState(false);
    const [queryVersion, setQueryVersion] = useState(0);
    const [keyword, setKeyword] = useState("");
    const [modelFilter, setModelFilter] = useState("");
    const [channelFilter, setChannelFilter] = useState("");
    const [sourceFilter, setSourceFilter] = useState("");
    const [eventFilter, setEventFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [dateRange, setDateRange] = useState<DateRange>([dayjs().startOf("day"), dayjs()]);
    const [appliedFilters, setAppliedFilters] = useState<AdminRequestLogQuery>({
        startTime: dayjs().startOf("day").toISOString(),
        endTime: dayjs().toISOString(),
    });
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
    const [clearAllOpen, setClearAllOpen] = useState(false);
    const [clearLoading, setClearLoading] = useState(false);
    const [detailSummary, setDetailSummary] = useState<AdminRequestLogSummary | null>(null);
    const [detail, setDetail] = useState<AdminRequestLog | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const detailSequence = useRef(0);

    const buildQuery = useCallback((): AdminRequestLogQuery => {
        return { ...appliedFilters, page, pageSize };
    }, [appliedFilters, page, pageSize]);

    const loadLogs = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const data = await fetchAdminRequestLogs(token, buildQuery());
            setLogs(data.items || []);
            setTotal(data.total || 0);
            setStats(data.stats || { ...EMPTY_STATS, total: data.total || 0 });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "使用日志加载失败");
        } finally {
            setLoading(false);
        }
    }, [buildQuery, message, token]);

    useEffect(() => {
        void loadLogs();
    }, [loadLogs, queryVersion]);

    const search = () => {
        setAppliedFilters({
            keyword: keyword.trim() || undefined,
            model: modelFilter.trim() || undefined,
            channel: channelFilter.trim() || undefined,
            source: sourceFilter || undefined,
            eventType: eventFilter || undefined,
            status: statusFilter || undefined,
            startTime: dateRange?.[0].toISOString(),
            endTime: dateRange?.[1].toISOString(),
        });
        setPage(1);
        setQueryVersion((value) => value + 1);
    };

    const reset = () => {
        setKeyword("");
        setModelFilter("");
        setChannelFilter("");
        setSourceFilter("");
        setEventFilter("");
        setStatusFilter("");
        const nextRange: DateRange = [dayjs().startOf("day"), dayjs()];
        setDateRange(nextRange);
        setAppliedFilters({ startTime: nextRange[0].toISOString(), endTime: nextRange[1].toISOString() });
        setPage(1);
        setQueryVersion((value) => value + 1);
    };

    const openDetail = async (item: AdminRequestLogSummary) => {
        if (!token) return;
        const sequence = ++detailSequence.current;
        setDetailSummary(item);
        setDetail(null);
        setDetailLoading(true);
        try {
            const data = await fetchAdminRequestLogDetail(token, item.id);
            if (sequence === detailSequence.current) setDetail(data);
        } catch (error) {
            if (sequence === detailSequence.current) message.error(error instanceof Error ? error.message : "使用详情加载失败");
        } finally {
            if (sequence === detailSequence.current) setDetailLoading(false);
        }
    };

    const closeDetail = () => {
        detailSequence.current += 1;
        setDetailSummary(null);
        setDetail(null);
        setDetailLoading(false);
    };

    const deleteSelected = async () => {
        if (!token || !selectedIds.length) return;
        try {
            await batchDeleteAdminRequestLogs(token, selectedIds);
            message.success(`已删除 ${selectedIds.length} 条使用日志`);
            setSelectedIds([]);
            setBatchDeleteOpen(false);
            setQueryVersion((value) => value + 1);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除失败");
        }
    };

    const clearAll = async () => {
        if (!token) return;
        setClearLoading(true);
        try {
            const result = await clearAdminRequestLogs(token);
            message.success(`已清理 ${result.deleted} 条使用日志`);
            setSelectedIds([]);
            setClearAllOpen(false);
            closeDetail();
            setPage(1);
            setQueryVersion((value) => value + 1);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "清理失败");
        } finally {
            setClearLoading(false);
        }
    };

    const columns: TableColumnsType<AdminRequestLogSummary> = [
        {
            title: "时间 / 类型",
            dataIndex: "createdAt",
            width: 184,
            fixed: screens.lg ? "left" : undefined,
            render: (_, item) => (
                <div className={styles.primaryCell}>
                    <strong>{formatDate(item.createdAt)}</strong>
                    <span>
                        <Tag color={eventColor(item.eventType)}>{operationName(item)}</Tag>
                        {item.isPolling ? <Tag color="orange">轮询</Tag> : null}
                    </span>
                </div>
            ),
        },
        {
            title: "渠道",
            width: 150,
            render: (_, item) => (
                <div className={styles.secondaryCell}>
                    <strong>{item.channelName || "平台服务"}</strong>
                    <span>{item.providerId || item.path || "-"}</span>
                </div>
            ),
        },
        {
            title: "用户",
            width: 130,
            render: (_, item) => (
                <div className={styles.secondaryCell}>
                    <strong>{item.username || "未识别用户"}</strong>
                    <span>{item.userId || "未登录"}</span>
                </div>
            ),
        },
        {
            title: "来源",
            dataIndex: "source",
            width: 84,
            render: (value) => <Tag color={value === "app" ? "blue" : "default"}>{value === "app" ? "App" : "Web"}</Tag>,
        },
        {
            title: "模型",
            dataIndex: "model",
            width: 190,
            ellipsis: true,
            render: (value) => (value ? <Typography.Text code>{value}</Typography.Text> : <Typography.Text type="secondary">非模型操作</Typography.Text>),
        },
        {
            title: "耗时",
            dataIndex: "elapsedMs",
            width: 104,
            sorter: (left, right) => left.elapsedMs - right.elapsedMs,
            render: (value) => <span className={styles.numeric}>{formatDuration(value)}</span>,
        },
        {
            title: "生成结果",
            width: 106,
            render: (_, item) =>
                item.eventType === "generation" ? (
                    <div className={styles.resultCount}>
                        <strong>{item.generatedCount || 0}</strong>
                        <span>/ {item.requestedCount || 1}</span>
                    </div>
                ) : (
                    <Typography.Text type="secondary">-</Typography.Text>
                ),
        },
        {
            title: "算力点 / 来源",
            width: 132,
            render: (_, item) => {
                if (item.credits > 0) {
                    return (
                        <Tooltip title={`订阅 ${item.subscriptionCredits || 0}，钱包 ${item.walletCredits || 0}`}>
                            <div className={styles.creditValue}>
                                <strong>{item.credits.toLocaleString("zh-CN")}</strong>
                                <span>{billingLabels[item.billingMode] || "算力点"}</span>
                            </div>
                        </Tooltip>
                    );
                }
                if (item.billingMode) return <Tag color="green">{billingLabels[item.billingMode] || "免费"}</Tag>;
                return <Tag color={item.source === "app" ? "blue" : "default"}>{item.source === "app" ? "App" : "Web"}</Tag>;
            },
        },
        {
            title: "状态",
            width: 96,
            render: (_, item) => {
                if (item.success) return <Tag color="success">成功</Tag>;
                if (item.statusCode > 0 || item.errorStage) return <Tag color="error">失败</Tag>;
                return <Tag color="processing">处理中</Tag>;
            },
        },
        {
            title: "详情",
            width: 72,
            align: "center",
            fixed: screens.lg ? "right" : undefined,
            render: (_, item) => (
                <Tooltip title="查看完整详情">
                    <Button type="text" icon={<EyeOutlined />} aria-label="查看完整使用详情" onClick={() => void openDetail(item)} />
                </Tooltip>
            ),
        },
    ];

    const requestSections = detail
        ? ([
              detail.requestHeaders ? { key: "requestHeaders", label: "请求头", children: <JsonBlock text={detail.requestHeaders} /> } : null,
              detail.requestBody
                  ? {
                        key: "requestBody",
                        label: `请求体 · ${formatBytes(detail.requestBodySize)}`,
                        children: (
                            <>
                                <JsonBlock text={detail.requestBody} />
                                <MediaPreview body={detail.requestMedia || detail.requestBody} />
                            </>
                        ),
                    }
                  : null,
              detail.responseHeaders ? { key: "responseHeaders", label: "响应头", children: <JsonBlock text={detail.responseHeaders} /> } : null,
              detail.responseBody ? { key: "responseBody", label: "响应体", children: <JsonBlock text={detail.responseBody} /> } : null,
          ].filter(Boolean) as { key: string; label: string; children: React.ReactNode }[])
        : [];

    return (
        <div className={`admin-data-page ${styles.page}`}>
            <Card className={styles.filterPanel} variant="borderless">
                <div className={styles.filterGrid}>
                    <RangePicker
                        classNames={{ popup: { root: styles.filterPopup } }}
                        value={dateRange}
                        showTime
                        allowClear
                        format="YYYY-MM-DD HH:mm"
                        onChange={(values) => setDateRange(values ? [values[0]!, values[1]!] : null)}
                        presets={[
                            { label: "今天", value: [dayjs().startOf("day"), dayjs()] },
                            { label: "最近 7 天", value: [dayjs().subtract(6, "day").startOf("day"), dayjs()] },
                            { label: "最近 30 天", value: [dayjs().subtract(29, "day").startOf("day"), dayjs()] },
                            { label: "本月", value: [dayjs().startOf("month"), dayjs()] },
                        ]}
                    />
                    <Input value={modelFilter} allowClear placeholder="模型名称" onChange={(event) => setModelFilter(event.target.value)} onPressEnter={search} />
                    <Input value={channelFilter} allowClear placeholder="渠道名称 / ID" onChange={(event) => setChannelFilter(event.target.value)} onPressEnter={search} />
                    <Select classNames={{ popup: { root: styles.filterPopup } }} value={eventFilter || undefined} allowClear placeholder="所有类型" onChange={(value) => setEventFilter(value || "")} options={Object.entries(eventLabels).map(([value, label]) => ({ value, label }))} />
                    <Input value={keyword} allowClear prefix={<SearchOutlined />} placeholder="用户、任务 ID、请求 ID、错误" onChange={(event) => setKeyword(event.target.value)} onPressEnter={search} />
                    <Select
                        classNames={{ popup: { root: styles.filterPopup } }}
                        value={sourceFilter || undefined}
                        allowClear
                        placeholder="所有来源"
                        onChange={(value) => setSourceFilter(value || "")}
                        options={[
                            { value: "web", label: "Web" },
                            { value: "app", label: "App" },
                        ]}
                    />
                    <Select
                        classNames={{ popup: { root: styles.filterPopup } }}
                        value={statusFilter || undefined}
                        allowClear
                        placeholder="所有状态"
                        onChange={(value) => setStatusFilter(value || "")}
                        options={[
                            { value: "success", label: "成功" },
                            { value: "failed", label: "失败" },
                            { value: "pending", label: "处理中" },
                        ]}
                    />
                    <Flex gap={8} className={styles.filterActions}>
                        <Button onClick={reset}>重置</Button>
                        <Button type="primary" icon={<SearchOutlined />} onClick={search}>
                            搜索
                        </Button>
                    </Flex>
                </div>
            </Card>

            <div className={styles.metrics}>
                <Metric icon={<CloudServerOutlined />} label="使用记录" value={stats.total.toLocaleString("zh-CN")} note="当前筛选范围" tone="toneTeal" />
                <Metric icon={<ThunderboltOutlined />} label="消耗算力点" value={stats.credits.toLocaleString("zh-CN")} note="实际扣除总量" tone="toneAmber" />
                <Metric icon={<ExclamationCircleOutlined />} label="失败记录" value={stats.failed.toLocaleString("zh-CN")} note={stats.total ? `失败率 ${((stats.failed / stats.total) * 100).toFixed(1)}%` : "失败率 0%"} tone="toneRed" />
                <Metric icon={<ClockCircleOutlined />} label="平均耗时" value={formatDuration(stats.averageMs)} note={`${stats.success.toLocaleString("zh-CN")} 次成功`} tone="toneBlue" />
            </div>

            <Card className={styles.tablePanel} variant="borderless">
                <div className={styles.tableHeader}>
                    <div>
                        <Typography.Title level={5}>使用记录</Typography.Title>
                        <Typography.Text type="secondary">模型生成、登录、算力点和后台操作的完整痕迹</Typography.Text>
                    </div>
                    <Space wrap>
                        <Button danger icon={<DeleteOutlined />} disabled={!selectedIds.length} onClick={() => setBatchDeleteOpen(true)}>
                            删除所选 {selectedIds.length || ""}
                        </Button>
                        <Tooltip title="刷新">
                            <Button icon={<ReloadOutlined />} aria-label="刷新使用日志" onClick={() => setQueryVersion((value) => value + 1)} />
                        </Tooltip>
                        <Button danger type="text" onClick={() => setClearAllOpen(true)}>
                            清空全部
                        </Button>
                    </Space>
                </div>
                <Table<AdminRequestLogSummary>
                    rowKey="id"
                    columns={columns}
                    dataSource={logs}
                    loading={loading}
                    size="middle"
                    tableLayout="fixed"
                    rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys.map(String)) }}
                    scroll={{ x: 1350, y: screens.md ? 520 : 420 }}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50, 100],
                        showTotal: (value) => `共 ${value} 条`,
                        onChange: (nextPage, nextPageSize) => {
                            if (nextPageSize !== pageSize) {
                                setPageSize(nextPageSize);
                                setPage(1);
                            } else {
                                setPage(nextPage);
                            }
                        },
                    }}
                    locale={{ emptyText: <Empty description="当前筛选范围内没有使用记录" /> }}
                />
            </Card>

            <Modal title="删除使用日志" open={batchDeleteOpen} okText="确认删除" cancelText="取消" okButtonProps={{ danger: true }} onCancel={() => setBatchDeleteOpen(false)} onOk={() => void deleteSelected()}>
                确定永久删除已选中的 {selectedIds.length} 条使用日志吗？
            </Modal>

            <Modal title="清空全部使用日志" open={clearAllOpen} okText="确认清空" cancelText="取消" confirmLoading={clearLoading} okButtonProps={{ danger: true }} onCancel={() => setClearAllOpen(false)} onOk={() => void clearAll()}>
                此操作会清空全部使用记录及排错详情，不受当前筛选条件影响，且无法恢复。
            </Modal>

            <Drawer
                title={detailSummary ? `${operationName(detailSummary)} · 使用详情` : "使用详情"}
                open={Boolean(detailSummary)}
                onClose={closeDetail}
                size={screens.md ? 960 : "100%"}
                destroyOnHidden
                className={styles.detailDrawer}
                extra={
                    detail?.requestId ? (
                        <Tooltip title="复制请求 ID">
                            <Button type="text" icon={<CopyOutlined />} aria-label="复制请求 ID" onClick={() => void navigator.clipboard.writeText(detail.requestId)} />
                        </Tooltip>
                    ) : null
                }
            >
                {detailLoading ? (
                    <div className={styles.detailLoading}>
                        <Spin description="正在加载完整使用详情" />
                    </div>
                ) : detail ? (
                    <div className={styles.detailBody}>
                        <Flex gap={8} wrap="wrap" align="center" className={styles.detailTags}>
                            <Tag color={eventColor(detail.eventType)}>{operationName(detail)}</Tag>
                            <Tag color={detail.source === "app" ? "blue" : "default"}>{detail.source === "app" ? "App" : "Web"}</Tag>
                            {detail.success ? <Tag color="success">成功</Tag> : detail.statusCode || detail.errorStage ? <Tag color="error">失败</Tag> : <Tag color="processing">处理中</Tag>}
                            {detail.statusCode ? <Tag>HTTP {detail.statusCode}</Tag> : null}
                            {detail.isPolling ? <Tag color="orange">轮询记录</Tag> : null}
                            <Typography.Text type="secondary">{formatDate(detail.createdAt)}</Typography.Text>
                        </Flex>

                        {detail.errorMsg ? (
                            <Alert type="error" showIcon title={`${errorStageLabels[detail.errorStage] || detail.errorStage || "处理失败"}：${detail.errorMsg}`} description="原始请求和响应信息保留在下方，可结合任务 ID、请求 ID 和上游响应排查。" />
                        ) : null}

                        <section className={styles.detailSection}>
                            <h3>使用概览</h3>
                            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
                                <Descriptions.Item label="用户">{detail.username || "未识别用户"}</Descriptions.Item>
                                <Descriptions.Item label="用户 ID">{detail.userId ? <ClickToCopyText value={detail.userId}>{detail.userId}</ClickToCopyText> : "未登录"}</Descriptions.Item>
                                <Descriptions.Item label="来源">{detail.source === "app" ? "App 客户端" : "Web 端"}</Descriptions.Item>
                                <Descriptions.Item label="渠道">{detail.channelName || "平台服务"}</Descriptions.Item>
                                <Descriptions.Item label="渠道 ID">{detail.providerId || "-"}</Descriptions.Item>
                                <Descriptions.Item label="模型">{detail.model || "非模型操作"}</Descriptions.Item>
                                <Descriptions.Item label="耗时">{formatDuration(detail.elapsedMs)}</Descriptions.Item>
                                <Descriptions.Item label="请求方法">{detail.method || "-"}</Descriptions.Item>
                                <Descriptions.Item label="请求大小">{formatBytes(detail.requestBodySize)}</Descriptions.Item>
                                <Descriptions.Item label="任务 ID">{detail.taskId ? <ClickToCopyText value={detail.taskId}>{detail.taskId}</ClickToCopyText> : "-"}</Descriptions.Item>
                                <Descriptions.Item label="请求 ID">{detail.requestId ? <ClickToCopyText value={detail.requestId}>{detail.requestId}</ClickToCopyText> : "-"}</Descriptions.Item>
                                <Descriptions.Item label="接口路径">{detail.path || "-"}</Descriptions.Item>
                            </Descriptions>
                            {detail.url ? (
                                <div className={styles.endpointLine}>
                                    <span>请求地址</span>
                                    <ClickToCopyText value={detail.url}>{detail.url}</ClickToCopyText>
                                </div>
                            ) : null}
                        </section>

                        {detail.eventType === "generation" ? (
                            <section className={styles.detailSection}>
                                <h3>生成配置</h3>
                                <Row gutter={[12, 12]} className={styles.generationMetrics}>
                                    <Col xs={12} sm={6}>
                                        <span>请求数量</span>
                                        <strong>{detail.requestedCount || 1}</strong>
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <span>生成数量</span>
                                        <strong>{detail.generatedCount || 0}</strong>
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <span>参考图片</span>
                                        <strong>{detail.referenceImageCount || 0}</strong>
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <span>视频 / 音频</span>
                                        <strong>
                                            {detail.referenceVideoCount || 0} / {detail.referenceAudioCount || 0}
                                        </strong>
                                    </Col>
                                </Row>
                                <JsonBlock text={detail.requestConfig} emptyText="请求中没有额外生成参数" />
                            </section>
                        ) : null}

                        <section className={styles.detailSection}>
                            <h3>算力点与任务</h3>
                            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
                                <Descriptions.Item label="总算力点">{detail.credits.toLocaleString("zh-CN")}</Descriptions.Item>
                                <Descriptions.Item label="订阅额度">{detail.subscriptionCredits.toLocaleString("zh-CN")}</Descriptions.Item>
                                <Descriptions.Item label="钱包余额">{detail.walletCredits.toLocaleString("zh-CN")}</Descriptions.Item>
                                <Descriptions.Item label="扣费方式">{billingLabels[detail.billingMode] || detail.billingMode || "无扣费"}</Descriptions.Item>
                                <Descriptions.Item label="扣费状态">{detail.chargeStatus === "refunded" ? <Tag color="orange">已退款</Tag> : detail.chargeStatus ? <Tag color="success">{detail.chargeStatus}</Tag> : "-"}</Descriptions.Item>
                                <Descriptions.Item label="扣费 ID">{detail.creditChargeId ? <ClickToCopyText value={detail.creditChargeId}>{detail.creditChargeId}</ClickToCopyText> : "-"}</Descriptions.Item>
                            </Descriptions>
                        </section>

                        <section className={styles.detailSection}>
                            <h3>客户端环境</h3>
                            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
                                <Descriptions.Item label="IP 地址">{detail.ipAddress || "-"}</Descriptions.Item>
                                <Descriptions.Item label="设备码">{detail.deviceCode ? <ClickToCopyText value={detail.deviceCode}>{detail.deviceCode}</ClickToCopyText> : "-"}</Descriptions.Item>
                                <Descriptions.Item label="客户端版本">{detail.appVersion || "-"}</Descriptions.Item>
                                <Descriptions.Item label="操作系统">{[detail.osName, detail.osVersion].filter(Boolean).join(" ") || "-"}</Descriptions.Item>
                                <Descriptions.Item label="客户端类型">{detail.clientType || detail.source || "-"}</Descriptions.Item>
                                <Descriptions.Item label="User Agent">{detail.userAgent || "-"}</Descriptions.Item>
                            </Descriptions>
                        </section>

                        <section className={styles.detailSection}>
                            <h3>请求与响应</h3>
                            {requestSections.length ? <Collapse items={requestSections} defaultActiveKey={detail.errorMsg ? requestSections.map((item) => item.key) : [requestSections[0]?.key]} /> : <Empty description="没有保存请求或响应正文" />}
                        </section>
                    </div>
                ) : null}
            </Drawer>
        </div>
    );
}
