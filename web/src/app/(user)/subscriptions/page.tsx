"use client";

import { CheckCircleFilled, ClockCircleOutlined, CrownOutlined, ReloadOutlined, SafetyOutlined, WalletOutlined } from "@ant-design/icons";
import { App, Button, Empty, Modal, Spin, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { fetchAllRoles, type AdminRole } from "@/services/api/role";
import { fetchCurrentUser } from "@/services/api/auth";
import { fetchSubscriptionPlans, fetchUserSubscriptions, purchaseSubscription, type SubscriptionPlan, type UserSubscription } from "@/services/api/subscription";
import { useUserStore } from "@/stores/use-user-store";

const durationLabels = { year: "年", month: "个月", day: "天", hour: "小时", custom: "秒" } as const;
const resetCycleLabels = { none: "不重置", daily: "每天", weekly: "每周", monthly: "每月", custom: "自定义周期" } as const;

function formatPlanDuration(plan: SubscriptionPlan) {
    return plan.durationUnit === "custom" ? `${plan.durationCustomSeconds} 秒` : `${plan.durationValue} ${durationLabels[plan.durationUnit]}`;
}

function formatResetRule(plan: SubscriptionPlan) {
    if (plan.resetCycle === "none") return `套餐额度 ${plan.quotaCredits.toLocaleString("zh-CN")} 点，有效期内不重置`;
    const cycle = plan.resetCycle === "custom" ? `每 ${plan.resetCustomSeconds} 秒` : resetCycleLabels[plan.resetCycle];
    return `${cycle}将套餐额度重置为 ${plan.quotaCredits.toLocaleString("zh-CN")} 点`;
}

export default function SubscriptionsPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const setSession = useUserStore((state) => state.setSession);
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
    const [roles, setRoles] = useState<AdminRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [purchasing, setPurchasing] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const [planResult, subscriptionResult, roleResult] = await Promise.all([fetchSubscriptionPlans(token), fetchUserSubscriptions(token), fetchAllRoles()]);
            setPlans(planResult.items || []);
            setSubscriptions(subscriptionResult.items || []);
            setRoles(roleResult || []);
            const refreshedUser = await fetchCurrentUser(token);
            setSession(token, refreshedUser);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isReady) return;
        if (!token || !user) {
            router.replace("/login?redirect=/subscriptions");
            return;
        }
        void load();
    }, [isReady, token, user?.id]);

    const roleLabels = useMemo(() => new Map(roles.map((role) => [role.name, role.label])), [roles]);
    const activeSubscription = subscriptions.find((item) => item.status === "active" && dayjs(item.expiresAt).isAfter(dayjs()));

    const purchase = async () => {
        if (!selectedPlan) return;
        setPurchasing(true);
        try {
            const result = await purchaseSubscription(token, selectedPlan.id);
            setSession(token, result.user);
            setSelectedPlan(null);
            message.success("订阅购买成功");
            await load();
        } finally {
            setPurchasing(false);
        }
    };

    if (!isReady || loading) {
        return (
            <div className="grid min-h-[60vh] place-items-center">
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-7xl px-1 py-4 sm:px-2 sm:py-6">
            <div className="mb-6 flex flex-col gap-3 border-b border-stone-200 pb-6 sm:flex-row sm:items-end sm:justify-between dark:border-stone-800">
                <div>
                    <Typography.Title level={2} style={{ margin: 0 }}>
                        订阅套餐
                    </Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ margin: "6px 0 0" }}>
                        使用算力点购买套餐并升级角色权限。
                    </Typography.Paragraph>
                </div>
                <div className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
                    <WalletOutlined /> 钱包余额 <strong className={user && user.credits < 0 ? "text-red-500" : "text-stone-950 dark:text-white"}>{(user?.credits || 0).toLocaleString("zh-CN")} 点</strong>
                </div>
            </div>

            {activeSubscription ? (
                <section className="mb-6 grid gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-5 sm:grid-cols-[1fr_auto] sm:items-center dark:border-emerald-900 dark:bg-emerald-950/30">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-600 text-white">
                            <CrownOutlined />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <strong className="text-base text-stone-950 dark:text-white">{activeSubscription.planTitle}</strong>
                                <Tag color="success">订阅中</Tag>
                            </div>
                            <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">当前角色：{roleLabels.get(activeSubscription.upgradeRole) || activeSubscription.upgradeRole}</p>
                            <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">套餐剩余额度：{activeSubscription.quotaRemaining.toLocaleString("zh-CN")} / {activeSubscription.quotaCredits.toLocaleString("zh-CN")} 点</p>
                            {activeSubscription.nextResetAt ? <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">下次额度重置：{dayjs(activeSubscription.nextResetAt).format("YYYY-MM-DD HH:mm:ss")}</p> : null}
                        </div>
                    </div>
                    <div className="text-sm text-stone-600 sm:text-right dark:text-stone-300">
                        <ClockCircleOutlined className="mr-1" />
                        有效至 {dayjs(activeSubscription.expiresAt).format("YYYY-MM-DD HH:mm")}
                    </div>
                </section>
            ) : null}

            {plans.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {plans.map((plan) => {
                        const affordable = (user?.credits || 0) >= plan.priceCredits;
                        const isCurrent = activeSubscription?.planId === plan.id;
                        return (
                            <article key={plan.id} className="flex min-h-[300px] flex-col rounded-lg border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-950">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h2 className="text-lg font-semibold text-stone-950 dark:text-white">{plan.title}</h2>
                                        <p className="mt-1 min-h-10 text-sm leading-5 text-stone-500 dark:text-stone-400">{plan.subtitle || "订阅角色权限套餐"}</p>
                                    </div>
                                    {isCurrent ? <Tag color="success">当前</Tag> : null}
                                </div>
                                <div className="mt-5 flex items-baseline gap-2">
                                    <strong className="text-3xl font-semibold tabular-nums text-stone-950 dark:text-white">{plan.priceCredits.toLocaleString("zh-CN")}</strong>
                                    <span className="text-sm text-stone-500">算力点</span>
                                </div>
                                <div className="mt-5 space-y-2 border-t border-stone-100 pt-4 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-300">
                                    <div className="flex items-center gap-2">
                                        <SafetyOutlined className="text-emerald-600" />
                                        升级为 {roleLabels.get(plan.upgradeRole) || plan.upgradeRole}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <ClockCircleOutlined className="text-emerald-600" />
                                        有效期 {formatPlanDuration(plan)}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <ReloadOutlined className="text-emerald-600" />
                                        {formatResetRule(plan)}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <WalletOutlined className="text-emerald-600" />
                                        {plan.allowWalletFallback ? "额度不足时允许钱包补差" : "额度不足时不使用钱包余额"}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircleFilled className="text-emerald-600" />
                                        到期回退为 {roleLabels.get(plan.downgradeRole) || plan.downgradeRole}
                                    </div>
                                </div>
                                <Button type="primary" block className="mt-auto" disabled={!affordable || user?.role === "admin"} onClick={() => setSelectedPlan(plan)}>
                                    {user?.role === "admin" ? "管理员无需订阅" : affordable ? (isCurrent ? "续费套餐" : "购买套餐") : "算力点不足"}
                                </Button>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <Empty description="暂无可购买的订阅套餐" />
            )}

            <Modal title="确认购买订阅" open={Boolean(selectedPlan)} confirmLoading={purchasing} onOk={() => void purchase()} onCancel={() => setSelectedPlan(null)} okText="确认购买" cancelText="取消">
                {selectedPlan ? (
                    <div className="space-y-3 py-2">
                        <p>
                            套餐：<strong>{selectedPlan.title}</strong>
                        </p>
                        <p>
                            需要支付：<strong>{selectedPlan.priceCredits.toLocaleString("zh-CN")} 算力点</strong>
                        </p>
                        <p>
                            购买后角色将升级为“{roleLabels.get(selectedPlan.upgradeRole) || selectedPlan.upgradeRole}”，到期后回退为“{roleLabels.get(selectedPlan.downgradeRole) || selectedPlan.downgradeRole}”。
                        </p>
                        <p>额度规则：{formatResetRule(selectedPlan)}；{selectedPlan.allowWalletFallback ? "额度不足时钱包补差" : "额度不足时不会扣钱包余额"}。</p>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}
