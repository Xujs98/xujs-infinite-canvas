import { apiGet } from "@/services/api/request";

export interface Announcement {
  id: string;
  title: string;
  content: string;
  status: string;
  notifyType: string;
  target: string;
  pinned: boolean;
  startTime?: string;
  endTime?: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchAnnouncements(target: string = "all") {
  return apiGet<Announcement[]>("/api/announcements", { target });
}
