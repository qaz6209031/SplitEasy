import SwiftUI

extension Binding where Value == String? {
    /// Drives `.alert(isPresented:)` from an optional error message; dismissing clears it.
    var isPresent: Binding<Bool> {
        Binding<Bool>(
            get: { wrappedValue != nil },
            set: { if !$0 { wrappedValue = nil } }
        )
    }
}
