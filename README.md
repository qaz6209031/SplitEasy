# SplitEasy

A Splitwise-style app for iOS (Android-ready):
- Sign in with Apple or Google.
- Groups joined by invite code.
- Expenses in USD, split equally.
- Settle up once at the end of a trip, with simplified debts.
- Over-the-air updates, so app changes ship without an App Store release.

## Repo layout
| Path | What |
|---|---|
| `mobile/` | The app: Expo SDK 57, Expo Router, TypeScript. **Start with [`mobile/README.md`](mobile/README.md)**: run, test, ship OTA updates, build. |
| `supabase/` | Backend: schema, RLS and RPCs in `migrations/`, the `delete-account` Edge Function, auth config in `config.toml`. |
| `docs/` | Public pages on GitHub Pages (privacy policy, support) and App Store drafts (`docs/app-store/`, not published). |

The Supabase project is `SplitEasy` (ref `eloyohqnvsghwcthfvza`). The root `.env` (git-ignored) holds the database password and the Google OAuth credentials used by the Supabase CLI.

## Google sign-in
Set up and enabled. To recreate it:
1. **Create the OAuth client:** in [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**.
   - Authorized redirect URI: `https://eloyohqnvsghwcthfvza.supabase.co/auth/v1/callback`
   - While the consent screen is in Testing mode, only listed test users can sign in. Switch it to **In production** before launch.
2. **Save the credentials** in the root `.env`:
   ```
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=GOCSPX-...
   ```
3. **Push the config:**
   ```sh
   set -a; . ./.env; set +a; supabase config push --project-ref eloyohqnvsghwcthfvza
   ```

The app opens Supabase's Google sign-in in a browser sheet (PKCE). Google returns to `spliteasy://auth-callback`, which is allowed in `additional_redirect_urls`.

## Account deletion and Apple token revocation
**Settings → Delete Account** calls the `delete-account` Edge Function, which runs the `delete_account` RPC.
- **Apple users:** the app first asks Apple to confirm, which gives a fresh authorization code. The function exchanges it for a refresh token and revokes it (App Review 5.1.1(v)); the app never stores Apple tokens.
- **If revocation fails or isn't configured:** it's logged and the account is still deleted.
- **Secrets:** `APPLE_TEAM_ID`, `APPLE_CLIENT_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` (the `.p8` from Apple Developer → Keys, with Sign in with Apple enabled) are all set.
- **Deploy changes:** `supabase functions deploy delete-account --project-ref eloyohqnvsghwcthfvza --use-api`
- **Test the helpers:** `deno test --allow-read supabase/functions/_shared`

## Database changes
Add a new file in `supabase/migrations/` and run `supabase db push` (the DB password is in `.env`).

## How balances work
- **Splits:** amounts are integer cents. `save_expense` (Postgres) splits equally, with leftover cents going to the first participants.
- **Net balance:** paid − owed + settlements sent − settlements received (`mobile/src/domain/balances.ts`).
- **Simplified debts:** `mobile/src/domain/debts.ts` greedily matches the largest debtor with the largest creditor, which gives at most N−1 payments.
- **Settle up (once, at the end):** a group goes active → settling → settled.
  - Settle Up locks expenses (enforced in Postgres) and shows the simplified payments.
  - "Mark as Paid" records each one, and the last payment marks the group settled.
  - Reopen goes back to active.

## Before App Store release
- **Email sign-up is blocked** by the `before_user_created` auth hook (`public.hook_before_user_created`). Only the Debug-only dev accounts `dev-{alice,bob,carol}@spliteasy.dev` can use email and password; everyone else signs up with Apple or Google.
  - Don't set `[auth.email] enable_signup = false`: the CLI treats that as turning the whole email provider off, which also blocks the dev accounts from signing in.
- **Supabase plan:** free projects pause after 7 days without activity (this already happened once). Upgrade to Pro before real users depend on it.
- **Public pages** (GitHub Pages from `docs/`, also in `mobile/src/lib/links.ts`):
  - Privacy Policy: https://kaichin.dev/SplitEasy/privacy/
  - Support: https://kaichin.dev/SplitEasy/support/
- **Store listing drafts:** `docs/app-store/` (privacy label, listing, review notes).
