-- Expenses can be split equally, by exact amounts, by percentages or by shares. The app works out
-- each person's amount; save_expense_split checks it adds up and stores what was typed, so editing
-- the expense shows the same percentages or shares again.

alter table public.expenses
  add column split_method text not null default 'equal'
  check (split_method in ('equal', 'exact', 'percent', 'shares'));

-- The percentage or share count typed for this person. Null for equal and exact splits.
alter table public.expense_splits
  add column split_value numeric check (split_value is null or split_value > 0);

-- p_splits: [{ "user_id": uuid, "amount_cents": int, "split_value": number | null }, ...]
create function public.save_expense_split(
  p_expense_id uuid,
  p_group_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_paid_by uuid,
  p_split_method text,
  p_splits jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count int;
  v_distinct int;
  v_sum bigint;
  v_min bigint;
  v_max bigint;
  v_value_sum numeric;
  v_bad_values int;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;
  perform public.assert_group_active(p_group_id);
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if p_split_method is null or p_split_method not in ('equal', 'exact', 'percent', 'shares') then
    raise exception 'Unknown split method';
  end if;
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' then
    raise exception 'Invalid split';
  end if;

  select count(*), count(distinct s.user_id), sum(s.amount_cents), min(s.amount_cents), max(s.amount_cents),
         sum(s.split_value), count(*) filter (where s.split_value is null or s.split_value <= 0)
    into v_count, v_distinct, v_sum, v_min, v_max, v_value_sum, v_bad_values
    from jsonb_to_recordset(p_splits) as s(user_id uuid, amount_cents bigint, split_value numeric);

  if v_count = 0 then
    raise exception 'Choose at least one person to split with';
  end if;
  if v_distinct <> v_count then
    raise exception 'Duplicate participants';
  end if;
  if v_min is null or v_min < 0 then
    raise exception 'Invalid split amount';
  end if;
  if v_sum <> p_amount_cents then
    raise exception 'The split must add up to the total';
  end if;
  if p_split_method = 'equal' and v_max - v_min > 1 then
    raise exception 'An equal split can differ by at most one cent';
  end if;
  if p_split_method in ('percent', 'shares') and v_bad_values > 0 then
    raise exception 'Every person needs a positive value';
  end if;
  if p_split_method = 'percent' and v_value_sum <> 100 then
    raise exception 'Percentages must add up to 100%%';
  end if;
  if exists (
    select 1
      from (select s.user_id from jsonb_to_recordset(p_splits) as s(user_id uuid)
            union all select p_paid_by) u
     where u.user_id is null or not exists (
       select 1 from public.group_members m where m.group_id = p_group_id and m.user_id = u.user_id
     )
  ) then
    raise exception 'Everyone on the expense must be in the group';
  end if;

  if p_expense_id is null then
    insert into public.expenses (group_id, description, amount_cents, paid_by, created_by, split_method)
    values (p_group_id, trim(p_description), p_amount_cents, p_paid_by, auth.uid(), p_split_method)
    returning id into v_id;
  else
    update public.expenses
       set description = trim(p_description),
           amount_cents = p_amount_cents,
           paid_by = p_paid_by,
           split_method = p_split_method,
           updated_at = now()
     where id = p_expense_id and group_id = p_group_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Expense not found';
    end if;
    delete from public.expense_splits where expense_id = v_id;
  end if;

  insert into public.expense_splits (expense_id, user_id, amount_cents, split_value)
  select v_id, s.user_id, s.amount_cents,
         case when p_split_method in ('percent', 'shares') then s.split_value end
    from jsonb_to_recordset(p_splits) as s(user_id uuid, amount_cents bigint, split_value numeric);

  return v_id;
end;
$$;

-- Older app versions still call save_expense (equal split among the participants). It now goes
-- through save_expense_split, so the split method is reset to 'equal' when they edit an expense.
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
  v_count int := coalesce(array_length(p_participant_ids, 1), 0);
begin
  if v_count = 0 then
    raise exception 'Choose at least one person to split with';
  end if;
  return public.save_expense_split(
    p_expense_id, p_group_id, p_description, p_amount_cents, p_paid_by, 'equal',
    (select jsonb_agg(jsonb_build_object(
              'user_id', p.user_id,
              'amount_cents', p_amount_cents / v_count + case when p.ord <= p_amount_cents % v_count then 1 else 0 end
            ) order by p.ord)
       from unnest(p_participant_ids) with ordinality as p(user_id, ord))
  );
end;
$$;

revoke execute on function public.save_expense_split(uuid, uuid, text, bigint, uuid, text, jsonb) from public, anon;
grant execute on function public.save_expense_split(uuid, uuid, text, bigint, uuid, text, jsonb) to authenticated;
