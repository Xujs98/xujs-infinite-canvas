"use client";

import { AppstoreOutlined, BarChartOutlined, CheckCircleOutlined, CloseCircleOutlined, FireOutlined, ReloadOutlined, TeamOutlined, ThunderboltOutlined, UserAddOutlined, UserOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Empty, Segmented, Skeleton, Tooltip } from "antd";
import { useMemo, useState } from "react";

import { fetchAdminAnalytics, type AdminAnalyticsRange, type AdminAnalyticsTrendPoint, type AdminModelAnalyticsRank, type AdminUserAnalyticsRank } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

import styles from "./analytics.module.css";

type AnalyticsView = "models" | "users";
type ChartSeries = { key: string; label: string; color: string };

const modelColors = ["#0f8f7f", "#3d75dd", "#e7a72f", "#8c62c8", "#df6b54", "#64748b"];
const rangeOptions = [
    { label: "24 小时", value: "1d" },
    { label: "7 天", value: "7d" },
    { label: "14 天", value: "14d" },
    { label: "30 天", value: "30d" },
];

function formatNumber(value: number) {
    return Math.max(0, value || 0).toLocaleString("zh-CN");
}

function formatPercent(value: number) {
    return `${Number(value || 0).toFixed(2)}%`;
}

function formatDateTime(value: string) {
    if (!value) return "暂无调用";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "暂无调用";
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function Metric({ icon, label, value, suffix, note, tone }: { icon: React.ReactNode; label: string; value: string; suffix?: string; note: string; tone: string }) {
    return (
        <article className={styles.metric}>
            <div className={`${styles.metricIcon} ${styles[tone]}`}>{icon}</div>
            <div className={styles.metricCopy}>
                <span>{label}</span>
                <strong>
                    {value}
                    {suffix ? <small>{suffix}</small> : null}
                </strong>
                <small>{note}</small>
            </div>
        </article>
    );
}

function ChartLegend({ series }: { series: ChartSeries[] }) {
    return (
        <div className={styles.legend}>
            {series.map((item) => (
                <span key={item.key}>
                    <i style={{ background: item.color }} />
                    {item.label}
                </span>
            ))}
        </div>
    );
}

function ModelTrendChart({ data, models }: { data: AdminAnalyticsTrendPoint[]; models: AdminModelAnalyticsRank[] }) {
    const series = useMemo(() => {
        const result = models.slice(0, 5).map((item, index) => ({ key: item.model, label: item.model, color: modelColors[index] }));
        if (data.some((point) => (point.modelCalls?.["其他"] || 0) > 0)) result.push({ key: "其他", label: "其他", color: modelColors[5] });
        return result;
    }, [data, models]);
    const total = data.reduce((sum, point) => sum + point.totalCalls, 0);
    if (!data.length || total === 0) return <Empty className={styles.empty} image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前时间范围暂无模型调用" />;

    const width = 980;
    const height = 300;
    const plot = { left: 54, right: 18, top: 18, bottom: 48 };
    const plotWidth = width - plot.left - plot.right;
    const plotHeight = height - plot.top - plot.bottom;
    const maxValue = Math.max(...data.map((point) => point.totalCalls), 1);
    const slot = plotWidth / data.length;
    const barWidth = Math.max(5, Math.min(28, slot * 0.62));
    const labelStep = Math.max(1, Math.ceil(data.length / 8));

    return (
        <>
            <div className={styles.chartViewport}>
                <svg className={styles.chartSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="模型调用趋势堆叠柱状图">
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const y = plot.top + plotHeight * (1 - ratio);
                        return (
                            <g key={ratio}>
                                <line x1={plot.left} x2={width - plot.right} y1={y} y2={y} className={styles.gridLine} />
                                <text x={plot.left - 10} y={y + 4} textAnchor="end" className={styles.axisText}>
                                    {Math.round(maxValue * ratio)}
                                </text>
                            </g>
                        );
                    })}
                    {data.map((point, index) => {
                        const x = plot.left + index * slot + (slot - barWidth) / 2;
                        let currentY = plot.top + plotHeight;
                        return (
                            <g key={point.at}>
                                <title>{`${point.label}：${point.totalCalls} 次调用，成功 ${point.successCalls}，失败 ${point.failedCalls}`}</title>
                                {series.map((item) => {
                                    const value = point.modelCalls?.[item.key] || 0;
                                    const segmentHeight = (value / maxValue) * plotHeight;
                                    currentY -= segmentHeight;
                                    return value > 0 ? <rect key={item.key} x={x} y={currentY} width={barWidth} height={segmentHeight} fill={item.color} rx={2} /> : null;
                                })}
                                {index % labelStep === 0 || index === data.length - 1 ? (
                                    <text x={x + barWidth / 2} y={height - 20} textAnchor="middle" className={styles.axisText}>
                                        {point.label}
                                    </text>
                                ) : null}
                            </g>
                        );
                    })}
                </svg>
            </div>
            <ChartLegend series={series} />
        </>
    );
}

