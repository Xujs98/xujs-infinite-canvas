import { apiGet, apiPost, apiDelete, compactApiParams } from "@/services/api/request";

export interface AdminAnnouncement {
  id: string;
  title: string;
  content: string;
  status: "draft" | "active" | "archived";
  notifyType: "silent" | "popup";
  target: "all" | "member";
  pinned: boolean;
  startTime?: string;
  endTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAnnouncementListResponse {
  items: AdminAnnouncement[];
  total: number;
}

export async function fetchAdminAnnouncements(
  token: string,
  query: { keyword?: string; status?: string; page?: number; pageSize?: number } = {}
) {
  return apiGet<AdminAnnouncementListResponse>(
    "/api/admin/announcements",
    compactApiParams(query),
    token
  );
}

export async function saveAdminAnnouncement(
  token: string,
  announcement: Partial<AdminAnnouncement>
) {
  return apiPost<AdminAnnouncement>(
    "/api/admin/announcements",
    announcement,
    token
  );
}

export async function deleteAdminAnnouncement(token: string, id: string) {
  return apiDelete<boolean>(
    `/api/admin/announcements/${encodeURIComponent(id)}`,
    token
  );
}

export async function batchDeleteAnnouncements(token: string, ids: string[]) {
  return apiPost<boolean>(
    "/api/admin/announcements/batch-delete",
    { ids },
    token
  );
}

export async function batchUpdateAnnouncementPinned(token: string, ids: string[], pinned: boolean) {
  return apiPost<boolean>(
    "/api/admin/announcements/batch-pinned",
    { ids, pinned },
    token
  );
}
