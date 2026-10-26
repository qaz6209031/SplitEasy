-- Free-plan projects are paused after a week without database activity. A GitHub Actions job
-- (.github/workflows/supabase-keepalive.yml) calls keep_alive() every 4 hours: small writes, which
-- count as activity. It touches only this table's single row, never user data.

create table public.keep_alive (
  id boolean primary key default true check (id),
  pinged_at timestamptz not null default now()
);
insert into public.keep_alive default values;

-- Not readable or writable through the API; only keep_alive() touches it.
alter table public.keep_alive enable row level security;
revoke all on public.keep_alive from anon, authenticated;

create function public.keep_alive()
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  update public.keep_alive set pinged_at = now() where id returning pinged_at;
$$;

revoke execute on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon;
