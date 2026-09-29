import SwiftUI

struct SettingsView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var confirmDelete = false
    @State private var errorMessage: String?

    private var nameChanged: Bool {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        return !trimmed.isEmpty && trimmed != auth.profile?.displayName
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Your name") {
                    TextField("Name", text: $name)
                        .textContentType(.name)
                    if nameChanged {
                        Button("Save Name") {
                            Task {
                                do { try await auth.updateDisplayName(name) } catch { errorMessage = userMessage(for: error) }
                            }
                        }
                    }
                }
                Section {
                    Button("Sign Out") {
                        Task {
                            dismiss()
                            await auth.signOut()
                        }
                    }
                }
                Section {
                    Button("Delete Account", role: .destructive) { confirmDelete = true }
                } footer: {
                    Text("Your sign-in is removed. Expenses you shared stay in your groups under \"Deleted user\" so everyone's balances still add up.")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .onAppear { name = auth.profile?.displayName ?? "" }
            .confirmationDialog("Delete your account?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete Account", role: .destructive) {
                    Task {
                        do {
                            try await auth.deleteAccount()
                            dismiss()
                        } catch {
                            errorMessage = userMessage(for: error)
                        }
                    }
                }
            } message: {
                Text("This can't be undone.")
            }
            .alert("Something went wrong", isPresented: $errorMessage.isPresent) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }
}
