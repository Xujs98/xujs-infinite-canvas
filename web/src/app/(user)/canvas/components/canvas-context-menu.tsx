"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import type { ContextMenuState } from "../types";

export function CanvasNodeContextMenu({ menu, onClose, onDuplicate, onDelete }: { menu: ContextMenuState; onClose: () => void; onDuplicate: () => void; onDelete: () => void }) {
    const theme = useCanvasTheme();
    const menuWidth = 176;
    const menuX = typeof window === "undefined" ? menu.x : Math.min(menu.x, window.innerWidth - menuWidth - 12);
    const menuY = typeof window === "undefined" ? menu.y : Math.min(menu.y, window.innerHeight - 112);

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [onClose]);

    return (
        <div
            className="fixed z-[80] min-w-44 overflow-hidden rounded-xl border py-1 shadow-2xl"
            style={{ left: Math.max(12, menuX), top: Math.max(12, menuY), background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {menu.type === "node" ? <MenuButton icon={<Plus className="size-4" />} label="复制" onClick={onDuplicate} /> : null}
            <MenuButton icon={<Trash2 className="size-4" />} label="删除" onClick={onDelete} danger />
        </div>
    );
}

function MenuButton({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
    const theme = useCanvasTheme();

    return (
        <button type="button" className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:opacity-80 md:min-h-0 md:py-2 md:text-xs" style={{ color: danger ? "#f87171" : theme.node.text }} onClick={onClick}>
            {icon}
            <span>{label}</span>
        </button>
    );
}
