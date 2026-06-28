"use client";

import { CalendarOutlined, CheckCircleFilled, ClockCircleOutlined, CopyOutlined, CrownOutlined, GiftOutlined, ProfileOutlined, SafetyOutlined, UserOutlined, WalletOutlined } from "@ant-design/icons";
import { App, Button, Input, Pagination, Space, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { bindAffCode, dailyCheckIn, fetchCheckInMonth, fetchUserCreditLogs, redeemCode, updateProfile, type CheckIn, type CreditLog } from "@/services/api/auth";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

function InfoRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
    const { message } = App.useApp();
    return (
        <div className="flex flex-col gap-1">
            <span className="text-xs text-stone-400 dark:text-stone-500">{label}</span>
            <div className="flex items-center gap-2">
                <span className="text-sm text-stone-700 dark:text-stone-200">{value || "-"}</span>
                {copyable && value && (
                    <button
                        type="button"
                        className="text-stone-400 transition-colors hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                        onClick={() => {
                            navigator.clipboard.writeText(value).then(() => message.success("已复制"));
                        }}
                    >
                        <CopyOutlined />
                    </button>
                )}
            </div>
        </div>
    );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-800/50">
            <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                {icon} {label}
            </div>
            <div className="mt-2 text-xl font-semibold text-stone-800 dark:text-stone-100">{value}</div>
        </div>
    );
}

const creditLogTypeLabels: Record<string, string> = {
    admin_adjust: "后台调整",
    ai_consume: "模型消费",
    ai_refund: "失败返还",
    membership_free: "会员免费",
    invite_reward: "邀请奖励",
    redeem: "兑换卡密",
    check_in: "签到奖励",
};

const tagColorMap: Record<string, string> = {
    admin_adjust: "blue",
    ai_consume: "red",
    ai_refund: "green",
    membership_free: "cyan",
    invite_reward: "purple",
    redeem: "gold",
    check_in: "lime",
};

