import Foundation
import Observation

@Observable
@MainActor
final class GroupDetailModel {
    var group: ExpenseGroup
    var members: [Profile] = []
    var expenses: [Expense] = []
    var settlements: [Settlement] = []
    var hasLoaded = false
    /// True while Settle Up / Reopen is saving, to show progress and prevent double taps.
    var isUpdatingStatus = false
    var errorMessage: String?

    init(group: ExpenseGroup) {
        self.group = group
    }

    var balances: [UUID: Int] {
        BalanceCalculator.netBalances(expenses: expenses, settlements: settlements)
    }

    var suggestedPayments: [Payment] {
        DebtSimplifier.simplify(balances)
    }

    func name(for userId: UUID, currentUserId: UUID?) -> String {
        if userId == currentUserId { return "You" }
        return members.first { $0.id == userId }?.displayName ?? "Unknown"
    }

    func load() async {
        do {
            let id = group.id
            async let fetchedGroup = GroupRepository.fetchGroup(id: id)
            async let members = GroupRepository.fetchMembers(groupId: id)
            async let expenses = GroupRepository.fetchExpenses(groupId: id)
            async let settlements = GroupRepository.fetchSettlements(groupId: id)
            (self.group, self.members, self.expenses, self.settlements) =
                try await (fetchedGroup, members, expenses, settlements)
        } catch is CancellationError {
            return
        } catch {
            errorMessage = userMessage(for: error)
        }
        hasLoaded = true
    }

    func delete(_ expense: Expense) async {
        do {
            try await GroupRepository.deleteExpense(id: expense.id)
        } catch {
            errorMessage = userMessage(for: error)
        }
        await load()
    }

    func startSettlement() async {
        isUpdatingStatus = true
        defer { isUpdatingStatus = false }
        do {
            try await GroupRepository.startSettlement(groupId: group.id)
        } catch {
            errorMessage = userMessage(for: error)
        }
        await load()
    }

    func reopen() async {
        isUpdatingStatus = true
        defer { isUpdatingStatus = false }
        do {
            try await GroupRepository.reopenGroup(groupId: group.id)
        } catch {
            errorMessage = userMessage(for: error)
        }
        await load()
    }

    func markPaid(_ payment: Payment) async {
        do {
            try await GroupRepository.recordSettlement(groupId: group.id, payment: payment)
        } catch {
            errorMessage = userMessage(for: error)
        }
        await load()
    }
}
