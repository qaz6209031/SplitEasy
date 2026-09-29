-- SplitEasy initial schema: profiles, groups, members, expenses, splits, settlements.
-- All money is stored as integer cents (USD).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- No FK to auth.users on purpose: when a user deletes their account the profile
-- stays behind as "Deleted user" so other members' group history remains intact.
create table public.profiles (
  id uuid primary key,
  display_name text not null default '',
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  invite_code char(6) not null unique,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_id_idx on public.group_members (user_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 100),
  amount_cents bigint not null check (amount_cents > 0),
  paid_by uuid not null references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_group_id_idx on public.expenses (group_id);

create table public.expense_splits (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  amount_cents bigint not null check (amount_cents >= 0),
  primary key (expense_id, user_id)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_user uuid not null references public.profiles (id),
  to_user uuid not null references public.profiles (id),
  amount_cents bigint not null check (amount_cents > 0),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index settlements_group_id_idx on public.settlements (group_id);

-- ---------------------------------------------------------------------------
-- Profile creation on sign-up
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(trim(new.raw_user_meta_data ->> 'full_name'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer avoids RLS recursion on group_members)
-- ---------------------------------------------------------------------------

create function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create function public.shares_group_with(p_user_id uuid)
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
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;

create policy "Read own profile or profiles of group mates"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));

create policy "Update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and not is_deleted);

create policy "Members read their groups"
  on public.groups for select to authenticated
  using (public.is_group_member(id));

create policy "Members read group membership"
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

create policy "Members read expenses"
  on public.expenses for select to authenticated
  using (public.is_group_member(group_id));

create policy "Members delete expenses"
  on public.expenses for delete to authenticated
  using (public.is_group_member(group_id));

create policy "Members read expense splits"
  on public.expense_splits for select to authenticated
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_id and public.is_group_member(e.group_id)
  ));

create policy "Members read settlements"
  on public.settlements for select to authenticated
  using (public.is_group_member(group_id));

-- Only display_name is user-editable on profiles.
revoke update on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated;

-- Writes to groups, members, expenses, splits and settlements go through the RPCs below.
revoke insert, update on public.groups, public.group_members, public.expenses,
  public.expense_splits, public.settlements from authenticated, anon;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.create_group(p_name text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_group public.groups;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
      into v_code
      from generate_series(1, 6);
    exit when not exists (select 1 from public.groups where invite_code = v_code);
  end loop;

  insert into public.groups (name, invite_code, created_by)
  values (trim(p_name), v_code, auth.uid())
  returning * into v_group;

  insert into public.group_members (group_id, user_id) values (v_group.id, auth.uid());
  return v_group;
end;
$$;

create function public.join_group(p_code text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into v_group from public.groups where invite_code = upper(trim(p_code));
  if not found then
    raise exception 'No group found for that invite code';
  end if;

  insert into public.group_members (group_id, user_id)
  values (v_group.id, auth.uid())
  on conflict do nothing;
  return v_group;
end;
$$;

-- Inserts (p_expense_id null) or updates an expense and rewrites its equal split.
-- Leftover cents go to the first participants in the given order.
create function public.save_expense(
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

create function public.record_settlement(
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
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_from_user)
     or not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_to_user) then
    raise exception 'Both people must be in the group';
  end if;

  insert into public.settlements (group_id, from_user, to_user, amount_cents, created_by)
  values (p_group_id, p_from_user, p_to_user, p_amount_cents, auth.uid())
  returning * into v_settlement;
  return v_settlement;
end;
$$;

-- Removes the sign-in; keeps an anonymized profile so shared history still adds up.
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  update public.profiles set display_name = 'Deleted user', is_deleted = true where id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function
  public.handle_new_user(),
  public.is_group_member(uuid),
  public.shares_group_with(uuid),
  public.create_group(text),
  public.join_group(text),
  public.save_expense(uuid, uuid, text, bigint, uuid, uuid[]),
  public.record_settlement(uuid, uuid, uuid, bigint),
  public.delete_account()
from public, anon;

grant execute on function
  public.is_group_member(uuid),
  public.shares_group_with(uuid),
  public.create_group(text),
  public.join_group(text),
  public.save_expense(uuid, uuid, text, bigint, uuid, uuid[]),
  public.record_settlement(uuid, uuid, uuid, bigint),
  public.delete_account()
to authenticated;
