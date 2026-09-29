// Validation of a Smart Split draft + its calculation. Errors block saving; warnings are shown.
// Mirrored in SplitEasy/Domain/SmartSplit/SmartSplitValidator.swift.

import type { Calculation, Issue, SmartSplitDraft } from "./types.ts";

export const LOW_CONFIDENCE = 0.6;

function dollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

function normalizedName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function validate(draft: SmartSplitDraft, calculation: Calculation, participantOrder: string[]): Issue[] {
  const issues: Issue[] = [];
  const known = new Set(participantOrder);

  for (const item of draft.items) {
    const label = item.name.trim() || "An item";
    if (item.totalPriceCents === null) {
      issues.push({ code: "missing_price", severity: "error", message: `${label} needs a price.`, itemIds: [item.id] });
    } else if (item.totalPriceCents - (item.discountCents ?? 0) < 0) {
      issues.push({
        code: "missing_price",
        severity: "error",
        message: `${label}'s discount is larger than its price.`,
        itemIds: [item.id],
      });
    }
    if (item.assignedParticipantIds.length === 0) {
      issues.push({
        code: "missing_assignment",
        severity: "error",
        message: `Choose who ${label} is for.`,
        itemIds: [item.id],
      });
    }
    if (item.assignedParticipantIds.some((id) => !known.has(id))) {
      issues.push({
        code: "unknown_participant",
        severity: "error",
        message: `${label} is assigned to someone who isn't in this group.`,
        itemIds: [item.id],
      });
    }
    if (item.confidence < LOW_CONFIDENCE) {
      issues.push({
        code: "low_confidence",
        severity: "warning",
        message: `Double-check ${label}; Smart Split wasn't sure about it.`,
        itemIds: [item.id],
      });
    }
  }

  for (const ambiguity of draft.ambiguities) {
    if (!ambiguity.resolved) {
      issues.push({
        code: "unresolved_ambiguity",
        severity: "error",
        message: ambiguity.message,
        itemIds: ambiguity.itemIds,
      });
    }
  }

  // Same name and price twice is often a double-read receipt line; flag it, never drop it.
  const seen = new Map<string, string>();
  for (const item of draft.items) {
    if (item.totalPriceCents === null) continue;
    const key = `${normalizedName(item.name)}|${item.totalPriceCents}`;
    const first = seen.get(key);
    if (first) {
      issues.push({
        code: "possible_duplicate",
        severity: "warning",
        message: `${item.name} appears twice at ${dollars(item.totalPriceCents)}. Remove one if it's a duplicate.`,
        itemIds: [first, item.id],
      });
    } else {
      seen.set(key, item.id);
    }
  }

  const everythingAllocated = calculation.excludedItemIds.length === 0;
  const itemSum = draft.items.reduce((sum, item) => sum + (item.totalPriceCents ?? 0) - (item.discountCents ?? 0), 0);

  if (everythingAllocated && calculation.computedTotalCents <= 0) {
    issues.push({
      code: "non_positive_total",
      severity: "error",
      message: "The total must be more than $0.",
      itemIds: [],
    });
  }

  const shareSum = calculation.perParticipant.reduce((sum, p) => sum + p.totalCents, 0);
  if (shareSum !== calculation.computedTotalCents) {
    issues.push({
      code: "shares_do_not_reconcile",
      severity: "error",
      message: `Shares add up to ${dollars(shareSum)} but the total is ${dollars(calculation.computedTotalCents)}.`,
      itemIds: [],
    });
  }

  if (everythingAllocated && draft.subtotalCents !== null && draft.subtotalCents !== itemSum) {
    issues.push({
      code: "subtotal_mismatch",
      severity: "warning",
      message: `Items add up to ${dollars(itemSum)}, but the stated subtotal is ${dollars(draft.subtotalCents)} ` +
        `(off by ${dollars(Math.abs(itemSum - draft.subtotalCents))}). Check for a missing or misread item.`,
      itemIds: [],
    });
  }

  if (everythingAllocated && draft.totalCents !== null && draft.totalCents !== calculation.computedTotalCents) {
    issues.push({
      code: "total_mismatch",
      severity: "warning",
      message: `Receipt total is ${dollars(draft.totalCents)}, calculated ${dollars(calculation.computedTotalCents)} ` +
        `(off by ${dollars(Math.abs(draft.totalCents - calculation.computedTotalCents))}).`,
      itemIds: [],
    });
  }

  if (draft.confidence < LOW_CONFIDENCE && draft.items.length > 0) {
    issues.push({
      code: "low_confidence",
      severity: "warning",
      message: "Smart Split wasn't confident reading this. Please review every item.",
      itemIds: [],
    });
  }

  return issues;
}

export function hasBlockingIssues(issues: Issue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
