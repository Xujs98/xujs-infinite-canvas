"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Modal, message, Segmented, Select, Spin } from "antd";
import { CloudOutlined, LogoutOutlined, QrcodeOutlined, ReloadOutlined, RocketOutlined } from "@ant-design/icons";
import {
    generateJimengImage,
    generateJimengVideo,
    getJimengStatus,
    logoutJimeng,
    pollJimengTask,
    startJimengLogin,
    type JimengImageRequest,
    type JimengVideoRequest,
} from "@/services/api/jimeng";

type Props = {
    open: boolean;
    onClose: () => void;
    mode: "image" | "video";
    prompt: string;
    referenceImages?: string[];
    onResult?: (urls: string[]) => void;
    onError?: (error: string) => void;
};

const IMAGE_MODELS = ["5.0", "4.6", "4.5", "4.1", "4.0", "3.1", "3.0"];
const VIDEO_MODELS = [
    { label: "Seedance 2.0 VIP", value: "seedance2.0_vip" },
    { label: "Seedance 2.0 Fast VIP", value: "seedance2.0fast_vip" },
    { label: "Seedance 2.0", value: "seedance2.0" },
    { label: "Seedance 2.0 Fast", value: "seedance2.0fast" },
    { label: "3.5 Pro", value: "3.5pro" },
    { label: "3.0 Pro", value: "3.0pro" },
    { label: "3.0", value: "3.0" },
    { label: "3.0 Fast", value: "3.0fast" },
];
const RESOLUTIONS = ["1k", "2k", "4k"];
const VIDEO_RESOLUTIONS = ["720p", "1080p"];

