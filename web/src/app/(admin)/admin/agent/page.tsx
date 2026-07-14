"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, Descriptions, Form, Space, Spin, Switch, Typography, message, Modal, Tag } from "antd";
import { ReloadOutlined, PlayCircleOutlined, PoweroffOutlined, ExclamationCircleOutlined, SaveOutlined } from "@ant-design/icons";
import { useUserStore } from "@/stores/use-user-store";
import { getAdminColors } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useMemo } from "react";

interface AgentStatus {
    running: boolean;
    url: string;
    token: string;
}

interface AgentSettings {
    agentEnabled: boolean;
    agentVisible: boolean;
    agentAccessLevel: string[];
}

const accessLevelOptions = [
    { label: "游客", value: "guest" },
    { label: "注册用户", value: "registered" },
    { label: "会员", value: "member" },
];

function AccessLevelSelector({ value = [], onChange, accentColor }: { value?: string[]; onChange?: (val: string[]) => void; accentColor: string }) {
    const handleClick = (val: string) => {
        const next = value.includes(val) ? value.filter((v) => v !== val) : [...value, val];
        onChange?.(next);
    };
    return (
        <Space wrap>
            {accessLevelOptions.map((opt) => {
                const selected = value.includes(opt.value);
                return (
                    <Button
                        key={opt.value}
                        onClick={() => handleClick(opt.value)}
                        style={{
                            borderColor: selected ? accentColor : undefined,
                            color: selected ? accentColor : undefined,
                            fontWeight: selected ? 600 : 400,
                            boxShadow: selected ? `0 0 0 1px ${accentColor}` : undefined,
                        }}
                    >
                        {opt.label}
                    </Button>
                );
            })}
        </Space>
    );
}

