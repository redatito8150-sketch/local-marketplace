import { apiRequest } from "@/lib/api";

export type Address = {
  id: string; label: "Home" | "Work" | "Other"; firstName: string; lastName: string;
  phone: string; addressLine: string; city: string; governorate: string; isDefault: boolean;
};
export type AddressInput = Omit<Address, "id" | "isDefault">;
export async function getAddresses() {
  return (await apiRequest<{ addresses: Address[] }>("/api/account/addresses")).addresses;
}
export async function createAddress(input: AddressInput) {
  return apiRequest<{ id: string }>("/api/account/addresses", { method: "POST", body: JSON.stringify(input) });
}
export async function updateAddress(id: string, input: AddressInput) {
  return apiRequest<{ ok: true }>(`/api/account/addresses/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}
export async function deleteAddress(id: string) {
  return apiRequest<{ ok: true }>(`/api/account/addresses/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export async function setDefaultAddress(id: string) {
  return apiRequest<{ ok: true }>(`/api/account/addresses/${encodeURIComponent(id)}/default`, { method: "POST" });
}
