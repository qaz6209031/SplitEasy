import AuthenticationServices
import SwiftUI

struct SignInView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.colorScheme) private var colorScheme
    @State private var errorMessage: String?
    @State private var errorTitle = "Sign in failed"

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "person.3.sequence.fill")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
            Text("SplitEasy")
                .font(.largeTitle.bold())
            Text("Share expenses with friends.\nSettle up with the fewest payments.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Spacer()
            VStack(spacing: 12) {
                SignInWithAppleButton(.signIn) { request in
                    auth.prepare(request)
                } onCompletion: { result in
                    Task {
                        do { try await auth.handle(result) } catch { show(error, title: "Sign in failed") }
                    }
                }
                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                .frame(height: 50)

                Button {
                    Task {
                        do {
                            try await auth.signInWithGoogle()
                        } catch is AuthService.GoogleNotConfigured {
                            show(AuthService.GoogleNotConfigured(), title: "Google sign-in unavailable")
                        } catch {
                            show(error, title: "Sign in failed")
                        }
                    }
                } label: {
                    // Styled to match the Apple button beside it: same height, corners and fill.
                    HStack(spacing: 6) {
                        Text("G")
                            .font(.system(size: 21, weight: .bold))
                            .foregroundStyle(Color(red: 0.26, green: 0.52, blue: 0.96))
                            .accessibilityHidden(true)
                        Text("Sign in with Google")
                            .font(.system(size: 19, weight: .medium))
                    }
                    .foregroundStyle(colorScheme == .dark ? Color.black : Color.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(colorScheme == .dark ? Color.white : Color.black)
                    )
                    .contentShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
            }

            #if DEBUG
            devSignIn
            #endif
        }
        .padding(24)
        .alert(errorTitle, isPresented: $errorMessage.isPresent) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func show(_ error: Error, title: String) {
        errorTitle = title
        errorMessage = userMessage(for: error)
    }

    #if DEBUG
    /// Test accounts so you can try multi-user flows without Apple IDs. Not compiled into Release.
    private var devSignIn: some View {
        VStack(spacing: 8) {
            Text("Developer sign-in").font(.caption).foregroundStyle(.secondary)
            HStack {
                ForEach(AuthService.devUsers, id: \.self) { name in
                    Button(name) {
                        Task {
                            do { try await auth.devSignIn(as: name) } catch { show(error, title: "Sign in failed") }
                        }
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }
    #endif
}

#Preview {
    SignInView().environment(AuthService())
}
