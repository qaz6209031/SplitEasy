-- Before User Created auth hook: new accounts come from Sign in with Apple or Google.
-- Email/password signups are rejected, except the Debug-only developer test accounts.

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_provider text := coalesce(event -> 'user' -> 'app_metadata' ->> 'provider', 'email');
  v_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if v_provider = 'email' and v_email !~ '^dev-(alice|bob|carol)@spliteasy\.dev$' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Please sign up with Apple or Google.'
      )
    );
  end if;
  return '{}'::jsonb;
end;
$$;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
