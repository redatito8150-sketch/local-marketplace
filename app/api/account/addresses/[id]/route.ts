import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

interface AddressInput {
  label?: string;
  firstName: string;
  lastName: string;
  phone: string;
  addressLine: string;
  city: string;
  governorate: string;
}

function validate(body: Partial<AddressInput>): string | null {
  if (!body.firstName?.trim()) return "First name is required";
  if (!body.lastName?.trim()) return "Last name is required";
  if (!body.phone?.trim()) return "Phone is required";
  if (!body.addressLine?.trim()) return "Address is required";
  if (!body.city?.trim()) return "City is required";
  if (!body.governorate?.trim()) return "Governorate is required";
  return null;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("addresses")
    .delete()
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
