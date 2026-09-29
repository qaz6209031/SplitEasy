// Deletes the caller's account. For Sign in with Apple users it first revokes their Apple token
// (App Review 5.1.1(v)) using a fresh authorization code from the app. Revocation problems are logged
// but never block the deletion itself.
//   POST {authorizationCode?: string}

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { appleConfigFromEnv, revokeWithAuthorizationCode } from "../_shared/apple/revoke.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Not signed in" }, 401);

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  );
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return json({ error: "Not signed in" }, 401);

  let body: { authorizationCode?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is fine for non-Apple users.
  }

  let apple: string = "not_apple";
  const providers: string[] = userData.user.app_metadata?.providers ?? [userData.user.app_metadata?.provider];
  if (providers.includes("apple")) {
    const code = typeof body.authorizationCode === "string" ? body.authorizationCode : null;
    const outcome = await revokeWithAuthorizationCode(code, appleConfigFromEnv(Deno.env));
    apple = outcome.result;
    if (outcome.result !== "revoked") {
      console.warn(`[delete-account] Apple token not revoked (${outcome.result}): ${outcome.reason}`);
    }
  }

  const { error } = await client.rpc("delete_account");
  if (error) return json({ error: error.message }, 400);
  return json({ deleted: true, apple });
});
