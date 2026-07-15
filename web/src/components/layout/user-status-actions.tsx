"use client";

import type { CSSProperties, RefObject } from "react";
import { useState } from "react";
import { App, Avatar, Dropdown, Input, Modal, Tooltip } from "antd";
import { BookOpen, Crown, Headset, Keyboard, KeyRound, LogOut, Settings2, Shield } from "lucide-react";
import type { ItemType } from "antd/es/menu/interface";
import Link from "next/link";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { GitHubLink } from "@/components/layout/github-link";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import AnnouncementBell from "@/components/announcement-bell";
import { CreditSymbol } from "@/constant/credits";
import { DOCS_URL } from "@/constant/env";
import { cn } from "@/lib/utils";
import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import { redeemCode } from "@/services/api/auth";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
    accountOpen?: boolean;
    onAccountOpenChange?: (open: boolean) => void;
    accountRef?: RefObject<HTMLDivElement | null>;
    getPopupContainer?: (node: HTMLElement) => HTMLElement;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts, accountOpen, onAccountOpenChange, accountRef, getPopupContainer }: UserStatusActionsProps) {
    const { message } = App.useApp();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const setSession = useUserStore((state) => state.setSession);
    const logout = useUserStore((state) => state.clearSession);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const serviceContact = useConfigStore((state) => state.publicSystemSettings?.serviceContact);
    const [redeemOpen, setRedeemOpen] = useState(false);
    const [redeemValue, setRedeemValue] = useState("");
    const [redeemLoading, setRedeemLoading] = useState(false);
    const canvasTheme = useCanvasTheme();
    const userName = user?.displayName || user?.username || "";
    const credits = user?.credits ?? 0;
    const subscriptionCredits = user?.subscriptionCredits ?? 0;
    const isNegativeCredits = credits < 0;
    const avatarUrl = user?.avatarUrl?.trim();
    const avatarText = (userName.trim()[0] || "U").toUpperCase();
    const naturalIconClass = "inline-flex size-7 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const versionStyle = iconStyle;
    const gitHubClassName = "size-7 text-base";
    const gitHubStyle = iconStyle;
    const avatarStyle: CSSProperties | undefined = variant === "canvas" ? { borderColor: canvasTheme.toolbar.border, color: canvasTheme.node.text, background: "transparent" } : undefined;
    const handleRedeem = async () => {
        const code = redeemValue.trim();
        if (!code) {
            message.warning("请输入卡密");
            return;
        }
        setRedeemLoading(true);
        try {
            const updatedUser = await redeemCode(token, code);
            setSession(token, updatedUser);
            message.success("兑换成功");
            setRedeemOpen(false);
            setRedeemValue("");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "兑换失败");
        } finally {
            setRedeemLoading(false);
        }
    };

    const menuItems: ItemType[] = [
        { key: "user", disabled: true, label: <span className="font-medium text-current">{userName}</span> },
        { key: "profile", icon: <BookOpen className="size-4" />, label: <Link href="/profile">个人中心</Link> },
        { key: "subscriptions", icon: <Crown className="size-4" />, label: <Link href="/subscriptions">订阅套餐</Link> },
        ...(user?.role === "admin" ? [{ key: "admin", icon: <Shield className="size-4" />, label: <Link href="/admin">管理后台</Link> }] : []),
        { key: "redeem", icon: <KeyRound className="size-4" />, label: "兑换卡密", onClick: () => setRedeemOpen(true) },
        ...(onOpenShortcuts ? [{ key: "shortcuts", icon: <Keyboard className="size-4" />, label: "快捷键", onClick: onOpenShortcuts }] : []),
        { type: "divider" },
        { key: "logout", icon: <LogOut className="size-4" />, label: "退出登录", onClick: logout },
    ];

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            {user?.role === "admin" && (
                <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className={naturalIconClass} style={iconStyle} aria-label="文档" title="文档">
                    <BookOpen className="size-4" />
                </a>
            )}
            {showConfig ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label="配置" title="配置">
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={naturalIconClass} style={iconStyle} aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} />
            {user?.role === "admin" && <VersionReleaseModal style={versionStyle} />}
            {user?.role === "admin" && <GitHubLink className={cn("bg-transparent hover:bg-transparent dark:hover:bg-transparent", gitHubClassName)} style={gitHubStyle} />}
            {serviceContact ? (
                <Tooltip title={<span>点击复制：{serviceContact}</span>} placement="bottom">
                    <button
                        type="button"
                        className={naturalIconClass}
                        style={iconStyle}
                        aria-label="客服"
                        title="客服"
                        onClick={() => {
                            void navigator.clipboard.writeText(serviceContact);
                            message.success("客服联系方式已复制");
                        }}
                    >
                        <Headset className="size-4" />
                    </button>
                </Tooltip>
            ) : null}
            <AnnouncementBell />
            {variant === "canvas" && user ? (
                <Tooltip title={user.hasActiveSubscription ? `订阅额度 ${subscriptionCredits.toLocaleString()}，钱包余额 ${credits.toLocaleString()}` : "钱包算力点余额"} placement="bottom">
                    <div className="flex h-8 shrink-0 items-center gap-2 px-1.5 text-xs font-medium tabular-nums opacity-75 transition hover:opacity-100" style={{ color: isNegativeCredits ? "#ef4444" : canvasTheme.node.text }}>
                        {user.hasActiveSubscription ? <span className="inline-flex items-center gap-1 text-emerald-600"><Crown className="size-3.5" />{subscriptionCredits.toLocaleString()}</span> : null}
                        <span className="inline-flex items-center gap-1"><CreditSymbol className="text-sm leading-none" />{credits.toLocaleString()}</span>
                    </div>
                </Tooltip>
            ) : null}
            {!user && onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label="快捷键" title="快捷键">
                    <Keyboard className="size-4" />
                </button>
            ) : null}
            {!user ? (
                <Link href="/login" className="px-1.5 text-sm font-medium text-stone-600 underline-offset-4 transition hover:text-stone-950 hover:underline dark:text-stone-300 dark:hover:text-stone-100" style={iconStyle}>
                    登录
                </Link>
            ) : null}
            {user ? (
                <div ref={accountRef}>
                    <Dropdown open={accountOpen} onOpenChange={onAccountOpenChange} trigger={["click"]} placement="bottomRight" getPopupContainer={getPopupContainer} styles={{ root: { minWidth: 150 } }} menu={{ items: menuItems }}>
                        <button type="button" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-transparent p-0 text-[0] leading-[0] transition" aria-label="账户菜单">
                            <Avatar
                                size={24}
                                src={avatarUrl ? <img src={avatarUrl} alt={userName} referrerPolicy="no-referrer" /> : undefined}
                                alt={userName}
                                className="!flex !items-center !justify-center border border-stone-300 bg-transparent text-[11px] font-semibold text-stone-800 transition hover:border-stone-500 hover:text-stone-950 dark:border-stone-700 dark:text-stone-100 dark:hover:border-stone-400 dark:hover:text-white"
                                style={avatarStyle}
                            >
                                {avatarText}
                            </Avatar>
                        </button>
                    </Dropdown>
                </div>
            ) : null}
            <Modal
                title="兑换卡密"
                open={redeemOpen}
                onCancel={() => {
                    setRedeemOpen(false);
                    setRedeemValue("");
                }}
                onOk={() => void handleRedeem()}
                okText="兑换"
                cancelText="取消"
                confirmLoading={redeemLoading}
                destroyOnHidden
            >
                <Input value={redeemValue} onChange={(e) => setRedeemValue(e.target.value)} placeholder="请输入卡密" onPressEnter={() => void handleRedeem()} autoFocus />
            </Modal>
        </div>
    );
}
