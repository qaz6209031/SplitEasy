import Foundation

/// The app is US-dollar only. Amounts are integer cents everywhere.
enum Money {
    private static let usLocale = Locale(identifier: "en_US")

    /// Plain editable form without symbol or grouping, e.g. 1234 -> "12.34".
    static func editableString(cents: Int) -> String {
        String(format: "%d.%02d", cents / 100, abs(cents % 100))
    }

    static func format(cents: Int) -> String {
        (Decimal(cents) / 100).formatted(.currency(code: "USD").locale(usLocale))
    }

    /// Parses user input like "12", "12.5", "$1,234.56" into cents.
    /// Returns nil for invalid input, negative amounts (and zero unless `allowZero`), or more than 2 decimals.
    static func cents(from text: String, allowZero: Bool = false) -> Int? {
        let cleaned = text
            .trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: ",", with: text.contains(".") ? "" : ".")
        guard !cleaned.isEmpty,
              cleaned.allSatisfy({ $0.isNumber || $0 == "." }),
              cleaned.filter({ $0 == "." }).count <= 1,
              (cleaned.split(separator: ".", omittingEmptySubsequences: false).dropFirst().first?.count ?? 0) <= 2,
              let value = Decimal(string: cleaned, locale: usLocale)
        else { return nil }

        var cents = value * 100
        var rounded = Decimal()
        NSDecimalRound(&rounded, &cents, 0, .plain)
        let result = NSDecimalNumber(decimal: rounded).intValue
        return result > 0 || (allowZero && result == 0) ? result : nil
    }
}
