import SwiftUI

struct SettingsView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var confirmDelete = false
    @State private var errorMessage: String?
    @State private var isDeleting = false
    @State private var showAIConsent = false
    @AppStorage(SmartSplitConsent.storageKey) private var aiConsent = false

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
                    Button {
                        showAIConsent = true
                    } label: {
                        HStack {
                            Label("AI data sharing", systemImage: "sparkles")
                                .foregroundStyle(.primary)
                            Spacer()
                            Text(aiConsent ? "Allowed" : "Off")
                                .foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    Text("Smart Split")
                } footer: {
                    Text("Smart Split sends your description and any attached image to an AI service to read the expense.")
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
                    if isDeleting {
                        HStack {
                            ProgressView()
                            Text("Deleting account…").foregroundStyle(.secondary)
                        }
                    } else {
                        Button("Delete Account", role: .destructive) { confirmDelete = true }
                    }
                } footer: {
                    Text(auth.usesAppleSignIn
                        ? "You'll confirm with Apple so SplitEasy's access to your Apple ID is also revoked. Expenses you shared stay in your groups under \"Deleted user\" so everyone's balances still add up."
                        : "Your sign-in is removed. Expenses you shared stay in your groups under \"Deleted user\" so everyone's balances still add up.")
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
                        isDeleting = true
                        defer { isDeleting = false }
                        do {
                            try await auth.deleteAccount()
                            dismiss()
                        } catch is AuthService.DeletionCancelled {
                            // User backed out at the Apple prompt; nothing was deleted.
                        } catch {
                            errorMessage = userMessage(for: error)
                        }
                    }
                }
            } message: {
                Text("This can't be undone.")
            }
            .sheet(isPresented: $showAIConsent) {
                SmartSplitConsentSheet(
                    alreadyGranted: aiConsent,
                    onAllow: { aiConsent = true },
                    onDecline: { aiConsent = false }
                )
            }
            .interactiveDismissDisabled(isDeleting)
            .alert("Something went wrong", isPresented: $errorMessage.isPresent) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }
}
