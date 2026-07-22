import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AddressLabel, AddressRecord } from "@/types";

interface AddressRow {
  id: string;
  label: string;
  first_name: string;
  last_name: string;
  phone: string;
  address_line: string;
  city: string;
  governorate: string;
  building_number: string | null;
  floor: string | null;
  apartment: string | null;
  landmark: string | null;
  delivery_instructions: string | null;
  postal_code: string | null;
  is_default: boolean;
}

function toAddressRecord(row: AddressRow): AddressRecord {
  return {
    id: row.id,
    label: row.label as AddressLabel,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    addressLine: row.address_line,
    city: row.city,
    governorate: row.governorate,
    buildingNumber: row.building_number ?? undefined,
    floor: row.floor ?? undefined,
    apartment: row.apartment ?? undefined,
    landmark: row.landmark ?? undefined,
    deliveryInstructions: row.delivery_instructions ?? undefined,
    postalCode: row.postal_code ?? undefined,
    isDefault: row.is_default,
  };
}

// addresses has no public "list everyone" policy — only user_id = auth.uid()
// — so reading it from a Server Component needs supabaseAdmin with an
// explicit userId filter, same convention as orders/wishlist/follows.
export async function getAddressesForUser(userId: string): Promise<AddressRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("addresses")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAddressesForUser(${userId}) failed: ${error.message}`);
  }
  return (data as AddressRow[]).map(toAddressRecord);
}

export async function getAddressById(
  userId: string,
  addressId: string
): Promise<AddressRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("addresses")
    .select("*")
    .eq("user_id", userId)
    .eq("id", addressId)
    .maybeSingle();

  if (error) {
    throw new Error(`getAddressById(${addressId}) failed: ${error.message}`);
  }
  return data ? toAddressRecord(data as AddressRow) : null;
}

export async function getDefaultAddressForUser(userId: string): Promise<AddressRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("addresses")
    .select("*")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  if (error) {
    throw new Error(`getDefaultAddressForUser(${userId}) failed: ${error.message}`);
  }
  return data ? toAddressRecord(data as AddressRow) : null;
}
