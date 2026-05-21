"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";
import { Dropdown } from "antd";
import { Settings2 } from "lucide-react";
import type { ItemType } from "antd/es/menu/interface";

import { GitHubLink } from "@/components/github-link";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { VersionReleaseModal } from "@/components/version-release-modal";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

type UserStatusActionsProps = {
  onOpenConfig?: () => void;
  showConfig?: boolean;
  userName?: string;
  initial?: string;
  menuItems: ItemType[];
  accountOpen?: boolean;
  onAccountOpenChange?: (open: boolean) => void;
  accountRef?: RefObject<HTMLDivElement | null>;
  getPopupContainer?: (node: HTMLElement) => HTMLElement;
  avatarClassName?: string;
  avatarStyle?: CSSProperties;
  gitHubClassName?: string;
  gitHubStyle?: CSSProperties;
  versionStyle?: CSSProperties;
  userLabel?: ReactNode;
  iconStyle?: CSSProperties;
};

export function UserStatusActions({
  onOpenConfig,
  showConfig = true,
  userName,
  initial,
  menuItems,
  accountOpen,
  onAccountOpenChange,
  accountRef,
  getPopupContainer,
  avatarClassName,
  avatarStyle,
  gitHubClassName,
  gitHubStyle,
  versionStyle,
  userLabel,
  iconStyle,
}: UserStatusActionsProps) {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const storedUserName = useUserStore((state) => state.user?.username);
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
  const resolvedUserName = userName || storedUserName;
  const avatarText = initial || (resolvedUserName?.trim()[0] || "U").toUpperCase();
  const naturalIconClass = "inline-flex size-8 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 dark:text-stone-300 dark:hover:text-white [&_svg]:size-4";

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5">
      {showConfig ? (
        <button
          type="button"
          className={naturalIconClass}
          style={iconStyle}
          onClick={onOpenConfig}
          aria-label="配置"
          title="配置"
        >
          <Settings2 className="size-4" />
        </button>
      ) : null}
      <AnimatedThemeToggler
        theme={theme}
        onThemeChange={setTheme}
        className={naturalIconClass}
        style={iconStyle}
        aria-label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
        title={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
      />
      <VersionReleaseModal currentVersion={appVersion} style={versionStyle} />
      <GitHubLink className={cn("bg-transparent hover:bg-transparent dark:hover:bg-transparent", gitHubClassName)} style={gitHubStyle} />
      <div ref={accountRef}>
        <Dropdown
          open={accountOpen}
          onOpenChange={onAccountOpenChange}
          trigger={["click"]}
          placement="bottomRight"
          getPopupContainer={getPopupContainer}
          styles={{ root: { minWidth: 150 } }}
          menu={{ items: menuItems }}
        >
          <button
            type="button"
            className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-transparent p-0 text-xs font-semibold leading-none text-stone-800 transition hover:border-stone-500 hover:text-stone-950 dark:border-stone-700 dark:text-stone-100 dark:hover:border-stone-400 dark:hover:text-white", avatarClassName)}
            style={avatarStyle}
            aria-label="账户菜单"
          >
            <span className="leading-none">{userLabel ?? avatarText}</span>
          </button>
        </Dropdown>
      </div>
    </div>
  );
}
