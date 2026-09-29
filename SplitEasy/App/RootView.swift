import SwiftUI

/// Routes between sign-in, first-time name setup, and the main app.
struct RootView: View {
    @Environment(AuthService.self) private var auth

    var body: some View {
        switch auth.state {
        case .loading:
            ProgressView()
        case .signedOut:
            SignInView()
        case .signedIn:
            if let profile = auth.profile {
                if profile.displayName.isEmpty {
                    NameSetupView()
                } else {
                    GroupsListView()
                }
            } else {
                ProgressView()
                    .task { await auth.loadProfile() }
            }
        }
    }
}
