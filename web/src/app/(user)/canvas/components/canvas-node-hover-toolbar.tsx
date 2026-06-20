"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App, Modal, Segmented, Tooltip } from "antd";
import { Download, Ellipsis, FolderPlus, Image as ImageIcon, Info, Maximize2, MessageSquare, Minus, Music2, Pencil, Plus, RefreshCw, Settings2, Sparkles, Trash2, Upload, Video } from "lucide-react";

import { formatBytes, getDataUrlByteSize } from "@/lib/image-utils";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useCopyText } from "@/hooks/use-copy-text";
import { CanvasNodeType, type CanvasNodeData, type ViewportTransform } from "../types";
import { ImageToolSettingsModal, type ImageToolbarSettingsTool } from "./canvas-image-toolbar-settings-modal";
import { IMAGE_QUICK_TOOLS_STORAGE_KEY, buildImageToolbarTools, defaultImageQuickToolIds, readImageQuickToolsConfig, type ImageQuickToolId, type ToolbarAnimationMode, type ToolbarLabelMode } from "./canvas-image-toolbar-tools";

type CanvasNodeHoverToolbarProps = {
    node: CanvasNodeData | null;
    viewport: ViewportTransform;
    onKeep: (nodeId: string) => void;
    onLeave: () => void;
    onInfo: (node: CanvasNodeData) => void;
    onEditText: (node: CanvasNodeData) => void;
    onDecreaseFont: (node: CanvasNodeData) => void;
    onIncreaseFont: (node: CanvasNodeData) => void;
    onToggleDialog: (node: CanvasNodeData) => void;
    onGenerateImage: (node: CanvasNodeData) => void;
    onUpload: (node: CanvasNodeData) => void;
    onDownload: (node: CanvasNodeData) => void;
    onSaveAsset: (node: CanvasNodeData) => void;
    onMaskEdit: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onSplit: (node: CanvasNodeData) => void;
    onUpscale: (node: CanvasNodeData) => void;
    onSuperResolve: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onViewImage: (node: CanvasNodeData) => void;
    onPanorama: (node: CanvasNodeData) => void;
    onReversePrompt: (node: CanvasNodeData) => void;
    onRetry: (node: CanvasNodeData) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onDelete: (node: CanvasNodeData) => void;
    onJimeng: (node: CanvasNodeData) => void;
};

type ToolbarTool = {
    id: string;
    title: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
};

