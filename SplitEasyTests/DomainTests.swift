import Foundation
import Testing
@testable import SplitEasy

private let a = UUID(uuidString: "00000000-0000-0000-0000-00000000000A")!
private let b = UUID(uuidString: "00000000-0000-0000-0000-00000000000B")!
private let c = UUID(uuidString: "00000000-0000-0000-0000-00000000000C")!
private let d = UUID(uuidString: "00000000-0000-0000-0000-00000000000D")!

private func expense(_ amount: Int, paidBy: UUID, among people: [UUID]) -> Expense {
    let shares = BalanceCalculator.equalSplit(amountCents: amount, among: people.count)
    return Expense(
        id: UUID(), groupId: UUID(), description: "x", amountCents: amount, paidBy: paidBy,
        createdAt: .now, splits: zip(people, shares).map { ExpenseSplit(userId: $0, amountCents: $1) }
    )
}

private func settlement(_ amount: Int, from: UUID, to: UUID) -> Settlement {
    Settlement(id: UUID(), groupId: UUID(), fromUser: from, toUser: to, amountCents: amount, createdAt: .now)
}

@Suite struct EqualSplitTests {
    @Test func evenSplit() {
        #expect(BalanceCalculator.equalSplit(amountCents: 900, among: 3) == [300, 300, 300])
    }

    @Test func leftoverCentsGoToFirstPeople() {
        #expect(BalanceCalculator.equalSplit(amountCents: 1000, among: 3) == [334, 333, 333])
        #expect(BalanceCalculator.equalSplit(amountCents: 101, among: 4) == [26, 25, 25, 25])
    }

    @Test func sharesAlwaysAddUpToTotal() {
        for amount in [1, 7, 99, 1001, 123_457] {
            for count in 1...7 {
                #expect(BalanceCalculator.equalSplit(amountCents: amount, among: count).reduce(0, +) == amount)
            }
        }
    }
}

@Suite struct BalanceCalculatorTests {
    @Test func payerIsOwedOthersShares() {
        let balances = BalanceCalculator.netBalances(
            expenses: [expense(3000, paidBy: a, among: [a, b, c])], settlements: []
        )
        #expect(balances[a] == 2000)
        #expect(balances[b] == -1000)
        #expect(balances[c] == -1000)
    }

    @Test func settlementsReduceDebt() {
        let balances = BalanceCalculator.netBalances(
            expenses: [expense(3000, paidBy: a, among: [a, b, c])],
            settlements: [settlement(1000, from: b, to: a)]
        )
        #expect(balances[a] == 1000)
        #expect(balances[b] == 0)
        #expect(balances[c] == -1000)
    }

    @Test func balancesSumToZero() {
        let balances = BalanceCalculator.netBalances(
            expenses: [expense(1001, paidBy: a, among: [a, b, c]), expense(250, paidBy: c, among: [b, d])],
            settlements: [settlement(100, from: d, to: c)]
        )
        #expect(balances.values.reduce(0, +) == 0)
    }
}

@Suite struct DebtSimplifierTests {
    @Test func chainCollapsesToOnePayment() {
        // A owes B $10, B owes C $10  →  A pays C $10.
        let balances = BalanceCalculator.netBalances(
            expenses: [expense(1000, paidBy: b, among: [a]), expense(1000, paidBy: c, among: [b])],
            settlements: []
        )
        #expect(DebtSimplifier.simplify(balances) == [Payment(from: a, to: c, amountCents: 1000)])
    }

    @Test func settledGroupNeedsNoPayments() {
        #expect(DebtSimplifier.simplify([a: 0, b: 0]).isEmpty)
        #expect(DebtSimplifier.simplify([:]).isEmpty)
    }

    @Test func paymentsSettleEveryBalance() {
        let balances: [UUID: Int] = [a: 5000, b: -2000, c: -2500, d: -500]
        let payments = DebtSimplifier.simplify(balances)

        var remaining = balances
        for payment in payments {
            #expect(payment.amountCents > 0)
            remaining[payment.from, default: 0] += payment.amountCents
            remaining[payment.to, default: 0] -= payment.amountCents
        }
        #expect(remaining.values.allSatisfy { $0 == 0 })
        #expect(payments.count <= balances.filter { $0.value != 0 }.count - 1)
    }

    @Test func fewerPaymentsThanPairwiseDebts() {
        // Everyone paid for one dinner for all four: 12 pairwise debts, but net balances need far fewer.
        let people = [a, b, c, d]
        let expenses = [
            expense(4000, paidBy: a, among: people), expense(2000, paidBy: b, among: people),
            expense(1200, paidBy: c, among: people), expense(800, paidBy: d, among: people),
        ]
        let payments = DebtSimplifier.simplify(BalanceCalculator.netBalances(expenses: expenses, settlements: []))
        #expect(payments.count <= 3)
    }
}

@Suite struct MoneyTests {
    @Test func formatsAsUSD() {
        #expect(Money.format(cents: 1234) == "$12.34")
        #expect(Money.format(cents: 123_456) == "$1,234.56")
        #expect(Money.format(cents: 5) == "$0.05")
    }

    @Test func parsesDollarInput() {
        #expect(Money.cents(from: "12") == 1200)
        #expect(Money.cents(from: "12.5") == 1250)
        #expect(Money.cents(from: "$1,234.56") == 123_456)
        #expect(Money.cents(from: "0.01") == 1)
        #expect(Money.cents(from: "12,50") == 1250)
    }

    @Test func rejectsInvalidInput() {
        #expect(Money.cents(from: "") == nil)
        #expect(Money.cents(from: "0") == nil)
        #expect(Money.cents(from: "abc") == nil)
        #expect(Money.cents(from: "1.234") == nil)
        #expect(Money.cents(from: "1.2.3") == nil)
        #expect(Money.cents(from: "-5") == nil)
    }
}
