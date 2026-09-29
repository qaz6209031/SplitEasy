import Foundation

/// Deterministic Smart Split money math, a Swift mirror of
/// supabase/functions/_shared/smart-split/calculator.ts (the server copy is authoritative on save).
/// Both run fixtures/calculator.json so they can't drift apart.
enum SmartSplitCalculator {
    /// Net cost after the item's own discount, or nil if it can't be allocated yet.
    static func itemNetCents(_ item: SmartSplitItem) -> Int? {
        guard let total = item.totalPriceCents else { return nil }
        let net = total - (item.discountCents ?? 0)
        return net >= 0 ? net : nil
    }

    /// Equal split; leftover cents go to the earliest people in `ids` order.
    static func splitEqually(_ amount: Int, among ids: [String]) -> [String: Int] {
        guard !ids.isEmpty else { return [:] }
        let base = amount / ids.count
        let remainder = amount - base * ids.count
        var result: [String: Int] = [:]
        for (index, id) in ids.enumerated() {
            result[id] = base + (index < remainder ? 1 : 0)
        }
        return result
    }

    /// Largest-remainder proportional allocation; ties go to the earlier id in `order`.
    static func allocateProportionally(_ amount: Int, weights: [String: Int], order: [String]) -> [String: Int] {
        let ids = order.filter { (weights[$0] ?? 0) > 0 }
        let totalWeight = ids.reduce(0) { $0 + weights[$1]! }
        guard amount != 0, totalWeight != 0 else { return [:] }

        var parts = ids.enumerated().map { index, id -> (id: String, index: Int, floor: Int, remainder: Int) in
            let product = amount * weights[id]!
            return (id, index, product / totalWeight, product % totalWeight)
        }
        var leftover = amount - parts.reduce(0) { $0 + $1.floor }
        let byRemainder = parts.indices.sorted {
            parts[$0].remainder != parts[$1].remainder
                ? parts[$0].remainder > parts[$1].remainder
                : parts[$0].index < parts[$1].index
        }
        for position in byRemainder where leftover > 0 {
            parts[position].floor += 1
            leftover -= 1
        }
        return Dictionary(uniqueKeysWithValues: parts.map { ($0.id, $0.floor) })
    }

    /// `participantOrder` is the group's member order and decides every tie-break.
    static func calculate(_ draft: SmartSplitDraft, participantOrder: [String]) -> SmartSplitCalculation {
        let known = Set(participantOrder)
        var itemsByPerson: [String: Int] = [:]
        var involved = Set<String>()
        var excluded: [String] = []

        for item in draft.items {
            let assignees = participantOrder.filter { item.assignedParticipantIds.contains($0) }
            let hasUnknown = item.assignedParticipantIds.contains { !known.contains($0) }
            guard let net = itemNetCents(item), !assignees.isEmpty, !hasUnknown else {
                excluded.append(item.id)
                continue
            }
            involved.formUnion(assignees)
            for (id, cents) in splitEqually(net, among: assignees) {
                itemsByPerson[id, default: 0] += cents
            }
        }

        let subtotal = itemsByPerson.values.reduce(0, +)
        // If every priced item is free, weight the people involved equally so charges still land somewhere.
        let weights = subtotal > 0 ? itemsByPerson : Dictionary(uniqueKeysWithValues: involved.map { ($0, 1) })
        let canAllocate = weights.values.contains { $0 > 0 }
        func allocate(_ amount: Int) -> [String: Int] {
            canAllocate ? allocateProportionally(amount, weights: weights, order: participantOrder) : [:]
        }

        let discount = canAllocate ? draft.discountCents ?? 0 : 0
        let tax = canAllocate ? draft.taxCents ?? 0 : 0
        let tip = canAllocate ? draft.tipCents ?? 0 : 0
        let fee = canAllocate ? draft.feeCents ?? 0 : 0
        let shipping = canAllocate ? draft.shippingCents ?? 0 : 0
        let discountBy = allocate(discount)
        let taxBy = allocate(tax)
        let tipBy = allocate(tip)
        let feeBy = allocate(fee)
        let shippingBy = allocate(shipping)

        let perParticipant = participantOrder.filter(involved.contains).map { id in
            let items = itemsByPerson[id] ?? 0
            let d = discountBy[id] ?? 0, t = taxBy[id] ?? 0, tp = tipBy[id] ?? 0
            let f = feeBy[id] ?? 0, s = shippingBy[id] ?? 0
            return SmartSplitParticipantBreakdown(
                participantId: id, itemsCents: items, discountCents: d, taxCents: t, tipCents: tp,
                feeCents: f, shippingCents: s, totalCents: items - d + t + tp + f + s
            )
        }

        return SmartSplitCalculation(
            perParticipant: perParticipant,
            computedSubtotalCents: subtotal,
            computedTotalCents: subtotal - discount + tax + tip + fee + shipping,
            excludedItemIds: excluded
        )
    }
}
