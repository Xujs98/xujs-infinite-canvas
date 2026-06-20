"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Bot, History, ImageIcon, LoaderCircle, MessageSquare, PanelRightClose, Plus, RotateCcw, Settings2, Sparkles, Terminal, Trash2, X } from "lucide-react";
import { Button, Modal, Switch, Tooltip } from "antd";
import { motion } from "motion/react";

import { ImageGenerationPending } from "@/components/image-generation-pending";
import { ModelPicker } from "@/components/model-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfigStore, useEffectiveConfig, selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { nanoid } from "nanoid";
import { cn } from "@/lib/utils";
import { requestEdit, requestGeneration, requestImageQuestion, requestToolResponse, type ChatCompletionMessage, type ResponseFunctionTool, type ResponseInputMessage, type ResponseToolCall } from "@/services/api/image";
import { imageToDataUrl, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import type { ReferenceImage } from "@/types/image";
import { DiaTextReveal } from "@/components/ui/dia-text-reveal";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { MentionInput } from "./canvas-mention-input";
import { AgentChatComposer, AgentChatMessage, AgentModeSwitch, AgentPanelTabs, AgentWorkingMessage, type CanvasAgentChatMessage, type CanvasAgentMode } from "./canvas-agent-chat-ui";
import { summarizeCanvasAgentOps, type CanvasAgentOp, type CanvasAgentSnapshot } from "../utils/canvas-agent-ops";
import { CanvasNodeType, type CanvasAssistantImage, type CanvasAssistantMessage, type CanvasAssistantReference, type CanvasAssistantSession, type CanvasNodeData } from "../types";
import { NODE_DEFAULT_SIZE } from "../constants";

type AssistantMode = "ask" | "image" | "agent";
const PANEL_MOTION_MS = 500;
const PANEL_MOTION_SECONDS = PANEL_MOTION_MS / 1000;
const ONLINE_AGENT_MAX_STEPS = 4;

type CanvasAssistantPanelProps = {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    sessions: CanvasAssistantSession[];
    activeSessionId: string | null;
    onSelectNodeIds: (ids: Set<string>) => void;
    onSessionsChange: (sessions: CanvasAssistantSession[], activeSessionId: string | null) => void;
    onInsertImage: (image: CanvasAssistantImage) => void;
    onInsertText: (text: string) => void;
    onPasteImage: (file: File) => void;
    onCollapseStart: () => void;
    onCollapse: () => void;
    agentMode?: CanvasAgentMode;
    onAgentModeChange?: (mode: CanvasAgentMode) => void;
    snapshot?: CanvasAgentSnapshot;
    onApplyOps?: (ops: CanvasAgentOp[]) => unknown;
    canUndoOps?: boolean;
    onUndoOps?: () => CanvasAgentSnapshot | null;
};

const ONLINE_AGENT_PROMPT = "你是 Infinite Canvas 网页内置在线画布助手。当前画布 JSON 会随用户消息提供。首轮必须调用工具：只读问题调用 canvas_get_state，需要改动画布时调用和本地 Agent 一致的 infinite-canvas 工具。需要生成内容时直接调用 canvas_generate_text、canvas_generate_image、canvas_generate_video、canvas_generate_audio 或 canvas_create_generation_flow；需要精确批量操作时调用 canvas_apply_ops。不要输出 JSON ops，不要编造执行结果。工具参数涉及已有节点时必须使用当前画布 JSON 中真实存在的 id；缺少必要 id 或用户意图不明确时直接说明需要用户明确选择或说明，不要猜测。工具返回结果后，再根据真实结果回答用户。";

const ONLINE_AGENT_TOOLS: ResponseFunctionTool[] = [
    { type: "function", function: { name: "canvas_get_state", description: "获取当前画布完整状态（节点、连线、视口）", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_get_selection", description: "获取当前选中的节点 ID 列表", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_export_snapshot", description: "导出当前画布快照", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_apply_ops", description: "批量应用画布操作（增删改节点、连线、视口等）", parameters: { type: "object", properties: { ops: { type: "array", description: "操作列表", items: { type: "object", properties: { type: { type: "string", description: "操作类型: add_node, update_node, delete_node, connect_nodes, set_viewport, select_nodes, run_generation" }, id: { type: "string" }, ids: { type: "array", items: { type: "string" } }, nodeType: { type: "string", description: "image, text, config, video, audio" }, title: { type: "string" }, position: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false }, width: { type: "number" }, height: { type: "number" }, metadata: { type: "object" }, patch: { type: "object" }, fromNodeId: { type: "string" }, toNodeId: { type: "string" }, viewport: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, k: { type: "number" } }, required: ["x", "y", "k"], additionalProperties: false }, nodeId: { type: "string" }, mode: { type: "string" }, prompt: { type: "string" } }, required: ["type"], additionalProperties: false } } }, required: ["ops"], additionalProperties: false }, strict: false } },
    { type: "function", function: { name: "canvas_create_node", description: "创建指定类型的节点", parameters: { type: "object", properties: { nodeType: { type: "string", description: "image, text, config, video, audio" }, title: { type: "string" }, x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, metadata: { type: "object" } }, required: ["nodeType"], additionalProperties: false }, strict: false } },
    { type: "function", function: { name: "canvas_create_text_node", description: "创建文本节点", parameters: { type: "object", properties: { content: { type: "string", description: "文本内容" }, title: { type: "string" }, x: { type: "number" }, y: { type: "number" } }, required: ["content"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_create_text_nodes", description: "批量创建文本节点", parameters: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { content: { type: "string" }, title: { type: "string" }, x: { type: "number" }, y: { type: "number" } }, required: ["content"], additionalProperties: false } } }, required: ["items"], additionalProperties: false }, strict: false } },
    { type: "function", function: { name: "canvas_create_config_node", description: "创建生成配置节点", parameters: { type: "object", properties: { content: { type: "string" }, generationMode: { type: "string", description: "text, image, video, audio" }, x: { type: "number" }, y: { type: "number" } }, required: [], additionalProperties: false }, strict: false } },
    { type: "function", function: { name: "canvas_create_image_prompt_flow", description: "创建图片生成流程（文本提示节点 → 图片节点 + 连线）", parameters: { type: "object", properties: { prompt: { type: "string", description: "图片生成提示词" }, x: { type: "number" }, y: { type: "number" } }, required: ["prompt"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_create_generation_flow", description: "创建生成流程（配置节点 → 生成节点 + 连线）", parameters: { type: "object", properties: { prompt: { type: "string" }, mode: { type: "string", description: "text, image, video, audio" }, x: { type: "number" }, y: { type: "number" } }, required: ["prompt", "mode"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_generate_text", description: "创建文本节点并触发文本生成", parameters: { type: "object", properties: { prompt: { type: "string", description: "生成提示词" }, x: { type: "number" }, y: { type: "number" } }, required: ["prompt"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_generate_image", description: "创建图片节点并触发图片生成", parameters: { type: "object", properties: { prompt: { type: "string", description: "图片生成提示词" }, x: { type: "number" }, y: { type: "number" } }, required: ["prompt"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_generate_video", description: "创建视频节点并触发视频生成", parameters: { type: "object", properties: { prompt: { type: "string", description: "视频生成提示词" }, x: { type: "number" }, y: { type: "number" } }, required: ["prompt"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_generate_audio", description: "创建音频节点并触发音频生成", parameters: { type: "object", properties: { prompt: { type: "string", description: "音频生成提示词" }, x: { type: "number" }, y: { type: "number" } }, required: ["prompt"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_update_node", description: "更新节点属性", parameters: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, width: { type: "number" }, height: { type: "number" }, metadata: { type: "object" } }, required: ["id"], additionalProperties: false }, strict: false } },
    { type: "function", function: { name: "canvas_update_node_text", description: "更新文本节点内容", parameters: { type: "object", properties: { id: { type: "string" }, content: { type: "string" } }, required: ["id", "content"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_move_nodes", description: "移动节点位置", parameters: { type: "object", properties: { ids: { type: "array", items: { type: "string" } }, x: { type: "number" }, y: { type: "number" } }, required: ["ids", "x", "y"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_resize_node", description: "调整节点尺寸", parameters: { type: "object", properties: { id: { type: "string" }, width: { type: "number" }, height: { type: "number" } }, required: ["id", "width", "height"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_delete_nodes", description: "删除指定节点及其连线", parameters: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_connect_nodes", description: "在两个节点之间创建连线", parameters: { type: "object", properties: { fromNodeId: { type: "string" }, toNodeId: { type: "string" } }, required: ["fromNodeId", "toNodeId"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_select_nodes", description: "选中指定节点", parameters: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_set_viewport", description: "设置画布视口位置和缩放", parameters: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, k: { type: "number" } }, required: ["x", "y", "k"], additionalProperties: false }, strict: true } },
    { type: "function", function: { name: "canvas_run_generation", description: "对已有节点触发内容生成", parameters: { type: "object", properties: { nodeId: { type: "string" }, mode: { type: "string", description: "text, image, video, audio" }, prompt: { type: "string" } }, required: ["nodeId"], additionalProperties: false }, strict: false } },
];

function isOnlineReadTool(name: string) {
    return name === "canvas_get_state" || name === "canvas_get_selection" || name === "canvas_export_snapshot";
}

function onlineToolLabel(name: string) {
    const map: Record<string, string> = {
        canvas_get_state: "读取画布",
        canvas_get_selection: "读取选区",
        canvas_export_snapshot: "导出快照",
        canvas_apply_ops: "画布操作",
        canvas_create_node: "创建节点",
        canvas_create_text_node: "创建文本",
        canvas_create_text_nodes: "批量创建文本",
        canvas_create_config_node: "创建配置",
        canvas_create_image_prompt_flow: "创建生图流程",
        canvas_create_generation_flow: "创建生成流程",
        canvas_generate_text: "生成文本",
        canvas_generate_image: "生成图片",
        canvas_generate_video: "生成视频",
        canvas_generate_audio: "生成音频",
        canvas_update_node: "更新节点",
        canvas_update_node_text: "更新文本",
        canvas_move_nodes: "移动节点",
        canvas_resize_node: "调整尺寸",
        canvas_delete_nodes: "删除节点",
        canvas_connect_nodes: "连接节点",
        canvas_select_nodes: "选择节点",
        canvas_set_viewport: "调整视口",
        canvas_run_generation: "触发生成",
    };
    return map[name] || name;
}

type AgentEventLog = { id: string; time: string; title: string; text: string; raw?: unknown };

export function CanvasAssistantPanel({ nodes, selectedNodeIds, sessions, activeSessionId, onSelectNodeIds, onSessionsChange, onInsertImage, onInsertText, onPasteImage, onCollapseStart, onCollapse, agentMode: agentModeProp, onAgentModeChange, snapshot, onApplyOps, canUndoOps, onUndoOps }: CanvasAssistantPanelProps) {
    const theme = useCanvasTheme();
    const effectiveConfig = useEffectiveConfig();
    const modelCosts = useConfigStore((state) => state.publicSettings?.modelChannel.modelCosts);
    const cleanupImages = useAssetStore((state) => state.cleanupImages);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const user = useUserStore((state) => state.user);
    const [width, setWidth] = useState(390);
    const [view, setView] = useState<"chat" | "history">("chat");
    const [mode, setMode] = useState<AssistantMode>("image");
    const [prompt, setPrompt] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [checkedChatIds, setCheckedChatIds] = useState<string[]>([]);
    const [deleteChatIds, setDeleteChatIds] = useState<string[]>([]);
    const [closing, setClosing] = useState(false);
    const [resizing, setResizing] = useState(false);
    const [removedReferenceIds, setRemovedReferenceIds] = useState<Set<string>>(new Set());
    const [localSessions, setLocalSessions] = useState<CanvasAssistantSession[]>(() => (sessions.length ? sessions : [createSession()]));
    const [localActiveSessionId, setLocalActiveSessionId] = useState<string | null>(activeSessionId);

    // Agent mode state
    const [localAgentMode, setLocalAgentMode] = useState<CanvasAgentMode>("online");
    const agentMode = agentModeProp ?? localAgentMode;
    const [agentTab, setAgentTab] = useState<"chat" | "history" | "log">("chat");
    const [agentMessages, setAgentMessages] = useState<CanvasAgentChatMessage[]>([]);
    const [agentPrompt, setAgentPrompt] = useState("");
    const [agentSending, setAgentSending] = useState(false);
    const [confirmTools, setConfirmTools] = useState(true);
    const [agentEventLogs, setAgentEventLogs] = useState<AgentEventLog[]>([]);
    const agentListRef = useRef<HTMLDivElement>(null);
    const pendingResolveRef = useRef<((approved: boolean) => void) | null>(null);
    const agentSnapshotRef = useRef<CanvasAgentSnapshot | undefined>(snapshot);

    useEffect(() => {
        agentSnapshotRef.current = snapshot;
    }, [snapshot]);

    useEffect(() => {
        agentListRef.current?.scrollTo({ top: agentListRef.current.scrollHeight });
    }, [agentMessages, agentSending]);

    const agentConfig = useMemo<AiConfig>(() => ({ ...effectiveConfig, model: effectiveConfig.textModel || effectiveConfig.model }), [effectiveConfig]);
    const agentModels = useMemo(() => selectableModelsByCapability(effectiveConfig, "text"), [effectiveConfig]);

    const setAgentMode = useCallback((next: CanvasAgentMode) => {
        setLocalAgentMode(next);
        onAgentModeChange?.(next);
    }, [onAgentModeChange]);

    const addAgentMessage = useCallback((item: Omit<CanvasAgentChatMessage, "id"> & { id?: string }) => {
        const msg: CanvasAgentChatMessage = { id: item.id || nanoid(), role: item.role, title: item.title, text: item.text, meta: item.meta, detail: item.detail, attachments: item.attachments };
        setAgentMessages((prev) => [...prev, msg]);
        return msg.id;
    }, []);

    const updateAgentMessage = useCallback((id: string, patch: Partial<CanvasAgentChatMessage>) => {
        setAgentMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    }, []);

    const addAgentLog = useCallback((title: string, text: string, raw?: unknown) => {
        setAgentEventLogs((prev) => [...prev.slice(-160), { id: `${Date.now()}-${Math.random()}`, time: new Date().toLocaleTimeString(), title, text, raw }]);
    }, []);

    const executeOnlineTool = useCallback(async (name: string, args: Record<string, unknown>): Promise<{ summary: string; data: unknown }> => {
        const snap = agentSnapshotRef.current;
        if (!snap) throw new Error("画布快照不可用");

        if (name === "canvas_get_state" || name === "canvas_export_snapshot") {
            return { summary: `读取到 ${snap.nodes.length} 个节点，${snap.connections.length} 条连线`, data: snap };
        }
        if (name === "canvas_get_selection") {
            return { summary: `选中 ${snap.selectedNodeIds.length} 个节点`, data: { selectedNodeIds: snap.selectedNodeIds } };
        }
        if (name === "canvas_apply_ops") {
            const ops = (args.ops || []) as CanvasAgentOp[];
            if (!ops.length) return { summary: "没有操作", data: { ops: [] } };
            const result = await onApplyOps?.(ops);
            return { summary: summarizeCanvasAgentOps(ops) || "画布操作完成", data: result };
        }

        const ops: CanvasAgentOp[] = [];
        let summary = "";

        if (name === "canvas_create_node") {
            ops.push({ type: "add_node", nodeType: (args.nodeType as CanvasNodeType) || CanvasNodeType.Text, title: args.title as string, x: args.x as number, y: args.y as number, width: args.width as number, height: args.height as number, metadata: args.metadata as Record<string, unknown> });
            summary = `创建了 ${(args.nodeType as string) || "text"} 节点`;
        } else if (name === "canvas_create_text_node") {
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            ops.push({ type: "add_node", nodeType: CanvasNodeType.Text, title: (args.title as string) || spec.title, x: args.x as number, y: args.y as number, metadata: { content: args.content as string, status: "idle", fontSize: 14 } });
            summary = "创建了文本节点";
        } else if (name === "canvas_create_text_nodes") {
            const items = (args.items || []) as Array<{ content: string; title?: string; x?: number; y?: number }>;
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            items.forEach((item, index) => {
                ops.push({ type: "add_node", nodeType: CanvasNodeType.Text, title: item.title || spec.title, x: item.x ?? (snap.nodes.length + index) * 36, y: item.y ?? (snap.nodes.length + index) * 36, metadata: { content: item.content, status: "idle", fontSize: 14 } });
            });
            summary = `批量创建了 ${items.length} 个文本节点`;
        } else if (name === "canvas_create_config_node") {
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
            ops.push({ type: "add_node", nodeType: CanvasNodeType.Config, title: spec.title, x: args.x as number, y: args.y as number, metadata: { content: (args.content as string) || "", status: "idle", generationMode: (args.generationMode as string) || "image" } });
            summary = "创建了生成配置节点";
        } else if (name === "canvas_create_image_prompt_flow") {
            const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const imgSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const x = (args.x as number) ?? snap.nodes.length * 36;
            const y = (args.y as number) ?? snap.nodes.length * 36;
            const textId = `text-${nanoid(6)}`;
            const imgId = `image-${nanoid(6)}`;
            ops.push({ type: "add_node", id: textId, nodeType: CanvasNodeType.Text, title: textSpec.title, x, y, metadata: { content: args.prompt as string, status: "idle", fontSize: 14 } });
            ops.push({ type: "add_node", id: imgId, nodeType: CanvasNodeType.Image, title: imgSpec.title, x: x + 400, y, metadata: { prompt: args.prompt as string, status: "idle", generationMode: "image" } });
            ops.push({ type: "connect_nodes", fromNodeId: textId, toNodeId: imgId });
            summary = "创建了图片生成流程（文本 → 图片）";
        } else if (name === "canvas_create_generation_flow") {
            const mode = (args.mode as string) || "image";
            const nodeType = mode === "text" ? CanvasNodeType.Text : mode === "video" ? CanvasNodeType.Video : mode === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Image;
            const cfgSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
            const genSpec = NODE_DEFAULT_SIZE[nodeType];
            const x = (args.x as number) ?? snap.nodes.length * 36;
            const y = (args.y as number) ?? snap.nodes.length * 36;
            const cfgId = `config-${nanoid(6)}`;
            const genId = `${nodeType}-${nanoid(6)}`;
            ops.push({ type: "add_node", id: cfgId, nodeType: CanvasNodeType.Config, title: cfgSpec.title, x, y, metadata: { content: args.prompt as string, status: "idle", generationMode: mode } });
            ops.push({ type: "add_node", id: genId, nodeType, title: genSpec.title, x: x + 400, y, metadata: { prompt: args.prompt as string, status: "idle", generationMode: mode } });
            ops.push({ type: "connect_nodes", fromNodeId: cfgId, toNodeId: genId });
            summary = `创建了${mode === "text" ? "文本" : mode === "video" ? "视频" : mode === "audio" ? "音频" : "图片"}生成流程`;
        } else if (name === "canvas_generate_text" || name === "canvas_generate_image" || name === "canvas_generate_video" || name === "canvas_generate_audio") {
            const mode = name.replace("canvas_generate_", "") as "text" | "image" | "video" | "audio";
            const nodeType = mode === "text" ? CanvasNodeType.Text : mode === "video" ? CanvasNodeType.Video : mode === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Image;
            const spec = NODE_DEFAULT_SIZE[nodeType];
            const nodeId = `${nodeType}-${nanoid(6)}`;
            const x = (args.x as number) ?? snap.nodes.length * 36;
            const y = (args.y as number) ?? snap.nodes.length * 36;
            ops.push({ type: "add_node", id: nodeId, nodeType, title: spec.title, x, y, metadata: { prompt: args.prompt as string, status: "idle", generationMode: mode } });
            ops.push({ type: "run_generation", nodeId, mode, prompt: args.prompt as string });
            summary = `创建了${mode === "text" ? "文本" : mode === "video" ? "视频" : mode === "audio" ? "音频" : "图片"}节点并触发生成`;
        } else if (name === "canvas_update_node") {
            const patch: Record<string, unknown> = {};
            if (args.title !== undefined) patch.title = args.title;
            if (args.width !== undefined) patch.width = args.width;
            if (args.height !== undefined) patch.height = args.height;
            ops.push({ type: "update_node", id: args.id as string, patch, metadata: args.metadata as Record<string, unknown> });
            summary = "更新了节点";
        } else if (name === "canvas_update_node_text") {
            ops.push({ type: "update_node", id: args.id as string, metadata: { content: args.content as string } });
            summary = "更新了文本内容";
        } else if (name === "canvas_move_nodes") {
            const ids = (args.ids || []) as string[];
            ops.push({ type: "set_viewport", viewport: { x: 0, y: 0, k: 1 } });
            ids.forEach((id) => ops.push({ type: "update_node", id, patch: { position: { x: args.x as number, y: args.y as number } } }));
            summary = `移动了 ${ids.length} 个节点`;
        } else if (name === "canvas_resize_node") {
            ops.push({ type: "update_node", id: args.id as string, patch: { width: args.width as number, height: args.height as number } });
            summary = "调整了节点尺寸";
        } else if (name === "canvas_delete_nodes") {
            ops.push({ type: "delete_node", ids: (args.ids || []) as string[] });
            summary = `删除了 ${((args.ids || []) as string[]).length} 个节点`;
        } else if (name === "canvas_connect_nodes") {
            ops.push({ type: "connect_nodes", fromNodeId: args.fromNodeId as string, toNodeId: args.toNodeId as string });
            summary = "创建了连线";
        } else if (name === "canvas_select_nodes") {
            ops.push({ type: "select_nodes", ids: (args.ids || []) as string[] });
            summary = `选中了 ${((args.ids || []) as string[]).length} 个节点`;
        } else if (name === "canvas_set_viewport") {
            ops.push({ type: "set_viewport", viewport: { x: args.x as number, y: args.y as number, k: args.k as number } });
            summary = "调整了视口";
        } else if (name === "canvas_run_generation") {
            ops.push({ type: "run_generation", nodeId: args.nodeId as string, mode: (args.mode as "text" | "image" | "video" | "audio") || "image", prompt: args.prompt as string });
            summary = "触发了内容生成";
        } else {
            throw new Error(`未知工具: ${name}`);
        }

        if (ops.length) {
            const result = await onApplyOps?.(ops);
            return { summary, data: result };
        }
        return { summary, data: null };
    }, [onApplyOps]);

    const waitForToolConfirmation = useCallback((call: ResponseToolCall, args: Record<string, unknown>): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            const summary = call.function.name === "canvas_apply_ops"
                ? summarizeCanvasAgentOps((args.ops || []) as CanvasAgentOp[]) || "画布操作"
                : onlineToolLabel(call.function.name);
            const pendingId = nanoid();
            setAgentMessages((prev) => [...prev, {
                id: pendingId,
                role: "tool",
                title: "确认工具调用",
                text: summary,
                detail: { status: "pending", name: call.function.name, input: args },
            }]);
            pendingResolveRef.current = (approved) => {
                updateAgentMessage(pendingId, {
                    title: approved ? "已批准执行" : "拒绝执行",
                    detail: { status: approved ? "completed" : "rejected", name: call.function.name, input: args },
                });
                resolve(approved);
            };
        });
    }, [updateAgentMessage]);

    const runOnlineAgentLoop = useCallback(async (inputMessages: ResponseInputMessage[]) => {
        let steps = 0;
        while (steps < ONLINE_AGENT_MAX_STEPS) {
            steps++;
            addAgentLog("请求模型", `步骤 ${steps}/${ONLINE_AGENT_MAX_STEPS}`);

            let result: { content: string; toolCalls: ResponseToolCall[] };
            try {
                result = await requestToolResponse(agentConfig, inputMessages, ONLINE_AGENT_TOOLS, "auto");
            } catch (error) {
                throw new Error(error instanceof Error ? error.message : "模型请求失败");
            }

            if (result.content) {
                addAgentMessage({ role: "assistant", text: result.content, title: "Agent" });
                addAgentLog("模型回复", result.content.slice(0, 200));
            }

            if (!result.toolCalls.length) break;

            for (const call of result.toolCalls) {
                let args: Record<string, unknown> = {};
                try { args = JSON.parse(call.function.arguments); } catch {}

                addAgentLog("工具调用", `${call.function.name}`, { name: call.function.name, args });

                const isWritable = !isOnlineReadTool(call.function.name);
                if (confirmTools && isWritable) {
                    setAgentSending(false);
                    const approved = await waitForToolConfirmation(call, args);
                    addAgentLog(approved ? "已批准" : "已拒绝", call.function.name);
                    if (!approved) {
                        inputMessages.push(
                            { type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments },
                            { role: "tool", tool_call_id: call.id, content: "用户拒绝了此操作" },
                        );
                        continue;
                    }
                    setAgentSending(true);
                }

                try {
                    const toolResult = await executeOnlineTool(call.function.name, args);
                    addAgentMessage({ role: "tool", title: `${onlineToolLabel(call.function.name)}完成`, text: toolResult.summary, detail: { name: call.function.name, input: args, result: toolResult.data } });
                    addAgentLog("工具完成", toolResult.summary);
                    inputMessages.push(
                        { type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments },
                        { role: "tool", tool_call_id: call.id, content: JSON.stringify(toolResult.data ?? toolResult.summary) },
                    );
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : "工具执行失败";
                    addAgentMessage({ role: "error", text: errMsg });
                    addAgentLog("工具失败", errMsg);
                    inputMessages.push(
                        { type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments },
                        { role: "tool", tool_call_id: call.id, content: `Error: ${errMsg}` },
                    );
                }
            }
        }
    }, [addAgentLog, addAgentMessage, agentConfig, confirmTools, executeOnlineTool, waitForToolConfirmation]);

    const sendAgentMessage = useCallback(async (text: string) => {
        if (!text.trim() || agentSending) return;
        if (!isAiConfigReady(agentConfig, agentConfig.model)) {
            openConfigDialog(true);
            return;
        }
        addAgentMessage({ role: "user", text });
        setAgentPrompt("");
        setAgentSending(true);
        addAgentLog("用户发送", text);

        try {
            const snap = agentSnapshotRef.current;
            const stateJson = snap ? JSON.stringify(snap, null, 2) : "{}";
            const systemContent = `${ONLINE_AGENT_PROMPT}\n\n当前画布状态：\n${stateJson}`;
            const inputMessages: ResponseInputMessage[] = [
                { role: "system", content: systemContent },
                ...agentMessages.map((m) => ({ role: m.role === "user" ? "user" as const : "assistant" as const, content: m.text })),
                { role: "user", content: text },
            ];
            await runOnlineAgentLoop(inputMessages);
        } catch (error) {
            addAgentMessage({ role: "error", text: error instanceof Error ? error.message : "操作失败" });
            addAgentLog("错误", error instanceof Error ? error.message : "操作失败");
        } finally {
            setAgentSending(false);
        }
    }, [addAgentLog, addAgentMessage, agentConfig, agentMessages, agentSending, isAiConfigReady, openConfigDialog, runOnlineAgentLoop]);

    const handleApproveTool = useCallback(() => {
        pendingResolveRef.current?.(true);
        pendingResolveRef.current = null;
    }, []);

    const handleRejectTool = useCallback(() => {
        pendingResolveRef.current?.(false);
        pendingResolveRef.current = null;
    }, []);

    const undoAgentOps = useCallback(() => {
        const restored = onUndoOps?.();
        if (!restored) return;
        addAgentMessage({ role: "tool", title: "已撤销", text: "上一次工具操作" });
    }, [addAgentMessage, onUndoOps]);

    useEffect(() => {
        if (!sessions.length) return;
        setLocalSessions(sessions);
        setLocalActiveSessionId(activeSessionId);
    }, [activeSessionId, sessions]);

    useEffect(() => {
        onSessionsChange(localSessions, localActiveSessionId);
    }, [localActiveSessionId, localSessions, onSessionsChange]);

    const safeSessions = localSessions.length ? localSessions : [createSession()];
    const activeSession = useMemo(() => safeSessions.find((session) => session.id === localActiveSessionId) || safeSessions[0] || null, [localActiveSessionId, safeSessions]);
    const historySessions = safeSessions.filter((session) => session.messages.length > 0);
    const messages = activeSession?.messages || [];
    const hasMessages = messages.length > 0;
    const selectedNodeKey = useMemo(() => Array.from(selectedNodeIds).sort().join(","), [selectedNodeIds]);
    const allSelectedReferences = useMemo(() => buildAssistantReferences(nodes, selectedNodeIds), [nodes, selectedNodeIds]);
    const selectedReferences = useMemo(() => allSelectedReferences.filter((item) => !removedReferenceIds.has(item.id)), [allSelectedReferences, removedReferenceIds]);
    const assistantConfig = useMemo(() => ({ ...effectiveConfig, count: effectiveConfig.canvasImageCount || effectiveConfig.count }), [effectiveConfig]);
    const iconButtonStyle = { color: theme.node.muted };

    useEffect(() => {
        setRemovedReferenceIds(new Set());
    }, [selectedNodeKey]);

    const updateSession = (sessionId: string, updater: (session: CanvasAssistantSession) => CanvasAssistantSession) => {
        setLocalSessions((prev) => prev.map((session) => (session.id === sessionId ? updater(session) : session)));
    };

    const appendMessage = (sessionId: string, message: CanvasAssistantMessage) => {
        updateSession(sessionId, (session) => ({
            ...session,
            title: session.messages.length ? session.title : message.text.slice(0, 18) || "新对话",
            messages: [...session.messages, message],
            updatedAt: new Date().toISOString(),
        }));
    };

    const updateMessage = (sessionId: string, messageId: string, patch: Partial<CanvasAssistantMessage>) => {
        updateSession(sessionId, (session) => ({
            ...session,
            messages: session.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
            updatedAt: new Date().toISOString(),
        }));
    };

    const startChatSession = () => {
        if (activeSession && activeSession.messages.length === 0) {
            setLocalActiveSessionId(activeSession.id);
            return;
        }
        const session = createSession();
        setLocalSessions((prev) => [session, ...prev]);
        setLocalActiveSessionId(session.id);
    };

    const removeSessions = (ids: string[]) => {
        const next = safeSessions.filter((session) => !ids.includes(session.id));
        if (!next.length) {
            const session = createSession();
            setLocalSessions([session]);
            setLocalActiveSessionId(session.id);
        } else {
            setLocalSessions(next);
            setLocalActiveSessionId(localActiveSessionId && ids.includes(localActiveSessionId) ? next[0].id : localActiveSessionId);
        }
        cleanupImages({ sessions: next });
        setCheckedChatIds((prev) => prev.filter((id) => !ids.includes(id)));
    };

    const clearSessions = () => {
        const session = createSession();
        setLocalSessions([session]);
        setLocalActiveSessionId(session.id);
        setCheckedChatIds([]);
        cleanupImages({ sessions: [session] });
    };

    const sendMessage = async (text: string, nextMode: AssistantMode, history: CanvasAssistantMessage[], savedReferences?: CanvasAssistantReference[]) => {
        const requestConfig = { ...effectiveConfig, count: nextMode === "image" ? effectiveConfig.canvasImageCount || effectiveConfig.count : effectiveConfig.count, model: nextMode === "image" ? effectiveConfig.imageModel || effectiveConfig.model : effectiveConfig.textModel || effectiveConfig.model };
        if (!isAiConfigReady(requestConfig, requestConfig.model)) {
            openConfigDialog(true);
            return;
        }

        const session = activeSession || createSession();
        if (!activeSession) {
            setLocalSessions([session]);
            setLocalActiveSessionId(session.id);
        }

        const refs = savedReferences || selectedReferences;
        const userMessage: CanvasAssistantMessage = { id: nanoid(), role: "user", mode: nextMode, text, references: refs };
        const assistantId = nanoid();
        appendMessage(session.id, userMessage);
        appendMessage(session.id, { id: assistantId, role: "assistant", mode: nextMode, text: nextMode === "image" ? "正在生成图片" : "正在回答", isLoading: true });
        setPrompt("");
        setIsRunning(true);

        try {
            if (nextMode === "image") {
                const referenceImages: ReferenceImage[] = await Promise.all(
                    refs.filter((item) => item.dataUrl).map(async (item) => ({ id: item.id, name: `${item.title}.png`, type: "image/png", dataUrl: await imageToDataUrl(item), storageKey: item.storageKey })),
                );
                const images = referenceImages.length ? await requestEdit(requestConfig, text, referenceImages) : await requestGeneration(requestConfig, text);
                const storedImages = await Promise.all(images.map((image) => uploadImage(image.dataUrl)));
                updateMessage(session.id, assistantId, {
                    text: `生成了 ${storedImages.length} 张图片`,
                    images: storedImages.map((image, index) => ({ id: images[index].id, dataUrl: image.url, storageKey: image.storageKey, prompt: text })),
                    isLoading: false,
                });
                return;
            }

            const answer = await requestImageQuestion(requestConfig, await buildChatMessages([...history, userMessage]), (streamed) => {
                updateMessage(session.id, assistantId, { text: streamed, isLoading: false });
            });
            updateMessage(session.id, assistantId, { text: answer, isLoading: false });
        } catch (error) {
            updateMessage(session.id, assistantId, { text: error instanceof Error ? error.message : "操作失败", isLoading: false });
        } finally {
            setIsRunning(false);
        }
    };

    const submit = async () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        await sendMessage(text, mode, messages);
    };

    const retryMessage = (message: CanvasAssistantMessage) => {
        const index = messages.findIndex((item) => item.id === message.id);
        const userIndex = messages.slice(0, index).findLastIndex((item) => item.role === "user");
        const user = messages[userIndex];
        if (user) void sendMessage(user.text, user.mode, messages.slice(0, userIndex), user.references);
    };

    const startResize = () => {
        const move = (event: MouseEvent) => setWidth(Math.min(760, Math.max(320, window.innerWidth - event.clientX)));
        const stop = () => {
            setResizing(false);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
        };
        setResizing(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", stop);
    };

    const collapse = () => {
        setClosing(true);
        onCollapseStart();
        window.setTimeout(onCollapse, PANEL_MOTION_MS);
    };

    const isAgentMode = mode === "agent";
    const hasPendingTool = agentMessages.some((m) => m.role === "tool" && m.detail && typeof m.detail === "object" && "status" in (m.detail as Record<string, unknown>) && (m.detail as Record<string, unknown>).status === "pending");

    return (
        <motion.div
            className="flex shrink-0"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: closing ? 0 : width + 1, opacity: closing ? 0 : 1 }}
            transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "clip", pointerEvents: closing ? "none" : undefined }}
        >
            <motion.aside
                className="relative flex shrink-0 flex-col border-l"
                initial={{ x: 48 }}
                animate={{ x: closing ? 28 : 0 }}
                transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{ width, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            >
                <button type="button" className="absolute inset-y-0 left-0 z-40 w-4 -translate-x-1/2 cursor-col-resize" onMouseDown={startResize} aria-label="调整右侧面板宽度" />
                <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="size-4" />
                        {view === "history" && !isAgentMode ? "历史记录" : isAgentMode ? "画布助手" : "画布助手(未开发)"}
                    </div>
                    <div className="flex items-center gap-1">
                        {view === "history" && !isAgentMode ? (
                            <>
                                <Tooltip title="删除选中">
                                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Trash2 className="size-4" />} disabled={!checkedChatIds.length} onClick={() => setDeleteChatIds(checkedChatIds)} />
                                </Tooltip>
                                <Tooltip title="删除全部">
                                    <Button
                                        type="text"
                                        shape="circle"
                                        className="!h-8 !w-8 !min-w-8"
                                        style={iconButtonStyle}
                                        icon={<X className="size-4" />}
                                        disabled={!historySessions.length}
                                        onClick={() => setDeleteChatIds(historySessions.map((session) => session.id))}
                                    />
                                </Tooltip>
                            </>
                        ) : null}
                        {!isAgentMode ? (
                            <Tooltip title={view === "history" ? "返回对话" : "历史记录"}>
                                <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<History className="size-4" />} onClick={() => setView(view === "history" ? "chat" : "history")} />
                            </Tooltip>
                        ) : null}
                        {!isAgentMode ? (
                            <Tooltip title="新对话">
                                <Button
                                    type="text"
                                    shape="circle"
                                    className="!h-8 !w-8 !min-w-8"
                                    style={iconButtonStyle}
                                    icon={<Plus className="size-4" />}
                                    disabled={!hasMessages}
                                    onClick={() => {
                                        startChatSession();
                                        setView("chat");
                                    }}
                                />
                            </Tooltip>
                        ) : null}
                        <Tooltip title="配置">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Settings2 className="size-4" />} onClick={() => openConfigDialog(false)} />
                        </Tooltip>
                        <Tooltip title="收起对话">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<PanelRightClose className="size-4" />} onClick={collapse} />
                        </Tooltip>
                    </div>
                </div>

                {isAgentMode ? (
                    <AgentModeHeader
                        theme={theme}
                        agentMode={agentMode}
                        confirmTools={confirmTools}
                        agentTab={agentTab}
                        agentEventLogs={agentEventLogs}
                        canUndoOps={canUndoOps}
                        onAgentModeChange={setAgentMode}
                        onConfirmToolsChange={setConfirmTools}
                        onTabChange={setAgentTab}
                        onUndo={undoAgentOps}
                    />
                ) : null}

                {isAgentMode && agentTab === "history" ? (
                    <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                        <AssistantHistory
                            sessions={historySessions}
                            activeSession={activeSession}
                            checkedIds={checkedChatIds.filter((id) => historySessions.some((session) => session.id === id))}
                            onToggleChecked={(id, checked) => setCheckedChatIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)))}
                            onOpen={(id) => {
                                setLocalActiveSessionId(id);
                                setAgentTab("chat");
                                setMode("image");
                            }}
                            onDelete={(id) => setDeleteChatIds([id])}
                        />
                    </div>
                ) : isAgentMode && agentTab === "log" ? (
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-xs" style={{ color: theme.node.muted }}>{agentEventLogs.length} 条日志</span>
                            <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} disabled={!agentEventLogs.length} onClick={() => setAgentEventLogs([])}>清空</Button>
                        </div>
                        <div className="space-y-2">
                            {agentEventLogs.map((log) => (
                                <div key={log.id} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: theme.node.stroke }}>
                                    <div className="flex items-center gap-2 font-medium">
                                        <span style={{ color: theme.node.muted }}>{log.time}</span>
                                        <span>{log.title}</span>
                                    </div>
                                    <div className="mt-1 whitespace-pre-wrap break-all leading-5" style={{ color: theme.node.muted }}>{log.text}</div>
                                </div>
                            ))}
                            {!agentEventLogs.length ? <div className="py-8 text-center text-sm" style={{ color: theme.node.muted }}>暂无日志</div> : null}
                        </div>
                    </div>
                ) : isAgentMode ? (
                    <>
                        <div ref={agentListRef} className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                            {!agentMessages.length ? (
                                <div className="flex h-full flex-col items-center justify-center px-1 text-center">
                                    <div className="grid size-12 place-items-center rounded-xl border" style={{ borderColor: theme.node.stroke }}>
                                        <Bot className="size-6" style={{ color: theme.node.muted }} />
                                    </div>
                                    <div className="mt-3 text-sm font-medium">在线 Agent</div>
                                    <div className="mt-1 text-xs" style={{ color: theme.node.muted }}>使用 AI 模型直接操作画布</div>
                                </div>
                            ) : null}
                            {agentMessages.map((item) => (
                                <AgentChatMessage key={item.id} item={item} theme={theme} user={user as never} onRejectTool={handleRejectTool} onApproveTool={handleApproveTool} />
                            ))}
                            {agentSending && !hasPendingTool ? <AgentWorkingMessage theme={theme} /> : null}
                        </div>
                        <AgentChatComposer
                            prompt={agentPrompt}
                            disabled={!snapshot}
                            sending={agentSending}
                            placeholder={snapshot ? "描述你想让 Agent 做什么" : "请先创建画布项目"}
                            theme={theme}
                            onPromptChange={setAgentPrompt}
                            onSubmit={() => void sendAgentMessage(agentPrompt)}
                            left={<AgentTextModelPicker models={agentModels} value={effectiveConfig.textModel || effectiveConfig.model} theme={theme} onChange={(model) => updateConfig("textModel", model)} />}
                        />
                    </>
                ) : view === "history" ? (
                    <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                        <AssistantHistory
                            sessions={historySessions}
                            activeSession={activeSession}
                            checkedIds={checkedChatIds.filter((id) => historySessions.some((session) => session.id === id))}
                            onToggleChecked={(id, checked) => setCheckedChatIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)))}
                            onOpen={(id) => {
                                setLocalActiveSessionId(id);
                                setView("chat");
                            }}
                            onDelete={(id) => setDeleteChatIds([id])}
                        />
                    </div>
                ) : messages.length ? (
                    <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                        <AssistantMessages messages={messages} onRetry={retryMessage} onInsertImage={onInsertImage} onInsertText={onInsertText} />
                    </div>
                ) : (
                    <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                        <div className="flex h-full flex-col items-center justify-center px-1 text-center">
                            <div className="relative font-serif text-4xl font-bold italic tracking-normal" style={{ color: theme.node.text }}>
                                <span>Infinite Canvas</span>
                                <DiaTextReveal className="absolute inset-0" colors={["#A97CF8", "#F38CB8", "#FDCC92"]} textColor="transparent" duration={1.8} startOnView={false} text="Infinite Canvas" />
                            </div>
                            <div className="mt-3 font-serif text-base italic tracking-wide opacity-60">One canvas, infinite ideas</div>
                        </div>
                    </div>
                )}

                {view === "chat" && !isAgentMode ? (
                    <AssistantComposer
                        mode={mode}
                        prompt={prompt}
                        isRunning={isRunning}
                        references={selectedReferences}
                        config={assistantConfig}
                        nodes={nodes}
                        onModeChange={setMode}
                        onPromptChange={setPrompt}
                        onSubmit={submit}
                        onConfigChange={(key, value) => updateConfig(key === "count" ? "canvasImageCount" : key, value)}
                        onMissingConfig={() => openConfigDialog(true)}
                        onRemoveReference={(id) => {
                            setRemovedReferenceIds((prev) => new Set(prev).add(id));
                            if (selectedNodeIds.has(id)) onSelectNodeIds(new Set(Array.from(selectedNodeIds).filter((nodeId) => nodeId !== id)));
                        }}
                        onPasteImage={onPasteImage}
                        modelCosts={modelCosts}
                    />
                ) : null}

                <Modal
                    title="删除对话记录？"
                    open={deleteChatIds.length > 0}
                    centered
                    onCancel={() => setDeleteChatIds([])}
                    footer={
                        <>
                            <Button onClick={() => setDeleteChatIds([])}>取消</Button>
                            <Button
                                danger
                                type="primary"
                                onClick={() => {
                                    deleteChatIds.length === historySessions.length ? clearSessions() : removeSessions(deleteChatIds);
                                    setDeleteChatIds([]);
                                }}
                            >
                                删除
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">将删除 {deleteChatIds.length} 条对话记录，此操作不可撤销。</p>
                </Modal>
            </motion.aside>
        </motion.div>
    );
}

