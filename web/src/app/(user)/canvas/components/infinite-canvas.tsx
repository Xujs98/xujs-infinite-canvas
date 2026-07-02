"use client";

import React, { useEffect, useRef, useState } from "react";

import { type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import type { ViewportTransform } from "../types";

type InfiniteCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    backgroundMode?: CanvasBackgroundMode;
    onViewportChange: (viewport: ViewportTransform) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onContextMenu?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
};

export function InfiniteCanvas({ containerRef, viewport, backgroundMode = "lines", onViewportChange, onCanvasMouseDown, onCanvasDeselect, onContextMenu, onDrop, children }: InfiniteCanvasProps) {
    const theme = useCanvasTheme();
    const panState = useRef({
        isPanning: false,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        hasMoved: false,
    });
    const activeTouchPointersRef = useRef(new Map<number, { x: number; y: number }>());
    const pinchStateRef = useRef<{
        active: boolean;
        startDistance: number;
        startScale: number;
        worldX: number;
        worldY: number;
    } | null>(null);
    const viewportRef = useRef(viewport);
    const scaleRef = useRef(viewport.k);
    const frameRef = useRef<number | null>(null);
    const nextViewportRef = useRef<ViewportTransform | null>(null);
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    useEffect(() => {
        viewportRef.current = viewport;
        scaleRef.current = viewport.k;
    }, [viewport]);

    useEffect(
        () => () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        },
        [],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== "Space") return;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            setIsSpacePressed(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Space") setIsSpacePressed(false);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return;

        const delta = -event.deltaY;
        const factor = Math.pow(1.1, delta / 100);
        const newScale = Math.min(Math.max(viewport.k * factor, 0.05), 5);
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const worldX = (mouseX - viewport.x) / viewport.k;
        const worldY = (mouseY - viewport.y) / viewport.k;

        onViewportChange({
            x: mouseX - worldX * newScale,
            y: mouseY - worldY * newScale,
            k: newScale,
        });
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom]")) return;
        if (target?.closest("[data-connection-create-menu]")) return;
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]");

        if (event.pointerType === "touch") {
            activeTouchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (activeTouchPointersRef.current.size >= 2) {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                const rect = containerRef.current?.getBoundingClientRect();
                const points = Array.from(activeTouchPointersRef.current.values()).slice(0, 2);
                if (rect && points.length === 2) {
                    const centerX = (points[0].x + points[1].x) / 2 - rect.left;
                    const centerY = (points[0].y + points[1].y) / 2 - rect.top;
                    const currentViewport = viewportRef.current;
                    pinchStateRef.current = {
                        active: true,
                        startDistance: getPointerDistance(points[0], points[1]),
                        startScale: currentViewport.k,
                        worldX: (centerX - currentViewport.x) / currentViewport.k,
                        worldY: (centerY - currentViewport.y) / currentViewport.k,
                    };
                    panState.current.isPanning = false;
                    document.body.style.cursor = "default";
                }
                return;
            }
        }

        if (event.button === 0 && (event.ctrlKey || event.metaKey) && isBackgroundClick) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onCanvasMouseDown?.(event);
            return;
        }

        if (event.button === 1 || (event.button === 0 && !isSpacePressed && isBackgroundClick)) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            panState.current = {
                isPanning: true,
                startX: event.clientX,
                startY: event.clientY,
                initialX: viewport.x,
                initialY: viewport.y,
                hasMoved: false,
            };
            document.body.style.cursor = "grabbing";
            return;
        }

        if (event.button === 0 && isSpacePressed && isBackgroundClick) {
            event.preventDefault();
        }
    };

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (event.pointerType === "touch" && activeTouchPointersRef.current.has(event.pointerId)) {
                activeTouchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            }

            if (pinchStateRef.current?.active && activeTouchPointersRef.current.size >= 2) {
                event.preventDefault();
                const rect = containerRef.current?.getBoundingClientRect();
                const points = Array.from(activeTouchPointersRef.current.values()).slice(0, 2);
                const pinch = pinchStateRef.current;
                if (!rect || points.length !== 2 || pinch.startDistance <= 0) return;
                const centerX = (points[0].x + points[1].x) / 2 - rect.left;
                const centerY = (points[0].y + points[1].y) / 2 - rect.top;
                const nextScale = Math.min(Math.max(pinch.startScale * (getPointerDistance(points[0], points[1]) / pinch.startDistance), 0.05), 5);
                nextViewportRef.current = {
                    x: centerX - pinch.worldX * nextScale,
                    y: centerY - pinch.worldY * nextScale,
                    k: nextScale,
                };
                if (frameRef.current) return;
                frameRef.current = requestAnimationFrame(() => {
                    frameRef.current = null;
                    if (nextViewportRef.current) onViewportChange(nextViewportRef.current);
                });
                return;
            }

            if (!panState.current.isPanning) return;

            const dx = event.clientX - panState.current.startX;
            const dy = event.clientY - panState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                panState.current.hasMoved = true;
            }

            nextViewportRef.current = {
                x: panState.current.initialX + dx,
                y: panState.current.initialY + dy,
                k: scaleRef.current,
            };
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                if (nextViewportRef.current) onViewportChange(nextViewportRef.current);
            });
        };

        const handlePointerUp = (event: PointerEvent) => {
            if (event.pointerType === "touch") {
                activeTouchPointersRef.current.delete(event.pointerId);
                if (activeTouchPointersRef.current.size < 2) {
                    pinchStateRef.current = null;
                }
            }

            if (!panState.current.isPanning) return;

            if (!panState.current.hasMoved) {
                onCanvasDeselect?.();
            }
            panState.current.isPanning = false;
            document.body.style.cursor = "default";
        };

        const handlePointerCancel = (event: PointerEvent) => {
            if (event.pointerType === "touch") {
                activeTouchPointersRef.current.delete(event.pointerId);
                if (activeTouchPointersRef.current.size < 2) pinchStateRef.current = null;
            }
            panState.current.isPanning = false;
            document.body.style.cursor = "default";
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerCancel);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerCancel);
        };
    }, [containerRef, onCanvasDeselect, onViewportChange]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const preventWheelScroll = (event: WheelEvent) => {
            // 检查事件目标或其祖先是否为可滚动元素，允许内部滚动
            const target = event.target as HTMLElement | null;
            if (target) {
                let el: HTMLElement | null = target;
                while (el && el !== container) {
                    const style = window.getComputedStyle(el);
                    const overflowY = style.overflowY;
                    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
                        return; // 可滚动元素，允许默认滚动行为
                    }
                    el = el.parentElement;
                }
            }
            event.preventDefault();
        };
        container.addEventListener("wheel", preventWheelScroll, { passive: false });
        return () => container.removeEventListener("wheel", preventWheelScroll);
    }, [containerRef]);

    return (
        <div
            ref={containerRef}
            className="relative h-full w-full touch-none cursor-grab select-none overflow-hidden"
            style={{ background: theme.canvas.background }}
            onPointerDown={handlePointerDown}
            onWheel={handleWheel}
            onContextMenu={onContextMenu}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            <CanvasGrid viewport={viewport} mode={backgroundMode} />
            <div
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`,
                }}
            >
                {children}
            </div>
        </div>
    );
}

function getPointerDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function CanvasGrid({ viewport, mode }: { viewport: ViewportTransform; mode: CanvasBackgroundMode }) {
    const theme = useCanvasTheme();
    if (mode === "blank") return null;

    const gridSize = 48 * viewport.k;
    const x = viewport.x % gridSize;
    const y = viewport.y % gridSize;
    const dotSize = viewport.k < 0.12 ? 0.8 : 1.15;
    const backgroundImage =
        mode === "dots" ? `radial-gradient(circle, ${theme.canvas.dot} ${dotSize}px, transparent ${dotSize + 0.2}px)` : `linear-gradient(${theme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.canvas.line} 1px, transparent 1px)`;

    return (
        <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
                backgroundImage,
                backgroundSize: `${gridSize}px ${gridSize}px`,
                backgroundPosition: `${x}px ${y}px`,
            }}
        />
    );
}
