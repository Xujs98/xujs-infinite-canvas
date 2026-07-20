"use client";

import { CheckCircleOutlined, DeleteOutlined, EyeOutlined, GlobalOutlined, LaptopOutlined, ReloadOutlined, StopOutlined, WarningOutlined } from "@ant-design/icons";
import { App, Button, Card, Col, Descriptions, Drawer, Empty, Flex, Input, Row, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ClickToCopyText } from "@/components/admin/click-to-copy-text";
import {
    batchDeleteAdminRiskEvents,
    clearAdminRiskEvents,
    fetchAdminRiskEvents,
    fetchAdminRiskEventStats,
    setAdminAccessBan,
    updateAdminRiskEventStatus,
    type AdminRiskEvent,
    type AdminRiskEventStats,
    type AdminRiskStatus,
} from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const levelMeta = {
    low: { label: "低", color: "default" },
    medium: { label: "中", color: "gold" },
    high: { label: "高", color: "orange" },
    critical: { label: "严重", color: "red" },
} as const;
const statusMeta = {
    open: { label: "待处理", color: "error" },
    resolved: { label: "已确认", color: "success" },
    ignored: { label: "已忽略", color: "default" },
} as const;
const eventLabels: Record<string, string> = {
    login_failed: "登录失败",
    admin_login_failed: "后台登录异常",
    registration_rejected: "注册被拒绝",
    verification_code_rejected: "验证码错误",
    verification_code_request_rejected: "验证码请求被拒绝",
    blocked_access_attempt: "封禁来源继续访问",
    new_access_identity: "新 IP 或设备",
    app_device_invalid: "设备标识异常",
    app_integrity_missing: "客户端安全标识缺失",
    app_timestamp_invalid: "请求时间异常",
    app_request_replay: "疑似请求重放",
    insecure_transport: "非加密传输",
    admin_access_ban_changed: "封禁策略变更",
    linux_do_login_failed: "Linux.do 登录失败",
};

function formatTime(value?: string | null) {
    return value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-";
}

function DetailBlock({ value }: { value: string }) {
    if (!value) return <Typography.Text type="secondary">无额外详情</Typography.Text>;
    let content = value;
    try { content = JSON.stringify(JSON.parse(value), null, 2); } catch { /* plain text */ }
    return <pre className="admin-risk-detail-json">{content}</pre>;
}

