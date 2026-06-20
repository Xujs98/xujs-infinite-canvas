"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";

type PanoramaViewerProps = {
    imageUrl: string;
    open: boolean;
    onClose: () => void;
};

export function PanoramaViewer({ imageUrl, open, onClose }: PanoramaViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [rotation, setRotation] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const dragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        dragging.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging.current) return;
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        lastPos.current = { x: e.clientX, y: e.clientY };
        setRotation((prev) => ({
            x: Math.max(-85, Math.min(85, prev.x - dy * 0.3)),
            y: prev.y + dx * 0.3,
        }));
    }, []);

    const handlePointerUp = useCallback(() => {
        dragging.current = false;
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setZoom((prev) => Math.max(0.5, Math.min(3, prev - e.deltaY * 0.001)));
    }, []);

    const handleReset = useCallback(() => {
        setRotation({ x: 0, y: 0 });
        setZoom(1);
    }, []);

    useEffect(() => {
        if (!open) {
            setRotation({ x: 0, y: 0 });
            setZoom(1);
        }
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="glass-strong absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="relative z-10 flex h-[85vh] w-[85vw] max-w-[1200px] flex-col overflow-hidden rounded-2xl border bg-black/90 shadow-2xl">
                <div className="glass flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-white/70">
                        <Maximize2 className="size-4" />
                        <span>360 全景查看器</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button type="button" className="flex size-8 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white" onClick={() => setZoom((z) => Math.min(3, z + 0.2))} title="放大">
                            <ZoomIn className="size-4" />
                        </button>
                        <button type="button" className="flex size-8 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white" onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))} title="缩小">
                            <ZoomOut className="size-4" />
                        </button>
                        <button type="button" className="flex size-8 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white" onClick={handleReset} title="重置视角">
                            <RotateCcw className="size-4" />
                        </button>
                        <div className="mx-2 h-4 w-px bg-white/20" />
                        <button type="button" className="flex size-8 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white" onClick={onClose} title="关闭">
                            <X className="size-4" />
                        </button>
                    </div>
                </div>
                <div
                    ref={containerRef}
                    className="relative flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onWheel={handleWheel}
                >
                    <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{
                            perspective: "800px",
                            perspectiveOrigin: "50% 50%",
                        }}
                    >
                        <img
                            src={imageUrl}
                            alt="全景图"
                            className="max-h-none max-w-none select-none"
                            style={{
                                width: `${100 * zoom}%`,
                                height: `${100 * zoom}%`,
                                objectFit: "cover",
                                transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
                                transformStyle: "preserve-3d",
                                transition: dragging.current ? "none" : "transform 0.1s ease-out",
                            }}
                            draggable={false}
                        />
                    </div>
                    <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-xs text-white/60">
                        拖拽旋转 · 滚轮缩放
                    </div>
                </div>
            </div>
        </div>
    );
}

export function usePanoramaViewer() {
    const [panoramaImage, setPanoramaImage] = useState<string | null>(null);

    const openPanorama = useCallback((imageUrl: string) => {
        setPanoramaImage(imageUrl);
    }, []);

    const closePanorama = useCallback(() => {
        setPanoramaImage(null);
    }, []);

    return { panoramaImage, openPanorama, closePanorama };
}