function UserTrendChart({ data }: { data: AdminAnalyticsTrendPoint[] }) {
    const total = data.reduce((sum, point) => sum + point.activeUsers + point.newUsers, 0);
    if (!data.length || total === 0) return <Empty className={styles.empty} image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前时间范围暂无用户活跃数据" />;

    const width = 980;
    const height = 300;
    const plot = { left: 54, right: 18, top: 18, bottom: 48 };
    const plotWidth = width - plot.left - plot.right;
    const plotHeight = height - plot.top - plot.bottom;
    const maxValue = Math.max(...data.map((point) => Math.max(point.activeUsers, point.newUsers)), 1);
    const labelStep = Math.max(1, Math.ceil(data.length / 8));
    const pointFor = (value: number, index: number) => ({ x: plot.left + (index / Math.max(data.length - 1, 1)) * plotWidth, y: plot.top + plotHeight - (value / maxValue) * plotHeight });
    const activePoints = data.map((point, index) => pointFor(point.activeUsers, index));
    const newPoints = data.map((point, index) => pointFor(point.newUsers, index));
    const toPath = (points: Array<{ x: number; y: number }>) => points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
    const areaPath = `${toPath(activePoints)} L${activePoints.at(-1)?.x || plot.left},${plot.top + plotHeight} L${activePoints[0]?.x || plot.left},${plot.top + plotHeight} Z`;
    const series = [
        { key: "active", label: "活跃用户", color: "#3d75dd" },
        { key: "new", label: "新增用户", color: "#0f8f7f" },
    ];

    return (
        <>
            <div className={styles.chartViewport}>
                <svg className={styles.chartSvg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="用户活跃与新增趋势折线图">
                    <defs>
                        <linearGradient id="analytics-user-area" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3d75dd" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#3d75dd" stopOpacity="0.02" />
                        </linearGradient>
                    </defs>
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const y = plot.top + plotHeight * (1 - ratio);
                        return (
                            <g key={ratio}>
                                <line x1={plot.left} x2={width - plot.right} y1={y} y2={y} className={styles.gridLine} />
                                <text x={plot.left - 10} y={y + 4} textAnchor="end" className={styles.axisText}>
                                    {Math.round(maxValue * ratio)}
                                </text>
                            </g>
                        );
                    })}
                    <path d={areaPath} fill="url(#analytics-user-area)" />
                    <path d={toPath(activePoints)} fill="none" stroke="#3d75dd" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <path d={toPath(newPoints)} fill="none" stroke="#0f8f7f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="7 6" />
                    {data.map((point, index) => {
                        const activePoint = activePoints[index];
                        const newPoint = newPoints[index];
                        return (
                            <g key={point.at}>
                                <title>{`${point.label}：活跃 ${point.activeUsers} 人，新增 ${point.newUsers} 人`}</title>
                                <circle cx={activePoint.x} cy={activePoint.y} r={3.5} fill="#ffffff" stroke="#3d75dd" strokeWidth={2} />
                                <circle cx={newPoint.x} cy={newPoint.y} r={3} fill="#ffffff" stroke="#0f8f7f" strokeWidth={2} />
                                {index % labelStep === 0 || index === data.length - 1 ? (
                                    <text x={activePoint.x} y={height - 20} textAnchor="middle" className={styles.axisText}>
                                        {point.label}
                                    </text>
                                ) : null}
                            </g>
                        );
                    })}
                </svg>
            </div>
            <ChartLegend series={series} />
        </>
    );
}

