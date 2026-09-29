import SwiftUI

/// Add or edit an expense. One payer; the amount is split equally among the selected people.
struct ExpenseFormView: View {
    let groupId: UUID
    let members: [Profile]
    let currentUserId: UUID
    let expense: Expense?
    let onChange: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var description: String
    @State private var amountText: String
    @State private var paidBy: UUID
    @State private var participants: Set<UUID>
    @State private var isSaving = false
    @State private var confirmDelete = false
    @State private var errorMessage: String?
    @FocusState private var descriptionFocused: Bool

    init(
        groupId: UUID,
        members: [Profile],
        currentUserId: UUID,
        expense: Expense?,
        onChange: @escaping () async -> Void
    ) {
        self.groupId = groupId
        self.members = members
        self.currentUserId = currentUserId
        self.expense = expense
        self.onChange = onChange
        _description = State(initialValue: expense?.description ?? "")
        _amountText = State(initialValue: expense.map { String(format: "%.2f", Double($0.amountCents) / 100) } ?? "")
        _paidBy = State(initialValue: expense?.paidBy ?? currentUserId)
        _participants = State(initialValue: expense.map { Set($0.splits.map(\.userId)) } ?? Set(members.map(\.id)))
    }

    private var amountCents: Int? { Money.cents(from: amountText) }

    /// Participants in member order, so leftover cents are assigned predictably.
    private var orderedParticipants: [UUID] {
        members.map(\.id).filter(participants.contains)
    }

    private var isValid: Bool {
        !description.trimmingCharacters(in: .whitespaces).isEmpty && amountCents != nil && !participants.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Description, e.g. Dinner", text: $description)
                        .textInputAutocapitalization(.sentences)
                        .focused($descriptionFocused)
                    HStack {
                        Text("$").foregroundStyle(.secondary)
                        TextField("0.00", text: $amountText)
                            .keyboardType(.decimalPad)
                            .font(.title2.monospacedDigit())
                    }
                } footer: {
                    if !amountText.isEmpty && amountCents == nil {
                        Text("Enter an amount greater than $0, with up to 2 decimal places (e.g. 12.50).")
                            .foregroundStyle(.orange)
                    }
                }

                Section {
                    Picker("Paid by", selection: $paidBy) {
                        ForEach(members) { member in
                            Text(displayName(member)).tag(member.id)
                        }
                    }
                }

                Section {
                    ForEach(members) { member in
                        Button {
                            if participants.contains(member.id) {
                                participants.remove(member.id)
                            } else {
                                participants.insert(member.id)
                            }
                        } label: {
                            HStack {
                                Image(systemName: participants.contains(member.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(participants.contains(member.id) ? Color.accentColor : .secondary)
                                Text(displayName(member))
                                Spacer()
                                if let share = share(for: member.id) {
                                    Text(Money.format(cents: share))
                                        .foregroundStyle(.secondary)
                                        .monospacedDigit()
                                }
                            }
                        }
                        .tint(.primary)
                    }
                } header: {
                    Text("Split equally between")
                } footer: {
                    if participants.isEmpty {
                        Text("Pick at least one person.")
                    }
                }

                if expense != nil {
                    Section {
                        Button("Delete Expense", role: .destructive) { confirmDelete = true }
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .navigationTitle(expense == nil ? "Add Expense" : "Edit Expense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving { ProgressView() } else {
                        Button("Save", action: save).disabled(!isValid)
                    }
                }
            }
            .confirmationDialog("Delete this expense?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete", role: .destructive, action: delete)
            }
            .alert("Couldn't save", isPresented: $errorMessage.isPresent) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
            .interactiveDismissDisabled(isSaving)
            .onAppear { if expense == nil { descriptionFocused = true } }
        }
    }

    private func displayName(_ member: Profile) -> String {
        member.id == currentUserId ? "You" : member.displayName
    }

    private func share(for memberId: UUID) -> Int? {
        guard let amountCents, let index = orderedParticipants.firstIndex(of: memberId) else { return nil }
        return BalanceCalculator.equalSplit(amountCents: amountCents, among: orderedParticipants.count)[index]
    }

    private func save() {
        guard isValid, let amountCents else { return }
        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                try await GroupRepository.saveExpense(
                    expenseId: expense?.id,
                    groupId: groupId,
                    description: description.trimmingCharacters(in: .whitespaces),
                    amountCents: amountCents,
                    paidBy: paidBy,
                    participantIds: orderedParticipants
                )
                await onChange()
                dismiss()
            } catch {
                errorMessage = userMessage(for: error)
            }
        }
    }

    private func delete() {
        guard let expense else { return }
        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                try await GroupRepository.deleteExpense(id: expense.id)
                await onChange()
                dismiss()
            } catch {
                errorMessage = userMessage(for: error)
            }
        }
    }
}

#Preview {
    let me = Profile(id: UUID(), displayName: "Kai", isDeleted: false)
    let members = [me, Profile(id: UUID(), displayName: "Alex", isDeleted: false),
                   Profile(id: UUID(), displayName: "Sam", isDeleted: false)]
    return ExpenseFormView(groupId: UUID(), members: members, currentUserId: me.id, expense: nil) {}
}
