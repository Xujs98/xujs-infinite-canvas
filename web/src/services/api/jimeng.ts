const BASE = "/api/jimeng";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(data.msg || "请求失败");
    return data.data;
}

export type JimengStatus = { installed: boolean; loggedIn: boolean };

export async function getJimengStatus(): Promise<JimengStatus> {
    return request<JimengStatus>("/status");
}

export async function getJimengCredit(): Promise<{ raw: string }> {
    return request("/credit");
}

export async function startJimengLogin(): Promise<{ started: boolean }> {
    return request("/login/start", { method: "POST" });
}

export async function getJimengLoginStatus(): Promise<{ loggedIn: boolean; pending: boolean }> {
    return request("/login/status");
}

export async function logoutJimeng(): Promise<{ logged_out: boolean }> {
    return request("/logout", { method: "POST" });
}

export type JimengImageRequest = {
    prompt: string;
    image_url?: string;
    ratio?: string;
    resolution?: string;
    model_version?: string;
};

export type JimengVideoRequest = {
    prompt: string;
    image_urls?: string[];
    video_urls?: string[];
    audio_urls?: string[];
    duration?: string;
    ratio?: string;
    resolution?: string;
    model_version?: string;
};

export type JimengTaskResult = { task_id: string; status: string };

export async function generateJimengImage(req: JimengImageRequest): Promise<JimengTaskResult> {
    return request("/generate/image", { method: "POST", body: JSON.stringify(req) });
}

export async function generateJimengVideo(req: JimengVideoRequest): Promise<JimengTaskResult> {
    return request("/generate/video", { method: "POST", body: JSON.stringify(req) });
}

export type JimengTaskStatus = {
    task_id: string;
    status: string;
    kind: string;
    urls?: string[];
    error?: string;
};

export async function getJimengTaskStatus(taskId: string): Promise<JimengTaskStatus> {
    return request(`/task/${taskId}`);
}

export async function queryJimengMedia(submitId: string): Promise<{ urls: string[]; raw: string }> {
    return request("/query-media", { method: "POST", body: JSON.stringify({ submit_id: submitId }) });
}

/** Poll a Jimeng task until completion or failure */
export async function pollJimengTask(
    taskId: string,
    onProgress?: (status: JimengTaskStatus) => void,
    maxAttempts = 180,
    delayMs = 3000,
): Promise<JimengTaskStatus> {
    for (let i = 0; i < maxAttempts; i++) {
        const status = await getJimengTaskStatus(taskId);
        onProgress?.(status);
        if (status.status === "completed") return status;
        if (status.status === "failed") throw new Error(status.error || "生成失败");
        await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error("即梦生成超时，请稍后重试");
}
