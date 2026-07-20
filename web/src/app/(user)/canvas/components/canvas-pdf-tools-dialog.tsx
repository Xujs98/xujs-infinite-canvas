"use client";

import { useMemo, useState } from "react";
import { App, Button, Input, Modal, Progress, Segmented, Slider } from "antd";
import { Archive, FileImage, Minus, Plus, Rows3 } from "lucide-react";
import { saveAs } from "file-saver";

import { useCanvasTheme } from "@/hooks/use-canvas-theme";
import type { CanvasNodeData } from "../types";
import { allPdfPages, formatPdfFileStem, mergePdfPagesToLongPng, parsePdfPageSelection, renderPdfPages, type PdfImageFormat, type RenderedPdfPage } from "../utils/pdf-processing";

export type PdfImageOutput = RenderedPdfPage & { fileName: string };

type Props = {
    node: CanvasNodeData | null;
    open: boolean;
    onClose: () => void;
    onCreateImageNodes: (sourceNode: CanvasNodeData, images: PdfImageOutput[]) => Promise<void>;
};

const DPI_OPTIONS = [
    { value: 96, label: "标准" },
    { value: 144, label: "清晰" },
    { value: 216, label: "高清" },
    { value: 300, label: "打印" },
] as const;

function clampDpi(value: number): number {
    return Math.min(600, Math.max(72, Math.round(value)));
}

export function CanvasPdfToolsDialog({ node, open, onClose, onCreateImageNodes }: Props) {
    const { message } = App.useApp();
    const theme = useCanvasTheme();
    const [format, setFormat] = useState<PdfImageFormat>("png");
    const [pageMode, setPageMode] = useState<"all" | "specified">("all");
    const [pageExpression, setPageExpression] = useState("1");
    const [dpi, setDpi] = useState(144);
    const [jpegQuality, setJpegQuality] = useState(92);
    const [operation, setOperation] = useState<"pages" | "long" | "zip" | null>(null);
    const [progress, setProgress] = useState(0);
    const pageCount = node?.metadata?.pdfPageCount || 0;
    const stem = useMemo(() => formatPdfFileStem(node?.title || "document.pdf"), [node?.title]);

    const getPages = () => (pageMode === "all" ? allPdfPages(pageCount) : parsePdfPageSelection(pageExpression, pageCount));
    const render = async (outputFormat: PdfImageFormat) => {
        if (!node?.metadata?.content) throw new Error("PDF 源文件已丢失，请重新拖入文件");
        const pages = getPages();
        setProgress(0);
        return renderPdfPages(node.metadata.content, pages, {
            dpi,
            format: outputFormat,
            jpegQuality: jpegQuality / 100,
            onProgress: (completed, total) => setProgress(Math.round((completed / total) * 100)),
        });
    };

    const run = async (kind: "pages" | "long" | "zip", task: () => Promise<void>) => {
        setOperation(kind);
        try {
            await task();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setOperation(null);
        }
    };

    const pageName = (pageNumber: number, outputFormat: PdfImageFormat) => `${stem}-page-${String(pageNumber).padStart(3, "0")}.${outputFormat === "jpeg" ? "jpg" : "png"}`;
    const convertPages = () =>
        run("pages", async () => {
            if (!node) return;
            const pages = await render(format);
            await onCreateImageNodes(
                node,
                pages.map((page) => ({ ...page, fileName: pageName(page.pageNumber, format) })),
            );
            message.success(`已生成 ${pages.length} 个图片节点`);
        });
    const mergeLong = () =>
        run("long", async () => {
            if (!node) return;
            const longImage = await mergePdfPagesToLongPng(await render("png"));
            await onCreateImageNodes(node, [{ ...longImage, fileName: `${stem}-long.png` }]);
            message.success("长图节点已生成");
        });
    const downloadZip = () =>
        run("zip", async () => {
            const pages = await render("png");
            const longImage = await mergePdfPagesToLongPng(pages);
            const JSZip = (await import("jszip")).default;
            const zip = new JSZip();
            pages.forEach((page) => zip.file(`pages/${pageName(page.pageNumber, "png")}`, page.blob));
            zip.file(`long/${stem}-long.png`, longImage.blob);
            const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, (meta) => setProgress(Math.round(meta.percent)));
            saveAs(blob, `${stem}-images.zip`);
            message.success("ZIP 已开始下载");
        });

    const busy = Boolean(operation);
    return (
        <Modal
            open={open}
            title={
                <div>
                    <div className="text-sm font-semibold">PDF 转换</div>
                    <div className="mt-0.5 max-w-[480px] truncate text-[11px] font-normal" style={{ color: theme.node.muted }}>
                        {node?.title} · {pageCount} 页
                    </div>
                </div>
            }
            onCancel={busy ? undefined : onClose}
            footer={null}
            width={680}
            centered
            destroyOnHidden
            maskClosable={!busy}
        >
            <div className="grid gap-5 py-2 sm:grid-cols-2" style={{ color: theme.node.text }}>
                <div className="space-y-4">
                    <Field label="输出格式">
                        <Segmented
                            block
                            value={format}
                            options={[
                                { value: "png", label: "PNG" },
                                { value: "jpeg", label: "JPG" },
                            ]}
                            onChange={(value) => setFormat(value as PdfImageFormat)}
                        />
                    </Field>
                    <Field label="转换页码">
                        <Segmented
                            block
                            value={pageMode}
                            options={[
                                { value: "all", label: `全部 ${pageCount} 页` },
                                { value: "specified", label: "指定页" },
                            ]}
                            onChange={(value) => setPageMode(value as "all" | "specified")}
                        />
                        {pageMode === "specified" ? <Input className="mt-2" value={pageExpression} onChange={(event) => setPageExpression(event.target.value)} placeholder={`例如 1,3-5（共 ${pageCount} 页）`} /> : null}
                    </Field>
                </div>
                <div className="space-y-4">
                    <Field label="分辨率 / 清晰度">
                        <DpiControl value={dpi} onChange={setDpi} theme={theme} />
                    </Field>
                    {format === "jpeg" ? (
                        <Field label={`JPG 质量 ${jpegQuality}%`}>
                            <Slider min={50} max={100} value={jpegQuality} onChange={setJpegQuality} />
                        </Field>
                    ) : (
                        <div className="flex h-[58px] items-center rounded-md border px-3 text-[11px] leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                            ZIP 固定包含 PNG 单页和 PNG 长图。
                        </div>
                    )}
                </div>
            </div>
            {busy ? (
                <div className="border-t py-3" style={{ borderColor: theme.node.stroke }}>
                    <Progress percent={progress} size="small" status="active" />
                </div>
            ) : null}
            <div className="grid gap-2 border-t pt-4 sm:grid-cols-3" style={{ borderColor: theme.node.stroke }}>
                <Button icon={<FileImage className="size-4" />} disabled={busy} onClick={() => void convertPages()}>
                    转为图片节点
                </Button>
                <Button icon={<Rows3 className="size-4" />} disabled={busy} onClick={() => void mergeLong()}>
                    合并成长图
                </Button>
                <Button type="primary" icon={<Archive className="size-4" />} disabled={busy} onClick={() => void downloadZip()}>
                    下载 PNG ZIP
                </Button>
            </div>
        </Modal>
    );
}

