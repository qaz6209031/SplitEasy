// TEST-ONLY rule-based interpreter used when SMART_SPLIT_PROVIDER=mock. It understands simple
// "name item price" lines so the app's Smart Split UI can be exercised without an OpenRouter key.
// Production traffic always goes through OpenRouterProvider.

import type { InterpretInput } from "./provider.ts";

const CHARGE_WORDS: Record<string, string> = {
  tax: "taxCents",
  tip: "tipCents",
  fee: "feeCents",
  fees: "feeCents",
  service: "feeCents",
  shipping: "shippingCents",
  delivery: "shippingCents",
  discount: "discountCents",
  coupon: "discountCents",
};
const EVERYONE = new Set(["all", "everyone", "everybody", "shared", "both", "we", "us"]);
const ME = new Set(["me", "i", "my", "mine", "myself"]);
const FILLER = new Set([
  "got", "get", "the", "a", "an", "for", "and", "by", "split", "was", "were", "is", "are", "had", "each",
  "total", "of", "to", "between", "with", "paid", "bought",
]);

/** Receipt the mock "reads" whenever an image is attached. */
const MOCK_RECEIPT = [
  { name: "T-Shirt", cents: 2499 },
  { name: "Mug", cents: 1499 },
  { name: "Magnet", cents: 699 },
  { name: "Snacks", cents: 1150 },
];

function parseCents(token: string): number | null {
  const match = token.replace(/[$,]/g, "").match(/^\d+(\.\d{1,2})?$/);
  return match ? Math.round(parseFloat(match[0]) * 100) : null;
}

export function mockInterpret(input: InterpretInput) {
  const everyone = input.participants.map((p) => p.id);
  const charges: Record<string, number | null> = {
    taxCents: null, tipCents: null, feeCents: null, shippingCents: null, discountCents: null,
  };
  const items: Record<string, unknown>[] = [];
  const ambiguities: Record<string, unknown>[] = [];
  let paidBy: string | null = null;

  const resolveName = (token: string): string[] | "ambiguous" | null => {
    const t = token.toLowerCase().replace(/[^a-z]/g, "");
    if (!t) return null;
    if (ME.has(t)) return [input.currentUserId];
    if (EVERYONE.has(t)) return everyone;
    const exact = input.participants.filter((p) => p.displayName.toLowerCase() === t);
    if (exact.length === 1) return [exact[0].id];
    const prefix = input.participants.filter((p) => p.displayName.toLowerCase().startsWith(t));
    if (prefix.length === 1 && t.length >= 2) return [prefix[0].id];
    if (prefix.length > 1) return "ambiguous";
    return null;
  };

  const receipt = input.imageDataUrl
    ? MOCK_RECEIPT.map((line, i) => ({
      id: `item_${i + 1}`, name: line.name, quantity: 1, unitPriceCents: line.cents, totalPriceCents: line.cents,
      discountCents: null, assignedParticipantIds: [] as string[], source: "image", confidence: 0.9,
      needsPrice: false, needsAssignment: true,
    }))
    : [];
  if (input.imageDataUrl) charges.taxCents = 512;

  for (const rawLine of input.text.split(/[\n;]+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const tokens = line.split(/[\s:,+]+/).filter(Boolean);
    const lower = tokens.map((t) => t.toLowerCase().replace(/[^a-z0-9.$]/g, ""));

    const chargeKey = lower.map((t) => CHARGE_WORDS[t.replace(/[^a-z]/g, "")]).find(Boolean);
    const price = tokens.map(parseCents).filter((c): c is number => c !== null).pop() ?? null;
    if (chargeKey && price !== null) {
      charges[chargeKey] = price;
      continue;
    }
    if (lower.includes("paid") && lower.some((t) => resolveName(t) !== null)) {
      const who = lower.map(resolveName).find((r) => Array.isArray(r) && r.length === 1) as string[] | undefined;
      if (who) paidBy = who[0];
      continue;
    }

    const people = new Set<string>();
    let ambiguousToken: string | null = null;
    const nameWords: string[] = [];
    tokens.forEach((token, i) => {
      if (parseCents(token) !== null) return;
      const resolved = resolveName(token);
      if (resolved === "ambiguous") ambiguousToken = token;
      else if (resolved) resolved.forEach((id) => people.add(id));
      else if (!FILLER.has(lower[i].replace(/[^a-z]/g, ""))) nameWords.push(token.replace(/[.$]/g, ""));
    });
    const name = nameWords.join(" ").trim();

    // With a receipt attached, text lines assign existing receipt items instead of creating new ones.
    const receiptMatch = receipt.find((r) =>
      nameWords.some((w) => w.length >= 3 && r.name.toLowerCase().includes(w.toLowerCase()))
    );
    if (receiptMatch) {
      receiptMatch.assignedParticipantIds = [...people];
      receiptMatch.needsAssignment = people.size === 0;
      receiptMatch.source = "both";
      continue;
    }
    if (!name) continue;

    const id = `item_${receipt.length + items.length + 1}`;
    if (ambiguousToken) {
      const t = (ambiguousToken as string).toLowerCase();
      ambiguities.push({
        id: `ambiguity_${id}`,
        kind: "participant",
        message: `Who does "${ambiguousToken}" refer to?`,
        itemIds: [id],
        options: input.participants
          .filter((p) => p.displayName.toLowerCase().startsWith(t))
          .map((p) => ({ label: p.displayName, participantIds: [p.id] })),
      });
    }
    items.push({
      id, name: name.charAt(0).toUpperCase() + name.slice(1), quantity: 1, unitPriceCents: price,
      totalPriceCents: price, discountCents: null, assignedParticipantIds: [...people], source: "text",
      confidence: 0.9, needsPrice: price === null, needsAssignment: people.size === 0,
    });
  }

  return {
    merchant: input.imageDataUrl ? "Gift Shop" : null,
    currency: "USD",
    paidByParticipantId: paidBy,
    items: [...receipt, ...items],
    subtotalCents: input.imageDataUrl ? 5847 : null,
    ...charges,
    totalCents: input.imageDataUrl ? 6359 : null,
    ambiguities,
    missingInformation: [],
    confidence: 0.9,
  };
}
