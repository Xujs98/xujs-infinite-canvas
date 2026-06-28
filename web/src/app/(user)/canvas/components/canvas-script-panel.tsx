"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Copy, Download, FolderOpen, LoaderCircle, Paperclip, X, ChevronRight, ChevronDown } from "lucide-react";
import { App, Button, Select, Tooltip } from "antd";
import ReactMarkdown from "react-markdown";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { useEffectiveConfig, useConfigStore, selectableModelsByCapability } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { useUserStore } from "@/stores/use-user-store";

interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
    toolCall?: { name: string; input: unknown; status: "running" | "done" };
}

interface GeneratedFile {
    name: string;
    path: string;
    size: number;
    type: "script" | "asset" | "storyboard";
}

interface CanvasScriptPanelProps {
    open: boolean;
    onClose: () => void;
}

const TEMPLATES = [
    { key: "novel", emoji: "📝", title: "小说改短剧", desc: "将小说改编为短剧剧本" },
    { key: "outline", emoji: "📖", title: "故事大纲→剧本", desc: "扩展大纲为完整剧本" },
    { key: "storyboard", emoji: "🎞️", title: "单集分镜", desc: "生成 Seedance 分镜" },
    { key: "optimize", emoji: "✨", title: "提示词优化", desc: "优化分镜提示词" },
];

const TEMPLATE_MAP: Record<string, string> = {
    novel: "帮我把我上传的故事改编成5集×15秒的短视频剧",
    outline: "我有一个故事概念，帮我开发成完整的剧本和分镜脚本",
    storyboard: "帮我生成一个15秒的Seedance分镜提示词，场景是",
    optimize: "帮我优化以下Seedance分镜提示词：",
};

function extractFolderName(name: string): string {
    if (name.startsWith(".")) return "";
    const m = name.replace(/\.md$/, "").match(/^(.+?)(?:_E\d+_分镜|_剧本|_素材清单)$/);
    return m ? m[1] : name.replace(/\.md$/, "");
}

