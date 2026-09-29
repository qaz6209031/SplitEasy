// Smart Split domain types. All money is integer cents (USD). `null` means "not stated".

export interface Participant {
  id: string;
  displayName: string;
}

export type SplitType = "equal";

export interface SmartSplitItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number | null;
  totalPriceCents: number | null;
  /** Coupon or discount applied to this item only. */
  discountCents: number | null;
  /** People responsible for this item's cost. */
  assignedParticipantIds: string[];
  splitType: SplitType;
  /** Reserved for custom/percentage splits later; ignored while splitType is "equal". */
  weights: Record<string, number> | null;
  source: "text" | "image" | "both";
  confidence: number;
  needsPrice: boolean;
  needsAssignment: boolean;
}

export interface AmbiguityOption {
  label: string;
  participantIds: string[];
}

export interface Ambiguity {
  id: string;
  kind: "participant" | "item" | "price" | "other";
  message: string;
  itemIds: string[];
  options: AmbiguityOption[];
  resolved: boolean;
}

export interface SmartSplitDraft {
  merchant: string | null;
  currency: "USD";
  paidByParticipantId: string | null;
  items: SmartSplitItem[];
  subtotalCents: number | null;
  taxCents: number | null;
  tipCents: number | null;
  feeCents: number | null;
  shippingCents: number | null;
  /** Order-level discount (item-level discounts live on the item). */
  discountCents: number | null;
  /** Total stated by the user or printed on the receipt. */
  totalCents: number | null;
  ambiguities: Ambiguity[];
  missingInformation: string[];
  confidence: number;
}

export interface ParticipantBreakdown {
  participantId: string;
  itemsCents: number;
  discountCents: number;
  taxCents: number;
  tipCents: number;
  feeCents: number;
  shippingCents: number;
  totalCents: number;
}

export interface Calculation {
  perParticipant: ParticipantBreakdown[];
  /** Sum of net item amounts that could be allocated (priced and assigned). */
  computedSubtotalCents: number;
  computedTotalCents: number;
  /** Items left out because they have no price or no assignees. */
  excludedItemIds: string[];
}

export type IssueSeverity = "error" | "warning";

export interface Issue {
  code:
    | "missing_price"
    | "missing_assignment"
    | "unknown_participant"
    | "unresolved_ambiguity"
    | "non_positive_total"
    | "shares_do_not_reconcile"
    | "subtotal_mismatch"
    | "total_mismatch"
    | "possible_duplicate"
    | "low_confidence";
  severity: IssueSeverity;
  message: string;
  itemIds: string[];
}
