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
    appErrorShowDetails: true,
    requestLogCleanupEnabled: true,
    requestLogRetentionDays: 30,
    requestLogMaxRows: 5000,
    callLogCleanupEnabled: false,
    callLogRetentionDays: 30,
    callLogMaxRows: 5000,
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
