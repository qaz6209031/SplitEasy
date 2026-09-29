import SwiftUI

/// Editable Smart Split result: items with people, charges, per-person totals, and what's left to fix.
/// Nothing is saved until the user taps Save.
struct SmartSplitReviewView: View {
    @Bindable var model: SmartSplitReviewModel
    let onSaved: () async -> Void

    @State private var peoplePickerItemId: String?
    @State private var detailItemId: String?
    /// The item just created with "Add item"; its detail sheet offers Cancel, which removes it again.
    @State private var newItemId: String?
    @State private var confirmDiscard = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let calculation = model.calculation
        let issues = model.issues

        List {
            Section {
                TextField(model.suggestedDescription, text: $model.description)
                    .accessibilityLabel("Description")
                Picker("Paid by", selection: $model.paidBy) {
                    ForEach(model.members) { member in
                        Text(member.id == model.currentUserId ? "You" : member.displayName).tag(member.id)
                    }
                }
            }

            if !model.openAmbiguities.isEmpty {
                Section {
                    ForEach(model.openAmbiguities) { ambiguity in
                        AmbiguityCard(ambiguity: ambiguity) { option in
                            model.resolve(ambiguity.id, with: option)
                        }
                    }
                } header: {
                    Text("Needs your input")
                }
            }

            Section {
                ForEach(model.draft.items) { item in
                    ItemRow(
                        item: item,
                        peopleText: model.names(for: item.assignedParticipantIds),
                        issues: model.issues(for: item.id),
                        name: Binding(
                            get: { model.draft.items.first { $0.id == item.id }?.name ?? "" },
                            set: { newValue in model.updateItem(item.id) { $0.name = newValue } }
                        ),
                        price: Binding(
                            get: { model.draft.items.first { $0.id == item.id }?.totalPriceCents },
                            set: { model.setPrice(item.id, cents: $0) }
                        ),
                        onPickPeople: {
                            hideKeyboard()
                            peoplePickerItemId = item.id
                        },
                        onShowDetails: {
                            hideKeyboard()
                            detailItemId = item.id
                        }
                    )
                    .swipeActions {
                        Button("Delete", systemImage: "trash", role: .destructive) {
                            model.deleteItem(item.id)
                        }
                    }
                }
                Button {
                    hideKeyboard()
                    let id = model.addItem()
                    newItemId = id
                    detailItemId = id
                } label: {
                    Label("Add item", systemImage: "plus.circle")
                }
            } header: {
                Text(model.draft.merchant.map { "Items · \($0)" } ?? "Items")
            }

            ChargesSection(model: model)

            Section("Each person pays") {
                if calculation.perParticipant.isEmpty {
                    Text("Add prices and people to see each share.")
                        .foregroundStyle(.secondary)
                }
                ForEach(calculation.perParticipant, id: \.participantId) { row in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.name(for: row.participantId))
                            Text(breakdown(row))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(Money.format(cents: row.totalCents))
                            .font(.body.monospacedDigit().weight(.semibold))
                    }
                }
            }

            // Item-specific warnings show under their rows; order-level ones (totals, confidence) show here.
            let warnings = issues.filter { $0.severity == .warning && $0.itemIds.isEmpty }
            if !warnings.isEmpty {
                Section {
                    ForEach(warnings, id: \.self) { issue in
                        Label(issue.message, systemImage: "exclamationmark.triangle")
                            .font(.subheadline)
                            .foregroundStyle(.orange)
                    }
                }
            }

            if !model.blockingIssues.isEmpty {
                Section {
                    ForEach(model.blockingIssues, id: \.self) { issue in
                        // Tapping an item problem jumps straight to that item's details.
                        if let itemId = issue.itemIds.first, model.index(of: itemId) != nil {
                            Button {
                                hideKeyboard()
                                detailItemId = itemId
                            } label: {
                                HStack {
                                    Label {
                                        Text(issue.message).foregroundStyle(.primary)
                                    } icon: {
                                        Image(systemName: "exclamationmark.circle").foregroundStyle(.orange)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                .contentShape(Rectangle())
                            }
                            // Plain style so the row isn't tinted with the accent color like a link.
                            .buttonStyle(.plain)
                            .font(.subheadline)
                        } else {
                            Label {
                                Text(issue.message).foregroundStyle(.primary)
                            } icon: {
                                Image(systemName: "exclamationmark.circle").foregroundStyle(.orange)
                            }
                            .font(.subheadline)
                        }
                    }
                } header: {
                    Text("Before you can save")
                }
            }
        }
        // Decimal pads have no return key: scrolling the list puts the keyboard away.
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(model.expenseId == nil ? "✨ Smart Split" : "Edit Smart Split")
        .navigationBarTitleDisplayMode(.inline)
        // In the Smart Split flow, going back to the description would silently drop review edits.
        .navigationBarBackButtonHidden(model.expenseId == nil)
        .toolbar {
            // "Back" in the new-expense flow, "Cancel" when editing; both ask before dropping edits.
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    hideKeyboard()
                    if model.hasEdits { confirmDiscard = true } else { dismiss() }
                } label: {
                    if model.expenseId == nil {
                        Label("Back", systemImage: "chevron.backward")
                            .labelStyle(.titleAndIcon)
                    } else {
                        Text("Cancel")
                    }
                }
                .disabled(model.isSaving)
            }
            ToolbarItem(placement: .confirmationAction) {
                if model.isSaving {
                    ProgressView()
                } else {
                    Button("Save") {
                        hideKeyboard()
                        Task {
                            if await model.save() {
                                await onSaved()
                            }
                        }
                    }
                    .disabled(!model.canSave)
                }
            }
        }
        .sheet(item: Binding(
            get: { peoplePickerItemId.map(IdentifiedString.init) },
            set: { peoplePickerItemId = $0?.id }
        )) { target in
            PeoplePicker(
                members: model.members,
                currentUserId: model.currentUserId,
                itemName: model.draft.items.first { $0.id == target.id }?.name ?? "",
                selection: Set(model.draft.items.first { $0.id == target.id }?.assignedParticipantIds ?? [])
            ) { ids in
                model.setAssignees(target.id, ids)
            }
        }
        .sheet(item: Binding(
            get: { detailItemId.map(IdentifiedString.init) },
            set: { detailItemId = $0?.id }
        )) { target in
            ItemDetailSheet(model: model, itemId: target.id, isNew: target.id == newItemId)
                .onDisappear { newItemId = nil }
        }
        .alert("Discard your changes?", isPresented: $confirmDiscard) {
            Button("Keep Editing", role: .cancel) {}
            Button("Discard", role: .destructive) { dismiss() }
        } message: {
            Text(model.expenseId == nil
                ? "You'll go back to your description. Edits made here will be lost."
                : "Your changes to this expense won't be saved.")
        }
        .alert("Couldn't save", isPresented: $model.errorMessage.isPresent) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
        .interactiveDismissDisabled(model.isSaving || model.hasEdits)
    }

    private func breakdown(_ row: SmartSplitParticipantBreakdown) -> String {
        var parts = ["items \(Money.format(cents: row.itemsCents))"]
        if row.discountCents != 0 { parts.append("discount −\(Money.format(cents: row.discountCents))") }
        if row.taxCents != 0 { parts.append("tax \(Money.format(cents: row.taxCents))") }
        if row.tipCents != 0 { parts.append("tip \(Money.format(cents: row.tipCents))") }
        if row.feeCents != 0 { parts.append("fees \(Money.format(cents: row.feeCents))") }
        if row.shippingCents != 0 { parts.append("shipping \(Money.format(cents: row.shippingCents))") }
        return parts.joined(separator: " · ")
    }
}

