import Foundation
import Observation

/// Editable Smart Split result. Every edit recomputes shares with `SmartSplitCalculator` instantly;
/// saving sends the draft to the server, which recomputes authoritatively.
@Observable
@MainActor
final class SmartSplitReviewModel {
    let groupId: UUID
    let members: [Profile]
    let currentUserId: UUID
    /// Set when editing an existing Smart Split expense.
    let expenseId: UUID?

    var draft: SmartSplitDraft
    /// Snapshot used to warn before throwing away edits.
    private let originalDraft: SmartSplitDraft
    var description: String
    var paidBy: UUID
    var isSaving = false
    var errorMessage: String?

    init(
        groupId: UUID,
        members: [Profile],
        currentUserId: UUID,
        draft: SmartSplitDraft,
        expense: Expense? = nil
    ) {
        self.groupId = groupId
        self.members = members
        self.currentUserId = currentUserId
        self.expenseId = expense?.id
        self.draft = draft
        self.originalDraft = draft
        self.description = expense?.description ?? draft.merchant ?? ""
        let suggestedPayer = draft.paidByParticipantId.flatMap(UUID.init(uuidString:))
        // A name that was generated from the items stays a live suggestion (placeholder), so it
        // follows later item edits instead of being frozen as a typed description.
        if let expense, expense.description == Self.suggestedDescription(for: draft) {
            self.description = ""
        }
        self.paidBy = expense?.paidBy
            ?? suggestedPayer.flatMap { id in members.contains { $0.id == id } ? id : nil }
            ?? currentUserId
    }

    var participantOrder: [String] { members.map(\.id.participantId) }

    var hasEdits: Bool { draft != originalDraft }

    /// Sum of every priced item as listed, including ones not assigned to anyone yet.
    /// (The per-person calculation only includes items it can allocate.)
    var listedSubtotalCents: Int {
        draft.items.reduce(0) { $0 + max(0, ($1.totalPriceCents ?? 0) - ($1.discountCents ?? 0)) }
    }

    var listedTotalCents: Int {
        listedSubtotalCents - (draft.discountCents ?? 0) + (draft.taxCents ?? 0) + (draft.tipCents ?? 0)
            + (draft.feeCents ?? 0) + (draft.shippingCents ?? 0)
    }

    /// Used when the user leaves the description empty, so the list doesn't fill with "Smart Split" rows.
    var suggestedDescription: String { Self.suggestedDescription(for: draft) }

    nonisolated static func suggestedDescription(for draft: SmartSplitDraft) -> String {
        if let merchant = draft.merchant, !merchant.isEmpty { return merchant }
        let names = draft.items.map { $0.name.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        switch names.count {
        case 0: return "Smart Split"
        case 1: return names[0]
        case 2: return "\(names[0]) & \(names[1])"
        default: return "\(names[0]), \(names[1]) & \(names.count - 2) more"
        }
    }

    var calculation: SmartSplitCalculation {
        SmartSplitCalculator.calculate(draft, participantOrder: participantOrder)
    }

    var issues: [SmartSplitIssue] {
        SmartSplitValidator.validate(draft, calculation: calculation, participantOrder: participantOrder)
    }

    var blockingIssues: [SmartSplitIssue] { issues.filter { $0.severity == .error } }
    var warnings: [SmartSplitIssue] { issues.filter { $0.severity == .warning } }
    var canSave: Bool { blockingIssues.isEmpty && !isSaving }
    var openAmbiguities: [SmartSplitAmbiguity] { draft.ambiguities.filter { !$0.resolved } }

    func name(for participantId: String) -> String {
        guard let member = members.first(where: { $0.id.participantId == participantId }) else { return "Unknown" }
        return member.id == currentUserId ? "You" : member.displayName
    }

    func names(for ids: [String]) -> String {
        let ordered = participantOrder.filter(ids.contains)
        if ordered.count == members.count && members.count > 1 { return "Everyone" }
        return ordered.map(name(for:)).joined(separator: " • ")
    }

    func issues(for itemId: String) -> [SmartSplitIssue] {
        issues.filter { $0.itemIds.contains(itemId) && $0.code != "unresolved_ambiguity" }
    }

    // MARK: Edits

    func index(of itemId: String) -> Int? { draft.items.firstIndex { $0.id == itemId } }

    func updateItem(_ itemId: String, _ change: (inout SmartSplitItem) -> Void) {
        guard let index = index(of: itemId) else { return }
        change(&draft.items[index])
        draft.items[index].needsPrice = draft.items[index].totalPriceCents == nil
        draft.items[index].needsAssignment = draft.items[index].assignedParticipantIds.isEmpty
    }

    func setPrice(_ itemId: String, cents: Int?) {
        updateItem(itemId) { item in
            item.totalPriceCents = cents
            let quantity = max(item.quantity, 1)
            item.unitPriceCents = cents.flatMap { $0 % quantity == 0 ? $0 / quantity : nil }
        }
    }

    func setQuantity(_ itemId: String, _ quantity: Int) {
        updateItem(itemId) { item in
            let quantity = max(1, quantity)
            // Keep the per-unit price when it's known; the line total follows the quantity.
            if let unit = item.unitPriceCents, item.totalPriceCents == unit * item.quantity {
                item.totalPriceCents = unit * quantity
            }
            item.quantity = quantity
        }
    }

    func setAssignees(_ itemId: String, _ ids: Set<String>) {
        updateItem(itemId) { $0.assignedParticipantIds = participantOrder.filter(ids.contains) }
    }

    func addItem() -> String {
        let existing = Set(draft.items.map(\.id))
        var n = draft.items.count + 1
        while existing.contains("item_\(n)") { n += 1 }
        let id = "item_\(n)"
        draft.items.append(.blank(id: id))
        return id
    }

    func deleteItem(_ itemId: String) {
        draft.items.removeAll { $0.id == itemId }
        for index in draft.ambiguities.indices {
            draft.ambiguities[index].itemIds.removeAll { $0 == itemId }
            if draft.ambiguities[index].itemIds.isEmpty && draft.ambiguities[index].kind != "other" {
                draft.ambiguities[index].resolved = true
            }
        }
    }

    /// Applying an option assigns its people to the ambiguity's items and marks it resolved.
    func resolve(_ ambiguityId: String, with option: SmartSplitAmbiguityOption?) {
        guard let index = draft.ambiguities.firstIndex(where: { $0.id == ambiguityId }) else { return }
        if let option {
            for itemId in draft.ambiguities[index].itemIds {
                setAssignees(itemId, Set(option.participantIds))
            }
        }
        draft.ambiguities[index].resolved = true
    }

    func save() async -> Bool {
        isSaving = true
        defer { isSaving = false }
        do {
            var toSave = draft
            toSave.paidByParticipantId = paidBy.participantId
            try await SmartSplitService.commit(
                groupId: groupId,
                expenseId: expenseId,
                description: description.trimmingCharacters(in: .whitespaces).isEmpty
                    ? suggestedDescription
                    : description.trimmingCharacters(in: .whitespaces),
                paidBy: paidBy,
                draft: toSave
            )
            return true
        } catch let failure as SmartSplitService.Failure {
            errorMessage = failure.issues.isEmpty
                ? failure.message
                : ([failure.message] + failure.issues.map { "• \($0.message)" }).joined(separator: "\n")
            return false
        } catch {
            errorMessage = userMessage(for: error)
            return false
        }
    }
}