// 个人中心 Tab
function ProfileTab() {
    const { message } = App.useApp();
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const setSession = useUserStore((state) => state.setSession);
    const inviteRewardCredits = useConfigStore((state) => state.publicSystemSettings?.inviteRewardCredits) || 50;
    const [affCodeInput, setAffCodeInput] = useState("");
    const [binding, setBinding] = useState(false);
    const [redeemInput, setRedeemInput] = useState("");
    const [redeeming, setRedeeming] = useState(false);

    const inviteLink = useMemo(() => {
        if (!user?.affCode) return "";
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        return `${origin}/login?inviteCode=${user.affCode}`;
    }, [user?.affCode]);

    const membershipActive = user.membershipExpiresAt && dayjs(user.membershipExpiresAt).isAfter(dayjs());

    const handleBindAffCode = async () => {
        if (!affCodeInput.trim()) {
            message.warning("请输入邀请码");
            return;
        }
        setBinding(true);
        try {
            const updated = await bindAffCode(token, affCodeInput.trim());
            setSession(token, updated);
            setAffCodeInput("");
            message.success("邀请码绑定成功");
        } catch {
            // error handled by api layer
        } finally {
            setBinding(false);
        }
    };

    const handleRedeem = async () => {
        if (!redeemInput.trim()) {
            message.warning("请输入兑换码");
            return;
        }
        setRedeeming(true);
        try {
            const updated = await redeemCode(token, redeemInput.trim());
            setSession(token, updated);
            setRedeemInput("");
            message.success("兑换成功");
        } catch {
            // error handled by api layer
        } finally {
            setRedeeming(false);
        }
    };

    return (
        <>
            {/* 统计卡片 */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard icon={<WalletOutlined />} label="算力点余额" value={`⚡ ${user.credits}`} />
                <StatCard
                    icon={<CrownOutlined />}
                    label="会员状态"
                    value={membershipActive ? `有效至 ${dayjs(user.membershipExpiresAt).format("MM-DD HH:mm")}` : "无会员"}
                />
                <StatCard icon={<ClockCircleOutlined />} label="注册时间" value={dayjs(user.createdAt).format("YYYY-MM-DD HH:mm")} />
            </div>

            {/* 详细信息 */}
            <div className="mt-6 grid grid-cols-1 gap-5 border-t border-stone-200 pt-6 dark:border-stone-800 sm:grid-cols-2">
                <InfoRow label="用户 ID" value={user.id} copyable />
                <InfoRow label="邀请码" value={user.affCode} copyable />
                <InfoRow label="邀请链接" value={inviteLink} copyable />
                <InfoRow label="邀请人数" value={String(user.affCount || 0)} />
                <InfoRow label="邀请奖励" value={`每邀请 1 人奖励 ⚡ ${inviteRewardCredits}`} />
                <InfoRow label="昵称" value={user.displayName} />
                <InfoRow label="创建时间" value={dayjs(user.createdAt).format("YYYY-MM-DD HH:mm:ss")} />
                <InfoRow label="更新时间" value={dayjs(user.updatedAt).format("YYYY-MM-DD HH:mm:ss")} />
            </div>

            {/* 补填邀请码 */}
            {!user.inviterId && (
                <div className="mt-6 border-t border-stone-200 pt-6 dark:border-stone-800">
                    <div className="mb-3 text-sm font-medium text-stone-700 dark:text-stone-200">
                        <span className="mr-1 text-red-500">*</span>补填邀请人邀请码
                    </div>
                    <Space.Compact className="w-full">
                        <Input
                            placeholder="注册时忘记填写可在这里补填"
                            value={affCodeInput}
                            onChange={(e) => setAffCodeInput(e.target.value)}
                            onPressEnter={() => void handleBindAffCode()}
                        />
                        <Button type="primary" loading={binding} onClick={() => void handleBindAffCode()}>
                            绑定邀请码
                        </Button>
                    </Space.Compact>
                </div>
            )}

            {/* 兑换码 */}
            <div className="mt-6 border-t border-stone-200 pt-6 dark:border-stone-800">
                <div className="mb-3 text-sm font-medium text-stone-700 dark:text-stone-200">
                    <GiftOutlined className="mr-1" />兑换码
                </div>
                <Space.Compact className="w-full">
                    <Input
                        placeholder="输入兑换码充值算力点"
                        value={redeemInput}
                        onChange={(e) => setRedeemInput(e.target.value)}
                        onPressEnter={() => void handleRedeem()}
                    />
                    <Button type="primary" loading={redeeming} onClick={() => void handleRedeem()}>
                        立即兑换
                    </Button>
                </Space.Compact>
            </div>
        </>
    );
}

// 算力点明细 Tab
function CreditLogsTab() {
    const token = useUserStore((state) => state.token);
    const [logs, setLogs] = useState<CreditLog[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [loading, setLoading] = useState(false);
    const [typeFilter, setTypeFilter] = useState<string>("");

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchUserCreditLogs(token, { page, pageSize, keyword: typeFilter });
            setLogs(res.items || []);
            setTotal(res.total || 0);
        } catch {
            // error handled by api layer
        } finally {
            setLoading(false);
        }
    }, [token, page, pageSize, typeFilter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const columns = [
        {
            title: "类型",
            dataIndex: "type",
            width: 120,
            render: (type: string) => <Tag color={tagColorMap[type]}>{creditLogTypeLabels[type] || type}</Tag>,
        },
        {
            title: "变动",
            dataIndex: "amount",
            width: 100,
            render: (amount: number) => (
                <span className={amount >= 0 ? "text-green-500" : "text-red-500"}>
                    {amount >= 0 ? "+" : ""}{amount} 点
                </span>
            ),
        },
        {
            title: "余额",
            dataIndex: "balance",
            width: 80,
        },
        {
            title: "备注",
            dataIndex: "remark",
            ellipsis: true,
            render: (remark: string) => <span className="text-stone-500 dark:text-stone-400">{remark || "-"}</span>,
        },
        {
            title: "时间",
            dataIndex: "createdAt",
            width: 180,
            render: (time: string) => time ? dayjs(time).format("YYYY-MM-DD HH:mm:ss") : "-",
        },
    ];

    return (
        <div className="mt-6">
            <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-stone-500 dark:text-stone-400">查看模型消费、失败返还、兑换码和后台调整记录。</span>
                <select
                    value={typeFilter}
                    onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                    className="rounded border border-stone-200 bg-white px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-800"
                >
                    <option value="">全部类型</option>
                    <option value="ai_consume">模型消费</option>
                    <option value="ai_refund">失败返还</option>
                    <option value="redeem">兑换卡密</option>
                    <option value="admin_adjust">后台调整</option>
                    <option value="invite_reward">邀请奖励</option>
                    <option value="check_in">签到奖励</option>
                </select>
            </div>
            <Table
                dataSource={logs}
                columns={columns}
                rowKey="id"
                loading={loading}
                pagination={false}
                size="small"
            />
            <div className="mt-4 flex justify-end">
                <Pagination
                    current={page}
                    pageSize={pageSize}
                    total={total}
                    showSizeChanger
                    showQuickJumper
                    showTotal={(t) => `共 ${t} 条`}
                    onChange={(p, ps) => { setPage(p); setPageSize(ps); }}
                />
            </div>
        </div>
    );
}

// 每日签到 Tab
function CheckInTab() {
    const { message } = App.useApp();
    const token = useUserStore((state) => state.token);
    const setSession = useUserStore((state) => state.setSession);
    const user = useUserStore((state) => state.user);
    const checkInRewardMin = useConfigStore((state) => state.publicSystemSettings?.checkInRewardMin) || 5;
    const checkInRewardMax = useConfigStore((state) => state.publicSystemSettings?.checkInRewardMax) || 20;
    const [loading, setLoading] = useState(false);
    const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [totalReward, setTotalReward] = useState(0);
    const [currentMonth, setCurrentMonth] = useState(dayjs());

    const todayChecked = useMemo(() => {
        const today = dayjs().format("YYYY-MM-DD");
        return checkIns.some((c) => dayjs(c.createdAt).format("YYYY-MM-DD") === today);
    }, [checkIns]);

    const fetchMonthData = useCallback(async () => {
        setLoading(true);
        try {
            const month = currentMonth.format("YYYY-MM");
            const res = await fetchCheckInMonth(token, month);
            setCheckIns(res.items || []);
            setTotalCount(res.totalCount || 0);
            setTotalReward(res.totalReward || 0);
        } catch {
            // error handled by api layer
        } finally {
            setLoading(false);
        }
    }, [token, currentMonth]);

    useEffect(() => {
        fetchMonthData();
    }, [fetchMonthData]);

    const handleCheckIn = async () => {
        setLoading(true);
        try {
            const res = await dailyCheckIn(token);
            if (res.isNew) {
                message.success(`签到成功，获得 ⚡ ${res.checkIn.reward} 算力点`);
                // 刷新用户信息
                const updatedUser = { ...user, credits: (user?.credits || 0) + res.checkIn.reward };
                setSession(token, updatedUser);
                fetchMonthData();
            }
        } catch {
            // error handled by api layer
        } finally {
            setLoading(false);
        }
    };

    // 生成日历数据
    const calendarDays = useMemo(() => {
        const startOfMonth = currentMonth.startOf("month");
        const endOfMonth = currentMonth.endOf("month");
        const startDay = startOfMonth.day(); // 0-6, 0 is Sunday
        const daysInMonth = endOfMonth.date();

        const days: { day: number; isCurrentMonth: boolean; checkIn?: CheckIn }[] = [];

        // 填充上个月的日期
        for (let i = 0; i < startDay; i++) {
            const prevDate = startOfMonth.subtract(startDay - i, "day");
            days.push({ day: prevDate.date(), isCurrentMonth: false });
        }

        // 填充本月日期
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = currentMonth.date(i).format("YYYY-MM-DD");
            const checkIn = checkIns.find((c) => dayjs(c.createdAt).format("YYYY-MM-DD") === dateStr);
            days.push({ day: i, isCurrentMonth: true, checkIn });
        }

        // 填充下个月的日期
        const remaining = 42 - days.length;
        for (let i = 1; i <= remaining; i++) {
            const nextDate = endOfMonth.add(i, "day");
            days.push({ day: nextDate.date(), isCurrentMonth: false });
        }

        return days;
    }, [currentMonth, checkIns]);

    return (
        <div className="mt-6">
            {/* 标题和签到按钮 */}
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 text-lg font-medium text-stone-800 dark:text-stone-100">
                        <CalendarOutlined /> 每日签到
                    </div>
                    <div className="text-sm text-stone-500 dark:text-stone-400">今日签到可随机获得 {checkInRewardMin}~{checkInRewardMax} 点普通算力点。</div>
                </div>
                <Button
                    type="primary"
                    loading={loading}
                    disabled={todayChecked}
                    onClick={() => void handleCheckIn()}
                >
                    {todayChecked ? "今日已签到" : "立即签到"}
                </Button>
            </div>

            {/* 统计卡片 */}
            <div className="mb-6 grid grid-cols-3 gap-3">
                <StatCard icon={<GiftOutlined />} label="累计获得" value={`⚡ ${totalReward}`} />
                <StatCard icon={<CalendarOutlined />} label="累计签到" value={`${totalCount} 天`} />
                <StatCard icon={<CheckCircleFilled />} label="本月签到" value={`${checkIns.length} 天`} />
            </div>

            {/* 日历 */}
            <div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
                {/* 月份导航 */}
                <div className="mb-4 flex items-center justify-between">
                    <Button
                        type="text"
                        onClick={() => setCurrentMonth(currentMonth.subtract(1, "month"))}
                    >
                        {"<"}
                    </Button>
                    <span className="font-medium text-stone-800 dark:text-stone-100">
                        {currentMonth.format("YYYY-MM")}
                    </span>
                    <Button
                        type="text"
                        onClick={() => setCurrentMonth(currentMonth.add(1, "month"))}
                    >
                        {">"}
                    </Button>
                </div>

                {/* 星期标题 */}
                <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-stone-500 dark:text-stone-400">
                    <div>一</div>
                    <div>二</div>
                    <div>三</div>
                    <div>四</div>
                    <div>五</div>
                    <div>六</div>
                    <div>日</div>
                </div>

                {/* 日期网格 */}
                <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((item, index) => (
                        <div
                            key={index}
                            className={`relative flex flex-col items-center justify-center rounded-lg p-2 text-sm ${
                                !item.isCurrentMonth
                                    ? "text-stone-300 dark:text-stone-600"
                                    : item.checkIn
                                    ? "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                                    : "text-stone-700 dark:text-stone-200"
                            }`}
                        >
                            <span>{item.day}</span>
                            {item.checkIn && (
                                <span className="text-[10px] text-green-500">+{item.checkIn.reward}</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// 安全中心 Tab
function SecurityTab() {
    const { message } = App.useApp();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const setSession = useUserStore((state) => state.setSession);
    const [displayName, setDisplayName] = useState(user?.displayName || "");
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const handleUpdateDisplayName = async () => {
        if (!displayName.trim()) {
            message.error("请输入昵称");
            return;
        }
        setLoading(true);
        try {
            const updatedUser = await updateProfile(token, { displayName: displayName.trim() });
            setSession(token, updatedUser);
            message.success("昵称修改成功");
        } catch {
            // error handled by api layer
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async () => {
        if (!oldPassword) {
            message.error("请输入当前密码");
            return;
        }
        if (!newPassword) {
            message.error("请输入新密码");
            return;
        }
        if (newPassword.length < 6) {
            message.error("新密码至少6位");
            return;
        }
        if (newPassword !== confirmPassword) {
            message.error("两次输入的密码不一致");
            return;
        }
        setLoading(true);
        try {
            await updateProfile(token, { password: newPassword });
            message.success("密码修改成功");
            setOldPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch {
            // error handled by api layer
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 pt-2">
            {/* 修改昵称 */}
            <div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
                <div className="mb-3 text-sm font-medium text-stone-700 dark:text-stone-300">修改昵称</div>
                <div className="flex gap-2">
                    <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="请输入新昵称"
                        className="flex-1"
                    />
                    <Button type="primary" onClick={handleUpdateDisplayName} loading={loading}>
                        保存
                    </Button>
                </div>
            </div>

            {/* 修改密码 */}
            <div className="rounded-lg border border-stone-200 p-4 dark:border-stone-700">
                <div className="mb-3 text-sm font-medium text-stone-700 dark:text-stone-300">修改密码</div>
                <div className="space-y-3">
                    <Input.Password
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="当前密码"
                    />
                    <Input.Password
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="新密码（至少6位）"
                    />
                    <Input.Password
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="确认新密码"
                    />
                    <Button type="primary" onClick={handleChangePassword} loading={loading}>
                        修改密码
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default function ProfilePage() {
    const user = useUserStore((state) => state.user);
    const checkInEnabled = useConfigStore((state) => state.publicSystemSettings?.checkInEnabled) ?? true;
    const [activeTab, setActiveTab] = useState("profile");

    const tabsRef = useRef<Record<string, HTMLButtonElement | null>>({});
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

    const tabs = [
        { key: "profile", icon: <UserOutlined />, label: "个人中心" },
        { key: "credits", icon: <ProfileOutlined />, label: "算力点明细" },
        ...(checkInEnabled ? [{ key: "checkin", icon: <CalendarOutlined />, label: "每日签到" }] : []),
        { key: "security", icon: <SafetyOutlined />, label: "安全中心" },
    ];

    useEffect(() => {
        const el = tabsRef.current[activeTab];
        if (el) {
            setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth });
        }
    }, [activeTab]);

    if (!user) {
        return (
            <main className="flex items-center justify-center" style={{ minHeight: "100%" }}>
                <Typography.Text type="secondary">请先登录</Typography.Text>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-4xl overflow-y-auto px-6 py-8">
            {/* 导航标签栏 */}
            <div className="relative mb-4 flex gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1 dark:border-stone-700 dark:bg-stone-800/50">
                {/* 滑动指示器 */}
                <div
                    className="absolute top-1 bottom-1 rounded-md bg-white shadow-sm transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-stone-700"
                    style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
                />
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        ref={(el) => { tabsRef.current[tab.key] = el; }}
                        onClick={() => setActiveTab(tab.key)}
                        className={`relative z-10 flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                            activeTab === tab.key
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-stone-600 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900/50">
                {/* 用户信息头部 */}
                <div className="flex items-center gap-4">
                    <div className="flex size-14 items-center justify-center rounded-full bg-stone-200 text-xl text-stone-500 dark:bg-stone-700 dark:text-stone-300">
                        {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt="" className="size-14 rounded-full object-cover" />
                        ) : (
                            <UserOutlined />
                        )}
                    </div>
                    <div>
                        <div className="text-lg font-medium text-stone-800 dark:text-stone-100">{user.displayName || user.username}</div>
                        <div className="text-sm text-stone-400 dark:text-stone-500">@{user.username}</div>
                    </div>
                </div>

                {/* 根据选中的标签显示内容 */}
                <div key={activeTab} className="animate-fadeIn">
                    {activeTab === "profile" && <ProfileTab />}
                    {activeTab === "credits" && <CreditLogsTab />}
                    {activeTab === "checkin" && <CheckInTab />}
                    {activeTab === "security" && <SecurityTab />}
                </div>
            </div>
        </main>
    );
}