/// Lets a `String` id drive `.sheet(item:)`.
private struct IdentifiedString: Identifiable {
    let id: String
}

// MARK: - Item row

private struct ItemRow: View {
    let item: SmartSplitItem
    let peopleText: String
    let issues: [SmartSplitIssue]
    @Binding var name: String
    @Binding var price: Int?
    let onPickPeople: () -> Void
    let onShowDetails: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                TextField("Item name", text: $name)
                    .font(.body.weight(.medium))
                if item.quantity > 1 {
                    Text("×\(item.quantity)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                CentsField(
                    placeholder: "Price",
                    cents: $price,
                    highlight: item.totalPriceCents == nil,
                    label: "Price for \(item.name.isEmpty ? "item" : item.name)"
                )
                Button(action: onShowDetails) {
                    Image(systemName: "ellipsis.circle")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("More options for \(item.name)")
            }

            Button(action: onPickPeople) {
                if item.assignedParticipantIds.isEmpty {
                    Label("Assign to: Select people", systemImage: "person.crop.circle.badge.plus")
                        .foregroundStyle(.orange)
                } else {
                    Label(peopleText, systemImage: item.assignedParticipantIds.count > 1 ? "person.2" : "person")
                        .foregroundStyle(.secondary)
                }
            }
            .font(.subheadline)
            .buttonStyle(.borderless)

            ForEach(issues.filter { !["missing_price", "missing_assignment"].contains($0.code) }, id: \.self) { issue in
                Text(issue.message)
                    .font(.caption)
                    .foregroundStyle(issue.severity == .error ? Color.red : Color.orange)
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Charges

private struct ChargesSection: View {
    @Bindable var model: SmartSplitReviewModel

    private enum Charge: String, CaseIterable {
        case tip = "Tip", fee = "Fees", shipping = "Shipping", discount = "Discount"
    }

    private func binding(_ charge: Charge) -> Binding<Int?> {
        switch charge {
        case .tip: $model.draft.tipCents
        case .fee: $model.draft.feeCents
        case .shipping: $model.draft.shippingCents
        case .discount: $model.draft.discountCents
        }
    }

    var body: some View {
        let shown = Charge.allCases.filter { binding($0).wrappedValue != nil }
        let hidden = Charge.allCases.filter { binding($0).wrappedValue == nil }

        Section {
            // Listed amounts include items not assigned yet, so these rows always match the item list.
            row("Subtotal") {
                Text(Money.format(cents: model.listedSubtotalCents)).monospacedDigit()
            }
            row("Tax") { CentsField(placeholder: "0.00", cents: $model.draft.taxCents, label: "Tax") }
            ForEach(shown, id: \.self) { charge in
                row(charge.rawValue) {
                    CentsField(placeholder: "0.00", cents: binding(charge), label: charge.rawValue)
                }
                .swipeActions {
                    Button("Remove", role: .destructive) { binding(charge).wrappedValue = nil }
                }
            }
            if !hidden.isEmpty {
                Menu {
                    ForEach(hidden, id: \.self) { charge in
                        Button(charge.rawValue) { binding(charge).wrappedValue = 0 }
                    }
                } label: {
                    Label("Add tip, fee, shipping or discount", systemImage: "plus.circle")
                }
            }
            row("Total") {
                Text(Money.format(cents: model.listedTotalCents))
                    .font(.headline.monospacedDigit())
            }
            if let stated = model.draft.totalCents, stated != model.listedTotalCents {
                VStack(alignment: .leading, spacing: 4) {
                    row("Receipt total") {
                        Text(Money.format(cents: stated))
                            .monospacedDigit()
                            .foregroundStyle(.orange)
                    }
                    Text("Off by \(Money.format(cents: abs(stated - model.listedTotalCents))). Check for a missing or misread item, tax or fee.")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
        }
    }

    private func row<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(title)
            Spacer()
            content()
        }
    }
}

// MARK: - Ambiguity

private struct AmbiguityCard: View {
    let ambiguity: SmartSplitAmbiguity
    let onResolve: (SmartSplitAmbiguityOption?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(ambiguity.message, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .font(.subheadline.weight(.semibold))
            if ambiguity.options.isEmpty {
                Button("Got it") { onResolve(nil) }
                    .buttonStyle(.bordered)
            } else {
                FlowButtons(options: ambiguity.options, onSelect: onResolve)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct FlowButtons: View {
    let options: [SmartSplitAmbiguityOption]
    let onSelect: (SmartSplitAmbiguityOption) -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack { buttons }
            VStack(alignment: .leading) { buttons }
        }
    }

    private var buttons: some View {
        ForEach(options, id: \.self) { option in
            Button(option.label) { onSelect(option) }
                .buttonStyle(.bordered)
        }
    }
}

// MARK: - People picker

private struct PeoplePicker: View {
    let members: [Profile]
    let currentUserId: UUID
    let itemName: String
    @State var selection: Set<String>
    let onDone: (Set<String>) -> Void
    @Environment(\.dismiss) private var dismiss

    init(members: [Profile], currentUserId: UUID, itemName: String, selection: Set<String>, onDone: @escaping (Set<String>) -> Void) {
        self.members = members
        self.currentUserId = currentUserId
        self.itemName = itemName
        _selection = State(initialValue: selection)
        self.onDone = onDone
    }

    private var everyoneSelected: Bool { selection.count == members.count }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        selection = everyoneSelected ? [] : Set(members.map(\.id.participantId))
                    } label: {
                        checkRow("Everyone", checked: everyoneSelected)
                    }
                }
                Section {
                    ForEach(members) { member in
                        let id = member.id.participantId
                        Button {
                            if selection.contains(id) { selection.remove(id) } else { selection.insert(id) }
                        } label: {
                            checkRow(member.id == currentUserId ? "You" : member.displayName, checked: selection.contains(id))
                        }
                    }
                } footer: {
                    Text("Shared items are split equally between the people you pick.")
                }
            }
            .navigationTitle(itemName.isEmpty ? "Who is this for?" : "Who is \(itemName) for?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        onDone(selection)
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func checkRow(_ title: String, checked: Bool) -> some View {
        HStack {
            Image(systemName: checked ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(checked ? Color.accentColor : .secondary)
                .accessibilityHidden(true)
            Text(title)
                .foregroundStyle(.primary)
            Spacer()
        }
        .contentShape(Rectangle())
        .accessibilityAddTraits(checked ? .isSelected : [])
    }
}

// MARK: - Item details

private struct ItemDetailSheet: View {
    @Bindable var model: SmartSplitReviewModel
    let itemId: String
    /// A freshly added item: Cancel removes it again.
    var isNew = false
    @Environment(\.dismiss) private var dismiss

    private var item: SmartSplitItem? { model.draft.items.first { $0.id == itemId } }

    var body: some View {
        NavigationStack {
            Form {
                if let item {
                    Section {
                        TextField("Item name", text: Binding(
                            get: { item.name },
                            set: { newValue in model.updateItem(itemId) { $0.name = newValue } }
                        ))
                        Stepper("Quantity: \(item.quantity)", value: Binding(
                            get: { item.quantity },
                            set: { model.setQuantity(itemId, $0) }
                        ), in: 1...999)
                        HStack {
                            Text("Price (line total)")
                            Spacer()
                            CentsField(placeholder: "Price", cents: Binding(
                                get: { item.totalPriceCents },
                                set: { model.setPrice(itemId, cents: $0) }
                            ), highlight: item.totalPriceCents == nil, label: "Price")
                        }
                        HStack {
                            Text("Item discount")
                            Spacer()
                            CentsField(placeholder: "0.00", cents: Binding(
                                get: { item.discountCents },
                                set: { newValue in model.updateItem(itemId) { $0.discountCents = newValue } }
                            ), label: "Item discount")
                        }
                    }

                    Section("Who is it for?") {
                        ForEach(model.members) { member in
                            let id = member.id.participantId
                            let checked = item.assignedParticipantIds.contains(id)
                            Button {
                                var ids = Set(item.assignedParticipantIds)
                                if checked { ids.remove(id) } else { ids.insert(id) }
                                model.setAssignees(itemId, ids)
                            } label: {
                                HStack {
                                    Image(systemName: checked ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(checked ? Color.accentColor : .secondary)
                                        .accessibilityHidden(true)
                                    Text(member.id == model.currentUserId ? "You" : member.displayName)
                                        .foregroundStyle(.primary)
                                    Spacer()
                                }
                                .contentShape(Rectangle())
                            }
                        }
                        Button("Everyone") {
                            model.setAssignees(itemId, Set(model.participantOrder))
                        }
                    }

                    Section {
                        if !isNew {
                            Button("Delete Item", role: .destructive) {
                                model.deleteItem(itemId)
                                dismiss()
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(item?.name.isEmpty == false ? item!.name : (isNew ? "New Item" : "Item"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if isNew {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            model.deleteItem(itemId)
                            dismiss()
                        }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isNew ? "Add" : "Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Money field

/// Dollar input bound to optional cents. Empty text means "no price yet" (nil).
/// Focusing selects the current amount so typing replaces it; leaving the field normalizes it ("20" → "20.00").
struct CentsField: View {
    let placeholder: String
    @Binding var cents: Int?
    var highlight = false
    /// Spoken label, e.g. "Tax" or "Price for Burger".
    var label: String? = nil

    @State private var text = ""
    @FocusState private var focused: Bool

    private var isInvalid: Bool { !text.isEmpty && Money.cents(from: text, allowZero: true) == nil }

    var body: some View {
        HStack(spacing: 2) {
            Text("$")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            TextField(placeholder, text: $text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .focused($focused)
                // Return on a hardware keyboard leaves the field (decimal pads have no return key).
                .submitLabel(.done)
                .onSubmit { focused = false }
                .accessibilityLabel(label ?? placeholder)
                .accessibilityValue(cents.map { Money.format(cents: $0) } ?? "empty")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .frame(width: 104)
        .background(
            RoundedRectangle(cornerRadius: 7)
                .fill(highlight || isInvalid ? Color.orange.opacity(0.18) : Color(.tertiarySystemFill))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 7)
                .stroke(isInvalid ? Color.red : (highlight ? Color.orange : .clear), lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .onAppear { text = cents.map(Money.editableString(cents:)) ?? "" }
        .onChange(of: cents) { _, newValue in
            // Reflect outside changes (e.g. quantity) without fighting the user's typing.
            if !focused { text = newValue.map(Money.editableString(cents:)) ?? "" }
        }
        .onChange(of: focused) { _, isFocused in
            if isFocused {
                // Select the existing amount so typing replaces it instead of producing "2018.00".
                DispatchQueue.main.async {
                    UIApplication.shared.sendAction(#selector(UIResponder.selectAll(_:)), to: nil, from: nil, for: nil)
                }
            } else {
                text = cents.map(Money.editableString(cents:)) ?? ""
            }
        }
        .onChange(of: text) { _, newValue in
            let trimmed = newValue.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty {
                cents = nil
            } else if let parsed = Money.cents(from: trimmed, allowZero: true) {
                cents = parsed
            }
        }
    }
}

func hideKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
}
