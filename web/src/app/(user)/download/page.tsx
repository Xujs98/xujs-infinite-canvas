"use client";

import { AppleFilled } from "@ant-design/icons";
import { ArrowDown, Check, CircuitBoard, Download, Image as ImageIcon, Monitor, Sparkles, Video, Workflow } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import { type AppRelease, type AppReleaseArch, type AppReleaseArtifact, type AppReleasePlatform, fetchLatestAppRelease, fetchRecentAppReleases } from "@/services/api/app-releases";
import { cn } from "@/lib/utils";

import styles from "./download.module.css";

const platformLabels: Record<AppReleasePlatform, string> = { windows: "Windows", macos: "macOS" };
const archLabels: Record<AppReleaseArch, string> = { x64: "Intel / AMD 64 位", arm64: "ARM64 / Apple 芯片", universal: "通用版" };

function detectPlatform(): AppReleasePlatform | null {
    const browser = navigator as Navigator & { userAgentData?: { platform?: string } };
    const value = `${browser.userAgentData?.platform || ""} ${navigator.platform || ""} ${navigator.userAgent || ""}`.toLowerCase();
    if (value.includes("mac")) return "macos";
    if (value.includes("win")) return "windows";
    return null;
}

function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function selectArtifact(release: AppRelease | null, platform: AppReleasePlatform, arch: AppReleaseArch) {
    const exact = release?.artifacts.find((item) => item.platform === platform && item.arch === arch);
    if (exact) return exact;
    if (platform === "macos") return release?.artifacts.find((item) => item.platform === "macos" && item.arch === "universal") || null;
    return null;
}

