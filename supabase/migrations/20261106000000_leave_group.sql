-- Leaving a group, modelled on Venmo's rules: you can leave once you're square with the group, and
-- the group itself goes away only when its last member leaves (there is no "delete for everyone").
--
-- Leaving removes the membership row, so the group drops out of the leaver's list and every existing
-- check ("must be in the group") already keeps them off new expenses and payments. Their past
-- expenses and payments stay, so the group's history and balances don't change.

-- True when the person paid for, shares in, or sent or received a payment in the group.
create function public.in_group_history(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.expenses e where e.group_id = p_group_id and e.paid_by = p_user_id)
      or exists (
        select 1 from public.expense_splits s join public.expenses e on e.id = s.expense_id
         where e.group_id = p_group_id and s.user_id = p_user_id
      )
      or exists (
        select 1 from public.settlements st
         where st.group_id = p_group_id and p_user_id in (st.from_user, st.to_user)
      );
$$;

-- Group mates still see the names of people who left but appear in the group's history.
create or replace function public.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  )
  or exists (
    select 1
    from public.group_members mine
    where mine.user_id = auth.uid()
      and public.in_group_history(mine.group_id, p_user_id)
  );
$$;

-- Net balance of one person in a group, in cents (positive: gets money back).
create function public.member_balance(p_group_id uuid, p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select sum(e.amount_cents) from public.expenses e where e.group_id = p_group_id and e.paid_by = p_user_id), 0)
       - coalesce((
           select sum(s.amount_cents) from public.expense_splits s join public.expenses e on e.id = s.expense_id
            where e.group_id = p_group_id and s.user_id = p_user_id
         ), 0)
       + coalesce((select sum(st.amount_cents) from public.settlements st where st.group_id = p_group_id and st.from_user = p_user_id), 0)
       - coalesce((select sum(st.amount_cents) from public.settlements st where st.group_id = p_group_id and st.to_user = p_user_id), 0);
$$;

-- Leaves the group. Returns 'left', or 'deleted' when you were its last member.
--
-- With others still in the group you can leave when you're in none of its expenses or payments (you
-- joined by mistake), or once the group is settled up. In between, your share could still change,
-- so the group has to settle first. The last member can always leave, which deletes the group.
create function public.leave_group(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  -- Lock the group so two last members leaving at once can't both leave it behind, empty.
  select status into v_status from public.groups where id = p_group_id for update;
  if not found or not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;

  -- Deleted accounts stay on as members (their history keeps their name) but don't count as people left.
  if not exists (
    select 1 from public.group_members m join public.profiles p on p.id = m.user_id
     where m.group_id = p_group_id and m.user_id <> v_uid and not p.is_deleted
  ) then
    delete from public.groups where id = p_group_id;
    return 'deleted';
  end if;

  if public.in_group_history(p_group_id, v_uid)
     and (v_status <> 'settled' or public.member_balance(p_group_id, v_uid) <> 0) then
    raise exception 'Settle up the group before leaving, so everyone''s balances stay right.';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = v_uid;
  return 'left';
end;
$$;

-- A settled group can't be reopened once someone in its history has left: their share could change
-- (an expense edited or deleted) with nobody there to see it or pay it.
create or replace function public.reopen_group(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;
  if exists (
    select 1
    from (
      select e.paid_by as user_id from public.expenses e where e.group_id = p_group_id
      union
      select s.user_id from public.expense_splits s join public.expenses e on e.id = s.expense_id where e.group_id = p_group_id
      union
      select st.from_user from public.settlements st where st.group_id = p_group_id
      union
      select st.to_user from public.settlements st where st.group_id = p_group_id
    ) people
    where not exists (select 1 from public.group_members m where m.group_id = p_group_id and m.user_id = people.user_id)
  ) then
    raise exception 'Someone in these expenses has left the group, so it can''t be reopened. Start a new group instead.';
  end if;
  update public.groups set status = 'active', settle_started_at = null where id = p_group_id;
  return 'active';
end;
$$;

revoke execute on function
  public.in_group_history(uuid, uuid),
  public.member_balance(uuid, uuid),
  public.leave_group(uuid)
from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;

notify pgrst, 'reload schema';