function AgentModeHeader({ theme, agentMode, confirmTools, agentTab, agentEventLogs, canUndoOps, onAgentModeChange, onConfirmToolsChange, onTabChange, onUndo }: { theme: CanvasTheme; agentMode: CanvasAgentMode; confirmTools: boolean; agentTab: "chat" | "history" | "log"; agentEventLogs: AgentEventLog[]; canUndoOps?: boolean; onAgentModeChange: (mode: CanvasAgentMode) => void; onConfirmToolsChange: (v: boolean) => void; onTabChange: (tab: "chat" | "history" | "log") => void; onUndo: () => void }) {
    return (
        <>
            <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: theme.node.stroke }}>
                <AgentModeSwitch value={agentMode} theme={theme} onChange={onAgentModeChange} />
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs" style={{ color: theme.node.muted }}>
                        <Switch size="small" checked={confirmTools} onChange={onConfirmToolsChange} />
                        工具确认
                    </label>
                    <Button size="small" type="text" disabled={!canUndoOps} icon={<RotateCcw className="size-3.5" />} onClick={onUndo}>
                        撤销
                    </Button>
                </div>
            </div>
            <AgentPanelTabs
                value={agentTab}
                items={[
                    { value: "chat" as const, label: "对话" },
                    { value: "history" as const, label: "历史" },
                    { value: "log" as const, label: "日志", icon: <Terminal className="size-3.5" />, count: agentEventLogs.length },
                ]}
                theme={theme}
                onChange={onTabChange}
            />
        </>
    );
}

