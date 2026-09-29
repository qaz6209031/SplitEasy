import SwiftUI

/// Each member's net balance, the simplified repayments with "Mark as Paid", and payment history.
struct BalancesSection: View {
    let model: GroupDetailModel
    let currentUserId: UUID?
    @State private var paymentToConfirm: Payment?

    var body: some View {
        let balances = model.balances
        let payments = model.suggestedPayments

        Section("Balances") {
            ForEach(model.members) { member in
                HStack {
                    Text(model.name(for: member.id, currentUserId: currentUserId))
                    Spacer()
                    BalanceLabel(cents: balances[member.id] ?? 0, style: member.id == currentUserId ? .you : .member)
                }
            }
        }

        Section {
            if payments.isEmpty {
                Label {
                    Text("Everyone is settled up")
                } icon: {
                    Image(systemName: "checkmark.circle").accessibilityHidden(true)
                }
                .foregroundStyle(.secondary)
            }
            ForEach(payments) { payment in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(name(payment.from)) → \(objectName(payment.to))")
                        Text(Money.format(cents: payment.amountCents))
                            .font(.headline.monospacedDigit())
                    }
                    Spacer()
                    Button("Mark as Paid") { paymentToConfirm = payment }
                        .buttonStyle(.bordered)
                        // Attached per button so the dialog/popover anchors to the button that opened it.
                        .confirmationDialog(
                            "Record this payment?",
                            isPresented: Binding(
                                get: { paymentToConfirm == payment },
                                set: { if !$0 { paymentToConfirm = nil } }
                            ),
                            titleVisibility: .visible
                        ) {
                            Button("\(name(payment.from)) paid \(objectName(payment.to)) \(Money.format(cents: payment.amountCents))") {
                                Task { await model.markPaid(payment) }
                            }
                        } message: {
                            Text("Only confirm once the money has actually been sent.")
                        }
                }
            }
        } header: {
            Text("Suggested Repayments")
        } footer: {
            if !payments.isEmpty {
                Text("Debts are simplified so the group needs the fewest payments.")
            }
        }

        if !model.settlements.isEmpty {
            Section("Payments") {
                ForEach(model.settlements) { settlement in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(name(settlement.fromUser)) paid \(objectName(settlement.toUser))")
                            Text(settlement.createdAt.formatted(date: .abbreviated, time: .omitted))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(Money.format(cents: settlement.amountCents)).monospacedDigit()
                    }
                    .font(.subheadline)
                }
            }
        }
    }

    private func name(_ id: UUID) -> String {
        model.name(for: id, currentUserId: currentUserId)
    }

    /// Name used mid-sentence ("Alice paid you"), where "You" should be lowercase.
    private func objectName(_ id: UUID) -> String {
        id == currentUserId ? "you" : name(id)
    }
}
