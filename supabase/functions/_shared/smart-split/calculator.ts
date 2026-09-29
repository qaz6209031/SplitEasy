// Deterministic Smart Split money math. Integer cents only; the LLM never decides final amounts.
// Mirrored in SplitEasy/Domain/SmartSplit/SmartSplitCalculator.swift — both run fixtures/calculator.json.

import type { Calculation, ParticipantBreakdown, SmartSplitDraft, SmartSplitItem } from "./types.ts";

/** Net cost of an item after its own discount, or null if it can't be allocated yet. */
export function itemNetCents(item: SmartSplitItem): number | null {
  if (item.totalPriceCents === null) return null;
  const net = item.totalPriceCents - (item.discountCents ?? 0);
  return net >= 0 ? net : null;
}

/** Splits `amount` equally; leftover cents go to the earliest people in `ids` order. */
export function splitEqually(amount: number, ids: string[]): Map<string, number> {
  const result = new Map<string, number>();
  if (ids.length === 0) return result;
  const base = Math.floor(amount / ids.length);
  const remainder = amount - base * ids.length;
  ids.forEach((id, index) => result.set(id, base + (index < remainder ? 1 : 0)));
  return result;
}

/**
 * Splits `amount` proportionally to `weights` using the largest-remainder method.
 * Ties go to the earlier id in `order`. The parts always add up to `amount` exactly.
 */
export function allocateProportionally(
  amount: number,
  weights: Map<string, number>,
  order: string[],
): Map<string, number> {
  const result = new Map<string, number>();
  const ids = order.filter((id) => (weights.get(id) ?? 0) > 0);
  const totalWeight = ids.reduce((sum, id) => sum + weights.get(id)!, 0);
  if (amount === 0 || totalWeight === 0) return result;

  // BigInt keeps amount * weight exact even for very large numbers.
  const bigAmount = BigInt(amount);
  const bigTotal = BigInt(totalWeight);
  const parts = ids.map((id, index) => {
    const product = bigAmount * BigInt(weights.get(id)!);
    return { id, index, floor: Number(product / bigTotal), remainder: Number(product % bigTotal) };
  });
  let leftover = amount - parts.reduce((sum, p) => sum + p.floor, 0);
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const part of byRemainder) {
    if (leftover === 0) break;
    part.floor += 1;
    leftover -= 1;
  }
  for (const part of parts) result.set(part.id, part.floor);
  return result;
}

/**
 * Computes each participant's share.
 * `participantOrder` is the group's member order and decides every tie-break.
 */
export function calculate(draft: SmartSplitDraft, participantOrder: string[]): Calculation {
  const known = new Set(participantOrder);
  const itemsByPerson = new Map<string, number>();
  const involved = new Set<string>();
  const excludedItemIds: string[] = [];

  for (const item of draft.items) {
    const net = itemNetCents(item);
    const assignees = participantOrder.filter((id) => item.assignedParticipantIds.includes(id));
    const hasUnknown = item.assignedParticipantIds.some((id) => !known.has(id));
    if (net === null || assignees.length === 0 || hasUnknown) {
      excludedItemIds.push(item.id);
      continue;
    }
    assignees.forEach((id) => involved.add(id));
    for (const [id, cents] of splitEqually(net, assignees)) {
      itemsByPerson.set(id, (itemsByPerson.get(id) ?? 0) + cents);
    }
  }

  const subtotal = [...itemsByPerson.values()].reduce((a, b) => a + b, 0);
  // Order-level charges follow each person's item subtotal. If every priced item is free,
  // fall back to an equal weighting among the people involved so charges still land somewhere.
  const weights = subtotal > 0
    ? itemsByPerson
    : new Map([...involved].map((id) => [id, 1] as [string, number]));
  const canAllocate = [...weights.values()].some((w) => w > 0);
  const allocate = (amount: number | null) =>
    canAllocate ? allocateProportionally(amount ?? 0, weights, participantOrder) : new Map<string, number>();

  const discount = canAllocate ? draft.discountCents ?? 0 : 0;
  const tax = canAllocate ? draft.taxCents ?? 0 : 0;
  const tip = canAllocate ? draft.tipCents ?? 0 : 0;
  const fee = canAllocate ? draft.feeCents ?? 0 : 0;
  const shipping = canAllocate ? draft.shippingCents ?? 0 : 0;

  const discountBy = allocate(discount);
  const taxBy = allocate(tax);
  const tipBy = allocate(tip);
  const feeBy = allocate(fee);
  const shippingBy = allocate(shipping);

  const perParticipant: ParticipantBreakdown[] = participantOrder
    .filter((id) => involved.has(id))
    .map((id) => {
      const row = {
        participantId: id,
        itemsCents: itemsByPerson.get(id) ?? 0,
        discountCents: discountBy.get(id) ?? 0,
        taxCents: taxBy.get(id) ?? 0,
        tipCents: tipBy.get(id) ?? 0,
        feeCents: feeBy.get(id) ?? 0,
        shippingCents: shippingBy.get(id) ?? 0,
        totalCents: 0,
      };
      row.totalCents = row.itemsCents - row.discountCents + row.taxCents + row.tipCents + row.feeCents +
        row.shippingCents;
      return row;
    });

  return {
    perParticipant,
    computedSubtotalCents: subtotal,
    computedTotalCents: subtotal - discount + tax + tip + fee + shipping,
    excludedItemIds,
  };
}
