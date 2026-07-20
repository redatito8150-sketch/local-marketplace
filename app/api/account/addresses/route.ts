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

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const body: AddressInput = await request.json();
  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // A brand-new account's first address becomes the default automatically
  // — otherwise every account would need a separate "set default" click
  // just to make checkout prefill work at all.
  const { count: existingCount } = await supabaseAdmin
    .from("addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data, error } = await supabaseAdmin
    .from("addresses")
    .insert({
      user_id: user.id,
      label: body.label?.trim() || "Home",
      first_name: body.firstName.trim(),
      last_name: body.lastName.trim(),
      phone: body.phone.trim(),
      address_line: body.addressLine.trim(),
      city: body.city.trim(),
      governorate: body.governorate.trim(),
      is_default: (existingCount ?? 0) === 0,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}
