import Foundation

struct Payment: Hashable, Identifiable {
    let from: UUID
    let to: UUID
    let amountCents: Int

    var id: String { "\(from)-\(to)-\(amountCents)" }
}

enum DebtSimplifier {
    /// Reduces net balances to a small set of payments: repeatedly match the person who owes the most
    /// with the person owed the most. Produces at most (people with non-zero balance − 1) payments.
    static func simplify(_ balances: [UUID: Int]) -> [Payment] {
        // Sorting by uuid string as a tie-breaker keeps the output stable between reloads.
        var creditors = balances.filter { $0.value > 0 }.map { (id: $0.key, amount: $0.value) }
        var debtors = balances.filter { $0.value < 0 }.map { (id: $0.key, amount: -$0.value) }
        let order: ((id: UUID, amount: Int), (id: UUID, amount: Int)) -> Bool = {
            $0.amount != $1.amount ? $0.amount > $1.amount : $0.id.uuidString < $1.id.uuidString
        }

        var payments: [Payment] = []
        while true {
            creditors.sort(by: order)
            debtors.sort(by: order)
            guard let creditor = creditors.first, let debtor = debtors.first else { break }

            let amount = min(creditor.amount, debtor.amount)
            payments.append(Payment(from: debtor.id, to: creditor.id, amountCents: amount))

            creditors[0].amount -= amount
            debtors[0].amount -= amount
            creditors.removeAll { $0.amount == 0 }
            debtors.removeAll { $0.amount == 0 }
        }
        return payments
    }
}
