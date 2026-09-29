import Foundation
import Supabase

let supabase = SupabaseClient(
    supabaseURL: Config.supabaseURL,
    supabaseKey: Config.supabaseKey,
    options: SupabaseClientOptions(
        auth: SupabaseClientOptions.AuthOptions(emitLocalSessionAsInitialSession: true)
    )
)

/// Turns Supabase/Postgres errors (including our `raise exception` messages) into user-facing text.
func userMessage(for error: Error) -> String {
    if let error = error as? PostgrestError {
        return error.message
    }
    return error.localizedDescription
}
