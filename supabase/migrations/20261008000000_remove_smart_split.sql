-- Smart Split (AI expense entry) was removed from the app. Expenses it created stay as ordinary
-- expenses with their per-person splits; only the AI-specific objects are dropped.

drop function if exists public.save_expense_shares(uuid, uuid, text, bigint, uuid, jsonb, jsonb);
drop function if exists public.claim_smart_split_quota();
drop table if exists public.smart_split_calls;
alter table public.expenses drop column if exists split_details;

-- save_expense no longer needs to clear split_details on update.
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
