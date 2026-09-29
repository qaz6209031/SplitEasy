import Foundation

enum BalanceCalculator {
    /// Net balance per user in cents. Positive means the group owes them; negative means they owe.
    static func netBalances(expenses: [Expense], settlements: [Settlement]) -> [UUID: Int] {
        var balances: [UUID: Int] = [:]
        for expense in expenses {
            balances[expense.paidBy, default: 0] += expense.amountCents
            for split in expense.splits {
                balances[split.userId, default: 0] -= split.amountCents
            }
        }
        for settlement in settlements {
            balances[settlement.fromUser, default: 0] += settlement.amountCents
            balances[settlement.toUser, default: 0] -= settlement.amountCents
        }
        return balances
    }

    /// Equal split used for previews in the expense form; mirrors `save_expense` in the database.
    static func equalSplit(amountCents: Int, among count: Int) -> [Int] {
        guard count > 0 else { return [] }
        let base = amountCents / count
        let remainder = amountCents % count
        return (0..<count).map { base + ($0 < remainder ? 1 : 0) }
    }
}
