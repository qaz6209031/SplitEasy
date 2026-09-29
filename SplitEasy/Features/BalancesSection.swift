import SwiftUI

/// Each member's net balance. Repayments only appear once the group is settling up (at the end):
/// while active there's a "Settle Up" call to action instead; once settled, the payment history remains.
struct BalancesSection: View {
    let model: GroupDetailModel
    let currentUserId: UUID?
    let onSettleUp: () -> Void
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

        if model.group.status == .active {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Done adding expenses?")
                        .font(.headline)
                    Text("Settle Up locks the group and shows the fewest payments needed for everyone to pay each other back.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    // Text only: SF Symbols inside a prominent button rendered in the fill color here.
                    Button(action: onSettleUp) {
                        HStack(spacing: 8) {
                            if model.isUpdatingStatus { ProgressView().tint(.white) }
                            Text("Settle Up")
                        }
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.expenses.isEmpty || model.isUpdatingStatus)
                }
                .padding(.vertical, 4)
            }
        }

        if model.group.status == .settling {
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
                Text("Pay each other back")
            } footer: {
                if !payments.isEmpty {
                    Text("Debts are simplified so the group needs the fewest payments. Mark each one once the money is sent.")
                }
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
