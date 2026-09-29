import Foundation

/// Values injected from `Config/Secrets.xcconfig` through Info.plist.
enum Config {
    static let supabaseURL: URL = {
        let host = Bundle.main.object(forInfoDictionaryKey: "SupabaseHost") as? String ?? ""
        guard !host.isEmpty, let url = URL(string: "https://\(host)") else {
            fatalError("Missing SUPABASE_HOST. Copy Config/Secrets.example.xcconfig to Config/Secrets.xcconfig.")
        }
        return url
    }()

    static let supabaseKey: String = {
        let key = Bundle.main.object(forInfoDictionaryKey: "SupabasePublishableKey") as? String ?? ""
        guard !key.isEmpty else {
            fatalError("Missing SUPABASE_PUBLISHABLE_KEY in Config/Secrets.xcconfig.")
        }
        return key
    }()
}
