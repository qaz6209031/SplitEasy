-- Smart Split: unequal per-person shares, the reviewed item breakdown, and a per-user AI quota.

-- The reviewed Smart Split draft (items, charges, assignments). Null for manually entered expenses.
alter table public.expenses add column split_details jsonb;

-- Saving an equal split through the manual form drops any previous Smart Split breakdown.
create or replace function public.save_expense(
  p_expense_id uuid,
  p_group_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_paid_by uuid,
  p_participant_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count int;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  v_count := coalesce(array_length(p_participant_ids, 1), 0);
  if v_count = 0 then
    raise exception 'Choose at least one person to split with';
  end if;
  if v_count <> (select count(distinct x) from unnest(p_participant_ids) x) then
    raise exception 'Duplicate participants';
  end if;
  if exists (
    select 1 from unnest(array_append(p_participant_ids, p_paid_by)) u
    where not exists (
      select 1 from public.group_members m where m.group_id = p_group_id and m.user_id = u
    )
  ) then
    raise exception 'Everyone on the expense must be in the group';
  end if;

  if p_expense_id is null then
    insert into public.expenses (group_id, description, amount_cents, paid_by, created_by)
    values (p_group_id, trim(p_description), p_amount_cents, p_paid_by, auth.uid())
    returning id into v_id;
  else
    update public.expenses
       set description = trim(p_description),
           amount_cents = p_amount_cents,
           paid_by = p_paid_by,
           split_details = null,
           updated_at = now()
     where id = p_expense_id and group_id = p_group_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Expense not found';
    end if;
    delete from public.expense_splits where expense_id = v_id;
  end if;

  insert into public.expense_splits (expense_id, user_id, amount_cents)
  select v_id,
         p.user_id,
         p_amount_cents / v_count + case when p.ord <= p_amount_cents % v_count then 1 else 0 end
    from unnest(p_participant_ids) with ordinality as p(user_id, ord);

  return v_id;
end;
$$;

-- Inserts (p_expense_id null) or updates an expense with explicit per-person shares.
-- p_shares: [{"user_id": uuid, "amount_cents": int}], must add up exactly to p_amount_cents.
create function public.save_expense_shares(
  p_expense_id uuid,
  p_group_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_paid_by uuid,
  p_shares jsonb,
  p_split_details jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'Shares are required';
  end if;

  drop table if exists pg_temp._shares;
  create temp table _shares on commit drop as
    select (s ->> 'user_id')::uuid as user_id, (s ->> 'amount_cents')::bigint as amount_cents
      from jsonb_array_elements(p_shares) s;

  if exists (select 1 from _shares where user_id is null or amount_cents is null or amount_cents < 0) then
    raise exception 'Every share needs a person and a non-negative amount';
  end if;
  if (select count(*) from _shares) <> (select count(distinct user_id) from _shares) then
    raise exception 'Duplicate participants';
  end if;
  if (select sum(amount_cents) from _shares) <> p_amount_cents then
    raise exception 'Shares must add up to the expense total';
  end if;
  if not exists (select 1 from _shares where amount_cents > 0) then
    raise exception 'At least one person must owe something';
  end if;
  if exists (
    select 1 from (select user_id from _shares union select p_paid_by) u
    where not exists (
      select 1 from public.group_members m where m.group_id = p_group_id and m.user_id = u.user_id
    )
  ) then
    raise exception 'Everyone on the expense must be in the group';
  end if;

  if p_expense_id is null then
    insert into public.expenses (group_id, description, amount_cents, paid_by, created_by, split_details)
    values (p_group_id, trim(p_description), p_amount_cents, p_paid_by, auth.uid(), p_split_details)
    returning id into v_id;
  else
    update public.expenses
       set description = trim(p_description),
           amount_cents = p_amount_cents,
           paid_by = p_paid_by,
           split_details = p_split_details,
           updated_at = now()
     where id = p_expense_id and group_id = p_group_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Expense not found';
    end if;
    delete from public.expense_splits where expense_id = v_id;
  end if;

  insert into public.expense_splits (expense_id, user_id, amount_cents)
  select v_id, user_id, amount_cents from _shares where amount_cents > 0;

  return v_id;
end;
$$;

-- Per-user rate limit for AI calls (cost and abuse control).
create table public.smart_split_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index smart_split_calls_user_time_idx on public.smart_split_calls (user_id, created_at);
alter table public.smart_split_calls enable row level security;
revoke all on public.smart_split_calls from anon, authenticated;

-- Records a call and returns true if the caller is under 30 calls in the last hour.
create function public.claim_smart_split_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent int;
begin
  if auth.uid() is null then
    return false;
  end if;
  select count(*) into v_recent
    from public.smart_split_calls
   where user_id = auth.uid() and created_at > now() - interval '1 hour';
  if v_recent >= 30 then
    return false;
  end if;
  insert into public.smart_split_calls (user_id) values (auth.uid());
  return true;
end;
$$;

revoke execute on function
  public.save_expense_shares(uuid, uuid, text, bigint, uuid, jsonb, jsonb),
  public.claim_smart_split_quota()
from public, anon;

grant execute on function
  public.save_expense_shares(uuid, uuid, text, bigint, uuid, jsonb, jsonb),
  public.claim_smart_split_quota()
to authenticated;
