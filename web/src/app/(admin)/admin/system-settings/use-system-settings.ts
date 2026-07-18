import { useEffect, useState } from "react";

import { DEFAULT_SITE_LOGO, DEFAULT_SITE_NAME } from "@/constant/brand";
import { fetchAdminSystemSettings, saveAdminSystemSettings, type AdminSystemSettings } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const defaultSettings: AdminSystemSettings = {
    siteName: DEFAULT_SITE_NAME,
    siteSubtitle: "",
    siteLogo: DEFAULT_SITE_LOGO,
    serviceContact: "",
    registerGiftCredits: 0,
    inviteRewardCredits: 50,
    checkInEnabled: true,
    checkInRewardMin: 5,
    checkInRewardMax: 20,
    videoMaxTimeoutSeconds: 600,
    appErrorMessagePrefix: "",
    appErrorShowDetails: false,
    appErrorMessages: {
        default: "操作失败，请稍后重试或联系管理员",
        generation: "生成失败，请联系管理员",
        network: "网络连接失败，请检查网络后重试",
        timeout: "请求超时，请稍后重试",
        authentication: "登录状态已失效，请重新登录",
        permission: "当前账号没有执行此操作的权限",
        credits: "算力点不足，请充值或购买订阅套餐",
        validation: "提交内容不符合要求，请检查后重试",
        upload: "素材上传失败，请稍后重试",
        download: "结果下载失败，请稍后重试",
        service: "服务暂时不可用，请稍后重试",
    },
    requestLogCleanupEnabled: true,
    requestLogRetentionDays: 30,
    requestLogMaxRows: 5000,
    callLogCleanupEnabled: false,
    callLogRetentionDays: 30,
    callLogMaxRows: 5000,
    creditLogCleanupEnabled: false,
    creditLogRetentionDays: 365,
    creditLogMaxRows: 100000,
    userCreditLogVisibleRows: 0,
    allowCustomChannel: true,
    allowRegister: true,
    assistantEnabled: true,
    emailEnabled: false,
    smtpHost: "",
    smtpPort: 587,
    smtpUsername: "",
    smtpPassword: "",
    smtpFrom: "",
    smtpTLS: true,
    membershipReminder: false,
    emailTemplateWelcome: "",
    emailTemplateReminder: "",
};

export function useSystemSettings() {
    const token = useUserStore((state) => state.token);
    const [settings, setSettings] = useState<AdminSystemSettings>(defaultSettings);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const data = await fetchAdminSystemSettings(token);
            setSettings({ ...defaultSettings, ...data });
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchSettings();
    }, [token]);

    const saveSettings = async (values: AdminSystemSettings) => {
        setSaving(true);
        try {
            await saveAdminSystemSettings(token, values);
            setSettings(values);
        } finally {
            setSaving(false);
        }
    };

    return { settings, loading, saving, saveSettings, refresh: fetchSettings };
}
