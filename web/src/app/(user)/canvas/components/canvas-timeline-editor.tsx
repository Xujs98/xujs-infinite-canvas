"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Slider, Tooltip } from "antd";
import {
    DeleteOutlined,
    FileImageOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    PlusOutlined,
    ZoomInOutlined,
    ZoomOutOutlined,
} from "@ant-design/icons";

export type TimelineSegment = {
    id: string;
    start: number; // frame index
    length: number; // frame count
    prompt: string;
    type: "image" | "text";
    imageUrl?: string;
    guideStrength: number;
};

export type TimelineAudioSegment = {
    id: string;
    start: number;
    length: number;
    audioUrl?: string;
    label?: string;
};

export type TimelineData = {
    segments: TimelineSegment[];
    audioSegments: TimelineAudioSegment[];
    durationFrames: number;
    frameRate: number;
};

const TRACK_HEIGHT = 120;
const AUDIO_TRACK_HEIGHT = 48;
const RULER_HEIGHT = 28;
const HANDLE_WIDTH = 8;

function generateId() {
    return "tl_" + Math.random().toString(36).slice(2, 10);
}

function frameToTime(frame: number, fps: number) {
    const s = frame / fps;
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1);
    return m > 0 ? `${m}:${sec.padStart(4, "0")}` : `${sec}s`;
}

