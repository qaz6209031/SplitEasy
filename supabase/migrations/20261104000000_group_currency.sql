-- Each group keeps its money in one currency, chosen when the group is created.
--
-- Amounts keep their scale: every *_cents column is hundredths of the group's currency. A currency
-- without minor units in everyday use (TWD) is only ever entered and split in whole units by the
-- app, so its amounts are multiples of 100. Builds that predate currencies therefore still show the
-- right number for such a group, only with a "$" in front.

alter table public.groups
  add column currency text not null default 'USD'
  constraint groups_currency_iso check (currency ~ '^[A-Z]{3}$');

-- create_group gains an optional currency. Builds that predate currencies call it with p_name only
-- and keep getting US-dollar groups.
drop function public.create_group(text);

create function public.create_group(p_name text, p_currency text default 'USD')
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_group public.groups;
  v_currency text := upper(trim(coalesce(p_currency, 'USD')));
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Unknown currency';
  end if;

  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code
      from generate_series(1, 6);
    exit when not exists (select 1 from public.groups where invite_code = v_code);
  end loop;

  insert into public.groups (name, invite_code, created_by, currency)
  values (trim(p_name), v_code, auth.uid(), v_currency)
  returning * into v_group;

  insert into public.group_members (group_id, user_id) values (v_group.id, auth.uid());
  return v_group;
end;
$$;

revoke execute on function public.create_group(text, text) from public, anon;
grant execute on function public.create_group(text, text) to authenticated;

notify pgrst, 'reload schema';
