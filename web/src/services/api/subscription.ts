import { apiDelete, apiGet, apiPost, apiPut, compactApiParams } from "@/services/api/request";

export type SubscriptionDurationUnit = "day" | "month" | "year" | "hour" | "custom";
export type SubscriptionResetCycle = "none" | "daily" | "weekly" | "monthly" | "custom";

export type SubscriptionPlan = {
    id: string;
    title: string;
    subtitle: string;
    priceCredits: number;
    upgradeRole: string;
    downgradeRole: string;
    purchaseLimit: number;
    sort: number;
    enabled: boolean;
    durationUnit: SubscriptionDurationUnit;
    durationValue: number;
    durationCustomSeconds: number;
    quotaCredits: number;
    resetCycle: SubscriptionResetCycle;
    resetCustomSeconds: number;
    allowWalletFallback: boolean;
    subscriberCount: number;
    createdAt: string;
    updatedAt: string;
};

export type SubscriptionPlanList = {
    items: SubscriptionPlan[];
    total: number;
};

export type UserSubscription = {
    id: string;
    userId: string;
    planId: string;
    planTitle: string;
    priceCredits: number;
    upgradeRole: string;
    downgradeRole: string;
    quotaCredits: number;
    quotaRemaining: number;
    resetCycle: SubscriptionResetCycle;
    resetCustomSeconds: number;
    allowWalletFallback: boolean;
    source: "purchase" | "admin";
    status: "active" | "expired" | "replaced" | "voided";
    startsAt: string;
    expiresAt: string;
    lastResetAt: string;
    nextResetAt: string;
    createdAt: string;
    updatedAt: string;
};

export type UserSubscriptionList = {
    items: UserSubscription[];
    total: number;
};

export type SubscriptionPurchaseResult = {
    user: import("@/services/api/auth").AuthUser;
    subscription: UserSubscription;
};

export type SubscriptionSubscriber = {
    subscriptionId: string;
    userId: string;
    username: string;
    displayName: string;
    quotaCredits: number;
    quotaRemaining: number;
    status: UserSubscription["status"];
    startsAt: string;
    expiresAt: string;
};

export type SubscriptionSubscriberList = {
    items: SubscriptionSubscriber[];
    total: number;
};

export async function fetchAdminSubscriptionPlans(token: string, query: { keyword?: string; status?: string; page?: number; pageSize?: number } = {}) {
    return apiGet<SubscriptionPlanList>("/api/admin/subscription-plans", compactApiParams(query), token);
}

export async function createAdminSubscriptionPlan(token: string, data: Partial<SubscriptionPlan>) {
    return apiPost<SubscriptionPlan>("/api/admin/subscription-plans", data, token);
}

export async function updateAdminSubscriptionPlan(token: string, id: string, data: Partial<SubscriptionPlan>) {
    return apiPut<SubscriptionPlan>(`/api/admin/subscription-plans/${encodeURIComponent(id)}`, data, token);
}

export async function deleteAdminSubscriptionPlan(token: string, id: string) {
    return apiDelete<boolean>(`/api/admin/subscription-plans/${encodeURIComponent(id)}`, token);
}

export async function fetchAdminSubscriptionPlanUsers(token: string, planId: string, query: { keyword?: string; page?: number; pageSize?: number } = {}) {
    return apiGet<SubscriptionSubscriberList>(`/api/admin/subscription-plans/${encodeURIComponent(planId)}/users`, compactApiParams(query), token);
}

export async function fetchAdminUserSubscriptions(token: string, userId: string) {
    return apiGet<UserSubscriptionList>(`/api/admin/users/${encodeURIComponent(userId)}/subscriptions`, { page: 1, pageSize: 100 }, token);
}

export async function grantAdminUserSubscription(token: string, userId: string, planId: string) {
    return apiPost<UserSubscription>(`/api/admin/users/${encodeURIComponent(userId)}/subscriptions`, { planId }, token);
}

export async function resetAdminUserSubscription(token: string, subscriptionId: string) {
    return apiPost<UserSubscription>(`/api/admin/user-subscriptions/${encodeURIComponent(subscriptionId)}/reset`, {}, token);
}

export async function voidAdminUserSubscription(token: string, subscriptionId: string) {
    return apiPost<boolean>(`/api/admin/user-subscriptions/${encodeURIComponent(subscriptionId)}/void`, {}, token);
}

export async function deleteAdminUserSubscription(token: string, subscriptionId: string) {
    return apiDelete<boolean>(`/api/admin/user-subscriptions/${encodeURIComponent(subscriptionId)}`, token);
}

export async function fetchSubscriptionPlans(token: string) {
    return apiGet<SubscriptionPlanList>("/api/v1/subscription-plans", { page: 1, pageSize: 100 }, token);
}

export async function fetchUserSubscriptions(token: string) {
    return apiGet<UserSubscriptionList>("/api/v1/subscriptions", { page: 1, pageSize: 100 }, token);
}

export async function purchaseSubscription(token: string, planId: string) {
    return apiPost<SubscriptionPurchaseResult>("/api/v1/subscriptions/purchase", { planId }, token);
}
