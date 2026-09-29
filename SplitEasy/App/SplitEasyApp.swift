import SwiftUI

@main
struct SplitEasyApp: App {
    @State private var auth = AuthService()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .task { await auth.observeAuthChanges() }
                // OAuth (Google) redirects back to spliteasy://auth-callback.
                .onOpenURL { supabase.auth.handle($0) }
        }
    }
}
