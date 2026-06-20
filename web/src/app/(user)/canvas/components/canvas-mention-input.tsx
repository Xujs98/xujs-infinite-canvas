"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { CanvasNodeType, type CanvasNodeData } from "../types";
import type { CanvasTheme } from "@/lib/canvas-theme";

type MentionImage = {
    id: string;
    name: string;
    dataUrl?: string;
};

type MentionInputProps = {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onPasteImage?: (file: File) => void;
    selectedImages: MentionImage[];
    onAddImage: (image: MentionImage) => void;
    onRemoveImage: (id: string) => void;
    nodes: CanvasNodeData[];
    theme: CanvasTheme;
    placeholder?: string;
    className?: string;
};

export function MentionInput({
    value,
    onChange,
    onSubmit,
    onPasteImage,
    selectedImages,
    onAddImage,
    onRemoveImage,
    nodes,
    theme,
    placeholder,
    className,
}: MentionInputProps) {
    const [showMention, setShowMention] = useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionIndex, setMentionIndex] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const imageNodes = useMemo(() => {
        return nodes
            .filter((n) => n.type === CanvasNodeType.Image && n.metadata?.content)
            .map((n) => ({
                id: n.id,
                name: n.metadata?.prompt?.slice(0, 20) || n.title || "图片",
                dataUrl: n.metadata?.content as string | undefined,
            }));
    }, [nodes]);

    const filteredImages = useMemo(() => {
        const selectedIds = new Set(selectedImages.map((i) => i.id));
        const q = mentionQuery.toLowerCase();
        return imageNodes
            .filter((img) => !selectedIds.has(img.id))
            .filter((img) => !q || img.name.toLowerCase().includes(q) || img.id.includes(q));
    }, [imageNodes, selectedImages, mentionQuery]);

    const detectMention = useCallback((text: string, cursorPos: number) => {
        const before = text.slice(0, cursorPos);
        const atIndex = before.lastIndexOf("@");
        if (atIndex === -1) return null;
        const charBefore = atIndex > 0 ? before[atIndex - 1] : " ";
        if (charBefore !== " " && charBefore !== "\n" && charBefore !== "\t") return null;
        const query = before.slice(atIndex + 1);
        if (query.includes(" ") || query.includes("\n")) return null;
        return { startIndex: atIndex, query };
    }, []);

    const insertMention = useCallback(
        (image: MentionImage) => {
            const ta = textareaRef.current;
            if (!ta) return;
            const cursorPos = ta.selectionStart;
            const before = value.slice(0, cursorPos);
            const atIndex = before.lastIndexOf("@");
            if (atIndex === -1) return;
            const newValue = value.slice(0, atIndex) + `@${image.name} ` + value.slice(cursorPos);
            onChange(newValue);
            onAddImage(image);
            setShowMention(false);
            setMentionQuery("");
            setMentionIndex(0);
            requestAnimationFrame(() => {
                const pos = atIndex + image.name.length + 2;
                ta.setSelectionRange(pos, pos);
                ta.focus();
            });
        },
        [value, onChange, onAddImage],
    );

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const newValue = e.target.value;
            onChange(newValue);
            const cursorPos = e.target.selectionStart ?? newValue.length;
            const mention = detectMention(newValue, cursorPos);
            if (mention) {
                setMentionQuery(mention.query);
                setMentionIndex(0);
                setShowMention(true);
            } else {
                setShowMention(false);
            }
        },
        [onChange, detectMention],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (showMention && filteredImages.length > 0) {
                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMentionIndex((prev) => (prev + 1) % filteredImages.length);
                    return;
                }
                if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex((prev) => (prev - 1 + filteredImages.length) % filteredImages.length);
                    return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    insertMention(filteredImages[mentionIndex]);
                    return;
                }
                if (e.key === "Escape") {
                    e.preventDefault();
                    setShowMention(false);
                    return;
                }
            }
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
            }
        },
        [showMention, filteredImages, mentionIndex, insertMention, onSubmit],
    );

    useEffect(() => {
        if (!showMention || !panelRef.current) return;
        const el = panelRef.current.children[mentionIndex] as HTMLElement | undefined;
        el?.scrollIntoView({ block: "nearest" });
    }, [mentionIndex, showMention]);

    return (
        <div className="relative">
            {selectedImages.length > 0 ? (
                <div className="thin-scrollbar mb-1.5 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1">
                    {selectedImages.map((img, index) => (
                        <div key={img.id} className="group/chip relative inline-flex h-8 max-w-[150px] shrink-0 items-center gap-1.5 rounded-lg text-sm" style={{ color: theme.node.text }}>
                            {img.dataUrl ? (
                                <span className="relative block size-8 shrink-0">
                                    <img src={img.dataUrl} alt="" className="size-8 rounded-lg object-cover" />
                                    <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 py-0.5 text-[8px] font-medium leading-none text-white">{index + 1}</span>
                                </span>
                            ) : (
                                <span className="grid size-8 place-items-center rounded-lg border text-sm font-medium" style={{ background: theme.node.panel, borderColor: theme.node.activeStroke }}>
                                    <ImageIcon className="size-4" />
                                </span>
                            )}
                            <button
                                type="button"
                                className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border opacity-0 shadow-sm transition group-hover/chip:opacity-100"
                                style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke }}
                                onClick={() => onRemoveImage(img.id)}
                                aria-label="移除引用"
                            >
                                <X className="size-3" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}
            <div className="relative">
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onPaste={(event) => {
                        const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
                        if (!file) return;
                        event.preventDefault();
                        onPasteImage?.(file);
                    }}
                    className={className}
                    style={{ color: theme.node.text }}
                    placeholder={placeholder || "输入提示词，@ 引用画布图片"}
                />
                {showMention && filteredImages.length > 0 ? (
                    <div
                        ref={panelRef}
                        className="glass absolute bottom-full left-0 z-50 mb-2 max-h-48 w-64 overflow-y-auto rounded-xl border shadow-xl"
                        style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke }}
                    >
                        <div className="px-3 py-1.5 text-[11px] font-medium opacity-50" style={{ color: theme.node.text }}>
                            画布图片 · {filteredImages.length}
                        </div>
                        {filteredImages.map((img, i) => (
                            <button
                                key={img.id}
                                type="button"
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition"
                                style={{
                                    background: i === mentionIndex ? theme.node.fill : "transparent",
                                    color: theme.node.text,
                                }}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    insertMention(img);
                                }}
                                onMouseEnter={() => setMentionIndex(i)}
                            >
                                {img.dataUrl ? (
                                    <img src={img.dataUrl} alt="" className="size-8 shrink-0 rounded-lg object-cover" />
                                ) : (
                                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border" style={{ background: theme.node.panel, borderColor: theme.node.activeStroke }}>
                                        <ImageIcon className="size-4" />
                                    </span>
                                )}
                                <span className="truncate">{img.name}</span>
                            </button>
                        ))}
                    </div>
                ) : null}
                {showMention && filteredImages.length === 0 ? (
                    <div
                        className="glass absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border px-3 py-4 text-center text-xs shadow-xl opacity-60"
                        style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }}
                    >
                        画布上暂无图片节点
                    </div>
                ) : null}
            </div>
        </div>
    );
}
