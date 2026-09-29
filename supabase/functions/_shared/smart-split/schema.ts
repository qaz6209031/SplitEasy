// The JSON Schema the model must follow, and runtime validation/sanitizing of what comes back.
// Nothing from the model is trusted until it passes through `sanitizeModelOutput`.

import { z } from "npm:zod@3.23.8";
import type { Ambiguity, Participant, SmartSplitDraft, SmartSplitItem } from "./types.ts";

const nullableCents = { type: ["integer", "null"] } as const;

/** Strict-mode JSON Schema for OpenRouter `response_format` (every key required; nulls for unknowns). */
export const MODEL_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "merchant", "currency", "paidByParticipantId", "items", "subtotalCents", "taxCents", "tipCents",
    "feeCents", "shippingCents", "discountCents", "totalCents", "ambiguities", "missingInformation", "confidence",
  ],
  properties: {
    merchant: { type: ["string", "null"], description: "Store or merchant name if known." },
    currency: { type: "string", enum: ["USD"] },
    paidByParticipantId: {
      type: ["string", "null"],
      description: "Participant id of whoever paid for the whole purchase, only if the user said so.",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "name", "quantity", "unitPriceCents", "totalPriceCents", "discountCents",
          "assignedParticipantIds", "source", "confidence", "needsPrice", "needsAssignment",
        ],
        properties: {
          id: { type: "string", description: "item_1, item_2, ..." },
          name: { type: "string" },
          quantity: { type: "integer", minimum: 1 },
          unitPriceCents: nullableCents,
          totalPriceCents: { ...nullableCents, description: "Line total in cents. null if no price was given." },
          discountCents: { ...nullableCents, description: "Coupon/discount applied to this item only, positive." },
          assignedParticipantIds: { type: "array", items: { type: "string" } },
          source: { type: "string", enum: ["text", "image", "both"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          needsPrice: { type: "boolean" },
          needsAssignment: { type: "boolean" },
        },
      },
    },
    subtotalCents: nullableCents,
    taxCents: nullableCents,
    tipCents: nullableCents,
    feeCents: nullableCents,
    shippingCents: nullableCents,
    discountCents: { ...nullableCents, description: "Order-level discount, positive number." },
    totalCents: nullableCents,
    ambiguities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "message", "itemIds", "options"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["participant", "item", "price", "other"] },
          message: { type: "string", description: "Short question for the user." },
          itemIds: { type: "array", items: { type: "string" } },
          options: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "participantIds"],
              properties: {
                label: { type: "string" },
                participantIds: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
    missingInformation: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

const cents = z.number().int().nullable();
const confidence = z.number().min(0).max(1).catch(0.5);

const modelItem = z.object({
  id: z.string().min(1),
  name: z.string(),
  quantity: z.number().int().catch(1),
  unitPriceCents: cents,
  totalPriceCents: cents,
  discountCents: cents.optional().default(null),
  assignedParticipantIds: z.array(z.string()),
  source: z.enum(["text", "image", "both"]).catch("text"),
  confidence,
  needsPrice: z.boolean(),
  needsAssignment: z.boolean(),
});

const modelAmbiguity = z.object({
  id: z.string().min(1),
  kind: z.enum(["participant", "item", "price", "other"]).catch("other"),
  message: z.string().min(1),
  itemIds: z.array(z.string()),
  options: z.array(z.object({ label: z.string(), participantIds: z.array(z.string()) })),
});

export const modelOutputSchema = z.object({
  merchant: z.string().nullable(),
  currency: z.literal("USD").catch("USD"),
  paidByParticipantId: z.string().nullable().optional().default(null),
  items: z.array(modelItem),
  subtotalCents: cents,
  taxCents: cents,
  tipCents: cents,
  feeCents: cents,
  shippingCents: cents,
  discountCents: cents,
  totalCents: cents,
  ambiguities: z.array(modelAmbiguity),
  missingInformation: z.array(z.string()),
  confidence,
});

/** Absent keys (Swift omits nil) are treated as null. */
const optCents = z.number().int().nullish().transform((v) => v ?? null);

/** Full draft as sent back by the app on commit (after the user's edits). */
export const draftSchema = z.object({
  merchant: z.string().nullish().transform((v) => v ?? null),
  currency: z.literal("USD"),
  paidByParticipantId: z.string().nullish().transform((v) => v ?? null),
  items: z.array(z.object({
    id: z.string().min(1),
    name: z.string(),
    quantity: z.number().int().min(1),
    unitPriceCents: optCents,
    totalPriceCents: optCents,
    discountCents: optCents,
    assignedParticipantIds: z.array(z.string()),
    splitType: z.literal("equal"),
    weights: z.record(z.number()).nullish().transform((v) => v ?? null),
    source: z.enum(["text", "image", "both"]),
    confidence: z.number().min(0).max(1),
    needsPrice: z.boolean(),
    needsAssignment: z.boolean(),
  })).max(200),
  subtotalCents: optCents,
  taxCents: optCents,
  tipCents: optCents,
  feeCents: optCents,
  shippingCents: optCents,
  discountCents: optCents,
  totalCents: optCents,
  ambiguities: z.array(modelAmbiguity.extend({ resolved: z.boolean() })),
  missingInformation: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export class ModelOutputError extends Error {}

const nonNegative = (value: number | null) => (value === null || value < 0 ? null : value);

/**
 * Parses and cleans raw model output against the group's real participants.
 * - Unknown participant ids are removed and surfaced as an unresolved ambiguity (never guessed).
 * - Negative money becomes null (needs a price) instead of being trusted.
 * - totalPriceCents is derived from unit × quantity only when both were given.
 */
export function sanitizeModelOutput(raw: unknown, participants: Participant[]): SmartSplitDraft {
  const parsed = modelOutputSchema.safeParse(typeof raw === "string" ? safeJson(raw) : raw);
  if (!parsed.success) {
    throw new ModelOutputError(`Model output did not match the schema: ${parsed.error.issues[0]?.message}`);
  }
  const output = parsed.data;
  const known = new Set(participants.map((p) => p.id));
  const ambiguities: Ambiguity[] = output.ambiguities.map((a) => ({
    ...a,
    options: a.options
      .map((o) => ({ ...o, participantIds: o.participantIds.filter((id) => known.has(id)) }))
      .filter((o) => o.participantIds.length > 0),
    resolved: false,
  }));

  const usedIds = new Set<string>();
  const items: SmartSplitItem[] = output.items.map((item, index) => {
    let id = item.id;
    if (usedIds.has(id)) id = `${id}_${index + 1}`;
    usedIds.add(id);

    const quantity = Math.max(1, item.quantity);
    const unitPriceCents = nonNegative(item.unitPriceCents);
    let totalPriceCents = nonNegative(item.totalPriceCents);
    if (item.totalPriceCents === null && unitPriceCents !== null) {
      totalPriceCents = unitPriceCents * quantity;
    }

    const assigned = [...new Set(item.assignedParticipantIds)];
    const valid = assigned.filter((pid) => known.has(pid));
    if (valid.length < assigned.length) {
      ambiguities.push({
        id: `unknown_participant_${id}`,
        kind: "participant",
        message: `Who is "${item.name}" for?`,
        itemIds: [id],
        options: participants.map((p) => ({ label: p.displayName, participantIds: [p.id] })),
        resolved: false,
      });
    }

    return {
      id,
      name: item.name.trim() || `Item ${index + 1}`,
      quantity,
      unitPriceCents,
      totalPriceCents,
      discountCents: nonNegative(item.discountCents ?? null),
      assignedParticipantIds: valid,
      splitType: "equal",
      weights: null,
      source: item.source,
      confidence: item.confidence,
      needsPrice: totalPriceCents === null,
      needsAssignment: valid.length === 0,
    };
  });

  return {
    merchant: output.merchant?.trim() || null,
    currency: "USD",
    paidByParticipantId: output.paidByParticipantId && known.has(output.paidByParticipantId)
      ? output.paidByParticipantId
      : null,
    items,
    subtotalCents: nonNegative(output.subtotalCents),
    taxCents: nonNegative(output.taxCents),
    tipCents: nonNegative(output.tipCents),
    feeCents: nonNegative(output.feeCents),
    shippingCents: nonNegative(output.shippingCents),
    discountCents: nonNegative(output.discountCents),
    totalCents: nonNegative(output.totalCents),
    ambiguities,
    missingInformation: output.missingInformation,
    confidence: output.confidence,
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ModelOutputError("Model output was not valid JSON");
  }
}