function ModelRanking({ items }: { items: AdminModelAnalyticsRank[] }) {
    if (!items.length) return <Empty className={styles.empty} image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无模型排行" />;
    return (
        <div className={styles.rankingList}>
            {items.slice(0, 8).map((item, index) => (
                <div className={styles.rankingRow} key={item.model}>
                    <span className={styles.rankIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <div className={styles.rankMain}>
                        <div className={styles.rankTitle}>
                            <Tooltip title={item.model}>
                                <strong>{item.model}</strong>
                            </Tooltip>
                            <span>{formatPercent(item.successRate)} 成功</span>
                        </div>
                        <div className={styles.rankTrack}>
                            <i style={{ width: `${Math.max(item.share, 1)}%`, background: modelColors[index % modelColors.length] }} />
                        </div>
                    </div>
                    <div className={styles.rankValue}>
                        <strong>{formatNumber(item.calls)}</strong>
                        <span>次调用</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

function UserRanking({ items }: { items: AdminUserAnalyticsRank[] }) {
    if (!items.length) return <Empty className={styles.empty} image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无用户消费排行" />;
    const maxCredits = Math.max(...items.map((item) => item.consumedCredits), 1);
    return (
        <div className={styles.rankingList}>
            {items.map((item, index) => {
                const name = item.displayName || item.username;
                return (
                    <div className={styles.rankingRow} key={item.userId}>
                        <span className={`${styles.userAvatar} ${styles[`avatar${index % 4}`]}`}>{name.slice(0, 1).toUpperCase()}</span>
                        <div className={styles.rankMain}>
                            <div className={styles.rankTitle}>
                                <strong>{name}</strong>
                                <span>
                                    {item.calls} 次调用 · {formatDateTime(item.lastActiveAt)}
                                </span>
                            </div>
                            <div className={styles.rankTrack}>
                                <i style={{ width: `${Math.max((item.consumedCredits / maxCredits) * 100, item.consumedCredits > 0 ? 1 : 0)}%`, background: modelColors[index % 4] }} />
                            </div>
                        </div>
                        <div className={styles.rankValue}>
                            <strong>{formatNumber(item.consumedCredits)}</strong>
                            <span>算力点</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function AdminAnalyticsPage() {
    const token = useUserStore((state) => state.token);
    const [view, setView] = useState<AnalyticsView>("models");
    const [range, setRange] = useState<AdminAnalyticsRange>("7d");
    const query = useQuery({
        queryKey: ["admin", "analytics", range, token],
        queryFn: () => fetchAdminAnalytics(token, range),
        enabled: Boolean(token),
        refetchInterval: 60_000,
    });
    const data = query.data;

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <span className={styles.kicker}>DATA INSIGHTS</span>
                    <h1>数据看板</h1>
                    <p>调用、算力点与用户数据的运营分析</p>
                </div>
                <div className={styles.headerMeta}>
                    <span>更新于 {data ? formatDateTime(data.generatedAt) : "--"}</span>
                    <Button icon={<ReloadOutlined />} loading={query.isFetching} onClick={() => void query.refetch()}>
                        刷新
                    </Button>
                </div>
            </header>

            <div className={styles.toolbar}>
                <Segmented
                    className={styles.viewSwitch}
                    value={view}
                    onChange={(value) => setView(value as AnalyticsView)}
                    options={[
                        { label: "模型调用分析", value: "models", icon: <BarChartOutlined /> },
                        { label: "用户统计", value: "users", icon: <TeamOutlined /> },
                    ]}
                />
                <Segmented className={styles.rangeSwitch} value={range} onChange={(value) => setRange(value as AdminAnalyticsRange)} options={rangeOptions} />
            </div>

            {query.isLoading ? (
                <div className={styles.loading}>
                    <Skeleton active paragraph={{ rows: 14 }} />
                </div>
            ) : query.isError || !data ? (
                <div className={styles.errorState}>
                    <Empty description={query.error instanceof Error ? query.error.message : "数据加载失败"} />
                    <Button onClick={() => void query.refetch()}>重新加载</Button>
                </div>
            ) : view === "models" ? (
                <>
                    <section className={styles.metricGrid} aria-label="模型调用核心指标">
                        <Metric icon={<BarChartOutlined />} label="调用总量" value={formatNumber(data.model.summary.totalCalls)} note="排除轮询与客户端错误日志" tone="toneTeal" />
                        <Metric icon={<ThunderboltOutlined />} label="算力点消耗" value={formatNumber(data.model.summary.consumedCredits)} note="钱包与订阅额度合计" tone="toneAmber" />
                        <Metric icon={<CheckCircleOutlined />} label="成功率" value={formatPercent(data.model.summary.successRate)} note={`${formatNumber(data.model.summary.successCalls)} 次调用成功`} tone="toneBlue" />
                        <Metric icon={<CloseCircleOutlined />} label="失败调用" value={formatNumber(data.model.summary.failedCalls)} note="上游与业务失败合计" tone="toneRed" />
                        <Metric icon={<AppstoreOutlined />} label="活跃模型" value={formatNumber(data.model.summary.activeModels)} note="时间范围内产生调用" tone="toneViolet" />
                    </section>

                    <section className={styles.healthStrip}>
                        <div>
                            <span className={styles.healthDot} />
                            <strong>调用健康度</strong>
                        </div>
                        <span>
                            成功率 <b>{formatPercent(data.model.summary.successRate)}</b>
                        </span>
                        <span>
                            成功 <b>{formatNumber(data.model.summary.successCalls)}</b>
                        </span>
                        <span>
                            失败 <b>{formatNumber(data.model.summary.failedCalls)}</b>
                        </span>
                        <span>
                            活跃模型 <b>{formatNumber(data.model.summary.activeModels)}</b>
                        </span>
                    </section>

                    <section className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <div>
                                <h2>模型调用趋势</h2>
                                <span>按调用次数展示主要模型的时间分布</span>
                            </div>
                            <span className={styles.panelTotal}>共 {formatNumber(data.model.summary.totalCalls)} 次</span>
                        </div>
                        <div className={styles.panelBody}>
                            <ModelTrendChart data={data.model.trend} models={data.model.models} />
                        </div>
                    </section>

                    <section className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <div>
                                <h2>模型表现排行</h2>
                                <span>调用量、占比与成功率</span>
                            </div>
                        </div>
                        <div className={styles.panelBody}>
                            <ModelRanking items={data.model.models} />
                        </div>
                    </section>
                </>
            ) : (
                <>
                    <section className={styles.metricGrid} aria-label="用户统计核心指标">
                        <Metric icon={<TeamOutlined />} label="总用户" value={formatNumber(data.users.summary.totalUsers)} note="平台累计账户" tone="toneBlue" />
                        <Metric icon={<UserAddOutlined />} label="新增用户" value={formatNumber(data.users.summary.newUsers)} note="当前时间范围内注册" tone="toneTeal" />
                        <Metric icon={<UserOutlined />} label="活跃用户" value={formatNumber(data.users.summary.activeUsers)} note="产生有效模型调用" tone="toneViolet" />
                        <Metric icon={<FireOutlined />} label="消费用户" value={formatNumber(data.users.summary.consumingUsers)} note="发生算力点或订阅额度消费" tone="toneRed" />
                        <Metric icon={<ThunderboltOutlined />} label="总消耗" value={formatNumber(data.users.summary.consumedCredits)} suffix="算力点" note="钱包与订阅额度合计" tone="toneAmber" />
                    </section>

                    <section className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <div>
                                <h2>用户活跃趋势</h2>
                                <span>活跃用户与新增用户变化</span>
                            </div>
                            <span className={styles.panelTotal}>活跃 {formatNumber(data.users.summary.activeUsers)} 人</span>
                        </div>
                        <div className={styles.panelBody}>
                            <UserTrendChart data={data.users.trend} />
                        </div>
                    </section>

                    <section className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <div>
                                <h2>用户消费排行</h2>
                                <span>按算力点与订阅额度消耗排序</span>
                            </div>
                            <span className={styles.panelTotal}>前 10 名</span>
                        </div>
                        <div className={styles.panelBody}>
                            <UserRanking items={data.users.ranking} />
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