export default function AdminRiskEventsPage() {
    const { message, modal } = App.useApp();
    const token = useUserStore((state) => state.token);
    const [items, setItems] = useState<AdminRiskEvent[]>([]);
    const [stats, setStats] = useState<AdminRiskEventStats>({ open: 0, highRisk: 0, today: 0 });
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [keywordInput, setKeywordInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [level, setLevel] = useState("");
    const [status, setStatus] = useState("open");
    const [source, setSource] = useState("");
    const [eventType, setEventType] = useState("");
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [detail, setDetail] = useState<AdminRiskEvent | null>(null);

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const [list, nextStats] = await Promise.all([
                fetchAdminRiskEvents(token, { keyword, level, status, source, type: eventType, page, pageSize }),
                fetchAdminRiskEventStats(token),
            ]);
            setItems(list.items || []);
            setTotal(list.total || 0);
            setStats(nextStats);
            setSelectedIds((current) => current.filter((id) => (list.items || []).some((item) => item.id === id)));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取风险事件失败");
        } finally {
            setLoading(false);
        }
    }, [eventType, keyword, level, message, page, pageSize, source, status, token]);

    useEffect(() => { void load(); }, [load]);

    const changeStatus = useCallback(async (item: AdminRiskEvent, nextStatus: AdminRiskStatus) => {
        try {
            await updateAdminRiskEventStatus(token, item.id, nextStatus);
            message.success(nextStatus === "resolved" ? "风险事件已确认" : nextStatus === "ignored" ? "风险事件已忽略" : "风险事件已重新打开");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更新失败");
        }
    }, [load, message, token]);

    const confirmBan = useCallback((kind: "ip" | "device", value: string) => {
        modal.confirm({
            title: kind === "ip" ? "封禁该 IP" : "封禁该设备码",
            content: value,
            okText: "确认封禁",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                await setAdminAccessBan(token, kind, value, true);
                message.success(kind === "ip" ? "IP 已封禁" : "设备码已封禁");
                await load();
            },
        });
    }, [load, message, modal, token]);

    const deleteSelected = useCallback(() => {
        if (!selectedIds.length) return;
        modal.confirm({
            title: `删除 ${selectedIds.length} 条风险事件？`,
            content: "删除后无法恢复，不会解除已执行的 IP 或设备封禁。",
            okText: "删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                await batchDeleteAdminRiskEvents(token, selectedIds);
                setSelectedIds([]);
                message.success("风险事件已删除");
                await load();
            },
        });
    }, [load, message, modal, selectedIds, token]);

    const clearAll = useCallback(() => {
        modal.confirm({
            title: "清空全部风险事件？",
            content: "此操作只清理审计记录，不会解除 IP、设备码或用户封禁。",
            okText: "全部清空",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                const result = await clearAdminRiskEvents(token);
                setSelectedIds([]);
                message.success(`已清理 ${result.deleted || 0} 条风险事件`);
                await load();
            },
        });
    }, [load, message, modal, token]);

    const columns = useMemo<ColumnsType<AdminRiskEvent>>(() => [
        { title: "等级", dataIndex: "level", width: 82, render: (value: AdminRiskEvent["level"]) => <Tag color={levelMeta[value]?.color}>{levelMeta[value]?.label || value}</Tag> },
        { title: "风险事件", key: "event", width: 260, render: (_, item) => <div><Typography.Text strong>{eventLabels[item.eventType] || item.eventType}</Typography.Text><Typography.Paragraph ellipsis={{ rows: 2, tooltip: item.summary }} type="secondary" style={{ margin: "3px 0 0", fontSize: 12 }}>{item.summary || "-"}</Typography.Paragraph></div> },
        { title: "用户", key: "user", width: 150, render: (_, item) => item.username ? <div><Typography.Text>{item.username}</Typography.Text><br /><Typography.Text type="secondary" style={{ fontSize: 11 }}>{item.userId || "-"}</Typography.Text></div> : "-" },
        { title: "来源", key: "source", width: 105, render: (_, item) => <Space size={4} wrap><Tag color={item.clientType === "app" ? "blue" : "green"}>{item.clientType === "app" ? "App" : item.clientType === "web" ? "Web" : item.source || "服务端"}</Tag>{item.appVersion ? <Typography.Text type="secondary" style={{ fontSize: 11 }}>v{item.appVersion}</Typography.Text> : null}</Space> },
        { title: "IP / 设备", key: "identity", width: 240, render: (_, item) => <Space direction="vertical" size={2}>{item.ipAddress ? <Space size={5}><GlobalOutlined /><ClickToCopyText value={item.ipAddress}>{item.ipAddress}</ClickToCopyText></Space> : null}{item.deviceCode ? <Space size={5}><LaptopOutlined /><Typography.Text ellipsis={{ tooltip: item.deviceCode }} style={{ maxWidth: 195 }}>{item.deviceCode}</Typography.Text></Space> : null}{!item.ipAddress && !item.deviceCode ? "-" : null}</Space> },
        { title: "次数", dataIndex: "occurrenceCount", width: 72, render: (value: number) => <Typography.Text strong>{value || 1}</Typography.Text> },
        { title: "状态", dataIndex: "status", width: 92, render: (value: AdminRiskEvent["status"]) => <Tag color={statusMeta[value]?.color}>{statusMeta[value]?.label || value}</Tag> },
        { title: "最近发生", dataIndex: "lastSeenAt", width: 170, render: formatTime },
        { title: "操作", key: "actions", fixed: "right", width: 210, render: (_, item) => <Space size={2}><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetail(item)} aria-label="查看详情" />{item.status === "open" ? <><Button type="text" size="small" icon={<CheckCircleOutlined />} onClick={() => void changeStatus(item, "resolved")}>确认</Button><Button type="text" size="small" onClick={() => void changeStatus(item, "ignored")}>忽略</Button></> : <Button type="text" size="small" onClick={() => void changeStatus(item, "open")}>重开</Button>}</Space> },
    ], [changeStatus]);

    const typeOptions = Object.entries(eventLabels).map(([value, label]) => ({ value, label }));
    return (
        <div className="admin-risk-page">
            <Flex className="admin-page-title" align="center" gap={14} wrap="wrap">
                <span className="admin-page-title-icon"><WarningOutlined /></span>
                <div><Typography.Title level={3} style={{ margin: 0 }}>风险事件</Typography.Title><Typography.Text type="secondary">查看异常登录、设备变化、请求重放与传输风险</Typography.Text></div>
            </Flex>

            <Row gutter={[14, 14]} className="admin-risk-metrics">
                <Col xs={24} sm={8}><Card size="small"><Typography.Text type="secondary">待处理</Typography.Text><Typography.Title level={3}>{stats.open}</Typography.Title></Card></Col>
                <Col xs={24} sm={8}><Card size="small"><Typography.Text type="secondary">高风险待处理</Typography.Text><Typography.Title level={3} type={stats.highRisk ? "danger" : undefined}>{stats.highRisk}</Typography.Title></Card></Col>
                <Col xs={24} sm={8}><Card size="small"><Typography.Text type="secondary">今日事件</Typography.Text><Typography.Title level={3}>{stats.today}</Typography.Title></Card></Col>
            </Row>

            <Card className="admin-filter-card" variant="borderless">
                <Flex gap={10} wrap="wrap" align="center">
                    <Input.Search value={keywordInput} allowClear placeholder="用户、事件、IP 或设备码" style={{ width: 280 }} onChange={(event) => setKeywordInput(event.target.value)} onSearch={(value) => { setKeyword(value.trim()); setPage(1); }} />
                    <Select value={level || undefined} allowClear placeholder="全部等级" style={{ width: 130 }} onChange={(value) => { setLevel(value || ""); setPage(1); }} options={Object.entries(levelMeta).map(([value, meta]) => ({ value, label: meta.label }))} />
                    <Select value={status || undefined} allowClear placeholder="全部状态" style={{ width: 130 }} onChange={(value) => { setStatus(value || ""); setPage(1); }} options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))} />
                    <Select showSearch optionFilterProp="label" value={eventType || undefined} allowClear placeholder="全部事件" style={{ width: 190 }} onChange={(value) => { setEventType(value || ""); setPage(1); }} options={typeOptions} />
                    <Select value={source || undefined} allowClear placeholder="全部来源" style={{ width: 130 }} onChange={(value) => { setSource(value || ""); setPage(1); }} options={[{ value: "app", label: "App" }, { value: "auth", label: "认证" }, { value: "access", label: "访问控制" }, { value: "admin", label: "后台操作" }]} />
                    <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
                    <Button danger disabled={!selectedIds.length} icon={<DeleteOutlined />} onClick={deleteSelected}>删除所选</Button>
                    <Button danger type="text" onClick={clearAll}>一键清理</Button>
                </Flex>
            </Card>

            <Card className="admin-risk-table-card" variant="borderless">
                <Table<AdminRiskEvent>
                    rowKey="id" loading={loading} dataSource={items} columns={columns} tableLayout="fixed" scroll={{ x: 1480 }}
                    rowSelection={{ selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys.map(String)) }}
                    pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100], responsive: true, showTotal: (value) => `共 ${value} 条`, onChange: (nextPage, nextPageSize) => { setPage(nextPageSize !== pageSize ? 1 : nextPage); setPageSize(nextPageSize); } }}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无风险事件" /> }}
                />
            </Card>

            <Drawer title="风险事件详情" width="min(620px, 100vw)" open={Boolean(detail)} onClose={() => setDetail(null)}>
                {detail ? <Space direction="vertical" size={18} style={{ width: "100%" }}>
                    <Descriptions bordered column={1} size="small">
                        <Descriptions.Item label="事件"><Tag color={levelMeta[detail.level]?.color}>{levelMeta[detail.level]?.label}</Tag> {eventLabels[detail.eventType] || detail.eventType}</Descriptions.Item>
                        <Descriptions.Item label="摘要">{detail.summary || "-"}</Descriptions.Item>
                        <Descriptions.Item label="用户">{detail.username || "-"}{detail.userId ? ` (${detail.userId})` : ""}</Descriptions.Item>
                        <Descriptions.Item label="IP">{detail.ipAddress ? <ClickToCopyText value={detail.ipAddress}>{detail.ipAddress}</ClickToCopyText> : "-"}</Descriptions.Item>
                        <Descriptions.Item label="设备码">{detail.deviceCode ? <ClickToCopyText value={detail.deviceCode}>{detail.deviceCode}</ClickToCopyText> : "-"}</Descriptions.Item>
                        <Descriptions.Item label="接口路径">{detail.path || "-"}</Descriptions.Item>
                        <Descriptions.Item label="首次发生">{formatTime(detail.firstSeenAt)}</Descriptions.Item>
                        <Descriptions.Item label="最近发生">{formatTime(detail.lastSeenAt)}，累计 {detail.occurrenceCount || 1} 次</Descriptions.Item>
                    </Descriptions>
                    <div><Typography.Title level={5}>脱敏详情</Typography.Title><DetailBlock value={detail.detail} /></div>
                    <Flex gap={8} wrap="wrap">
                        {detail.ipAddress ? <Button danger icon={<StopOutlined />} onClick={() => confirmBan("ip", detail.ipAddress)}>封禁 IP</Button> : null}
                        {detail.deviceCode ? <Button danger icon={<StopOutlined />} onClick={() => confirmBan("device", detail.deviceCode)}>封禁设备</Button> : null}
                    </Flex>
                </Space> : null}
            </Drawer>
        </div>
    );
}
