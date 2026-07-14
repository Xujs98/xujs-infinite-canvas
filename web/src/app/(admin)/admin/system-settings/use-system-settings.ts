import { useEffect, useState } from "react";

import { fetchAdminSystemSettings, saveAdminSystemSettings, type AdminSystemSettings } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const defaultSettings: AdminSystemSettings = {
    siteName: "",
    siteSubtitle: "",
    siteLogo: "",
    serviceContact: "",
    registerGiftCredits: 0,
    inviteRewardCredits: 50,
    checkInEnabled: true,
    checkInRewardMin: 5,
    checkInRewardMax: 20,
    videoMaxTimeoutSeconds: 600,
    appErrorMessagePrefix: "",
    appErrorShowDetails: true,
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
            setSettings(data);
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
