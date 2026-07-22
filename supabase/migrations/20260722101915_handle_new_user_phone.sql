-- Registration now collects a phone number at signup (app/account/page.tsx)
-- and passes it through as auth.users.raw_user_meta_data->>'phone' — mirror
-- it into profiles.phone on account creation, same as full_name already is.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;
