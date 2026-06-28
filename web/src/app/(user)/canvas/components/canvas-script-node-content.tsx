"use client";

import { CopyOutlined, DownloadOutlined, FileTextOutlined, PaperClipOutlined, SendOutlined } from "@ant-design/icons";
import { App, Button, Dropdown, Input, Select, Tooltip } from "antd";
import type { MenuProps } from "antd";
import ReactMarkdown from "react-markdown";
import { useCallback, useEffect, useRef, useState } from "react";

import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { useEffectiveConfig, useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import type { CanvasNodeData } from "../types";

interface ScriptNodeContentProps {
    node: CanvasNodeData;
    theme: any;
}

function getChatId(nodeId: string): string {
    let id = localStorage.getItem(`seedance_chat_${nodeId}`);
    if (!id) {
        id = `script-${nodeId}`;
        localStorage.setItem(`seedance_chat_${nodeId}`, id);
    }
    return id;
}

const TEMPLATES: MenuProps["items"] = [
    { key: "novel", label: "📝 小说改短剧", description: "将小说改编为短剧剧本" },
    { key: "outline", label: "📖 故事大纲→剧本", description: "扩展大纲为完整剧本" },
    { key: "storyboard", label: "🎞️ 单集分镜", description: "生成 Seedance 分镜提示词" },
    { key: "optimize", label: "✨ 提示词优化", description: "优化分镜提示词质量" },
];

const TEMPLATE_PROMPTS: Record<string, string> = {
    novel: "我想把一篇小说改编成短剧，请帮我分析并生成剧本。",
    outline: "我有一个故事大纲，请帮我扩展成完整的剧本。",
    storyboard: "请帮我为这个剧本生成 Seedance 2.0 分镜提示词。",
    optimize: "请帮我优化这段分镜提示词，让它更适合 Seedance 2.0 生成。",
};

export function ScriptNodeContent({ node, theme }: ScriptNodeContentProps) {
    const { message: antMessage } = App.useApp();
    const config = useEffectiveConfig();
    const user = useUserStore((s) => s.user);
    const modelCosts = useConfigStore((s) => s.publicSettings?.modelChannel.modelCosts);

    const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "assistant" | "system"; content: string; toolCall?: { name: string; status: "running" | "done" } }>>(() => {
        try { return JSON.parse(localStorage.getItem(`script_msgs_${node.id}`) || "[]"); } catch { return []; }
    });
    const [input, setInput] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem(`script_node_model_${node.id}`) || config.model || "");
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: selectedModel, count: 1, seconds: 1 });

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    useEffect(() => {
        fetch("/api/settings").then(r => r.json()).then((d: any) => setAvailableModels(d?.public?.modelChannel?.availableModels || [])).catch(() => {});
    }, []);

    // Persist messages to localStorage
    useEffect(() => {
        if (messages.length > 0) {
            localStorage.setItem(`script_msgs_${node.id}`, JSON.stringify(messages));
        }
    }, [messages, node.id]);

    // WebSocket
    useEffect(() => {
        let ws: WebSocket;
        let reconnectTimer: ReturnType<typeof setTimeout>;
        const connect = () => {
            const proto = window.location.protocol === "https:" ? "wss" : "ws";
            ws = new WebSocket(`${proto}://${window.location.host}/api/seedance/ws?chatId=${getChatId(node.id)}&model=${encodeURIComponent(selectedModel)}`);
            ws.onopen = () => setIsConnected(true);
            ws.onclose = () => { setIsConnected(false); reconnectTimer = setTimeout(connect, 3000); };
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case "assistant_message":
                        setIsThinking(false);
                        setMessages((prev) => {
                            const next = [...prev, { id: crypto.randomUUID(), role: "assistant" as const, content: data.content || "" }];
                            return next;
                        });
                        break;
                    case "tool_use":
                        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "system" as const, content: "", toolCall: { name: data.toolName || "unknown", status: "running" } }]);
                        break;
                    case "tool_result":
                        setMessages((prev) => {
                            const updated = [...prev];
                            for (let i = updated.length - 1; i >= 0; i--) {
                                if (updated[i].toolCall?.status === "running") {
                                    updated[i] = { ...updated[i], toolCall: { ...updated[i].toolCall!, status: "done" } };
                                    break;
                                }
                            }
                            return updated;
                        });
                        break;
                    case "result": setIsThinking(false); break;
                    case "error":
                        setIsThinking(false);
                        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "system" as const, content: `错误: ${data.error}` }]);
                        break;
                }
            };
            wsRef.current = ws;
        };
        connect();
        return () => { clearTimeout(reconnectTimer); ws?.close(); };
    }, [node.id, selectedModel]);

    const sendMessage = useCallback((text: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !text.trim()) return;
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
        setIsThinking(true);
        wsRef.current.send(JSON.stringify({ type: "chat", chatId: getChatId(node.id), content: text }));
    }, [node.id]);

    const handleSend = useCallback(() => {
        const content = input.trim();
        if (!content) return;
        sendMessage(content);
        setInput("");
    }, [input, sendMessage]);

    const handleTemplate = (key: string) => {
        const prompt = TEMPLATE_PROMPTS[key];
        if (prompt) sendMessage(prompt);
    };

    const handleUpload = async (files: FileList | null) => {
        if (!files) return;
        for (const file of Array.from(files)) {
            const formData = new FormData();
            formData.append("file", file);
            try {
                const res = await fetch("/api/seedance/upload", { method: "POST", body: formData });
                if (res.ok) {
                    const data = await res.json();
                    sendMessage(`我上传了文件：${data.name}（${data.path}），请查看并处理。`);
                }
            } catch { antMessage.error("上传失败"); }
        }
    };

    const handleModelChange = (model: string) => {
        setSelectedModel(model);
        localStorage.setItem(`script_node_model_${node.id}`, model);
    };

    const handleDownloadMd = () => {
        // Extract markdown content from the last assistant message that has substantial content
        const mdMessages = messages.filter((m) => m.role === "assistant" && m.content.length > 50 && !m.toolCall);
        if (mdMessages.length === 0) { antMessage.warning("暂无生成内容"); return; }
        const lastMd = mdMessages[mdMessages.length - 1].content;
        const blob = new Blob([lastMd], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `脚本_${new Date().toLocaleDateString()}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleCopyMd = () => {
        const mdMessages = messages.filter((m) => m.role === "assistant" && m.content.length > 50 && !m.toolCall);
        if (mdMessages.length === 0) { antMessage.warning("暂无生成内容"); return; }
        navigator.clipboard.writeText(mdMessages[mdMessages.length - 1].content);
        antMessage.success("已复制");
    };

    // Theme colors
    const isDark = theme.node.text === "#f5f5f4" || theme.node.text === "#e2e8f0" || theme.node.text === "#fafaf9";
    const textColor = theme.node.text;
    const mutedColor = theme.node.muted;
    const faintColor = theme.node.faint;
    const surfaceBg = theme.node.panel;
    const borderColor = theme.node.stroke;
    const activeColor = theme.node.activeStroke;
    const surfaceHover = isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.04)";

    // Check if there's generated MD content to display
    const mdMessages = messages.filter((m) => m.role === "assistant" && m.content.length > 50 && !m.toolCall);
    const hasMdContent = mdMessages.length > 0;
    const lastMd = hasMdContent ? mdMessages[mdMessages.length - 1].content : "";

    return (
        <div className="h-full w-full flex flex-col overflow-hidden rounded-lg" style={{ background: surfaceBg }}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0" style={{ borderColor, background: surfaceHover }}>
                <div className="flex items-center gap-1.5 min-w-0">
                    <FileTextOutlined style={{ fontSize: 12, color: activeColor }} />
                    <span className="text-[11px] font-medium truncate" style={{ color: textColor }}>视频脚本创作</span>
                    <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: isConnected ? "#22c55e" : "#ef4444" }} />
                </div>
                <div className="flex items-center gap-1">
                    {hasMdContent && (
                        <>
                            <Tooltip title="复制 Markdown"><Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyMd} className="!h-5 !w-5 !min-w-0" style={{ color: faintColor, fontSize: 10 }} /></Tooltip>
                            <Tooltip title="下载 .md 文件"><Button type="text" size="small" icon={<DownloadOutlined />} onClick={handleDownloadMd} className="!h-5 !w-5 !min-w-0" style={{ color: faintColor, fontSize: 10 }} /></Tooltip>
                        </>
                    )}
                </div>
            </div>

            {/* Model + Credits */}
            <div className="flex items-center gap-1.5 px-3 py-1 border-b shrink-0" style={{ borderColor }}>
                <Select size="small" value={selectedModel} onChange={handleModelChange} options={availableModels.map((m) => ({ label: m, value: m }))} style={{ flex: 1, fontSize: 10 }} popupMatchSelectWidth={false} placeholder="模型" className="!text-[10px]" />
                <div className="flex items-center gap-0.5 shrink-0" style={{ fontSize: 10, color: faintColor }}>
                    <CreditSymbol style={{ fontSize: 9 }} />
                    <span>{credits}</span>
                </div>
            </div>

            {/* Messages or MD Preview */}
            {hasMdContent ? (
                <div className="flex-1 overflow-y-auto px-3 py-2 thin-scrollbar">
                    <ReactMarkdown className="text-xs leading-relaxed" style={{ color: textColor }}>{lastMd}</ReactMarkdown>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto px-3 py-2 thin-scrollbar">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-2">
                            <div className="text-2xl">🎬</div>
                            <p className="text-center" style={{ fontSize: 11, color: faintColor }}>选择模板或输入需求开始创作</p>
                            <div className="grid grid-cols-2 gap-1.5 mt-1 w-full">
                                {TEMPLATES.map((t) => t && (
                                    <button key={t.key} onClick={() => handleTemplate(t.key!)} className="text-left px-2.5 py-2 rounded-lg border text-[11px] transition-colors" style={{ color: textColor, borderColor, background: "transparent" }} onMouseEnter={(e) => e.currentTarget.style.background = surfaceHover} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                                        {t.label as string}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <div key={msg.id} className={`flex mb-1.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                {msg.role === "user" ? (
                                    <div className="rounded-lg rounded-br-sm px-2.5 py-1.5 max-w-[85%] text-[11px] text-white" style={{ background: "#2563eb" }}>{msg.content.length > 80 ? msg.content.slice(0, 80) + "..." : msg.content}</div>
                                ) : msg.role === "system" && msg.toolCall ? (
                                    <div className="rounded-lg px-2 py-1 text-[10px] border" style={{ borderColor: msg.toolCall.status === "running" ? "rgba(234,179,8,.3)" : borderColor, background: msg.toolCall.status === "running" ? "rgba(234,179,8,.08)" : "transparent" }}>
                                        <span className="w-1 h-1 rounded-full inline-block mr-1" style={{ backgroundColor: msg.toolCall.status === "running" ? "#eab308" : "#22c55e" }} />
                                        <span style={{ color: mutedColor }}>{msg.toolCall.name}</span>
                                    </div>
                                ) : (
                                    <div className="rounded-lg px-2.5 py-1.5 max-w-[85%] text-[11px]" style={{ background: surfaceHover, color: textColor }}>
                                        {msg.content.length > 200 ? msg.content.slice(0, 200) + "..." : msg.content}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                    {isThinking && (
                        <div className="flex justify-start mb-1.5">
                            <div className="rounded-lg px-2.5 py-1.5 text-[11px] flex items-center gap-1.5" style={{ background: surfaceHover, color: faintColor }}>
                                <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: activeColor }} />
                                创作中...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            )}

            {/* Input */}
            <div className="px-2 py-1.5 border-t shrink-0 flex items-end gap-1" style={{ borderColor }}>
                <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.md" multiple onChange={(e) => handleUpload(e.target.files)} />
                <Tooltip title="上传文件">
                    <Button type="text" size="small" icon={<PaperClipOutlined />} onClick={() => fileInputRef.current?.click()} className="!h-6 !w-6 !min-w-0" style={{ color: faintColor, fontSize: 11 }} />
                </Tooltip>
                <Input.TextArea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="描述需求..."
                    autoSize={{ minRows: 1, maxRows: 2 }}
                    className="!text-[11px] !rounded-lg"
                    style={{ background: surfaceHover, borderColor: "transparent", color: textColor, resize: "none" }}
                />
                <Button type="text" size="small" icon={<SendOutlined />} onClick={handleSend} disabled={!input.trim() || !isConnected} className="!h-6 !w-6 !min-w-0" style={{ color: input.trim() && isConnected ? activeColor : faintColor, fontSize: 11 }} />
            </div>
        </div>
    );
}