function AgentTextModelPicker({ models, value, theme, onChange }: { models: string[]; value: string; theme: CanvasTheme; onChange: (model: string) => void }) {
    const displayModels = models.length ? models : [value];
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger size="sm" className="canvas-agent-model-picker h-8 max-w-[140px] shrink-0 truncate border-0 bg-transparent text-xs" style={{ color: theme.node.muted }}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
                {displayModels.map((model) => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function AssistantComposer({
    mode,
    prompt,
    isRunning,
    references,
    config,
    nodes,
    onModeChange,
    onPromptChange,
    onSubmit,
    onConfigChange,
    onMissingConfig,
    onRemoveReference,
    onPasteImage,
    modelCosts,
}: {
    mode: AssistantMode;
    prompt: string;
    isRunning: boolean;
    references: CanvasAssistantReference[];
    config: AiConfig;
    nodes: CanvasNode[];
    onModeChange: (mode: AssistantMode) => void;
    onPromptChange: (prompt: string) => void;
    onSubmit: () => void;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig: () => void;
    onRemoveReference: (id: string) => void;
    onPasteImage: (file: File) => void;
    modelCosts?: { model: string; credits: number }[];
}) {
    const theme = useCanvasTheme();
    const activeModel = mode === "image" ? config.imageModel || config.model : config.textModel || config.model;
    const credits = requestCreditCost({ channelMode: config.channelMode, modelCosts, model: activeModel, count: mode === "image" ? config.count : 1 });

    return (
        <div className="px-2 pb-2" onWheelCapture={(event) => event.stopPropagation()}>
            <div className="rounded-[28px] border px-3 pb-3 pt-3 shadow-lg" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke }}>
                <MentionInput
                    value={prompt}
                    onChange={onPromptChange}
                    onSubmit={() => void onSubmit()}
                    onPasteImage={onPasteImage}
                    selectedImages={references.filter((r) => r.dataUrl).map((r) => ({ id: r.id, name: r.title || "图片", dataUrl: r.dataUrl }))}
                    onAddImage={(img) => {
                        const next = new Set(selectedNodeIds);
                        next.add(img.id);
                        onSelectNodeIds(next);
                    }}
                    onRemoveImage={onRemoveReference}
                    nodes={nodes}
                    theme={theme}
                    placeholder={mode === "image" ? "描述你想生成或修改的图片，@ 引用画布图片" : "输入你想问的问题，@ 引用画布图片"}
                    className="thin-scrollbar h-20 w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-5 outline-none placeholder:text-stone-400"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="canvas-composer-tools flex min-w-0 flex-1 items-center gap-1">
                        <CanvasPromptLibrary onSelect={onPromptChange} />
                        <AssistantModeSwitch mode={mode} theme={theme} onChange={onModeChange} />
                        {mode === "image" ? (
                            <>
                                <ModelPicker className="h-8 shrink-0" config={config} value={config.imageModel || config.model} onChange={(model) => onConfigChange("imageModel", model)} capability="image" onMissingConfig={onMissingConfig} />
                                <CanvasImageSettingsPopover config={config} placement="topRight" getPopupContainer={() => document.body} buttonClassName="canvas-composer-settings canvas-composer-icon !h-8 !min-w-8 !rounded-full !px-2" onConfigChange={onConfigChange} onMissingConfig={onMissingConfig} />
                            </>
                        ) : (
                            <ModelPicker className="h-8 shrink-0" config={config} value={config.textModel || config.model} onChange={(model) => onConfigChange("textModel", model)} capability="text" onMissingConfig={onMissingConfig} />
                        )}
                    </div>
                    <Button
                        type="primary"
                        className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                        disabled={isRunning || !prompt.trim()}
                        onClick={() => void onSubmit()}
                        aria-label="发送"
                    >
                        <span className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">
                                <CreditSymbol />
                                {credits.toLocaleString()}
                            </span>
                            {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                        </span>
                    </Button>
                </div>
            </div>
        </div>
    );
}

function AssistantModeSwitch({ mode, theme, onChange }: { mode: AssistantMode; theme: CanvasTheme; onChange: (mode: AssistantMode) => void }) {
    return (
        <div className="canvas-composer-mode-switch flex h-8 shrink-0 items-center rounded-full p-0.5" style={{ background: theme.node.fill }}>
            {[
                { value: "ask" as const, title: "对话", icon: <MessageSquare className="size-4" /> },
                { value: "image" as const, title: "生图", icon: <ImageIcon className="size-4" /> },
                { value: "agent" as const, title: "Agent", icon: <Bot className="size-4" /> },
            ].map((item) => (
                <Tooltip key={item.value} title={item.title}>
                    <button
                        type="button"
                        className="canvas-composer-mode-button flex h-7 cursor-pointer items-center justify-center gap-1 rounded-full border-0 bg-transparent transition"
                        style={{ background: mode === item.value ? theme.node.activeStroke : "transparent", color: mode === item.value ? theme.node.panel : theme.node.text }}
                        onClick={() => onChange(item.value)}
                        aria-label={item.title}
                    >
                        {item.icon}
                        <span>{item.title}</span>
                    </button>
                </Tooltip>
            ))}
        </div>
    );
}

function AssistantMessages({
    messages,
    onRetry,
    onInsertImage,
    onInsertText,
}: {
    messages: CanvasAssistantMessage[];
    onRetry: (message: CanvasAssistantMessage) => void;
    onInsertImage: (image: CanvasAssistantImage) => void;
    onInsertText: (text: string) => void;
}) {
    const theme = useCanvasTheme();

    return (
        <>
            {messages.map((message) => (
                <div key={message.id} className={cn("flex flex-col gap-2", message.role === "user" ? "items-end" : "items-start")}>
                    <div
                        className="max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6"
                        style={message.role === "user" ? { background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { background: theme.node.fill, color: theme.node.text }}
                    >
                        {message.role === "assistant" ? (
                            <div className="mb-1 flex items-center gap-1.5 text-xs opacity-60">
                                <MessageSquare className="size-3.5" />
                                回答
                            </div>
                        ) : null}
                        {message.text}
                    </div>
                    {message.references?.length ? <MessageReferences message={message} /> : null}
                    {message.isLoading ? <ImageGenerationPending compact label={message.mode === "image" ? "正在生成图片" : "正在回答"} className="w-[250px] rounded-2xl border" /> : null}
                    {message.role === "assistant" && !message.isLoading ? (
                        <div className="flex gap-1">
                            <Button shape="circle" size="small" style={{ borderColor: theme.node.stroke }} icon={<RotateCcw className="size-3.5" />} onClick={() => onRetry(message)} title="重试" />
                            {!message.images?.length ? <Button shape="circle" size="small" style={{ borderColor: theme.node.stroke }} icon={<Plus className="size-3.5" />} onClick={() => onInsertText(message.text)} title="插入画布" /> : null}
                        </div>
                    ) : null}
                    {message.images?.map((image) => (
                        <div key={image.id} className="w-[250px] overflow-hidden rounded-2xl border" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
                            <img src={image.dataUrl} alt="" className="aspect-square w-full object-cover" />
                            <Button
                                type="text"
                                className="!h-8 !w-full !rounded-none"
                                style={{ borderTop: `1px solid ${theme.node.stroke}`, color: theme.node.text }}
                                icon={<Plus className="size-3.5" />}
                                onClick={() => onInsertImage(image)}
                                title="插入画布"
                            />
                        </div>
                    ))}
                </div>
            ))}
        </>
    );
}

function AssistantHistory({
    sessions,
    activeSession,
    checkedIds,
    onToggleChecked,
    onOpen,
    onDelete,
}: {
    sessions: CanvasAssistantSession[];
    activeSession: CanvasAssistantSession | null;
    checkedIds: string[];
    onToggleChecked: (id: string, checked: boolean) => void;
    onOpen: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const theme = useCanvasTheme();

    return (
        <div className="space-y-1">
            {sessions.map((session) => (
                <div key={session.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-black/5 dark:hover:bg-white/10" style={session.id === activeSession?.id ? { background: theme.node.fill } : undefined}>
                    <input type="checkbox" className="size-4 accent-stone-950" checked={checkedIds.includes(session.id)} onChange={(event) => onToggleChecked(session.id, event.target.checked)} />
                    <button type="button" className="min-w-0 flex-1 text-left text-sm" onClick={() => onOpen(session.id)}>
                        <span className="block truncate">{session.title}</span>
                        <span className="text-xs opacity-50">{session.messages.length} 条消息</span>
                    </button>
                    <Button type="text" shape="circle" size="small" className="opacity-0 transition group-hover:opacity-100" icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(session.id)} title="删除" />
                </div>
            ))}
        </div>
    );
}

function MessageReferences({ message }: { message: CanvasAssistantMessage }) {
    return (
        <div className={cn("flex max-w-[88%] flex-wrap gap-2", message.role === "user" ? "justify-end" : "justify-start")}>
            {message.references?.map((item, index, references) => (
                <AssistantReferenceChip key={item.id} item={item} label={assistantImageReferenceLabel(references, index)} />
            ))}
        </div>
    );
}

function AssistantReferenceChip({ item, label, onRemove }: { item: CanvasAssistantReference; label?: string; onRemove?: () => void }) {
    const theme = useCanvasTheme();
    const text = (item.text || item.title).replace(/\s+/g, " ").trim().slice(0, 1) || "文";
    return (
        <div className="group/chip relative inline-flex h-8 max-w-[150px] shrink-0 items-center gap-1.5 rounded-lg text-sm" style={{ color: theme.node.text }}>
            {item.dataUrl ? (
                <span className="relative block size-8 shrink-0">
                    <img src={item.dataUrl} alt="" className="size-8 rounded-lg object-cover" />
                    {label ? <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 py-0.5 text-[8px] font-medium leading-none text-white">{label}</span> : null}
                </span>
            ) : (
                <span className="grid size-8 place-items-center rounded-lg border text-sm font-medium" style={{ background: theme.node.panel, borderColor: theme.node.activeStroke }}>
                    {text}
                </span>
            )}
            {onRemove ? (
                <button
                    type="button"
                    className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border opacity-0 shadow-sm transition group-hover/chip:opacity-100"
                    style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke }}
                    onClick={onRemove}
                    aria-label="移除引用"
                >
                    <X className="size-3" />
                </button>
            ) : null}
        </div>
    );
}

function assistantImageReferenceLabel(references: CanvasAssistantReference[], index: number) {
    if (!references[index]?.dataUrl) return undefined;
    const imageIndex = references.slice(0, index + 1).filter((item) => item.dataUrl).length - 1;
    return imageIndex >= 0 ? imageReferenceLabel(imageIndex) : undefined;
}

function nodeToReference(node: CanvasNodeData): CanvasAssistantReference | null {
    if (node.type === CanvasNodeType.Image && node.metadata?.content) {
        return { id: node.id, type: node.type, title: node.title, dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
    }
    if (node.type === CanvasNodeType.Text && node.metadata?.content) {
        return { id: node.id, type: node.type, title: node.title, text: node.metadata.content };
    }
    return null;
}

function buildAssistantReferences(nodes: CanvasNodeData[], selectedNodeIds: Set<string>) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return Array.from(selectedNodeIds)
        .map((id) => nodeById.get(id))
        .filter((node): node is CanvasNodeData => Boolean(node))
        .map(nodeToReference)
        .filter((item): item is CanvasAssistantReference => Boolean(item));
}

async function buildChatMessages(messages: CanvasAssistantMessage[]): Promise<ChatCompletionMessage[]> {
    return Promise.all(
        messages.map(async (message, index) => {
            if (message.role === "assistant") return { role: "assistant", content: message.text };
            if (index !== messages.length - 1) return { role: "user", content: message.text };
            const refs = message.references || [];
            return {
                role: "user",
                content: [
                    ...refs.flatMap((item) => (item.text ? [{ type: "text" as const, text: item.text }] : [])),
                    { type: "text", text: message.text },
                    ...(await Promise.all(refs.filter((item) => item.dataUrl).map(async (item) => ({ type: "image_url" as const, image_url: { url: await imageToDataUrl(item) } })))),
                ],
            };
        }),
    );
}

function createSession(): CanvasAssistantSession {
    const now = new Date().toISOString();
    return { id: nanoid(), title: "新对话", messages: [], createdAt: now, updatedAt: now };
}