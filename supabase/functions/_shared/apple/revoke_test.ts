import { assert, assertEquals } from "jsr:@std/assert@1";
import { type AppleConfig, appleConfigFromEnv, buildClientSecret, revokeWithAuthorizationCode } from "./revoke.ts";

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** Throwaway P-256 key pair; the private half is exported as a .p8-style PEM like Apple's. */
async function testConfig(): Promise<{ config: AppleConfig; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let binary = "";
  der.forEach((b) => (binary += String.fromCharCode(b)));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(binary).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  return {
    config: { teamId: "TEAM123456", keyId: "KEY1234567", clientId: "com.example.app", privateKey: pem },
    publicKey: pair.publicKey,
  };
}

Deno.test("client secret is a valid ES256 JWT with Apple's required header and claims", async () => {
  const { config, publicKey } = await testConfig();
  const jwt = await buildClientSecret(config, 1_700_000_000);
  const [header, claims, signature] = jwt.split(".");

  assertEquals(JSON.parse(new TextDecoder().decode(fromBase64url(header))), { alg: "ES256", kid: "KEY1234567" });
  assertEquals(JSON.parse(new TextDecoder().decode(fromBase64url(claims))), {
    iss: "TEAM123456",
    iat: 1_700_000_000,
    exp: 1_700_000_300,
    aud: "https://appleid.apple.com",
    sub: "com.example.app",
  });
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    fromBase64url(signature),
    new TextEncoder().encode(`${header}.${claims}`),
  );
  assert(valid, "signature verifies with the matching public key");
});

Deno.test("config needs every secret; escaped newlines in the key are restored", () => {
  const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });
  assertEquals(appleConfigFromEnv(env({ APPLE_TEAM_ID: "T", APPLE_CLIENT_ID: "C" })), null);
  const config = appleConfigFromEnv(env({
    APPLE_TEAM_ID: "T",
    APPLE_KEY_ID: "K",
    APPLE_CLIENT_ID: "C",
    APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----",
  }));
  assertEquals(config?.privateKey, "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----");
});

Deno.test("missing secrets or code skip revocation without calling Apple", async () => {
  let calls = 0;
  const fakeFetch = (() => {
    calls++;
    return Promise.resolve(new Response("{}"));
  }) as unknown as typeof fetch;
  assertEquals((await revokeWithAuthorizationCode("code", null, fakeFetch)).result, "skipped");
  const { config } = await testConfig();
  assertEquals((await revokeWithAuthorizationCode(null, config, fakeFetch)).result, "skipped");
  assertEquals(calls, 0);
});

Deno.test("exchanges the code and revokes the refresh token", async () => {
  const { config } = await testConfig();
  const requests: { url: string; form: URLSearchParams }[] = [];
  const fakeFetch = ((url: string, init: RequestInit) => {
    requests.push({ url, form: new URLSearchParams(init.body as URLSearchParams) });
    return Promise.resolve(
      url.endsWith("/auth/token")
        ? new Response(JSON.stringify({ refresh_token: "r-token", access_token: "a-token" }))
        : new Response(""),
    );
  }) as unknown as typeof fetch;

  const outcome = await revokeWithAuthorizationCode("auth-code", config, fakeFetch);
  assertEquals(outcome.result, "revoked");
  assertEquals(requests.map((r) => r.url), ["https://appleid.apple.com/auth/token", "https://appleid.apple.com/auth/revoke"]);
  assertEquals(requests[0].form.get("grant_type"), "authorization_code");
  assertEquals(requests[0].form.get("code"), "auth-code");
  assertEquals(requests[0].form.get("client_id"), "com.example.app");
  assertEquals(requests[1].form.get("token"), "r-token");
  assertEquals(requests[1].form.get("token_type_hint"), "refresh_token");
  assert(requests[1].form.get("client_secret")!.split(".").length === 3);
});

Deno.test("Apple errors are reported, not thrown", async () => {
  const { config } = await testConfig();
  const fakeFetch = (() => Promise.resolve(new Response("invalid_grant", { status: 400 }))) as unknown as typeof fetch;
  const outcome = await revokeWithAuthorizationCode("expired", config, fakeFetch);
  assertEquals(outcome.result, "failed");
  assert(outcome.reason!.includes("400"));
});
