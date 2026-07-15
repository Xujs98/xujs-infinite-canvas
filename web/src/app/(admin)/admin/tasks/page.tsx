"use client";

import { ReloadOutlined } from "@ant-design/icons";
import { ProTable, type ProColumns } from "@ant-design/pro-components";
import { Button, Card, Form, Input, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { ClickToCopyText } from "@/components/admin/click-to-copy-text";
import { fetchAdminGenerationTasks, type AdminGenerationTask } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const typeLabels: Record<AdminGenerationTask["type"], { label: string; color: string }> = {
    image: { label: "图片任务", color: "blue" },
    video: { label: "视频任务", color: "purple" },
};

const statusLabels: Record<AdminGenerationTask["status"], { label: string; color: string }> = {
    running: { label: "进行中", color: "processing" },
    succeeded: { label: "已完成", color: "success" },
    failed: { label: "失败", color: "error" },
};

function taskDuration(task: AdminGenerationTask) {
    if (!task.createdAt) return "-";
    const end = task.completedAt || task.updatedAt || new Date().toISOString();
    const seconds = Math.max(0, dayjs(end).diff(dayjs(task.createdAt), "second"));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
}

export default function AdminTasksPage() {
    const token = useUserStore((s) => s.token);
    const [tasks, setTasks] = useState<AdminGenerationTask[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [keywordInput, setKeywordInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [type, setType] = useState("");
    const [status, setStatus] = useState("running");
    const [isLoading, setIsLoading] = useState(false);

    const loadTasks = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const data = await fetchAdminGenerationTasks(token, { keyword, type, status, page, pageSize });
            setTasks(data.items || []);
            setTotal(data.total || 0);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadTasks();
    }, [token, keyword, type, status, page, pageSize]);

    useEffect(() => {
        const timer = window.setInterval(() => void loadTasks(), 5000);
        return () => window.clearInterval(timer);
    }, [token, keyword, type, status, page, pageSize]);

    const columns: ProColumns<AdminGenerationTask>[] = [
        {
            title: "类型",
            dataIndex: "type",
            width: 100,
            render: (_, task) => {
                const item = typeLabels[task.type];
                return <Tag color={item.color}>{item.label}</Tag>;
            },
        },
        {
            title: "状态",
            dataIndex: "status",
            width: 100,
            render: (_, task) => {
                const item = statusLabels[task.status];
                return <Tag color={item.color}>{item.label}</Tag>;
            },
        },
        {
            title: "用户",
            dataIndex: "username",
            width: 140,
            ellipsis: true,
            render: (_, task) => task.username || task.userId || "-",
        },
        {
            title: "模型",
            dataIndex: "model",
            width: 220,
            ellipsis: true,
            render: (_, task) => (
                <Typography.Text code className="!text-xs">
                    {task.model}
                </Typography.Text>
            ),
        },
        {
            title: "任务 ID",
            dataIndex: "id",
            width: 260,
            ellipsis: true,
            render: (_, task) => (
                <Space direction="vertical" size={0}>
                    <ClickToCopyText value={task.id} className="!text-xs">
                        {task.id}
                    </ClickToCopyText>
                    {task.upstreamTaskId ? (
                        <Typography.Text type="secondary" className="!text-xs">
                            上游：{task.upstreamTaskId}
                        </Typography.Text>
                    ) : null}
                </Space>
            ),
        },
        {
            title: "画布/节点",
            key: "canvas",
            width: 220,
            ellipsis: true,
            render: (_, task) =>
                task.canvasId || task.nodeId ? (
                    <Space direction="vertical" size={0}>
                        {task.canvasId ? <Typography.Text className="!text-xs">画布：{task.canvasId}</Typography.Text> : null}
                        {task.nodeId ? <Typography.Text className="!text-xs">节点：{task.nodeId}</Typography.Text> : null}
                    </Space>
                ) : (
                    "-"
                ),
        },
        {
            title: "耗时",
            key: "duration",
            width: 90,
            render: (_, task) => taskDuration(task),
        },
        {
            title: "更新时间",
            dataIndex: "updatedAt",
            width: 170,
            render: (_, task) => (task.updatedAt ? dayjs(task.updatedAt).format("YYYY-MM-DD HH:mm:ss") : "-"),
        },
        {
            title: "错误",
            dataIndex: "errorMsg",
            ellipsis: true,
            render: (_, task) => task.errorMsg || "-",
        },
    ];

    return (
        <div className="admin-data-page">
            <div className="admin-page-title">
                <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
                    任务管理
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    仅展示已开启“任务功能”角色的持久化图片和视频任务
                </Typography.Text>
            </div>
            <Card className="admin-filter-card" variant="borderless">
                <Form layout="vertical">
                    <Space wrap align="end">
                        <Form.Item label="关键词">
                            <Input
                                value={keywordInput}
                                placeholder="搜索用户、模型、任务 ID、画布或节点"
                                allowClear
                                style={{ width: 360 }}
                                onPressEnter={() => {
                                    setKeyword(keywordInput);
                                    setPage(1);
                                }}
                                onChange={(event) => setKeywordInput(event.target.value)}
                            />
                        </Form.Item>
                        <Form.Item label="类型">
                            <Space>
                                <Button
                                    type={!type ? "primary" : "default"}
                                    onClick={() => {
                                        setType("");
                                        setPage(1);
                                    }}
                                >
                                    全部
                                </Button>
                                <Button
                                    type={type === "image" ? "primary" : "default"}
                                    onClick={() => {
                                        setType("image");
                                        setPage(1);
                                    }}
                                >
                                    图片
                                </Button>
                                <Button
                                    type={type === "video" ? "primary" : "default"}
                                    onClick={() => {
                                        setType("video");
                                        setPage(1);
                                    }}
                                >
                                    视频
                                </Button>
                            </Space>
                        </Form.Item>
                        <Form.Item label="状态">
                            <Space>
                                <Button
                                    type={status === "running" ? "primary" : "default"}
                                    onClick={() => {
                                        setStatus("running");
                                        setPage(1);
                                    }}
                                >
                                    进行中
                                </Button>
                                <Button
                                    type={!status ? "primary" : "default"}
                                    onClick={() => {
                                        setStatus("");
                                        setPage(1);
                                    }}
                                >
                                    全部
                                </Button>
                                <Button
                                    type={status === "succeeded" ? "primary" : "default"}
                                    onClick={() => {
                                        setStatus("succeeded");
                                        setPage(1);
                                    }}
                                >
                                    已完成
                                </Button>
                                <Button
                                    type={status === "failed" ? "primary" : "default"}
                                    onClick={() => {
                                        setStatus("failed");
                                        setPage(1);
                                    }}
                                >
                                    失败
                                </Button>
                            </Space>
                        </Form.Item>
                        <Form.Item label=" ">
                            <Button icon={<ReloadOutlined />} onClick={() => void loadTasks()}>
                                刷新
                            </Button>
                        </Form.Item>
                    </Space>
                </Form>
            </Card>
            <Card variant="borderless" style={{ marginTop: 16 }}>
                <ProTable<AdminGenerationTask>
                    rowKey="id"
                    search={false}
                    options={false}
                    loading={isLoading}
                    dataSource={tasks}
                    columns={columns}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        onChange: (nextPage, nextPageSize) => {
                            setPage(nextPage);
                            setPageSize(nextPageSize);
                        },
                    }}
                />
            </Card>
        </div>
    );
}
