import SwiftUI

struct GroupDetailView: View {
    @Environment(AuthService.self) private var auth
    @State private var model: GroupDetailModel
    @State private var tab = Tab.expenses
    @State private var editor: ExpenseEditor?
    @State private var expenseToDelete: Expense?
    @State private var showSmartSplit = false
    @State private var smartSplitEdit: SmartSplitReviewModel?
    /// Set when the user leaves Smart Split for manual entry; the form opens once the sheet is gone.
    @State private var openManualAfterSmartSplit = false

    private enum Tab: String, CaseIterable {
        case expenses = "Expenses"
        case balances = "Balances"
    }

    /// `expense == nil` means adding a new one.
    private struct ExpenseEditor: Identifiable {
        let expense: Expense?
        var id: UUID { expense?.id ?? UUID(uuidString: "00000000-0000-0000-0000-000000000000")! }
    }

    init(group: ExpenseGroup) {
        _model = State(initialValue: GroupDetailModel(group: group))
    }

    var body: some View {
        List {
            Section {
                Picker("View", selection: $tab) {
                    ForEach(Tab.allCases, id: \.self) { Text($0.rawValue) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            if model.hasLoaded && model.members.count < 2 {
                InviteBanner(code: model.group.inviteCode, shareText: shareText)
            }

            switch tab {
            case .expenses: expensesSection
            case .balances:
                BalancesSection(model: model, currentUserId: auth.userId)
            }
        }
        .navigationTitle(model.group.name)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: shareText) {
                    Label("Invite", systemImage: "person.badge.plus")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 10) {
                Button {
                    showSmartSplit = true
                } label: {
                    Label("Smart Split", systemImage: "sparkles")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)

                Button {
                    editor = ExpenseEditor(expense: nil)
                } label: {
                    Image(systemName: "plus")
                        .font(.headline)
                        .padding(.vertical, 6)
                        .padding(.horizontal, 4)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Add expense manually")
            }
            .disabled(model.members.isEmpty)
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
        .refreshable { await model.load() }
        .task { await model.load() }
        .sheet(item: $editor) { editor in
            if let userId = auth.userId {
                ExpenseFormView(
                    groupId: model.group.id,
                    members: model.members,
                    currentUserId: userId,
                    expense: editor.expense
                ) {
                    await model.load()
                }
            }
        }
        .sheet(isPresented: $showSmartSplit, onDismiss: {
            if openManualAfterSmartSplit {
                openManualAfterSmartSplit = false
                editor = ExpenseEditor(expense: nil)
            }
        }) {
            if let userId = auth.userId {
                SmartSplitFlowView(
                    groupId: model.group.id,
                    members: model.members,
                    currentUserId: userId,
                    onSaved: {
                        await model.load()
                        showSmartSplit = false
                    },
                    onManualEntry: { openManualAfterSmartSplit = true }
                )
            }
        }
        .sheet(item: $smartSplitEdit) { reviewModel in
            NavigationStack {
                SmartSplitReviewView(model: reviewModel) {
                    await model.load()
                    smartSplitEdit = nil
                }
            }
        }
        // A centered alert rather than a confirmation popover: presenting from a row whose
        // swipe action is still closing fails, and a screen-level popover points at the wrong place.
        .alert(
            "Delete \"\(expenseToDelete?.description ?? "")\"?",
            isPresented: Binding(get: { expenseToDelete != nil }, set: { if !$0 { expenseToDelete = nil } }),
            presenting: expenseToDelete
        ) { expense in
            Button("Delete", role: .destructive) {
                Task { await model.delete(expense) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("This updates everyone's balances.")
        }
        .alert("Something went wrong", isPresented: $model.errorMessage.isPresent) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
    }

    /// Smart Split expenses reopen in the review screen so their item breakdown isn't flattened
    /// into an equal split by the manual form.
    private func open(_ expense: Expense) {
        if let details = expense.splitDetails, let userId = auth.userId {
            smartSplitEdit = SmartSplitReviewModel(
                groupId: model.group.id,
                members: model.members,
                currentUserId: userId,
                draft: details,
                expense: expense
            )
        } else {
            editor = ExpenseEditor(expense: expense)
        }
    }

    private var shareText: String {
        "Join my group \"\(model.group.name)\" on SplitEasy with invite code \(model.group.inviteCode)"
    }

    @ViewBuilder
    private var expensesSection: some View {
        if model.hasLoaded && model.expenses.isEmpty {
            ContentUnavailableView(
                "No expenses yet",
                systemImage: "receipt",
                description: Text("Tap Smart Split and describe what you bought, or add it manually with +.")
            )
            .listRowBackground(Color.clear)
        } else {
            Section {
                ForEach(model.expenses) { expense in
                    Button {
                        open(expense)
                    } label: {
                        ExpenseRow(
                            expense: expense,
                            payerName: model.name(for: expense.paidBy, currentUserId: auth.userId)
                        )
                    }
                    .tint(.primary)
                    .swipeActions {
                        Button("Delete", systemImage: "trash", role: .destructive) {
                            expenseToDelete = expense
                        }
                    }
                }
            }
        }
    }
}

private struct ExpenseRow: View {
    let expense: Expense
    let payerName: String

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(expense.description).font(.body)
                    if expense.splitDetails != nil {
                        Image(systemName: "sparkles")
                            .font(.caption)
                            .foregroundStyle(.purple)
                            .accessibilityLabel("Smart Split")
                    }
                }
                Text("\(payerName) paid · \(expense.createdAt.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(Money.format(cents: expense.amountCents)).font(.body.monospacedDigit())
        }
    }
}

private struct InviteBanner: View {
    let code: String
    let shareText: String

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Text("Invite friends to this group").font(.headline)
                Text("Share this code. Friends enter it with Join with Code.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                HStack {
                    Text(code)
                        .font(.title.monospaced().bold())
                        .textSelection(.enabled)
                    Spacer()
                    // Text-only label: the default ShareLink icon didn't render inside a prominent button.
                    ShareLink(item: shareText) {
                        Text("Share")
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(.vertical, 4)
        }
    }
}
