const STORAGE_KEY = "mahaly_device_id";

// A stable per-browser id, not tied to any Supabase token — used purely to
// let the security page's device list ("your devices") group repeated
// sign-ins from the same browser together.
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
