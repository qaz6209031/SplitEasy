// Sign in with Apple token revocation (App Review guideline 5.1.1(v)).
// The app sends a fresh authorization code when the user deletes their account; we exchange it for a
// refresh token and revoke it, so no Apple tokens ever need to be stored.

export interface AppleConfig {
  teamId: string;
  keyId: string;
  clientId: string;
  /** Contents of the .p8 key (PKCS#8 PEM). */
  privateKey: string;
}

type Env = { get(key: string): string | undefined };

/** Returns null unless every Apple secret is set (revocation is then skipped, never blocking deletion). */
export function appleConfigFromEnv(env: Env): AppleConfig | null {
  const teamId = env.get("APPLE_TEAM_ID");
  const keyId = env.get("APPLE_KEY_ID");
  const clientId = env.get("APPLE_CLIENT_ID");
  const privateKey = env.get("APPLE_PRIVATE_KEY");
  if (!teamId || !keyId || !clientId || !privateKey) return null;
  // Secrets set from a one-line value may carry literal "\n" sequences.
  return { teamId, keyId, clientId, privateKey: privateKey.replace(/\\n/g, "\n") };
}

function base64url(bytes: Uint8Array | string): string {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let binary = "";
  data.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

/** ES256 client secret JWT Apple requires for /auth/token and /auth/revoke (valid 5 minutes). */
export async function buildClientSecret(config: AppleConfig, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = { alg: "ES256", kid: config.keyId };
  const claims = {
    iss: config.teamId,
    iat: nowSeconds,
    exp: nowSeconds + 300,
    aud: "https://appleid.apple.com",
    sub: config.clientId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(config.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // WebCrypto returns the raw r||s signature, which is exactly the JWS ES256 format.
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

export type RevokeResult = "revoked" | "skipped" | "failed";

/** Exchanges the authorization code for a refresh token and revokes it. Never throws. */
export async function revokeWithAuthorizationCode(
  authorizationCode: string | null,
  config: AppleConfig | null,
  fetchImpl: typeof fetch = fetch,
): Promise<{ result: RevokeResult; reason?: string }> {
  if (!config) return { result: "skipped", reason: "Apple secrets not configured" };
  if (!authorizationCode) return { result: "skipped", reason: "no authorization code" };
  try {
    const clientSecret = await buildClientSecret(config);
    const tokenResponse = await fetchImpl("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) {
      return { result: "failed", reason: `token exchange ${tokenResponse.status}: ${(await tokenResponse.text()).slice(0, 200)}` };
    }
    const tokens = await tokenResponse.json();
    const token: string | undefined = tokens.refresh_token ?? tokens.access_token;
    if (!token) return { result: "failed", reason: "no token in Apple response" };

    const revokeResponse = await fetchImpl("https://appleid.apple.com/auth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: tokens.refresh_token ? "refresh_token" : "access_token",
      }),
    });
    if (!revokeResponse.ok) {
      return { result: "failed", reason: `revoke ${revokeResponse.status}: ${(await revokeResponse.text()).slice(0, 200)}` };
    }
    return { result: "revoked" };
  } catch (error) {
    return { result: "failed", reason: (error as Error).message };
  }
}
