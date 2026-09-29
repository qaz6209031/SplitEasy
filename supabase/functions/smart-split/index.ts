// Smart Split Edge Function.
//   POST {action:"interpret", groupId, text, imageDataUrl?}  -> AI interpretation + calculation + issues
//   POST {action:"commit", groupId, expenseId?, description, paidBy, draft} -> recompute, validate, save
// The OpenRouter key lives only here (Supabase secret). Calculation on commit is authoritative;
// numbers sent by the app are ignored and recomputed.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { calculate } from "../_shared/smart-split/calculator.ts";
import { hasBlockingIssues, validate } from "../_shared/smart-split/validate.ts";
import { draftSchema, ModelOutputError, sanitizeModelOutput } from "../_shared/smart-split/schema.ts";
import { ProviderError, providerFromEnv } from "../_shared/smart-split/provider.ts";
import type { Participant, SmartSplitDraft } from "../_shared/smart-split/types.ts";

const MAX_TEXT_LENGTH = 4000;
const MAX_IMAGE_DATA_URL_LENGTH = 7_000_000; // ~5 MB of image bytes once base64-encoded

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fail(status: number, error: string, extra: Record<string, unknown> = {}): Response {
  return json({ error, ...extra }, status);
}

async function loadParticipants(client: SupabaseClient, groupId: string): Promise<Participant[]> {
  const { data, error } = await client
    .from("group_members")
    .select("joined_at, profile:profiles(id, display_name)")
    .eq("group_id", groupId)
    .order("joined_at");
  if (error) throw new Error(error.message);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((row: any) => ({ id: row.profile.id, displayName: row.profile.display_name }));
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return fail(405, "Use POST");

  const authorization = request.headers.get("Authorization");
  if (!authorization) return fail(401, "Not signed in");

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  );
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return fail(401, "Not signed in");
  const userId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid JSON body");
  }

  const groupId = typeof body.groupId === "string" ? body.groupId : "";
  if (!groupId) return fail(400, "groupId is required");

  let participants: Participant[];
  try {
    participants = await loadParticipants(client, groupId);
  } catch (error) {
    return fail(500, `Could not load the group: ${(error as Error).message}`);
  }
  // RLS only returns members of groups the caller belongs to.
  if (!participants.some((p) => p.id === userId)) return fail(403, "You're not a member of this group");
  const order = participants.map((p) => p.id);

  if (body.action === "interpret") {
    const text = typeof body.text === "string" ? body.text : "";
    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : null;
    if (!text.trim() && !imageDataUrl) return fail(400, "Describe the expense or attach an image");
    if (text.length > MAX_TEXT_LENGTH) return fail(400, "That description is too long");
    if (imageDataUrl && (!imageDataUrl.startsWith("data:image/") || imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH)) {
      return fail(400, "The image is too large or not a supported format");
    }

    const { data: allowed, error: quotaError } = await client.rpc("claim_smart_split_quota");
    if (quotaError) return fail(500, quotaError.message);
    if (!allowed) return fail(429, "You've used Smart Split a lot in the last hour. Try again later.", { retryable: false });

    try {
      const provider = providerFromEnv(Deno.env);
      const raw = await provider.interpret({ text, imageDataUrl, participants, currentUserId: userId });
      const draft = sanitizeModelOutput(raw, participants);
      const calculation = calculate(draft, order);
      const issues = validate(draft, calculation, order);
      return json({ draft, calculation, issues, provider: provider.name });
    } catch (error) {
      if (error instanceof ProviderError) {
        // Raw provider details go to the function logs, not to the user.
        console.error(`[smart-split] ${error.message}`);
        const message = error.message.startsWith("Smart Split isn't configured")
          ? error.message
          : error.retryable
          ? "Smart Split is having trouble right now. Please try again in a moment."
          : "Smart Split isn't available right now. You can still add the expense manually.";
        // SMART_SPLIT_DEBUG=1 (temporary secret) exposes the provider's error text for troubleshooting.
        const debug = Deno.env.get("SMART_SPLIT_DEBUG") === "1" ? { detail: error.message } : {};
        return fail(502, message, { retryable: error.retryable, ...debug });
      }
      if (error instanceof ModelOutputError) {
        const debug = Deno.env.get("SMART_SPLIT_DEBUG") === "1" ? { detail: error.message } : {};
        return fail(502, "Smart Split couldn't understand the AI response. Please try again.", {
          retryable: true,
          ...debug,
        });
      }
      console.error(error);
      return fail(500, "Something went wrong in Smart Split", { retryable: true });
    }
  }

  if (body.action === "commit") {
    const parsed = draftSchema.safeParse(body.draft);
    if (!parsed.success) return fail(400, `Invalid draft: ${parsed.error.issues[0]?.message}`);
    const draft = parsed.data as SmartSplitDraft;

    const paidBy = typeof body.paidBy === "string" ? body.paidBy : "";
    if (!order.includes(paidBy)) return fail(400, "The payer must be in the group");
    const expenseId = typeof body.expenseId === "string" ? body.expenseId : null;
    const description = (typeof body.description === "string" ? body.description.trim() : "") ||
      draft.merchant || "Smart Split";

    const calculation = calculate(draft, order);
    const issues = validate(draft, calculation, order);
    if (hasBlockingIssues(issues)) return fail(422, "Fix the highlighted items before saving", { issues });

    const { data, error } = await client.rpc("save_expense_shares", {
      p_expense_id: expenseId,
      p_group_id: groupId,
      p_description: description.slice(0, 100),
      p_amount_cents: calculation.computedTotalCents,
      p_paid_by: paidBy,
      p_shares: calculation.perParticipant.map((p) => ({ user_id: p.participantId, amount_cents: p.totalCents })),
      p_split_details: { ...draft, paidByParticipantId: paidBy },
    });
    if (error) return fail(400, error.message);
    return json({ expenseId: data, calculation, issues });
  }

  return fail(400, "Unknown action");
});
