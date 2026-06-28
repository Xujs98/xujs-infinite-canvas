"use client";

import { BellOutlined, PushpinFilled } from "@ant-design/icons";
import { Badge, Button, Empty, Modal, Popover } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { useEffect, useRef, useState } from "react";

import { fetchAnnouncements, type Announcement } from "@/services/api/announcements";
import { useUserStore } from "@/stores/use-user-store";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

function formatTime(createdAt: string) {
  const now = dayjs();
  const created = dayjs(createdAt);
  if (now.diff(created, "hour") < 24) {
    return created.fromNow();
  }
  return created.format("YYYY-MM-DD");
}

function tagColor(type: string) {
  switch (type) {
    case "新增": return { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" };
    case "优化": case "调整": return { bg: "#fef9c3", text: "#854d0e", border: "#fef08a" };
    case "修复": return { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" };
    case "文档": return { bg: "#e0e7ff", text: "#3730a3", border: "#c7d2fe" };
    default: return { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" };
  }
}

function TimelineItem({ item, isFirst, isLast, onClick }: { item: Announcement; isFirst: boolean; isLast: boolean; onClick: () => void }) {
  const lines = item.content.split("\n").filter((l) => l.trim());

  return (
    <div className="relative flex gap-3" style={{ paddingBottom: isLast ? 0 : 24 }}>
      {/* 时间线竖线 */}
      <div className="relative flex flex-col items-center">
        {/* 圆点 */}
        <div
          className="relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white"
          style={{ background: "#ef4444", boxShadow: "0 0 0 2px #ef4444" }}
        />
        {/* 连线 */}
        {!isLast && (
          <div className="mt-1 w-0.5 flex-1" style={{ background: "#e5e7eb" }} />
        )}
      </div>

      {/* 内容 */}
      <div className="min-w-0 flex-1 pb-1">
        {/* 版本标题行 */}
        <div className="mb-2 flex items-center gap-2">
          {item.pinned && (
            <span
              className="inline-block shrink-0 rounded px-1.5 py-px text-xs font-medium"
              style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}
            >
              置顶
            </span>
          )}
          <span className="text-base font-bold" style={{ color: "var(--text-color, #1f2937)" }}>
            {item.title}
          </span>
          <span className="text-sm" style={{ color: "var(--text-color-secondary, #9ca3af)" }}>
            {formatTime(item.createdAt)}
          </span>
        </div>

        {/* 变更条目 */}
        <div className="space-y-1.5">
          {lines.map((line, i) => {
            const tagMatch = line.match(/^[\+\-\*]?\s*\[(.+?)\]\s*(.+)$/);
            if (tagMatch) {
              const [, type, text] = tagMatch;
              const colors = tagColor(type);
              return (
                <div key={i} className="flex items-start gap-2 text-[15px] leading-relaxed">
                  <span
                    className="mt-0.5 inline-block shrink-0 rounded px-1.5 py-px text-xs font-medium"
                    style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
                  >
                    {type}
                  </span>
                  <span style={{ color: "var(--text-color, #374151)" }}>{text}</span>
                </div>
              );
            }
            return (
              <div key={i} className="text-[15px] leading-relaxed" style={{ color: "var(--text-color, #374151)" }}>
                {line.replace(/^[\+\-\*]\s*/, "")}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AnnouncementBell() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [detailAnnouncement, setDetailAnnouncement] = useState<Announcement | null>(null);
  const [popupAnnouncement, setPopupAnnouncement] = useState<Announcement | null>(null);
  const user = useUserStore((s) => s.user);
  const hasShownPopup = useRef(false);

  useEffect(() => {
    const target = user?.role === "admin" || (user?.membershipExpiresAt && dayjs(user.membershipExpiresAt).isAfter(dayjs()))
      ? "member"
      : "all";
    fetchAnnouncements(target).then((data) => {
      if (Array.isArray(data)) {
        setAnnouncements(data);
        if (!hasShownPopup.current && data.length > 0) {
          const popupItem = data.find((item) => item.notifyType === "popup");
          if (popupItem) {
            setPopupAnnouncement(popupItem);
            hasShownPopup.current = true;
          }
        }
      }
    }).catch(() => {});
  }, [user]);

  const hasNew = announcements.length > 0;

  const content = (
    <div style={{ width: 480, maxHeight: 520, overflow: "auto" }} className="thin-scrollbar">
      {announcements.length === 0 ? (
        <Empty description="暂无公告" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div className="px-1">
          {announcements.map((item, index) => (
            <div
              key={item.id}
              className="cursor-pointer rounded-lg transition hover:bg-black/[.03] dark:hover:bg-white/[.05]"
              style={{ paddingLeft: 4, paddingRight: 8 }}
              onClick={() => { setDetailAnnouncement(item); setOpen(false); }}
            >
              <TimelineItem
                item={item}
                isFirst={index === 0}
                isLast={index === announcements.length - 1}
                onClick={() => { setDetailAnnouncement(item); setOpen(false); }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <Popover
        content={content}
        title={<span className="text-base font-semibold">公告</span>}
        trigger="click"
        placement="bottomRight"
        arrow={false}
        open={open}
        onOpenChange={setOpen}
      >
        <Badge dot={hasNew} offset={[-4, 4]}>
          <Button type="text" icon={<BellOutlined />} />
        </Badge>
      </Popover>

      {/* 点击查看详情 */}
      <Modal
        title={detailAnnouncement?.title}
        open={!!detailAnnouncement}
        onCancel={() => setDetailAnnouncement(null)}
        footer={null}
        destroyOnHidden
      >
        {detailAnnouncement && (
          <div>
            {detailAnnouncement.content.split("\n").filter((l) => l.trim()).map((line, i) => {
              const tagMatch = line.match(/^[\+\-\*]?\s*\[(.+?)\]\s*(.+)$/);
              if (tagMatch) {
                const [, type, text] = tagMatch;
                const colors = tagColor(type);
                return (
                  <div key={i} className="flex items-start gap-2 py-1 text-[15px] leading-relaxed">
                    <span
                      className="mt-0.5 inline-block shrink-0 rounded px-1.5 py-px text-xs font-medium"
                      style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
                    >
                      {type}
                    </span>
                    <span>{text}</span>
                  </div>
                );
              }
              return (
                <div key={i} className="py-1 text-[15px] leading-relaxed">
                  {line.replace(/^[\+\-\*]\s*/, "")}
                </div>
              );
            })}
            <div className="mt-3 text-xs" style={{ color: "#9ca3af" }}>
              发布于 {dayjs(detailAnnouncement.createdAt).format("YYYY-MM-DD HH:mm")}
            </div>
          </div>
        )}
      </Modal>

      {/* 弹出通知 */}
      <Modal
        title={popupAnnouncement?.title}
        open={!!popupAnnouncement}
        onCancel={() => setPopupAnnouncement(null)}
        footer={null}
        destroyOnHidden
        width={480}
      >
        {popupAnnouncement && (
          <div>
            {popupAnnouncement.content.split("\n").filter((l) => l.trim()).map((line, i) => {
              const tagMatch = line.match(/^[\+\-\*]?\s*\[(.+?)\]\s*(.+)$/);
              if (tagMatch) {
                const [, type, text] = tagMatch;
                const colors = tagColor(type);
                return (
                  <div key={i} className="flex items-start gap-2 py-1 text-base leading-relaxed">
                    <span
                      className="mt-0.5 inline-block shrink-0 rounded px-1.5 py-px text-xs font-medium"
                      style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
                    >
                      {type}
                    </span>
                    <span>{text}</span>
                  </div>
                );
              }
              return (
                <div key={i} className="py-1 text-base leading-relaxed">
                  {line.replace(/^[\+\-\*]\s*/, "")}
                </div>
              );
            })}
            <div className="mt-3 text-xs" style={{ color: "#9ca3af" }}>
              发布于 {dayjs(popupAnnouncement.createdAt).format("YYYY-MM-DD HH:mm")}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