export function CanvasNodeHoverToolbar({
    node,
    viewport,
    onKeep,
    onLeave,
    onInfo,
    onEditText,
    onDecreaseFont,
    onIncreaseFont,
    onToggleDialog,
    onGenerateImage,
    onUpload,
    onDownload,
    onSaveAsset,
    onMaskEdit,
    onCrop,
    onSplit,
    onUpscale,
    onSuperResolve,
    onAngle,
    onViewImage,
    onPanorama,
    onReversePrompt,
    onRetry,
    onToggleFreeResize,
    onDelete,
    onJimeng,
}: CanvasNodeHoverToolbarProps) {
    const [quickImageToolIds, setQuickImageToolIds] = useState<ImageQuickToolId[]>(defaultImageQuickToolIds);
    const [labelMode, setLabelMode] = useState<ToolbarLabelMode>("side");
    const [animationMode, setAnimationMode] = useState<ToolbarAnimationMode>("slide");
    const [draftImageToolIds, setDraftImageToolIds] = useState<ImageQuickToolId[]>(defaultImageQuickToolIds);
    const [draftLabelMode, setDraftLabelMode] = useState<ToolbarLabelMode>("side");
    const [draftAnimationMode, setDraftAnimationMode] = useState<ToolbarAnimationMode>("slide");
    const [imageToolSettingsOpen, setImageToolSettingsOpen] = useState(false);
    const { message } = App.useApp();
    const copyText = useCopyText();
    const theme = useCanvasTheme();
    const colorTheme = useThemeStore((state) => state.theme);
    const [mountKey, setMountKey] = useState(0);
    const [toolbarWidth, setToolbarWidth] = useState(0);
    const [ready, setReady] = useState(false);
    const toolbarElRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        if (node) setMountKey((k) => k + 1);
        setToolbarWidth(0);
        setReady(false);
    }, [node?.id]);

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(IMAGE_QUICK_TOOLS_STORAGE_KEY);
            if (!stored) return;
            const parsed = JSON.parse(stored) as unknown;
            const config = readImageQuickToolsConfig(parsed);
            setQuickImageToolIds(config.ids);
            setLabelMode(config.labelMode);
            setAnimationMode(config.animationMode);
        } catch {
            window.localStorage.removeItem(IMAGE_QUICK_TOOLS_STORAGE_KEY);
        }
    }, []);

    useEffect(() => {
        setImageToolSettingsOpen(false);
    }, [node?.id]);

    // 测量工具栏实际宽度，用于计算不溢出视口的定位
    const toolbarRefCb = useCallback(
        (el: HTMLDivElement | null) => {
            toolbarElRef.current = el;
            if (!el) return;
            const w = el.scrollWidth;
            if (w > 0) setToolbarWidth(w);
            setReady(true);
        },
        [mountKey],
    );

    // 点击工具栏外部时隐藏工具栏
    useEffect(() => {
        if (!node) return;
        const handlePointerDown = (e: PointerEvent) => {
            const target = e.target instanceof Element ? e.target : null;
            if (!target || toolbarElRef.current?.contains(target)) return;
            if (!imageToolSettingsOpen) onLeave();
        };
        window.addEventListener("pointerdown", handlePointerDown);
        return () => window.removeEventListener("pointerdown", handlePointerDown);
    }, [node?.id, imageToolSettingsOpen, onLeave]);

    if (!node) return null;

    const nodeCenterX = viewport.x + (node.position.x + node.width / 2) * viewport.k;
    const top = viewport.y + node.position.y * viewport.k - 14;

    // 根据工具栏实际宽度和视口边界计算水平定位，防止溢出
    const vw = window.innerWidth;
    const m = 12;
    const halfW = toolbarWidth / 2;
    let left: number;
    if (toolbarWidth > 0 && toolbarWidth >= vw - m * 2) {
        // 工具栏比可用空间宽：贴左边缘，内容可滚动
        left = m + halfW;
    } else if (toolbarWidth > 0 && nodeCenterX - halfW < m) {
        // 节点靠近左边缘：工具栏贴左
        left = m + halfW;
    } else if (toolbarWidth > 0 && nodeCenterX + halfW > vw - m) {
        // 节点靠近右边缘：工具栏贴右
        left = vw - m - halfW;
    } else {
        // 居中显示在节点上方
        left = nodeCenterX;
    }
    const isImage = node.type === CanvasNodeType.Image;
    const isVideo = node.type === CanvasNodeType.Video;
    const isAudio = node.type === CanvasNodeType.Audio;
    const hasImage = isImage && Boolean(node.metadata?.content);
    const hasVideo = isVideo && Boolean(node.metadata?.content);
    const hasAudio = isAudio && Boolean(node.metadata?.content);
    const isText = node.type === CanvasNodeType.Text;
    const isConfig = node.type === CanvasNodeType.Config;
    const canOpenDialog = isText || hasImage || isVideo;
    const canRetry = node.metadata?.status === "error";
    const quickImageToolIdSet = new Set(quickImageToolIds);
    const copyImagePrompt = (target: CanvasNodeData) => {
        const prompt = target.metadata?.prompt?.trim();
        if (!prompt) {
            message.warning("暂无可复制的提示词");
            return;
        }
        copyText(prompt, "提示词已复制");
    };
    const imageTools = buildImageToolbarTools(node, { onUpload, onToggleFreeResize, onMaskEdit, onCrop, onSplit, onUpscale, onSuperResolve, onAngle, onViewImage, onCopyPrompt: copyImagePrompt, onReversePrompt });

    function openImageToolSettings() {
        onKeep(node.id);
        setDraftImageToolIds(quickImageToolIds);
        setDraftLabelMode(labelMode);
        setDraftAnimationMode(animationMode);
        setImageToolSettingsOpen(true);
    }

    const baseToolbarTools: ToolbarTool[] = [
        { id: "info", title: "查看节点信息", label: "信息", icon: <Info className="size-4" />, onClick: () => onInfo(node) },
        { id: "delete", title: "移除节点", label: "删除", icon: <Trash2 className="size-4" />, onClick: () => onDelete(node), danger: true },
    ];
    const nodeToolbarTools: ToolbarTool[] = [
        ...(canRetry ? [{ id: "retry", title: "重新生成", label: "重试", icon: <RefreshCw className="size-4" />, onClick: () => onRetry(node) }] : []),
        ...(hasImage || hasVideo || isText ? [{ id: "saveAsset", title: "加入我的素材", label: "存素材", icon: <FolderPlus className="size-4" />, onClick: () => onSaveAsset(node) }] : []),
        ...(hasImage || hasVideo || hasAudio ? [{ id: "download", title: hasAudio ? "下载音频" : hasVideo ? "下载视频" : "下载图片", label: "下载", icon: <Download className="size-4" />, onClick: () => onDownload(node) }] : []),
        ...(canOpenDialog ? [{ id: "edit", title: "编辑", label: "编辑", icon: <MessageSquare className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(hasImage ? [{ id: "panorama", title: "360 全景查看", label: "全景", icon: <Maximize2 className="size-4" />, onClick: () => onPanorama(node) }] : []),
        ...(isText ? [{ id: "editText", title: "编辑文本", label: "编辑文字", icon: <Pencil className="size-4" />, onClick: () => onEditText(node) }] : []),
        ...(isText ? [{ id: "generateImage", title: "用文本生图", label: "生图", icon: <ImageIcon className="size-4" />, onClick: () => onGenerateImage(node) }] : []),
        ...(isConfig ? [{ id: "config", title: "生成配置", label: "生成配置", icon: <Settings2 className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(isText ? [{ id: "decreaseFont", title: "减小字号", label: "缩小", icon: <Minus className="size-4" />, onClick: () => onDecreaseFont(node) }] : []),
        ...(isText ? [{ id: "increaseFont", title: "增大字号", label: "放大", icon: <Plus className="size-4" />, onClick: () => onIncreaseFont(node) }] : []),
        ...(isImage && !hasImage ? [{ id: "uploadImage", title: "上传图片", label: "上传图片", icon: <Upload className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(isVideo ? [{ id: "uploadVideo", title: hasVideo ? "替换视频" : "上传视频", label: hasVideo ? "替换视频" : "上传视频", icon: <Video className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(isAudio ? [{ id: "uploadAudio", title: hasAudio ? "替换音频" : "上传音频", label: hasAudio ? "替换音频" : "上传音频", icon: <Music2 className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(hasImage ? imageTools.map((tool) => ({ id: tool.id, title: tool.title, label: tool.label, icon: tool.icon, active: tool.active, onClick: tool.onClick })) : []),
        ...(hasImage || isText ? [{ id: "jimeng", title: "用即梦生成", label: "即梦", icon: <Sparkles className="size-4" />, onClick: () => onJimeng(node) }] : []),
    ];
    const toolbarTools = hasImage ? [...baseToolbarTools, ...nodeToolbarTools].filter((tool) => quickImageToolIdSet.has(tool.id as ImageQuickToolId)) : [...baseToolbarTools, ...nodeToolbarTools];
    const selectableImageToolbarTools = [...baseToolbarTools, ...nodeToolbarTools].filter((tool) => tool.id !== "retry") as ImageToolbarSettingsTool[];

    const closeImageToolSettings = () => {
        setImageToolSettingsOpen(false);
        onLeave();
    };

    const setDraftImageToolVisible = (id: ImageQuickToolId, visible: boolean) => {
        setDraftImageToolIds((current) => {
            const selected = new Set(current);
            if (visible) selected.add(id);
            else selected.delete(id);
            return selectableImageToolbarTools.filter((tool) => selected.has(tool.id)).map((tool) => tool.id);
        });
    };

    const saveImageToolSettings = () => {
        const config = { ids: draftImageToolIds, labelMode: draftLabelMode, animationMode: draftAnimationMode };
        setQuickImageToolIds(config.ids);
        setLabelMode(config.labelMode);
        setAnimationMode(config.animationMode);
        window.localStorage.setItem(IMAGE_QUICK_TOOLS_STORAGE_KEY, JSON.stringify(config));
        closeImageToolSettings();
    };

    const animClass = animationMode === "none" ? "" : animationMode === "fade" ? "animate-toolbar-fade" : animationMode === "slide" ? "animate-toolbar-slide" : animationMode === "scale" ? "animate-toolbar-scale" : "animate-toolbar-bounce";

    const handleWheel = (e: React.WheelEvent) => {
        const el = e.currentTarget;
        if (el.scrollWidth > el.clientWidth) {
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        }
    };

    return (
        <>
            <div
                key={mountKey}
                className={animClass}
                style={{ position: "absolute", left, top, zIndex: 70, transformOrigin: "center bottom", opacity: ready ? undefined : 0 }}
            >
                <div
                    ref={toolbarRefCb}
                    className="glass flex h-12 items-center overflow-hidden rounded-[18px] border text-[15px]"
                    style={{
                        maxWidth: "calc(100vw - 24px)",
                        transform: "translate(-50%, -100%)",
                        background: theme.toolbar.panel,
                        borderColor: theme.toolbar.border,
                        color: theme.toolbar.item,
                        boxShadow: colorTheme === "dark" ? "0 8px 28px rgba(0,0,0,.32)" : "0 8px 28px rgba(15,23,42,.12)",
                    }}
                    onMouseEnter={() => onKeep(node.id)}
                    onMouseLeave={() => {
                        if (!imageToolSettingsOpen) onLeave();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    {toolbarTools[0] ? <ToolbarAction {...toolbarTools[0]} labelMode={labelMode} toolbarTheme={theme.toolbar} /> : null}
                    <div className="flex min-w-0 flex-1 items-center overflow-x-auto hide-scrollbar" onWheel={handleWheel}>
                        {toolbarTools.slice(1).map((tool) => (
                            <ToolbarAction key={tool.id} {...tool} labelMode={labelMode} toolbarTheme={theme.toolbar} />
                        ))}
                    </div>
                    {hasImage ? <ToolbarAction id="more" title="配置快捷工具" label="更多" icon={<Ellipsis className="size-4" />} active={imageToolSettingsOpen} onClick={openImageToolSettings} labelMode={labelMode} toolbarTheme={theme.toolbar} /> : null}
                </div>
            </div>
            {hasImage ? (
                <ImageToolSettingsModal
                    open={imageToolSettingsOpen}
                    tools={selectableImageToolbarTools}
                    selectedIds={draftImageToolIds}
                    labelMode={draftLabelMode}
                    animationMode={draftAnimationMode}
                    onToggle={setDraftImageToolVisible}
                    onLabelModeChange={setDraftLabelMode}
                    onAnimationModeChange={setDraftAnimationMode}
                    onCancel={closeImageToolSettings}
                    onSave={saveImageToolSettings}
                />
            ) : null}
        </>
    );
}

export function CanvasNodeInfoModal({ node, open, onClose }: { node: CanvasNodeData | null; open: boolean; onClose: () => void }) {
    const theme = useCanvasTheme();
    const colorTheme = useThemeStore((state) => state.theme);
    const [view, setView] = useState<"info" | "json">("info");
    const imageBytes = node?.type === CanvasNodeType.Image && node.metadata?.content ? getDataUrlByteSize(node.metadata.content) : 0;
    const batchCount = node?.type === CanvasNodeType.Image ? node.metadata?.batchChildIds?.length || 0 : 0;
    const json = useMemo(() => {
        if (!node) return "";
        return JSON.stringify(
            node,
            (key, value) => {
                if (key === "title") return undefined;
                if (key === "content" && typeof value === "string" && value.startsWith("data:image/")) {
                    return "[base64 image]";
                }
                return value;
            },
            2,
        );
    }, [node]);

    useEffect(() => {
        if (open) setView("info");
    }, [node?.id, open]);

    const title = (
        <div className="flex items-center justify-between gap-4 pr-12">
            <span>节点信息</span>
            <Segmented
                size="small"
                value={view}
                onChange={(value) => setView(value as "info" | "json")}
                options={[
                    { label: "信息", value: "info" },
                    { label: "JSON", value: "json" },
                ]}
            />
        </div>
    );

    const modalBg = colorTheme === "dark" ? "#1f1d1a" : "#ffffff";
    const modalBorder = theme.toolbar.border;
    const modalText = theme.toolbar.item;

    return (
        <Modal
            className="canvas-node-info-modal"
            title={title}
            open={open && Boolean(node)}
            centered
            footer={null}
            onCancel={onClose}
            styles={{
                header: { background: modalBg, borderBottom: `1px solid ${modalBorder}` },
                content: { background: modalBg, border: `1px solid ${modalBorder}`, color: modalText },
                body: { color: modalText },
                mask: { backdropFilter: "blur(4px)" },
            }}
        >
            {node ? (
                <div className="h-[56vh] min-h-[360px] text-sm">
                    {view === "info" ? (
                        <div className="thin-scrollbar h-full space-y-3 overflow-auto pr-1">
                            <InfoRow label="ID" value={node.id} />
                            <InfoRow label="类型" value={node.type === CanvasNodeType.Text ? "文本" : node.type === CanvasNodeType.Image ? "图片" : node.type === CanvasNodeType.Video ? "视频" : node.type === CanvasNodeType.Audio ? "音频" : "生成配置"} />
                            <InfoRow label="尺寸" value={`${Math.round(node.width)} x ${Math.round(node.height)}`} />
                            <InfoRow label="位置" value={`${Math.round(node.position.x)}, ${Math.round(node.position.y)}`} />
                            <InfoRow label="状态" value={node.metadata?.status || "idle"} />
                            {batchCount > 1 ? <InfoRow label="图片组" value={`${batchCount} 张`} /> : null}
                            {node.metadata?.prompt ? <InfoRow label="提示词" value={node.metadata.prompt} /> : null}
                            {imageBytes ? <InfoRow label="图片大小" value={formatBytes(imageBytes)} /> : null}
                            {node.metadata?.errorDetails ? (
                                <div className="rounded-lg border p-3 text-red-400" style={{ borderColor: theme.node.stroke }}>
                                    {node.metadata.errorDetails}
                                </div>
                            ) : null}
                            {node.type === CanvasNodeType.Image && node.metadata?.content && typeof node.metadata.content === "string" ? (
                                <div className="overflow-hidden rounded-lg border" style={{ borderColor: theme.node.stroke }}>
                                    <img src={node.metadata.content} alt="节点预览" className="max-h-[30vh] w-full object-contain" />
                                </div>
                            ) : null}
                            {node.type === CanvasNodeType.Video && node.metadata?.content && typeof node.metadata.content === "string" ? (
                                <div className="overflow-hidden rounded-lg border" style={{ borderColor: theme.node.stroke }}>
                                    <video src={node.metadata.content} controls className="max-h-[30vh] w-full" />
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <pre className="thin-scrollbar h-full overflow-auto rounded-lg border p-3 text-xs leading-5" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}>
                            {json}
                        </pre>
                    )}
                </div>
            ) : null}
        </Modal>
    );
}

function ToolbarAction({ title, label, icon, onClick, labelMode, active = false, danger = false, toolbarTheme }: ToolbarTool & { labelMode: ToolbarLabelMode; toolbarTheme: { item: string; itemHover: string; activeBg: string; activeText: string } }) {
    const hasText = labelMode !== "icon" && Boolean(label);
    const isBelow = labelMode === "below" && hasText;
    return (
        <Tooltip title={title} placement="top" mouseEnterDelay={0.2} color="#ffffff" styles={{ body: { color: "#242529", boxShadow: "0 8px 24px rgba(15,23,42,.16)", fontSize: 13, fontWeight: 500 } }}>
            <button type="button" className={`group relative flex items-center whitespace-nowrap px-1.5 ${isBelow ? "h-14 flex-col justify-center gap-0.5" : "h-12"} ${danger ? "text-[#ef4444]" : ""}`} onClick={onClick} aria-label={title}>
                <span
                    className={`flex items-center ${isBelow ? "h-7 justify-center px-1.5" : `h-9 ${hasText ? "gap-2 px-2.5" : "justify-center px-2"}`} rounded-lg transition`}
                    style={{
                        color: active ? toolbarTheme.activeText : undefined,
                        background: active ? toolbarTheme.activeBg : undefined,
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = toolbarTheme.itemHover; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = ""; }}
                >
                    {icon}
                    {hasText && !isBelow ? <span>{label}</span> : null}
                </span>
                {isBelow ? <span className="px-1 text-[10px] leading-tight opacity-70">{label}</span> : null}
            </button>
        </Tooltip>
    );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
            <span className="opacity-50">{label}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words">{value}</span>
        </div>
    );
}
