import AuthenticationServices
import CryptoKit
import Foundation
import Observation
import Supabase

@Observable
@MainActor
final class AuthService {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(userId: UUID)
    }

    private(set) var state: State = .loading
    private(set) var profile: Profile?

    var userId: UUID? {
        if case .signedIn(let id) = state { return id }
        return nil
    }

    /// Raw nonce for the in-flight Apple request; Apple receives its SHA-256 hash.
    private var currentNonce: String?

    func observeAuthChanges() async {
        for await (event, session) in supabase.auth.authStateChanges {
            guard [.initialSession, .signedIn, .signedOut, .userDeleted].contains(event) else { continue }
            // A stored session may be expired on launch; refresh it before trusting it.
            if let session, session.isExpired,
               (try? await supabase.auth.refreshSession(refreshToken: session.refreshToken)) == nil {
                profile = nil
                state = .signedOut
            } else if let session {
                state = .signedIn(userId: session.user.id)
                await loadProfile()
            } else {
                profile = nil
                state = .signedOut
            }
        }
    }

    // MARK: Sign in with Apple

    func prepare(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonce()
        currentNonce = nonce
        request.requestedScopes = [.fullName]
        request.nonce = Self.sha256(nonce)
    }

    func handle(_ result: Result<ASAuthorization, Error>) async throws {
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code == .canceled { return }
            throw error
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let idToken = String(data: tokenData, encoding: .utf8),
                  let nonce = currentNonce
            else { throw URLError(.userAuthenticationRequired) }

            try await supabase.auth.signInWithIdToken(
                credentials: OpenIDConnectCredentials(provider: .apple, idToken: idToken, nonce: nonce)
            )

            // Apple only shares the name on the very first sign-in, so save it right away.
            let name = credential.fullName.map {
                PersonNameComponentsFormatter.localizedString(from: $0, style: .default)
            } ?? ""
            if !name.isEmpty {
                await loadProfile()
                if profile?.displayName.isEmpty ?? true {
                    try await updateDisplayName(name)
                }
            }
        }
    }

    // MARK: Google

    struct GoogleNotConfigured: LocalizedError {
        var errorDescription: String? { "Google sign-in isn't configured yet. Use Sign in with Apple for now." }
    }

    /// Supabase OAuth in the system browser sheet (ASWebAuthenticationSession); no Google SDK needed.
    /// The session arrives through `authStateChanges`, and Google's `full_name` fills the profile name.
    func signInWithGoogle() async throws {
        guard try await isProviderEnabled("google") else { throw GoogleNotConfigured() }
        do {
            try await supabase.auth.signInWithOAuth(
                provider: .google,
                redirectTo: URL(string: "spliteasy://auth-callback")
            )
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            return
        }
    }

    /// Reads the project's public auth settings so a disabled provider fails with a clear message
    /// instead of an error page inside the browser sheet.
    private func isProviderEnabled(_ provider: String) async throws -> Bool {
        var request = URLRequest(url: Config.supabaseURL.appendingPathComponent("auth/v1/settings"))
        request.setValue(Config.supabaseKey, forHTTPHeaderField: "apikey")
        let (data, _) = try await URLSession.shared.data(for: request)
        struct Settings: Decodable { let external: [String: Bool] }
        return (try? JSONDecoder().decode(Settings.self, from: data))?.external[provider] ?? false
    }

    // MARK: Developer sign-in (Debug builds only)

    #if DEBUG
    static let devUsers = ["Alice", "Bob", "Carol"]

    /// Signs in as a fixed test user via email/password, creating the account on first use.
    /// The name is passed as `full_name` so the profile trigger fills in the display name.
    func devSignIn(as name: String) async throws {
        let email = "dev-\(name.lowercased())@spliteasy.dev"
        let password = "spliteasy-dev-\(name.lowercased())"
        do {
            try await supabase.auth.signIn(email: email, password: password)
        } catch {
            try await supabase.auth.signUp(email: email, password: password, data: ["full_name": .string(name)])
        }
    }
    #endif

    // MARK: Profile

    func loadProfile() async {
        guard let userId else { return }
        profile = try? await supabase.from("profiles")
            .select()
            .eq("id", value: userId)
            .single()
            .execute()
            .value
    }

    func updateDisplayName(_ name: String) async throws {
        guard let userId else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        try await supabase.from("profiles")
            .update(["display_name": trimmed])
            .eq("id", value: userId)
            .execute()
        await loadProfile()
    }

    func signOut() async {
        try? await supabase.auth.signOut()
    }

    func deleteAccount() async throws {
        try await supabase.rpc("delete_account").execute()
        try? await supabase.auth.signOut(scope: .local)
        profile = nil
        state = .signedOut
    }

    // MARK: Nonce helpers

    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        precondition(SecRandomCopyBytes(kSecRandomDefault, length, &bytes) == errSecSuccess)
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
