import type { PDFPageProxy } from "pdfjs-dist";

export type PdfImageFormat = "png" | "jpeg";

export type PdfRenderOptions = {
    dpi: number;
    format: PdfImageFormat;
    jpegQuality?: number;
    onProgress?: (completed: number, total: number) => void;
};

export type RenderedPdfPage = {
    pageNumber: number;
    blob: Blob;
    width: number;
    height: number;
};

const MAX_PAGE_EDGE = 12_000;
const MAX_LONG_IMAGE_EDGE = 32_000;
const MAX_LONG_IMAGE_PIXELS = 40_000_000;
let pdfModulePromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

async function loadPdfModule() {
    if (!pdfModulePromise) {
        pdfModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
            if (!pdfjs.GlobalWorkerOptions.workerSrc) {
                pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
            }
            return pdfjs;
        });
    }
    return pdfModulePromise;
}

async function sourceToBytes(source: string | Blob | ArrayBuffer | Uint8Array) {
    if (source instanceof Uint8Array) return source.slice();
    if (source instanceof ArrayBuffer) return new Uint8Array(source.slice(0));
    if (source instanceof Blob) return new Uint8Array(await source.arrayBuffer());
    const response = await fetch(source);
    if (!response.ok) throw new Error(`PDF 文件读取失败（HTTP ${response.status}）`);
    return new Uint8Array(await response.arrayBuffer());
}

function canvasToBlob(canvas: HTMLCanvasElement, format: PdfImageFormat, quality = 0.92) {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PDF 页面图片编码失败"))), format === "jpeg" ? "image/jpeg" : "image/png", format === "jpeg" ? quality : undefined);
    });
}

async function renderPage(page: PDFPageProxy, pageNumber: number, options: PdfRenderOptions): Promise<RenderedPdfPage> {
    const dpi = Math.min(600, Math.max(72, Math.round(options.dpi || 144)));
    const scale = dpi / 72;
    const naturalViewport = page.getViewport({ scale });
    const edgeScale = Math.min(1, MAX_PAGE_EDGE / Math.max(naturalViewport.width, naturalViewport.height));
    const viewport = page.getViewport({ scale: scale * edgeScale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("当前设备无法创建 PDF 渲染画布");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport }).promise;
    const blob = await canvasToBlob(canvas, options.format, options.jpegQuality);
    const result = { pageNumber, blob, width: canvas.width, height: canvas.height };
    canvas.width = 1;
    canvas.height = 1;
    return result;
}

export function allPdfPages(pageCount: number) {
    return Array.from({ length: Math.max(0, pageCount) }, (_, index) => index + 1);
}

export function parsePdfPageSelection(input: string, pageCount: number) {
    const normalized = input.trim().replace(/[，、]/g, ",");
    if (!normalized) throw new Error("请输入页码，例如 1,3-5");
    const selected = new Set<number>();
    for (const rawPart of normalized.split(",")) {
        const part = rawPart.trim();
        if (!part) continue;
        const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
        if (range) {
            const start = Number(range[1]);
            const end = Number(range[2]);
            if (start < 1 || end < start || end > pageCount) throw new Error(`页码范围 ${part} 无效，可选范围为 1-${pageCount}`);
            for (let page = start; page <= end; page += 1) selected.add(page);
            continue;
        }
        if (!/^\d+$/.test(part)) throw new Error(`无法识别页码“${part}”`);
        const page = Number(part);
        if (page < 1 || page > pageCount) throw new Error(`第 ${page} 页不存在，可选范围为 1-${pageCount}`);
        selected.add(page);
    }
    if (!selected.size) throw new Error("至少选择一页");
    return Array.from(selected).sort((a, b) => a - b);
}

export async function renderPdfPages(source: string | Blob | ArrayBuffer | Uint8Array, pages: number[], options: PdfRenderOptions) {
    if (!pages.length) throw new Error("至少选择一页");
    const pdfjs = await loadPdfModule();
    const loadingTask = pdfjs.getDocument({ data: await sourceToBytes(source) });
    const document = await loadingTask.promise;
    try {
        const rendered: RenderedPdfPage[] = [];
        for (let index = 0; index < pages.length; index += 1) {
            const pageNumber = pages[index];
            if (pageNumber < 1 || pageNumber > document.numPages) throw new Error(`第 ${pageNumber} 页不存在`);
            const page = await document.getPage(pageNumber);
            rendered.push(await renderPage(page, pageNumber, options));
            page.cleanup();
            options.onProgress?.(index + 1, pages.length);
        }
        return rendered;
    } finally {
        await loadingTask.destroy();
    }
}

export async function inspectPdf(source: string | Blob | ArrayBuffer | Uint8Array) {
    const pdfjs = await loadPdfModule();
    const loadingTask = pdfjs.getDocument({ data: await sourceToBytes(source) });
    const document = await loadingTask.promise;
    try {
        const page = await document.getPage(1);
        const preview = await renderPage(page, 1, { dpi: 96, format: "png" });
        page.cleanup();
        return { pageCount: document.numPages, preview };
    } finally {
        await loadingTask.destroy();
    }
}

export async function mergePdfPagesToLongPng(pages: RenderedPdfPage[]): Promise<RenderedPdfPage> {
    if (!pages.length) throw new Error("没有可合并的 PDF 页面");
    const sourceWidth = Math.max(...pages.map((page) => page.width));
    const sourceHeight = pages.reduce((sum, page) => sum + Math.round(page.height * (sourceWidth / page.width)), 0);
    const edgeScale = Math.min(1, MAX_LONG_IMAGE_EDGE / sourceWidth, MAX_LONG_IMAGE_EDGE / sourceHeight);
    const pixelScale = Math.min(1, Math.sqrt(MAX_LONG_IMAGE_PIXELS / (sourceWidth * sourceHeight)));
    const outputScale = Math.min(edgeScale, pixelScale);
    const width = Math.max(1, Math.round(sourceWidth * outputScale));
    const height = Math.max(1, Math.round(sourceHeight * outputScale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("当前设备无法创建长图画布");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    let y = 0;
    for (const page of pages) {
        const bitmap = await createImageBitmap(page.blob);
        const drawHeight = Math.max(1, Math.round(page.height * (width / page.width)));
        context.drawImage(bitmap, 0, y, width, drawHeight);
        bitmap.close();
        y += drawHeight;
    }
    const blob = await canvasToBlob(canvas, "png");
    const result = { pageNumber: 0, blob, width, height };
    canvas.width = 1;
    canvas.height = 1;
    return result;
}

export function formatPdfFileStem(fileName: string) {
    const stem = fileName.replace(/\.pdf$/i, "").trim() || "document";
    return stem.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/\s+/g, "-");
}

export function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("文件编码失败"));
        reader.readAsDataURL(blob);
    });
}
