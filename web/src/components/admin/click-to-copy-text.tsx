"use client";

import { Tooltip, Typography } from "antd";
import type { ComponentProps, KeyboardEvent, ReactNode } from "react";

import { useCopyText } from "@/hooks/use-copy-text";

type ClickToCopyTextProps = Omit<ComponentProps<typeof Typography.Text>, "children" | "copyable" | "onClick" | "onKeyDown"> & {
    value: string;
    children?: ReactNode;
    successText?: string;
};

export function ClickToCopyText({ value, children, className, successText = "已复制", ...textProps }: ClickToCopyTextProps) {
    const copyText = useCopyText();

    const copy = () => {
        if (value) copyText(value, successText);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            copy();
        }
    };

    return (
        <Tooltip title="点击复制">
            <Typography.Text {...textProps} className={["admin-click-copy", className].filter(Boolean).join(" ")} role="button" tabIndex={0} onClick={copy} onKeyDown={handleKeyDown}>
                {children ?? value}
            </Typography.Text>
        </Tooltip>
    );
}
