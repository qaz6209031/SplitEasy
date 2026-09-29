-- Settle up happens once, at the end: a group moves active -> settling -> settled.
-- While settling or settled, expenses are locked; repayments can only be recorded while settling.

alter table public.groups
  add column status text not null default 'active' check (status in ('active', 'settling', 'settled')),
  add column settle_started_at timestamptz;

-- True when every member's net balance (paid − owed + payments sent − payments received) is zero.
create function public.group_is_settled(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with movements as (
    select e.paid_by as user_id, e.amount_cents as cents from public.expenses e where e.group_id = p_group_id
    union all
    select s.user_id, -s.amount_cents
      from public.expense_splits s join public.expenses e on e.id = s.expense_id
     where e.group_id = p_group_id
    union all
    select st.from_user, st.amount_cents from public.settlements st where st.group_id = p_group_id
    union all
    select st.to_user, -st.amount_cents from public.settlements st where st.group_id = p_group_id
  )
  select not exists (select 1 from movements group by user_id having sum(cents) <> 0);
$$;

create function public.group_status(p_group_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select status from public.groups where id = p_group_id;
$$;

-- Starts the final settle-up. A group that already balances goes straight to settled.
create function public.start_settlement(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;
  v_status := case when public.group_is_settled(p_group_id) then 'settled' else 'settling' end;
  update public.groups
     set status = v_status, settle_started_at = coalesce(settle_started_at, now())
   where id = p_group_id and status = 'active';
  return public.group_status(p_group_id);
end;
$$;

-- Unlocks the group so expenses can be added or changed again. Recorded payments are kept.
create function public.reopen_group(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;
  update public.groups set status = 'active', settle_started_at = null where id = p_group_id;
  return 'active';
end;
$$;

-- Expense writes are only allowed while the group is active.
create function public.assert_group_active(p_group_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.group_status(p_group_id) <> 'active' then
    raise exception 'This group is settling up. Reopen it to change expenses.';
  end if;
end;
$$;

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
  perform public.assert_group_active(p_group_id);
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

create or replace function public.save_expense_shares(
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
  perform public.assert_group_active(p_group_id);
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

-- Deleting expenses is also locked outside the active phase.
drop policy "Members delete expenses" on public.expenses;
create policy "Members delete expenses while the group is active"
  on public.expenses for delete to authenticated
  using (public.is_group_member(group_id) and public.group_status(group_id) = 'active');

-- Repayments are recorded only during the final settle-up; the last one marks the group settled.
create or replace function public.record_settlement(
  p_group_id uuid,
  p_from_user uuid,
  p_to_user uuid,
  p_amount_cents bigint
)
returns public.settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.settlements;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;
  if public.group_status(p_group_id) <> 'settling' then
    raise exception 'Tap Settle Up before recording repayments.';
  end if;
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_from_user)
     or not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_to_user) then
    raise exception 'Both people must be in the group';
  end if;

  insert into public.settlements (group_id, from_user, to_user, amount_cents, created_by)
  values (p_group_id, p_from_user, p_to_user, p_amount_cents, auth.uid())
  returning * into v_settlement;

  if public.group_is_settled(p_group_id) then
    update public.groups set status = 'settled' where id = p_group_id;
  end if;
  return v_settlement;
end;
$$;

revoke execute on function
  public.group_is_settled(uuid),
  public.group_status(uuid),
  public.start_settlement(uuid),
  public.reopen_group(uuid),
  public.assert_group_active(uuid)
from public, anon;

grant execute on function
  public.group_is_settled(uuid),
  public.group_status(uuid),
  public.start_settlement(uuid),
  public.reopen_group(uuid),
  public.assert_group_active(uuid)
to authenticated;
