import Foundation

// Mirrors supabase/functions/_shared/smart-split/types.ts. JSON keys are camelCase on both sides,
// and the same shape is stored in `expenses.split_details`. Money is integer cents; nil = not stated.
// Participant ids are lowercase UUID strings (use `UUID.participantId`).

struct SmartSplitItem: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var quantity: Int
    var unitPriceCents: Int?
    var totalPriceCents: Int?
    /// Coupon or discount on this item only.
    var discountCents: Int?
    /// People responsible for this item's cost.
    var assignedParticipantIds: [String]
    var splitType: String
    /// Reserved for custom/percentage splits; unused while `splitType == "equal"`.
    var weights: [String: Double]?
    var source: String
    var confidence: Double
    var needsPrice: Bool
    var needsAssignment: Bool

    static func blank(id: String) -> SmartSplitItem {
        SmartSplitItem(
            id: id, name: "", quantity: 1, unitPriceCents: nil, totalPriceCents: nil, discountCents: nil,
            assignedParticipantIds: [], splitType: "equal", weights: nil, source: "text", confidence: 1,
            needsPrice: true, needsAssignment: true
        )
    }
}

struct SmartSplitAmbiguityOption: Codable, Hashable {
    var label: String
    var participantIds: [String]
}

struct SmartSplitAmbiguity: Codable, Identifiable, Hashable {
    var id: String
    /// "participant", "item", "price" or "other".
    var kind: String
    var message: String
    var itemIds: [String]
    var options: [SmartSplitAmbiguityOption]
    var resolved: Bool
}

struct SmartSplitDraft: Codable, Hashable {
    var merchant: String?
    var currency: String
    var paidByParticipantId: String?
    var items: [SmartSplitItem]
    var subtotalCents: Int?
    var taxCents: Int?
    var tipCents: Int?
    var feeCents: Int?
    var shippingCents: Int?
    /// Order-level discount.
    var discountCents: Int?
    /// Total stated by the user or printed on the receipt.
    var totalCents: Int?
    var ambiguities: [SmartSplitAmbiguity]
    var missingInformation: [String]
    var confidence: Double
}

struct SmartSplitParticipantBreakdown: Codable, Hashable {
    let participantId: String
    let itemsCents: Int
    let discountCents: Int
    let taxCents: Int
    let tipCents: Int
    let feeCents: Int
    let shippingCents: Int
    let totalCents: Int
}

struct SmartSplitCalculation: Codable, Hashable {
    let perParticipant: [SmartSplitParticipantBreakdown]
    let computedSubtotalCents: Int
    let computedTotalCents: Int
    let excludedItemIds: [String]
}

struct SmartSplitIssue: Codable, Hashable {
    enum Severity: String, Codable { case error, warning }

    let code: String
    let severity: Severity
    let message: String
    let itemIds: [String]
}

extension UUID {
    /// Lowercase form used for participant ids in Smart Split JSON (Postgres returns lowercase UUIDs).
    var participantId: String { uuidString.lowercased() }
}
