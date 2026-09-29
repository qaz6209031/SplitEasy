import Foundation

/// Mirror of supabase/functions/_shared/smart-split/validate.ts. Errors block saving; warnings are shown.
enum SmartSplitValidator {
    static let lowConfidence = 0.6

    static func validate(
        _ draft: SmartSplitDraft,
        calculation: SmartSplitCalculation,
        participantOrder: [String]
    ) -> [SmartSplitIssue] {
        var issues: [SmartSplitIssue] = []
        let known = Set(participantOrder)
        func add(_ code: String, _ severity: SmartSplitIssue.Severity, _ message: String, _ itemIds: [String] = []) {
            issues.append(SmartSplitIssue(code: code, severity: severity, message: message, itemIds: itemIds))
        }

        for item in draft.items {
            let label = item.name.trimmingCharacters(in: .whitespaces).isEmpty ? "An item" : item.name
            if let total = item.totalPriceCents {
                if total - (item.discountCents ?? 0) < 0 {
                    add("missing_price", .error, "\(label)'s discount is larger than its price.", [item.id])
                }
            } else {
                add("missing_price", .error, "\(label) needs a price.", [item.id])
            }
            if item.assignedParticipantIds.isEmpty {
                add("missing_assignment", .error, "Choose who \(label) is for.", [item.id])
            }
            if item.assignedParticipantIds.contains(where: { !known.contains($0) }) {
                add("unknown_participant", .error, "\(label) is assigned to someone who isn't in this group.", [item.id])
            }
            if item.confidence < lowConfidence {
                add("low_confidence", .warning, "Double-check \(label); Smart Split wasn't sure about it.", [item.id])
            }
        }

        for ambiguity in draft.ambiguities where !ambiguity.resolved {
            add("unresolved_ambiguity", .error, ambiguity.message, ambiguity.itemIds)
        }

        var seen: [String: String] = [:]
        for item in draft.items {
            guard let total = item.totalPriceCents else { continue }
            let key = "\(normalizedName(item.name))|\(total)"
            if let first = seen[key] {
                add(
                    "possible_duplicate", .warning,
                    "\(item.name) appears twice at \(Money.format(cents: total)). Remove one if it's a duplicate.",
                    [first, item.id]
                )
            } else {
                seen[key] = item.id
            }
        }

        let everythingAllocated = calculation.excludedItemIds.isEmpty
        let itemSum = draft.items.reduce(0) { $0 + ($1.totalPriceCents ?? 0) - ($1.discountCents ?? 0) }

        if everythingAllocated && calculation.computedTotalCents <= 0 {
            add("non_positive_total", .error, "The total must be more than $0.")
        }

        let shareSum = calculation.perParticipant.reduce(0) { $0 + $1.totalCents }
        if shareSum != calculation.computedTotalCents {
            add(
                "shares_do_not_reconcile", .error,
                "Shares add up to \(Money.format(cents: shareSum)) but the total is \(Money.format(cents: calculation.computedTotalCents))."
            )
        }

        if everythingAllocated, let stated = draft.subtotalCents, stated != itemSum {
            add(
                "subtotal_mismatch", .warning,
                "Items add up to \(Money.format(cents: itemSum)), but the stated subtotal is \(Money.format(cents: stated)) "
                    + "(off by \(Money.format(cents: abs(itemSum - stated)))). Check for a missing or misread item."
            )
        }

        if everythingAllocated, let stated = draft.totalCents, stated != calculation.computedTotalCents {
            add(
                "total_mismatch", .warning,
                "Receipt total is \(Money.format(cents: stated)), calculated \(Money.format(cents: calculation.computedTotalCents)) "
                    + "(off by \(Money.format(cents: abs(stated - calculation.computedTotalCents))))."
            )
        }

        if draft.confidence < lowConfidence && !draft.items.isEmpty {
            add("low_confidence", .warning, "Smart Split wasn't confident reading this. Please review every item.")
        }

        return issues
    }

    private static func normalizedName(_ name: String) -> String {
        name.lowercased().filter { $0.isLetter || $0.isNumber }
    }
}
