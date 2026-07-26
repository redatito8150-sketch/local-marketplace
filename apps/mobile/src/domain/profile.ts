import { apiRequest } from "@/lib/api";
export type Profile = { fullName: string; phone: string; email: string };
export type NotificationPreferences = { orderUpdates: boolean; promotions: boolean; newsletter: boolean };
export async function getProfile() { return (await apiRequest<{ profile: Profile }>("/api/account/profile")).profile; }
export async function updateProfile(input: Pick<Profile, "fullName" | "phone">) { return apiRequest<{ ok: true }>("/api/account/profile", { method: "PATCH", body: JSON.stringify(input) }); }
export async function getNotificationPreferences() { return (await apiRequest<{ preferences: NotificationPreferences }>("/api/account/notification-preferences")).preferences; }
export async function updateNotificationPreferences(input: NotificationPreferences) { return apiRequest<{ ok: true }>("/api/account/notification-preferences", { method: "PATCH", body: JSON.stringify(input) }); }