export function CanvasJimengModal({ open, onClose, mode, prompt, referenceImages, onResult, onError }: Props) {
    const [status, setStatus] = useState<{ installed: boolean; loggedIn: boolean } | null>(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState("");

    const [ratio, setRatio] = useState("1:1");
    const [resolution, setResolution] = useState("2k");
    const [videoResolution, setVideoResolution] = useState("720p");
    const [modelVersion, setModelVersion] = useState("5.0");
    const [videoModel, setVideoModel] = useState("seedance2.0");
    const [duration, setDuration] = useState("5");

    const checkStatus = useCallback(async () => {
        setLoading(true);
        try {
            const s = await getJimengStatus();
            setStatus(s);
        } catch {
            setStatus({ installed: false, loggedIn: false });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) void checkStatus();
    }, [open, checkStatus]);

    const handleLogin = async () => {
        try {
            await startJimengLogin();
            message.info("请在即梦 App 扫描二维码登录");
            for (let i = 0; i < 40; i++) {
                await new Promise((r) => setTimeout(r, 3000));
                try {
                    const s = await getJimengStatus();
                    if (s.loggedIn) {
                        setStatus(s);
                        message.success("即梦登录成功");
                        return;
                    }
                } catch {}
            }
            message.warning("登录超时，请重试");
        } catch {
            message.error("启动登录失败");
        }
    };

    const handleLogout = async () => {
        try {
            await logoutJimeng();
            await checkStatus();
            message.success("已登出");
        } catch {
            message.error("登出失败");
        }
    };

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            message.warning("请输入提示词");
            return;
        }
        setGenerating(true);
        setProgress("正在提交...");
        try {
            if (mode === "image") {
                const req: JimengImageRequest = { prompt, ratio, resolution, model_version: modelVersion };
                if (referenceImages?.length) req.image_url = referenceImages[0];
                const result = await generateJimengImage(req);
                setProgress("生成中...");
                const final = await pollJimengTask(result.task_id, (s) => setProgress(`生成中... ${s.status}`));
                if (final.urls?.length) {
                    onResult?.(final.urls);
                    message.success(`生成完成，共 ${final.urls.length} 张`);
                }
            } else {
                const req: JimengVideoRequest = {
                    prompt,
                    ratio: ratio === "1:1" ? "16:9" : ratio,
                    resolution: videoResolution,
                    model_version: videoModel,
                    duration,
                };
                if (referenceImages?.length) req.image_urls = referenceImages;
                const result = await generateJimengVideo(req);
                setProgress("生成中...");
                const final = await pollJimengTask(result.task_id, (s) => setProgress(`生成中... ${s.status}`));
                if (final.urls?.length) {
                    onResult?.(final.urls);
                    message.success("视频生成完成");
                }
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : "生成失败";
            onError?.(msg);
            message.error(msg);
        } finally {
            setGenerating(false);
            setProgress("");
        }
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <CloudOutlined className="text-purple-400" />
                    <span>即梦 AI</span>
                    {status?.installed === false && <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] text-red-400">未安装 CLI</span>}
                    {status?.installed && !status.loggedIn && <span className="rounded bg-yellow-900/50 px-1.5 py-0.5 text-[10px] text-yellow-400">未登录</span>}
                    {status?.loggedIn && <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-[10px] text-green-400">已连接</span>}
                </div>
            }
            open={open}
            onCancel={onClose}
            width={400}
            footer={null}
            destroyOnHidden
        >
            {loading && <Spin size="small" className="my-4 block" />}

            {!loading && status && !status.installed && (
                <div className="rounded-lg bg-neutral-100 p-3 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                    <p className="mb-2">需要安装 dreamina CLI：</p>
                    <code className="block rounded bg-neutral-200 p-2 text-[11px] text-purple-600 dark:bg-neutral-900 dark:text-purple-300">npm install -g dreamina-cli</code>
                </div>
            )}

            {!loading && status?.installed && !status.loggedIn && (
                <div className="flex flex-col items-center gap-3 py-6">
                    <QrcodeOutlined className="text-5xl text-neutral-400" />
                    <p className="text-sm text-neutral-500">使用即梦 App 扫码登录</p>
                    <Button type="primary" onClick={() => void handleLogin()}>开始登录</Button>
                </div>
            )}

            {!loading && status?.loggedIn && (
                <>
                    <div className="mb-3 flex items-center gap-2">
                        <Button size="small" icon={<ReloadOutlined />} onClick={() => void checkStatus()}>刷新</Button>
                        <Button size="small" danger icon={<LogoutOutlined />} onClick={() => void handleLogout()}>登出</Button>
                    </div>

                    {mode === "image" ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="w-14 text-xs text-neutral-500">模型</span>
                                <Select size="small" value={modelVersion} onChange={setModelVersion} className="flex-1" options={IMAGE_MODELS.map((v) => ({ label: `v${v}`, value: v }))} />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-14 text-xs text-neutral-500">比例</span>
                                <Segmented size="small" value={ratio} onChange={(v) => setRatio(v as string)} options={["1:1", "16:9", "9:16", "4:3"]} />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-14 text-xs text-neutral-500">分辨率</span>
                                <Segmented size="small" value={resolution} onChange={(v) => setResolution(v as string)} options={RESOLUTIONS} />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="w-14 text-xs text-neutral-500">模型</span>
                                <Select size="small" value={videoModel} onChange={setVideoModel} className="flex-1" options={VIDEO_MODELS} />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-14 text-xs text-neutral-500">比例</span>
                                <Segmented size="small" value={ratio} onChange={(v) => setRatio(v as string)} options={["16:9", "9:16", "1:1", "4:3"]} />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-14 text-xs text-neutral-500">分辨率</span>
                                <Segmented size="small" value={videoResolution} onChange={(v) => setVideoResolution(v as string)} options={VIDEO_RESOLUTIONS} />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-14 text-xs text-neutral-500">时长</span>
                                <Select size="small" value={duration} onChange={setDuration} className="w-24" options={["3", "5", "8", "10", "12", "15"].map((v) => ({ label: `${v}秒`, value: v }))} />
                            </div>
                        </div>
                    )}

                    <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-700">
                        <Button type="primary" block size="large" icon={<RocketOutlined />} loading={generating} onClick={() => void handleGenerate()} disabled={!prompt.trim()}>
                            {generating ? progress || "生成中..." : `用即梦生成${mode === "image" ? "图片" : "视频"}`}
                        </Button>
                    </div>
                </>
            )}
        </Modal>
    );
}
