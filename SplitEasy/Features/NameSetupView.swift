import SwiftUI

/// Shown once when we don't have a display name (Apple only shares it on first sign-in).
struct NameSetupView: View {
    @Environment(AuthService.self) private var auth
    @State private var name = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Your name", text: $name)
                        .textContentType(.name)
                        .submitLabel(.done)
                        .onSubmit(save)
                } footer: {
                    Text("Friends in your groups will see this name.")
                }
            }
            .navigationTitle("What's your name?")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Continue", action: save)
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Sign Out") { Task { await auth.signOut() } }
                }
            }
            .alert("Couldn't save", isPresented: $errorMessage.isPresent) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    private func save() {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isSaving = true
        Task {
            defer { isSaving = false }
            do { try await auth.updateDisplayName(name) } catch { errorMessage = userMessage(for: error) }
        }
    }
}