function DpiControl({ value, onChange, theme }: { value: number; onChange: (value: number) => void; theme: ReturnType<typeof useCanvasTheme> }) {
    const activePreset = DPI_OPTIONS.find((option) => option.value === value);
    const stepperButtonStyle = { color: theme.node.muted };

    return (
        <div className="rounded-md border p-3" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs font-semibold" style={{ color: theme.node.text }}>{activePreset?.label ?? "自定义"}</div>
                    <div className="mt-0.5 text-[10px]" style={{ color: theme.node.muted }}>72–600 DPI</div>
                </div>
                <div className="flex h-8 shrink-0 items-center overflow-hidden rounded-md border" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
                    <button
                        type="button"
                        className="grid h-full w-8 place-items-center transition-opacity hover:opacity-65 disabled:opacity-30"
                        style={stepperButtonStyle}
                        onClick={() => onChange(clampDpi(value - 12))}
                        disabled={value <= 72}
                        title="降低 12 DPI"
                        aria-label="降低 12 DPI"
                    >
                        <Minus className="size-3.5" />
                    </button>
                    <label className="flex h-full items-center border-x px-2" style={{ borderColor: theme.node.stroke }}>
                        <input
                            type="number"
                            min={72}
                            max={600}
                            step={12}
                            value={value}
                            onChange={(event) => onChange(clampDpi(Number(event.target.value) || 72))}
                            className="w-10 appearance-none bg-transparent text-right text-xs font-semibold tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            style={{ color: theme.node.text }}
                            aria-label="自定义 DPI"
                        />
                        <span className="ml-1 text-[9px] font-medium" style={{ color: theme.node.muted }}>DPI</span>
                    </label>
                    <button
                        type="button"
                        className="grid h-full w-8 place-items-center transition-opacity hover:opacity-65 disabled:opacity-30"
                        style={stepperButtonStyle}
                        onClick={() => onChange(clampDpi(value + 12))}
                        disabled={value >= 600}
                        title="提高 12 DPI"
                        aria-label="提高 12 DPI"
                    >
                        <Plus className="size-3.5" />
                    </button>
                </div>
            </div>

            <input
                type="range"
                min={72}
                max={600}
                step={12}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="mt-3 h-1.5 w-full cursor-pointer"
                style={{ accentColor: theme.node.activeStroke }}
                aria-label="清晰度"
            />

            <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                {DPI_OPTIONS.map((option) => {
                    const active = option.value === value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            className="min-w-0 rounded border px-1 py-1.5 text-center transition-opacity hover:opacity-70"
                            style={{
                                background: active ? theme.toolbar.activeBg : "transparent",
                                borderColor: active ? theme.node.activeStroke : "transparent",
                                color: active ? theme.toolbar.activeText : theme.node.muted,
                            }}
                            onClick={() => onChange(option.value)}
                            aria-pressed={active}
                        >
                            <span className="block text-[10px] font-medium">{option.label}</span>
                            <span className="mt-0.5 block text-[9px] tabular-nums opacity-70">{option.value}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="mb-2 block text-xs font-medium opacity-65">{label}</span>
            {children}
        </label>
    );
}
