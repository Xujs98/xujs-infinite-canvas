"use client";

import { LockOutlined, MailOutlined, SafetyCertificateOutlined, UserOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, Segmented, Space } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { fetchCurrentUser, sendLoginEmailCode, sendRegistrationEmailCode } from "@/services/api/auth";
import { DEFAULT_SITE_LOGO, DEFAULT_SITE_NAME } from "@/constant/brand";
import { useConfigStore, type PublicSystemSettings } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type LoginFormValues = {
    username: string;
    password?: string;
    confirmPassword?: string;
    inviteCode?: string;
    email?: string;
    verificationCode?: string;
};

// 仅放行站内相对路径，拦截开放重定向。浏览器会忽略 URL 中的 Tab/换行/回车，并把
// //host 或 /\host 解析为协议相对的跨站地址，因此先剥离控制字符，再拒绝 // 与 /\ 前缀。
function safeRedirect(value: string | null): string {
    const cleaned = (value ?? "").replace(/[\t\n\r]/g, "");
    if (!cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.startsWith("/\\")) {
        return "/";
    }
    return cleaned;
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginContent />
        </Suspense>
    );
}

function LoginContent() {
    const { message } = App.useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const login = useUserStore((state) => state.login);
    const loginWithEmailCode = useUserStore((state) => state.loginWithEmailCode);
    const register = useUserStore((state) => state.register);
    const setSession = useUserStore((state) => state.setSession);
    const isLoading = useUserStore((state) => state.isLoading);
    const linuxDoEnabled = useConfigStore((state) => state.publicSettings?.auth?.linuxDo?.enabled === true);
    const allowRegister = useConfigStore((state) => state.publicSettings?.auth?.allowRegister !== false);
    const publicSystemSettings = useConfigStore((state) => state.publicSystemSettings);
    const siteName = publicSystemSettings?.siteName || DEFAULT_SITE_NAME;
    const siteLogo = publicSystemSettings?.siteLogo || DEFAULT_SITE_LOGO;
    const emailVerificationRequired = publicSystemSettings?.emailVerificationRequired === true;
    const [mode, setMode] = useState<"login" | "register">("login");
    const [loginMethod, setLoginMethod] = useState<"password" | "email">("password");
    const [form] = Form.useForm<LoginFormValues>();
    const [codeSending, setCodeSending] = useState(false);
    const [codeCountdown, setCodeCountdown] = useState(0);
    const redirect = safeRedirect(searchParams.get("redirect"));
    const inviteCodeFromUrl = searchParams.get("inviteCode") || "";
    const emailCodeLogin = mode === "login" && loginMethod === "email";
    const showEmailCode = emailVerificationRequired && (mode === "register" || emailCodeLogin);

    useEffect(() => {
        const token = searchParams.get("token");
        const error = searchParams.get("error");
        if (error) message.error(error);
        if (!token) return;
        void fetchCurrentUser(token).then((user) => {
            setSession(token, user);
            message.success("登录成功");
            router.replace(redirect);
            router.refresh();
        });
    }, [message, redirect, router, searchParams, setSession]);

    useEffect(() => {
        if (!allowRegister && mode === "register") setMode("login");
    }, [allowRegister, mode]);

    useEffect(() => {
        if (codeCountdown <= 0) return;
        const timer = window.setInterval(() => setCodeCountdown((value) => Math.max(0, value - 1)), 1000);
        return () => window.clearInterval(timer);
    }, [codeCountdown]);

    const sendEmailCode = async () => {
        try {
            const values = await form.validateFields(["email"]);
            setCodeSending(true);
            if (emailCodeLogin) await sendLoginEmailCode(values.email || "");
            else await sendRegistrationEmailCode(values.email || "");
            setCodeCountdown(60);
            message.success("验证码已发送，请检查邮箱");
        } catch (error) {
            if (error instanceof Error) message.error(error.message);
        } finally {
            setCodeSending(false);
        }
    };

    const submit = async (values: LoginFormValues) => {
        try {
            if (mode === "register" && !allowRegister) {
                message.error("当前未开放注册");
                return;
            }
            if (mode === "register" && !emailVerificationRequired && values.password !== values.confirmPassword) {
                message.error("两次输入的密码不一致");
                return;
            }
            if (emailCodeLogin) {
                const user = await loginWithEmailCode(values.email || "", values.verificationCode || "");
                message.success("登录成功");
                router.replace(redirect);
                router.refresh();
                if (user.role !== "admin") router.replace("/");
                return;
            }
            const action = mode === "register" ? register : login;
            const affCode = mode === "register" ? values.inviteCode || inviteCodeFromUrl : undefined;
            const user = await action({
                username: values.username,
                password: values.password || "",
                affCode,
                email: mode === "register" ? values.email : undefined,
                verificationCode: mode === "register" ? values.verificationCode : undefined,
            });
            message.success(mode === "register" ? "注册成功" : "登录成功");
            router.replace(redirect);
            router.refresh();
            if (user.role !== "admin") router.replace("/");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        }
    };

    return (
        <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-10 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]">
            <section className="w-full max-w-[420px]">
                <div className="mb-7 text-center">
                    <img src={siteLogo} alt={siteName} className="mx-auto mb-4 block size-12 object-contain" />
                    <h1 className="text-3xl font-semibold tracking-normal text-stone-950 dark:text-stone-100">账号登录</h1>
                    <p className="mt-3 text-base leading-7 text-stone-500 dark:text-stone-400">支持账号密码和 Linux.do 登录。</p>
                </div>

                <Form<LoginFormValues> form={form} layout="vertical" size="large" requiredMark={false} onFinish={submit}>
                    <Form.Item>
                        <Segmented
                            block
                            value={mode}
                            onChange={(value) => {
                                setMode(value as "login" | "register");
                                setCodeCountdown(0);
                            }}
                            options={
                                allowRegister
                                    ? [
                                          { label: "登录", value: "login" },
                                          { label: "注册", value: "register" },
                                      ]
                                    : [{ label: "登录", value: "login" }]
                            }
                        />
                    </Form.Item>
                    {mode === "login" && emailVerificationRequired ? (
                        <Form.Item>
                            <Segmented
                                block
                                value={loginMethod}
                                onChange={(value) => {
                                    setLoginMethod(value as "password" | "email");
                                    setCodeCountdown(0);
                                }}
                                options={[{ label: "密码登录", value: "password" }, { label: "邮箱验证码登录", value: "email" }]}
                            />
                        </Form.Item>
                    ) : null}
                    {!emailCodeLogin ? (
                        <Form.Item
                            name="username"
                            label={<span className="font-medium text-stone-800 dark:text-stone-200">{mode === "login" ? "用户名或邮箱" : "用户名"}</span>}
                            rules={[{ required: true, message: mode === "login" ? "请输入用户名或邮箱" : "请输入用户名" }]}
                        >
                            <Input prefix={<UserOutlined />} placeholder={mode === "login" ? "请输入用户名或邮箱" : "请输入用户名"} autoComplete="username" />
                        </Form.Item>
                    ) : null}
                    {!emailCodeLogin ? (
                        <Form.Item name="password" label={<span className="font-medium text-stone-800 dark:text-stone-200">密码</span>} rules={[{ required: true, message: "请输入密码" }]}>
                            <Input.Password prefix={<LockOutlined />} autoComplete={mode === "login" ? "current-password" : "new-password"} />
                        </Form.Item>
                    ) : null}
                    {mode === "register" ? (
                        <>
                            {!emailVerificationRequired ? (
                                <Form.Item name="confirmPassword" label={<span className="font-medium text-stone-800 dark:text-stone-200">确认密码</span>} rules={[{ required: true, message: "请再次输入密码" }]}>
                                    <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
                                </Form.Item>
                            ) : null}
                        </>
                    ) : null}
                    {showEmailCode ? (
                        <>
                            <Form.Item name="email" label={<span className="font-medium text-stone-800 dark:text-stone-200">邮箱</span>} rules={[{ required: true, message: "请输入邮箱" }, { type: "email", message: "请输入有效的邮箱地址" }]}>
                                <Input prefix={<MailOutlined />} autoComplete="email" />
                            </Form.Item>
                            <Form.Item name="verificationCode" label={<span className="font-medium text-stone-800 dark:text-stone-200">邮箱验证码</span>} rules={[{ required: true, message: "请输入邮箱验证码" }, { len: 6, message: "请输入 6 位验证码" }]}>
                                <Input
                                    prefix={<SafetyCertificateOutlined />}
                                    inputMode="numeric"
                                    maxLength={6}
                                    suffix={
                                        <Button type="link" size="small" loading={codeSending} disabled={codeCountdown > 0} onClick={() => void sendEmailCode()}>
                                            {codeCountdown > 0 ? `${codeCountdown} 秒` : "发送验证码"}
                                        </Button>
                                    }
                                />
                            </Form.Item>
                        </>
                    ) : null}
                    {mode === "register" ? (
                        <Form.Item name="inviteCode" label={<span className="font-medium text-stone-800 dark:text-stone-200">邀请码</span>} initialValue={inviteCodeFromUrl}>
                            <Input placeholder="选填，有邀请码请填写" disabled={!!inviteCodeFromUrl} />
                        </Form.Item>
                    ) : null}
                    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                        <Button block type="primary" htmlType="submit" loading={isLoading}>
                            {mode === "register" ? "注册" : "登录"}
                        </Button>
                        {linuxDoEnabled ? (
                            <Button block href={`/api/auth/linux-do/authorize?redirect=${encodeURIComponent(redirect)}`} icon={<img src="/icons/linuxdo.svg" alt="" width={18} height={18} />}>
                                使用 Linux.do 登录
                            </Button>
                        ) : null}
                    </Space>
                </Form>
            </section>
        </main>
    );
}
