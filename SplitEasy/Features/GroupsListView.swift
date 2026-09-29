import SwiftUI

struct GroupsListView: View {
    @Environment(AuthService.self) private var auth
    @State private var groups: [ExpenseGroup] = []
    @State private var myBalances: [UUID: Int] = [:]
    @State private var hasLoaded = false
    @State private var errorMessage: String?
    @State private var sheet: Sheet?
    @State private var path = NavigationPath()

    private enum Sheet: String, Identifiable {
        case create, join, settings
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                ForEach(groups) { group in
                    NavigationLink(value: group) {
                        GroupRow(group: group, balance: myBalances[group.id] ?? 0)
                    }
                }
            }
            .overlay {
                if hasLoaded && groups.isEmpty {
                    ContentUnavailableView {
                        Label("No groups yet", systemImage: "person.3")
                    } description: {
                        Text("Create a group, or join one with an invite code from a friend.")
                    } actions: {
                        Button("Create Group") { sheet = .create }
                            .buttonStyle(.borderedProminent)
                        Button("Join with Code") { sheet = .join }
                    }
                }
            }
            .navigationTitle("Groups")
            .navigationDestination(for: ExpenseGroup.self) { group in
                GroupDetailView(group: group)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { sheet = .settings } label: { Image(systemName: "person.crop.circle") }
                        .accessibilityLabel("Settings")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Create Group", systemImage: "plus") { sheet = .create }
                        Button("Join with Code", systemImage: "number") { sheet = .join }
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add group")
                }
            }
            .refreshable { await load() }
            .task { await load() }
            .onChange(of: path.count) { _, count in
                // Returning from a group: refresh balances that may have changed.
                if count == 0 { Task { await load() } }
            }
            .sheet(item: $sheet) { sheet in
                switch sheet {
                case .create:
                    TextEntrySheet(
                        title: "New Group",
                        placeholder: "Group name, e.g. Tahoe Trip",
                        actionTitle: "Create"
                    ) { name in
                        let group = try await GroupRepository.createGroup(name: name)
                        await load()
                        path.append(group)
                    }
                case .join:
                    TextEntrySheet(
                        title: "Join Group",
                        placeholder: "6-character code",
                        actionTitle: "Join",
                        isCode: true
                    ) { code in
                        let group = try await GroupRepository.joinGroup(code: code)
                        await load()
                        path.append(group)
                    }
                case .settings:
                    SettingsView()
                }
            }
            .alert("Something went wrong", isPresented: $errorMessage.isPresent) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func load() async {
        guard let userId = auth.userId else { return }
        do {
            async let fetchedGroups = GroupRepository.fetchGroups()
            async let fetchedBalances = GroupRepository.fetchMyBalances(userId: userId)
            (groups, myBalances) = try await (fetchedGroups, fetchedBalances)
        } catch is CancellationError {
            return
        } catch {
            errorMessage = userMessage(for: error)
        }
        hasLoaded = true
    }
}

private struct GroupRow: View {
    let group: ExpenseGroup
    let balance: Int

    var body: some View {
        HStack {
            Text(group.name).font(.headline)
            Spacer()
            BalanceLabel(cents: balance, style: .summary)
        }
        .padding(.vertical, 4)
    }
}

/// "you are owed $x" / "you owe $x" / "settled up", colored green/orange/gray.
struct BalanceLabel: View {
    enum Style {
        /// Standalone summary, e.g. on the Groups list: "you owe" / "you are owed".
        case summary
        /// Next to the name "You": "owe" / "get back".
        case you
        /// Next to another member's name: "owes" / "gets back".
        case member
    }

    let cents: Int
    let style: Style

    private var caption: String {
        switch (style, cents > 0) {
        case (.summary, true): "you are owed"
        case (.summary, false): "you owe"
        case (.you, true): "get back"
        case (.you, false): "owe"
        case (.member, true): "gets back"
        case (.member, false): "owes"
        }
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            if cents == 0 {
                // Color.secondary (gray), not `.secondary`, which would be a dimmed tint of the outer orange.
                Text("settled up")
                    .font(.subheadline)
                    .foregroundStyle(Color.secondary)
            } else {
                Text(caption).font(.caption)
                Text(Money.format(cents: abs(cents))).font(.subheadline.bold())
            }
        }
        .foregroundStyle(cents > 0 ? Color.green : Color.orange)
        .frame(minHeight: 36)
    }
}

/// Small sheet with one text field, used for "create group" and "join with code".
private struct TextEntrySheet: View {
    let title: String
    let placeholder: String
    let actionTitle: String
    var isCode = false
    let action: (String) async throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var isWorking = false
    @State private var errorMessage: String?
    @FocusState private var focused: Bool

    private var trimmed: String { text.trimmingCharacters(in: .whitespaces) }
    private var isValid: Bool { isCode ? trimmed.count == 6 : !trimmed.isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                TextField(placeholder, text: $text)
                    .focused($focused)
                    .textInputAutocapitalization(isCode ? .characters : .words)
                    .autocorrectionDisabled(isCode)
                    .font(isCode ? .title2.monospaced() : .body)
                    .onChange(of: text) { _, newValue in
                        if isCode { text = String(newValue.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(6)) }
                    }
                    .onSubmit(submit)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if isWorking { ProgressView() } else {
                        Button(actionTitle, action: submit).disabled(!isValid)
                    }
                }
            }
            .alert(isCode ? "Couldn't join group" : "Couldn't create group", isPresented: $errorMessage.isPresent) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.height(200)])
    }

    private func submit() {
        guard isValid, !isWorking else { return }
        isWorking = true
        Task {
            defer { isWorking = false }
            do {
                try await action(trimmed)
                dismiss()
            } catch {
                errorMessage = userMessage(for: error)
            }
        }
    }
}