function getChatId(): string {
    let id = localStorage.getItem("seedance_chat_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("seedance_chat_id", id); }
    return id;
}

function ToolPill({ name, status, input }: { name: string; status: string; input?: unknown }) {
    const done = status === "done";
    const inputStr = input ? JSON.stringify(input, null, 2) : "";
    return (
        <div className="max-w-[80%] overflow-hidden rounded-xl border px-4 py-3 text-[11px] font-mono leading-relaxed" style={{ borderColor: done ? "rgba(34,197,94,.35)" : "rgba(234,179,8,.35)", background: done ? "rgba(34,197,94,.06)" : "rgba(234,179,8,.06)" }}>
            <div className="flex items-center gap-1.5 mb-1">
                {done ? <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> : <LoaderCircle className="w-3 h-3 animate-spin text-yellow-500" />}
                <span className="font-semibold" style={{ color: done ? "#22c55e" : "#eab308" }}>{name}</span>
            </div>
            {inputStr && <pre className="whitespace-pre-wrap break-all opacity-70">{inputStr}</pre>}
        </div>
    );
}

export function CanvasScriptPanel({ open, onClose }: CanvasScriptPanelProps) {
    const theme = useCanvasTheme();
    const colorTheme = useThemeStore((s) => s.theme);
    const { message: antMessage } = App.useApp();
    const isDark = colorTheme === "dark";

    const token = useUserStore((s) => s.token);
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    const config = useEffectiveConfig();
    const modelCosts = useConfigStore((s) => s.publicSettings?.modelChannel.modelCosts);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<{ name: string; path: string }[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const [outputFiles, setOutputFiles] = useState<GeneratedFile[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [previewFile, setPreviewFile] = useState<string | null>(null);
    const [previewContent, setPreviewContent] = useState("");
    const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("seedance_script_model") || config.model || "");
    const textModels = selectableModelsByCapability(config, "text");
    const availableModels = textModels.length > 0 ? textModels : [];
    const wsRef = useRef<WebSocket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: selectedModel, count: 1, seconds: 1 });
    const tb = theme.toolbar;
    const nd = theme.node;

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    const refreshFiles = useCallback(async () => {
        try { const r = await fetch("/api/seedance/output", { headers: authHeaders }); if (r.ok) { const d = await r.json(); setOutputFiles(d || []); } } catch {}
    }, []);

    useEffect(() => { if (open) refreshFiles(); }, [open, refreshFiles]);
    useEffect(() => { refreshFiles(); }, [messages, refreshFiles]);


    useEffect(() => {
        if (!open) return;
        let ws: WebSocket;
        let timer: ReturnType<typeof setTimeout>;
        const connect = () => {
            const proto = window.location.protocol === "https:" ? "wss" : "ws";
            const wsHost = window.location.port === "3000" ? `${window.location.hostname}:8080` : window.location.host;
            const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
            ws = new WebSocket(`${proto}://${wsHost}/api/seedance/ws?chatId=${getChatId()}&model=${encodeURIComponent(selectedModel)}${tokenParam}`);
            ws.onopen = () => setIsConnected(true);
            ws.onclose = () => { setIsConnected(false); timer = setTimeout(connect, 3000); };
            ws.onmessage = (e) => {
                const d = JSON.parse(e.data);
                if (d.type === "assistant_message") {
                    setIsThinking(false);
                    setMessages(p => {
                        const last = p[p.length - 1];
                        if (last && last.role === "assistant" && !last.toolCall) {
                            return [...p.slice(0, -1), { ...last, content: last.content + (d.content || "") }];
                        }
                        return [...p, { id: crypto.randomUUID(), role: "assistant", content: d.content || "", timestamp: Date.now() }];
                    });
                } else if (d.type === "tool_use") {
                    setMessages(p => [...p, { id: crypto.randomUUID(), role: "system", content: "", toolCall: { name: d.toolName, input: d.toolInput, status: "running" }, timestamp: Date.now() }]);
                } else if (d.type === "tool_result") {
                    setMessages(p => {
                        const u = [...p];
                        for (let i = u.length - 1; i >= 0; i--) {
                            if (u[i].toolCall?.status === "running") {
                                u[i] = { ...u[i], toolCall: { ...u[i].toolCall!, status: "done" } };
                                break;
                            }
                        }
                        return u;
                    });
                } else if (d.type === "result") {
                    setIsThinking(false);
                } else if (d.type === "error") {
                    setIsThinking(false);
                    setMessages(p => [...p, { id: crypto.randomUUID(), role: "system", content: `⚠️ ${d.error}`, timestamp: Date.now() }]);
                }
            };
            wsRef.current = ws;
        };
        connect();
        return () => { clearTimeout(timer); ws?.close(); };
    }, [open, selectedModel]);

    const send = useCallback((text: string) => {
        if (!text.trim()) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            antMessage.warning("正在连接服务，请稍后重试");
            return;
        }
        setMessages(p => [...p, { id: crypto.randomUUID(), role: "user", content: text, timestamp: Date.now() }]);
        setIsThinking(true);
        wsRef.current.send(JSON.stringify({ type: "chat", chatId: getChatId(), content: text }));
    }, [antMessage]);

    const handleSend = useCallback(() => {
        const c = input.trim();
        if (!c && uploadedFiles.length === 0) return;
        let text = c;
        if (uploadedFiles.length > 0) {
            const fileMsg = uploadedFiles.map(f => `我上传了文件：${f.name}（${f.path}）`).join("、") + "，请查看。";
            text = text ? text + "\n" + fileMsg : fileMsg;
        }
        send(text);
        setInput("");
        setUploadedFiles([]);
    }, [input, uploadedFiles, send]);

    const handleUpload = async (files: FileList | null) => {
        if (!files) return;
        for (const f of Array.from(files)) {
            const fd = new FormData(); fd.append("file", f);
            try {
                const r = await fetch("/api/seedance/upload", { method: "POST", body: fd, headers: authHeaders });
                if (r.ok) {
                    const d = await r.json();
                    setUploadedFiles(p => [...p, { name: d.name, path: d.path }]);
                    antMessage.success(`文件 ${d.name} 上传成功`);
                }
            } catch { antMessage.error("上传失败"); }
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const openPreview = useCallback(async (path: string) => {
        const fileName = path.replace("seedance-script/output/", "");
        try {
            const r = await fetch(`/api/seedance/output/${fileName}`, { headers: authHeaders });
            if (!r.ok) { setPreviewContent("加载失败: " + r.status); setPreviewFile(path); return; }
            setPreviewContent(await r.text());
            setPreviewFile(path);
        } catch (e) { setPreviewContent("无法加载: " + String(e)); setPreviewFile(path); }
    }, []);

    const toggleFolder = useCallback((folder: string) => {
        setExpandedFolders(p => { const n = new Set(p); if (n.has(folder)) n.delete(folder); else n.add(folder); return n; });
    }, []);

    const handleDownloadFolderZip = useCallback(async (folder: string, files: GeneratedFile[]) => {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        const prefix = window.location.port === "3000" ? `http://${window.location.hostname}:8080` : "";
        for (const f of files) {
            try {
                const r = await fetch(`${prefix}/api/seedance/output/${f.path.replace("seedance-script/output/", "")}`, { headers: authHeaders });
                const text = await r.text();
                zip.file(f.name, text);
            } catch {}
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const u = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = u; a.download = `${folder}.zip`; a.click();
        URL.revokeObjectURL(u);
        antMessage.success(`${folder}.zip 下载完成`);
    }, [antMessage]);

    const folderMap = useCallback(() => {
        const map = new Map<string, GeneratedFile[]>();
        for (const f of outputFiles) {
            const folder = extractFolderName(f.name);
            if (!map.has(folder)) map.set(folder, []);
            map.get(folder)!.push(f);
        }
        return map;
    }, [outputFiles])();

    const handleDownloadMd = () => {
        const md = messages.filter(m => m.role === "assistant" && m.content.length > 50 && !m.toolCall);
        if (!md.length) return antMessage.warning("暂无生成内容");
        const b = new Blob([md[md.length - 1].content], { type: "text/markdown" });
        const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `脚本_${new Date().toLocaleDateString()}.md`; a.click(); URL.revokeObjectURL(u);
    };

    if (!open) return null;

    const mdMsgs = messages.filter(m => m.role === "assistant" && m.content.length > 50 && !m.toolCall);
    const hasMd = mdMsgs.length > 0;

    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ backdropFilter: "blur(12px)", backgroundColor: isDark ? "rgba(0,0,0,.55)" : "rgba(0,0,0,.2)" }}>
            {/* Panel */}
            <div className="flex h-[640px] w-[1000px] overflow-hidden rounded-3xl border" style={{ background: tb.panel, borderColor: nd.stroke, boxShadow: isDark ? "0 40px 100px rgba(0,0,0,.6)" : "0 40px 100px rgba(0,0,0,.12)" }}>

                {/* ─── Sidebar ─── */}
                {sidebarOpen && (
                    <div className="flex w-[220px] shrink-0 flex-col border-r" style={{ borderColor: nd.stroke, background: nd.panel }}>
                        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: nd.stroke }}>
                            <span className="text-xs font-semibold" style={{ color: nd.muted }}>生成文件</span>
                            <button onClick={refreshFiles} className="rounded-md p-1 transition hover:opacity-60" style={{ color: nd.faint }}><FolderOpen className="size-3.5" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto thin-scrollbar px-2 py-2">
                            {outputFiles.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 pt-16 opacity-40"><FolderOpen className="size-8" style={{ color: nd.faint }} /><span className="text-[11px]" style={{ color: nd.faint }}>暂无文件</span></div>
                            ) : Array.from(folderMap.entries()).map(([folder, files]) => (
                                <div key={folder} className="mb-1">
                                    <div className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 cursor-pointer transition" style={{ background: expandedFolders.has(folder) ? nd.fill : "transparent" }} onClick={() => toggleFolder(folder)} onMouseEnter={e => { if (!expandedFolders.has(folder)) e.currentTarget.style.background = nd.fill + "80"; }} onMouseLeave={e => { if (!expandedFolders.has(folder)) e.currentTarget.style.background = "transparent"; }}>
                                        {expandedFolders.has(folder) ? <ChevronDown className="size-3.5 shrink-0" style={{ color: nd.faint }} /> : <ChevronRight className="size-3.5 shrink-0" style={{ color: nd.faint }} />}
                                        <span className="text-sm shrink-0">📂</span>
                                        <span className="flex-1 truncate text-[12px] font-medium" style={{ color: nd.text }}>{folder}</span>
                                        <button onClick={(e) => { e.stopPropagation(); handleDownloadFolderZip(folder, files); }} className="rounded p-0.5 transition hover:opacity-60" style={{ color: nd.faint }} title="下载 ZIP"><Download className="size-3" /></button>
                                    </div>
                                    {expandedFolders.has(folder) && (
                                        <div className="ml-4 mt-0.5 space-y-0.5">
                                            {files.map(f => (
                                                <button key={f.path} onClick={() => openPreview(f.path)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition" style={{ background: previewFile === f.path ? nd.fill : "transparent" }} onMouseEnter={e => { if (previewFile !== f.path) e.currentTarget.style.background = nd.fill + "80"; }} onMouseLeave={e => { if (previewFile !== f.path) e.currentTarget.style.background = "transparent"; }}>
                                                    <span className="text-xs shrink-0">{f.type === "script" ? "🎬" : f.type === "asset" ? "🎨" : f.type === "storyboard" ? "🎞️" : "📄"}</span>
                                                    <span className="truncate text-[11px]" style={{ color: nd.text }}>{f.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                    </div>
                )}

                {/* ─── Main ─── */}
                <div className="flex min-w-0 flex-1 flex-col">

                    {/* Header */}
                    <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5" style={{ borderColor: nd.stroke }}>
                        <div className="flex items-center gap-2.5">
                            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="rounded-lg p-1.5 transition" style={{ background: sidebarOpen ? nd.fill : "transparent", color: sidebarOpen ? nd.text : nd.faint }}><FolderOpen className="size-4" /></button>
                            <span className="text-[13px] font-semibold" style={{ color: nd.text }}>视频脚本创作助手</span>
                            <span className="h-4 w-px" style={{ background: nd.stroke }} />
                            <Select size="small" value={selectedModel} onChange={v => { setSelectedModel(v); localStorage.setItem("seedance_script_model", v); }} options={availableModels.map(m => ({ label: m, value: m }))} style={{ width: 200, fontSize: 11 }} popupMatchSelectWidth={false} placeholder="选择模型" />
                            <div className="flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: nd.fill, color: nd.faint, fontSize: 10 }}>
                                <CreditSymbol style={{ fontSize: 8 }} />
                                <span className="font-medium">{credits}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="mr-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: isConnected ? "#22c55e" : "#ef4444" }} />
                            {hasMd && <>
                                <Tooltip title="复制 Markdown"><button onClick={() => { navigator.clipboard.writeText(mdMsgs[mdMsgs.length - 1].content); antMessage.success("已复制"); }} className="rounded-lg p-1.5 transition hover:opacity-60" style={{ color: nd.faint }}><Copy className="size-3.5" /></button></Tooltip>
                                <Tooltip title="下载 .md"><button onClick={handleDownloadMd} className="rounded-lg p-1.5 transition hover:opacity-60" style={{ color: nd.faint }}><Download className="size-3.5" /></button></Tooltip>
                                <span className="h-4 w-px" style={{ background: nd.stroke }} />
                            </>}
                            <button onClick={onClose} className="rounded-lg p-1.5 transition hover:opacity-60" style={{ color: nd.faint }}><X className="size-4" /></button>
                        </div>
                    </div>

                    {/* Messages / Welcome */}
                    <div className="flex-1 overflow-y-auto px-6 py-5 thin-scrollbar">
                        {previewFile ? (
                            <div className="mx-auto max-w-[700px]">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold" style={{ color: nd.text }}>{previewFile.split("/").pop()}</span>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <button onClick={() => { navigator.clipboard.writeText(previewContent); antMessage.success("已复制"); }} className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] transition hover:opacity-70" style={{ borderColor: nd.stroke, background: nd.fill, color: nd.text }}><Copy className="size-3" /> 复制</button>
                                        <button onClick={() => { const b = new Blob([previewContent], { type: "text/markdown" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = previewFile.split("/").pop() || "download.md"; a.click(); URL.revokeObjectURL(u); }} className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] transition hover:opacity-70" style={{ borderColor: nd.stroke, background: nd.fill, color: nd.text }}><Download className="size-3" /> 下载</button>
                                        <button onClick={() => setPreviewFile(null)} className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] transition hover:opacity-70" style={{ borderColor: nd.stroke, background: nd.fill, color: nd.text }}><X className="size-3" /> 关闭</button>
                                    </div>
                                </div>
                                <div style={{ color: nd.text, fontSize: 13, lineHeight: 1.85 }}><ReactMarkdown>{previewContent}</ReactMarkdown></div>
                            </div>
                        ) : hasMd ? (
                            <div className="mx-auto max-w-[700px]">
                                <div style={{ color: nd.text, fontSize: 13, lineHeight: 1.85 }}><ReactMarkdown>{mdMsgs[mdMsgs.length - 1].content}</ReactMarkdown></div>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-5">
                                <div className="flex size-16 items-center justify-center rounded-2xl" style={{ background: nd.fill }}><span className="text-2xl">🎬</span></div>
                                <div className="text-center">
                                    <h2 className="mb-1 text-base font-semibold" style={{ color: nd.text }}>视频脚本创作助手</h2>
                                    <p className="text-xs" style={{ color: nd.faint }}>描述你想创作的视频，AI 自动生成剧本、素材清单和分镜提示词</p>
                                </div>

                            </div>
                        ) : (
                            <div className="mx-auto max-w-[700px] space-y-4">
                                {messages.map(msg => (
                                    <div key={msg.id} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
                                        {msg.role === "user" ? (
                                            <div className="max-w-[75%] rounded-2xl rounded-br-md px-4 py-2.5 text-[13px] leading-relaxed text-white" style={{ background: theme.node.activeStroke }}>{msg.content}</div>
                                        ) : msg.role === "system" && msg.toolCall ? (
                                            <ToolPill name={msg.toolCall.name} status={msg.toolCall.status} input={msg.toolCall.input} />
                                        ) : (
                                            <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-3" style={{ background: nd.fill }}>
                                                <div style={{ color: nd.text }}><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {isThinking && (
                                    <div className="flex items-center gap-2 rounded-2xl px-4 py-2.5" style={{ background: nd.fill }}>
                                        <LoaderCircle className="size-4 animate-spin" style={{ color: nd.activeStroke }} />
                                        <span className="text-xs" style={{ color: nd.muted }}>创作中...</span>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="shrink-0 border-t px-5 py-3" style={{ borderColor: nd.stroke }}>
                        <div className="mx-auto max-w-[700px]">
                            {/* Uploaded file tags + template quick buttons */}
                            {uploadedFiles.length > 0 && (
                                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                                    {uploadedFiles.map((f, i) => (
                                        <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px]" style={{ borderColor: nd.stroke, background: nd.fill, color: nd.text }}>
                                            <Paperclip className="size-3 shrink-0" style={{ color: nd.faint }} />
                                            <span className="max-w-[140px] truncate">{f.name}</span>
                                            <button onClick={() => setUploadedFiles(p => p.filter((_, idx) => idx !== i))} className="ml-0.5 text-red-400 hover:text-red-300 text-[10px]">清除</button>
                                        </span>
                                    ))}
                                    {TEMPLATES.map(t => (
                                        <button key={t.key} onClick={() => { const text = TEMPLATE_MAP[t.key]; if (uploadedFiles.length > 0) { let msg = text; const fileMsg = uploadedFiles.map(f => `我上传了文件：${f.name}（${f.path}）`).join("、"); msg += "，" + fileMsg + "。请查看并按要求处理。"; setInput(""); setUploadedFiles([]); send(msg); } else { setInput(text); } }} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] transition-all hover:scale-[1.02]" style={{ borderColor: nd.stroke, background: nd.fill, color: nd.text }}>
                                            <span>{t.emoji}</span><span>{t.title}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-center gap-1.5 rounded-2xl border px-2 py-1.5 transition-colors focus-within:border-opacity-50" style={{ borderColor: nd.stroke, background: nd.fill }}>
                                <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.md,.doc,.docx,.pdf" multiple onChange={e => handleUpload(e.target.files)} />
                                <button onClick={() => fileInputRef.current?.click()} className="flex size-8 shrink-0 items-center justify-center rounded-xl transition" style={{ color: nd.faint }} onMouseEnter={e => e.currentTarget.style.background = nd.activeStroke + "12"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><Paperclip className="size-4" /></button>
                                <textarea ref={el => { if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 100) + "px"; } }} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="描述你想创作的视频内容..." rows={1} className="max-h-[100px] min-h-[32px] flex-1 resize-none bg-transparent py-1.5 text-[13px] leading-snug outline-none" style={{ color: nd.text }} />
                                <button onClick={handleSend} disabled={(!input.trim() && uploadedFiles.length === 0) || !isConnected} className="flex size-8 shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-25" style={{ background: (input.trim() || uploadedFiles.length > 0) && isConnected ? theme.node.activeStroke : "transparent", color: (input.trim() || uploadedFiles.length > 0) && isConnected ? "#fff" : nd.faint }}>
                                    <ArrowUp className="size-4" strokeWidth={2.5} />
                                </button>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