export default function ClientDownloadPage() {
    const [release, setRelease] = useState<AppRelease | null>(null);
    const [releaseHistory, setReleaseHistory] = useState<AppRelease[]>([]);
    const [loading, setLoading] = useState(true);
    const [platform, setPlatform] = useState<AppReleasePlatform>("windows");
    const [arch, setArch] = useState<AppReleaseArch>("x64");
    const [detectedPlatform, setDetectedPlatform] = useState<AppReleasePlatform | null>(null);
    const [detectionComplete, setDetectionComplete] = useState(false);

    useEffect(() => {
        const current = detectPlatform();
        if (current) {
            setPlatform(current);
            setArch(current === "macos" ? "arm64" : "x64");
        }
        setDetectedPlatform(current);
        setDetectionComplete(true);
        fetchLatestAppRelease()
            .then(setRelease)
            .catch(() => setRelease(null))
            .finally(() => setLoading(false));
        fetchRecentAppReleases({ page: 1, pageSize: 100 })
            .then((result) => setReleaseHistory(result.items || []))
            .catch(() => setReleaseHistory([]));
    }, []);

    const artifact = useMemo(() => selectArtifact(release, platform, arch), [arch, platform, release]);
    const platformArtifacts = useMemo(() => release?.artifacts.filter((item) => item.platform === platform) || [], [platform, release]);
    const notes = useMemo(() => release?.notes.split(/\r?\n/).map((item) => item.replace(/^[-*]\s*/, "").trim()).filter(Boolean) || [], [release?.notes]);

    const choosePlatform = (nextPlatform: AppReleasePlatform) => {
        setPlatform(nextPlatform);
        setArch(nextPlatform === "macos" ? "arm64" : "x64");
    };

    return (
        <main className="hide-scrollbar h-full overflow-y-auto bg-stone-50 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
            <section className="relative flex min-h-[680px] h-[calc(100dvh-4rem)] max-h-[820px] items-center overflow-hidden border-b border-stone-200 dark:border-stone-800 max-md:min-h-[720px]">
                <div className={styles.scene} aria-hidden="true">
                    <div className={cn(styles.node, styles.nodeOne)}>
                        <div className={styles.nodeHeader}><span className={styles.nodeIcon} data-tone="image"><ImageIcon /></span><span><strong>图像生成</strong><small>角色视觉参考</small></span><i>完成</i></div>
                        <div className={cn(styles.nodeBody, styles.imageFrames)}><span /><span /><span /></div>
                        <span className={cn(styles.port, styles.portRight)} />
                    </div>
                    <div className={cn(styles.node, styles.nodeTwo)}>
                        <div className={styles.nodeHeader}><span className={styles.nodeIcon} data-tone="text"><Sparkles /></span><span><strong>AI 文本</strong><small>镜头提示词</small></span><i>分析中</i></div>
                        <div className={cn(styles.nodeBody, styles.textLines)}><span /><span /><span /></div>
                        <span className={cn(styles.port, styles.portLeft)} />
                    </div>
                    <div className={cn(styles.node, styles.nodeThree)}>
                        <div className={styles.nodeHeader}><span className={styles.nodeIcon} data-tone="video"><Video /></span><span><strong>视频生成</strong><small>镜头动态输出</small></span><i>生成中</i></div>
                        <div className={cn(styles.nodeBody, styles.videoFrames)}><span /><span /><span /><b /></div>
                        <span className={cn(styles.port, styles.portLeft)} />
                    </div>
                    <div className={cn(styles.node, styles.nodeFour)}>
                        <div className={styles.nodeHeader}><span className={styles.nodeIcon} data-tone="canvas"><Workflow /></span><span><strong>无限画布</strong><small>节点自由连接</small></span><i>4 节点</i></div>
                        <div className={cn(styles.nodeBody, styles.canvasMap)}><span /><span /><span /><span /><b /><b /></div>
                        <span className={cn(styles.port, styles.portRight)} />
                    </div>
                    <span className={cn(styles.connector, styles.lineOne)} style={{ "--flow-distance": "360px" } as CSSProperties} />
                    <span className={cn(styles.connector, styles.lineTwo)} style={{ "--flow-distance": "310px" } as CSSProperties} />
                    <span className={cn(styles.connector, styles.lineThree)} style={{ "--flow-distance": "290px" } as CSSProperties} />
                    <span className={cn(styles.connector, styles.lineFour)} style={{ "--flow-distance": "390px" } as CSSProperties} />
                </div>

                <div className="relative z-10 mx-auto w-full max-w-3xl px-6 py-20 text-center md:py-24">
                    <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-lg border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900"><CircuitBoard className="size-6 text-emerald-700 dark:text-emerald-400" /></div>
                    <h1 className="text-4xl font-semibold leading-tight md:text-5xl">矩龙画布客户端</h1>
                    <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-stone-600 dark:text-stone-300">在本地桌面继续创作，保留完整的无限画布、分镜工作流与多媒体生成体验。</p>

                    <div className="mt-8 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="选择操作系统">
                        <button type="button" onClick={() => choosePlatform("windows")} className={cn("inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium transition", platform === "windows" ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-300 bg-white/80 hover:border-stone-500 dark:border-stone-700 dark:bg-stone-900/80")}><Monitor className="size-4" />Windows</button>
                        <button type="button" onClick={() => choosePlatform("macos")} className={cn("inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium transition", platform === "macos" ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-300 bg-white/80 hover:border-stone-500 dark:border-stone-700 dark:bg-stone-900/80")}><AppleFilled className="text-base" />macOS</button>
                    </div>

                    <div className="mx-auto mt-3 flex max-w-md items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                        {detectionComplete ? detectedPlatform ? <><Check className="size-4 text-emerald-600" />已识别当前设备为 {platformLabels[detectedPlatform]}</> : "未能自动识别系统，请手动选择" : "正在识别当前设备"}
                    </div>

                    <div className="mt-7">
                        {loading ? <button type="button" disabled className="inline-flex min-h-12 min-w-60 items-center justify-center rounded-md bg-stone-300 px-6 font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-400">正在获取最新版本</button> : artifact ? (
                            <a href={artifact.downloadUrl} className="inline-flex min-h-12 min-w-60 items-center justify-center gap-2 rounded-md bg-emerald-700 px-6 font-medium text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"><Download className="size-5" />下载 {platformLabels[platform]} 版</a>
                        ) : <button type="button" disabled className="inline-flex min-h-12 min-w-60 items-center justify-center rounded-md bg-stone-200 px-6 font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">客户端版本准备中</button>}
                        <p className="mt-3 text-xs text-stone-500">{release ? `v${release.version}${artifact ? ` · ${archLabels[artifact.arch]} · ${formatBytes(artifact.fileSize)}` : ""}` : "管理员发布版本后即可下载"}</p>
                    </div>
                    <ArrowDown className="mx-auto mt-10 size-5 animate-bounce text-stone-400 motion-reduce:animate-none" aria-hidden="true" />
                </div>
            </section>

            <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
                <div className="grid gap-12 lg:grid-cols-[1fr_0.8fr]">
                    <div>
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">选择安装包</p>
                        <h2 className="mt-2 text-2xl font-semibold">按系统和芯片下载</h2>
                        <p className="mt-3 max-w-xl text-sm leading-6 text-stone-600 dark:text-stone-400">已自动选择常用架构。macOS 用户可在“关于本机”中查看芯片类型，Apple M 系列选择 Apple 芯片，旧款 Intel Mac 选择 Intel。</p>

                        <div className="mt-7 grid gap-3 sm:grid-cols-2">
                            {(["windows", "macos"] as AppReleasePlatform[]).map((itemPlatform) => {
                                const available = release?.artifacts.filter((item) => item.platform === itemPlatform) || [];
                                return (
                                    <button key={itemPlatform} type="button" onClick={() => choosePlatform(itemPlatform)} className={cn("min-h-32 rounded-md border p-5 text-left transition", platform === itemPlatform ? "border-emerald-700 bg-white shadow-sm dark:bg-stone-900" : "border-stone-200 bg-transparent hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600")}>
                                        {itemPlatform === "windows" ? <Monitor className="size-6" /> : <AppleFilled className="text-2xl" />}
                                        <strong className="mt-4 block text-base">{platformLabels[itemPlatform]}</strong>
                                        <span className="mt-1 block text-xs text-stone-500">{available.length ? `${available.length} 个安装包可用` : "暂未发布"}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-6 flex flex-wrap gap-2">
                            {platformArtifacts.map((item) => (
                                <button key={item.id} type="button" onClick={() => setArch(item.arch)} className={cn("min-h-10 rounded-md border px-4 text-sm transition", artifact?.id === item.id ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-300 hover:border-stone-500 dark:border-stone-700")}>{archLabels[item.arch]}</button>
                            ))}
                        </div>

                        {artifact ? <a href={artifact.downloadUrl} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-5 text-sm font-medium text-white transition hover:bg-emerald-800"><Download className="size-4" />下载 {artifact.fileName}</a> : null}
                    </div>

                    <div className="border-l-0 border-stone-200 lg:border-l lg:pl-12 dark:border-stone-800">
                        <p className="text-sm font-medium text-stone-500">最新版本</p>
                        <h2 className="mt-2 text-2xl font-semibold">{release ? `v${release.version}` : "等待发布"}</h2>
                        <p className="mt-2 text-sm text-stone-500">{release?.title || "首个客户端版本发布后将在此展示"}</p>
                        <div className="mt-7 space-y-3">
                            {notes.length ? notes.map((note, index) => <div key={`${index}-${note}`} className="flex gap-3 text-sm leading-6 text-stone-700 dark:text-stone-300"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-600" /><span>{note}</span></div>) : <p className="text-sm text-stone-500">暂无更新说明</p>}
                        </div>
                    </div>
                </div>
            </section>

            <section className="border-t border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
                <div className="mx-auto max-w-6xl px-6 py-14 md:py-16">
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">发布记录</p>
                    <h2 className="mt-2 text-2xl font-semibold">更新历史</h2>
                    <p className="mt-2 text-sm text-stone-500">查看矩龙画布桌面客户端已经发布的版本和更新内容。</p>
                    <div className="mt-7 divide-y divide-stone-200 overflow-hidden rounded-md border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
                        {releaseHistory.length ? releaseHistory.map((item) => {
                            const itemNotes = item.notes.split(/\r?\n/).map((note) => note.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
                            return (
                                <article key={item.id} className="grid gap-3 px-5 py-5 md:grid-cols-[150px_1fr] md:px-6">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <strong className="text-base">v{item.version}</strong>
                                            {item.forceUpdate ? <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">强制更新</span> : null}
                                        </div>
                                        <time className="mt-1 block text-xs text-stone-500">{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("zh-CN") : ""}</time>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium">{item.title}</h3>
                                        {itemNotes.length ? <ul className="mt-2 space-y-1 text-sm leading-6 text-stone-600 dark:text-stone-400">{itemNotes.map((note, index) => <li key={`${index}-${note}`}>- {note}</li>)}</ul> : <p className="mt-2 text-sm text-stone-500">暂无更新说明</p>}
                                    </div>
                                </article>
                            );
                        }) : <p className="px-6 py-10 text-center text-sm text-stone-500">暂无更新历史</p>}
                    </div>
                </div>
            </section>
        </main>
    );
}