export function CanvasTimelineEditor({
    data,
    onChange,
    onImageUpload,
}: {
    data: TimelineData;
    onChange: (data: TimelineData) => void;
    onImageUpload?: () => Promise<string | null>;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [playing, setPlaying] = useState(false);
    const playRef = useRef<{ raf: number; frame: number } | null>(null);
    const dragRef = useRef<{
        segId: string;
        edge: "left" | "right" | "move";
        startX: number;
        origStart: number;
        origLen: number;
    } | null>(null);

    const fps = data.frameRate;
    const pxPerFrame = 6 * zoom;
    const totalWidth = data.durationFrames * pxPerFrame;
    const canvasWidth = Math.max(totalWidth + 40, 800);

    const selectedSeg = useMemo(
        () => data.segments.find((s) => s.id === selectedId) ?? null,
        [data.segments, selectedId],
    );

    // Draw the timeline canvas
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const h = RULER_HEIGHT + TRACK_HEIGHT + AUDIO_TRACK_HEIGHT + 4;
        canvas.width = canvasWidth * dpr;
        canvas.height = h * dpr;
        canvas.style.width = canvasWidth + "px";
        canvas.style.height = h + "px";
        ctx.scale(dpr, dpr);

        // Background
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, canvasWidth, h);

        // Ruler
        ctx.fillStyle = "#16213e";
        ctx.fillRect(0, 0, canvasWidth, RULER_HEIGHT);
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1;
        const framesPerTick = zoom < 2 ? 12 : zoom < 4 ? 6 : 1;
        for (let f = 0; f <= data.durationFrames; f += framesPerTick) {
            const x = f * pxPerFrame;
            const major = f % (fps * (zoom < 2 ? 2 : 1)) === 0;
            ctx.beginPath();
            ctx.moveTo(x, major ? 4 : RULER_HEIGHT - 8);
            ctx.lineTo(x, RULER_HEIGHT);
            ctx.stroke();
            if (major) {
                ctx.fillStyle = "#94a3b8";
                ctx.font = "10px monospace";
                ctx.fillText(frameToTime(f, fps), x + 2, 14);
            }
        }

        // Track background
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, RULER_HEIGHT, canvasWidth, TRACK_HEIGHT);
        ctx.fillStyle = "#172033";
        ctx.fillRect(0, RULER_HEIGHT + TRACK_HEIGHT, canvasWidth, AUDIO_TRACK_HEIGHT);

        // Track labels
        ctx.fillStyle = "#64748b";
        ctx.font = "10px sans-serif";
        ctx.fillText("图片/文本轨道", 4, RULER_HEIGHT + 14);
        ctx.fillText("音频轨道", 4, RULER_HEIGHT + TRACK_HEIGHT + 14);

        // Segments
        for (const seg of data.segments) {
            const x = seg.start * pxPerFrame;
            const w = seg.length * pxPerFrame;
            const y = RULER_HEIGHT + 2;
            const segH = TRACK_HEIGHT - 4;
            const isSelected = seg.id === selectedId;

            // Fill
            if (seg.type === "image") {
                const grad = ctx.createLinearGradient(x, y, x, y + segH);
                grad.addColorStop(0, isSelected ? "#6366f1" : "#4f46e5");
                grad.addColorStop(1, isSelected ? "#818cf8" : "#6366f1");
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = isSelected ? "#f59e0b" : "#d97706";
            }
            ctx.beginPath();
            ctx.roundRect(x, y, w, segH, 4);
            ctx.fill();

            // Selected border
            if (isSelected) {
                ctx.strokeStyle = "#a5b4fc";
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Image preview
            if (seg.type === "image" && seg.imageUrl) {
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(x, y, w, segH, 4);
                ctx.clip();
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = seg.imageUrl;
                // Draw will be async, but we draw a placeholder for now
                ctx.fillStyle = "rgba(0,0,0,0.3)";
                ctx.fillRect(x, y, w, segH);
                ctx.restore();
            }

            // Prompt text
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + 4, y + 2, w - 8, segH - 4);
            ctx.clip();
            ctx.fillStyle = "#fff";
            ctx.font = "11px sans-serif";
            const text = seg.prompt || (seg.type === "image" ? "[图片]" : "[文本]");
            ctx.fillText(text, x + 6, y + 16);
            ctx.restore();

            // Handles
            ctx.fillStyle = isSelected ? "#c7d2fe" : "#818cf8";
            ctx.fillRect(x, y, HANDLE_WIDTH, segH);
            ctx.fillRect(x + w - HANDLE_WIDTH, y, HANDLE_WIDTH, segH);
        }

        // Audio segments
        for (const seg of data.audioSegments) {
            const x = seg.start * pxPerFrame;
            const w = seg.length * pxPerFrame;
            const y = RULER_HEIGHT + TRACK_HEIGHT + 2;
            const segH = AUDIO_TRACK_HEIGHT - 4;

            ctx.fillStyle = "#10b981";
            ctx.beginPath();
            ctx.roundRect(x, y, w, segH, 3);
            ctx.fill();

            ctx.fillStyle = "#fff";
            ctx.font = "10px sans-serif";
            ctx.fillText(seg.label || "[音频]", x + 4, y + 14);

            // Waveform visualization
            ctx.strokeStyle = "rgba(255,255,255,0.3)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let px = 0; px < w; px += 3) {
                const amp = (Math.sin(px * 0.3 + seg.start) * 0.4 + 0.5) * segH * 0.3;
                ctx.moveTo(x + px, y + segH / 2 - amp);
                ctx.lineTo(x + px, y + segH / 2 + amp);
            }
            ctx.stroke();
        }

        // Playhead
        if (playing && playRef.current) {
            const px = playRef.current.frame * pxPerFrame;
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px, 0);
            ctx.lineTo(px, h);
            ctx.stroke();
            ctx.fillStyle = "#ef4444";
            ctx.beginPath();
            ctx.moveTo(px - 5, 0);
            ctx.lineTo(px + 5, 0);
            ctx.lineTo(px, 8);
            ctx.fill();
        }
    }, [data, selectedId, zoom, pxPerFrame, canvasWidth, fps, playing]);

    useEffect(() => {
        draw();
    }, [draw]);

    // Playback
    const togglePlay = useCallback(() => {
        if (playing) {
            if (playRef.current) cancelAnimationFrame(playRef.current.raf);
            playRef.current = null;
            setPlaying(false);
            return;
        }
        setPlaying(true);
        playRef.current = { frame: 0, raf: 0 };
        const start = performance.now();
        const step = (now: number) => {
            if (!playRef.current) return;
            const elapsed = (now - start) / 1000;
            playRef.current.frame = Math.floor(elapsed * fps) % data.durationFrames;
            draw();
            playRef.current.raf = requestAnimationFrame(step);
        };
        playRef.current.raf = requestAnimationFrame(step);
    }, [playing, fps, data.durationFrames, draw]);

    useEffect(() => {
        return () => {
            if (playRef.current) cancelAnimationFrame(playRef.current.raf);
        };
    }, []);

    // Mouse interaction
    const getFrameAtX = (clientX: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return 0;
        return Math.max(0, Math.floor((clientX - rect.left) / pxPerFrame));
    };

    const hitTest = (clientX: number, clientY: number): { seg: TimelineSegment; edge: "left" | "right" | "move" } | null => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        if (y < RULER_HEIGHT || y > RULER_HEIGHT + TRACK_HEIGHT) return null;

        for (const seg of [...data.segments].reverse()) {
            const sx = seg.start * pxPerFrame;
            const sw = seg.length * pxPerFrame;
            if (x >= sx && x <= sx + sw) {
                if (x - sx < HANDLE_WIDTH) return { seg, edge: "left" };
                if (sx + sw - x < HANDLE_WIDTH) return { seg, edge: "right" };
                return { seg, edge: "move" };
            }
        }
        return null;
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const hit = hitTest(e.clientX, e.clientY);
        if (hit) {
            setSelectedId(hit.seg.id);
            dragRef.current = {
                segId: hit.seg.id,
                edge: hit.edge,
                startX: e.clientX,
                origStart: hit.seg.start,
                origLen: hit.seg.length,
            };
        } else {
            setSelectedId(null);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragRef.current) return;
        const dx = Math.round((e.clientX - dragRef.current.startX) / pxPerFrame);
        const segs = data.segments.map((s) => {
            if (s.id !== dragRef.current!.segId) return s;
            if (dragRef.current!.edge === "move") {
                const newStart = Math.max(0, Math.min(data.durationFrames - s.length, dragRef.current!.origStart + dx));
                return { ...s, start: newStart };
            }
            if (dragRef.current!.edge === "left") {
                const delta = Math.min(dx, dragRef.current!.origLen - 6);
                const newStart = Math.max(0, dragRef.current!.origStart + delta);
                const newLen = dragRef.current!.origLen - (newStart - dragRef.current!.origStart);
                return { ...s, start: newStart, length: Math.max(6, newLen) };
            }
            const newLen = Math.max(6, Math.min(data.durationFrames - s.start, dragRef.current!.origLen + dx));
            return { ...s, length: newLen };
        });
        onChange({ ...data, segments: segs });
    };

    const handleMouseUp = () => {
        dragRef.current = null;
    };

    // Actions
    const addSegment = useCallback(
        async (type: "image" | "text") => {
            let imageUrl: string | undefined;
            if (type === "image" && onImageUpload) {
                imageUrl = (await onImageUpload()) ?? undefined;
                if (!imageUrl) return;
            }
            const lastEnd = data.segments.reduce((max, s) => Math.max(max, s.start + s.length), 0);
            const newSeg: TimelineSegment = {
                id: generateId(),
                start: lastEnd,
                length: Math.min(30, data.durationFrames - lastEnd),
                prompt: "",
                type,
                imageUrl,
                guideStrength: 1.0,
            };
            if (newSeg.length < 6) return;
            onChange({ ...data, segments: [...data.segments, newSeg] });
            setSelectedId(newSeg.id);
        },
        [data, onChange, onImageUpload],
    );

    const deleteSelected = useCallback(() => {
        if (!selectedId) return;
        onChange({
            ...data,
            segments: data.segments.filter((s) => s.id !== selectedId),
        });
        setSelectedId(null);
    }, [data, onChange, selectedId]);

    const updateSelected = useCallback(
        (patch: Partial<TimelineSegment>) => {
            if (!selectedId) return;
            onChange({
                ...data,
                segments: data.segments.map((s) => (s.id === selectedId ? { ...s, ...patch } : s)),
            });
        },
        [data, onChange, selectedId],
    );

    return (
        <div className="flex flex-col rounded-xl border border-neutral-700 bg-neutral-900">
            {/* Toolbar */}
            <div className="flex items-center gap-2 border-b border-neutral-700 px-3 py-2">
                <Tooltip title="添加图片片段">
                    <Button size="small" icon={<FileImageOutlined />} onClick={() => void addSegment("image")}>
                        图片
                    </Button>
                </Tooltip>
                <Tooltip title="添加文本片段">
                    <Button size="small" icon={<PlusOutlined />} onClick={() => void addSegment("text")}>
                        文本
                    </Button>
                </Tooltip>
                <Tooltip title="删除选中">
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={deleteSelected} disabled={!selectedId} />
                </Tooltip>
                <div className="mx-2 h-4 w-px bg-neutral-600" />
                <Tooltip title={playing ? "暂停" : "播放"}>
                    <Button size="small" type="text" icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />} onClick={togglePlay} />
                </Tooltip>
                <div className="mx-2 h-4 w-px bg-neutral-600" />
                <ZoomOutOutlined className="cursor-pointer text-neutral-400" onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))} />
                <Slider
                    min={0.5}
                    max={6}
                    step={0.5}
                    value={zoom}
                    onChange={setZoom}
                    className="!w-24"
                    tooltip={{ formatter: (v) => `${v}x` }}
                />
                <ZoomInOutlined className="cursor-pointer text-neutral-400" onClick={() => setZoom((z) => Math.min(6, z + 0.5))} />
                <span className="ml-auto text-xs text-neutral-500">
                    {data.segments.length} 片段 · {frameToTime(data.durationFrames, fps)} · {fps}fps
                </span>
            </div>

            {/* Timeline canvas */}
            <div ref={containerRef} className="overflow-x-auto">
                <canvas
                    ref={canvasRef}
                    className="cursor-crosshair"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                />
            </div>

            {/* Properties panel */}
            {selectedSeg && (
                <div className="border-t border-neutral-700 px-3 py-2">
                    <div className="mb-2 flex items-center gap-2 text-xs text-neutral-400">
                        <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] uppercase">{selectedSeg.type}</span>
                        <span>
                            帧 {selectedSeg.start} - {selectedSeg.start + selectedSeg.length}
                        </span>
                        <span>({frameToTime(selectedSeg.length, fps)})</span>
                    </div>
                    <Input.TextArea
                        value={selectedSeg.prompt}
                        onChange={(e) => updateSelected({ prompt: e.target.value })}
                        placeholder="输入提示词..."
                        autoSize={{ minRows: 1, maxRows: 3 }}
                        className="!bg-neutral-800 !text-sm !text-neutral-200"
                    />
                    <div className="mt-2 flex items-center gap-3">
                        <span className="text-xs text-neutral-500">引导强度</span>
                        <Slider
                            min={0}
                            max={2}
                            step={0.05}
                            value={selectedSeg.guideStrength}
                            onChange={(v) => updateSelected({ guideStrength: v })}
                            className="!w-40"
                            tooltip={{ formatter: (v) => v?.toFixed(2) }}
                        />
                        <span className="text-xs text-neutral-400">{selectedSeg.guideStrength.toFixed(2)}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

/** Serialize timeline data to the payload format for ComfyUI-style backends */
export function serializeTimelinePayload(data: TimelineData) {
    const sortedSegs = [...data.segments].sort((a, b) => a.start - b.start);
    const segmentLengths = sortedSegs.map((s) => s.length);
    const localPrompts = sortedSegs.map((s) => s.prompt).join(" | ");
    const guideStrengths = sortedSegs.map((s) => s.guideStrength.toFixed(2)).join(",");

    return {
        timeline_data: JSON.stringify({
            segments: sortedSegs,
            audioSegments: data.audioSegments,
        }),
        local_prompts: localPrompts,
        segment_lengths: segmentLengths.join(","),
        guide_strength: guideStrengths,
        duration_frames: data.durationFrames,
        duration_seconds: data.durationFrames / data.frameRate,
        frame_rate: data.frameRate,
    };
}

/** Create default timeline data */
export function createDefaultTimeline(durationSeconds = 5, frameRate = 24): TimelineData {
    return {
        segments: [],
        audioSegments: [],
        durationFrames: durationSeconds * frameRate,
        frameRate,
    };
}
