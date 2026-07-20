"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { CanvasNodeType, type CanvasNodeData, type ViewportTransform } from "../types";

export function Minimap({ nodes, viewport, viewportSize, onViewportChange }: { nodes: CanvasNodeData[]; viewport: ViewportTransform; viewportSize: { width: number; height: number }; onViewportChange: (viewport: ViewportTransform) => void }) {
    const theme = useCanvasTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ clientX: number; clientY: number; viewport: ViewportTransform } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [compact, setCompact] = useState(false);
    const width = compact ? Math.max(116, Math.min(156, viewportSize.width - 214)) : 240;
    const height = compact ? 96 : 160;
    const mapHeight = height;

    useEffect(() => {
        const query = window.matchMedia("(max-width: 767px)");
        const update = () => setCompact(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    const { worldBounds, scale, offset } = useMemo(() => {
        const visibleX = -viewport.x / viewport.k;
        const visibleY = -viewport.y / viewport.k;
        const visibleW = viewportSize.width / viewport.k;
        const visibleH = viewportSize.height / viewport.k;
        let minX = nodes.length ? Infinity : visibleX;
        let minY = nodes.length ? Infinity : visibleY;
        let maxX = nodes.length ? -Infinity : visibleX + visibleW;
        let maxY = nodes.length ? -Infinity : visibleY + visibleH;

        nodes.forEach((node) => {
            minX = Math.min(minX, node.position.x);
            minY = Math.min(minY, node.position.y);
            maxX = Math.max(maxX, node.position.x + node.width);
            maxY = Math.max(maxY, node.position.y + node.height);
        });

        const padding = Math.max(500, visibleW * 0.35, visibleH * 0.35);
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;

        const boundsWidth = maxX - minX;
        const boundsHeight = maxY - minY;
        const nextScale = Math.min(width / boundsWidth, mapHeight / boundsHeight);
        const mapContentW = boundsWidth * nextScale;
        const mapContentH = boundsHeight * nextScale;

        return {
            worldBounds: { x: minX, y: minY, w: boundsWidth, h: boundsHeight },
            scale: nextScale,
            offset: { x: (width - mapContentW) / 2, y: (mapHeight - mapContentH) / 2 },
        };
    }, [mapHeight, nodes, viewport.k, viewport.x, viewport.y, viewportSize.height, viewportSize.width, width]);

    const toMinimap = useCallback(
        (worldX: number, worldY: number) => {
            return {
                x: (worldX - worldBounds.x) * scale + offset.x,
                y: (worldY - worldBounds.y) * scale + offset.y,
            };
        },
        [offset.x, offset.y, scale, worldBounds.x, worldBounds.y],
    );

    const toWorld = useCallback(
        (minimapX: number, minimapY: number) => {
            return {
                x: (minimapX - offset.x) / scale + worldBounds.x,
                y: (minimapY - offset.y) / scale + worldBounds.y,
            };
        },
        [offset.x, offset.y, scale, worldBounds.x, worldBounds.y],
    );

    const viewportRect = useMemo(() => {
        const vx = -viewport.x / viewport.k;
        const vy = -viewport.y / viewport.k;
        const vw = viewportSize.width / viewport.k;
        const vh = viewportSize.height / viewport.k;
        const p1 = toMinimap(vx, vy);
        const p2 = toMinimap(vx + vw, vy + vh);

        return {
            x: p1.x,
            y: p1.y,
            w: Math.max(p2.x - p1.x, 4),
            h: Math.max(p2.y - p1.y, 4),
        };
    }, [toMinimap, viewport.k, viewport.x, viewport.y, viewportSize.height, viewportSize.width]);

    const dragRect = viewportRect;

    const updateViewportFromMinimapCenter = (centerX: number, centerY: number) => {
        const world = toWorld(centerX, centerY);
        onViewportChange({
            x: viewportSize.width / 2 - world.x * viewport.k,
            y: viewportSize.height / 2 - world.y * viewport.k,
            k: viewport.k,
        });
    };

    const updateViewportFromEvent = (event: React.PointerEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const localX = event.clientX - rect.left;
        const localY = event.clientY - rect.top;
        if (compact && dragStartRef.current) {
            const start = dragStartRef.current;
            const dx = (event.clientX - start.clientX) / scale;
            const dy = (event.clientY - start.clientY) / scale;
            onViewportChange({
                x: start.viewport.x - dx * start.viewport.k,
                y: start.viewport.y - dy * start.viewport.k,
                k: start.viewport.k,
            });
            return;
        }
        updateViewportFromMinimapCenter(localX, localY);
    };

    const centerNode = (node: CanvasNodeData) => {
        onViewportChange({
            x: viewportSize.width / 2 - (node.position.x + node.width / 2) * viewport.k,
            y: viewportSize.height / 2 - (node.position.y + node.height / 2) * viewport.k,
            k: viewport.k,
        });
    };

    return (
        <div className="absolute bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.75rem)] right-3 z-50 overflow-hidden rounded-xl border shadow-2xl backdrop-blur-sm md:bottom-24 md:left-6 md:right-auto" style={{ width, height, background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
            <div
                ref={containerRef}
                className={compact ? "relative w-full cursor-grab touch-none active:cursor-grabbing" : "relative w-full cursor-crosshair"}
                style={{ height: mapHeight }}
                onPointerDown={(event) => {
                    event.preventDefault();
                    if (compact) {
                        const rect = containerRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        const localX = event.clientX - rect.left;
                        const localY = event.clientY - rect.top;
                        const insideViewport =
                            localX >= dragRect.x &&
                            localX <= dragRect.x + dragRect.w &&
                            localY >= dragRect.y &&
                            localY <= dragRect.y + dragRect.h;
                        if (!insideViewport) return;
                        dragStartRef.current = { clientX: event.clientX, clientY: event.clientY, viewport };
                    }
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setIsDragging(true);
                    updateViewportFromEvent(event);
                }}
                onPointerMove={(event) => {
                    if (isDragging) updateViewportFromEvent(event);
                }}
                onPointerUp={() => {
                    dragStartRef.current = null;
                    setIsDragging(false);
                }}
                onPointerLeave={() => {
                    dragStartRef.current = null;
                    setIsDragging(false);
                }}
            >
                {nodes.map((node) => {
                    const pos = toMinimap(node.position.x, node.position.y);
                    const color = node.type === CanvasNodeType.Image ? "#10b981" : node.type === CanvasNodeType.Video ? "#f97316" : node.type === CanvasNodeType.Audio ? "#a855f7" : node.type === CanvasNodeType.Pdf ? "#ef4444" : node.type === CanvasNodeType.Config ? "#60a5fa" : theme.node.muted;
                    const markerWidth = Math.max(node.width * scale, compact ? 6 : 2);
                    const markerHeight = Math.max(node.height * scale, compact ? 6 : 2);
                    return (
                        <div
                            key={node.id}
                            className={compact ? "absolute rounded-[3px]" : "pointer-events-none absolute rounded-[3px]"}
                            style={{
                                left: pos.x,
                                top: pos.y,
                                width: markerWidth,
                                height: markerHeight,
                                backgroundColor: color,
                                border: compact ? `1px solid ${theme.toolbar.panel}` : undefined,
                                boxShadow: compact ? "0 1px 4px rgba(0,0,0,.16)" : undefined,
                                opacity: compact ? 0.92 : 0.8,
                                cursor: compact ? "pointer" : undefined,
                            }}
                            onPointerDown={(event) => {
                                if (!compact) return;
                                event.preventDefault();
                                event.stopPropagation();
                                centerNode(node);
                            }}
                        />
                    );
                })}
                <div
                    className={compact ? "absolute rounded-lg border shadow-md" : "pointer-events-none absolute border"}
                    style={{
                        left: viewportRect.x,
                        top: viewportRect.y,
                        width: viewportRect.w,
                        height: viewportRect.h,
                        borderColor: theme.node.activeStroke,
                        background: `${theme.node.activeStroke}18`,
                        boxShadow: compact ? `0 0 0 1px ${theme.toolbar.panel}, 0 8px 18px rgba(0,0,0,.18)` : undefined,
                        cursor: compact ? "grab" : undefined,
                    }}
                />
            </div>
        </div>
    );
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}
