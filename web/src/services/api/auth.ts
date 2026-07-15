import { apiGet, apiPost, apiPut, compactApiParams } from "@/services/api/request";

export const AUTH_TOKEN_KEY = "infinite-canvas-auth-token-v1";

export type UserRole = string;

export type AuthUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    role: UserRole;
    credits: number;
    subscriptionCredits: number;
    hasActiveSubscription: boolean;
    subscriptionAllowWalletFallback: boolean;
    affCode: string;
    affCount: number;
    inviterId: string;
    membershipExpiresAt: string;
    enableTasks: boolean;
    lastLoginAt: string;
    createdAt: string;
    updatedAt: string;
};

export type AuthSession = {
    token: string;
    user: AuthUser;
};

export type AuthPayload = {
    username: string;
    password: string;
    affCode?: string;
};

export async function login(payload: AuthPayload) {
    return apiPost<AuthSession>("/api/auth/login", payload);
}

export async function register(payload: AuthPayload) {
    return apiPost<AuthSession>("/api/auth/register", payload);
}

export async function fetchCurrentUser(token?: string) {
    return apiGet<AuthUser>("/api/auth/me", undefined, token);
}

export async function redeemCode(token: string, code: string) {
    return apiPost<AuthUser>("/api/v1/redeem-code", { code }, token);
}

export async function updateProfile(token: string, data: { displayName?: string; password?: string }) {
    return apiPut<AuthUser>("/api/v1/profile", data, token);
}

export async function bindAffCode(token: string, affCode: string) {
    return apiPost<AuthUser>("/api/v1/bind-aff-code", { affCode }, token);
}

export type CreditLog = {
    id: string;
    userId: string;
    username: string;
    type: string;
    amount: number;
    balance: number;
    relatedId: string;
    remark: string;
    extra: string;
    createdAt: string;
};

export type CreditLogListResponse = {
    items: CreditLog[];
    total: number;
};

export async function fetchUserCreditLogs(token: string, query: { keyword?: string; page?: number; pageSize?: number } = {}) {
    return apiGet<CreditLogListResponse>("/api/v1/credit-logs", compactApiParams(query), token);
}

export type CheckIn = {
    id: string;
    userId: string;
    reward: number;
    createdAt: string;
};

export type CheckInMonthResponse = {
    items: CheckIn[];
    totalCount: number;
    totalReward: number;
};

export async function dailyCheckIn(token: string) {
    return apiPost<{ checkIn: CheckIn; isNew: boolean }>("/api/v1/checkin", {}, token);
}

export async function fetchCheckInMonth(token: string, month: string) {
    return apiGet<CheckInMonthResponse>("/api/v1/checkin/month?month=" + encodeURIComponent(month), undefined, token);
}
