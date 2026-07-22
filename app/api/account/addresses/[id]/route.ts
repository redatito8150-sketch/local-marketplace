import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AddressLabel } from "@/types";

const VALID_LABELS: AddressLabel[] = ["Home", "Work", "Other"];

interface AddressInput {
  label?: string;
  firstName: string;
  lastName: string;
  phone: string;
  addressLine: string;
  city: string;
  governorate: string;
  buildingNumber?: string;
  floor?: string;
  apartment?: string;
  landmark?: string;
  deliveryInstructions?: string;
  postalCode?: string;
}

function validate(body: Partial<AddressInput>): string | null {
  if (!body.firstName?.trim()) return "First name is required";
  if (!body.lastName?.trim()) return "Last name is required";
  if (!body.phone?.trim()) return "Phone is required";
  if (!body.addressLine?.trim()) return "Address is required";
  if (!body.city?.trim()) return "City is required";
  if (!body.governorate?.trim()) return "Governorate is required";
  if (body.label && !VALID_LABELS.includes(body.label as AddressLabel)) return "Invalid label";
  return null;
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const body: AddressInput = await request.json();
  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("addresses")
    .update({
      label: body.label?.trim() || "Home",
      first_name: body.firstName.trim(),
      last_name: body.lastName.trim(),
      phone: body.phone.trim(),
      address_line: body.addressLine.trim(),
      city: body.city.trim(),
      governorate: body.governorate.trim(),
      building_number: body.buildingNumber?.trim() || null,
      floor: body.floor?.trim() || null,
      apartment: body.apartment?.trim() || null,
      landmark: body.landmark?.trim() || null,
      delivery_instructions: body.deliveryInstructions?.trim() || null,
      postal_code: body.postalCode?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("addresses")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id, is_default");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  // Deleting the default address must not leave the account with zero
  // defaults — promote the most recently added remaining address instead.
  const deletedWasDefault = data[0].is_default;
  if (deletedWasDefault) {
    const { data: candidate } = await supabaseAdmin
      .from("addresses")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (candidate) {
      await supabaseAdmin
        .from("addresses")
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq("id", candidate.id)
        .eq("user_id", user.id);
    }
  }

  return NextResponse.json({ ok: true });
}