export default function AgentManagementPage() {
    const [status, setStatus] = useState<AgentStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [settings, setSettings] = useState<AgentSettings>({
        agentEnabled: false,
        agentVisible: true,
        agentAccessLevel: ["guest", "registered"],
    });
    const [form] = Form.useForm();
    const [messageApi, contextHolder] = message.useMessage();
    const token = useUserStore((state) => state.token);
    const palette = useThemeStore((state) => state.palette);
    const adminColors = useMemo(() => getAdminColors(palette), [palette]);
    const primaryBtnStyle = useMemo(
        () => ({
            background: adminColors.primary,
            borderColor: adminColors.primary,
        }),
        [adminColors.primary],
    );

    const headers = { Authorization: `Bearer ${token}` };

    const fetchStatus = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/agent/status", { headers });
            const data = await res.json();
            if (data.code === 0) {
                setStatus(data.data);
            }
        } catch {
            messageApi.error("获取 Agent 状态失败");
        } finally {
            setLoading(false);
        }
    }, [messageApi, token]);

    const fetchSettings = useCallback(async () => {
        setSettingsLoading(true);
        try {
            const res = await fetch("/api/admin/agent/settings", { headers });
            const data = await res.json();
            if (data.code === 0 && data.data) {
                const rawLevel = data.data.agentAccessLevel ?? "guest,registered";
                const levelArr = rawLevel.split(",").filter(Boolean);
                const s: AgentSettings = {
                    agentEnabled: data.data.agentEnabled ?? false,
                    agentVisible: data.data.agentVisible ?? true,
                    agentAccessLevel: levelArr,
                };
                setSettings(s);
                form.setFieldsValue(s);
            }
        } catch {
            messageApi.error("获取设置失败");
        } finally {
            setSettingsLoading(false);
        }
    }, [form, messageApi, token]);

    useEffect(() => {
        if (token) {
            fetchStatus();
            fetchSettings();
        }
    }, [token, fetchStatus, fetchSettings]);

    const handleStart = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/agent/start", {
                method: "POST",
                headers,
            });
            const data = await res.json();
            if (data.code === 0) {
                setStatus(data.data);
                messageApi.success("Agent 已启动");
            } else {
                messageApi.error(data.msg || "启动失败");
            }
        } catch {
            messageApi.error("启动失败");
        } finally {
            setLoading(false);
        }
    };

    const handleStop = () => {
        Modal.confirm({
            title: "确认停止 Agent 服务？",
            icon: <ExclamationCircleOutlined />,
            content: "停止后所有用户的网站 Agent 连接将断开。",
            okText: "停止",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                setLoading(true);
                try {
                    const res = await fetch("/api/admin/agent/stop", {
                        method: "POST",
                        headers,
                    });
                    const data = await res.json();
                    if (data.code === 0) {
                        setStatus({ running: false, url: "", token: "" });
                        messageApi.success("Agent 已停止");
                    }
                } catch {
                    messageApi.error("停止失败");
                } finally {
                    setLoading(false);
                }
            },
        });
    };

    const handleRestart = async () => {
        setLoading(true);
        try {
            await fetch("/api/admin/agent/stop", { method: "POST", headers });
            const res = await fetch("/api/admin/agent/start", { method: "POST", headers });
            const data = await res.json();
            if (data.code === 0) {
                setStatus(data.data);
                messageApi.success("Agent 已重启");
            }
        } catch {
            messageApi.error("重启失败");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSettings = async (values: AgentSettings) => {
        try {
            const saveRes = await fetch("/api/admin/agent/settings", {
                method: "POST",
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    agentEnabled: values.agentEnabled,
                    agentVisible: values.agentVisible,
                    agentAccessLevel: values.agentAccessLevel.join(","),
                }),
            });
            const saveData = await saveRes.json();
            if (saveData.code === 0) {
                setSettings(values);
                messageApi.success("设置已保存");
            } else {
                messageApi.error(saveData.msg || "保存失败");
            }
        } catch {
            messageApi.error("保存失败");
        }
    };

    return (
        <div className="admin-data-page admin-agent-page">
            {contextHolder}
            <div className="admin-page-title">
                <Typography.Title level={4} style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
                    Agent 管理
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    管理画布 Agent 服务和访问控制
                </Typography.Text>
            </div>

            {/* 服务状态 */}
            <div className="admin-panel">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div>
                        <Typography.Text strong style={{ fontSize: 15 }}>
                            服务状态
                        </Typography.Text>
                    </div>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => {
                            fetchStatus();
                            fetchSettings();
                        }}
                        loading={loading}
                        size="small"
                    >
                        刷新
                    </Button>
                </div>
                <Spin spinning={loading}>
                    <Descriptions column={{ xs: 1, sm: 2, md: 3 }}>
                        <Descriptions.Item label="运行状态">{status?.running ? <Tag color="success">运行中</Tag> : <Tag color="default">已停止</Tag>}</Descriptions.Item>
                        <Descriptions.Item label="端口">{status?.running ? "17371" : "-"}</Descriptions.Item>
                        <Descriptions.Item label="操作">
                            <Space>
                                {!status?.running ? (
                                    <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} loading={loading} style={primaryBtnStyle}>
                                        启动
                                    </Button>
                                ) : (
                                    <>
                                        <Button icon={<ReloadOutlined />} onClick={handleRestart} loading={loading}>
                                            重启
                                        </Button>
                                        <Button danger icon={<PoweroffOutlined />} onClick={handleStop} loading={loading}>
                                            停止
                                        </Button>
                                    </>
                                )}
                            </Space>
                        </Descriptions.Item>
                    </Descriptions>
                </Spin>
            </div>

            {/* 访问控制 */}
            <div className="admin-panel">
                <div style={{ marginBottom: 20 }}>
                    <Typography.Text strong style={{ fontSize: 15 }}>
                        访问控制
                    </Typography.Text>
                    <div>
                        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                            配置 Agent 的启用状态和访问权限
                        </Typography.Text>
                    </div>
                </div>
                <Spin spinning={settingsLoading}>
                    <Form form={form} layout="vertical" initialValues={settings} onFinish={handleSaveSettings} style={{ maxWidth: 600 }}>
                        <Form.Item name="agentEnabled" label="启用 Agent" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                        <Form.Item name="agentVisible" label="前台展示 Agent" valuePropName="checked" extra="关闭后用户在画布页面将看不到 Agent 入口">
                            <Switch />
                        </Form.Item>
                        <Form.Item name="agentAccessLevel" label="访问权限" extra="选中的角色可以使用 Agent 功能，管理员始终拥有权限">
                            <Form.Item name="agentAccessLevel" noStyle>
                                <AccessLevelSelector accentColor={adminColors.primary} />
                            </Form.Item>
                        </Form.Item>
                        <Form.Item>
                            <Button
                                type="primary"
                                htmlType="submit"
                                icon={<SaveOutlined />}
                                style={primaryBtnStyle}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.opacity = "0.85";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.opacity = "1";
                                }}
                            >
                                保存设置
                            </Button>
                        </Form.Item>
                    </Form>
                </Spin>
            </div>
        </div>
    );
}
